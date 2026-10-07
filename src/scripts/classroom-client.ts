import {
  assignFaces,
  CLASSROOM_KEY,
  CLASSROOM_EMOJIS,
  BACKUP_KEY,
  exportClassroom,
  importClassroom,
  isClassroomData,
  loadClassroom,
  makeTeams,
  MAX_CLASSES,
  MAX_STUDENTS,
  mergeClassroom,
  parseRoster,
  pickSpotlight,
  loadSession,
  saveClassroom,
  saveSession,
  SESSION_KEY,
  STUDENT_FACES,
  teamsToPlayers,
  studentsToPlayers,
  type ClassRoom,
  type ClassroomData,
  type Student,
  type Team,
} from "../lib/classroom";
import { initialGameState, loadGame, saveGame, STORAGE_KEY } from "../lib/game";
import { $ } from "./dom";

const classList = $<HTMLDivElement>("[data-class-list]");
const classCount = $<HTMLElement>("[data-class-count]");
const editor = $<HTMLElement>("[data-class-editor]");
const playPanel = $<HTMLElement>("[data-play-panel]");
const classNameInput = $<HTMLInputElement>("[data-class-name]");
const classEmojiPicker = $<HTMLDivElement>("[data-class-emoji-picker]");
const rosterForm = $<HTMLFormElement>("[data-roster-form]");
const rosterText = $<HTMLTextAreaElement>("[data-roster-text]");
const studentRoster = $<HTMLDivElement>("[data-student-roster]");
const studentCount = $<HTMLElement>("[data-student-count]");
const rosterEmpty = $<HTMLElement>("[data-roster-empty]");
const teamCountInput = $<HTMLInputElement>("[data-team-count]");
const teamPreview = $<HTMLDivElement>("[data-team-preview]");
const teamSetup = $<HTMLElement>("[data-team-setup]");
const spotlightSetup = $<HTMLElement>("[data-spotlight-setup]");
const spotlightCountInput = $<HTMLInputElement>("[data-spotlight-count]");
const spotlightPreview = $<HTMLDivElement>("[data-spotlight-preview]");
const startButton = $<HTMLButtonElement>("[data-start-class]");
const noStudentsNote = $<HTMLElement>("[data-no-students]");
const roomStartNote = $<HTMLElement>("[data-room-start-note]");
const toast = $<HTMLElement>("[data-toast]");
const studentDialog = $<HTMLDialogElement>("[data-student-dialog]");
const studentForm = $<HTMLFormElement>("[data-student-form]");
const studentNameInput = $<HTMLInputElement>("[data-student-name]");
const studentEmojiPicker = $<HTMLDivElement>("[data-student-emoji-picker]");
const studentError = $<HTMLElement>("[data-student-error]");
const importInput = $<HTMLInputElement>("[data-import]");
const modeInputs = [
  ...document.querySelectorAll<HTMLInputElement>('input[name="classroomMode"]'),
];

let classroomData: ClassroomData = loadClassroom();
let selectedClassId: string | null = classroomData.classes[0]?.id ?? null;
let previewTeams: Team[] = [];
let spotlightSelection: Student[] = [];
let nextSpotlightPlayed: string[] = [];
let editingStudentId: string | null = null;
let selectedStudentFace: (typeof STUDENT_FACES)[number] = STUDENT_FACES[0];
let toastTimer = 0;
let lastSelectedClassId: string | null = null;
let teamCountManuallySet = false;
const roomLinkOnThisPage = new URLSearchParams(window.location.search).has(
  "room",
);

function currentClass(): ClassRoom | null {
  return (
    classroomData.classes.find(
      (classroom) => classroom.id === selectedClassId,
    ) ?? null
  );
}

function setToast(message: string) {
  toast.textContent = message;
  window.clearTimeout(toastTimer);
  if (message) {
    toastTimer = window.setTimeout(() => {
      toast.textContent = "";
    }, 5000);
  }
}

function persistClassroom() {
  if (isClassroomData(classroomData)) saveClassroom(classroomData);
}

