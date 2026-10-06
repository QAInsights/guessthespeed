import {
  addPlayer,
  applyResult,
  lockGuess,
  newGame,
  nextRound,
  removePlayer,
  unlockGuess,
  updatePlayer,
  normalizeRoleId,
  type RoleId,
  type GameSettings,
  type GameState,
  type Player,
} from "./game";
import type { TieMode } from "./scoring";

export const ROOM_ALPHABET = "BCDFGHJKMNPQRSTVWXZ";
export const ROOM_CODE_LENGTH = 6;
export const MAX_PLAYERS = 12;
export const ROOM_TTL_MS = 6 * 60 * 60 * 1000;

export const ROOM_ERROR_CODES = [
  "invalid_action",
  "name_required",
  "join_during_test",
  "device_already_joined",
  "room_full",
  "player_add_failed",
  "player_not_found",
  "edit_own_player_only",
  "edit_during_test",
  "guess_own_player_only",
  "guesses_closed",
  "invalid_speed",
  "unlock_own_player_only",
  "remove_own_player_only",
  "remove_during_test",
  "host_only_settings",
  "invalid_game_settings",
  "settings_during_test",
  "host_only_tester",
  "tester_during_test",
  "tester_not_in_room",
  "tester_only_start",
  "game_not_ready",
  "guess_required",
  "tester_only_result",
  "test_not_in_progress",
  "invalid_ping",
  "tester_or_host_only_abort",
  "host_only_next",
  "round_result_required",
  "host_only_new_game",
  "test_must_finish_before_new_game",
  "unknown_action",
  "room_ended",
  "too_many_messages",
  "text_messages_required",
  "invalid_json_message",
  "invalid_message",
  "connection_already_identified",
  "valid_hello_required",
  "tester_only_progress",
  "not_found",
  "invalid_room_code",
  "websocket_upgrade_required",
  "room_not_found",
  "room_code_exists",
  "invalid_initialization",
  "could_not_create_room",
  "no_room_code_available",
] as const;

export type RoomErrorCode = (typeof ROOM_ERROR_CODES)[number];

export const ROOM_ERROR_TEXT: Record<RoomErrorCode, string> = {
  invalid_action: "Invalid action.",
  name_required: "Enter a name and choose a face.",
  join_during_test: "Wait for the test to finish before joining.",
  device_already_joined: "This device already has a player in the room.",
  room_full: `A room can have up to ${MAX_PLAYERS} players.`,
  player_add_failed: "Could not add this player.",
  player_not_found: "Player not found.",
  edit_own_player_only: "You can only edit your own player.",
  edit_during_test: "Players cannot be edited during a test.",
  guess_own_player_only: "You can only guess for your own player.",
  guesses_closed: "Guesses are closed for this round.",
  invalid_speed: "Enter speeds between 0 and 100000 Mbps.",
  unlock_own_player_only: "You can only unlock your own player.",
  remove_own_player_only: "You can only remove your own player.",
  remove_during_test: "Players cannot be removed during a test.",
  host_only_settings: "Only the host can change settings.",
  invalid_game_settings: "Invalid game settings.",
  settings_during_test: "Settings cannot change during a test.",
  host_only_tester: "Only the host can choose the tester.",
  tester_during_test: "The tester cannot change during a test.",
  tester_not_in_room: "The selected tester is not in this room.",
  tester_only_start: "Only the assigned tester can start the test.",
  game_not_ready: "The game is not ready to start.",
  guess_required: "At least one player must lock a guess first.",
  tester_only_result: "Only the assigned tester can submit the result.",
  test_not_in_progress: "There is no test in progress.",
  invalid_ping: "Enter a valid ping.",
  tester_or_host_only_abort: "Only the tester or host can stop the test.",
  host_only_next: "Only the host can advance the round.",
  round_result_required: "The current round has no result yet.",
  host_only_new_game: "Only the host can start a new game.",
  test_must_finish_before_new_game:
    "Wait for the test to finish before starting a new game.",
  unknown_action: "Unknown action.",
  room_ended: "This room has ended.",
  too_many_messages: "Too many messages. Please slow down.",
  text_messages_required: "Text messages are required.",
  invalid_json_message: "Invalid JSON message.",
  invalid_message: "Invalid message.",
  connection_already_identified: "This connection is already identified.",
  valid_hello_required: "A valid hello message is required first.",
  tester_only_progress: "Only the assigned tester can share test progress.",
  not_found: "Not found.",
  invalid_room_code: "Invalid room code.",
  websocket_upgrade_required: "WebSocket upgrade required.",
  room_not_found: "Room not found.",
  room_code_exists: "Room code already exists.",
  invalid_initialization: "Invalid initialization.",
  could_not_create_room: "Could not create a room.",
  no_room_code_available: "Could not find an available room code.",
};

