#!/usr/bin/env node
/**
 * main-scrapping.cjs (CommonJS)
 *
 * - CommonJS version that mirrors the ESM implementation in main-scrapping.js.
 * - This file exists so consumers using `require('h56-github-scrapper')` can work
 *   without ESM interop issues.
 *
 * Note:
 * - Keep parity with main-scrapping.js logic. If you modify behavior in one file,
 *   keep the other in sync.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

// Runtime packages required for operation
const RUNTIME_PKGS = ["axios", "cheerio", "ora", "yargs"];

/**
 * Load runtime modules via require and return a map.
 * If missing, behave as:
 *  - CLI: print helpful message and exit(1)
 *  - Library: throw Error
 */
function loadRuntimesSync() {
  const results = {};
  const missing = [];

  for (const name of RUNTIME_PKGS) {
    try {
      // try to require; allow resolution failure to propagate to missing
      const mod = require(name);
      results[name] = mod && mod.default ? mod.default : mod;
    } catch (err) {
      missing.push(name);
    }
  }

  if (missing.length) {
    const cmd = `npm install ${missing.join(" ")}`;
    const msg =
      `Missing runtime dependencies: ${missing.join(", ")}.\n` +
      `Please install them before running this script:\n\n  ${cmd}\n\n` +
      `If you are in CI and want deterministic installs, declare these dependencies explicitly in your pipeline or package.json.`;

    // Rough CLI detection: if this file is the main module
    const isCli = require.main === module;

    if (isCli) {
      console.error(msg);
      process.exit(1);
    } else {
      const e = new Error(msg);
      e.code = "MISSING_RUNTIME_DEPENDENCIES";
      throw e;
    }
  }

  return results;
}

const runtimes = loadRuntimesSync();
const axios = runtimes["axios"];
const cheerio = runtimes["cheerio"];
const ora = runtimes["ora"];
const yargs = runtimes["yargs"];

