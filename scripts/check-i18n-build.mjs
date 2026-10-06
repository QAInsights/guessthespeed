import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const locales = {
  en: { path: "index.html", og: "en_US", url: "https://guessthespeed.com/" },
  ta: {
    path: "ta/index.html",
    og: "ta_IN",
    url: "https://guessthespeed.com/ta/",
  },
  hi: {
    path: "hi/index.html",
    og: "hi_IN",
    url: "https://guessthespeed.com/hi/",
  },
  es: {
    path: "es/index.html",
    og: "es_ES",
    url: "https://guessthespeed.com/es/",
  },
  pt: {
    path: "pt/index.html",
    og: "pt_BR",
    url: "https://guessthespeed.com/pt/",
  },
  fr: {
    path: "fr/index.html",
    og: "fr_FR",
    url: "https://guessthespeed.com/fr/",
  },
  de: {
    path: "de/index.html",
    og: "de_DE",
    url: "https://guessthespeed.com/de/",
  },
};
const dist = new URL("../dist/", import.meta.url);
const distPath = fileURLToPath(dist);
const expectedHreflangs = new Set([...Object.keys(locales), "x-default"]);
const localizedPaths = new Set(
  Object.values(locales).map((locale) => new URL(locale.url).pathname),
);

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

function read(relativePath) {
  return readFileSync(new URL(relativePath, dist), "utf8");
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
  return match?.[1];
}

function links(html) {
  return [...html.matchAll(/<link\b[^>]*>/gi)].map((match) => match[0]);
}

for (const [locale, expected] of Object.entries(locales)) {
  const html = read(expected.path);
  const htmlTag = html.match(/<html\b[^>]*>/i)?.[0] ?? "";
  if (attribute(htmlTag, "lang") !== locale)
    fail(`${expected.path} must set html lang="${locale}"`);
  if ([...html.matchAll(/<h1\b/gi)].length !== 1)
    fail(`${expected.path} must contain exactly one h1`);

  const pageLinks = links(html);
  const canonical = pageLinks.find(
    (tag) => attribute(tag, "rel") === "canonical",
  );
  if (attribute(canonical ?? "", "href") !== expected.url)
    fail(`${expected.path} must use canonical ${expected.url}`);

  const alternates = pageLinks.filter(
    (tag) =>
      attribute(tag, "rel") === "alternate" &&
      attribute(tag, "hreflang") !== undefined,
  );
  if (alternates.length !== 8)
    fail(`${expected.path} must contain exactly eight hreflang links`);
  const actualHreflangs = new Set(
    alternates.map((tag) => attribute(tag, "hreflang")),
  );
  if (
    actualHreflangs.size !== expectedHreflangs.size ||
    [...expectedHreflangs].some((code) => !actualHreflangs.has(code))
  )
    fail(
      `${expected.path} must contain all seven locale alternates and x-default`,
    );

  const ogLocale = html.match(
    /<meta\b(?=[^>]*\bproperty="og:locale")(?=[^>]*\bcontent="([^"]+)")[^>]*>/i,
  )?.[1];
  if (ogLocale !== expected.og)
    fail(`${expected.path} must set og:locale="${expected.og}"`);
}

if (
  attribute(
    links(read("index.html")).find(
      (tag) => attribute(tag, "rel") === "canonical",
    ) ?? "",
    "href",
  ) !== "https://guessthespeed.com/"
)
  fail("The English home canonical must remain https://guessthespeed.com/");

function filesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });
}

const htmlFiles = filesBelow(distPath).filter((path) => path.endsWith(".html"));
for (const file of htmlFiles) {
  const html = readFileSync(file, "utf8");
  const hasHreflang = links(html).some(
    (tag) => attribute(tag, "hreflang") !== undefined,
  );
  const pathname = `/${relative(distPath, file)
    .replaceAll("\\", "/")
    .replace(/index\.html$/, "")}`;
  if (!localizedPaths.has(pathname) && hasHreflang)
    fail(`${relative(distPath, file)} must not have hreflang links`);
}

const xmlFiles = filesBelow(distPath).filter((path) => path.endsWith(".xml"));
const sitemapEntries = xmlFiles.flatMap((file) => {
  const xml = readFileSync(file, "utf8");
  return [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((match) => ({
    file,
    block: match[1],
    url: match[1].match(/<loc>([^<]+)<\/loc>/)?.[1],
  }));
});
for (const expected of Object.values(locales)) {
  const entry = sitemapEntries.find((item) => item.url === expected.url);
  if (!entry) {
    fail(`Sitemap must include ${expected.url}`);
    continue;
  }
  const alternates = [
    ...entry.block.matchAll(/<xhtml:link\b[^>]*hreflang="([^"]+)"[^>]*>/g),
  ];
  if (alternates.length !== 7)
    fail(`Sitemap entry ${expected.url} must contain seven locale alternates`);
}
for (const entry of sitemapEntries) {
  if (!entry.url) continue;
  const pathname = new URL(entry.url).pathname;
  if (!localizedPaths.has(pathname) && entry.block.includes("<xhtml:link"))
    fail(`Sitemap entry ${entry.url} must not have locale alternates`);
}

if (process.exitCode) process.exit();
console.log(
  "PASS: seven locale homes have correct metadata, eight hreflang links, and sitemap alternates.",
);
console.log("PASS: English-only pages have no hreflang or sitemap alternates.");
