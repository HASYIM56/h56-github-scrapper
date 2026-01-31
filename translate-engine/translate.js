/**
 * translate-engine/translate.js (ESM)
 *
 * ESM wrapper for optional dependency 'h56-translator'.
 * Exports a single named function `translate(text, targetLang, options?)`.
 *
 * This file replaces the previous CommonJS wrapper and is ready for ESM usage.
 *
 * NOTE: If you publish this package as ESM (package.json "type": "module"),
 * keep this file as-is. It will attempt to import 'h56-translator' and normalize shapes.
 */

export async function translate(text, targetLang, options) {
  try {
    // dynamic import of the translator package (supports ESM or CJS shapes)
    const mod = await import("h56-translator");
    const m = mod && (mod.default || mod); // handle default interop
    if (typeof m.translate === "function") {
      return await m.translate(text, targetLang, options);
    }
    if (typeof m === "function") {
      // package export is a function
      return await m(text, targetLang, options);
    }
    if (m && typeof m.default === "function") {
      return await m.default(text, targetLang, options);
    }
    throw new Error("h56-translator export shape not recognized");
  } catch (err) {
    const e = new Error(
      "Optional dependency 'h56-translator' is not available. Install it with `npm install h56-translator`."
    );
    e.cause = err;
    throw e;
  }
}