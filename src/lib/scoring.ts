export type TieMode = "share" | "download";

export interface ScoringSettings {
  tieMode: TieMode;
  placePoints: number[];
  spotOnPct: number;
  maxMissPct: number;
}

export interface Guess {
  down: number | null;
  up: number | null;
}

export interface Actual {
  down: number;
  up: number;
}

export interface PlayerRoundScore {
  id: string;
  downMiss: number | null;
  upMiss: number | null;
  miss: number | null;
  place: number | null;
  placePoints: number;
  bonus: number;
  total: number;
  basePoints?: number;
  timingBonus?: number;
}

export const DEFAULT_SCORING_SETTINGS: ScoringSettings = {
  tieMode: "share",
  placePoints: [3, 2, 1],
  spotOnPct: 0.05,
  maxMissPct: 0.5,
};

const rounded = (value: number) => Math.round(value * 10_000) / 10_000;

function metricMiss(guess: number | null, actual: number): number {
  if (!(actual > 0) || !Number.isFinite(actual)) return 1;
  return guess === null ? 1 : Math.abs(guess - actual) / actual;
}

export function scoreRound(
  players: { id: string; guess: Guess }[],
  actual: Actual,
  settings: ScoringSettings,
): PlayerRoundScore[] {
  const excluded: PlayerRoundScore[] = [];
  const ranked = players.flatMap(({ id, guess }) => {
    if (guess.down === null && guess.up === null) {
      excluded.push({
        id,
        downMiss: null,
        upMiss: null,
        miss: null,
        place: null,
        placePoints: 0,
        bonus: 0,
        total: 0,
      });
      return [];
    }
    const downMiss = metricMiss(guess.down, actual.down);
    const upMiss = metricMiss(guess.up, actual.up);
    return [
      {
        id,
        downMiss,
        upMiss,
        miss: (downMiss + upMiss) / 2,
        place: null as number | null,
        placePoints: 0,
        bonus:
          Number(rounded(downMiss) <= settings.spotOnPct) +
          Number(rounded(upMiss) <= settings.spotOnPct),
        total: 0,
      },
    ];
  });

  const compare = (a: PlayerRoundScore, b: PlayerRoundScore) => {
    const missDifference = rounded(a.miss!) - rounded(b.miss!);
    if (missDifference !== 0) return missDifference;
    if (settings.tieMode === "download") {
      const downDifference = rounded(a.downMiss!) - rounded(b.downMiss!);
      if (downDifference !== 0) return downDifference;
      const upDifference = rounded(a.upMiss!) - rounded(b.upMiss!);
      if (upDifference !== 0) return upDifference;
    }
    return 0;
  };

  ranked.sort(compare);
  const eligible = ranked.filter(
    (result) => rounded(result.miss!) <= settings.maxMissPct,
  );
  const tooFar = ranked.filter(
    (result) => rounded(result.miss!) > settings.maxMissPct,
  );
  let place = 0;
  for (let index = 0; index < eligible.length; index += 1) {
    if (index === 0 || compare(eligible[index - 1], eligible[index]) !== 0) {
      place = index + 1;
    }
    const result = eligible[index];
    result.place = place;
    result.placePoints = settings.placePoints[place - 1] ?? 0;
    result.total = result.placePoints + result.bonus;
  }
  for (const result of tooFar) {
    result.place = null;
    result.placePoints = 0;
    result.total = result.bonus;
  }

  const byId = new Map(
    [...ranked, ...excluded].map((result) => [result.id, result]),
  );
  return players.map(({ id }) => byId.get(id)!);
}

export function applyRaceTiming(
  scores: PlayerRoundScore[],
  players: { id: string; guessedAt?: number | null }[],
  raceStartedAt: number | undefined,
  endedAt: number,
): PlayerRoundScore[] {
  const guessedAtById = new Map(
    players.map((player) => [player.id, player.guessedAt]),
  );

  return scores.map((score) => {
    const hasGuess = score.miss !== null;
    const basePoints = score.placePoints + score.bonus * 10;
    if (!hasGuess)
      return { ...score, basePoints: 0, total: 0, timingBonus: undefined };

    const guessedAt = guessedAtById.get(score.id);
    let timingBonus = 0.5;
    if (
      raceStartedAt !== undefined &&
      typeof guessedAt === "number" &&
      Number.isFinite(guessedAt) &&
      guessedAt >= raceStartedAt
    ) {
      const duration = endedAt - raceStartedAt;
      const fraction =
        duration === 0
          ? 1
          : Math.max(0, Math.min(1, (guessedAt - raceStartedAt) / duration));
      timingBonus = 0.5 + 0.5 * fraction;
    }

    return {
      ...score,
      basePoints,
      timingBonus,
      total: Math.round(basePoints * timingBonus),
    };
  });
}
