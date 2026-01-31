# h56-github-scrapper

[![npm version](https://img.shields.io/npm/v/h56-github-scrapper.svg)](https://www.npmjs.com/package/h56-github-scrapper)
[![Downloads/month](https://img.shields.io/npm/dm/h56-github-scrapper.svg)](https://www.npmjs.com/package/h56-github-scrapper)
[![Node](https://img.shields.io/badge/node-%3E%3D16-brightgreen.svg?logo=node.js)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg?logo=github)](./LICENSE)
[![TypeScript friendly](https://img.shields.io/badge/types-TypeScript-blue.svg?logo=typescript)](https://www.typescriptlang.org/)
[![Translator: optional](https://img.shields.io/badge/translator-h56--translator-lightgrey.svg?logo=googletranslate)](https://www.npmjs.com/package/h56-translator)

Ringkasan: h56-github-scrapper adalah paket Node.js ringan untuk mengambil (scrape) informasi profil publik dan repositori pengguna GitHub. Paket ini berfungsi sebagai CLI dan juga dapat diimpor sebagai library programatik. Versi ini menambahkan integrasi opsional dengan layanan terjemahan (`h56-translator`) sehingga Anda dapat memilih teks mana yang ingin diterjemahkan pada output (bio, nama repo, deskripsi repo, dsb).

> Peringatan: paket melakukan scraping HTML publik GitHub. Struktur HTML dapat berubah sewaktu-waktu — untuk produksi/skala besar gunakan GitHub REST API (dengan autentikasi). Selalu patuhi Terms of Service GitHub dan etika scraping.

---

## Daftar isi

- [Fitur utama](#fitur-utama)  
- [Badge & status](#badge--status)  
- [Persyaratan & instalasi](#persyaratan--instalasi)  
- [Quick start — CLI](#quick-start--cli)  
- [Opsi terjemahan (CLI & programatik)](#opsi-terjemahan-cli--programatik)  
- [API Reference (singkat) — TypeScript interfaces](#api-reference-singkat---typescript-interfaces)  
- [Contoh penggunaan (CommonJS / ESM / TS)](#contoh-penggunaan-commonjs--esm--ts)  
- [Behavior translator opsional & postinstall](#behavior-translator-opsional--postinstall)  
- [Best practices & etika scraping](#best-practices--etika-scraping)  
- [Troubleshooting](#troubleshooting)  
- [Contributing & changelog singkat](#contributing--changelog-singkat)  
- [License](#license)

---

## Fitur utama

- Ambil data profil publik: username, nama, bio, followers, following, jumlah repo publik, profile_url.
- Ambil daftar repositori publik: name, description, language, stars, forks, updated_at.
- Hitung statistik agregat: total_repositories, total_stars, total_forks, top_languages.
- CLI interaktif + opsi JSON output.
- API programatik: `scrapeUser`, `scrapeProfile`, `scrapeRepos`, `calculateStats`, `GithubScraper` class.
- Integrasi terjemahan opsional via `h56-translator` (wrapper tersedia: `translate-engine/translate.(ts|js)`).
- Retry/backoff, polite delay antar-request, spinner (ora) untuk UX.

---

## Badge & status

- npm package: lihat badge versi & download di bagian atas.
- Node: target minimum Node.js >= 16.
- License: MIT.
- Translator: opsi integrasi ditandai sebagai optional; install manual `npm install h56-translator` untuk mengaktifkan fitur terjemahan.

---

## Persyaratan & instalasi

- Node.js >= 16.x direkomendasikan.
- Instal dari npm:

```bash
npm install h56-github-scrapper
# atau
yarn add h56-github-scrapper
```

Jika Anda ingin menggunakan fitur terjemahan, pasang package terjemahan opsional:

```bash
npm install h56-translator
```

Catatan: paket menyediakan skrip `postinstall` yang berusaha memasang `h56-translator` secara otomatis kecuali di environment CI. Untuk memaksa install di CI gunakan:

```bash
H56_FORCE_POSTINSTALL=1 npm install
```

Namun untuk determinisme CI/CD sebaiknya deklarasikan dependency secara eksplisit di pipeline Anda.

---

## Quick start — CLI

Sintaks dasar:

```bash
node main-scrapping.js <username> [--json] [--output=path] [--no-spinner]
```

Contoh:

```bash
# Ringkasan human readable
node main-scrapping.js HASYIM56

# Output JSON ke STDOUT
node main-scrapping.js HASYIM56 --json

# Output JSON ke file
node main-scrapping.js HASYIM56 --json --output=HASYIM56.json
```

### Opsi terjemahan CLI (baru)

- `--lang, -l <code>` — target bahasa (mis. `en`, `id`, `fr`)
- `--translate-fields <comma-separated>` — fields yang ingin diterjemahkan: `bio`, `repo_descriptions`, `repo_names`, `all_repos`  
  Default: `bio,repo_descriptions`
- `--no-spinner` — non-aktifkan spinner (berguna pada CI)
- `--json` — output JSON

Contoh:

```bash
node main-scrapping.js HASYIM56 --lang=en --translate-fields=bio,repo_descriptions --json --output=HASYIM56-en.json
```

Jika translator tidak terpasang, CLI tetap berjalan dan akan menambahkan `_translation_note` pada hasil JSON (default fail-safe). Untuk membuat proses gagal ketika translator tidak ada, gunakan opsi programatik `failOnMissing: true` dengan `scrapeUser`.

---

## Opsi terjemahan (CLI & programatik)

Terjemahan bersifat opsional dan dikontrol melalui:

- CLI flags (`--lang`, `--translate-fields`)
- Programatik: `scrapeUser(username, { translate: { lang, fields, perRepoDelay, failOnMissing } })`
- Helper langsung: `h56translate(text, targetLang, options?)`

Default behavior:
- Jika `translate` tidak diberikan -> tidak ada terjemahan.
- Jika `translate.lang` diberikan tapi `h56-translator` tidak ada:
  - Default: tetap kembalikan hasil asli dan tambahkan `_translation_note`.
  - Jika `failOnMissing: true` -> lempar error `TRANSLATOR_MISSING`.

Rekomendasi: lakukan translate secara sequential untuk mengurangi beban, atau lakukan paralelisasi terbatas + cache untuk skala.

---

## API Reference singkat — TypeScript interfaces

Berikut ringkasan interface yang relevan (copas ke .d.ts atau file dokumentasi Anda):

```ts
// translate-engine/translate.ts (contract)
export interface TranslationResult {
  translatedText: string;
  sourceLang: string;    // kode bahasa terdeteksi (service-defined)
  targetLang: string;    // bahasa target yang diminta
  serviceStatus: 'ok' | 'error';
  raw?: any;             // payload mentah dari service (opsional)
}

export interface TranslateOptions {
  endpoint?: string;               // default jika disediakan oleh service
  signal?: AbortSignal;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;              // helper timeout, opsional
}

declare function translate(
  text: string,
  targetLang: string,
  options?: TranslateOptions
): Promise<TranslationResult>;
```

Core scraping types:

```ts
export interface Profile {
  username: string;
  name: string;
  bio: string;
  followers: number;
  following: number;
  public_repos: number;
  profile_url: string;
  // optional translation fields added dynamically:
  bio_translated?: string;
  bio_source_lang?: string | null;
  bio_translation_meta?: any;
  bio_translation_error?: string;
}

export interface Repo {
  name: string;
  description: string;
  language: string;
  stars: number;
  forks: number;
  updated_at?: string;
  // optional translated fields:
  description_translated?: string;
  description_source_lang?: string | null;
  description_translation_meta?: any;
  description_translation_error?: string;
  name_translated?: string;
  name_source_lang?: string | null;
}

export interface Stats {
  total_repositories: number;
  total_stars: number;
  total_forks: number;
  top_languages: { language: string; repos: number }[];
}

export function scrapeUser(
  username: string,
  opts?: {
    spinner?: boolean;
    translate?: {
      lang: string;
      fields?: string[];
      perRepoDelay?: number;
      failOnMissing?: boolean;
    };
  }
): Promise<{ profile: Profile; repos: Repo[]; stats: Stats; _translation_note?: any }>;
```

---

## Contoh penggunaan

### CommonJS (Node.js)

```js
const {
  scrapeUser,
  h56translate, // optional helper; may throw if not installed
} = require("h56-github-scrapper");

(async () => {
  // tanpa terjemahan
  const { profile, repos, stats } = await scrapeUser("HASYIM56");

  // dengan terjemahan via opsi
  const translated = await scrapeUser("HASYIM56", {
    translate: { lang: "en", fields: ["bio", "repo_descriptions"], perRepoDelay: 120 }
  });
  console.log(translated.profile.bio_translated);

  // menggunakan helper langsung (opsional)
  try {
    const r = await h56translate("Halo dunia", "en");
    console.log(r.translatedText);
  } catch (err) {
    console.warn("Translator unavailable:", err.message);
  }
})();
```

### ESM (dynamic import)

```js
const pkg = await import("h56-github-scrapper");
const { scrapeUser, h56translate } = pkg;

const res = await scrapeUser("HASYIM56", { translate: { lang: "en" } });
```

### Contoh TypeScript (development)

```ts
import { translate } from "./translate-engine/translate";
const r = await translate("Halo dunia", "en");
console.log(r.translatedText);
```

---

## Behavior translator opsional & postinstall

- `h56-translator` adalah dependency opsional. Paket menyediakan:
  - `translate-engine/translate.ts` (typed wrapper) untuk development/TS.
  - `translate-engine/translate.js` (CJS wrapper) untuk runtime require().

---

## Best practices & etika scraping

- Jangan paralelisasi scraping untuk banyak akun tanpa jeda; gunakan `SCRAPE_DELAY` dan `MAX_RETRY` yang konservatif.
- Untuk skala besar/penggunaan produksi, gunakan GitHub API (REST) dengan otentikasi.
- Untuk terjemahan massal:
  - Perhatikan rate limit dan biaya pada layanan penerjemah.
  - Tambahkan cache (memory/file/db) untuk hasil terjemahan agar tidak berulang.
  - Batasi concurrency ketika melakukan banyak permintaan terjemahan.
- Gunakan logger terpusat (winston/pino) untuk memantau error, retries, dan metrik.

---

## Troubleshooting

- "Optional dependency 'h56-translator' is not available":
  - Jalankan: `npm install h56-translator`
  - Atau jalankan `npm install` ulang dengan `H56_FORCE_POSTINSTALL=1` jika menggunakan postinstall di CI.
- Parsing kosong/field hilang:
  - GitHub mungkin mengubah markup; periksa selector di `main-scrapping.js`.
- Performance / timeout:
  - Atur `REQUEST_TIMEOUT`, `MAX_RETRY`, dan `SCRAPE_DELAY` saat membuat `new GithubScraper({...})`.

---

## Contributing & changelog singkat

Kontribusi disambut. Silakan:
- Buka issue jika akan mengubah API publik.
- Sertakan test untuk fitur baru.
- Ikuti style guide dan sertakan deskripsi perubahan pada PR.

Changelog singkat (ringkasan):
- v1.0.0 — Core scraper + optional translator support (h56-translator) + CLI translate flags.

---

## Contoh Implementasi ESM Node.js — Detail lengkap (Tambahan dokumentasi)

Bagian ini memberikan panduan langkah demi langkah dan contoh kode ESM (Node.js) yang lebih komprehensif untuk mengimpor paket, mengkonfigurasi scraper, menangani opsi terjemahan (opsional), dan menyimpan hasil full data akun GitHub ke file JSON. Semua contoh menggunakan ESM (".mjs" atau package.json "type": "module") dan Node.js >= 16.

Catatan singkat:
- Jika Anda menginstall paket via npm dan menggunakan ESM, Anda dapat memakai dynamic import atau static import (tergantung cara publish). Contoh di bawah menggunakan dynamic import agar langsung kompatibel dengan berbagai skenario.
- Contoh juga menunjukkan opsi untuk menangani kasus ketika `h56-translator` tidak tersedia.

1) Contoh file: scrape-full-esm.mjs
- Perintah menjalankan: node scrape-full-esm.mjs <github-username> [--lang=<lang>] [--output=<path>] [--no-spinner]
- Fungsi: scrape full data (profile, repos, stats), coba terjemahkan bila diminta, simpan ke file JSON atau cetak ke stdout.

```js
// scrape-full-esm.mjs
// Usage: node scrape-full-esm.mjs <username> [--lang=en] [--output=./result.json] [--no-spinner]

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import process from "process";

const argv = process.argv.slice(2);

// Minimal CLI parsing (boleh ganti dengan yargs jika ingin)
function parseArgs(args) {
  const out = { _: [] };
  for (const a of args) {
    if (a.startsWith("--lang=")) out.lang = a.split("=")[1];
    else if (a.startsWith("--output=")) out.output = a.split("=")[1];
    else if (a === "--no-spinner") out.noSpinner = true;
    else out._.push(a);
  }
  return out;
}

const parsed = parseArgs(argv);
const username = parsed._[0];

if (!username) {
  console.error("Usage: node scrape-full-esm.mjs <username> [--lang=en] [--output=./res.json] [--no-spinner]");
  process.exit(2);
}

(async () => {
  try {
    // dynamic import library (ESM)
    const pkg = await import("h56-github-scrapper");
    // package exports: scrapeUser, scrapeProfile, scrapeRepos, GithubScraper, h56translate, printResult
    const {
      scrapeUser,
      GithubScraper,
      h56translate,
      printResult,
    } = pkg;

    // Example: use defaultScraper via scrapeUser (simple)
    const translateOpt = parsed.lang
      ? {
          lang: parsed.lang,
          fields: ["bio", "repo_descriptions"], // default fields
          perRepoDelay: 120,
          failOnMissing: false, // don't fail if translator missing
        }
      : undefined;

    console.log("Scraping user:", username);
    const result = await scrapeUser(username, {
      spinner: !parsed.noSpinner,
      translate: translateOpt,
    });

    // Pretty-print to console using built-in helper (optional)
    if (!parsed.output) {
      // readable print
      printResult(result.profile, result.stats, result.repos);
      // also output JSON to stdout if desired
      console.log("JSON output:");
      console.log(JSON.stringify(result, null, 2));
    } else {
      const outPath = path.resolve(parsed.output);
      fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + "\n", "utf8");
      console.log("Saved JSON to", outPath);
    }
  } catch (err) {
    console.error("Error scraping:", err && err.message ? err.message : String(err));
    if (err && err.cause && err.cause.message) {
      console.error("Cause:", err.cause.message);
    }
    process.exit(1);
  }
})();
```

2) Contoh: menggunakan class GithubScraper untuk konfigurasi lanjutan
- Anda mungkin ingin mengubah timeout, user-agent, atau delay. Gunakan `new GithubScraper({ ... })`.

```js
// scrape-custom-esm.mjs
import fs from "fs";
import path from "path";
const { GithubScraper } = await import("h56-github-scrapper");

const scraper = new GithubScraper({
  REQUEST_TIMEOUT: 30000,
  SCRAPE_DELAY: 600,
  MAX_RETRY: 4,
  USER_AGENT: "MyBot/1.0 (+https://example.com/mybot)",
});

async function run(username, outFile) {
  try {
    const result = await scraper.scrapeUser(username, {
      spinner: true,
      translate: { lang: "en", fields: ["bio"], perRepoDelay: 120, failOnMissing: false },
    });
    fs.writeFileSync(path.resolve(outFile), JSON.stringify(result, null, 2) + "\n", "utf8");
    console.log("Saved:", outFile);
  } catch (e) {
    console.error("Failed:", e.message || e);
  }
}

await run("HASYIM56", "./hasyim56-full.json");
```

3) Contoh: memanggil helper terjemahan langsung (h56translate) — menangani ketiadaan translator
- Helper `h56translate` akan melempar error bila translator tidak tersedia. Tangani dengan try/catch.

```js
// translate-direct.mjs
const { h56translate } = await import("h56-github-scrapper");

async function example() {
  try {
    const r = await h56translate("Halo dunia, ini contoh bio", "en");
    console.log("Translated:", r.translatedText);
  } catch (err) {
    console.warn("Translator helper unavailable:", err.message);
    // fallback: continue tanpa terjemahan
  }
}

await example();
```

4) Praktik terbaik & tips pada implementasi ESM:
- Pastikan project Anda menggunakan "type": "module" di package.json atau gunakan ekstensi .mjs untuk file ESM.
- Jika Anda menjalankan pada lingkungan CI, disable spinner (`spinner: false` atau `--no-spinner`) untuk hasil yang bersih.
- Kelola `SCRAPE_DELAY` dan `perRepoDelay` untuk menghindari rate-limiting dari layanan penerjemah atau beban berlebih ke GitHub.
- Untuk penggunaan skala besar, simpan hasil terjemahan ke cache (file/db) agar tidak melakukan permintaan ulang terjemahan.
- Tangani error network dan kasus "Username not found" (kode error: `NOT_FOUND`) saat memanggil `scrapeUser` atau `scrapeProfile`.

5) Contoh alur end-to-end (script yang menerima daftar username dan menyimpan masing-masing ke file)
```js
// batch-scrape.mjs
import fs from "fs";
import path from "path";

const { scrapeUser } = await import("h56-github-scrapper");

// contoh daftar
const users = ["octocat", "HASYIM56", "someuser"];

for (const u of users) {
  try {
    console.log("Scraping", u);
    const res = await scrapeUser(u, { spinner: false, translate: undefined });
    const out = path.resolve(`./output-${u}.json`);
    fs.writeFileSync(out, JSON.stringify(res, null, 2) + "\n", "utf8");
    console.log("Saved", out);
  } catch (e) {
    console.error("Failed to scrape", u, e.message || e);
  }
  // disarankan memberi delay antar akun untuk sopan-santun
  await new Promise((r) => setTimeout(r, 500));
}
```

Ringkasan tambahan:
- Gunakan contoh `scrape-full-esm.mjs` untuk kebutuhan satu akun sederhana.
- Gunakan `GithubScraper` jika perlu konfigurasi param runtime (timeout, user-agent, delay).
- Gunakan `h56translate` atau opsi `translate` di `scrapeUser` bila memerlukan terjemahan, dan selalu tangani kemungkinan ketiadaan paket `h56-translator`.

---

## License

MIT

---

## Pembaruan dokumentasi & catatan rilis (dokumen tambahan — tetap pertahankan semua teks sebelumnya)

Bagian ini menambahkan klarifikasi, perbaikan bug penting, dan panduan migrasi singkat untuk konsumen yang menggunakan CommonJS (`require`) atau ESM (`import`), tanpa menghapus atau mengubah teks di atas.

### Ringkasan perubahan penting (versi terbaru)
- Perbaikan bug: paket sebelumnya hanya menawarkan entrypoint ESM sehingga pemanggilan `require("h56-github-scrapper")` pada proyek CommonJS menghasilkan error. Pada rilis ini paket menambahkan dukungan CommonJS tanpa mengubah API publik.
- Interoperabilitas modul: package sekarang menyediakan conditional exports di package.json (atau menyediakan berkas entry CommonJS) sehingga:
  - import/ESM consumers: mengimpor dari entrypoint ESM (mis. `import pkg from "h56-github-scrapper"` atau `const pkg = await import("h56-github-scrapper")`)
  - require/CommonJS consumers: menggunakan `require("h56-github-scrapper")` yang menunjuk ke implementasi CommonJS yang sepadan.
- Tidak ada perubahan terhadap fungsi publik, opsi CLI, atau perilaku terjemahan — hanya penambahan interoperability dan perbaikan pesan error agar lebih informatif ketika runtime dependency hilang.

### Cara migrate / catatan kompatibilitas
- Jika proyek Anda sudah memakai `require()` dan mengalami error saat mengupgrade dari versi lama (yang ESM-only), upgrade ke versi ini. Contoh:
  - Sebelumnya (error di versi ESM-only):
    - const pkg = require('h56-github-scrapper'); // error: must use import
  - Sekarang (seharusnya bekerja):
    - const { scrapeUser } = require('h56-github-scrapper');
- Jika Anda memakai bundler (webpack/rollup) atau transpiler, tetap pastikan konfigurasi Anda mendukung conditional exports atau gunakan resolusi module sesuai bundler.

### Pemeriksaan package.json / conditional exports
- Paket menyediakan entri conditional exports sehingga Node.js memilih entrypoint yang sesuai. Jika Anda mengelola fork/publish sendiri, pastikan `package.json` menyertakan:
  - `"exports": { ".": { "import": "./main-scrapping.js", "require": "./main-scrapping.cjs" } }`
  - Atau setidaknya pastikan `main` mengarah ke CommonJS build dan `module`/`exports` ke ESM.

### Troubleshooting require() setelah upgrade
- Jika `require("h56-github-scrapper")` masih gagal setelah upgrade:
  1. Periksa versi yang terinstall: `npm ls h56-github-scrapper`
  2. Hapus cache dan reinstall: `rm -rf node_modules package-lock.json && npm install`
  3. Pastikan tidak ada duplicate package dengan versi berbeda yang memengaruhi resolusi modul.
  4. Jika Anda menjalankan Node < 12 (tidak direkomendasikan), pertimbangkan upgrade Node ke versi LTS >= 16.
  5. Untuk debugging, periksa isi `node_modules/h56-github-scrapper` dan pastikan ada file `main-scrapping.cjs` (CommonJS) dan `main-scrapping.js` (ESM).

### Rekomendasi best-practice untuk penerapan
- Untuk library publik yang must support both CJS and ESM:
  - Sediakan kedua build (CJS + ESM) atau gunakan bundler untuk menghasilkan kedua format.
  - Gunakan conditional exports agar Node memilih entry yang tepat.
  - Sertakan test integrasi sederhana yang memanggil paket via `require()` dan `import()` sebagai bagian dari CI untuk menghindari regresi interop.
- Untuk penggunaan pada CI/automation:
  - Nonaktifkan spinner (`--no-spinner` atau `spinner:false`) untuk keluaran log yang konsisten.
  - Pastikan runtime deps (axios, cheerio, ora, yargs) terpasang di environment CI.

---

## Contoh test integrasi singkat (manual)
- Uji ESM:

```bash
node -e 'import("h56-github-scrapper").then(p=>console.log(Object.keys(p))).catch(e=>console.error(e))'
```

- Uji CommonJS:

```bash
node -e 'try{ const p=require("h56-github-scrapper"); console.log(Object.keys(p)); }catch(e){ console.error(e); process.exit(1); }'
```

Jika kedua perintah menampilkan daftar fungsi/eksport (mis. `scrapeUser`, `GithubScraper`, dsb.), paket berhasil di-resolve untuk kedua mode modul.

---

Terima kasih telah menggunakan h56-github-scrapper — jika Anda menemukan masalah baru silakan buka issue dengan detail (Node version, cara import/require, stack trace). Kontribusi dan PR sangat disambut.