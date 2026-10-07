import { loadGame, saveGame, type GameSettings } from "../lib/game";
import { readRoomLocalSettings, saveRoomLocalSettings } from "./room-settings";
import { isThemeId, themes, themeForDate, type ThemeId } from "../lib/themes";
import { playCue, unlockAudio } from "../lib/sound";
import type { RoomView } from "../lib/room";
import { loadSession } from "../lib/classroom";
import { describeTarget, isOverlayOpen, shortcutAction } from "./shortcuts";
import { devBadgeVisible } from "./mode-ui";
import { $ } from "./dom";

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
const modeSwitch = document.querySelector<HTMLElement>("[data-mode-switch]");
const modeOptions = Array.from(
  modeSwitch?.querySelectorAll<HTMLElement>("[data-mode-option]") ?? [],
);
const fxLayer = $<HTMLDivElement>("[data-fx-layer]");
const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
let reduceMotion = reduceMotionQuery.matches;
reduceMotionQuery.addEventListener("change", (event) => {
  reduceMotion = event.matches;
});

const roomMode = document.documentElement.dataset.room === "1";
let classroomMode = loadSession() !== null;
const initialGame = roomMode ? null : loadGame();
let roomHost = false;
let settings: GameSettings = roomMode
  ? {
      rounds: 3,
      tieMode: "share",
      ...readRoomLocalSettings(),
    }
  : initialGame!.settings;
let testing = initialGame?.phase === "testing";
let devMode =
  !roomMode && !classroomMode && document.documentElement.dataset.dev === "1";
let tvMode = document.documentElement.dataset.tv === "1";
let activeTheme: ThemeId = "light";
const homePage = window.location.pathname === "/";
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
const tvLayoutQuery = window.matchMedia("(min-width: 900px)");

function syncAudioUnlock() {
  if (settings.sound) {
    document.addEventListener("pointerdown", unlockAudio, { once: true });
    document.addEventListener("keydown", unlockAudio, { once: true });
  } else {
    document.removeEventListener("pointerdown", unlockAudio);
    document.removeEventListener("keydown", unlockAudio);
  }
}

function syncModeSwitch() {
  if (modeSwitch) {
    classroomMode = loadSession() !== null;
    modeSwitch.hidden = roomMode || (tvMode && tvLayoutQuery.matches);
    const selectedMode = devMode ? "dev" : "game";
    modeOptions.forEach((option) => {
      const optionMode = option.dataset.modeOption;
      const selected = !classroomMode && optionMode === selectedMode;
      const activeClassroom =
        optionMode === "classroom" && (!homePage || classroomMode);
      option.classList.toggle(
        "is-disabled",
        classroomMode && optionMode !== "classroom",
      );
      if (classroomMode && optionMode !== "classroom") {
        option.setAttribute("aria-disabled", "true");
        option.setAttribute("title", "End class to switch modes");
      } else {
        option.removeAttribute("aria-disabled");
        option.removeAttribute("title");
      }
      if (option instanceof HTMLButtonElement)
        option.setAttribute("aria-pressed", String(selected));
      if (activeClassroom) option.setAttribute("aria-current", "page");
      else option.removeAttribute("aria-current");
    });
  }
  syncDevBadge();
}

tvLayoutQuery.addEventListener("change", syncModeSwitch);

function syncDevBadge() {
  devBadge.hidden = !devBadgeVisible({
    devMode,
    modeSwitchVisible: Boolean(modeSwitch && !modeSwitch.hidden),
  });
}

function setDevMode(enabled: boolean) {
  if (roomMode || classroomMode) return;
  devMode = enabled;
  if (enabled) document.documentElement.dataset.dev = "1";
  else delete document.documentElement.dataset.dev;
  syncModeSwitch();
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
    active ? "Exit full screen" : "Full screen",
  );
  fullscreenButton.title = active ? "Exit full screen" : "Full screen";
}

function syncTVControls() {
  tvButton.setAttribute("aria-pressed", String(tvMode));
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
  if (document.body.classList.contains("tv-cursor-hidden"))
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
  soundButton.setAttribute("aria-pressed", String(settings.sound));
  soundButton.setAttribute(
    "aria-label",
    settings.sound ? "Turn sound off" : "Turn sound on",
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
      confetti: settings.confetti,
    });
  } else {
    const currentGame = loadGame();
    settings = { ...currentGame.settings, ...patch };
    saveGame({ ...currentGame, settings });
  }
  applyTheme(settings.themeMode);
  syncAudioUnlock();
  syncControls();
  document.dispatchEvent(
    new CustomEvent<GameSettings>("gts:settings-change", { detail: settings }),
  );
  if (playSound) playCue("lockIn", activeTheme, settings.sound);
}

function fillSettingsForm() {
  if (!roomMode) settings = loadGame().settings;
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
  (settingsForm.elements.namedItem("confetti") as HTMLInputElement).checked =
    settings.confetti;
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
  const columns =
    event.key === "ArrowDown" || event.key === "ArrowUp"
      ? getComputedStyle(themeList)
          .gridTemplateColumns.split(" ")
          .filter(Boolean).length
      : 1;
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
  saveSettings({ sound: !settings.sound }, true);
});

tvButton.addEventListener("click", () => setTVMode(!tvMode));
fullscreenButton.addEventListener("click", () => {
  void toggleFullscreen();
});
document.addEventListener("keydown", (event) => {
  const action = shortcutAction({
    key: event.key,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    altKey: event.altKey,
    repeat: event.repeat,
    target: describeTarget(event.target),
    overlayOpen: isOverlayOpen(document),
  });
  if (action === "fullscreen") void toggleFullscreen();
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

modeOptions.forEach((option) => {
  option.addEventListener("click", (event) => {
    const optionMode = option.dataset.modeOption;
    if (classroomMode && optionMode !== "classroom") {
      event.preventDefault();
      return;
    }
    if (option instanceof HTMLButtonElement) setDevMode(optionMode === "dev");
  });
});

document.addEventListener("gts:dev-change", (event) => {
  devMode = (event as CustomEvent<boolean>).detail;
  syncModeSwitch();
});

document.addEventListener("gts:tv-change", syncModeSwitch);
document.addEventListener("gts:classroom-change", syncModeSwitch);

settingsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const roundsValue = (
    settingsForm.elements.namedItem("rounds") as HTMLSelectElement
  ).value;
  const currentSettings = roomMode ? settings : loadGame().settings;
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
  const confetti = (
    settingsForm.elements.namedItem("confetti") as HTMLInputElement
  ).checked;
  if (roomMode) {
    if (roomHost)
      document.dispatchEvent(
        new CustomEvent("gts:room-settings-change", {
          detail: { rounds, tieMode },
        }),
      );
    saveSettings({ themeMode, sound, confetti });
  } else {
    saveSettings({ rounds, tieMode, themeMode, sound, confetti });
  }
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
syncAudioUnlock();
syncModeSwitch();
syncControls();
if (tvMode) {
  void acquireScreenWakeLock();
  showCursorAndScheduleHide();
}
