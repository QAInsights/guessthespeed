import { isLocale, localizedPath } from "../lib/i18n";

const routePathname =
  window.location.pathname.replace(/^\/(?:ta|es)(?=\/)/u, "") || "/";
const isTranslatedPage =
  document.documentElement.dataset.home === "1" ||
  routePathname === "/classroom/" ||
  routePathname === "/work/";

if (!isTranslatedPage) {
  let storedLocale: string | null = null;
  try {
    storedLocale = localStorage.getItem("gts:locale");
  } catch {}

  if (isLocale(storedLocale) && storedLocale !== "en") {
    document
      .querySelectorAll<HTMLAnchorElement>(
        'a[href="/"], a[href="/classroom/"], a[href="/work/"]',
      )
      .forEach((link) => {
        const path = link.getAttribute("href");
        if (path === "/" || path === "/classroom/" || path === "/work/") {
          link.setAttribute("href", localizedPath(path, storedLocale));
        }
      });
  }
}
