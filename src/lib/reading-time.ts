/// <reference types="vite/client" />

const sources = import.meta.glob<string>("../pages/*.astro", {
  query: "?raw",
  import: "default",
  eager: true,
});

const WORDS_PER_MINUTE = 220;

/** String fields the pages render through expressions, such as FAQ `questions`. */
const RENDERED_FIELD =
  /\b(?:question|answer|explanation):\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;

/** Plain prose of a top-level page such as "/story/", including rendered FAQ answers. */
export function articleText(path: string): string {
  const source = sources[`../pages${path.slice(0, -1)}.astro`] ?? "";
  const main = source.match(/<main[\s\S]*<\/main>/)?.[0] ?? "";
  const frontmatter = source.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
  const fields = [...frontmatter.matchAll(RENDERED_FIELD)].map(([, , value]) =>
    value.replace(/\\(.)/g, "$1"),
  );
  let text = [main, ...fields]
    .join(" ")
    .replace(/<(script|style)[\s\S]*?<\/\1>/g, " ");
  for (let prev = ""; prev !== text;) {
    prev = text;
    text = text.replace(/\$?\{[^{}]*\}/g, " ");
  }
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Estimated reading time for a top-level page such as "/story/". */
export function readingMinutes(path: string): number {
  const words = articleText(path)
    .split(" ")
    .filter((word: string) => /[a-z0-9]/i.test(word)).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}