// -------------------------
// Utilities & Config
// -------------------------
const DEFAULT_CONFIG = {
  BASE_URL: "https://github.com",
  REQUEST_TIMEOUT: 15000,
  MAX_RETRY: 3,
  SCRAPE_DELAY: 400, // ms between page fetches
  USER_AGENT:
    "Mozilla/5.0 (compatible; h56-github-scrapper/1.0; +https://github.com/)",
  PER_PAGE: 30,
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseGithubNumber(text = "") {
  if (!text) return 0;
  text = String(text).toLowerCase().replace(/\s+/g, "").replace(/,/g, "");
  const m = text.match(/^([\d,.]*\d(?:\.\d+)?)([km])?$/);
  if (!m) {
    const n = Number(text.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? Math.round(n) : 0;
  }
  const val = parseFloat(m[1]);
  if (m[2] === "k") return Math.round(val * 1000);
  if (m[2] === "m") return Math.round(val * 1000000);
  return Math.round(val);
}

function formatNumber(num) {
  try {
    return new Intl.NumberFormat("en-US").format(num);
  } catch (e) {
    return String(num);
  }
}

function validateUsername(username) {
  return /^[a-zA-Z0-9-]{1,39}$/.test(username);
}

// -------------------------
// Translator loader (optional, lazy) - CommonJS shape
// -------------------------
let _translatorModule = null;
let _translatorLoadAttempted = false;

function loadTranslatorModuleSync() {
  if (_translatorModule) return _translatorModule;
  if (_translatorLoadAttempted) return null;
  _translatorLoadAttempted = true;

  // prefer package-local wrapper first
  try {
    const local = path.join(__dirname, "translate-engine", "translate.js");
    try {
      const mod = require(local);
      if (mod && typeof mod.translate === "function") {
        _translatorModule = mod;
        return _translatorModule;
      }
    } catch (_) {
      // local wrapper not present
    }

    // fallback to optional package
    try {
      const pkg = require("h56-translator");
      const impl = pkg && pkg.default ? pkg.default : pkg;
      if (impl && (typeof impl.translate === "function" || typeof impl === "function")) {
        const translateFn = typeof impl.translate === "function" ? impl.translate : impl;
        _translatorModule = { translate: translateFn };
        return _translatorModule;
      }
    } catch (_) {
      // translator not installed
    }

    return null;
  } catch (err) {
    return null;
  }
}

// -------------------------
// Scraper class (CommonJS parity)
// -------------------------
class GithubScraper {
  constructor(opts = {}) {
    this.config = Object.assign({}, DEFAULT_CONFIG, opts || {});
    this.axios = axios.create({
      timeout: this.config.REQUEST_TIMEOUT,
      headers: { "User-Agent": this.config.USER_AGENT, Accept: "text/html" },
    });
  }

  async requestWithRetry(url, attempt = 1) {
    try {
      const res = await this.axios.get(url);
      return res.data;
    } catch (err) {
      if (attempt >= this.config.MAX_RETRY) {
        const e = new Error(`Failed to fetch ${url}: ${err.message}`);
        e.cause = err;
        throw e;
      }
      await sleep(1000 * attempt);
      return this.requestWithRetry(url, attempt + 1);
    }
  }

  async fetchPage(url) {
    const html = await this.requestWithRetry(url);
    return cheerio.load(html);
  }

  async scrapeProfile(username) {
    const $ = await this.fetchPage(this.config.BASE_URL + "/" + username);

    if ($("title").text().includes("Not Found")) {
      const e = new Error("Username not found");
      e.code = "NOT_FOUND";
      throw e;
    }

    const name =
      $('h1[class*="vcard-names"] .p-name').text().trim() ||
      $(".p-name.vcard-fullname").text().trim() ||
      "";

    const bio =
      $('div[class*="p-note"]').text().trim() ||
      $('div[itemprop="description"]').text().trim() ||
      "";

    const followersText = $(
      'a[href$="?tab=followers"], a[href$="?tab=followers"] .text-bold'
    )
      .first()
      .text()
      .trim();
    const followingText = $(
      'a[href$="?tab=following"], a[href$="?tab=following"] .text-bold'
    )
      .first()
      .text()
      .trim();
    const reposText = $(
      'a[href$="?tab=repositories"], a[href$="?tab=repositories"] .Counter'
    )
      .first()
      .text()
      .trim();

    const followers = parseGithubNumber(followersText);
    const following = parseGithubNumber(followingText);
    const public_repos = parseGithubNumber(reposText);

    return {
      username,
      name,
      bio,
      followers,
      following,
      public_repos,
      profile_url: this.config.BASE_URL + "/" + username,
    };
  }

  async scrapeRepos(username) {
    const repos = [];
    let page = 1;
    while (true) {
      const url = this.config.BASE_URL + "/" + username + "?page=" + page + "&tab=repositories";
      const $ = await this.fetchPage(url);
      const repoItems =
        $("li[itemprop='owns']").length > 0
          ? $("li[itemprop='owns']")
          : $("#user-repositories-list li");

      if (!repoItems.length) break;

      repoItems.each((_, el) => {
        const el$ = $(el);
        const repoName =
          el$.find("a[itemprop='name codeRepository']").text().trim() ||
          el$.find("h3 a").text().trim();

        const starText =
          el$.find("a[href$='/stargazers']").text().trim() ||
          el$.find("svg[aria-label='star'] + span").text().trim();
        const forkText =
          el$.find("a[href$='/network/members']").text().trim() ||
          el$.find("svg[aria-label='fork'] + span").text().trim();

        const language =
          el$.find("[itemprop='programmingLanguage']").text().trim() ||
          el$.find(".repo-language-color + span").text().trim() ||
          "Unknown";

        const description =
          el$.find("p[itemprop='description']").text().trim() ||
          el$.find("p.col-9").text().trim() ||
          "";

        const updated = el$.find("relative-time").attr("datetime") || "";

        repos.push({
          name: repoName,
          description,
          stars: parseGithubNumber(starText),
          forks: parseGithubNumber(forkText),
          language: language || "Unknown",
          updated_at: updated,
        });
      });

      page++;
      await sleep(this.config.SCRAPE_DELAY);
    }

    return repos;
  }

  calculateStats(repos) {
    const languageMap = {};
    let totalStars = 0;
    let totalForks = 0;

    repos.forEach((r) => {
      totalStars += r.stars || 0;
      totalForks += r.forks || 0;
      const lang = r.language || "Unknown";
      languageMap[lang] = (languageMap[lang] || 0) + 1;
    });

    const top_languages = Object.entries(languageMap)
      .sort((a, b) => b[1] - a[1])
      .map(([language, count]) => ({ language, repos: count }));

    return {
      total_repositories: repos.length,
      total_stars: totalStars,
      total_forks: totalForks,
      top_languages,
    };
  }

  async applyTranslations(result, translateOptions = {}) {
    if (!translateOptions || !translateOptions.lang) return result;
    const opts = Object.assign(
      {
        fields: ["bio", "repo_descriptions"],
        perRepoDelay: 120,
        failOnMissing: false,
      },
      translateOptions
    );

    const fields = new Set();
    for (const f of opts.fields) {
      if (f === "all_repos") {
        fields.add("repo_descriptions");
        fields.add("repo_names");
      } else {
        fields.add(f);
      }
    }

    const mod = loadTranslatorModuleSync();
    if (!mod || typeof mod.translate !== "function") {
      const msg =
        "Optional translator is not available. Install 'h56-translator' (and ensure translate-engine/translate.js is present) to enable translations.";
      if (opts.failOnMissing) {
        const e = new Error(msg);
        e.code = "TRANSLATOR_MISSING";
        throw e;
      } else {
        result._translation_note = {
          skipped: true,
          reason: msg,
        };
        return result;
      }
    }
    const tfn = mod.translate;

    try {
      if (fields.has("bio") && result.profile && result.profile.bio) {
        try {
          const t = await tfn(result.profile.bio, opts.lang, { timeoutMs: 5000 });
          if (t && typeof t.translatedText === "string") {
            result.profile.bio_translated = t.translatedText;
            result.profile.bio_source_lang = t.sourceLang || null;
            result.profile.bio_translation_meta = { serviceStatus: t.serviceStatus || "ok" };
          }
        } catch (e) {
          result.profile.bio_translation_error = e && e.message ? e.message : String(e);
        }
      }
    } catch (e) {
      result._translation_profile_error = e && e.message ? e.message : String(e);
    }

    if (Array.isArray(result.repos) && result.repos.length > 0) {
      for (const repo of result.repos) {
        try {
          if (fields.has("repo_descriptions") && repo.description) {
            try {
              const t = await tfn(repo.description, opts.lang, { timeoutMs: 5000 });
              if (t && typeof t.translatedText === "string") {
                repo.description_translated = t.translatedText;
                repo.description_source_lang = t.sourceLang || null;
                repo.description_translation_meta = { serviceStatus: t.serviceStatus || "ok" };
              }
            } catch (e) {
              repo.description_translation_error = e && e.message ? e.message : String(e);
            }
          }
          if (fields.has("repo_names") && repo.name) {
            try {
              const t2 = await tfn(repo.name, opts.lang, { timeoutMs: 3000 });
              if (t2 && typeof t2.translatedText === "string") {
                repo.name_translated = t2.translatedText;
                repo.name_source_lang = t2.sourceLang || null;
                repo.name_translation_meta = { serviceStatus: t2.serviceStatus || "ok" };
              }
            } catch (e) {
              repo.name_translation_error = e && e.message ? e.message : String(e);
            }
          }
        } catch (e) {
          repo.translation_internal_error = e && e.message ? e.message : String(e);
        }
        await sleep(opts.perRepoDelay);
      }
    }

    return result;
  }

  async scrapeUser(username, opts = {}) {
    if (!validateUsername(username)) {
      const e = new Error("Invalid GitHub username format");
      e.code = "INVALID_USERNAME";
      throw e;
    }

    const spinner = (opts.spinner !== false) ? ora({ text: `Scraping ${username}...`, spinner: "dots" }).start() : null;

    try {
      const profile = await this.scrapeProfile(username);
      if (spinner) spinner.text = "Fetching repositories...";
      const repos = await this.scrapeRepos(username);
      if (spinner) spinner.succeed("Scraping completed");
      const stats = this.calculateStats(repos);

      let result = { profile, repos, stats };

      if (opts.translate && opts.translate.lang) {
        if (spinner) spinner.text = "Applying translations...";
        try {
          result = await this.applyTranslations(result, opts.translate);
        } catch (e) {
          if (opts.translate && opts.translate.failOnMissing) {
            if (spinner) spinner.fail("Failed");
            throw e;
          } else {
            result._translation_error = e && e.message ? e.message : String(e);
          }
        }
      }

      return result;
    } catch (err) {
      if (spinner) spinner.fail("Failed");
      throw err;
    }
  }

  static printResult(profile, stats, repos = []) {
    console.log("\n========== GITHUB ACCOUNT ==========\n");
    console.log("Username  :", profile.username);
    console.log("Name      :", profile.name || "-");
    console.log("Bio       :", profile.bio || "-");
    if (profile.bio_translated) console.log("Bio (translated):", profile.bio_translated);
    console.log("Followers :", formatNumber(profile.followers));
    console.log("Following :", formatNumber(profile.following));
    console.log("Repos     :", formatNumber(profile.public_repos));
    console.log("Profile   :", profile.profile_url);

    console.log("\n------- Repository Statistics -------\n");
    console.log("Total Repository :", formatNumber(stats.total_repositories));
    console.log("Total Stars      :", formatNumber(stats.total_stars));
    console.log("Total Forks      :", formatNumber(stats.total_forks));

    console.log("\nTop Languages:");
    stats.top_languages.forEach((l) => console.log("• " + l.language + " (" + l.repos + ")"));

    if (repos && repos.length) {
      console.log("\nSample repositories:");
      repos.slice(0, 10).forEach((r) =>
        console.log(
          "- " +
            r.name +
            " (" +
            r.language +
            ") ★" +
            formatNumber(r.stars) +
            " Forks:" +
            formatNumber(r.forks) +
            (r.description_translated ? "\n    → " + r.description_translated : "")
        )
      );
    }

    console.log("\n====================================\n");
  }
}

// -------------------------
// Exports (CommonJS)
// -------------------------
const defaultScraper = new GithubScraper();

async function h56translate(text, targetLang, options) {
  const mod = loadTranslatorModuleSync();
  if (!mod || typeof mod.translate !== "function") {
    throw new Error(
      "Optional translator is not available. Install it with `npm install h56-translator` or ensure translate-engine/translate.js exists and is usable."
    );
  }
  return await mod.translate(text, targetLang, options);
}

module.exports = {
  GithubScraper,
  defaultScraper,
  h56translate,
  scrapeProfile: (username) => defaultScraper.scrapeProfile(username),
  scrapeRepos: (username) => defaultScraper.scrapeRepos(username),
  scrapeUser: (username, opts) => defaultScraper.scrapeUser(username, opts),
  calculateStats: (repos) => defaultScraper.calculateStats(repos),
  printResult: GithubScraper.printResult,
};

// -------------------------
// CLI behavior when run directly
// -------------------------
if (require.main === module) {
  (async () => {
    const argv = yargs(process.argv.slice(2))
      .usage("Usage: $0 <username> [options]")
      .option("json", {
        alias: "j",
        type: "boolean",
        description: "Output raw JSON",
      })
      .option("output", {
        alias: "o",
        type: "string",
        description: "Write JSON output to file",
      })
      .option("no-spinner", {
        type: "boolean",
        description: "Disable spinner output",
      })
      .option("lang", {
        alias: "l",
        type: "string",
        description: "Optional: translate selected text fields to this language (e.g. en, id)",
      })
      .option("translate-fields", {
        type: "string",
        description:
          "Comma-separated fields to translate (bio,repo_descriptions,repo_names,all_repos). Default: bio,repo_descriptions",
      })
      .demandCommand(1, "Github username is required")
      .help().argv;

    const username = argv._[0];

    if (!validateUsername(username)) {
      console.error("Invalid GitHub username format.");
      process.exit(1);
    }

    const translateOpt = argv.lang
      ? {
          lang: argv.lang,
          fields: argv["translate-fields"]
            ? argv["translate-fields"].split(",").map((s) => s.trim())
            : undefined,
          perRepoDelay: 120,
          failOnMissing: false,
        }
      : undefined;

    try {
      const result = await defaultScraper.scrapeUser(username, {
        spinner: !argv["no-spinner"],
        translate: translateOpt,
      });

      if (argv.json) {
        const out = JSON.stringify(result, null, 2);
        if (argv.output) {
          fs.writeFileSync(path.resolve(argv.output), out + os.EOL, "utf8");
          console.log("Written JSON to", argv.output);
        } else {
          console.log(out);
        }
      } else {
        GithubScraper.printResult(result.profile, result.stats, result.repos);
        if (argv.output) {
          fs.writeFileSync(path.resolve(argv.output), JSON.stringify(result, null, 2) + os.EOL, "utf8");
          console.log("Written JSON to", argv.output);
        }
      }

      process.exit(0);
    } catch (err) {
      console.error("Error:", err.message || err);
      if (err.cause && err.cause.message) {
        console.error("Cause:", err.cause.message);
      }
      process.exit(1);
    }
  })();
}