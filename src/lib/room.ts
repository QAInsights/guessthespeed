import {
  addPlayer,
  applyResult,
  initialGameState,
  lockGuess,
  newGame,
  nextRound,
  removePlayer,
  unlockGuess,
  updatePlayer,
  type GameSettings,
  type GameState,
  type Player,
} from "./game";
import { isRecord } from "./guards";
import { MAX_NAME_LENGTH, MAX_SPEED_MBPS } from "./limits";
import { isBlockedName } from "./name-filter";
import {
  applyRaceTiming,
  DEFAULT_SCORING_SETTINGS,
  scoreRound,
  type TieMode,
} from "./scoring";

export const ROOM_ALPHABET = "BCDFGHJKMNPQRSTVWXZ";
export const ROOM_CODE_LENGTH = 6;
export const MAX_PLAYERS = 12;
export const ROOM_HISTORY_MAX = 50;
export const ROOM_TTL_MS = 6 * 60 * 60 * 1000;

export type RoomKind = "family" | "team";

export interface RoomPlayer extends Player {
  owner: string;
  guessedAt?: number | null;
}

export interface Room {
  code: string;
  hostToken: string;
  testerId: string | null;
  kind?: RoomKind;
  rotateTester?: boolean;
  race?: boolean;
  game: Omit<GameState, "players" | "settings" | "view"> & {
    players: RoomPlayer[];
    settings: Pick<GameSettings, "rounds" | "tieMode">;
    raceStartedAt?: number;
  };
  updatedAt: number;
}

export type ClientAction =
  | { type: "join"; name: string; emoji: string; role: string }
  | { type: "edit"; id: string; name: string; emoji: string; role: string }
  | { type: "guess"; id: string; down: number; up: number }
  | { type: "unlock"; id: string }
  | { type: "remove"; id: string }
  | { type: "settings"; rounds: GameSettings["rounds"]; tieMode: TieMode }
  | { type: "setTester"; id: string | null }
  | { type: "rotate"; on: boolean }
  | { type: "race"; on: boolean }
  | { type: "transferHost"; id: string }
  | { type: "start" }
  | { type: "result"; down: number; up: number; ping?: number }
  | { type: "abort" }
  | { type: "next" }
  | { type: "newGame" };

export interface RoomView extends Omit<
  GameState,
  "players" | "settings" | "view"
> {
  code: string;
  isHost: boolean;
  testerId: string | null;
  kind: RoomKind;
  rotateTester: boolean;
  race: boolean;
  canRunTest: boolean;
  players: (Player & { mine: boolean })[];
  settings: Pick<GameSettings, "rounds" | "tieMode">;
  view: GameState["view"];
}

export function interruptedTestStep(input: {
  phase: RoomView["phase"];
  canRunTest: boolean;
  runInProgress: boolean;
  recoveryRequested: boolean;
  hasPendingResult: boolean;
}): { action: "none" | "resend" | "abort"; recoveryRequested: boolean } {
  if (input.phase !== "testing")
    return { action: "none", recoveryRequested: false };
  if (!input.canRunTest)
    return { action: "none", recoveryRequested: input.recoveryRequested };
  if (input.runInProgress) {
    return { action: "none", recoveryRequested: input.recoveryRequested };
  }
  if (input.hasPendingResult) {
    return { action: "resend", recoveryRequested: input.recoveryRequested };
  }
  if (!input.recoveryRequested)
    return { action: "abort", recoveryRequested: true };
  return { action: "none", recoveryRequested: input.recoveryRequested };
}

let playerSequence = 0;

export function generateRoomCode(random: () => number = Math.random): string {
  return Array.from({ length: ROOM_CODE_LENGTH }, () => {
    const value = random();
    const index = Math.max(
      0,
      Math.min(
        ROOM_ALPHABET.length - 1,
        Math.floor(value * ROOM_ALPHABET.length),
      ),
    );
    return ROOM_ALPHABET[index];
  }).join("");
}

export function normalizeRoomCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, "");
  return code.length === ROOM_CODE_LENGTH &&
    [...code].every((letter) => ROOM_ALPHABET.includes(letter))
    ? code
    : null;
}

