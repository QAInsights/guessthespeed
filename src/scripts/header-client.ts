import { loadGame, saveGame, type GameSettings } from "../lib/game";
import { readRoomLocalSettings, saveRoomLocalSettings } from "./room-settings";
import { isThemeId, themes, themeForDate, type ThemeId } from "../lib/themes";
import { playCue } from "../lib/sound";
import type { RoomView } from "../lib/room";
import {
  LOCALE_INFO,
  LOCALE_STORAGE_KEY,
  isLocale,
  localeHome,
} from "../lib/i18n";
import { defaultPlayerNames, themeLabelMessages } from "../lib/ui-messages";
import * as m from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";

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
const tvButton = $<HTMLButtonElement>("[data-tv-toggle]");
const fullscreenButton = $<HTMLButtonElement>("[data-fullscreen]");
const settingsButton = $<HTMLButtonElement>("[data-open-settings]");
const settingsDialog = $<HTMLDialogElement>("[data-settings-dialog]");
const closeSettingsButton = $<HTMLButtonElement>("[data-close-settings]");
const settingsForm = $<HTMLFormElement>("[data-settings-form]");
const devBadge = $<HTMLButtonElement>("[data-dev-badge]");
const devModeInput = $<HTMLInputElement>('input[name="devMode"]');
const tvModeInput = $<HTMLInputElement>('input[name="tvMode"]');
const fxLayer = $<HTMLDivElement>("[data-fx-layer]");
const languagePicker = $<HTMLDivElement>("[data-language-picker]");
const languageTrigger = $<HTMLButtonElement>("[data-language-trigger]");
const languageMenu = $<HTMLDivElement>("[data-language-menu]");
const languageOptions = [
  ...document.querySelectorAll<HTMLButtonElement>("[data-language-option]"),
];
const reduceMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;

const roomMode = document.documentElement.dataset.room === "1";
const loadLocalizedGame = () => loadGame(undefined, defaultPlayerNames());
const initialGame = roomMode ? null : loadLocalizedGame();
let roomHost = false;
let settings: GameSettings = roomMode
  ? {
      rounds: 3,
      tieMode: "share",
      ...readRoomLocalSettings(),
    }
  : initialGame!.settings;
let testing = initialGame?.phase === "testing";
let devMode = !roomMode && document.documentElement.dataset.dev === "1";
let tvMode = document.documentElement.dataset.tv === "1";
let activeTheme: ThemeId = "light";
devBadge.hidden = !devMode;
const homePage = document.documentElement.dataset.home === "1";
type WakeLockSentinelLike = {
  release(): Promise<void>;
  addEventListener?(
    type: "release",
    listener: () => void,
    options?: AddEventListenerOptions,
  ): void;
};
type WakeLockApi = {
  request(type: "screen"): Promise<WakeLockSentinelLike>;
};
let screenWakeLock: WakeLockSentinelLike | null = null;
let wakeLockRequest = 0;
let cursorHideTimer = 0;
const coarsePointer = window.matchMedia("(pointer: coarse)").matches;

function setDevMode(enabled: boolean) {
  if (roomMode) return;
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

function syncFullscreenControl() {
  fullscreenButton.hidden = !tvMode || !homePage || !document.fullscreenEnabled;
  const active = Boolean(document.fullscreenElement);
  fullscreenButton.setAttribute("aria-pressed", String(active));
  fullscreenButton.setAttribute(
    "aria-label",
    active ? m.header_exit_fullscreen_aria() : m.header_fullscreen_aria(),
  );
  fullscreenButton.title = active
    ? m.header_exit_fullscreen_aria()
    : m.header_fullscreen_aria();
}

function syncLanguagePicker(): void {
  const current = getLocale();
  const currentCode = $<HTMLElement>("[data-current-language]");
  if (currentCode) currentCode.textContent = current.toUpperCase();
  languageTrigger.setAttribute(
    "aria-label",
    m.header_language_aria({ language: LOCALE_INFO[current].native }),
  );
  languageOptions.forEach((option) => {
    const selected = option.dataset.languageOption === current;
    option.setAttribute("aria-selected", String(selected));
    option.tabIndex = selected ? 0 : -1;
  });
}

function focusLanguageOption(option: HTMLButtonElement): void {
  languageOptions.forEach((candidate) => {
    candidate.tabIndex = candidate === option ? 0 : -1;
  });
  option.focus();
  option.scrollIntoView({ block: "nearest" });
}

function openLanguageMenu(target: "selected" | "last" = "selected"): void {
  languageMenu.hidden = false;
  languageTrigger.setAttribute("aria-expanded", "true");
  const selected =
    languageOptions.find(
      (option) => option.getAttribute("aria-selected") === "true",
    ) ?? languageOptions[0];
  focusLanguageOption(target === "last" ? languageOptions.at(-1)! : selected);
}

function closeLanguageMenu(returnFocus = true): void {
  if (languageMenu.hidden) return;
  languageMenu.hidden = true;
  languageTrigger.setAttribute("aria-expanded", "false");
  if (returnFocus) languageTrigger.focus();
}

function selectLanguage(localeValue: string): void {
  if (!isLocale(localeValue)) return;
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, localeValue);
  } catch {}
  const isHome = document.documentElement.dataset.home === "1";
  const destination = localeHome(localeValue);
  window.location.assign(
    isHome
      ? `${destination}${window.location.search}${window.location.hash}`
      : destination,
  );
}

