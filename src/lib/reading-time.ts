/// <reference types="vite/client" />

const sources = import.meta.glob<string>("../pages/*.astro", {
  query: "?raw",
  import: "default",
  eager: true,
});

const WORDS_PER_MINUTE = 220;

/** Estimated reading time for a top-level page such as "/story/". */
export function readingMinutes(path: string): number {
  const source = sources[`../pages${path.slice(0, -1)}.astro`] ?? "";
  const main = source.match(/<main[\s\S]*<\/main>/)?.[0] ?? "";
  const words = main
    .replace(/<(script|style)[\s\S]*?<\/\1>/g, " ")
    .replace(/\{[^{}]*\}/g, " ")
    .replace(/<[^>]+>/g, " ")
    .split(/\s+/)
    .filter((word: string) => /[a-z0-9]/i.test(word)).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}