export function progressRelayPayload(
  message: Record<string, unknown>,
  race: boolean,
): Record<string, string | number> | null {
  if (!["ping", "down", "up"].includes(String(message.phase))) return null;
  const progress: Record<string, string | number> = {
    type: "progress",
    phase: String(message.phase),
  };
  const keys = race
    ? ["step", "steps"]
    : ["mbps", "pingMs", "step", "steps", "bytes"];
  for (const key of keys) {
    const value = message[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0)
      progress[key] = value;
  }
  return progress;
}

export function createRoom(
  code: string,
  hostToken: string,
  now: number,
  kind: RoomKind = "family",
): Room {
  const normalized = normalizeRoomCode(code);
  if (!normalized) throw new Error("Invalid room code");
  return {
    code: normalized,
    hostToken,
    testerId: null,
    kind,
    rotateTester: kind === "team",
    game: {
      players: [],
      settings: {
        rounds: 3,
        tieMode: "share",
      },
      round: 1,
      history: [],
      phase: "guessing",
    },
    updatedAt: now,
  };
}

export function parseTransferHostAction(
  action: unknown,
): Extract<ClientAction, { type: "transferHost" }> | null {
  return isRecord(action) &&
    action.type === "transferHost" &&
    typeof action.id === "string"
    ? { type: "transferHost", id: action.id }
    : null;
}

export function transferHost(
  room: Room,
  opts: {
    isHost: boolean;
    clientId: string;
    playerId: string;
    targetOnline: boolean;
    newHostToken: string;
    now: number;
  },
):
  | { ok: true; room: Room; newHostClientId: string }
  | { ok: false; error: string } {
  if (!opts.isHost) return { ok: false, error: "host_only" };
  if (room.game.phase === "testing")
    return {
      ok: false,
      error: "test_in_progress",
    };
  const player = room.game.players.find(
    (candidate) => candidate.id === opts.playerId,
  );
  if (!player) return { ok: false, error: "player_left" };
  if (!opts.targetOnline)
    return {
      ok: false,
      error: "player_offline",
    };
  if (player.owner === opts.clientId)
    return { ok: false, error: "different_device_required" };
  return {
    ok: true,
    room: {
      ...room,
      hostToken: opts.newHostToken,
      updatedAt: opts.now,
    },
    newHostClientId: player.owner,
  };
}

