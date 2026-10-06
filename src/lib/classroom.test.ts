import { describe, expect, it } from "vitest";
import {
  assignFaces,
  BACKUP_KEY,
  CLASSROOM_KEY,
  clearSession,
  exportClassroom,
  importClassroom,
  isClassroomData,
  loadClassroom,
  loadSession,
  makeTeams,
  MAX_CLASSES,
  MAX_STUDENTS,
  mergeClassroom,
  parseRoster,
  pickSpotlight,
  saveClassroom,
  saveSession,
  SESSION_KEY,
  studentsToPlayers,
  STUDENT_FACES,
  TEAM_PRESETS,
  teamsToPlayers,
  type ClassRoom,
  type ClassroomData,
  type Student,
} from "./classroom";
import { initialGameState, loadGame, saveGame, type StorageLike } from "./game";

function memoryStorage(initial: Record<string, string> = {}): StorageLike & {
  values: Map<string, string>;
  removeItem(key: string): void;
} {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

function makeStudents(count: number): Student[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `student-${index}`,
    name: `Student ${index}`,
    emoji: STUDENT_FACES[index % STUDENT_FACES.length],
  }));
}

function makeClassroom(
  students: Student[] = makeStudents(5),
  overrides: Partial<ClassRoom> = {},
): ClassRoom {
  return {
    id: "class-1",
    name: "Year 4 Blue",
    emoji: "🏫",
    students,
    spotlightPlayed: [],
    createdAt: 1_760_000_000_000,
    ...overrides,
  };
}

function makeData(classes: ClassRoom[] = [makeClassroom()]): ClassroomData {
  return { version: 1, classes };
}

describe("classroom roster helpers", () => {
  it("splits separators, strips list markers, collapses spaces, and deduplicates", () => {
    expect(
      parseRoster(
        " 1. Ada   Lovelace \n- Grace\t* KATHERINE; • aDa   Lovelace, 2. Lina",
      ),
    ).toEqual(["Ada Lovelace", "Grace", "KATHERINE", "Lina"]);
  });

  it("deduplicates against the saved roster and caps the combined total", () => {
    const existing = [
      ...Array.from({ length: 38 }, (_, index) => `Student ${index}`),
      "Already Here",
    ];
    expect(
      parseRoster("already here, New student, NEW STUDENT, Last one, Ignored", [
        ...existing,
        "student 0",
      ]),
    ).toEqual(["New student"]);
    expect(
      parseRoster(
        "a,b,c",
        Array.from({ length: MAX_STUDENTS }, (_, i) => `P${i}`),
      ),
    ).toEqual([]);
  });

  it("trims and limits new names to 16 characters", () => {
    expect(parseRoster("  A very long student name  ")).toEqual([
      "A very long stud",
    ]);
  });

  it("assigns student faces in a cycle from the requested offset", () => {
    const students = assignFaces(["Ada", "Grace", "Katherine"], 19);
    expect(students.map(({ emoji }) => emoji)).toEqual([
      STUDENT_FACES[19],
      STUDENT_FACES[0],
      STUDENT_FACES[1],
    ]);
    expect(students.map(({ id }) => id)).toEqual([
      "student-19",
      "student-20",
      "student-21",
    ]);
  });
});

describe("classroom game selection", () => {
  it("makes balanced teams and clamps the team count", () => {
    const teams = makeTeams(makeStudents(7), 3, () => 0.5);
    expect(teams.map(({ members }) => members.length)).toEqual([3, 2, 2]);
    expect(teams.map(({ name, emoji }) => ({ name, emoji }))).toEqual(
      TEAM_PRESETS.slice(0, 3),
    );
    expect(teams.flatMap(({ members }) => members)).toHaveLength(7);
    expect(makeTeams(makeStudents(2), 99, () => 0)).toHaveLength(2);
    expect(makeTeams(makeStudents(1), 4, () => 0)).toEqual([]);
  });

  it("rotates spotlight picks and wraps without duplicates", () => {
    const classroom = makeClassroom(makeStudents(5), {
      spotlightPlayed: ["student-0", "student-1", "student-2"],
    });
    const first = pickSpotlight(classroom, 4, () => 0);
    expect(first.picked).toHaveLength(4);
    expect(new Set(first.picked.map(({ id }) => id)).size).toBe(4);
    expect(first.picked.map(({ id }) => id)).toEqual(
      expect.arrayContaining(["student-3", "student-4"]),
    );

    const second = pickSpotlight(
      { ...classroom, spotlightPlayed: first.spotlightPlayed },
      4,
      () => 0,
    );
    expect(second.picked).toHaveLength(4);
    expect(new Set(second.picked.map(({ id }) => id)).size).toBe(4);
    expect(second.spotlightPlayed).toHaveLength(4);
  });

  it("converts teams and students into valid game players with bounded roles", () => {
    const students = makeStudents(10);
    const teamPlayers = teamsToPlayers([
      {
        ...TEAM_PRESETS[0],
        members: students,
      },
    ]);
    const studentPlayers = studentsToPlayers(
      students.slice(0, 2),
      "A classroom name longer than twenty four characters",
    );
    expect(teamPlayers[0].id).toBe("t-0");
    expect(teamPlayers[0].name).toBe("Rockets");
    expect(teamPlayers[0].role.length).toBeLessThanOrEqual(48);
    expect(teamPlayers[0].role).toMatch(/\+\d+$/u);
    expect(studentPlayers.map(({ id }) => id)).toEqual([
      "s-student-0",
      "s-student-1",
    ]);
    expect(studentPlayers[0].role).toHaveLength(24);
    expect(
      [...teamPlayers, ...studentPlayers].every(
        ({ score, guess, locked }) =>
          score === 0 && guess.down === null && guess.up === null && !locked,
      ),
    ).toBe(true);
  });

  it("produces players accepted by the game's storage validator", () => {
    const teamPlayers = teamsToPlayers(
      makeTeams(makeStudents(7), 3, () => 0.5),
    );
    const spotlightPlayers = studentsToPlayers(makeStudents(4), "Year 4 Blue");
    for (const players of [teamPlayers, spotlightPlayers]) {
      const storage = memoryStorage();
      saveGame({ ...initialGameState(), players }, storage);
      expect(loadGame(storage).players).toEqual(players);
    }
  });
});

