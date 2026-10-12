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
  /** Last meaningful content update, YYYY-MM-DD. Defaults to published. */
  updated?: string;
  /** 3 or 4 standalone key points for the TL;DR box and answer engines. */
  tldr: string[];
}

/** Every Speed School article, newest first. New article pages must be added here. */
export const ARTICLES: Article[] = [
  {
    path: "/upload-vs-download-speed/",
    title: "Upload vs Download Speed: What Is the Difference?",
    excerpt:
      "What upload and download speed mean, which home activities use each, and how much upload video calls, live streams and Remote Play need.",
    category: "Guides",
    published: "2026-10-12",
    tldr: [
      "Download speed is how fast data reaches you from the internet. Upload speed is how fast your devices send data out.",
      "Many plans are asymmetric, so a big download result does not prove your upload is enough for calls, live streams or backups.",
      "Microsoft recommends 2.5 Mbps up per person for Teams video meetings, and PlayStation recommends 15 Mbps both ways for Remote Play.",
      "YouTube suggests leaving about 20% of upload unused, so a 17 Mbps 1080p 60 fps H.264 stream needs roughly 22 Mbps up.",
    ],
  },
  {
    path: "/internet-speed-for-gaming/",
    title: "How Much Internet Speed Do You Need for Gaming?",
    excerpt:
      "The Mbps and ping that online multiplayer, PlayStation Remote Play, Xbox Cloud Gaming and GeForce NOW ask for, plus real game download times.",
    category: "Guides",
    published: "2026-10-12",
    tldr: [
      "For online multiplayer, a low and steady ping matters more than raw Mbps, and 25 Mbps or more is plenty for the match itself.",
      "Streaming a game needs more: PlayStation recommends 15 Mbps for Remote Play, Xbox Cloud Gaming about 20 Mbps and GeForce NOW 25 Mbps for 1080p at 60 FPS.",
      "Download speed mostly decides how long new games and patches take to arrive.",
      "Guess the Speed pings a nearby Cloudflare server, so check the game or streaming app for your real server latency.",
    ],
  },
  {
    path: "/am-i-getting-the-speed-i-pay-for/",
    title: "Am I Getting the Internet Speed I Pay For?",
    excerpt:
      "Compare your plan with real download results, test fairly, and learn when a repeated gap is worth raising with your provider.",
    category: "Tools",
    published: "2026-10-07",
    tldr: [
      "Test on a device close to the router, ideally wired, and compare download and upload with your plan.",
      "Repeat at different times of day. One low result is not proof of a problem, but a pattern is worth investigating.",
      "Our rule of thumb for close enough is 80% of the plan's download speed. It is not a regulator standard.",
      "Wi-Fi typically delivers less than a wired connection, so test fairly before you call your provider.",
    ],
  },
  {
    path: "/what-is-a-good-internet-speed/",
    title: "What Is a Good Internet Speed in 2026?",
    excerpt:
      "Sourced download, upload and ping recommendations for streaming, calls, games and busy households, in plain English.",
    category: "Guides",
    published: "2026-10-06",
    tldr: [
      "About 100 Mbps download and 20 Mbps upload is a useful starting point for many homes, matching the FCC's 2024 fixed broadband benchmark.",
      "Lighter households can use less, while busy homes, creators and large file transfers may benefit from more.",
      "For calls, Zoom says latency of 150 ms or less and jitter of 40 ms or less are typical recommendations.",
      "Plan on about 15 to 20 Mbps per 4K stream: Netflix recommends 15 Mbps for UHD and YouTube lists 20 Mbps.",
    ],
  },
  {
    path: "/internet-speed-101/",
    title: "Internet Speed 101",
    excerpt:
      "A friendly guide to Mbps, download and upload speed, ping, Wi-Fi, and how much internet a home may need.",
    category: "Guides",
    published: "2026-10-06",
    tldr: [
      "Eight bits make one byte, so divide Mbps by 8 to estimate MB/s: 100 Mbps is about 12.5 MB/s.",
      "Bandwidth is how much data can move at once. Latency, or ping, is how long one trip takes.",
      "Download brings data to you, while upload sends it out for calls, backups and posts.",
      "Ping and jitter explain why a fast plan can still feel laggy in calls and games.",
    ],
  },
  {
    path: "/how-much-internet-speed-do-i-need/",
    title: "How Much Internet Speed Do I Need?",
    excerpt:
      "Count the streams, calls, games and downloads running at once and get a download and upload plan estimate for your home.",
    category: "Tools",
    published: "2026-10-06",
    tldr: [
      "Add up the activities that happen at the same time, then leave 25% headroom.",
      "Two 4K streams and three HD group calls use about 51.4 Mbps down and 9 Mbps up before that buffer.",
      "With headroom, the calculator rounds that home to a 100 Mbps down and 25 Mbps up plan.",
      "Every activity rate comes from the service's own published guidance.",
    ],
  },
  {
    path: "/mbps-to-mbs/",
    title: "Mbps to MB/s Converter",
    excerpt:
      "100 Mbps is 12.5 MB/s. Convert any speed and see how long a file really takes to download at full and realistic speed.",
    category: "Tools",
    published: "2026-10-06",
    tldr: [
      "Divide Mbps by 8 to get MB/s: 100 Mbps is 12.5 MB/s and 300 Mbps is 37.5 MB/s.",
      "Internet plans use megabits (Mbps), while Steam and browsers show megabytes (MB/s).",
      "The download timer shows the full line rate and a realistic 90% estimate.",
      "1 MiB is 1,048,576 bytes, about 5% more than 1 MB.",
    ],
  },
  {
    path: "/how-it-works/",
    title: "How Does the Real Speed Test Work?",
    excerpt:
      "How the browser speed test measures ping, download and upload against Cloudflare, and how each guess is scored.",
    category: "Behind the scenes",
    published: "2026-10-06",
    tldr: [
      "The test runs in your browser against Cloudflare and measures ping, jitter, download and upload.",
      "Downloads and uploads ramp through larger files, so fast connections have time to reach full speed.",
      "The final speed is the 90th percentile of timed requests longer than 10 ms.",
      "Loaded latency and packet loss are not measured, which keeps a round quick.",
    ],
  },
  {
    path: "/family-game-night-ideas/",
    title: "Family Game Night Ideas That Use Your Wi-Fi",
    excerpt:
      "Nine low-prep family games built on your home Wi-Fi: guessing rounds, room hunts, download math and paper scorecards.",
    category: "Game night",
    published: "2026-10-06",
    tldr: [
      "Nine low-prep family game night ideas built on your home Wi-Fi, a speed test and a sheet of paper.",
      "Try a room-to-room speed hunt, a 5 GB download time guess or a ping race between rooms.",
      "No board game or purchase is needed.",
      "A week-long family speed log turns it into a weekly ritual.",
    ],
  },
  {
    path: "/speed-test-game/",
    title: "The Speed Test Guessing Game",
    excerpt:
      "Turn a real Cloudflare speed test into a free family game. Guess download and upload together, then see who came closest.",
    category: "Game night",
    published: "2026-10-06",
    tldr: [
      "Everyone guesses download and upload speed, then a real speed test reveals the numbers.",
      "The closest estimates win points, and you can learn the rules in about 60 seconds.",
      "Play on one TV, or bring separate phones together with a room code.",
      "It is a real speed test, so the result is also a quick check of your connection.",
    ],
  },
  {
    path: "/internet-speed-lesson-for-kids/",
    title: "Internet Speed Lesson for Kids",
    excerpt:
      "A 30-minute classroom activity for ages 8 to 14: estimation, bits and bytes, percent error and reading real data.",
    category: "Classroom",
    published: "2026-10-06",
    tldr: [
      "A 30-minute activity for ages 8 to 14 covering estimation, bits and bytes, percent error and reading real data.",
      "One shared screen is enough. Student phones are optional where school rules allow.",
      "It includes a minute-by-minute lesson plan, percent error worked by hand and a six-question worksheet.",
      "Extensions are ready for another class period.",
    ],
  },
  {
    path: "/story/",
    title: "How a Living-Room Speed Test Became a Family Game",
    excerpt:
      "Two kids who always guess right, a dad who loses on purpose, and how a TV speed test turned into guessthespeed.com.",
    category: "Behind the scenes",
    published: "2026-10-06",
    tldr: [
      "Guess the Speed started on a lazy evening with a speed test on the TV and two kids guessing the result.",
      "The kids kept guessing right, so the ritual became a game with points.",
      "It is built by a developer dad and played by kids on guessthespeed.com.",
    ],
  },
  {
    path: "/how-to-play/",
    title: "How Do You Play Guess the Speed?",
    excerpt:
      "Rules, scoring, spot-on bonuses, ties, rounds and themes, explained in about a minute.",
    category: "Game night",
    published: "2026-10-05",
    tldr: [
      "Everyone makes a secret download and upload guess, then a real speed test reveals the numbers.",
      "Your miss is the percentage difference from the real result, averaged across download and upload.",
      "First, second and third place earn 3, 2 and 1 points.",
      "Ties, the number of rounds and themes can all be changed.",
    ],
  },
];
