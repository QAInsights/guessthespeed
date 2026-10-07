export type OgCard = {
  path: string;
  group: "Play" | "Learn" | "Tools" | "About";
  kicker: string;
  line1: string;
  line2: string;
  subtitle: string;
  icon: `ph:${string}`;
};

export const ogCards: readonly OgCard[] = [
  {
    path: "/",
    group: "Play",
    kicker: "Family game night",
    line1: "Guess the Speed.",
    line2: "Beat the family.",
    subtitle: "Secret guesses. Real speed test. Game night starts here.",
    icon: "ph:lightning-fill",
  },
  {
    path: "/speed-test-game/",
    group: "Play",
    kicker: "Play",
    line1: "The speed test",
    line2: "game.",
    subtitle:
      "Everyone guesses the Wi-Fi speed. A real test reveals who was closest.",
    icon: "ph:gauge-fill",
  },
  {
    path: "/family-game-night-ideas/",
    group: "Play",
    kicker: "Game night",
    line1: "Game night ideas",
    line2: "with your Wi-Fi.",
    subtitle: "Nine free screen-friendly games. No board, no box, no setup.",
    icon: "ph:dice-five-fill",
  },
  {
    path: "/work/",
    group: "Play",
    kicker: "Team icebreaker",
    line1: "Guess the Wi-Fi.",
    line2: "Win the call.",
    subtitle:
      "A free icebreaker for remote teams. Each teammate runs the test in turn.",
    icon: "ph:briefcase-fill",
  },
  {
    path: "/classroom/",
    group: "Play",
    kicker: "Classroom mode",
    line1: "A speed game",
    line2: "for the classroom.",
    subtitle:
      "Free for teachers. Rosters stay in the browser, no student accounts.",
    icon: "ph:chalkboard-teacher-fill",
  },
  {
    path: "/internet-speed-lesson-for-kids/",
    group: "Learn",
    kicker: "Lesson plan",
    line1: "Internet speed",
    line2: "for kids.",
    subtitle: "A 30-minute classroom activity with a worksheet and answer key.",
    icon: "ph:student-fill",
  },
  {
    path: "/how-to-play/",
    group: "Learn",
    kicker: "How to play",
    line1: "How to play",
    line2: "in 60 seconds.",
    subtitle: "Rules, scoring, spot-on bonuses, ties and rounds.",
    icon: "ph:book-open-fill",
  },
  {
    path: "/how-it-works/",
    group: "Learn",
    kicker: "How it works",
    line1: "How the test",
    line2: "really works.",
    subtitle: "Download, upload and ping, measured live from Cloudflare.",
    icon: "ph:gear-six-fill",
  },
  {
    path: "/internet-speed-101/",
    group: "Learn",
    kicker: "Guide",
    line1: "Internet speed",
    line2: "101.",
    subtitle: "Mbps, upload, ping and jitter, explained in plain English.",
    icon: "ph:graduation-cap-fill",
  },
  {
    path: "/what-is-a-good-internet-speed/",
    group: "Learn",
    kicker: "Guide",
    line1: "What is a good",
    line2: "internet speed?",
    subtitle: "Plain-English answers for every household size in 2026.",
    icon: "ph:wifi-high-bold",
  },
  {
    path: "/how-much-internet-speed-do-i-need/",
    group: "Tools",
    kicker: "Free tool",
    line1: "How much speed",
    line2: "do you need?",
    subtitle: "Add your streams, calls and gamers. Get a plan that fits.",
    icon: "ph:calculator-fill",
  },
  {
    path: "/mbps-to-mbs/",
    group: "Tools",
    kicker: "Free tool",
    line1: "Mbps to MB/s,",
    line2: "in one tap.",
    subtitle: "Convert speeds and see how long a download really takes.",
    icon: "ph:arrows-left-right-bold",
  },
  {
    path: "/am-i-getting-the-speed-i-pay-for/",
    group: "Tools",
    kicker: "Free tool",
    line1: "Getting the speed",
    line2: "you pay for?",
    subtitle: "Compare a real test with your internet plan in seconds.",
    icon: "ph:receipt-fill",
  },
  {
    path: "/story/",
    group: "About",
    kicker: "Our story",
    line1: "Kids win.",
    line2: "Dad loses on purpose.",
    subtitle: "The living-room ritual that became Guess the Speed.",
    icon: "ph:heart-fill",
  },
  {
    path: "/stats/",
    group: "About",
    kicker: "Live stats",
    line1: "Every round,",
    line2: "counted.",
    subtitle: "Rounds, guesses and spot-on calls. Totals only, never people.",
    icon: "ph:chart-line-up-bold",
  },
  {
    path: "/privacy/",
    group: "About",
    kicker: "Privacy",
    line1: "Totals only.",
    line2: "Never people.",
    subtitle: "No accounts, no game cookies. Scores stay on your device.",
    icon: "ph:shield-check-fill",
  },
];

export function ogSlug(pathname: string): string {
  const slug = pathname.replace(/^\/+|\/+$/g, "");
  return slug || "home";
}

export function ogCardFor(pathname: string): OgCard {
  const path = pathname.replace(/^\/+|\/+$/g, "");
  const normalizedPath = path ? `/${path}/` : "/";
  return ogCards.find((card) => card.path === normalizedPath) ?? ogCards[0]!;
}

export function ogImagePath(pathname: string): string {
  return `/og/${ogSlug(ogCardFor(pathname).path)}.png`;
}
