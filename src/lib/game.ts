import {
  DEFAULT_SCORING_SETTINGS,
  type Actual,
  type Guess,
  type PlayerRoundScore,
  scoreRound,
  type TieMode,
} from "./scoring";
import { isThemeId, type ThemeId } from "./themes";

export const ROLE_IDS = [
  "dad",
  "mom",
  "brother",
  "sister",
  "baby",
  "grandpa",
  "grandma",
  "cousin",
  "friend",
  "dog",
  "cat",
] as const;

export type RoleId = (typeof ROLE_IDS)[number];

const legacyRoleIds: Record<string, RoleId> = {
  Dad: "dad",
  Mom: "mom",
  Brother: "brother",
  Sister: "sister",
  Baby: "baby",
  Grandpa: "grandpa",
  Grandma: "grandma",
  Cousin: "cousin",
  Friend: "friend",
  Dog: "dog",
  Cat: "cat",
};

export function isRoleId(value: unknown): value is RoleId {
  return typeof value === "string" && ROLE_IDS.includes(value as RoleId);
}

export function normalizeRoleId(value: string): RoleId | null {
  return isRoleId(value) ? value : (legacyRoleIds[value] ?? null);
}

export const ROLES: ReadonlyArray<{ emoji: string; role: RoleId }> = [
  { emoji: "👨", role: "dad" },
  { emoji: "👩", role: "mom" },
  { emoji: "👦", role: "brother" },
  { emoji: "👧", role: "sister" },
  { emoji: "👶", role: "baby" },
  { emoji: "👴", role: "grandpa" },
  { emoji: "👵", role: "grandma" },
  { emoji: "🧒", role: "cousin" },
  { emoji: "🧑", role: "friend" },
  { emoji: "🐶", role: "dog" },
  { emoji: "🐱", role: "cat" },
];

export interface Player {
  id: string;
  name: string;
  emoji: string;
  role: RoleId;
  score: number;
  guess: Guess;
  locked: boolean;
}

export const DEFAULT_PLAYERS: ReadonlyArray<
  Pick<Player, "id" | "name" | "emoji" | "role">
> = [
  { id: "p-mom", name: "Mom", emoji: "👩", role: "mom" },
  { id: "p-dad", name: "Dad", emoji: "👨", role: "dad" },
  { id: "p-big-sis", name: "Big Sis", emoji: "👧", role: "sister" },
  { id: "p-little-sis", name: "Little Sis", emoji: "👧", role: "sister" },
];

export interface GameSettings {
  rounds: number | "endless";
  tieMode: TieMode;
  themeMode: "auto" | ThemeId;
  sound: boolean;
}

export interface RoundActual extends Actual {
  ping?: number;
}

export interface RoundHistory {
  round: number;
  actual: RoundActual;
  scores: PlayerRoundScore[];
}

export interface GameState {
  players: Player[];
  settings: GameSettings;
  round: number;
  history: RoundHistory[];
  phase: "guessing" | "testing" | "results" | "champion";
  view: "grid" | "table";
}

export const STORAGE_KEY = "gts:v1";

export function initialGameState(defaultNames?: readonly string[]): GameState {
  return {
    players: DEFAULT_PLAYERS.map((player, index) => ({
      ...player,
      name: defaultNames?.[index] ?? player.name,
      score: 0,
      guess: { down: null, up: null },
      locked: false,
    })),
    settings: { rounds: 3, tieMode: "share", themeMode: "auto", sound: true },
    round: 1,
    history: [],
    phase: "guessing",
    view: "grid",
  };
}

export function addPlayer(
  state: GameState,
  name: string,
  emoji: string,
  role: RoleId,
  id: string,
): GameState {
  const trimmedName = name.trim().slice(0, 16);
  if (!trimmedName || state.players.some((player) => player.id === id))
    return state;
  return {
    ...state,
    players: [
      ...state.players,
      {
        id,
        name: trimmedName,
        emoji,
        role,
        score: 0,
        guess: { down: null, up: null },
        locked: false,
      },
    ],
  };
}

export function updatePlayer(
  state: GameState,
  id: string,
  details: Pick<Player, "name" | "emoji" | "role">,
): GameState {
  const name = details.name.trim().slice(0, 16);
  if (!name || !state.players.some((player) => player.id === id)) return state;
  return {
    ...state,
    players: state.players.map((player) =>
      player.id === id
        ? { ...player, name, emoji: details.emoji, role: details.role }
        : player,
    ),
  };
}

export function removePlayer(state: GameState, id: string): GameState {
  return {
    ...state,
    players: state.players.filter((player) => player.id !== id),
  };
}

export function lockGuess(
  state: GameState,
  id: string,
  guess: Guess,
): GameState {
  if (state.phase !== "guessing") return state;
  return {
    ...state,
    players: state.players.map((player) =>
      player.id === id
        ? {
            ...player,
            guess: {
              down: finiteOrNull(guess.down),
              up: finiteOrNull(guess.up),
            },
            locked: true,
          }
        : player,
    ),
  };
}

export function unlockGuess(state: GameState, id: string): GameState {
  if (state.phase !== "guessing") return state;
  return {
    ...state,
    players: state.players.map((player) =>
      player.id === id ? { ...player, locked: false } : player,
    ),
  };
}

