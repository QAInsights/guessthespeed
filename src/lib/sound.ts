import { themes, type ThemeId } from "./themes";

export type SoundCue =
  "lockIn" | "start" | "phase" | "tick" | "reveal" | "champion";

let context: AudioContext | undefined;
let lastTick = 0;

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  context ??= new AudioContext();
  if (context.state === "suspended") void context.resume();
  return context;
}

export function playCue(
  cue: SoundCue,
  themeId: ThemeId,
  enabled: boolean,
  progress = 0,
): void {
  if (!enabled) return;
  const nowMs = performance.now();
  if (cue === "tick") {
    if (nowMs - lastTick < 84) return;
    lastTick = nowMs;
  }
  const audio = audioContext();
  if (!audio) return;
  const palette = themes[themeId].sound;
  const notes: Record<Exclude<SoundCue, "tick">, number[]> = {
    lockIn: [0],
    start: [0, 4, 7],
    phase: [7, 12],
    reveal: [0, 4, 7, 12],
    champion: [0, 4, 7, 12, 16],
  };
  const sequence =
    cue === "tick"
      ? [Math.round(Math.min(1, progress) * (palette.scale.length - 1))]
      : notes[cue];
  sequence.forEach((step, index) => {
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    const start = audio.currentTime + index * 0.13;
    const semitone = palette.scale[Math.min(step, palette.scale.length - 1)];
    oscillator.type = palette.wave;
    oscillator.frequency.setValueAtTime(
      palette.base * 2 ** (semitone / 12),
      start,
    );
    gain.gain.setValueAtTime(cue === "tick" ? 0.025 : 0.055, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + palette.decay);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(start);
    oscillator.stop(start + palette.decay + 0.02);
  });
}
