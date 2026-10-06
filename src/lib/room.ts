import {
  addPlayer,
  applyResult,
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
import type { TieMode } from "./scoring";

export const ROOM_ALPHABET = "BCDFGHJKMNPQRSTVWXZ";
export const ROOM_CODE_LENGTH = 6;
export const MAX_PLAYERS = 12;
export const ROOM_TTL_MS = 6 * 60 * 60 * 1000;

export interface RoomPlayer extends Player {
  owner: string;
}

export interface Room {
  code: string;
  hostToken: string;
  game: Omit<GameState, "players" | "view"> & { players: RoomPlayer[] };
  updatedAt: number;
}

export type ClientAction =
  | { type: "join"; name: string; emoji: string; role: string }
  | { type: "edit"; id: string; name: string; emoji: string; role: string }
  | { type: "guess"; id: string; down: number; up: number }
  | { type: "unlock"; id: string }
  | { type: "remove"; id: string }
  | { type: "settings"; rounds: GameSettings["rounds"]; tieMode: TieMode }
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
): { room: Room } | { error: string } {
  if (!isRecord(action) || typeof action.type !== "string")
    return { error: "Invalid action." };

  const game = toGameState(room.game);
  switch (action.type) {
    case "join": {
      const name = validName(action.name);
      const emoji = shortString(action.emoji);
      const role = shortString(action.role);
      if (name === null || emoji === null || role === null)
        return { error: "Enter a name and choose a face." };
      if (game.phase === "testing")
        return { error: "Wait for the test to finish before joining." };
      if (
        !isHost &&
        room.game.players.some((player) => player.owner === clientId)
      )
        return { error: "This device already has a player in the room." };
      if (room.game.players.length >= MAX_PLAYERS)
        return { error: `A room can have up to ${MAX_PLAYERS} players.` };

      let id = createPlayerId();
      while (room.game.players.some((player) => player.id === id))
        id = createPlayerId();
      const nextGame = addPlayer(game, name, emoji, role, id);
      const added = nextGame.players.find((player) => player.id === id);
      if (!added) return { error: "Could not add this player." };
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
      if (!player) return { error: "Player not found." };
      if (player.owner !== clientId)
        return { error: "You can only edit your own player." };
      if (game.phase === "testing")
        return { error: "Players cannot be edited during a test." };
      const name = validName(action.name);
      const emoji = shortString(action.emoji);
      const role = shortString(action.role);
      if (name === null || emoji === null || role === null)
        return { error: "Enter a name and choose a face." };
      return updateRoomGame(
        room,
        updatePlayer(game, player.id, { name, emoji, role }),
        now,
      );
    }
    case "guess": {
      const player = findPlayer(room, action.id);
      if (!player) return { error: "Player not found." };
      if (player.owner !== clientId)
        return { error: "You can only guess for your own player." };
      if (game.phase !== "guessing")
        return { error: "Guesses are closed for this round." };
      if (!validSpeed(action.down) || !validSpeed(action.up))
        return { error: "Enter speeds between 0 and 100000 Mbps." };
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
      if (!player) return { error: "Player not found." };
      if (player.owner !== clientId)
        return { error: "You can only unlock your own player." };
      if (game.phase !== "guessing")
        return { error: "Guesses are closed for this round." };
      return updateRoomGame(room, unlockGuess(game, player.id), now);
    }
    case "remove": {
      const player = findPlayer(room, action.id);
      if (!player) return { error: "Player not found." };
      if (!isHost && player.owner !== clientId)
        return { error: "You can only remove your own player." };
      if (game.phase === "testing")
        return { error: "Players cannot be removed during a test." };
      return updateRoomGame(room, removePlayer(game, player.id), now);
    }
    case "settings": {
      if (!isHost) return { error: "Only the host can change settings." };
      if (!validRounds(action.rounds) || !validTieMode(action.tieMode))
        return { error: "Invalid game settings." };
      if (game.phase === "testing")
        return { error: "Settings cannot change during a test." };
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
    case "start": {
      if (!isHost) return { error: "Only the host can start the test." };
      if (game.phase !== "guessing")
        return { error: "The game is not ready to start." };
      if (!game.players.some((player) => player.locked))
        return { error: "At least one player must lock a guess first." };
      return updateRoomGame(room, { ...game, phase: "testing" }, now);
    }
    case "result": {
      if (!isHost) return { error: "Only the host can submit the result." };
      if (game.phase !== "testing")
        return { error: "There is no test in progress." };
      if (!validSpeed(action.down) || !validSpeed(action.up))
        return { error: "Enter speeds between 0 and 100000 Mbps." };
      if (action.ping !== undefined && !validSpeed(action.ping))
        return { error: "Enter a valid ping." };
      const result = applyResult(game, {
        down: action.down,
        up: action.up,
        ...(action.ping === undefined ? {} : { ping: action.ping }),
      });
      return updateRoomGame(room, result.state, now);
    }
    case "abort": {
      if (!isHost) return { error: "Only the host can stop the test." };
      if (game.phase !== "testing")
        return { error: "There is no test in progress." };
      return updateRoomGame(room, { ...game, phase: "guessing" }, now);
    }
    case "next": {
      if (!isHost) return { error: "Only the host can advance the round." };
      if (game.phase !== "results")
        return { error: "The current round has no result yet." };
      return updateRoomGame(room, nextRound(game), now);
    }
    case "newGame": {
      if (!isHost) return { error: "Only the host can start a new game." };
      if (game.phase === "testing")
        return {
          error: "Wait for the test to finish before starting a new game.",
        };
      return updateRoomGame(room, newGame(game), now);
    }
    default:
      return { error: "Unknown action." };
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