function showLanguageHint(): void {
  const hint = $<HTMLElement>("[data-language-hint]");
  if (
    !hint ||
    document.documentElement.dataset.dev === "1" ||
    document.documentElement.dataset.tv === "1"
  )
    return;
  try {
    if (
      localStorage.getItem(LOCALE_STORAGE_KEY) ||
      localStorage.getItem("gts:locale-hint") === "1"
    )
      return;
  } catch {
    return;
  }
  const suggestion = navigator.languages
    .map((language) => language.split("-")[0].toLowerCase())
    .find((language) => isLocale(language) && language !== "en");
  if (!suggestion || !isLocale(suggestion)) return;
  const language = LOCALE_INFO[suggestion].native;
  const text = $<HTMLElement>("[data-language-hint-text]");
  const accept = $<HTMLButtonElement>("[data-language-hint-accept]");
  const close = $<HTMLButtonElement>("[data-language-hint-close]");
  if (!text || !accept || !close) return;
  text.textContent = m.lang_hint({ language }, { locale: suggestion });
  accept.textContent = language;
  accept.setAttribute(
    "aria-label",
    m.lang_hint_accept_aria({ language }, { locale: suggestion }),
  );
  hint.hidden = false;
  accept.addEventListener("click", () => selectLanguage(suggestion));
  close.addEventListener("click", () => {
    try {
      localStorage.setItem("gts:locale-hint", "1");
    } catch {}
    hint.hidden = true;
  });
}

function syncTVControls() {
  tvButton.setAttribute("aria-pressed", String(tvMode));
  tvModeInput.checked = tvMode;
  syncFullscreenControl();
}

function releaseScreenWakeLock() {
  wakeLockRequest += 1;
  const current = screenWakeLock;
  screenWakeLock = null;
  if (current) void current.release().catch(() => {});
}

async function acquireScreenWakeLock() {
  if (!tvMode || !homePage) {
    releaseScreenWakeLock();
    return;
  }
  if (screenWakeLock) return;
  const requestId = ++wakeLockRequest;
  try {
    const wakeLock = (navigator as Navigator & { wakeLock?: WakeLockApi })
      .wakeLock;
    const current = await wakeLock?.request("screen");
    if (!current) return;
    if (requestId !== wakeLockRequest || !tvMode || !homePage) {
      await current.release().catch(() => {});
      return;
    }
    screenWakeLock = current;
    current.addEventListener?.("release", () => {
      if (screenWakeLock === current) screenWakeLock = null;
    });
  } catch {}
}

function showCursorAndScheduleHide() {
  window.clearTimeout(cursorHideTimer);
  document.body.classList.remove("tv-cursor-hidden");
  if (!tvMode || !homePage || coarsePointer) return;
  cursorHideTimer = window.setTimeout(() => {
    document.body.classList.add("tv-cursor-hidden");
  }, 3000);
}

function setTVMode(enabled: boolean) {
  tvMode = enabled;
  document.documentElement.dataset.tv = enabled ? "1" : "0";
  try {
    localStorage.setItem("gts:tv", enabled ? "1" : "0");
  } catch {}
  syncTVControls();
  document.dispatchEvent(
    new CustomEvent<boolean>("gts:tv-change", { detail: enabled }),
  );
  if (enabled) {
    void acquireScreenWakeLock();
    showCursorAndScheduleHide();
  } else {
    releaseScreenWakeLock();
    window.clearTimeout(cursorHideTimer);
    document.body.classList.remove("tv-cursor-hidden");
    if (document.fullscreenElement)
      void document.exitFullscreen().catch(() => {});
  }
}

async function toggleFullscreen() {
  if (!tvMode || !homePage || !document.fullscreenEnabled) return;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {}
  syncFullscreenControl();
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
    mode === "auto" ? m.header_theme_auto() : themeLabelMessages[mode]();
  themeAutoHint.textContent = m.header_theme_now({
    theme: themeLabelMessages[activeTheme](),
  });
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
  syncTVControls();
  soundButton.disabled = testing;
  settingsButton.disabled = testing;
  const roundsControl = settingsForm.elements.namedItem(
    "rounds",
  ) as HTMLSelectElement;
  const tieControl = settingsForm.elements.namedItem(
    "tieMode",
  ) as HTMLSelectElement;
  roundsControl.disabled = roomMode && (!roomHost || testing);
  tieControl.disabled = roomMode && (!roomHost || testing);
  $<HTMLElement>("[data-room-settings-note]").hidden = !roomMode || roomHost;
  $<HTMLElement>(".dev-setting").hidden = roomMode;
  soundButton.setAttribute("aria-pressed", String(settings.sound));
  soundButton.setAttribute(
    "aria-label",
    settings.sound ? m.header_sound_on_aria() : m.header_sound_off_aria(),
  );
  soundOn.hidden = !settings.sound;
  soundOff.hidden = settings.sound;
}

