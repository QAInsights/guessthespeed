import { describe, expect, it } from "vitest";
import { applyRaceTiming, scoreRound, type ScoringSettings } from "./scoring";

const defaults: ScoringSettings = {
  tieMode: "share",
  placePoints: [3, 2, 1],
  spotOnPct: 0.05,
  maxMissPct: 0.5,
};
const actual = { down: 100, up: 20 };
const player = (id: string, down: number | null, up: number | null) => ({
  id,
  guess: { down, up },
});

describe("scoreRound", () => {
  it("awards 3, 2, and 1 for first, second, and third", () => {
    const scores = scoreRound(
      [player("one", 100, 20), player("two", 90, 18), player("three", 70, 16)],
      actual,
      defaults,
    );
    expect(
      scores.map(({ place, placePoints }) => [place, placePoints]),
    ).toEqual([
      [1, 3],
      [2, 2],
      [3, 1],
    ]);
  });

  it("withholds place points from a solo guess over 50% average miss", () => {
    const [score] = scoreRound(
      [player("solo", 50, 50)],
      { down: 557.7, up: 186.7 },
      defaults,
    );
    expect(score).toMatchObject({
      place: null,
      placePoints: 0,
      total: 0,
    });
  });

  it("skips too-far guesses when assigning places", () => {
    const scores = scoreRound(
      [player("a", 100, 20), player("b", 30, 5), player("c", 60, 12)],
      actual,
      defaults,
    );
    expect(
      scores.map(({ id, place, placePoints }) => [id, place, placePoints]),
    ).toEqual([
      ["a", 1, 3],
      ["b", null, 0],
      ["c", 2, 2],
    ]);
  });

  it("keeps an exactly 50% average miss eligible", () => {
    const [score] = scoreRound([player("half", 50, 10)], actual, defaults);
    expect(score).toMatchObject({
      place: 1,
      placePoints: 3,
      total: 3,
    });
  });

  it("keeps zero-speed results finite and assigns places", () => {
    const scores = scoreRound(
      [player("zero", 0, 20), player("positive", 100, 20)],
      { down: 0, up: 20 },
      defaults,
    );
    expect(
      scores.every(
        (score) => score.miss === null || Number.isFinite(score.miss),
      ),
    ).toBe(true);
    expect(scores.map(({ place }) => place)).toEqual([1, 1]);
  });

  it("keeps spot-on bonuses for a too-far guess", () => {
    const [score] = scoreRound([player("bonus", 100, 80)], actual, defaults);
    expect(score).toMatchObject({
      place: null,
      placePoints: 0,
      bonus: 1,
      total: 1,
    });
  });

  it("shares eligible ties without assigning places to too-far guesses", () => {
    const scores = scoreRound(
      [
        player("one", 100, 20),
        player("two", 100, 20),
        player("three", 80, 16),
        player("far", 0, 0),
      ],
      actual,
      defaults,
    );
    expect(
      scores.map(({ id, place, placePoints }) => [id, place, placePoints]),
    ).toEqual([
      ["one", 1, 3],
      ["two", 1, 3],
      ["three", 3, 1],
      ["far", null, 0],
    ]);
  });

  it("shares first place points and skips the occupied next place", () => {
    const scores = scoreRound(
      [player("one", 100, 20), player("two", 100, 20), player("three", 80, 20)],
      actual,
      defaults,
    );
    expect(
      scores.map(({ place, placePoints }) => [place, placePoints]),
    ).toEqual([
      [1, 3],
      [1, 3],
      [3, 1],
    ]);
  });

  it("uses download miss as a tiebreak when requested", () => {
    const scores = scoreRound(
      [player("download-winner", 100, 18), player("upload-winner", 90, 20)],
      actual,
      { ...defaults, tieMode: "download" },
    );
    expect(scores.map(({ id, place }) => [id, place])).toEqual([
      ["download-winner", 1],
      ["upload-winner", 2],
    ]);
  });

  it("shares a tie that remains equal after the download tiebreak", () => {
    const scores = scoreRound(
      [player("one", 90, 20), player("two", 90, 20)],
      actual,
      { ...defaults, tieMode: "download" },
    );
    expect(
      scores.map(({ place, placePoints }) => [place, placePoints]),
    ).toEqual([
      [1, 3],
      [1, 3],
    ]);
  });

  it("uses upload miss when rounded average and download misses tie", () => {
    const scores = scoreRound(
      [
        player("upload-miss-0.1", 90, 90),
        player("upload-miss-0.09994", 90, 90.006),
      ],
      { down: 100, up: 100 },
      { ...defaults, tieMode: "download" },
    );
    expect(scores.map(({ id, place }) => [id, place])).toEqual([
      ["upload-miss-0.1", 2],
      ["upload-miss-0.09994", 1],
    ]);
  });

  it("awards one or two spot-on bonuses", () => {
    const scores = scoreRound(
      [player("one", 100, 30), player("two", 102, 19)],
      actual,
      defaults,
    );
    expect(scores.map(({ bonus }) => bonus)).toEqual([1, 2]);
  });

  it("awards the spot-on bonus at an exact 5% error", () => {
    const [score] = scoreRound(
      [player("five-percent", 705.6, null)],
      { down: 672, up: 20 },
      defaults,
    );
    expect(score.downMiss).toBeCloseTo(0.05);
    expect(score.bonus).toBe(1);
  });

  it("treats one missing metric as a full miss for that metric", () => {
    const [score] = scoreRound(
      [player("partial", 100, null)],
      actual,
      defaults,
    );
    expect(score.downMiss).toBe(0);
    expect(score.upMiss).toBe(1);
    expect(score.miss).toBe(0.5);
  });

  it("excludes players without either guess", () => {
    const scores = scoreRound([player("none", null, null)], actual, defaults);
    expect(scores[0]).toMatchObject({
      place: null,
      placePoints: 0,
      bonus: 0,
      total: 0,
    });
  });

  it("supports fewer than three players and points beyond the configured places", () => {
    const two = scoreRound(
      [player("one", 100, 20), player("two", 90, 20)],
      actual,
      defaults,
    );
    expect(two.map(({ placePoints }) => placePoints)).toEqual([3, 2]);
    const four = scoreRound(
      [
        player("a", 100, 20),
        player("b", 90, 20),
        player("c", 80, 20),
        player("d", 70, 20),
      ],
      actual,
      defaults,
    );
    expect(four[3].placePoints).toBe(0);
  });

  it("rounds miss values to four decimals before comparing ties", () => {
    const scores = scoreRound(
      [player("exact", 100, 100), player("near", 100.003, 100)],
      { down: 100, up: 100 },
      defaults,
    );
    expect(scores.map(({ place }) => place)).toEqual([1, 1]);
  });
});

