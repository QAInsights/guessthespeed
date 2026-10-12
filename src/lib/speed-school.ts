import { ARTICLES, type Article, type ArticleCategory } from "./articles";

export const SCHOOL_PAGE_SIZE = 9;
export const SCHOOL_PAGE_COUNT = Math.max(
  1,
  Math.ceil(ARTICLES.length / SCHOOL_PAGE_SIZE),
);

export const schoolPagePath = (page: number) =>
  page === 1 ? "/speed-school/" : `/speed-school/page/${page}/`;

export const schoolPageArticles = (page: number): Article[] =>
  ARTICLES.slice((page - 1) * SCHOOL_PAGE_SIZE, page * SCHOOL_PAGE_SIZE);

export const categorySlug = (category: ArticleCategory) =>
  category.toLowerCase().replace(/\s+/g, "-");

export const formatArticleDate = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