export function applyAction(
  room: Room,
  clientId: string,
  isHost: boolean,
  action: unknown,
  now: number,
  opts?: { onlineOwners?: ReadonlySet<string> },
): { room: Room } | { error: string } {
  if (!isRecord(action) || typeof action.type !== "string")
    return { error: "invalid_action" };

  const game = toGameState(room.game);
  switch (action.type) {
    case "join": {
      const name = validName(action.name);
      const emoji = shortString(action.emoji);
      const role = shortString(action.role);
      if (name === null || emoji === null || role === null)
        return { error: "name_and_face_required" };
      if (isBlockedName(name) || isBlockedName(role) || isBlockedName(emoji))
        return { error: "name_blocked" };
      if (game.phase === "testing") return { error: "test_in_progress" };
      if (
        !isHost &&
        room.game.players.some((player) => player.owner === clientId)
      )
        return { error: "device_has_player" };
      if (room.game.players.length >= MAX_PLAYERS)
        return { error: "room_full" };

      let id = createPlayerId();
      while (room.game.players.some((player) => player.id === id))
        id = createPlayerId();
      const nextGame = addPlayer(game, name, emoji, role, id);
      const added = nextGame.players.find((player) => player.id === id);
      if (!added) return { error: "player_add_failed" };
      return {
        room: {
          ...room,
          updatedAt: now,
          game: {
            ...room.game,
            players: [...room.game.players, { ...added, owner: clientId }],
          },
        },
      };
    }
    case "edit": {
      const player = findPlayer(room, action.id);
      if (!player) return { error: "player_not_found" };
      if (player.owner !== clientId) return { error: "edit_own_only" };
      if (game.phase === "testing") return { error: "test_in_progress" };
      const name = validName(action.name);
      const emoji = shortString(action.emoji);
      const role = shortString(action.role);
      if (name === null || emoji === null || role === null)
        return { error: "name_and_face_required" };
      if (isBlockedName(name) || isBlockedName(role) || isBlockedName(emoji))
        return { error: "name_blocked" };
      return updateRoomGame(
        room,
        updatePlayer(game, player.id, { name, emoji, role }),
        now,
      );
    }
    case "guess": {
      const player = findPlayer(room, action.id);
      if (!player) return { error: "player_not_found" };
      if (player.owner !== clientId) return { error: "guess_own_only" };
      if (game.phase === "results" || game.phase === "champion")
        return { error: room.race ? "race_closed" : "guesses_closed" };
      if (game.phase !== "guessing" && !(room.race && game.phase === "testing"))
        return { error: "guesses_closed" };
      if (!validSpeed(action.down) || !validSpeed(action.up))
        return {
          error: "invalid_speed",
        };
      if (!room.race)
        return updateRoomGame(
          room,
          lockGuess(game, player.id, {
            down: action.down,
            up: action.up,
          }),
          now,
        );
      const guessingGame = lockGuess(
        { ...game, phase: "guessing" },
        player.id,
        { down: action.down, up: action.up },
      );
      const nextGame = {
        ...guessingGame,
        phase: game.phase,
        players: guessingGame.players.map((candidate) =>
          candidate.id === player.id
            ? { ...candidate, guessedAt: now }
            : candidate,
        ),
      };
      return updateRoomGame(room, nextGame, now);
    }
    case "unlock": {
      const player = findPlayer(room, action.id);
      if (!player) return { error: "player_not_found" };
      if (player.owner !== clientId) return { error: "unlock_own_only" };
      if (game.phase !== "guessing" && !(room.race && game.phase === "testing"))
        return { error: "guesses_closed" };
      if (!room.race)
        return updateRoomGame(room, unlockGuess(game, player.id), now);
      const unlocked = unlockGuess({ ...game, phase: "guessing" }, player.id);
      return updateRoomGame(
        room,
        {
          ...unlocked,
          phase: game.phase,
          players: unlocked.players.map((candidate) =>
            candidate.id === player.id
              ? { ...candidate, guessedAt: null }
              : candidate,
          ),
        },
        now,
      );
    }
    case "remove": {
      const player = findPlayer(room, action.id);
      if (!player) return { error: "player_not_found" };
      if (!isHost && player.owner !== clientId)
        return { error: "remove_own_only" };
      if (game.phase === "testing") return { error: "test_in_progress" };
      const updated = updateRoomGame(room, removePlayer(game, player.id), now);
      return {
        room: {
          ...updated.room,
          testerId:
            (room.testerId ?? null) === player.id
              ? null
              : (room.testerId ?? null),
        },
      };
    }
    case "settings": {
      if (!isHost) return { error: "host_only" };
      if (!validRounds(action.rounds) || !validTieMode(action.tieMode))
        return { error: "invalid_settings" };
      if (game.phase === "testing") return { error: "test_in_progress" };
      return updateRoomGame(
        room,
        {
          ...game,
          settings: {
            ...game.settings,
            rounds: action.rounds,
            tieMode: action.tieMode,
          },
        },
        now,
      );
    }
    case "setTester": {
      if (!isHost) return { error: "host_only" };
      if (game.phase === "testing") return { error: "test_in_progress" };
      if (
        action.id !== null &&
        !room.game.players.some((player) => player.id === action.id)
      )
        return { error: "tester_not_found" };
      return {
        room: {
          ...room,
          testerId: action.id as string | null,
          updatedAt: now,
        },
      };
    }
    case "rotate": {
      if (!isHost) return { error: "host_only" };
      if (game.phase === "testing") return { error: "test_in_progress" };
      if (typeof action.on !== "boolean") return { error: "invalid_rotation" };
      return {
        room: {
          ...room,
          rotateTester: action.on,
          updatedAt: now,
        },
      };
    }
    case "race": {
      if (!isHost) return { error: "host_only" };
      if (game.phase === "testing") return { error: "test_in_progress" };
      if (typeof action.on !== "boolean") return { error: "invalid_rotation" };
      return {
        room: {
          ...room,
          race: action.on,
          updatedAt: now,
        },
      };
    }
    case "start": {
      if (!canRunTest(room, clientId, isHost)) return { error: "tester_only" };
      if (game.phase !== "guessing") return { error: "game_not_ready" };
      if (!room.race && !game.players.some((player) => player.locked))
        return { error: "guess_required" };
      return room.race
        ? updateRoomGame(room, { ...game, phase: "testing" }, now, {
            raceStartedAt: now,
          })
        : updateRoomGame(room, { ...game, phase: "testing" }, now);
    }
    case "result": {
      if (!canRunTest(room, clientId, isHost)) return { error: "tester_only" };
      if (game.phase !== "testing") return { error: "test_not_running" };
      if (
        (typeof action.down === "number" && action.down <= 0) ||
        (typeof action.up === "number" && action.up <= 0)
      )
        return { error: "result_missing" };
      if (!validSpeed(action.down) || !validSpeed(action.up))
        return {
          error: "invalid_speed",
        };
      if (action.ping !== undefined && !validSpeed(action.ping))
        return { error: "invalid_ping" };
      const actual = {
        down: action.down,
        up: action.up,
        ...(action.ping === undefined ? {} : { ping: action.ping }),
      };
      if (room.race) {
        const scores = scoreRound(
          game.players.map((player) => ({
            id: player.id,
            guess: player.locked ? player.guess : { down: null, up: null },
          })),
          actual,
          {
            ...DEFAULT_SCORING_SETTINGS,
            tieMode: game.settings.tieMode,
            placePoints: [30, 20, 10],
          },
        );
        const raceScores = applyRaceTiming(
          scores,
          room.game.players,
          room.game.raceStartedAt,
          now,
        );
        const scoreById = new Map(raceScores.map((score) => [score.id, score]));
        const nextGame = {
          ...game,
          players: game.players.map((player) => ({
            ...player,
            score: player.score + (scoreById.get(player.id)?.total ?? 0),
            guessedAt: null,
          })),
          history: [
            ...game.history,
            {
              round: game.round,
              actual,
              scores: raceScores,
            },
          ],
          phase: "results" as const,
        };
        return updateRoomGame(room, nextGame, now, { raceStartedAt: null });
      }
      const result = applyResult(game, actual);
      return updateRoomGame(room, result.state, now);
    }
    case "abort": {
      if (!canRunTest(room, clientId, isHost) && !isHost)
        return { error: "tester_or_host_only" };
      if (game.phase !== "testing") return { error: "test_not_running" };
      return updateRoomGame(
        room,
        {
          ...game,
          phase: "guessing",
          ...(room.race
            ? {
                players: game.players.map((player) => ({
                  ...player,
                  guessedAt: null,
                })),
              }
            : {}),
        },
        now,
        { ...(room.race ? { raceStartedAt: null } : {}) },
      );
    }
    case "next": {
      if (!isHost) return { error: "host_only" };
      if (game.phase !== "results") return { error: "result_missing" };
      const next = nextRound(game);
      const updated = updateRoomGame(
        room,
        {
          ...next,
          ...(room.race
            ? {
                players: next.players.map((player) => ({
                  ...player,
                  guessedAt: null,
                })),
              }
            : {}),
        },
        now,
        room.race ? { raceStartedAt: null } : {},
      ).room;
      if ((room.rotateTester ?? false) && next.phase === "guessing") {
        const onlineOwners =
          opts?.onlineOwners ??
          new Set(room.game.players.map((player) => player.owner));
        return {
          room: {
            ...updated,
            testerId: nextTesterId(
              room.game.players,
              room.testerId ?? null,
              onlineOwners,
              clientId,
            ),
          },
        };
      }
      return { room: updated };
    }
    case "newGame": {
      if (!isHost) return { error: "host_only" };
      if (game.phase === "testing")
        return {
          error: "test_in_progress",
        };
      const next = newGame(game);
      return updateRoomGame(
        room,
        {
          ...next,
          ...(room.race
            ? {
                players: next.players.map((player) => ({
                  ...player,
                  guessedAt: null,
                })),
              }
            : {}),
        },
        now,
        room.race ? { raceStartedAt: null } : {},
      );
    }
    default:
      return { error: "unknown_action" };
  }
}

