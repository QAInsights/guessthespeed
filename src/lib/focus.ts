import type { Player } from "./game";
import type { PlayerRoundScore } from "./scoring";

export type FocusLayout = "race" | "game";
export type FocusStage = "live" | "result";

export interface FocusInput {
  dev: boolean;
  classroom: boolean;
  race: boolean;
  phase: string;
  testing: boolean;
}

export function focusLayout(
  input: FocusInput,
): { layout: FocusLayout; stage: FocusStage } | null {
  if (input.dev || input.classroom) return null;
  const live = input.testing;
  if (!live && input.phase !== "results") return null;
  return {
    layout: input.race ? "race" : "game",
    stage: live ? "live" : "result",
  };
}

export type RaceLaneState = "locked" | "thinking" | "finished" | "no-guess";

export interface RaceLane {
  id: string;
  state: RaceLaneState;
  position: number;
  multiplier: number | null;
  winner: boolean;
  score?: PlayerRoundScore;
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));

export const raceMultiplier = (position: number) => 0.5 + 0.5 * clamp(position);

export function liveRaceLanes(
  players: Pick<Player, "id" | "locked">[],
  lockFractions: ReadonlyMap<string, number>,
  progress: number,
): RaceLane[] {
  const now = clamp(progress);
  return players.map((player) => {
    if (!player.locked)
      return {
        id: player.id,
        state: "thinking",
        position: now,
        multiplier: raceMultiplier(now),
        winner: false,
      };
    const position = clamp(lockFractions.get(player.id) ?? 0);
    return {
      id: player.id,
      state: "locked",
      position,
      multiplier: raceMultiplier(position),
      winner: false,
    };
  });
}

export function finishRaceLanes(
  players: Pick<Player, "id">[],
  scores: PlayerRoundScore[],
  winners: ReadonlySet<string>,
): RaceLane[] {
  const byId = new Map(scores.map((score) => [score.id, score]));
  return players.flatMap((player): RaceLane[] => {
    const score = byId.get(player.id);
    if (!score) return [];
    if (score.timingBonus === undefined)
      return [
        {
          id: player.id,
          state: "no-guess",
          position: 0,
          multiplier: null,
          winner: false,
          score,
        },
      ];
    return [
      {
        id: player.id,
        state: "finished",
        position: clamp((score.timingBonus - 0.5) * 2),
        multiplier: score.timingBonus,
        winner: winners.has(player.id),
        score,
      },
    ];
  });
}

export function observeRaceLocks(
  previous: ReadonlyMap<string, number>,
  players: Pick<Player, "id" | "locked">[],
  progress: number,
  raceJustStarted: boolean,
): Map<string, number> {
  const next = new Map<string, number>();
  for (const player of players) {
    if (!player.locked) continue;
    const known = previous.get(player.id);
    next.set(player.id, known ?? (raceJustStarted ? 0 : clamp(progress)));
  }
  return next;
}
