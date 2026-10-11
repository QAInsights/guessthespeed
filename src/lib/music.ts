import { audioContext } from "./sound";

export type MusicTrack = "lobby" | "champion";

export interface MusicInput {
  enabled: boolean;
  dev: boolean;
  phase: string;
  testing: boolean;
  championOpen: boolean;
}

export function musicTrack(input: MusicInput): MusicTrack | null {
  if (!input.enabled || input.dev) return null;
  if (input.championOpen) return "champion";
  if (input.testing || input.phase === "champion") return null;
  return "lobby";
}

const TRACKS: Record<
  MusicTrack,
  { src: string; loop: boolean; volume: number }
> = {
  lobby: { src: "/audio/lobby-theme-v1.mp3", loop: true, volume: 0.5 },
  champion: {
    src: "/audio/champion-fanfare-v1.mp3",
    loop: false,
    volume: 0.85,
  },
};

const FADE_IN = 0.6;
const FADE_OUT = 0.8;

interface Channel {
  element: HTMLAudioElement;
  gain: GainNode;
  stopTimer?: number;
}

const channels = new Map<MusicTrack, Channel>();
let current: MusicTrack | null = null;
let waitingForGesture = false;
let listening = false;

function channel(track: MusicTrack): Channel | null {
  const existing = channels.get(track);
  if (existing) return existing;
  const context = audioContext();
  if (!context) return null;
  const { src, loop } = TRACKS[track];
  const element = new Audio(src);
  element.loop = loop;
  element.preload = "auto";
  const gain = context.createGain();
  gain.gain.value = 0;
  context
    .createMediaElementSource(element)
    .connect(gain)
    .connect(context.destination);
  const created = { element, gain };
  channels.set(track, created);
  return created;
}

function rampTo(gain: GainNode, value: number, seconds: number) {
  const context = gain.context;
  const now = context.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(gain.gain.value, now);
  gain.gain.linearRampToValueAtTime(value, now + seconds);
}

function play(track: MusicTrack) {
  const target = channel(track);
  if (!target) return;
  window.clearTimeout(target.stopTimer);
  const context = target.gain.context as AudioContext;
  const blocked = () => {
    if (current === track) waitingForGesture = true;
  };
  const started = () => {
    if (current !== track) return;
    if (context.state !== "running") {
      blocked();
      return;
    }
    waitingForGesture = false;
    rampTo(target.gain, TRACKS[track].volume, FADE_IN);
  };
  waitingForGesture = true;
  const resumed =
    context.state === "running" ? Promise.resolve() : context.resume();
  Promise.all([resumed, target.element.play()]).then(started, blocked);
}

function stop(track: MusicTrack) {
  const target = channels.get(track);
  if (!target) return;
  rampTo(target.gain, 0, FADE_OUT);
  window.clearTimeout(target.stopTimer);
  target.stopTimer = window.setTimeout(
    () => {
      target.element.pause();
      if (!target.element.loop) target.element.currentTime = 0;
    },
    FADE_OUT * 1000 + 50,
  );
}

function retryAfterGesture() {
  if (!waitingForGesture || !current || document.hidden) return;
  play(current);
}

function listen() {
  if (listening || typeof document === "undefined") return;
  listening = true;
  for (const type of [
    "pointerdown",
    "pointerup",
    "click",
    "touchend",
    "keydown",
  ])
    document.addEventListener(type, retryAfterGesture, true);
  document.addEventListener("visibilitychange", () => {
    if (!current) return;
    const target = channels.get(current);
    if (!target) return;
    if (document.hidden) target.element.pause();
    else play(current);
  });
}

export function setMusic(track: MusicTrack | null): void {
  if (typeof window === "undefined") return;
  if (track === current) return;
  const previous = current;
  current = track;
  if (previous) stop(previous);
  if (!track) return;
  listen();
  if (track === "champion") {
    const fanfare = channel(track);
    if (fanfare) fanfare.element.currentTime = 0;
  }
  if (!document.hidden) play(track);
}