export function viewFor(
  room: Room,
  clientId: string,
  isHost: boolean,
): RoomView {
  const reveal =
    room.game.phase === "results" || room.game.phase === "champion";
  return {
    code: room.code,
    isHost,
    testerId: room.testerId ?? null,
    kind: room.kind ?? "family",
    rotateTester: room.rotateTester ?? false,
    race: room.race ?? false,
    canRunTest: canRunTest(room, clientId, isHost),
    players: room.game.players.map((roomPlayer) => {
      const { owner, ...player } = roomPlayer;
      delete player.guessedAt;
      return {
        ...player,
        guess:
          reveal || owner === clientId
            ? { ...player.guess }
            : { down: null, up: null },
        mine: owner === clientId,
      };
    }),
    settings: {
      rounds: room.game.settings.rounds,
      tieMode: room.game.settings.tieMode,
    },
    round: room.game.round,
    history: room.game.history.map((entry) => ({
      ...entry,
      actual: { ...entry.actual },
      scores: entry.scores.map((score) => ({ ...score })),
    })),
    phase: room.game.phase,
    view: "grid",
  };
}

export function nextTesterId(
  players: readonly RoomPlayer[],
  currentTesterId: string | null,
  onlineOwners: ReadonlySet<string>,
  hostClientId?: string,
): string | null {
  const candidates: RoomPlayer[] = [];
  const seenOwners = new Set<string>();
  for (const player of players) {
    if (
      player.owner === "" ||
      !onlineOwners.has(player.owner) ||
      seenOwners.has(player.owner)
    )
      continue;
    seenOwners.add(player.owner);
    candidates.push(player);
  }
  if (!candidates.length) return null;

  const tester =
    currentTesterId === null
      ? undefined
      : players.find((player) => player.id === currentTesterId);
  const currentOwner = tester?.owner ?? hostClientId;
  const currentIndex = candidates.findIndex(
    (player) => player.owner === currentOwner,
  );
  return candidates[(currentIndex + 1) % candidates.length]?.id ?? null;
}

