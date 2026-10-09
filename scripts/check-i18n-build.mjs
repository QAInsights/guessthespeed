import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dist = join(process.cwd(), "dist");
const readPage = (path) => readFileSync(join(dist, path), "utf8");
const collectHtmlFiles = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? collectHtmlFiles(path)
      : entry.isFile() && entry.name.endsWith(".html")
        ? [path]
        : [];
  });
const routes = {
  home: { en: "/", ta: "/ta/", es: "/es/" },
  classroom: {
    en: "/classroom/",
    ta: "/ta/classroom/",
    es: "/es/classroom/",
  },
  work: { en: "/work/", ta: "/ta/work/", es: "/es/work/" },
};
const outputPath = (path) =>
  `${path === "/" ? "" : path.replace(/^\/|\/$/g, "")}/index.html`;
const localizedPages = Object.fromEntries(
  Object.entries(routes).map(([page, locales]) => [
    page,
    Object.fromEntries(
      Object.entries(locales).map(([locale, path]) => [
        locale,
        readPage(outputPath(path)),
      ]),
    ),
  ]),
);
const absoluteUrl = (path) => `https://guessthespeed.com${path}`;
const title = (html) => html.match(/<title>(.*?)<\/title>/)?.[1] ?? "";

for (const [page, locales] of Object.entries(localizedPages)) {
  for (const [locale, html] of Object.entries(locales)) {
    assert.match(html, new RegExp(`<html[^>]*\\blang="${locale}"`));
    assert.ok(
      html.includes(
        `<link rel="canonical" href="${absoluteUrl(routes[page][locale])}"`,
      ),
      `${page} ${locale} canonical`,
    );
    for (const alternate of ["en", "ta", "es", "x-default"]) {
      const targetLocale = alternate === "x-default" ? "en" : alternate;
      const href = absoluteUrl(routes[page][targetLocale]);
      assert.ok(
        html.includes(`hreflang="${alternate}" href="${href}"`),
        `${page} ${locale} alternate ${alternate}`,
      );
    }
  }
  assert.notEqual(title(locales.ta), title(locales.en));
  assert.notEqual(title(locales.es), title(locales.en));
}

for (const path of ["how-to-play/index.html", "privacy/index.html"]) {
  const html = readPage(path);
  assert.doesNotMatch(html, /hreflang=/);
}

const sitemapFiles = readdirSync(dist).filter((file) =>
  /^sitemap.*\.xml$/.test(file),
);
const sitemap = sitemapFiles
  .map((file) => readFileSync(join(dist, file), "utf8"))
  .join("\n");
for (const path of [
  "/ta/classroom/",
  "/es/classroom/",
  "/ta/work/",
  "/es/work/",
]) {
  assert.ok(sitemap.includes(absoluteUrl(path)), `sitemap contains ${path}`);
}

for (const path of collectHtmlFiles(dist)) {
  const html = readFileSync(path, "utf8").replace(
    /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
    "",
  );
  assert.doesNotMatch(
    html,
    />[^<]*\bundefined\b[^<]*</i,
    `${path} contains undefined in visible text`,
  );
}

console.log("Localization build metadata checks passed.");
