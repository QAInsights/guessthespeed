import {
  DEFAULT_SCORING_SETTINGS,
  type Actual,
  type Guess,
  type PlayerRoundScore,
  scoreRound,
  type TieMode,
} from "./scoring";
import { isThemeId, type ThemeId } from "./themes";

export const ROLES = [
  { emoji: "👨", role: "Dad" },
  { emoji: "👩", role: "Mom" },
  { emoji: "👦", role: "Brother" },
  { emoji: "👧", role: "Sister" },
  { emoji: "👶", role: "Baby" },
  { emoji: "👴", role: "Grandpa" },
  { emoji: "👵", role: "Grandma" },
  { emoji: "🧒", role: "Cousin" },
  { emoji: "🧑", role: "Friend" },
  { emoji: "🐶", role: "Dog" },
  { emoji: "🐱", role: "Cat" },
] as const;

export interface Player {
  id: string;
  name: string;
  emoji: string;
  role: string;
  score: number;
  guess: Guess;
  locked: boolean;
}

export function pendingGuessers(players: Player[]): Player[] {
  return players.filter((player) => !player.locked);
}

export function startAnywayMessage(players: Player[]): string | null {
  const pending = pendingGuessers(players);
  if (!pending.length || pending.length === players.length) return null;

  const names =
    pending.length > 4
      ? `${pending
          .slice(0, 3)
          .map((player) => player.name)
          .join(", ")} and ${pending.length - 3} more`
      : pending.length === 1
        ? pending[0].name
        : `${pending
            .slice(0, -1)
            .map((player) => player.name)
            .join(", ")} and ${pending.at(-1)!.name}`;

  return `${pending.length} of ${players.length} ${
    pending.length === 1 ? "hasn't" : "haven't"
  } guessed yet: ${names}.`;
}

export const DEFAULT_PLAYERS: ReadonlyArray<
  Pick<Player, "id" | "name" | "emoji" | "role">
> = [
  { id: "p-mom", name: "Mom", emoji: "👩", role: "Mom" },
  { id: "p-dad", name: "Dad", emoji: "👨", role: "Dad" },
  { id: "p-big-sis", name: "Big Sis", emoji: "👧", role: "Sister" },
  { id: "p-little-sis", name: "Little One", emoji: "👧", role: "Sister" },
];

export interface GameSettings {
  rounds: number | "endless";
  tieMode: TieMode;
  themeMode: "auto" | ThemeId;
  sound: boolean;
  confetti: boolean;
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

export function initialGameState(): GameState {
  return {
    players: DEFAULT_PLAYERS.map((player) => ({
      ...player,
      score: 0,
      guess: { down: null, up: null },
      locked: false,
    })),
    settings: {
      rounds: 3,
      tieMode: "share",
      themeMode: "auto",
      sound: true,
      confetti: true,
    },
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
  role: string,
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

export function loadGame(storage?: StorageLike): GameState {
  try {
    const target =
      storage ??
      (typeof localStorage === "undefined" ? undefined : localStorage);
    if (!target) return initialGameState();
    const parsed: unknown = JSON.parse(target.getItem(STORAGE_KEY) ?? "null");
    if (!isGameState(parsed)) return initialGameState();
    return {
      ...parsed,
      settings: {
        ...parsed.settings,
        confetti:
          typeof parsed.settings.confetti === "boolean"
            ? parsed.settings.confetti
            : true,
      },
    };
  } catch {
    return initialGameState();
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
