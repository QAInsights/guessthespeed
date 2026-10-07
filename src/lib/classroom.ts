import type { Player, StorageLike } from "./game";
import { MAX_NAME_LENGTH } from "./limits";

export interface Student {
  id: string;
  name: string;
  emoji: string;
}

export interface ClassRoom {
  id: string;
  name: string;
  emoji: string;
  students: Student[];
  spotlightPlayed: string[];
  createdAt: number;
}

export interface ClassroomData {
  version: 1;
  classes: ClassRoom[];
}

export interface ClassroomSession {
  classId: string;
  className: string;
  mode: "teams" | "spotlight";
  startedAt: number;
}

export interface Team {
  name: string;
  emoji: string;
  members: Student[];
}

export const CLASSROOM_KEY = "gts:classes:v1";
export const SESSION_KEY = "gts:classroom-session";
export const BACKUP_KEY = "gts:v1:before-class";
export const MAX_STUDENTS = 40;
export const MAX_CLASSES = 20;

export const STUDENT_FACES = [
  "🦊",
  "🐼",
  "🐯",
  "🦁",
  "🐸",
  "🐵",
  "🐨",
  "🐰",
  "🐙",
  "🦄",
  "🐢",
  "🦉",
  "🐧",
  "🐳",
  "🦋",
  "🐝",
  "🐞",
  "🦖",
  "🐬",
  "🦒",
] as const;

export const CLASSROOM_EMOJIS = [
  "🏫",
  "📚",
  "🎒",
  "✏️",
  "🔬",
  "🌍",
  "🚀",
  "⭐",
] as const;

export const TEAM_PRESETS = [
  { name: "Rockets", emoji: "🚀" },
  { name: "Lightning", emoji: "⚡" },
  { name: "Comets", emoji: "☄️" },
  { name: "Dolphins", emoji: "🐬" },
  { name: "Dragons", emoji: "🐉" },
  { name: "Rainbows", emoji: "🌈" },
] as const;

const emptyClassroom = (): ClassroomData => ({ version: 1, classes: [] });
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const studentFaceSet = new Set<string>(STUDENT_FACES);
const classroomEmojiSet = new Set<string>(CLASSROOM_EMOJIS);

function normalizeName(value: string, limit: number): string {
  let name = value.trim().replace(/\s+/gu, " ");
  const listMarker = /^(?:(?:\d+\.)|[-*•])\s*/u;
  while (listMarker.test(name)) {
    name = name.replace(listMarker, "").trim();
  }
  name = name.replace(/\s+/gu, " ");
  let limited = "";
  for (const character of name) {
    if (limited.length + character.length > limit) break;
    limited += character;
  }
  return limited;
}

function normalizedNameKey(name: string): string {
  return normalizeName(name, 24).toLowerCase();
}

function isStudentFace(
  value: unknown,
): value is (typeof STUDENT_FACES)[number] {
  return typeof value === "string" && studentFaceSet.has(value);
}

function isClassroomEmoji(
  value: unknown,
): value is (typeof CLASSROOM_EMOJIS)[number] {
  return typeof value === "string" && classroomEmojiSet.has(value);
}

function isStudent(value: unknown): value is Student {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    value.id.length <= 128 &&
    typeof value.name === "string" &&
    value.name.length > 0 &&
    value.name.length <= MAX_NAME_LENGTH &&
    normalizeName(value.name, MAX_NAME_LENGTH) === value.name &&
    isStudentFace(value.emoji)
  );
}

function isClassRoom(value: unknown): value is ClassRoom {
  if (!isRecord(value) || !Array.isArray(value.students)) return false;
  if (
    typeof value.id !== "string" ||
    value.id.length === 0 ||
    value.id.length > 128 ||
    typeof value.name !== "string" ||
    value.name.length === 0 ||
    value.name.length > 24 ||
    normalizeName(value.name, 24) !== value.name ||
    !isClassroomEmoji(value.emoji) ||
    value.students.length > MAX_STUDENTS ||
    !Array.isArray(value.spotlightPlayed) ||
    !Number.isFinite(value.createdAt) ||
    typeof value.createdAt !== "number" ||
    value.createdAt < 0 ||
    !value.students.every(isStudent) ||
    !value.spotlightPlayed.every((id) => typeof id === "string")
  )
    return false;

  const students = value.students as Student[];
  const studentIds = new Set(students.map(({ id }) => id));
  const names = new Set(students.map(({ name }) => normalizedNameKey(name)));
  const played = value.spotlightPlayed as string[];
  return (
    studentIds.size === students.length &&
    names.size === students.length &&
    new Set(played).size === played.length &&
    played.every((id) => studentIds.has(id))
  );
}

