import { describe, expect, it } from "vitest";
import {
  addPlayer,
  applyResult,
  initialGameState,
  loadGame,
  lockGuess,
  newGame,
  nextRound,
  saveGame,
  type GameState,
  type StorageLike,
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

describe("game state", () => {
  it("adds players with a 16-character name limit and starts with an empty roster", () => {
    const state = addPlayer(
      initialGameState(),
      "A very long player name",
      "👦",
      "Brother",
      "p1",
    );
    expect(state.players[0].name).toBe("A very long play");
    expect(initialGameState().players).toEqual([]);
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
    expect(loadGame(memoryStorage("{bad json")).players).toEqual([]);
  });
});
