export interface Promo {
  id: string;
  title: string;
  blurbKey: string;
  ctaKey: string;
  href: string;
  image: string;
  tile?: string;
}

export const PROMOS: Promo[] = [
  {
    id: "quick-links",
    title: "Quick Links",
    blurbKey: "promo_quick_links",
    ctaKey: "promo_add_chrome",
    href: "https://chromewebstore.google.com/detail/quick-links/jcpngbilapanldphljagkbkjkmkmeiii",
    image: "/promos/quick-links.png",
  },
  {
    id: "prompticon",
    title: "Prompticon",
    blurbKey: "promo_prompticon",
    ctaKey: "promo_add_chrome",
    href: "https://chromewebstore.google.com/detail/prompticon/niofgdlmoogjllonnpdhmajdginmcnke",
    image: "/promos/prompticon.svg",
  },
  {
    id: "visual-vibes",
    title: "Visual Vibes",
    blurbKey: "promo_visual_vibes",
    ctaKey: "promo_see_booth",
    href: "https://www.visualvibes.pics/",
    image: "/promos/visual-vibes.png",
  },
  {
    id: "dosa",
    title: "ai.dosa.dev",
    blurbKey: "promo_dosa",
    ctaKey: "promo_explore_tools",
    href: "https://ai.dosa.dev/",
    image: "/promos/ai-dosa.svg",
    tile: "#0a0a0a",
  },
];

export function pickPromo<T>(
  list: readonly T[],
  rand: () => number = Math.random,
): T | null {
  if (list.length === 0) return null;
  const index = Math.min(
    list.length - 1,
    Math.max(0, Math.floor(rand() * list.length)),
  );
  return list[index] ?? null;
}
