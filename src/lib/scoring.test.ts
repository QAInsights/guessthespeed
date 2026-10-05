import { describe, expect, it } from "vitest";
import { scoreRound, type ScoringSettings } from "./scoring";

const defaults: ScoringSettings = {
  tieMode: "share",
  placePoints: [3, 2, 1],
  spotOnPct: 0.05,
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

  it("awards one or two spot-on bonuses", () => {
    const scores = scoreRound(
      [player("one", 100, 30), player("two", 102, 19)],
      actual,
      defaults,
    );
    expect(scores.map(({ bonus }) => bonus)).toEqual([1, 2]);
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
