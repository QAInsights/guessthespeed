import { loadGame, saveGame, type GameSettings } from "../lib/game";
import { isThemeId, themes, themeForDate, type ThemeId } from "../lib/themes";
import { playCue } from "../lib/sound";

const $ = <T extends Element>(selector: string): T =>
  document.querySelector(selector) as T;

const themeSelect = $<HTMLSelectElement>("[data-theme-select]");
const soundButton = $<HTMLButtonElement>("[data-sound-toggle]");
const soundOn = $<HTMLSpanElement>("[data-sound-on]");
const soundOff = $<HTMLSpanElement>("[data-sound-off]");
const settingsButton = $<HTMLButtonElement>("[data-open-settings]");
const settingsDialog = $<HTMLDialogElement>("[data-settings-dialog]");
const closeSettingsButton = $<HTMLButtonElement>("[data-close-settings]");
const settingsForm = $<HTMLFormElement>("[data-settings-form]");
const fxLayer = $<HTMLDivElement>("[data-fx-layer]");
const reduceMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;

const initialGame = loadGame();
let settings = initialGame.settings;
let testing = initialGame.phase === "testing";
let activeTheme: ThemeId = "light";

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

function syncControls() {
  themeSelect.value = settings.themeMode;
  themeSelect.disabled = testing;
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
}

themeSelect.addEventListener("change", () => {
  const mode = themeSelect.value;
  saveSettings({ themeMode: isThemeId(mode) ? mode : "auto" }, true);
});

soundButton.addEventListener("click", () => {
  saveSettings({ sound: !loadGame().settings.sound }, true);
});

settingsButton.addEventListener("click", () => {
  fillSettingsForm();
  settingsDialog.showModal();
});

closeSettingsButton.addEventListener("click", () => settingsDialog.close());

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
    document.dispatchEvent(
      new CustomEvent<GameSettings>("gts:settings-change", {
        detail: settings,
      }),
    );
  });

applyTheme(settings.themeMode);
syncControls();