export interface RoomPlayer extends Player {
  owner: string;
}

export interface Room {
  code: string;
  hostToken: string;
  testerId: string | null;
  game: Omit<GameState, "players" | "view"> & { players: RoomPlayer[] };
  updatedAt: number;
}

export type ClientAction =
  | { type: "join"; name: string; emoji: string; role: RoleId }
  | { type: "edit"; id: string; name: string; emoji: string; role: RoleId }
  | { type: "guess"; id: string; down: number; up: number }
  | { type: "unlock"; id: string }
  | { type: "remove"; id: string }
  | { type: "settings"; rounds: GameSettings["rounds"]; tieMode: TieMode }
  | { type: "setTester"; id: string | null }
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
  canRunTest: boolean;
  players: (Player & { mine: boolean })[];
  settings: Pick<GameSettings, "rounds" | "tieMode">;
  view: GameState["view"];
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

export function createRoom(code: string, hostToken: string, now: number): Room {
  const normalized = normalizeRoomCode(code);
  if (!normalized) throw new Error("Invalid room code");
  return {
    code: normalized,
    hostToken,
    testerId: null,
    game: {
      players: [],
      settings: {
        rounds: 3,
        tieMode: "share",
        themeMode: "auto",
        sound: true,
      },
      round: 1,
      history: [],
      phase: "guessing",
    },
    updatedAt: now,
  };
}

