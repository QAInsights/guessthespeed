import { describe, expect, it } from "vitest";
import { applyResult, initialGameState, type GameState } from "./game";
import { MAX_SPEED_MBPS } from "./limits";
import {
  applyAction,
  canRunTest,
  createRoom,
  generateRoomCode,
  interruptedTestStep,
  MAX_PLAYERS,
  normalizeRoomCode,
  parseTransferHostAction,
  ROOM_ALPHABET,
  ROOM_CODE_LENGTH,
  ROOM_HISTORY_MAX,
  transferHost,
  viewFor,
  type Room,
  type RoomPlayer,
} from "./room";

const hostId = "host-client";
const firstId = "player-one";
const secondId = "player-two";

describe("interruptedTestStep", () => {
  it("resends a pending result after the test run stops", () => {
    expect(
      interruptedTestStep({
        phase: "testing",
        canRunTest: true,
        runInProgress: false,
        recoveryRequested: true,
        hasPendingResult: true,
      }),
    ).toEqual({ action: "resend", recoveryRequested: true });
  });

  it("aborts once when an interrupted test has no pending result", () => {
    expect(
      interruptedTestStep({
        phase: "testing",
        canRunTest: true,
        runInProgress: false,
        recoveryRequested: false,
        hasPendingResult: false,
      }),
    ).toEqual({ action: "abort", recoveryRequested: true });
    expect(
      interruptedTestStep({
        phase: "testing",
        canRunTest: true,
        runInProgress: true,
        recoveryRequested: false,
        hasPendingResult: false,
      }),
    ).toEqual({ action: "none", recoveryRequested: false });
    expect(
      interruptedTestStep({
        phase: "testing",
        canRunTest: true,
        runInProgress: false,
        recoveryRequested: true,
        hasPendingResult: false,
      }),
    ).toEqual({ action: "none", recoveryRequested: true });
  });

  it("resets recovery after leaving testing so a second interruption can recover", () => {
    const firstInterruption = interruptedTestStep({
      phase: "testing",
      canRunTest: true,
      runInProgress: false,
      recoveryRequested: false,
      hasPendingResult: false,
    });
    const betweenTests = interruptedTestStep({
      phase: "guessing",
      canRunTest: true,
      runInProgress: false,
      recoveryRequested: firstInterruption.recoveryRequested,
      hasPendingResult: false,
    });
    expect(betweenTests).toEqual({
      action: "none",
      recoveryRequested: false,
    });
    expect(
      interruptedTestStep({
        phase: "testing",
        canRunTest: true,
        runInProgress: false,
        recoveryRequested: betweenTests.recoveryRequested,
        hasPendingResult: false,
      }),
    ).toEqual({ action: "abort", recoveryRequested: true });
  });

  it.each([false, true])(
    "does not recover a test assigned to another device with recovery latch %s",
    (recoveryRequested) => {
      expect(
        interruptedTestStep({
          phase: "testing",
          canRunTest: false,
          runInProgress: false,
          recoveryRequested,
          hasPendingResult: false,
        }),
      ).toEqual({ action: "none", recoveryRequested });
    },
  );

  it("does not recover while the assigned tester is still running", () => {
    expect(
      interruptedTestStep({
        phase: "testing",
        canRunTest: true,
        runInProgress: true,
        recoveryRequested: false,
        hasPendingResult: false,
      }),
    ).toEqual({ action: "none", recoveryRequested: false });
  });
});

function addPlayer(
  room: Room,
  clientId: string,
  isHost: boolean,
  name: string,
  now = room.updatedAt + 1,
): Room {
  const result = applyAction(
    room,
    clientId,
    isHost,
    { type: "join", name, emoji: "🧑", role: "Friend" },
    now,
  );
  if ("error" in result) throw new Error(result.error);
  return result.room;
}

function act(
  room: Room,
  clientId: string,
  isHost: boolean,
  action: unknown,
  now = room.updatedAt + 1,
): Room {
  const result = applyAction(room, clientId, isHost, action, now);
  if ("error" in result) throw new Error(result.error);
  return result.room;
}

function joinedRoom(): Room {
  let room = createRoom("BCDFGH", "secret-host-token", 100);
  room = addPlayer(room, hostId, true, "Host");
  room = addPlayer(room, firstId, false, "First");
  room = addPlayer(room, secondId, false, "Second");
  return room;
}

