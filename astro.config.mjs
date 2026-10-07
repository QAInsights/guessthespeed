import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";
import icon from "astro-icon";

export default defineConfig({
  site: "https://guessthespeed.com",
  integrations: [icon(), sitemap()],
  output: "static",
  prefetch: { prefetchAll: true, defaultStrategy: "hover" },
});
