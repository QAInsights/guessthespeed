import { describe, expect, it } from "vitest";
import {
  addPlayer,
  applyResult,
  DEFAULT_PLAYERS,
  initialGameState,
  loadGame,
  lockGuess,
  newGame,
  nextRound,
  pendingGuessers,
  saveGame,
  startAnywayMessage,
  type GameState,
  type StorageLike,
  updatePlayer,
} from "./game";

function memoryStorage(
  initial: string | null = null,
): StorageLike & { value: string | null } {
  return {
    value: initial,
    getItem() {
      return this.value;
    },
    setItem(_key, value) {
      this.value = value;
    },
  };
}

function playersWithLocks(names: string[], lockedNames: string[]) {
  const defaults = initialGameState().players;
  return names.map((name, index) => ({
    ...defaults[index % defaults.length],
    id: `p-${index}`,
    name,
    locked: lockedNames.includes(name),
  }));
}

describe("start confirmation helpers", () => {
  it("returns pending players in their original order", () => {
    const players = playersWithLocks(["Mom", "Dad", "Big Sis"], ["Mom"]);

    expect(pendingGuessers(players)).toEqual([players[1], players[2]]);
  });

  it("uses singular grammar for one pending player", () => {
    const players = playersWithLocks(
      ["Mom", "Dad", "Big Sis", "Little One"],
      ["Mom", "Big Sis", "Little One"],
    );

    expect(startAnywayMessage(players)).toBe("1 of 4 hasn't guessed yet: Dad.");
  });

  it("joins two pending player names with and", () => {
    const players = playersWithLocks(
      ["Mom", "Dad", "Big Sis", "Little One"],
      ["Mom", "Big Sis"],
    );

    expect(startAnywayMessage(players)).toBe(
      "2 of 4 haven't guessed yet: Dad and Little One.",
    );
  });

  it("joins three pending player names in order", () => {
    const players = playersWithLocks(
      ["Mom", "Dad", "Big Sis", "Little One", "Cousin"],
      ["Big Sis", "Cousin"],
    );

    expect(startAnywayMessage(players)).toBe(
      "3 of 5 haven't guessed yet: Mom, Dad and Little One.",
    );
  });

  it("lists the first three names and the remaining count", () => {
    const players = playersWithLocks(
      ["A", "B", "C", "D", "E", "F", "G", "H"],
      ["G", "H"],
    );

    expect(startAnywayMessage(players)).toBe(
      "6 of 8 haven't guessed yet: A, B, C and 3 more.",
    );
  });

  it("returns null when nobody is pending", () => {
    const players = playersWithLocks(
      ["Mom", "Dad", "Big Sis", "Little One"],
      ["Mom", "Dad", "Big Sis", "Little One"],
    );

    expect(startAnywayMessage(players)).toBeNull();
  });

  it("returns null when nobody is locked", () => {
    const players = playersWithLocks(
      ["Mom", "Dad", "Big Sis", "Little One"],
      [],
    );

    expect(startAnywayMessage(players)).toBeNull();
  });
});

