// translate-engine/translate.ts
// TypeScript typed wrapper for optional dependency 'h56-translator'.
// This file provides a well-typed `translate` function for TypeScript consumers.
// Usage (TS):
//   import { translate } from "./translate-engine/translate";
//   const r = await translate("Halo dunia", "en");

export interface TranslationResult {
  translatedText: string;
  sourceLang: string;    // kode bahasa terdeteksi (service-defined)
  targetLang: string;    // nilai yang diminta
  serviceStatus: "ok" | "error";
  raw?: any;
}

export interface TranslateOptions {
  endpoint?: string;
  signal?: AbortSignal;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

type UnderlyingTranslate = (
  text: string,
  targetLang: string,
  options?: TranslateOptions
) => Promise<TranslationResult>;

async function loadTranslator(): Promise<{ translate: UnderlyingTranslate }> {
  try {
    // dynamic import to support both ESM and CJS consumers
    const mod = await import("h56-translator");
    const anyMod: any = mod;
    if (typeof anyMod.translate === "function") {
      return { translate: anyMod.translate as UnderlyingTranslate };
    }
    if (typeof anyMod.default === "function") {
      return { translate: anyMod.default as UnderlyingTranslate };
    }
    if (anyMod.default && typeof anyMod.default.translate === "function") {
      return { translate: anyMod.default.translate as UnderlyingTranslate };
    }
    throw new Error("h56-translator export shape not recognized");
  } catch (err) {
    throw new Error(
      "Optional dependency 'h56-translator' is not available. Install it with `npm install h56-translator`."
    );
  }
}

/**
 * translate(text, targetLang, options?)
 * Thin typed wrapper around h56-translator. Normalizes minimal payload.
 */
export async function translate(
  text: string,
  targetLang: string,
  options?: TranslateOptions
): Promise<TranslationResult> {
  const tmod = await loadTranslator();
  const raw = await (tmod.translate as UnderlyingTranslate)(text, targetLang, options);
  if (!raw || typeof raw.translatedText !== "string") {
    throw new Error("Translation service returned unexpected payload");
  }
  return {
    translatedText: raw.translatedText,
    sourceLang: raw.sourceLang || "",
    targetLang: raw.targetLang || targetLang,
    serviceStatus: raw.serviceStatus || "ok",
    raw: raw.raw || raw,
  };
}