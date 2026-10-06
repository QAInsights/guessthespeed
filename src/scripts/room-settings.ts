import { isThemeMode, type GameSettings } from "../lib/game";

export interface RoomLocalSettings {
  themeMode: GameSettings["themeMode"];
  sound: boolean;
  confetti: boolean;
}

const STORAGE_KEY = "gts:room-settings";

export function readRoomLocalSettings(): RoomLocalSettings {
  const defaults: RoomLocalSettings = {
    themeMode: "auto",
    sound: true,
    confetti: true,
  };
  try {
    const saved: unknown = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "null",
    );
    if (!isRecord(saved)) return defaults;
    return {
      themeMode:
        typeof saved.themeMode === "string" && isThemeMode(saved.themeMode)
          ? saved.themeMode
          : defaults.themeMode,
      sound: typeof saved.sound === "boolean" ? saved.sound : defaults.sound,
      confetti:
        typeof saved.confetti === "boolean"
          ? saved.confetti
          : defaults.confetti,
    };
  } catch {
    return defaults;
  }
}

export function saveRoomLocalSettings(settings: RoomLocalSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    return;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