function createId(prefix: string): string {
  const randomId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${randomId}`;
}

function createNewClassButton(): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "new-class-card";
  button.type = "button";
  button.setAttribute("aria-label", "Create a new class");
  const plus = document.createElement("span");
  plus.setAttribute("aria-hidden", "true");
  plus.textContent = "+";
  const label = document.createElement("strong");
  label.textContent = "New class";
  button.append(plus, label);
  button.addEventListener("click", createClass);
  return button;
}

function renderClassList() {
  classList.replaceChildren();
  classCount.textContent = `${classroomData.classes.length} ${
    classroomData.classes.length === 1 ? "class" : "classes"
  }`;

  if (!classroomData.classes.length) {
    const empty = document.createElement("section");
    empty.className = "empty-classes";
    empty.setAttribute("aria-labelledby", "empty-class-title");

    const face = document.createElement("span");
    face.className = "empty-class-face";
    face.setAttribute("aria-hidden", "true");
    face.textContent = "🎒";

    const copy = document.createElement("div");
    copy.className = "empty-class-copy";
    const title = document.createElement("h3");
    title.id = "empty-class-title";
    title.textContent = "Add your first class";
    const steps = document.createElement("ol");
    steps.className = "empty-class-steps";
    for (const [index, label] of [
      "Name it",
      "Paste the list",
      "Press start",
    ].entries()) {
      const step = document.createElement("li");
      const number = document.createElement("b");
      number.textContent = String(index + 1);
      const text = document.createElement("span");
      text.textContent = label;
      step.append(number, text);
      steps.append(step);
    }
    copy.append(title, steps);

    empty.append(face, copy, createNewClassButton());
    classList.append(empty);
    return;
  }

  classroomData.classes.forEach((classroom) => {
    const card = document.createElement("button");
    card.className = "class-card";
    card.type = "button";
    card.setAttribute("aria-pressed", String(classroom.id === selectedClassId));
    card.setAttribute(
      "aria-label",
      `${classroom.name}, ${classroom.students.length} students`,
    );

    const face = document.createElement("span");
    face.className = "class-card-face";
    face.setAttribute("aria-hidden", "true");
    face.textContent = classroom.emoji;

    const copy = document.createElement("span");
    copy.className = "class-card-copy";
    const name = document.createElement("strong");
    name.textContent = classroom.name;
    const count = document.createElement("small");
    count.textContent = `${classroom.students.length} ${
      classroom.students.length === 1 ? "student" : "students"
    }`;
    copy.append(name, count);
    card.append(face, copy);
    card.addEventListener("click", () => selectClass(classroom.id));
    classList.append(card);
  });

  classList.append(createNewClassButton());
}

function renderEmojiPicker(
  target: HTMLElement,
  choices: readonly string[],
  selected: string,
  label: string,
  onSelect: (emoji: string) => void,
) {
  target.replaceChildren();
  choices.forEach((emoji, index) => {
    const button = document.createElement("button");
    button.className = "emoji-choice";
    button.type = "button";
    button.textContent = emoji;
    button.setAttribute("aria-label", `${label} ${index + 1}: ${emoji}`);
    button.setAttribute("aria-pressed", String(emoji === selected));
    button.addEventListener("click", () => onSelect(emoji));
    target.append(button);
  });
}

function updateClassEmoji(emoji: string) {
  const classroom = currentClass();
  if (!classroom) return;
  classroom.emoji = emoji;
  persistClassroom();
  renderClassList();
  renderEmojiPicker(
    classEmojiPicker,
    CLASSROOM_EMOJIS,
    classroom.emoji,
    "Use class sticker",
    updateClassEmoji,
  );
}

function renderStudentRoster(classroom: ClassRoom) {
  studentRoster.replaceChildren();
  studentCount.textContent = `${classroom.students.length} of ${MAX_STUDENTS}`;
  rosterEmpty.hidden = classroom.students.length > 0;

  classroom.students.forEach((student) => {
    const chip = document.createElement("button");
    chip.className = "student-chip";
    chip.type = "button";
    chip.dataset.studentId = student.id;
    chip.setAttribute("aria-label", `Edit ${student.name}`);
    const face = document.createElement("span");
    face.setAttribute("aria-hidden", "true");
    face.textContent = student.emoji;
    const name = document.createElement("strong");
    name.textContent = student.name;
    chip.append(face, name);
    chip.addEventListener("click", () => openStudentEditor(student));
    studentRoster.append(chip);
  });
}

function clampInput(input: HTMLInputElement, min: number, max: number): number {
  const raw = Number.parseInt(input.value, 10);
  const value = Math.min(max, Math.max(min, Number.isFinite(raw) ? raw : min));
  input.value = String(value);
  return value;
}

function selectedMode(): "teams" | "spotlight" {
  return modeInputs.find((input) => input.checked)?.value === "spotlight"
    ? "spotlight"
    : "teams";
}

function updatePlayPanel(classroom: ClassRoom) {
  const mode = selectedMode();
  teamSetup.hidden = mode !== "teams";
  spotlightSetup.hidden = mode !== "spotlight";
  const needsTeam = mode === "teams" && classroom.students.length < 2;
  noStudentsNote.hidden = classroom.students.length > 0 && !needsTeam;
  noStudentsNote.textContent =
    classroom.students.length === 0
      ? "Add students before starting a game."
      : "Add one more student to make a team game.";

  const blockedByRoom = roomLinkOnThisPage;
  roomStartNote.hidden = !blockedByRoom;
  startButton.disabled =
    blockedByRoom ||
    classroom.students.length === 0 ||
    needsTeam ||
    (mode === "spotlight" && spotlightSelection.length === 0);

  if (mode === "teams") renderTeamPreview(classroom);
}

function renderEditor() {
  const classroom = currentClass();
  editor.hidden = !classroom;
  playPanel.hidden = !classroom;
  if (!classroom) return;

  if (lastSelectedClassId !== classroom.id) {
    teamCountInput.value = String(
      Math.min(4, Math.max(2, classroom.students.length)),
    );
    teamCountManuallySet = false;
    previewTeams = [];
    spotlightSelection = [];
    nextSpotlightPlayed = [];
    lastSelectedClassId = classroom.id;
  }
  classNameInput.value = classroom.name;
  renderEmojiPicker(
    classEmojiPicker,
    CLASSROOM_EMOJIS,
    classroom.emoji,
    "Use class sticker",
    updateClassEmoji,
  );
  renderStudentRoster(classroom);
  updatePlayPanel(classroom);
}

function render() {
  renderClassList();
  renderEditor();
}

function selectClass(id: string) {
  selectedClassId = id;
  previewTeams = [];
  spotlightSelection = [];
  nextSpotlightPlayed = [];
  render();
}

function newClassName(): string {
  let index = classroomData.classes.length + 1;
  let name = `Class ${index}`;
  while (
    classroomData.classes.some(
      (classroom) => classroom.name.toLowerCase() === name.toLowerCase(),
    )
  ) {
    index += 1;
    name = `Class ${index}`;
  }
  return name.slice(0, 24);
}

function createClass() {
  if (classroomData.classes.length >= MAX_CLASSES) {
    setToast(`You can save up to ${MAX_CLASSES} classes on this device.`);
    return;
  }
  const classroom: ClassRoom = {
    id: createId("class"),
    name: newClassName(),
    emoji: "🏫",
    students: [],
    spotlightPlayed: [],
    createdAt: Date.now(),
  };
  classroomData.classes.push(classroom);
  selectedClassId = classroom.id;
  previewTeams = [];
  spotlightSelection = [];
  persistClassroom();
  render();
  classNameInput.focus();
  classNameInput.select();
}

function selectStudentEmoji(emoji: string) {
  selectedStudentFace = emoji as (typeof STUDENT_FACES)[number];
  renderEmojiPicker(
    studentEmojiPicker,
    STUDENT_FACES,
    selectedStudentFace,
    "Use student face",
    selectStudentEmoji,
  );
}

function openStudentEditor(student: Student) {
  editingStudentId = student.id;
  selectedStudentFace = student.emoji as (typeof STUDENT_FACES)[number];
  studentNameInput.value = student.name;
  studentError.textContent = "";
  renderEmojiPicker(
    studentEmojiPicker,
    STUDENT_FACES,
    selectedStudentFace,
    "Use student face",
    selectStudentEmoji,
  );
  studentDialog.showModal();
  studentNameInput.focus();
  studentNameInput.select();
}

function cleanStudentName(value: string): string {
  let name = value.trim().replace(/\s+/gu, " ");
  const marker = /^(?:(?:\d+\.)|[-*•])\s*/u;
  while (marker.test(name)) name = name.replace(marker, "").trim();
  let limited = "";
  for (const character of name) {
    if (limited.length + character.length > 16) break;
    limited += character;
  }
  return limited;
}

function saveStudent(event: SubmitEvent) {
  event.preventDefault();
  const classroom = currentClass();
  const student = classroom?.students.find(({ id }) => id === editingStudentId);
  if (!classroom || !student) return;
  const name = cleanStudentName(studentNameInput.value);
  if (!name) {
    studentError.textContent = "Enter a student name.";
    studentNameInput.focus();
    return;
  }
  const duplicate = classroom.students.some(
    (member) =>
      member.id !== student.id &&
      member.name.toLowerCase() === name.toLowerCase(),
  );
  if (duplicate) {
    studentError.textContent = "That name is already in this class.";
    studentNameInput.focus();
    return;
  }
  student.name = name;
  student.emoji = selectedStudentFace;
  persistClassroom();
  spotlightSelection = [];
  nextSpotlightPlayed = [];
  studentDialog.close();
  render();
  setToast("Student updated.");
}

function removeStudent() {
  const classroom = currentClass();
  if (!classroom || !editingStudentId) return;
  const removedId = editingStudentId;
  classroom.students = classroom.students.filter(({ id }) => id !== removedId);
  classroom.spotlightPlayed = classroom.spotlightPlayed.filter(
    (id) => id !== removedId,
  );
  persistClassroom();
  previewTeams = [];
  spotlightSelection = [];
  nextSpotlightPlayed = [];
  studentDialog.close();
  render();
  setToast("Student removed.");
}

function updateClassName() {
  const classroom = currentClass();
  if (!classroom) return;
  const name = classNameInput.value.trim().replace(/\s+/gu, " ");
  let limited = "";
  for (const character of name) {
    if (limited.length + character.length > 24) break;
    limited += character;
  }
  if (!limited) return;
  const duplicate = classroomData.classes.some(
    (member) =>
      member.id !== classroom.id &&
      member.name.toLowerCase() === limited.toLowerCase(),
  );
  if (duplicate) {
    setToast("A class with that name already exists.");
    classNameInput.value = classroom.name;
    return;
  }
  classroom.name = limited;
  persistClassroom();
  renderClassList();
}

function createTeamPreview(classroom: ClassRoom): Team[] {
  return makeTeams(classroom.students, clampInput(teamCountInput, 2, 6));
}

function renderTeamPreview(classroom: ClassRoom) {
  if (!previewTeams.length) previewTeams = createTeamPreview(classroom);
  teamPreview.replaceChildren();
  if (!previewTeams.length) {
    const empty = document.createElement("p");
    empty.className = "preview-placeholder";
    empty.textContent = "Add students to preview your teams.";
    teamPreview.append(empty);
    return;
  }

  previewTeams.forEach((team, teamIndex) => {
    const card = document.createElement("article");
    card.className = "team-card";
    const heading = document.createElement("h3");
    heading.textContent = `${team.emoji} ${team.name}`;
    const list = document.createElement("ul");
    team.members.forEach((student) => {
      const item = document.createElement("li");
      const move = document.createElement("button");
      move.className = "team-member-button";
      move.type = "button";
      move.setAttribute("aria-label", `Move ${student.name} to the next team`);
      const face = document.createElement("span");
      face.setAttribute("aria-hidden", "true");
      face.textContent = student.emoji;
      const name = document.createElement("strong");
      name.textContent = student.name;
      move.append(face, name);
      move.addEventListener("click", () => moveStudent(student.id, teamIndex));
      item.append(move);
      list.append(item);
    });
    card.append(heading, list);
    teamPreview.append(card);
  });
}

function moveStudent(studentId: string, fromIndex: number) {
  if (previewTeams.length < 2) return;
  const source = previewTeams[fromIndex];
  const studentIndex = source.members.findIndex(({ id }) => id === studentId);
  if (studentIndex < 0) return;
  const [student] = source.members.splice(studentIndex, 1);
  const target = previewTeams[(fromIndex + 1) % previewTeams.length];
  target.members.push(student);
  const classroom = currentClass();
  if (classroom) renderTeamPreview(classroom);
}

function countDuplicates(text: string, existing: string[]): number {
  const seen = new Set(existing.map((name) => name.toLowerCase()));
  let duplicates = 0;
  for (const entry of text.split(/[\n,;\t]+/u)) {
    const name = cleanStudentName(entry);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) duplicates += 1;
    else seen.add(key);
  }
  return duplicates;
}

function addStudents(event: SubmitEvent) {
  event.preventDefault();
  const classroom = currentClass();
  if (!classroom) return;
  const entries = rosterText.value
    .split(/[\n,;\t]+/u)
    .map(cleanStudentName)
    .filter(Boolean);
  const duplicates = countDuplicates(
    rosterText.value,
    classroom.students.map(({ name }) => name),
  );
  const names = parseRoster(
    rosterText.value,
    classroom.students.map(({ name }) => name),
  );
  if (!names.length) {
    setToast(
      classroom.students.length >= MAX_STUDENTS
        ? `This class already has the ${MAX_STUDENTS}-student limit.`
        : "No new names to add. Check the roster and try again.",
    );
    return;
  }
  const newStudents = assignFaces(names, classroom.students.length).map(
    (student) => ({ ...student, id: createId("student") }),
  );
  const wasEmpty = classroom.students.length === 0;
  const overLimit = Math.max(0, entries.length - duplicates - names.length);
  classroom.students.push(...newStudents);
  if (wasEmpty && !teamCountManuallySet) {
    teamCountInput.value = String(
      Math.min(4, Math.max(2, classroom.students.length)),
    );
  }
  previewTeams = [];
  spotlightSelection = [];
  nextSpotlightPlayed = [];
  rosterText.value = "";
  persistClassroom();
  render();
  const limitNote = overLimit
    ? ` ${overLimit} more ${
        overLimit === 1 ? "name was" : "names were"
      } skipped at the ${MAX_STUDENTS}-student limit.`
    : "";
  setToast(
    `Added ${newStudents.length} ${
      newStudents.length === 1 ? "student" : "students"
    } (${duplicates} ${
      duplicates === 1 ? "duplicate" : "duplicates"
    } skipped).${limitNote}`,
  );
}

function clearRoster() {
  const classroom = currentClass();
  if (!classroom || !classroom.students.length) return;
  if (!window.confirm(`Clear every student from ${classroom.name}?`)) return;
  classroom.students = [];
  classroom.spotlightPlayed = [];
  previewTeams = [];
  spotlightSelection = [];
  nextSpotlightPlayed = [];
  persistClassroom();
  render();
  setToast("Class list cleared.");
}

function deleteClass() {
  const classroom = currentClass();
  if (!classroom) return;
  if (!window.confirm(`Delete ${classroom.name} and its class list?`)) return;
  classroomData.classes = classroomData.classes.filter(
    ({ id }) => id !== classroom.id,
  );
  selectedClassId = classroomData.classes[0]?.id ?? null;
  previewTeams = [];
  spotlightSelection = [];
  nextSpotlightPlayed = [];
  persistClassroom();
  render();
  setToast("Class deleted.");
}

function spinSpotlight() {
  const classroom = currentClass();
  if (!classroom || !classroom.students.length) {
    setToast("Add students before spinning.");
    return;
  }
  const result = pickSpotlight(
    classroom,
    clampInput(spotlightCountInput, 2, 8),
  );
  spotlightSelection = result.picked;
  nextSpotlightPlayed = result.spotlightPlayed;
  spotlightPreview.replaceChildren();
  spotlightPreview.classList.remove("spotlight-reveal");
  for (const student of spotlightSelection) {
    const card = document.createElement("span");
    card.className = "spotlight-student";
    const face = document.createElement("span");
    face.setAttribute("aria-hidden", "true");
    face.textContent = student.emoji;
    const name = document.createElement("strong");
    name.textContent = student.name;
    card.append(face, name);
    spotlightPreview.append(card);
  }
  requestAnimationFrame(() =>
    spotlightPreview.classList.add("spotlight-reveal"),
  );
  updatePlayPanel(classroom);
}

function resetSpotlight() {
  const classroom = currentClass();
  if (!classroom) return;
  classroom.spotlightPlayed = [];
  spotlightSelection = [];
  nextSpotlightPlayed = [];
  persistClassroom();
  spotlightPreview.replaceChildren();
  const placeholder = document.createElement("p");
  placeholder.className = "preview-placeholder";
  placeholder.textContent = "Spin to pick students for this round.";
  spotlightPreview.append(placeholder);
  updatePlayPanel(classroom);
  setToast("Spotlight rotation reset.");
}

function exportClassFile() {
  const blob = new Blob([exportClassroom(classroomData)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const today = new Date();
  const date = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
  link.href = url;
  link.download = `guessthespeed-classes-${date}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  setToast("Class file downloaded.");
}

