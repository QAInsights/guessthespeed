const netflixSpeeds = "https://help.netflix.com/en/node/306";
const youtubePlayback = "https://support.google.com/youtube/answer/78358";
const zoomRequirements =
  "https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0060748";
const playstationRemotePlay =
  "https://www.playstation.com/en-us/support/games/ps4-remote-play-connection-troubleshooting/";
const steamDownloadLimits =
  "https://help.steampowered.com/en/faqs/view/163C-7C89-406E-2F63";
const ringWifiRecommendations =
  "https://ring.com/support/articles/gl040/Fixing-Inaccessible-Recordings-Adjusting-Router";

export const ACTIVITY_RATES = {
  streams4k: {
    down: 20,
    up: 0,
    label: "4K video streams",
    source: youtubePlayback,
  },
  streamsHd: {
    down: 5,
    up: 0,
    label: "HD video streams",
    source: netflixSpeeds,
  },
  callsHd: {
    down: 3.8,
    up: 3,
    label: "HD group video calls",
    source: zoomRequirements,
  },
  onlineGamers: {
    down: 15,
    up: 15,
    label: "Online gamers using Remote Play",
    source: playstationRemotePlay,
  },
  largeDownloads: {
    down: 25,
    up: 0,
    label: "Large downloads in progress",
    source: steamDownloadLimits,
  },
  smartHomeDevices: {
    down: 1,
    up: 1,
    label: "Smart-home or idle devices",
    source: ringWifiRecommendations,
  },
} as const;

export type ActivityId = keyof typeof ACTIVITY_RATES;

const PLAN_TIERS = [25, 50, 100, 200, 300, 500, 1000, 2000] as const;

const clampCount = (count: number): number =>
  Number.isFinite(count) ? Math.min(12, Math.max(0, Math.floor(count))) : 0;

const roundUpToTier = (speed: number): number =>
  PLAN_TIERS.find((tier) => tier >= speed) ?? PLAN_TIERS[PLAN_TIERS.length - 1];

export function recommendSpeed(counts: Record<ActivityId, number>): {
  down: number;
  up: number;
  tierDown: number;
  tierUp: number;
} {
  let totalDown = 0;
  let totalUp = 0;

  for (const activity of Object.keys(ACTIVITY_RATES) as ActivityId[]) {
    const count = clampCount(counts[activity] ?? 0);
    totalDown += ACTIVITY_RATES[activity].down * count;
    totalUp += ACTIVITY_RATES[activity].up * count;
  }

  const down = Math.max(25, Math.ceil(totalDown * 1.25 * 10) / 10);
  const up = Math.max(5, Math.ceil(totalUp * 1.25 * 10) / 10);

  return {
    down,
    up,
    tierDown: roundUpToTier(down),
    tierUp: roundUpToTier(up),
  };
}