export function isClassroomData(value: unknown): value is ClassroomData {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !Array.isArray(value.classes) ||
    value.classes.length > MAX_CLASSES ||
    !value.classes.every(isClassRoom)
  )
    return false;

  const classes = value.classes as ClassRoom[];
  return (
    new Set(classes.map(({ id }) => id)).size === classes.length &&
    new Set(classes.map(({ name }) => normalizedNameKey(name))).size ===
      classes.length
  );
}

export function parseRoster(text: string, existing: string[] = []): string[] {
  const existingNames = new Set<string>();
  for (const value of existing) {
    const name = normalizeName(value, MAX_NAME_LENGTH);
    if (name) existingNames.add(name.toLowerCase());
  }

  let total = Math.min(existingNames.size, MAX_STUDENTS);
  const added: string[] = [];
  for (const entry of text.split(/[\n,;\t]+/u)) {
    if (total >= MAX_STUDENTS) break;
    const name = normalizeName(entry, MAX_NAME_LENGTH);
    const key = name.toLowerCase();
    if (!name || existingNames.has(key)) continue;
    existingNames.add(key);
    added.push(name);
    total += 1;
  }
  return added;
}

export function assignFaces(names: string[], startIndex: number): Student[] {
  const start = Number.isFinite(startIndex)
    ? Math.max(0, Math.floor(startIndex))
    : 0;
  return names.flatMap((value, index) => {
    const name = normalizeName(value, MAX_NAME_LENGTH);
    if (!name) return [];
    return [
      {
        id: `student-${start + index}`,
        name,
        emoji: STUDENT_FACES[(start + index) % STUDENT_FACES.length],
      },
    ];
  });
}

function randomIndex(length: number, rng: () => number): number {
  if (length <= 1) return 0;
  const value = rng();
  const bounded = Number.isFinite(value)
    ? Math.min(Math.max(value, 0), 1 - Number.EPSILON)
    : 0;
  return Math.floor(bounded * length);
}