export function applyAction(
  room: Room,
  clientId: string,
  isHost: boolean,
  action: unknown,
  now: number,
): { room: Room } | { error: RoomErrorCode } {
  if (!isRecord(action) || typeof action.type !== "string")
    return { error: "invalid_action" };

  const game = toGameState(room.game);
  switch (action.type) {
    case "join": {
      const name = validName(action.name);
      const emoji = shortString(action.emoji);
      const role =
        typeof action.role === "string" ? normalizeRoleId(action.role) : null;
      if (name === null || emoji === null || role === null)
        return { error: "name_required" };
      if (game.phase === "testing") return { error: "join_during_test" };
      if (
        !isHost &&
        room.game.players.some((player) => player.owner === clientId)
      )
        return { error: "device_already_joined" };
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
      if (player.owner !== clientId) return { error: "edit_own_player_only" };
      if (game.phase === "testing") return { error: "edit_during_test" };
      const name = validName(action.name);
      const emoji = shortString(action.emoji);
      const role =
        typeof action.role === "string" ? normalizeRoleId(action.role) : null;
      if (name === null || emoji === null || role === null)
        return { error: "name_required" };
      return updateRoomGame(
        room,
        updatePlayer(game, player.id, { name, emoji, role }),
        now,
      );
    }
    case "guess": {
      const player = findPlayer(room, action.id);
      if (!player) return { error: "player_not_found" };
      if (player.owner !== clientId) return { error: "guess_own_player_only" };
      if (game.phase !== "guessing") return { error: "guesses_closed" };
      if (!validSpeed(action.down) || !validSpeed(action.up))
        return { error: "invalid_speed" };
      return updateRoomGame(
        room,
        lockGuess(game, player.id, {
          down: action.down,
          up: action.up,
        }),
        now,
      );
    }
    case "unlock": {
      const player = findPlayer(room, action.id);
      if (!player) return { error: "player_not_found" };
      if (player.owner !== clientId) return { error: "unlock_own_player_only" };
      if (game.phase !== "guessing") return { error: "guesses_closed" };
      return updateRoomGame(room, unlockGuess(game, player.id), now);
    }
    case "remove": {
      const player = findPlayer(room, action.id);
      if (!player) return { error: "player_not_found" };
      if (!isHost && player.owner !== clientId)
        return { error: "remove_own_player_only" };
      if (game.phase === "testing") return { error: "remove_during_test" };
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
      if (!isHost) return { error: "host_only_settings" };
      if (!validRounds(action.rounds) || !validTieMode(action.tieMode))
        return { error: "invalid_game_settings" };
      if (game.phase === "testing") return { error: "settings_during_test" };
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
      if (!isHost) return { error: "host_only_tester" };
      if (game.phase === "testing") return { error: "tester_during_test" };
      if (
        action.id !== null &&
        !room.game.players.some((player) => player.id === action.id)
      )
        return { error: "tester_not_in_room" };
      return {
        room: {
          ...room,
          testerId: action.id as string | null,
          updatedAt: now,
        },
      };
    }
    case "start": {
      if (!canRunTest(room, clientId, isHost))
        return { error: "tester_only_start" };
      if (game.phase !== "guessing") return { error: "game_not_ready" };
      if (!game.players.some((player) => player.locked))
        return { error: "guess_required" };
      return updateRoomGame(room, { ...game, phase: "testing" }, now);
    }
    case "result": {
      if (!canRunTest(room, clientId, isHost))
        return { error: "tester_only_result" };
      if (game.phase !== "testing") return { error: "test_not_in_progress" };
      if (!validSpeed(action.down) || !validSpeed(action.up))
        return { error: "invalid_speed" };
      if (action.ping !== undefined && !validSpeed(action.ping))
        return { error: "invalid_ping" };
      const result = applyResult(game, {
        down: action.down,
        up: action.up,
        ...(action.ping === undefined ? {} : { ping: action.ping }),
      });
      return updateRoomGame(room, result.state, now);
    }
    case "abort": {
      if (!canRunTest(room, clientId, isHost) && !isHost)
        return { error: "tester_or_host_only_abort" };
      if (game.phase !== "testing") return { error: "test_not_in_progress" };
      return updateRoomGame(room, { ...game, phase: "guessing" }, now);
    }
    case "next": {
      if (!isHost) return { error: "host_only_next" };
      if (game.phase !== "results") return { error: "round_result_required" };
      return updateRoomGame(room, nextRound(game), now);
    }
    case "newGame": {
      if (!isHost) return { error: "host_only_new_game" };
      if (game.phase === "testing")
        return { error: "test_must_finish_before_new_game" };
      return updateRoomGame(room, newGame(game), now);
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
    canRunTest: canRunTest(room, clientId, isHost),
    players: room.game.players.map(({ owner, ...player }) => ({
      ...player,
      guess:
        reveal || owner === clientId
          ? { ...player.guess }
          : { down: null, up: null },
      mine: owner === clientId,
    })),
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
    players: game.players.map(({ owner: _owner, ...player }) => ({
      ...player,
      guess: { ...player.guess },
    })),
    settings: { ...game.settings },
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
        players: game.players.map((player) => ({
          ...player,
          owner: owners.get(player.id) ?? "",
        })),
        settings: { ...game.settings },
        round: game.round,
        history: game.history,
        phase: game.phase,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name.length > 0 && name.length <= 16 ? name : null;
}

function shortString(value: unknown): string | null {
  return typeof value === "string" && value.length <= 16 ? value : null;
}

function validSpeed(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100_000
  );
}

function validRounds(value: unknown): value is GameSettings["rounds"] {
  return value === "endless" || [1, 3, 5, 7, 10].includes(value as number);
}

function validTieMode(value: unknown): value is TieMode {
  return value === "share" || value === "download";
}