export function applyResult(
  state: GameState,
  actual: RoundActual,
): { state: GameState; scores: PlayerRoundScore[] } {
  const scores = scoreRound(
    state.players
      .filter((player) => player.locked)
      .map(({ id, guess }) => ({ id, guess })),
    actual,
    { ...DEFAULT_SCORING_SETTINGS, tieMode: state.settings.tieMode },
  );
  const scoreById = new Map(scores.map((score) => [score.id, score]));
  const historyActual: RoundActual = {
    down: actual.down,
    up: actual.up,
    ...(actual.ping === undefined ? {} : { ping: actual.ping }),
  };
  return {
    scores,
    state: {
      ...state,
      players: state.players.map((player) => ({
        ...player,
        score: player.score + (scoreById.get(player.id)?.total ?? 0),
      })),
      history: [
        ...state.history,
        { round: state.round, actual: historyActual, scores },
      ],
      phase: "results",
    },
  };
}

export function nextRound(state: GameState): GameState {
  if (state.phase !== "results") return state;
  if (
    state.settings.rounds !== "endless" &&
    state.round >= state.settings.rounds
  ) {
    return { ...state, phase: "champion" };
  }
  return {
    ...state,
    round: state.round + 1,
    phase: "guessing",
    players: state.players.map((player) => ({
      ...player,
      guess: { down: null, up: null },
      locked: false,
    })),
  };
}

export function newGame(state: GameState): GameState {
  return {
    ...state,
    round: 1,
    history: [],
    phase: "guessing",
    players: state.players.map((player) => ({
      ...player,
      score: 0,
      guess: { down: null, up: null },
      locked: false,
    })),
  };
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadGame(
  storage?: StorageLike,
  defaultNames?: readonly string[],
): GameState {
  try {
    const target =
      storage ??
      (typeof localStorage === "undefined" ? undefined : localStorage);
    if (!target) return initialGameState(defaultNames);
    const parsed: unknown = JSON.parse(target.getItem(STORAGE_KEY) ?? "null");
    if (!isGameState(parsed)) return initialGameState(defaultNames);
    return {
      ...parsed,
      players: parsed.players.map((player) => ({
        ...player,
        role: normalizeRoleId(player.role)!,
      })),
    };
  } catch {
    return initialGameState(defaultNames);
  }
}

export function saveGame(state: GameState, storage?: StorageLike): void {
  try {
    const target =
      storage ??
      (typeof localStorage === "undefined" ? undefined : localStorage);
    target?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    return;
  }
}

function finiteOrNull(value: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function isGameState(value: unknown): value is GameState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<GameState>;
  if (
    !Array.isArray(state.players) ||
    !state.settings ||
    typeof state.round !== "number" ||
    !Number.isInteger(state.round) ||
    state.round < 1 ||
    !Array.isArray(state.history) ||
    !["guessing", "testing", "results", "champion"].includes(
      state.phase ?? "",
    ) ||
    !["grid", "table"].includes(state.view ?? "")
  )
    return false;
  const currentRound = state.round;
  const { rounds, tieMode, themeMode, sound } = state.settings;
  if (
    !(rounds === "endless" || [1, 3, 5, 7, 10].includes(rounds)) ||
    !(tieMode === "share" || tieMode === "download") ||
    !(themeMode === "auto" || isThemeId(themeMode)) ||
    typeof sound !== "boolean"
  )
    return false;
  return (
    state.players.every(
      (player) =>
        !!player &&
        typeof player.id === "string" &&
        typeof player.name === "string" &&
        typeof player.emoji === "string" &&
        typeof player.role === "string" &&
        normalizeRoleId(player.role) !== null &&
        typeof player.score === "number" &&
        Number.isFinite(player.score) &&
        player.score >= 0 &&
        player.name.trim().length > 0 &&
        player.name.length <= 16 &&
        typeof player.locked === "boolean" &&
        !!player.guess &&
        isOptionalNumber(player.guess.down) &&
        isOptionalNumber(player.guess.up),
    ) &&
    new Set(state.players.map((player) => player.id)).size ===
      state.players.length &&
    state.history.every(
      (round) =>
        !!round &&
        typeof round.round === "number" &&
        Number.isInteger(round.round) &&
        round.round >= 1 &&
        round.round <= currentRound &&
        !!round.actual &&
        typeof round.actual.down === "number" &&
        Number.isFinite(round.actual.down) &&
        round.actual.down > 0 &&
        typeof round.actual.up === "number" &&
        Number.isFinite(round.actual.up) &&
        round.actual.up > 0 &&
        (round.actual.ping === undefined ||
          (typeof round.actual.ping === "number" &&
            Number.isFinite(round.actual.ping) &&
            round.actual.ping >= 0)) &&
        Array.isArray(round.scores) &&
        round.scores.every(
          (score) =>
            !!score &&
            typeof score.id === "string" &&
            isOptionalNumber(score.downMiss) &&
            isOptionalNumber(score.upMiss) &&
            isOptionalNumber(score.miss) &&
            (score.place === null ||
              (typeof score.place === "number" &&
                Number.isInteger(score.place) &&
                score.place > 0)) &&
            typeof score.placePoints === "number" &&
            Number.isFinite(score.placePoints) &&
            score.placePoints >= 0 &&
            typeof score.bonus === "number" &&
            Number.isInteger(score.bonus) &&
            score.bonus >= 0 &&
            typeof score.total === "number" &&
            Number.isFinite(score.total) &&
            score.total >= 0,
        ),
    )
  );
}

function isOptionalNumber(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === "number" && Number.isFinite(value) && value >= 0)
  );
}

export function isThemeMode(value: string): value is "auto" | ThemeId {
  return value === "auto" || isThemeId(value);
}