export function canRunTest(
  room: Room,
  clientId: string,
  isHost: boolean,
): boolean {
  const testerId = room.testerId ?? null;
  if (testerId === null) return isHost;
  const tester = room.game.players.find((player) => player.id === testerId);
  return tester ? tester.owner === clientId : isHost;
}

function toGameState(game: Room["game"]): GameState {
  return {
    players: game.players.map(({ owner, ...player }) => {
      void owner;
      return {
        ...player,
        guess: { ...player.guess },
      };
    }),
    settings: {
      ...initialGameState().settings,
      ...game.settings,
    },
    round: game.round,
    history: game.history,
    phase: game.phase,
    view: "grid",
  };
}

function updateRoomGame(
  room: Room,
  game: GameState,
  now: number,
  options: { raceStartedAt?: number | null } = {},
): { room: Room } {
  const owners = new Map(
    room.game.players.map((player) => [player.id, player.owner]),
  );
  return {
    room: {
      ...room,
      testerId: room.testerId ?? null,
      updatedAt: now,
      game: {
        players: game.players.map((player) => {
          const original = room.game.players.find(
            (candidate) => candidate.id === player.id,
          );
          const guessedAt = Object.prototype.hasOwnProperty.call(
            player,
            "guessedAt",
          )
            ? (player as Player & { guessedAt?: number | null }).guessedAt
            : original?.guessedAt;
          return {
            ...player,
            owner: owners.get(player.id) ?? "",
            ...(guessedAt === undefined ? {} : { guessedAt }),
          };
        }),
        settings: {
          rounds: game.settings.rounds,
          tieMode: game.settings.tieMode,
        },
        round: game.round,
        history: game.history.slice(-ROOM_HISTORY_MAX),
        phase: game.phase,
        ...("raceStartedAt" in options
          ? options.raceStartedAt === null ||
            options.raceStartedAt === undefined
            ? {}
            : { raceStartedAt: options.raceStartedAt }
          : room.game.raceStartedAt === undefined
            ? {}
            : { raceStartedAt: room.game.raceStartedAt }),
      },
    },
  };
}

function findPlayer(room: Room, id: unknown): RoomPlayer | undefined {
  return typeof id === "string"
    ? room.game.players.find((player) => player.id === id)
    : undefined;
}

function createPlayerId(): string {
  playerSequence += 1;
  return `rp-${Math.random().toString(36).slice(2, 10)}${playerSequence.toString(36)}`;
}

function validName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name.length > 0 && name.length <= MAX_NAME_LENGTH ? name : null;
}

function shortString(value: unknown): string | null {
  return typeof value === "string" && value.length <= 16 ? value : null;
}

function validSpeed(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= MAX_SPEED_MBPS
  );
}

function validRounds(value: unknown): value is GameSettings["rounds"] {
  return value === "endless" || [1, 3, 5, 7, 10].includes(value as number);
}

function validTieMode(value: unknown): value is TieMode {
  return value === "share" || value === "download";
}