async function importClassFile() {
  const [file] = importInput.files ?? [];
  if (!file) return;
  try {
    const incoming = importClassroom(await file.text());
    if (!incoming) {
      setToast(
        "That class file could not be read. Choose a valid class JSON file.",
      );
      return;
    }
    const merged = mergeClassroom(classroomData, incoming);
    if (!isClassroomData(merged)) {
      setToast("The class file exceeds this device's class or student limit.");
      return;
    }
    classroomData = merged;
    selectedClassId = classroomData.classes[0]?.id ?? null;
    previewTeams = [];
    spotlightSelection = [];
    nextSpotlightPlayed = [];
    persistClassroom();
    render();
    setToast("Class file imported and merged with your saved classes.");
  } catch {
    setToast("That class file could not be opened.");
  } finally {
    importInput.value = "";
  }
}

function deleteAllClassData() {
  if (
    !window.confirm(
      "Delete every saved class and student roster from this device?",
    )
  )
    return;
  try {
    localStorage.removeItem(CLASSROOM_KEY);
  } catch {
    setToast(
      "The browser could not clear class data. Check its storage settings.",
    );
    return;
  }
  classroomData = { version: 1, classes: [] };
  selectedClassId = null;
  previewTeams = [];
  spotlightSelection = [];
  nextSpotlightPlayed = [];
  render();
  setToast("All class data deleted from this device.");
}

