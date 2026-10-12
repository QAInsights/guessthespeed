// Writes a Markdown copy of every page that advertises one with
// <link rel="alternate" type="text/markdown">, for LLMs and "Copy for AI".
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

const DIST = "dist";
const SITE = "https://guessthespeed.com";
const DROP = [
  "script",
  "style",
  "svg",
  "form",
  "button",
  "input",
  "select",
  "textarea",
  "noscript",
  "template",
  "dialog",
  "label",
];

const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
});
turndown.addRule("tightListItem", {
  filter: "li",
  replacement: (content, node) => {
    const parent = node.parentNode;
    const ordered = parent.nodeName === "OL";
    const index = Array.prototype.indexOf.call(parent.children, node) + 1;
    const marker = ordered ? `${index}.` : "-";
    const body = content.trim().replace(/\n+/g, "\n  ");
    return `${marker} ${body}${node.nextSibling ? "\n" : ""}`;
  },
});
turndown.use(gfm);
turndown.remove(DROP);
// addRule rules win over the built-in paragraph and heading rules.
turndown.addRule("skipped", {
  filter: (node) =>
    node.hasAttribute("hidden") ||
    node.hasAttribute("data-md-skip") ||
    node.getAttribute("aria-hidden") === "true",
  replacement: () => "",
});

const decode = (text) =>
  text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

let written = 0;
for (const entry of await readdir(DIST, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const htmlPath = join(DIST, entry.name, "index.html");
  const html = await readFile(htmlPath, "utf8").catch(() => "");
  const link = html.match(
    /<link rel="alternate" type="text\/markdown" href="([^"]+)"/,
  );
  if (!link) continue;

  const main = html.match(/<main[\s\S]*?<\/main>/)?.[0];
  if (!main) throw new Error(`${htmlPath} has a Markdown link but no <main>`);
  const title = decode(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "");
  const description = decode(
    html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "",
  );
  const dates = [...html.matchAll(/<time datetime="(\d{4}-\d{2}-\d{2})"/g)].map(
    (match) => match[1],
  );
  const canonical =
    html.match(/<link rel="canonical" href="([^"]+)"/)?.[1] ?? "";

  const body = turndown
    .turndown(main.replace(/href="\//g, `href="${SITE}/`))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const markdown = [
    "---",
    `title: ${JSON.stringify(title)}`,
    `description: ${JSON.stringify(description)}`,
    `url: ${canonical}`,
    "author: NaveenKumar Namachivayam",
    ...(dates[0] ? [`published: ${dates[0]}`] : []),
    `updated: ${dates.at(-1) ?? dates[0] ?? ""}`,
    "---",
    "",
    body,
    "",
  ].join("\n");
  await writeFile(join(DIST, link[1].replace(/^\//, "")), markdown);
  written += 1;
}
if (written === 0) throw new Error("No Markdown pages were written");

const MARKER = "<!-- speed-school-articles -->";
const llmsPath = join(DIST, "llms.txt");
const llms = await readFile(llmsPath, "utf8");
if (!llms.includes(MARKER)) throw new Error(`${llmsPath} is missing ${MARKER}`);
const entries = JSON.parse(
  await readFile(join(DIST, "speed-school", "search.json"), "utf8"),
);
const byTopic = Map.groupBy(entries, (entry) => entry.category);
const grouped = [...byTopic]
  .map(
    ([category, list]) =>
      `### ${category}\n\n${list
        .map(
          (entry) =>
            `- [${entry.title}](${SITE}${entry.path}) ([Markdown](${SITE}${entry.path.slice(0, -1)}.md)): ${entry.excerpt}`,
        )
        .join("\n")}`,
  )
  .join("\n\n");
await writeFile(llmsPath, llms.replace(MARKER, grouped));
console.log(`build-markdown: wrote ${written} Markdown pages`);
