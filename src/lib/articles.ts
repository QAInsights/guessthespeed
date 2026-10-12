export const ARTICLE_CATEGORIES = [
  "Guides",
  "Tools",
  "Game night",
  "Classroom",
  "Behind the scenes",
] as const;

export type ArticleCategory = (typeof ARTICLE_CATEGORIES)[number];

export interface Article {
  path: string;
  title: string;
  excerpt: string;
  category: ArticleCategory;
  /** First publish date, YYYY-MM-DD. */
  published: string;
}

/** Every Speed School article, newest first. New article pages must be added here. */
export const ARTICLES: Article[] = [
  {
    path: "/internet-speed-for-gaming/",
    title: "How Much Internet Speed Do You Need for Gaming?",
    excerpt:
      "The Mbps and ping that online multiplayer, PlayStation Remote Play, Xbox Cloud Gaming and GeForce NOW ask for, plus real game download times.",
    category: "Guides",
    published: "2026-10-12",
  },
  {
    path: "/am-i-getting-the-speed-i-pay-for/",
    title: "Am I Getting the Internet Speed I Pay For?",
    excerpt:
      "Compare your plan with real download results, test fairly, and learn when a repeated gap is worth raising with your provider.",
    category: "Tools",
    published: "2026-10-07",
  },
  {
    path: "/what-is-a-good-internet-speed/",
    title: "What Is a Good Internet Speed in 2026?",
    excerpt:
      "Sourced download, upload and ping recommendations for streaming, calls, games and busy households, in plain English.",
    category: "Guides",
    published: "2026-10-06",
  },
  {
    path: "/internet-speed-101/",
    title: "Internet Speed 101",
    excerpt:
      "A friendly guide to Mbps, download and upload speed, ping, Wi-Fi, and how much internet a home may need.",
    category: "Guides",
    published: "2026-10-06",
  },
  {
    path: "/how-much-internet-speed-do-i-need/",
    title: "How Much Internet Speed Do I Need?",
    excerpt:
      "Count the streams, calls, games and downloads running at once and get a download and upload plan estimate for your home.",
    category: "Tools",
    published: "2026-10-06",
  },
  {
    path: "/mbps-to-mbs/",
    title: "Mbps to MB/s Converter",
    excerpt:
      "100 Mbps is 12.5 MB/s. Convert any speed and see how long a file really takes to download at full and realistic speed.",
    category: "Tools",
    published: "2026-10-06",
  },
  {
    path: "/how-it-works/",
    title: "How Does the Real Speed Test Work?",
    excerpt:
      "How the browser speed test measures ping, download and upload against Cloudflare, and how each guess is scored.",
    category: "Behind the scenes",
    published: "2026-10-06",
  },
  {
    path: "/family-game-night-ideas/",
    title: "Family Game Night Ideas That Use Your Wi-Fi",
    excerpt:
      "Nine low-prep family games built on your home Wi-Fi: guessing rounds, room hunts, download math and paper scorecards.",
    category: "Game night",
    published: "2026-10-06",
  },
  {
    path: "/speed-test-game/",
    title: "The Speed Test Guessing Game",
    excerpt:
      "Turn a real Cloudflare speed test into a free family game. Guess download and upload together, then see who came closest.",
    category: "Game night",
    published: "2026-10-06",
  },
  {
    path: "/internet-speed-lesson-for-kids/",
    title: "Internet Speed Lesson for Kids",
    excerpt:
      "A 30-minute classroom activity for ages 8 to 14: estimation, bits and bytes, percent error and reading real data.",
    category: "Classroom",
    published: "2026-10-06",
  },
  {
    path: "/story/",
    title: "How a Living-Room Speed Test Became a Family Game",
    excerpt:
      "Two kids who always guess right, a dad who loses on purpose, and how a TV speed test turned into guessthespeed.com.",
    category: "Behind the scenes",
    published: "2026-10-06",
  },
  {
    path: "/how-to-play/",
    title: "How Do You Play Guess the Speed?",
    excerpt:
      "Rules, scoring, spot-on bonuses, ties, rounds and themes, explained in about a minute.",
    category: "Game night",
    published: "2026-10-05",
  },
];