function startClassGame() {
  const classroom = currentClass();
  const mode = selectedMode();
  if (!classroom || !classroom.students.length) return;
  if (roomLinkOnThisPage) {
    setToast("Leave the room before starting a class game.");
    return;
  }

  let players: ReturnType<typeof teamsToPlayers> = [];
  if (mode === "teams") {
    if (classroom.students.length < 2) return;
    if (!previewTeams.length) previewTeams = createTeamPreview(classroom);
    if (!previewTeams.length) return;
    players = teamsToPlayers(previewTeams);
  } else {
    if (!spotlightSelection.length) return;
    players = studentsToPlayers(spotlightSelection, classroom.name);
  }

  let previousGame: string | null = null;
  let previousSession: string | null = null;
  let previousBackup: string | null = null;
  let hasSnapshot = false;
  try {
    previousGame = localStorage.getItem(STORAGE_KEY);
    previousSession = localStorage.getItem(SESSION_KEY);
    previousBackup = localStorage.getItem(BACKUP_KEY);
    hasSnapshot = true;
    if (previousGame !== null && previousBackup === null)
      localStorage.setItem(BACKUP_KEY, previousGame);

    const initial = initialGameState();
    const state = {
      ...initial,
      players,
      settings: loadGame().settings,
      round: 1,
      history: [],
      phase: "guessing" as const,
    };
    saveGame(state);
    const savedPlayers = loadGame().players;
    if (
      savedPlayers.length !== players.length ||
      savedPlayers.some((player, index) => player.id !== players[index]?.id)
    )
      throw new Error("Classroom players could not be saved");
    saveSession({
      classId: classroom.id,
      className: classroom.name,
      mode,
      startedAt: Date.now(),
    });
    if (loadSession()?.classId !== classroom.id)
      throw new Error("Classroom session could not be saved");
    if (mode === "spotlight") {
      classroom.spotlightPlayed = nextSpotlightPlayed;
      persistClassroom();
    }
    window.location.assign("/");
  } catch {
    if (hasSnapshot) {
      for (const [key, value] of [
        [STORAGE_KEY, previousGame],
        [SESSION_KEY, previousSession],
        [BACKUP_KEY, previousBackup],
      ] as const) {
        try {
          if (value === null) localStorage.removeItem(key);
          else localStorage.setItem(key, value);
        } catch {}
      }
    }
    setToast(
      "The game could not start because this browser could not save its local data.",
    );
  }
}

