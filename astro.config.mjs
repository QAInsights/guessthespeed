import sitemap from "@astrojs/sitemap";
import { paraglideVitePlugin } from "@inlang/paraglide-js";
import { defineConfig } from "astro/config";
import icon from "astro-icon";

const localizedHomePaths = new Set([
  "/",
  "/ta/",
  "/hi/",
  "/es/",
  "/pt/",
  "/fr/",
  "/de/",
]);

export default defineConfig({
  site: "https://guessthespeed.com",
  integrations: [
    icon(),
    sitemap({
      i18n: {
        defaultLocale: "en",
        locales: {
          en: "en",
          ta: "ta",
          hi: "hi",
          es: "es",
          pt: "pt",
          fr: "fr",
          de: "de",
        },
      },
      serialize(item) {
        return localizedHomePaths.has(new URL(item.url).pathname)
          ? item
          : { ...item, links: undefined };
      },
    }),
  ],
  i18n: {
    defaultLocale: "en",
    locales: ["en", "ta", "hi", "es", "pt", "fr", "de"],
    routing: { prefixDefaultLocale: false },
  },
  output: "static",
  vite: {
    plugins: [
      paraglideVitePlugin({
        project: "./project.inlang",
        outdir: "./src/paraglide",
        emitTsDeclarations: true,
        strategy: ["url", "globalVariable", "baseLocale"],
      }),
    ],
  },
});
