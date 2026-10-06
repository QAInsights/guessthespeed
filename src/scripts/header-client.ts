import { loadGame, saveGame, type GameSettings } from "../lib/game";
import { isThemeId, themes, themeForDate, type ThemeId } from "../lib/themes";
import { playCue } from "../lib/sound";

const $ = <T extends Element>(selector: string): T =>
  document.querySelector(selector) as T;

const themePicker = $<HTMLDivElement>("[data-theme-picker]");
const themeTrigger = $<HTMLButtonElement>("[data-theme-trigger]");
const themeMenu = $<HTMLDivElement>("[data-theme-menu]");
const themeList = $<HTMLDivElement>("[data-theme-list]");
const themeLabel = $<HTMLSpanElement>("[data-theme-label]");
const themeAutoHint = $<HTMLElement>("[data-theme-auto-hint]");
const themeOptions = [
  ...document.querySelectorAll<HTMLButtonElement>("[data-theme-option]"),
];
const soundButton = $<HTMLButtonElement>("[data-sound-toggle]");
const soundOn = $<HTMLSpanElement>("[data-sound-on]");
const soundOff = $<HTMLSpanElement>("[data-sound-off]");
const settingsButton = $<HTMLButtonElement>("[data-open-settings]");
const settingsDialog = $<HTMLDialogElement>("[data-settings-dialog]");
const closeSettingsButton = $<HTMLButtonElement>("[data-close-settings]");
const settingsForm = $<HTMLFormElement>("[data-settings-form]");
const devBadge = $<HTMLButtonElement>("[data-dev-badge]");
const devModeInput = $<HTMLInputElement>('input[name="devMode"]');
const fxLayer = $<HTMLDivElement>("[data-fx-layer]");
const reduceMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;

const initialGame = loadGame();
let settings = initialGame.settings;
let testing = initialGame.phase === "testing";
let devMode = document.documentElement.dataset.dev === "1";
let activeTheme: ThemeId = "light";
devBadge.hidden = !devMode;

function setDevMode(enabled: boolean) {
  devMode = enabled;
  if (enabled) document.documentElement.dataset.dev = "1";
  else delete document.documentElement.dataset.dev;
  devBadge.hidden = !enabled;
  devModeInput.checked = enabled;
  try {
    localStorage.setItem("gts:dev", enabled ? "1" : "0");
  } catch {}
  document.dispatchEvent(
    new CustomEvent<boolean>("gts:dev-change", { detail: enabled }),
  );
}

function getResolvedTheme(mode: GameSettings["themeMode"]): ThemeId {
  if (mode !== "auto") return mode;
  const festival = themeForDate(new Date());
  if (festival) return festival;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(mode: GameSettings["themeMode"]) {
  activeTheme = getResolvedTheme(mode);
  document.documentElement.dataset.theme = activeTheme;
  const metaTheme = document.querySelector(
    'meta[name="theme-color"]',
  ) as HTMLMetaElement;
  const computed = getComputedStyle(document.documentElement)
    .getPropertyValue("--bg")
    .trim();
  metaTheme.content = computed || "#eceff3";
  fxLayer.replaceChildren();

  const fx = themes[activeTheme].fx;
  if (!fx || reduceMotion) return;
  for (let index = 0; index < 14; index += 1) {
    const piece = document.createElement("span");
    piece.textContent = fx[index % fx.length];
    piece.style.left = `${(Math.random() * 100).toFixed(1)}vw`;
    piece.style.fontSize = `${(14 + Math.random() * 18).toFixed(0)}px`;
    piece.style.animationDuration = `${(9 + Math.random() * 10).toFixed(1)}s`;
    piece.style.animationDelay = `${(-Math.random() * 18).toFixed(1)}s`;
    piece.style.setProperty(
      "--drift",
      `${(Math.random() * 80 - 40).toFixed(0)}px`,
    );
    fxLayer.append(piece);
  }
}

function syncThemePicker() {
  const mode = settings.themeMode;
  themeOptions.forEach((option) => {
    const selected = option.dataset.themeOption === mode;
    option.setAttribute("aria-selected", String(selected));
    option.tabIndex = selected ? 0 : -1;
    if (option.dataset.themeOption === "auto")
      option.dataset.theme = activeTheme;
  });
  themeLabel.textContent =
    mode === "auto" ? "Auto (by date)" : themes[mode].label;
  themeAutoHint.textContent = `Now: ${themes[activeTheme].label}`;
  themeTrigger.disabled = testing;
  if (testing) closeThemeMenu(false);
}

function focusThemeOption(option: HTMLButtonElement) {
  themeOptions.forEach((candidate) => {
    candidate.tabIndex = candidate === option ? 0 : -1;
  });
  option.focus();
  option.scrollIntoView({ block: "nearest" });
}

function openThemeMenu(target: "selected" | "last" = "selected") {
  if (themeTrigger.disabled) return;
  themeMenu.hidden = false;
  themeTrigger.setAttribute("aria-expanded", "true");
  const selected =
    themeOptions.find(
      (option) => option.getAttribute("aria-selected") === "true",
    ) ?? themeOptions[0];
  focusThemeOption(target === "last" ? themeOptions.at(-1)! : selected);
}

function closeThemeMenu(returnFocus = true) {
  if (themeMenu.hidden) return;
  themeMenu.hidden = true;
  themeTrigger.setAttribute("aria-expanded", "false");
  if (returnFocus) themeTrigger.focus();
}

function syncControls() {
  syncThemePicker();
  soundButton.disabled = testing;
  settingsButton.disabled = testing;
  soundButton.setAttribute("aria-pressed", String(settings.sound));
  soundButton.setAttribute(
    "aria-label",
    settings.sound ? "Turn sound off" : "Turn sound on",
  );
  soundOn.hidden = !settings.sound;
  soundOff.hidden = settings.sound;
}

function saveSettings(patch: Partial<GameSettings>, playSound = false) {
  const currentGame = loadGame();
  settings = { ...currentGame.settings, ...patch };
  saveGame({ ...currentGame, settings });
  applyTheme(settings.themeMode);
  syncControls();
  document.dispatchEvent(
    new CustomEvent<GameSettings>("gts:settings-change", { detail: settings }),
  );
  if (playSound) playCue("lockIn", activeTheme, settings.sound);
}

function fillSettingsForm() {
  settings = loadGame().settings;
  applyTheme(settings.themeMode);
  syncControls();
  (settingsForm.elements.namedItem("rounds") as HTMLSelectElement).value =
    String(settings.rounds);
  (settingsForm.elements.namedItem("tieMode") as HTMLSelectElement).value =
    settings.tieMode;
  (settingsForm.elements.namedItem("themeMode") as HTMLSelectElement).value =
    settings.themeMode;
  (settingsForm.elements.namedItem("sound") as HTMLInputElement).checked =
    settings.sound;
  devModeInput.checked = devMode;
}

themeTrigger.addEventListener("click", () => {
  if (themeMenu.hidden) openThemeMenu();
  else closeThemeMenu();
});

themeTrigger.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  event.preventDefault();
  openThemeMenu(event.key === "ArrowUp" ? "last" : "selected");
});

