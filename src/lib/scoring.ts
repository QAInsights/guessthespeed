export type TieMode = "share" | "download";

export interface ScoringSettings {
  tieMode: TieMode;
  placePoints: number[];
  spotOnPct: number;
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
}

export const DEFAULT_SCORING_SETTINGS: ScoringSettings = {
  tieMode: "share",
  placePoints: [3, 2, 1],
  spotOnPct: 0.05,
};

const rounded = (value: number) => Math.round(value * 10_000) / 10_000;

function metricMiss(guess: number | null, actual: number): number {
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
          Number(downMiss <= settings.spotOnPct) +
          Number(upMiss <= settings.spotOnPct),
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
  let place = 0;
  for (let index = 0; index < ranked.length; index += 1) {
    if (index === 0 || compare(ranked[index - 1], ranked[index]) !== 0) {
      place = index + 1;
    }
    const result = ranked[index];
    result.place = place;
    result.placePoints = settings.placePoints[place - 1] ?? 0;
    result.total = result.placePoints + result.bonus;
  }

  const byId = new Map(
    [...ranked, ...excluded].map((result) => [result.id, result]),
  );
  return players.map(({ id }) => byId.get(id)!);
}