function bindEvents() {
  classNameInput.addEventListener("input", updateClassName);
  classNameInput.addEventListener("blur", () => {
    const classroom = currentClass();
    if (!classroom) return;
    if (!classNameInput.value.trim()) classNameInput.value = classroom.name;
    updateClassName();
  });
  rosterForm.addEventListener("submit", addStudents);
  $<HTMLButtonElement>("[data-clear-list]").addEventListener(
    "click",
    clearRoster,
  );
  $<HTMLButtonElement>("[data-delete-class]").addEventListener(
    "click",
    deleteClass,
  );
  $<HTMLButtonElement>("[data-shuffle-teams]").addEventListener("click", () => {
    const classroom = currentClass();
    if (!classroom) return;
    previewTeams = createTeamPreview(classroom);
    renderTeamPreview(classroom);
  });
  teamCountInput.addEventListener("change", () => {
    teamCountManuallySet = true;
    const classroom = currentClass();
    if (!classroom) return;
    previewTeams = createTeamPreview(classroom);
    renderTeamPreview(classroom);
  });
  spotlightCountInput.addEventListener("change", () => {
    clampInput(spotlightCountInput, 2, 8);
    const classroom = currentClass();
    if (classroom) updatePlayPanel(classroom);
  });
  modeInputs.forEach((input) =>
    input.addEventListener("change", () => {
      const classroom = currentClass();
      if (classroom) updatePlayPanel(classroom);
    }),
  );
  $<HTMLButtonElement>("[data-spin-spotlight]").addEventListener(
    "click",
    spinSpotlight,
  );
  $<HTMLButtonElement>("[data-reset-spotlight]").addEventListener(
    "click",
    resetSpotlight,
  );
  startButton.addEventListener("click", startClassGame);
  $<HTMLButtonElement>("[data-export]").addEventListener(
    "click",
    exportClassFile,
  );
  importInput.addEventListener("change", () => void importClassFile());
  $<HTMLButtonElement>("[data-delete-all]").addEventListener(
    "click",
    deleteAllClassData,
  );
  studentForm.addEventListener("submit", saveStudent);
  $<HTMLButtonElement>("[data-remove-student]").addEventListener(
    "click",
    removeStudent,
  );
  $<HTMLButtonElement>("[data-close-student]").addEventListener("click", () =>
    studentDialog.close(),
  );
  studentDialog.addEventListener("close", () => {
    const studentId = editingStudentId;
    editingStudentId = null;
    if (
      studentId &&
      (!document.activeElement || document.activeElement === document.body)
    )
      Array.from(
        studentRoster.querySelectorAll<HTMLButtonElement>("[data-student-id]"),
      )
        .find((button) => button.dataset.studentId === studentId)
        ?.focus();
  });
}

bindEvents();
render();
