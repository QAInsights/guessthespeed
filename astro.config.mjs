import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";
import icon from "astro-icon";

export default defineConfig({
  site: "https://guessthespeed.com",
  integrations: [
    icon(),
    sitemap({
      i18n: {
        defaultLocale: "en",
        locales: {
          en: "en-US",
          ta: "ta-IN",
          es: "es",
        },
      },
    }),
  ],
  i18n: {
    locales: ["en", "ta", "es"],
    defaultLocale: "en",
    routing: { prefixDefaultLocale: false },
  },
  output: "static",
  prefetch: { prefetchAll: true, defaultStrategy: "hover" },
});