function roomWithResultsAndTester(): Room {
  let room = joinedRoom();
  const tester = playerByOwner(room, firstId);
  room = withGuess(room, firstId, 50, 15);
  room = act(room, hostId, true, {
    type: "setTester",
    id: tester.id,
  });
  room = act(room, firstId, false, { type: "start" });
  return act(room, firstId, false, {
    type: "result",
    down: 100,
    up: 20,
    ping: 8,
  });
}

function playerByOwner(room: Room, owner: string): RoomPlayer {
  const player = room.game.players.find(
    (candidate) => candidate.owner === owner,
  );
  if (!player) throw new Error(`No player owned by ${owner}`);
  return player;
}

describe("host transfer", () => {
  const options = {
    isHost: true,
    clientId: hostId,
    playerId: "missing-player",
    newHostToken: "new-host-token",
    now: 900,
  };

  it("parses transferHost actions only when the target id is a string", () => {
    expect(
      parseTransferHostAction({ type: "transferHost", id: "phone-player" }),
    ).toEqual({ type: "transferHost", id: "phone-player" });
    expect(
      parseTransferHostAction({ type: "transferHost", id: 42 }),
    ).toBeNull();
    expect(parseTransferHostAction({ type: "transferHost" })).toBeNull();
    expect(parseTransferHostAction({ type: "start" })).toBeNull();
    expect(parseTransferHostAction(null)).toBeNull();
  });

  it("checks the host, phase, target, and device in the specified order", () => {
    const room = joinedRoom();
    const testingRoom = {
      ...room,
      game: { ...room.game, phase: "testing" as const },
    };

    expect(
      transferHost(testingRoom, {
        ...options,
        isHost: false,
      }),
    ).toEqual({
      ok: false,
      error: "Only the host can hand over host.",
    });
    expect(
      transferHost(testingRoom, {
        ...options,
        playerId: "missing-player",
      }),
    ).toEqual({
      ok: false,
      error: "Wait for the test to finish before handing over host.",
    });
    expect(transferHost(room, options)).toEqual({
      ok: false,
      error: "That player has left the room.",
    });
    expect(
      transferHost(room, {
        ...options,
        playerId: playerByOwner(room, hostId).id,
      }),
    ).toEqual({
      ok: false,
      error: "Pick a player on another device.",
    });
  });

  it("changes only the host token and timestamp while preserving game state", () => {
    const room = roomWithResultsAndTester();
    const target = playerByOwner(room, firstId);
    const result = transferHost(room, {
      ...options,
      playerId: target.id,
    });

    expect(result).toMatchObject({
      ok: true,
      newHostClientId: firstId,
      room: {
        hostToken: "new-host-token",
        updatedAt: 900,
        testerId: target.id,
      },
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.room.game).toEqual(room.game);
    expect(result.room.game.players).toEqual(room.game.players);
    expect(result.room.game.history).toEqual(room.game.history);
    expect(result.room.game.settings).toEqual(room.game.settings);
    expect(result.room.game.phase).toBe(room.game.phase);
    expect(room.hostToken).toBe("secret-host-token");
    expect(room.updatedAt).not.toBe(result.room.updatedAt);
  });

  it("keeps a null tester assignment null", () => {
    const room = joinedRoom();
    const result = transferHost(room, {
      ...options,
      playerId: playerByOwner(room, firstId).id,
    });

    expect(result).toMatchObject({
      ok: true,
      room: { testerId: null },
    });
  });

  it("does not let applyAction handle a transfer action", () => {
    const room = joinedRoom();
    expect(
      applyAction(
        room,
        hostId,
        true,
        {
          type: "transferHost",
          id: playerByOwner(room, firstId).id,
        },
        900,
      ),
    ).toEqual({ error: "Unknown action." });
  });
});

function withGuess(room: Room, clientId: string, down: number, up: number) {
  const player = playerByOwner(room, clientId);
  return act(room, clientId, false, {
    type: "guess",
    id: player.id,
    down,
    up,
  });
}

describe("room codes", () => {
  it("normalizes spaces and dashes and rejects invalid codes", () => {
    expect(normalizeRoomCode(" bcdf-gh ")).toBe("BCDFGH");
    expect(normalizeRoomCode("BCDFGH")).toBe("BCDFGH");
    expect(normalizeRoomCode("BCDFG")).toBeNull();
    expect(normalizeRoomCode("BCDFGHA")).toBeNull();
    expect(normalizeRoomCode("ABCDEF")).toBeNull();
    expect(normalizeRoomCode("BCDF!H")).toBeNull();
  });

  it("generates codes with the required alphabet and length", () => {
    const code = generateRoomCode(() => 0.5);
    expect(code).toHaveLength(ROOM_CODE_LENGTH);
    expect([...code].every((letter) => ROOM_ALPHABET.includes(letter))).toBe(
      true,
    );
  });

  it("creates a room with the expected defaults and private credentials", () => {
    const room = createRoom("bcdfgh", "secret-host-token", 42);
    expect(room).toMatchObject({
      code: "BCDFGH",
      hostToken: "secret-host-token",
      testerId: null,
      updatedAt: 42,
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
    });
    const view = viewFor(room, hostId, true);
    expect(room.game.settings).toEqual({ rounds: 3, tieMode: "share" });
    expect(view.settings).toEqual({ rounds: 3, tieMode: "share" });
    expect(JSON.stringify(view)).not.toContain("secret-host-token");
    expect(JSON.stringify(view)).not.toContain("owner");
  });
});

describe("room actions and views", () => {
  it("accepts the maximum speed and rejects values above the shared limit", () => {
    const room = joinedRoom();
    const player = playerByOwner(room, firstId);
    const accepted = applyAction(
      room,
      firstId,
      false,
      {
        type: "guess",
        id: player.id,
        down: MAX_SPEED_MBPS,
        up: 0,
      },
      room.updatedAt + 1,
    );
    const rejected = applyAction(
      room,
      firstId,
      false,
      {
        type: "guess",
        id: player.id,
        down: MAX_SPEED_MBPS + 1,
        up: 0,
      },
      room.updatedAt + 1,
    );

    expect(accepted).not.toHaveProperty("error");
    expect(rejected).toEqual({
      error: `Enter speeds between 0 and ${MAX_SPEED_MBPS} Mbps.`,
    });
  });

  it("hides other players' guesses from players and the host while guessing and testing, then reveals them", () => {
    let room = joinedRoom();
    room = withGuess(room, hostId, 101, 21);
    room = withGuess(room, firstId, 102, 22);
    room = withGuess(room, secondId, 103, 23);
    const hostPlayer = playerByOwner(room, hostId);
    const firstPlayer = playerByOwner(room, firstId);

    const hostGuessing = viewFor(room, hostId, true);
    expect(
      hostGuessing.players.find((p) => p.id === hostPlayer.id)?.guess,
    ).toEqual({
      down: 101,
      up: 21,
    });
    expect(
      hostGuessing.players.find((p) => p.id === firstPlayer.id)?.guess,
    ).toEqual({
      down: null,
      up: null,
    });
    expect(
      hostGuessing.players.find((p) => p.id === firstPlayer.id)?.locked,
    ).toBe(true);

    const firstGuessing = viewFor(room, firstId, false);
    expect(
      firstGuessing.players.find((p) => p.id === firstPlayer.id)?.guess,
    ).toEqual({
      down: 102,
      up: 22,
    });
    expect(
      firstGuessing.players.find((p) => p.id === hostPlayer.id)?.guess,
    ).toEqual({
      down: null,
      up: null,
    });

    room = act(room, hostId, true, { type: "start" });
    expect(viewFor(room, firstId, false).players[0].guess).toEqual({
      down: null,
      up: null,
    });
    room = act(room, hostId, true, {
      type: "result",
      down: 100,
      up: 20,
      ping: 8,
    });
    expect(
      viewFor(room, firstId, false).players.find((p) => p.id === hostPlayer.id)
        ?.guess,
    ).toEqual({
      down: 101,
      up: 21,
    });
    expect(
      viewFor(room, firstId, false).players.find((p) => p.id === firstPlayer.id)
        ?.guess,
    ).toEqual({
      down: 102,
      up: 22,
    });
  });

  it("lets an owner edit, guess, unlock, and remove only their player", () => {
    let room = joinedRoom();
    const own = playerByOwner(room, firstId);
    const other = playerByOwner(room, secondId);
    room = act(room, firstId, false, {
      type: "edit",
      id: own.id,
      name: "  Renamed  ",
      emoji: "🐱",
      role: "Cat",
    });
    expect(playerByOwner(room, firstId)).toMatchObject({
      name: "Renamed",
      emoji: "🐱",
      role: "Cat",
    });
    expect(
      applyAction(
        room,
        firstId,
        false,
        {
          type: "edit",
          id: other.id,
          name: "Nope",
          emoji: "🧑",
          role: "Friend",
        },
        500,
      ),
    ).toEqual({ error: "You can only edit your own player." });
    room = withGuess(room, firstId, 12, 4);
    expect(playerByOwner(room, firstId).locked).toBe(true);
    room = act(room, firstId, false, { type: "unlock", id: own.id });
    expect(playerByOwner(room, firstId).locked).toBe(false);
    expect(
      applyAction(room, firstId, false, { type: "remove", id: other.id }, 600),
    ).toEqual({ error: "You can only remove your own player." });
    room = act(room, firstId, false, { type: "remove", id: own.id });
    expect(room.game.players.some((player) => player.id === own.id)).toBe(
      false,
    );
  });

  it("restricts settings, start, result, abort, next, and new game to the host", () => {
    const room = joinedRoom();
    for (const action of [
      { type: "settings", rounds: 5, tieMode: "download" },
      { type: "start" },
      { type: "result", down: 100, up: 20 },
      { type: "abort" },
      { type: "next" },
      { type: "newGame" },
    ]) {
      expect(applyAction(room, firstId, false, action, 600)).toHaveProperty(
        "error",
      );
    }
    const hostRemoved = act(room, hostId, true, {
      type: "remove",
      id: playerByOwner(room, firstId).id,
    });
    expect(hostRemoved.game.players).toHaveLength(room.game.players.length - 1);
  });

  it("assigns and clears a tester only when the host can change room settings", () => {
    let room = joinedRoom();
    const tester = playerByOwner(room, firstId);
    expect(
      applyAction(
        room,
        firstId,
        false,
        { type: "setTester", id: tester.id },
        600,
      ),
    ).toEqual({ error: "Only the host can choose the tester." });
    expect(
      applyAction(
        room,
        hostId,
        true,
        { type: "setTester", id: "missing-player" },
        600,
      ),
    ).toEqual({ error: "The selected tester is not in this room." });

    room = act(room, hostId, true, { type: "setTester", id: tester.id });
    expect(room.testerId).toBe(tester.id);
    room = act(room, hostId, true, { type: "setTester", id: null });
    expect(room.testerId).toBeNull();

    room = withGuess(room, firstId, 40, 12);
    room = act(room, hostId, true, { type: "setTester", id: tester.id });
    room = act(room, firstId, false, { type: "start" });
    expect(
      applyAction(room, hostId, true, { type: "setTester", id: null }, 700),
    ).toEqual({ error: "The tester cannot change during a test." });
  });

  it("lets only the assigned player run a test while keeping a host abort safety net", () => {
    let room = joinedRoom();
    const tester = playerByOwner(room, firstId);
    room = withGuess(room, firstId, 100, 20);
    room = act(room, hostId, true, { type: "setTester", id: tester.id });

    expect(applyAction(room, hostId, true, { type: "start" }, 700)).toEqual({
      error: "Only the assigned tester can start the test.",
    });
    expect(
      applyAction(room, secondId, false, { type: "start" }, 700),
    ).toHaveProperty("error");

    room = act(room, firstId, false, { type: "start" });
    expect(room.game.phase).toBe("testing");
    expect(
      applyAction(
        room,
        secondId,
        false,
        { type: "result", down: 100, up: 20 },
        800,
      ),
    ).toHaveProperty("error");
    expect(
      applyAction(room, secondId, false, { type: "abort" }, 800),
    ).toHaveProperty("error");

    const hostAbort = applyAction(room, hostId, true, { type: "abort" }, 800);
    expect("room" in hostAbort && hostAbort.room.game.phase).toBe("guessing");
    expect(
      applyAction(
        room,
        hostId,
        true,
        { type: "result", down: 100, up: 20 },
        800,
      ),
    ).toHaveProperty("error");

    room = act(room, firstId, false, { type: "abort" });
    expect(room.game.phase).toBe("guessing");
    room = act(room, firstId, false, { type: "start" });
    room = act(room, firstId, false, {
      type: "result",
      down: 100,
      up: 20,
    });
    expect(room.game.phase).toBe("results");
  });

  it("reports tester permissions to each room view and treats missing stored values as host testing", () => {
    let room = joinedRoom();
    const tester = playerByOwner(room, firstId);

    expect(canRunTest(room, hostId, true)).toBe(true);
    expect(canRunTest(room, firstId, false)).toBe(false);
    expect(viewFor(room, hostId, true)).toMatchObject({
      testerId: null,
      canRunTest: true,
    });

    room = act(room, hostId, true, { type: "setTester", id: tester.id });
    expect(canRunTest(room, hostId, true)).toBe(false);
    expect(canRunTest(room, firstId, false)).toBe(true);
    expect(canRunTest(room, secondId, false)).toBe(false);
    expect(viewFor(room, hostId, true)).toMatchObject({
      testerId: tester.id,
      canRunTest: false,
    });
    expect(viewFor(room, firstId, false)).toMatchObject({
      testerId: tester.id,
      canRunTest: true,
    });
    expect(viewFor(room, secondId, false)).toMatchObject({
      testerId: tester.id,
      canRunTest: false,
    });

    const legacyRoom = { ...room };
    Reflect.deleteProperty(legacyRoom, "testerId");
    expect(canRunTest(legacyRoom, hostId, true)).toBe(true);
    expect(canRunTest(legacyRoom, firstId, false)).toBe(false);
    expect(viewFor(legacyRoom, hostId, true)).toMatchObject({
      testerId: null,
      canRunTest: true,
    });
  });

  it("resets tester assignment when the tester's player is removed", () => {
    let room = joinedRoom();
    const tester = playerByOwner(room, firstId);
    room = act(room, hostId, true, { type: "setTester", id: tester.id });
    room = act(room, firstId, false, { type: "remove", id: tester.id });
    expect(room.testerId).toBeNull();
    expect(canRunTest(room, hostId, true)).toBe(true);
  });

  it("limits non-hosts to one player and all rooms to twelve players", () => {
    let room = createRoom("BCDFGH", "token", 0);
    room = addPlayer(room, firstId, false, "First");
    expect(
      applyAction(
        room,
        firstId,
        false,
        { type: "join", name: "Extra", emoji: "🧑", role: "Friend" },
        2,
      ),
    ).toEqual({ error: "This device already has a player in the room." });

    for (let index = 1; index < MAX_PLAYERS; index += 1) {
      room = addPlayer(room, `host-${index}`, true, `Host ${index}`);
    }
    expect(room.game.players).toHaveLength(MAX_PLAYERS);
    expect(
      applyAction(
        room,
        "another-host",
        true,
        { type: "join", name: "Too many", emoji: "🧑", role: "Friend" },
        100,
      ),
    ).toEqual({ error: `A room can have up to ${MAX_PLAYERS} players.` });
  });

  it("rejects malformed actions, invalid names, oversized labels, unknown IDs, and out-of-range speeds", () => {
    const room = joinedRoom();
    const player = playerByOwner(room, firstId);
    const invalidActions: unknown[] = [
      null,
      { type: "unknown" },
      { type: "join", name: "   ", emoji: "🧑", role: "Friend" },
      { type: "join", name: "a".repeat(17), emoji: "🧑", role: "Friend" },
      { type: "join", name: "Valid", emoji: "🙂".repeat(9), role: "Friend" },
      { type: "join", name: "Valid", emoji: "🧑", role: "r".repeat(17) },
      { type: "guess", id: player.id, down: Number.NaN, up: 1 },
      { type: "guess", id: player.id, down: -1, up: 1 },
      { type: "guess", id: player.id, down: 100_001, up: 1 },
      { type: "guess", id: "missing", down: 1, up: 1 },
    ];
    for (const action of invalidActions) {
      expect(applyAction(room, firstId, false, action, 700)).toHaveProperty(
        "error",
      );
    }
    expect(
      applyAction(
        room,
        firstId,
        false,
        {
          type: "edit",
          id: "missing",
          name: "New",
          emoji: "🧑",
          role: "Friend",
        },
        700,
      ),
    ).toEqual({ error: "Player not found." });
  });

  it("requires a locked guess before the host can start", () => {
    const room = joinedRoom();
    expect(applyAction(room, hostId, true, { type: "start" }, 900)).toEqual({
      error: "At least one player must lock a guess first.",
    });
    const lockedRoom = withGuess(room, firstId, 40, 12);
    expect(act(lockedRoom, hostId, true, { type: "start" }).game.phase).toBe(
      "testing",
    );
  });

  it("does not let the host reset while a speed test is running", () => {
    let room = joinedRoom();
    room = withGuess(room, firstId, 40, 12);
    room = act(room, hostId, true, { type: "start" });
    expect(applyAction(room, hostId, true, { type: "newGame" }, 900)).toEqual({
      error: "Wait for the test to finish before starting a new game.",
    });
  });

  it("uses the existing result scoring, including the 50 percent eligibility cutoff", () => {
    let room = createRoom("BCDFGH", "token", 0);
    room = addPlayer(room, firstId, false, "Accurate");
    room = addPlayer(room, secondId, false, "Too far");
    room = withGuess(room, firstId, 100, 20);
    room = withGuess(room, secondId, 160, 30);
    room = act(room, hostId, true, { type: "start" });

    const expectedState: GameState = {
      ...initialGameState(),
      players: room.game.players.map(({ owner, ...player }) => {
        void owner;
        return player;
      }),
      settings: { ...initialGameState().settings, ...room.game.settings },
      round: room.game.round,
      history: room.game.history,
      phase: room.game.phase,
    };
    const expected = applyResult(expectedState, { down: 100, up: 20, ping: 8 });
    room = act(room, hostId, true, {
      type: "result",
      down: 100,
      up: 20,
      ping: 8,
    });
    expect(room.game.history.at(-1)).toEqual(expected.state.history.at(-1));
    expect(room.game.players.map((player) => player.score)).toEqual(
      expected.state.players.map((player) => player.score),
    );
    expect(
      room.game.history
        .at(-1)
        ?.scores.find((score) => score.id === playerByOwner(room, secondId).id),
    ).toMatchObject({ place: null, placePoints: 0 });
  });

  it("rejects zero-speed results while keeping guesses that contain zero valid", () => {
    let room = createRoom("BCDFGH", "token", 0);
    room = addPlayer(room, hostId, true, "Host");
    room = withGuess(room, hostId, 0, 0);
    room = act(room, hostId, true, { type: "start" });

    expect(
      applyAction(
        room,
        hostId,
        true,
        { type: "result", down: 0, up: 20 },
        room.updatedAt + 1,
      ),
    ).toEqual({ error: "The speed test returned no result." });
    expect(
      applyAction(
        room,
        hostId,
        true,
        { type: "result", down: 20, up: 0 },
        room.updatedAt + 1,
      ),
    ).toEqual({ error: "The speed test returned no result." });
    expect(
      applyAction(
        room,
        hostId,
        true,
        { type: "result", down: -1, up: 20 },
        room.updatedAt + 1,
      ),
    ).toEqual({ error: "The speed test returned no result." });
    expect(
      applyAction(
        room,
        hostId,
        true,
        { type: "result", down: 20, up: -1 },
        room.updatedAt + 1,
      ),
    ).toEqual({ error: "The speed test returned no result." });
    expect(room.game.phase).toBe("testing");
    expect(room.game.players[0].guess).toEqual({ down: 0, up: 0 });
  });

  it("keeps only the latest room history entries in endless mode", () => {
    let room = createRoom("BCDFGH", "token", 0);
    room = addPlayer(room, hostId, true, "Host");
    room = act(room, hostId, true, {
      type: "settings",
      rounds: "endless",
      tieMode: "share",
    });

    for (let round = 1; round <= 60; round += 1) {
      room = withGuess(room, hostId, 100, 20);
      room = act(room, hostId, true, { type: "start" });
      room = act(room, hostId, true, {
        type: "result",
        down: 100,
        up: 20,
      });
      if (round < 60) room = act(room, hostId, true, { type: "next" });
    }

    expect(room.game.history).toHaveLength(ROOM_HISTORY_MAX);
    expect(room.game.history.at(-1)?.round).toBe(60);
  });

  it("advances to champion and starts a new game with the same players", () => {
    let room = createRoom("BCDFGH", "token", 0);
    room = addPlayer(room, firstId, false, "First");
    room = withGuess(room, firstId, 100, 20);
    room = act(room, hostId, true, {
      type: "settings",
      rounds: 1,
      tieMode: "share",
    });
    room = act(room, hostId, true, { type: "start" });
    room = act(room, hostId, true, { type: "result", down: 100, up: 20 });
    room = act(room, hostId, true, { type: "next" });
    expect(room.game.phase).toBe("champion");
    const playerId = room.game.players[0].id;
    room = act(room, hostId, true, { type: "newGame" });
    expect(room.game).toMatchObject({
      round: 1,
      history: [],
      phase: "guessing",
      players: [{ id: playerId, score: 0, locked: false }],
    });
    expect(room.game.players[0].guess).toEqual({ down: null, up: null });
  });
});