describe("game state", () => {
  it("starts with a fresh unlocked default family and adds players with a 16-character name limit", () => {
    const first = initialGameState();
    const second = initialGameState();
    expect(first.players).toEqual(
      DEFAULT_PLAYERS.map((player) => ({
        ...player,
        score: 0,
        guess: { down: null, up: null },
        locked: false,
      })),
    );
    expect(first.players.map((player) => player.name)).toEqual([
      "Mom",
      "Dad",
      "Big Sis",
      "Little One",
    ]);
    expect(first.players).not.toBe(second.players);
    expect(first.players[0]).not.toBe(second.players[0]);
    expect(first.players[0].guess).not.toBe(second.players[0].guess);
    expect(addPlayer(first, "Another Mom", "👩", "Mom", "p-mom")).toBe(first);

    const state = addPlayer(
      first,
      "A very long player name",
      "👦",
      "Brother",
      "p1",
    );
    expect(state.players.find((player) => player.id === "p1")?.name).toBe(
      "A very long play",
    );
  });

  it("loads defaults only when storage has no valid state", () => {
    expect(loadGame(memoryStorage()).players).toHaveLength(4);
    const intentionallyEmpty = {
      ...initialGameState(),
      players: [],
    };
    expect(
      loadGame(memoryStorage(JSON.stringify(intentionallyEmpty))).players,
    ).toEqual([]);
    expect(loadGame(memoryStorage("{bad json")).players).toHaveLength(4);
  });

  it("defaults confetti on for old or invalid saved settings", () => {
    const saved = initialGameState();
    const legacySettings = { ...saved.settings };
    delete (legacySettings as Partial<typeof saved.settings>).confetti;
    const legacySave = { ...saved, settings: legacySettings };
    const invalidSave = {
      ...saved,
      settings: { ...saved.settings, confetti: "off" },
    };
    const disabledSave = {
      ...saved,
      settings: { ...saved.settings, confetti: false },
    };

    expect(
      loadGame(memoryStorage(JSON.stringify(legacySave))).settings.confetti,
    ).toBe(true);
    expect(
      loadGame(memoryStorage(JSON.stringify(invalidSave))).settings.confetti,
    ).toBe(true);
    expect(
      loadGame(memoryStorage(JSON.stringify(disabledSave))).settings.confetti,
    ).toBe(false);
  });

  it("preserves saved names when the default family names change", () => {
    const saved = initialGameState();
    saved.players[2].name = "Priya";
    saved.players[3].name = "Little Sis";

    const loaded = loadGame(memoryStorage(JSON.stringify(saved)));

    expect(loaded.players.map((player) => player.name)).toEqual([
      "Mom",
      "Dad",
      "Priya",
      "Little Sis",
    ]);
  });
  it("updates a player while preserving score, lock, and guess", () => {
    const state = initialGameState();
    state.players[0].score = 5;
    state.players[0].guess = { down: 42, up: 8 };
    state.players[0].locked = true;

    const updated = updatePlayer(state, "p-mom", {
      name: "  Alex  ",
      emoji: "🧑",
      role: "Friend",
    });

    expect(updated.players[0]).toEqual({
      id: "p-mom",
      name: "Alex",
      emoji: "🧑",
      role: "Friend",
      score: 5,
      guess: { down: 42, up: 8 },
      locked: true,
    });
    expect(updated.players[1]).toBe(state.players[1]);
  });

  it("trims and limits updated names, and ignores invalid edits", () => {
    const state = initialGameState();
    const limited = updatePlayer(state, "p-dad", {
      name: "  A very long player name  ",
      emoji: "👨",
      role: "Dad",
    });
    expect(limited.players[1].name).toBe("A very long play");
    expect(
      updatePlayer(state, "p-dad", {
        name: "   ",
        emoji: "👩",
        role: "Mom",
      }),
    ).toBe(state);
    expect(
      updatePlayer(state, "missing", {
        name: "Alex",
        emoji: "🧑",
        role: "Friend",
      }),
    ).toBe(state);
  });

  it("scores locked players and stores the round in history", () => {
    let state = initialGameState();
    state = addPlayer(state, "Ada", "🧑", "Friend", "p1");
    state = lockGuess(state, "p1", { down: 100, up: 20 });
    const result = applyResult(state, { down: 100, up: 20, ping: 7.3 });
    expect(result.scores[0].total).toBe(5);
    expect(result.state.history).toHaveLength(1);
    expect(result.state.history[0].actual.ping).toBe(7.3);
    expect(result.state.phase).toBe("results");
    const storage = memoryStorage();
    saveGame(result.state, storage);
    expect(loadGame(storage).history[0].actual.ping).toBe(7.3);
  });

  it("starts a new round or moves to the champion phase", () => {
    let state: GameState = { ...initialGameState(), phase: "results" };
    state = nextRound(state);
    expect(state.round).toBe(2);
    state = { ...state, round: 3, phase: "results" };
    expect(nextRound(state).phase).toBe("champion");
  });

  it("keeps players while resetting game totals and history", () => {
    const state = {
      ...initialGameState(),
      players: [
        {
          id: "p1",
          name: "Ada",
          emoji: "🧑",
          role: "Friend",
          score: 7,
          guess: { down: 10, up: 5 },
          locked: true,
        },
      ],
      round: 2,
      history: [{ round: 1, actual: { down: 10, up: 5 }, scores: [] }],
    };
    expect(newGame(state)).toMatchObject({
      round: 1,
      history: [],
      phase: "guessing",
      players: [{ score: 0, locked: false, guess: { down: null, up: null } }],
    });
  });

  it("saves and loads state and safely falls back after corrupt JSON", () => {
    const storage = memoryStorage();
    saveGame(initialGameState(), storage);
    expect(loadGame(storage)).toEqual(initialGameState());
    expect(loadGame(memoryStorage("{bad json")).players).toHaveLength(4);
  });
});