describe("classroom storage and backups", () => {
  it("validates, saves, and loads classroom data defensively", () => {
    const storage = memoryStorage();
    const data = makeData();
    expect(isClassroomData(data)).toBe(true);
    saveClassroom(data, storage);
    expect(storage.getItem(CLASSROOM_KEY)).toBe(JSON.stringify(data));
    expect(loadClassroom(storage)).toEqual(data);

    storage.setItem(CLASSROOM_KEY, "{bad json");
    expect(loadClassroom(storage)).toEqual({ version: 1, classes: [] });
    storage.setItem(CLASSROOM_KEY, JSON.stringify({ version: 2, classes: [] }));
    expect(loadClassroom(storage)).toEqual({ version: 1, classes: [] });
    expect(isClassroomData({ version: 1, classes: [{ id: "bad" }] })).toBe(
      false,
    );
  });

  it("saves, loads, and clears a classroom session", () => {
    const storage = memoryStorage();
    const session = {
      classId: "class-1",
      className: "Year 4 Blue",
      mode: "teams" as const,
      startedAt: 1_760_000_000_000,
    };
    saveSession(session, storage);
    expect(loadSession(storage)).toEqual(session);
    expect(storage.getItem(SESSION_KEY)).not.toBeNull();
    clearSession(storage);
    expect(storage.getItem(SESSION_KEY)).toBeNull();
    expect(BACKUP_KEY).toBe("gts:v1:before-class");
    expect(loadSession(memoryStorage({ [SESSION_KEY]: "bad" }))).toBeNull();
  });

  it("exports pretty JSON and validates imported data while sanitizing names", () => {
    const exported = exportClassroom(makeData());
    expect(exported).toContain('\n  "version": 1');
    const imported = importClassroom(
      JSON.stringify({
        version: 1,
        classes: [
          {
            ...makeClassroom([], { name: "  Year   4 Blue  " }),
            students: [
              { id: "a", name: "  Ada   Lovelace ", emoji: "bad-face" },
              { id: "b", name: "ADA LOVELACE", emoji: "🐼" },
            ],
            spotlightPlayed: ["a", "unknown", "a"],
          },
        ],
      }),
    );
    expect(imported?.classes[0]).toMatchObject({
      name: "Year 4 Blue",
      students: [{ id: "a", name: "Ada Lovelace", emoji: STUDENT_FACES[0] }],
      spotlightPlayed: ["a"],
    });
    expect(importClassroom("not json")).toBeNull();
    expect(importClassroom(JSON.stringify({ version: 2, classes: [] }))).toBe(
      null,
    );
    expect(
      importClassroom(JSON.stringify({ version: 1, classes: "bad" })),
    ).toBe(null);
  });

  it("merges imports by class id or normalized name without duplicating students", () => {
    const existing = makeData([
      makeClassroom([{ id: "ada", name: "Ada", emoji: "🦊" }]),
    ]);
    const imported = makeData([
      makeClassroom(
        [
          { id: "ada-copy", name: "ada", emoji: "🐼" },
          { id: "grace", name: "Grace", emoji: "🐯" },
        ],
        { id: "other-class-id", name: " year   4 blue " },
      ),
    ]);
    const merged = mergeClassroom(existing, imported);
    expect(merged.classes).toHaveLength(1);
    expect(merged.classes[0].id).toBe("class-1");
    expect(merged.classes[0].students.map(({ name }) => name)).toEqual([
      "Ada",
      "Grace",
    ]);
    expect(isClassroomData(merged)).toBe(true);
  });

  it("caps imported data to the classroom and roster limits", () => {
    const imported = importClassroom(
      JSON.stringify(
        makeData(
          Array.from({ length: MAX_CLASSES + 2 }, (_, index) =>
            makeClassroom(makeStudents(MAX_STUDENTS + 2), {
              id: `class-${index}`,
              name: `Class ${index}`,
            }),
          ),
        ),
      ),
    );
    expect(imported?.classes).toHaveLength(MAX_CLASSES);
    expect(imported?.classes[0].students).toHaveLength(MAX_STUDENTS);
  });
});