themeOptions.forEach((option) => {
  option.addEventListener("click", () => {
    const mode = option.dataset.themeOption ?? "auto";
    saveSettings({ themeMode: isThemeId(mode) ? mode : "auto" }, true);
    closeThemeMenu();
  });
});

themeMenu.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    closeThemeMenu();
    return;
  }
  if (event.key === "Tab") {
    closeThemeMenu(false);
    return;
  }
  const index = themeOptions.indexOf(
    document.activeElement as HTMLButtonElement,
  );
  const columns = getComputedStyle(themeList)
    .gridTemplateColumns.split(" ")
    .filter(Boolean).length;
  const steps: Record<string, number> = {
    ArrowRight: 1,
    ArrowLeft: -1,
    ArrowDown: columns,
    ArrowUp: -columns,
  };
  let next: number | null = null;
  if (event.key in steps) next = index < 0 ? 0 : index + steps[event.key];
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = themeOptions.length - 1;
  if (next === null) return;
  event.preventDefault();
  focusThemeOption(
    themeOptions[Math.min(Math.max(next, 0), themeOptions.length - 1)],
  );
});

document.addEventListener("pointerdown", (event) => {
  if (!themeMenu.hidden && !themePicker.contains(event.target as Node))
    closeThemeMenu(false);
});

soundButton.addEventListener("click", () => {
  saveSettings({ sound: !loadGame().settings.sound }, true);
});

settingsButton.addEventListener("click", () => {
  fillSettingsForm();
  settingsDialog.showModal();
});

closeSettingsButton.addEventListener("click", () => settingsDialog.close());
devBadge.addEventListener("click", () => setDevMode(false));

settingsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const roundsValue = (
    settingsForm.elements.namedItem("rounds") as HTMLSelectElement
  ).value;
  const currentSettings = loadGame().settings;
  const rounds: GameSettings["rounds"] =
    roundsValue === "endless"
      ? "endless"
      : [1, 3, 5, 7, 10].includes(Number(roundsValue))
        ? Number(roundsValue)
        : currentSettings.rounds;
  const tieModeValue = (
    settingsForm.elements.namedItem("tieMode") as HTMLSelectElement
  ).value;
  const themeModeValue = (
    settingsForm.elements.namedItem("themeMode") as HTMLSelectElement
  ).value;
  saveSettings({
    rounds,
    tieMode: tieModeValue === "download" ? "download" : "share",
    themeMode:
      themeModeValue === "auto"
        ? "auto"
        : isThemeId(themeModeValue)
          ? themeModeValue
          : currentSettings.themeMode,
    sound: (settingsForm.elements.namedItem("sound") as HTMLInputElement)
      .checked,
  });
  setDevMode(devModeInput.checked);
  settingsDialog.close();
});

document.addEventListener("gts:testing-change", (event) => {
  testing = (event as CustomEvent<boolean>).detail;
  syncControls();
});

window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", () => {
    if (settings.themeMode !== "auto") return;
    applyTheme(settings.themeMode);
    syncThemePicker();
    document.dispatchEvent(
      new CustomEvent<GameSettings>("gts:settings-change", {
        detail: settings,
      }),
    );
  });

applyTheme(settings.themeMode);
syncControls();
