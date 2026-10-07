export interface Promo {
  id: string;
  title: string;
  blurb: string;
  href: string;
  image: string;
  cta: string;
}

export const PROMOS: Promo[] = [
  {
    id: "quick-links",
    title: "Quick Links",
    blurb:
      "Kanban-style bookmarks and to-dos for Chrome. Local-first, lightning-fast search, zero telemetry.",
    href: "https://chromewebstore.google.com/detail/quick-links/jcpngbilapanldphljagkbkjkmkmeiii",
    image: "/promos/quick-links.png",
    cta: "Add to Chrome",
  },
  {
    id: "prompticon",
    title: "Prompticon",
    blurb: "One-click replies for your favorite AI chats, right inside Chrome.",
    href: "https://chromewebstore.google.com/detail/prompticon/niofgdlmoogjllonnpdhmajdginmcnke",
    image: "/promos/prompticon.svg",
    cta: "Add to Chrome",
  },
  {
    id: "visual-vibes",
    title: "Visual Vibes",
    blurb:
      "Premium photo booth rentals for weddings, parties and corporate events around Cincinnati.",
    href: "https://www.visualvibes.pics/",
    image: "/promos/visual-vibes.png",
    cta: "See the booth",
  },
  {
    id: "dosa",
    title: "ai.dosa.dev",
    blurb:
      "A hand-curated directory of 300+ AI coding tools: IDEs, agents and assistants.",
    href: "https://ai.dosa.dev/",
    image: "/promos/ai-dosa.svg",
    cta: "Explore tools",
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