function shuffled<T>(items: T[], rng: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = randomIndex(index + 1, rng);
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

export function makeTeams(
  students: Student[],
  teamCount: number,
  rng: () => number = Math.random,
): Team[] {
  if (students.length < 2) return [];
  const count = Math.min(
    6,
    students.length,
    Math.max(2, Math.floor(Number.isFinite(teamCount) ? teamCount : 2)),
  );
  const teams: Team[] = TEAM_PRESETS.slice(0, count).map((preset) => ({
    ...preset,
    members: [],
  }));
  shuffled(students, rng).forEach((student, index) => {
    teams[index % teams.length].members.push(student);
  });
  return teams;
}

export function pickSpotlight(
  classroom: ClassRoom,
  count: number,
  rng: () => number = Math.random,
): { picked: Student[]; spotlightPlayed: string[] } {
  const students = classroom.students;
  const wanted = Math.min(
    students.length,
    Math.min(8, Math.max(2, Math.floor(Number.isFinite(count) ? count : 2))),
  );
  if (wanted === 0) return { picked: [], spotlightPlayed: [] };

  const played = new Set(
    classroom.spotlightPlayed.filter((id) =>
      students.some((student) => student.id === id),
    ),
  );
  const unplayed = students.filter((student) => !played.has(student.id));
  const firstPick = shuffled(unplayed, rng).slice(0, wanted);
  const needsNewRotation = firstPick.length < wanted;
  const selectedIds = new Set(firstPick.map(({ id }) => id));
  const fill = needsNewRotation
    ? shuffled(
        students.filter((student) => !selectedIds.has(student.id)),
        rng,
      ).slice(0, wanted - firstPick.length)
    : [];
  const picked = [...firstPick, ...fill];
  const spotlightPlayed = needsNewRotation
    ? fill.map(({ id }) => id)
    : [...played, ...picked.map(({ id }) => id)];
  return { picked, spotlightPlayed };
}

function basePlayer(
  id: string,
  name: string,
  emoji: string,
  role: string,
): Player {
  return {
    id,
    name,
    emoji,
    role,
    score: 0,
    guess: { down: null, up: null },
    locked: false,
  };
}

function teamRole(members: Student[]): string {
  const names = members.map(({ name }) => name);
  const full = names.join(", ");
  if (full.length <= 48) return full;
  for (let included = names.length - 1; included >= 1; included -= 1) {
    const suffix = ` +${names.length - included}`;
    const visibleNames = names.slice(0, included).join(", ");
    if (visibleNames.length + suffix.length <= 48)
      return `${visibleNames}${suffix}`;
  }
  const suffix = ` +${Math.max(1, names.length - 1)}`;
  return `${names[0].slice(0, 48 - suffix.length)}${suffix}`;
}

export function teamsToPlayers(teams: Team[]): Player[] {
  return teams.map((team, index) =>
    basePlayer(`t-${index}`, team.name, team.emoji, teamRole(team.members)),
  );
}

export function studentsToPlayers(
  students: Student[],
  className: string,
): Player[] {
  const role = normalizeName(className, 24);
  return students.map((student) =>
    basePlayer(`s-${student.id}`, student.name, student.emoji, role),
  );
}

function getStorage(storage?: StorageLike): StorageLike | undefined {
  return (
    storage ?? (typeof localStorage === "undefined" ? undefined : localStorage)
  );
}

export function loadClassroom(storage?: StorageLike): ClassroomData {
  try {
    const target = getStorage(storage);
    if (!target) return emptyClassroom();
    const parsed: unknown = JSON.parse(target.getItem(CLASSROOM_KEY) ?? "null");
    return isClassroomData(parsed) ? parsed : emptyClassroom();
  } catch {
    return emptyClassroom();
  }
}

export function saveClassroom(
  data: ClassroomData,
  storage?: StorageLike,
): void {
  try {
    const target = getStorage(storage);
    if (target && isClassroomData(data))
      target.setItem(CLASSROOM_KEY, JSON.stringify(data));
  } catch {
    return;
  }
}

export function loadSession(storage?: StorageLike): ClassroomSession | null {
  try {
    const target = getStorage(storage);
    if (!target) return null;
    const parsed: unknown = JSON.parse(target.getItem(SESSION_KEY) ?? "null");
    if (
      !isRecord(parsed) ||
      typeof parsed.classId !== "string" ||
      !parsed.classId ||
      typeof parsed.className !== "string" ||
      !normalizeName(parsed.className, 24) ||
      (parsed.mode !== "teams" && parsed.mode !== "spotlight") ||
      typeof parsed.startedAt !== "number" ||
      !Number.isFinite(parsed.startedAt) ||
      parsed.startedAt < 0
    )
      return null;
    return {
      classId: parsed.classId.slice(0, 128),
      className: normalizeName(parsed.className, 24),
      mode: parsed.mode,
      startedAt: parsed.startedAt,
    };
  } catch {
    return null;
  }
}

export function saveSession(
  session: ClassroomSession,
  storage?: StorageLike,
): void {
  try {
    const target = getStorage(storage);
    if (target && loadSessionFromValue(session))
      target.setItem(
        SESSION_KEY,
        JSON.stringify(loadSessionFromValue(session)),
      );
  } catch {
    return;
  }
}

function loadSessionFromValue(value: unknown): ClassroomSession | null {
  if (
    !isRecord(value) ||
    typeof value.classId !== "string" ||
    !value.classId ||
    typeof value.className !== "string" ||
    !normalizeName(value.className, 24) ||
    (value.mode !== "teams" && value.mode !== "spotlight") ||
    typeof value.startedAt !== "number" ||
    !Number.isFinite(value.startedAt) ||
    value.startedAt < 0
  )
    return null;
  return {
    classId: value.classId.slice(0, 128),
    className: normalizeName(value.className, 24),
    mode: value.mode,
    startedAt: value.startedAt,
  };
}

export function clearSession(storage?: StorageLike): void {
  try {
    const target = getStorage(storage);
    if (!target) return;
    if ("removeItem" in target && typeof target.removeItem === "function")
      target.removeItem(SESSION_KEY);
    else target.setItem(SESSION_KEY, "");
  } catch {
    return;
  }
}

function sanitizeImportedData(value: unknown): ClassroomData | null {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.classes))
    return null;

  const classes: ClassRoom[] = [];
  for (const rawClass of value.classes.slice(0, MAX_CLASSES)) {
    if (
      !isRecord(rawClass) ||
      typeof rawClass.id !== "string" ||
      typeof rawClass.name !== "string" ||
      typeof rawClass.emoji !== "string" ||
      !Array.isArray(rawClass.students) ||
      !Array.isArray(rawClass.spotlightPlayed) ||
      typeof rawClass.createdAt !== "number" ||
      !Number.isFinite(rawClass.createdAt) ||
      rawClass.createdAt < 0
    )
      return null;
    const id = rawClass.id.trim().slice(0, 128);
    const name = normalizeName(rawClass.name, 24);
    if (!id || !name) return null;

    const students: Student[] = [];
    const ids = new Set<string>();
    const names = new Set<string>();
    for (const rawStudent of rawClass.students.slice(0, MAX_STUDENTS)) {
      if (
        !isRecord(rawStudent) ||
        typeof rawStudent.id !== "string" ||
        typeof rawStudent.name !== "string" ||
        typeof rawStudent.emoji !== "string"
      )
        return null;
      const studentId = rawStudent.id.trim().slice(0, 128);
      const studentName = normalizeName(rawStudent.name, MAX_NAME_LENGTH);
      const key = studentName.toLowerCase();
      if (!studentId || !studentName || ids.has(studentId) || names.has(key))
        continue;
      const studentIndex = students.length;
      students.push({
        id: studentId,
        name: studentName,
        emoji: isStudentFace(rawStudent.emoji)
          ? rawStudent.emoji
          : STUDENT_FACES[studentIndex % STUDENT_FACES.length],
      });
      ids.add(studentId);
      names.add(key);
    }

    const studentIds = new Set(students.map(({ id: studentId }) => studentId));
    const spotlightPlayed = [
      ...new Set(
        rawClass.spotlightPlayed.filter(
          (studentId): studentId is string =>
            typeof studentId === "string" && studentIds.has(studentId),
        ),
      ),
    ];
    classes.push({
      id,
      name,
      emoji: isClassroomEmoji(rawClass.emoji) ? rawClass.emoji : "🏫",
      students,
      spotlightPlayed,
      createdAt: Math.floor(rawClass.createdAt),
    });
  }
  return { version: 1, classes };
}

