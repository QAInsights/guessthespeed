import type { APIRoute } from "astro";
import { ARTICLES } from "../../lib/articles";
import { articleText, readingMinutes } from "../../lib/reading-time";
import { categorySlug, formatArticleDate } from "../../lib/speed-school";

export const GET: APIRoute = () =>
  new Response(
    JSON.stringify(
      ARTICLES.map((article) => ({
        path: article.path,
        title: article.title,
        excerpt: article.excerpt,
        category: article.category,
        topic: categorySlug(article.category),
        published: article.published,
        date: formatArticleDate(article.published),
        minutes: readingMinutes(article.path),
        tldr: article.tldr,
        text: articleText(article.path),
      })),
    ),
    { headers: { "Content-Type": "application/json; charset=utf-8" } },
  );
