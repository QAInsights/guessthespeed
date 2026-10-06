import { MAX_PLAYERS } from "./room";
import type { Actual, PlayerRoundScore } from "./scoring";

export type PlayMode = "local" | "room" | "classroom";

export interface PlayTotals {
  rounds: number;
  games: number;
  guesses: number;
  spotOns: number;
  fastestDown: number;
  closestMissSum: number;
  closestMissRounds: number;
  modes: { local: number; room: number; classroom: number };
}

export type StatEvent =
  | {
      kind: "round";
      guesses: number;
      mode?: PlayMode;
      down?: number;
      closestMiss?: number;
      spotOns?: number;
    }
  | { kind: "game" };

export const EMPTY_TOTALS: PlayTotals = Object.freeze({
  rounds: 0,
  games: 0,
  guesses: 0,
  spotOns: 0,
  fastestDown: 0,
  closestMissSum: 0,
  closestMissRounds: 0,
  modes: Object.freeze({ local: 0, room: 0, classroom: 0 }),
});

export const STAT_DISPLAY_MIN_ROUNDS = 50;

const roundToTenth = (value: number) => Math.round(value * 10) / 10;

function isPlayMode(value: unknown): value is PlayMode {
  return value === "local" || value === "room" || value === "classroom";
}

function isNonNegativeCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function normalizeTotals(stored: unknown): PlayTotals {
  const value =
    stored && typeof stored === "object" && !Array.isArray(stored)
      ? (stored as Record<string, unknown>)
      : {};
  const modes =
    value.modes &&
    typeof value.modes === "object" &&
    !Array.isArray(value.modes)
      ? (value.modes as Record<string, unknown>)
      : {};
  const rounds = isNonNegativeCount(value.rounds) ? value.rounds : 0;
  const guesses = isNonNegativeCount(value.guesses) ? value.guesses : 0;
  const rawSpotOns = isNonNegativeCount(value.spotOns) ? value.spotOns : 0;
  const rawFastestDown =
    typeof value.fastestDown === "number" &&
    Number.isFinite(value.fastestDown) &&
    value.fastestDown >= 0 &&
    value.fastestDown <= 10000
      ? value.fastestDown
      : 0;
  const rawClosestMissSum =
    typeof value.closestMissSum === "number" &&
    Number.isFinite(value.closestMissSum) &&
    value.closestMissSum >= 0
      ? value.closestMissSum
      : 0;

  return {
    rounds,
    games: isNonNegativeCount(value.games) ? value.games : 0,
    guesses,
    spotOns: rawSpotOns <= guesses ? rawSpotOns : 0,
    fastestDown: roundToTenth(rawFastestDown),
    closestMissSum: roundToTenth(rawClosestMissSum),
    closestMissRounds: isNonNegativeCount(value.closestMissRounds)
      ? value.closestMissRounds
      : 0,
    modes: {
      local: isNonNegativeCount(modes.local) ? modes.local : 0,
      room: isNonNegativeCount(modes.room) ? modes.room : 0,
      classroom: isNonNegativeCount(modes.classroom) ? modes.classroom : 0,
    },
  };
}

export function parseStatEvent(body: unknown): StatEvent | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const value = body as Record<string, unknown>;
  if (value.kind === "game") return { kind: "game" };
  if (value.kind !== "round") return null;
  if (
    typeof value.guesses !== "number" ||
    !Number.isInteger(value.guesses) ||
    value.guesses < 1 ||
    value.guesses > MAX_PLAYERS
  )
    return null;

  const hasMode = hasOwn(value, "mode");
  const hasDown = hasOwn(value, "down");
  const hasClosestMiss = hasOwn(value, "closestMiss");
  const hasSpotOns = hasOwn(value, "spotOns");
  if (hasMode && !isPlayMode(value.mode)) return null;
  if (
    hasDown &&
    (typeof value.down !== "number" ||
      !Number.isFinite(value.down) ||
      value.down <= 0 ||
      value.down > 10000)
  )
    return null;
  if (
    hasClosestMiss &&
    (typeof value.closestMiss !== "number" ||
      !Number.isFinite(value.closestMiss) ||
      value.closestMiss < 0 ||
      value.closestMiss > 100)
  )
    return null;
  if (
    hasSpotOns &&
    (typeof value.spotOns !== "number" ||
      !Number.isInteger(value.spotOns) ||
      value.spotOns < 0 ||
      value.spotOns > value.guesses)
  )
    return null;

  return {
    kind: "round",
    guesses: value.guesses,
    ...(hasMode ? { mode: value.mode as PlayMode } : {}),
    ...(hasDown ? { down: roundToTenth(value.down as number) } : {}),
    ...(hasClosestMiss
      ? { closestMiss: roundToTenth(value.closestMiss as number) }
      : {}),
    ...(hasSpotOns ? { spotOns: value.spotOns as number } : {}),
  };
}

export function roundStatEvent(
  scores: PlayerRoundScore[],
  actual: Actual,
  mode: PlayMode,
  guesses: number,
): StatEvent {
  const misses = scores
    .map((score) => score.miss)
    .filter((miss): miss is number => miss !== null && Number.isFinite(miss));
  const closestMiss =
    misses.length > 0
      ? roundToTenth(Math.min(100, Math.max(0, Math.min(...misses) * 100)))
      : undefined;
  const spotOns = Math.min(
    Math.max(0, guesses),
    scores.filter((score) => score.bonus > 0).length,
  );
  const roundedDown =
    Number.isFinite(actual.down) && actual.down > 0
      ? roundToTenth(Math.min(actual.down, 10000))
      : 0;
  const down = roundedDown > 0 ? roundedDown : undefined;

  return {
    kind: "round",
    guesses,
    mode,
    ...(down === undefined ? {} : { down }),
    ...(closestMiss === undefined ? {} : { closestMiss }),
    spotOns,
  };
}

export function addStatEvent(totals: PlayTotals, event: StatEvent): PlayTotals {
  if (event.kind === "game") return { ...totals, games: totals.games + 1 };

  const modes = { ...totals.modes };
  if (event.mode) modes[event.mode] += 1;
  const closestMissSum =
    event.closestMiss === undefined
      ? totals.closestMissSum
      : roundToTenth(totals.closestMissSum + event.closestMiss);
  return {
    ...totals,
    rounds: totals.rounds + 1,
    guesses: totals.guesses + event.guesses,
    spotOns: totals.spotOns + (event.spotOns ?? 0),
    fastestDown: roundToTenth(Math.max(totals.fastestDown, event.down ?? 0)),
    closestMissSum,
    closestMissRounds:
      totals.closestMissRounds + Number(event.closestMiss !== undefined),
    modes,
  };
}

export function formatPlayStat(
  totals: PlayTotals | null,
  options: { short?: boolean } = {},
): string | null {
  if (!totals || totals.rounds < STAT_DISPLAY_MIN_ROUNDS) return null;
  const rounds = new Intl.NumberFormat("en-US").format(totals.rounds);
  return options.short
    ? `${rounds} rounds so far`
    : `${rounds} rounds played so far`;
}