export function exportClassroom(data: ClassroomData): string {
  const sanitized = sanitizeImportedData(data);
  const normalized = sanitized
    ? mergeSanitized(emptyClassroom(), sanitized)
    : emptyClassroom();
  return JSON.stringify(normalized, null, 2);
}

export function importClassroom(text: string): ClassroomData | null {
  try {
    const sanitized = sanitizeImportedData(JSON.parse(text));
    return sanitized ? mergeClassroom(emptyClassroom(), sanitized) : null;
  } catch {
    return null;
  }
}

export function mergeClassroom(
  existing: ClassroomData,
  imported: ClassroomData,
): ClassroomData {
  const current = sanitizeImportedData(existing) ?? emptyClassroom();
  const incoming = sanitizeImportedData(imported) ?? emptyClassroom();
  return mergeSanitized(current, incoming);
}

function mergeSanitized(
  current: ClassroomData,
  incoming: ClassroomData,
): ClassroomData {
  const classes = current.classes.map((classroom) => ({
    ...classroom,
    students: classroom.students.map((student) => ({ ...student })),
    spotlightPlayed: [...classroom.spotlightPlayed],
  }));

  for (const incomingClass of incoming.classes) {
    const match =
      classes.find(({ id }) => id === incomingClass.id) ??
      classes.find(
        ({ name }) =>
          normalizedNameKey(name) === normalizedNameKey(incomingClass.name),
      );
    if (!match) {
      if (classes.length < MAX_CLASSES) classes.push(incomingClass);
      continue;
    }

    const idMap = new Map<string, string>();
    const mergedStudents = [...match.students];
    for (const student of incomingClass.students) {
      const byId = mergedStudents.find(({ id }) => id === student.id);
      const byName = mergedStudents.find(
        ({ name }) =>
          normalizedNameKey(name) === normalizedNameKey(student.name),
      );
      const duplicate = byId ?? byName;
      if (duplicate) {
        idMap.set(student.id, duplicate.id);
        continue;
      }
      if (mergedStudents.length >= MAX_STUDENTS) continue;
      let id = student.id;
      let suffix = 1;
      while (mergedStudents.some((member) => member.id === id)) {
        const suffixText = `-${suffix}`;
        id = `${student.id.slice(0, 128 - suffixText.length)}${suffixText}`;
        suffix += 1;
      }
      const added = { ...student, id };
      mergedStudents.push(added);
      idMap.set(student.id, id);
    }
    for (const student of match.students) idMap.set(student.id, student.id);

    match.students = mergedStudents;
    match.spotlightPlayed = [
      ...new Set([
        ...match.spotlightPlayed,
        ...incomingClass.spotlightPlayed
          .map((id) => idMap.get(id))
          .filter((id): id is string => !!id),
      ]),
    ].filter((id) => mergedStudents.some((student) => student.id === id));
  }

  return { version: 1, classes };
}