describe("applyRaceTiming", () => {
  const [baseScore] = scoreRound([player("racer", 100, 20)], actual, {
    ...defaults,
    placePoints: [30, 20, 10],
  });

  it.each([
    [0, 0.5, 25],
    [50, 0.75, 38],
    [100, 1, 50],
  ])("applies timing at %s%% of the test", (at, timingBonus, total) => {
    const [score] = applyRaceTiming(
      [baseScore],
      [{ id: "racer", guessedAt: at }],
      0,
      100,
    );
    expect(score).toMatchObject({ basePoints: 50, timingBonus, total });
  });

  it("gives pre-start or missing guesses the minimum timing bonus", () => {
    const [preStart] = applyRaceTiming(
      [baseScore],
      [{ id: "racer", guessedAt: 99 }],
      100,
      200,
    );
    const [missing] = applyRaceTiming(
      [baseScore],
      [{ id: "racer", guessedAt: null }],
      100,
      200,
    );
    expect(preStart.timingBonus).toBe(0.5);
    expect(missing.timingBonus).toBe(0.5);
  });

  it("uses a full timing bonus when the race has zero duration", () => {
    const [score] = applyRaceTiming(
      [baseScore],
      [{ id: "racer", guessedAt: 100 }],
      100,
      100,
    );
    expect(score.timingBonus).toBe(1);
  });

  it("rounds multiplied race totals to whole points", () => {
    const [score] = applyRaceTiming(
      [{ ...baseScore, placePoints: 30, bonus: 0 }],
      [{ id: "racer", guessedAt: 50 }],
      0,
      100,
    );
    expect(score).toMatchObject({
      basePoints: 30,
      timingBonus: 0.75,
      total: 23,
    });
  });

  it("keeps a missing guess at zero points", () => {
    const noGuess = scoreRound([player("racer", null, null)], actual, {
      ...defaults,
      placePoints: [30, 20, 10],
    });
    const [score] = applyRaceTiming(noGuess, [], 0, 100);
    expect(score).toMatchObject({ basePoints: 0, total: 0 });
    expect(score.timingBonus).toBeUndefined();
  });
});
