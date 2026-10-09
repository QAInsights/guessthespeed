import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const dist = join(process.cwd(), "dist");
const readPage = (path) => readFileSync(join(dist, path), "utf8");
const pages = {
  en: readPage("index.html"),
  ta: readPage("ta/index.html"),
  es: readPage("es/index.html"),
};

for (const [locale, html] of Object.entries(pages)) {
  assert.match(html, new RegExp(`<html[^>]*\\blang="${locale}"`));
  assert.match(
    html,
    new RegExp(
      `<link[^>]*rel="canonical"[^>]*href="https://guessthespeed\\.com/${locale === "en" ? "" : `${locale}/`}"`,
    ),
  );
  for (const alternate of ["en", "ta", "es", "x-default"]) {
    assert.match(html, new RegExp(`hreflang="${alternate}"`));
  }
}

const title = (html) => html.match(/<title>(.*?)<\/title>/)?.[1] ?? "";
assert.notEqual(title(pages.ta), "");
assert.notEqual(title(pages.es), "");
assert.notEqual(title(pages.ta), title(pages.en));
assert.notEqual(title(pages.es), title(pages.en));

for (const path of ["how-to-play/index.html", "privacy/index.html"]) {
  const html = readPage(path);
  assert.doesNotMatch(html, /hreflang=/);
}

console.log("Localization build metadata checks passed.");
