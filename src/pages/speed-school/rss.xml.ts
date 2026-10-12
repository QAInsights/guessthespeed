import type { APIRoute } from "astro";
import { ARTICLES } from "../../lib/articles";

const SITE = "https://guessthespeed.com";
const escape = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const rfc822 = (date: string) => new Date(`${date}T12:00:00Z`).toUTCString();

export const GET: APIRoute = () => {
  const items = ARTICLES.map(
    (article) => `    <item>
      <title>${escape(article.title)}</title>
      <link>${SITE}${article.path}</link>
      <guid isPermaLink="true">${SITE}${article.path}</guid>
      <pubDate>${rfc822(article.published)}</pubDate>
      <dc:creator>NaveenKumar Namachivayam</dc:creator>
      <category>${escape(article.category)}</category>
      <description>${escape(article.excerpt)}</description>
    </item>`,
  ).join("\n");
  const latest = ARTICLES.map((a) => a.updated ?? a.published)
    .sort()
    .at(-1)!;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Speed School by Guess the Speed</title>
    <link>${SITE}/speed-school/</link>
    <atom:link href="${SITE}/speed-school/rss.xml" rel="self" type="application/rss+xml" />
    <description>Plain-English, sourced guides to Mbps, ping, Wi-Fi and gaming speed, plus free tools and family game night ideas.</description>
    <language>en</language>
    <lastBuildDate>${rfc822(latest)}</lastBuildDate>
${items}
  </channel>
</rss>
`;
  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
};