function saveSettings(patch: Partial<GameSettings>, playSound = false) {
  if (roomMode) {
    settings = { ...settings, ...patch };
    saveRoomLocalSettings({
      themeMode: settings.themeMode,
      sound: settings.sound,
    });
  } else {
    const currentGame = loadLocalizedGame();
    settings = { ...currentGame.settings, ...patch };
    saveGame({ ...currentGame, settings });
  }
  applyTheme(settings.themeMode);
  syncControls();
  document.dispatchEvent(
    new CustomEvent<GameSettings>("gts:settings-change", { detail: settings }),
  );
  if (playSound) playCue("lockIn", activeTheme, settings.sound);
}

function fillSettingsForm() {
  if (!roomMode) settings = loadLocalizedGame().settings;
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
  tvModeInput.checked = tvMode;
}

themeTrigger.addEventListener("click", () => {
  if (themeMenu.hidden) openThemeMenu();
  else closeThemeMenu();
});

languageTrigger.addEventListener("click", () => {
  if (languageMenu.hidden) openLanguageMenu();
  else closeLanguageMenu();
});

languageTrigger.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  event.preventDefault();
  openLanguageMenu(event.key === "ArrowUp" ? "last" : "selected");
});

languageOptions.forEach((option) => {
  option.addEventListener("click", () => {
    selectLanguage(option.dataset.languageOption ?? "");
    closeLanguageMenu(false);
  });
});

languageMenu.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    closeLanguageMenu();
    return;
  }
  if (event.key === "Tab") {
    closeLanguageMenu(false);
    return;
  }
  const index = languageOptions.indexOf(
    document.activeElement as HTMLButtonElement,
  );
  const steps: Record<string, number> = {
    ArrowDown: 1,
    ArrowRight: 1,
    ArrowUp: -1,
    ArrowLeft: -1,
  };
  let next: number | null = null;
  if (event.key in steps) next = index < 0 ? 0 : index + steps[event.key];
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = languageOptions.length - 1;
  if (next === null) return;
  event.preventDefault();
  focusLanguageOption(
    languageOptions[Math.min(Math.max(next, 0), languageOptions.length - 1)],
  );
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
  if (!languageMenu.hidden && !languagePicker.contains(event.target as Node))
    closeLanguageMenu(false);
});

soundButton.addEventListener("click", () => {
  saveSettings({ sound: !settings.sound }, true);
});

tvButton.addEventListener("click", () => setTVMode(!tvMode));
fullscreenButton.addEventListener("click", () => {
  void toggleFullscreen();
});
document.addEventListener("fullscreenchange", syncFullscreenControl);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void acquireScreenWakeLock();
});
window.addEventListener("mousemove", showCursorAndScheduleHide);

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
  const currentSettings = roomMode ? settings : loadLocalizedGame().settings;
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
  const tieMode = tieModeValue === "download" ? "download" : "share";
  const themeMode =
    themeModeValue === "auto"
      ? "auto"
      : isThemeId(themeModeValue)
        ? themeModeValue
        : currentSettings.themeMode;
  const sound = (settingsForm.elements.namedItem("sound") as HTMLInputElement)
    .checked;
  if (roomMode) {
    if (roomHost)
      document.dispatchEvent(
        new CustomEvent("gts:room-settings-change", {
          detail: { rounds, tieMode },
        }),
      );
    saveSettings({ themeMode, sound });
  } else {
    saveSettings({ rounds, tieMode, themeMode, sound });
    setDevMode(devModeInput.checked);
  }
  setTVMode(tvModeInput.checked);
  settingsDialog.close();
});

document.addEventListener("gts:testing-change", (event) => {
  testing = (event as CustomEvent<boolean>).detail;
  syncControls();
});

document.addEventListener("gts:room-state", (event) => {
  if (!roomMode) return;
  const view = (event as CustomEvent<RoomView>).detail;
  roomHost = view.isHost;
  settings = {
    ...settings,
    rounds: view.settings.rounds,
    tieMode: view.settings.tieMode,
  };
  (settingsForm.elements.namedItem("rounds") as HTMLSelectElement).value =
    String(settings.rounds);
  (settingsForm.elements.namedItem("tieMode") as HTMLSelectElement).value =
    settings.tieMode;
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
syncLanguagePicker();
showLanguageHint();
if (tvMode) {
  void acquireScreenWakeLock();
  showCursorAndScheduleHide();
}
