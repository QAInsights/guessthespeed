import { describe, expect, it } from "vitest";
import { englishDataset } from "obscenity";
import { isBlockedName } from "./name-filter";

function sampleDatasetWords(): string[] {
  const samples: string[] = [];
  englishDataset.removePhrasesIf((phrase) => {
    const word = phrase.metadata?.originalWord;
    if (word && !samples.includes(word) && samples.length < 3)
      samples.push(word);
    return false;
  });
  return samples;
}

const samples = sampleDatasetWords();
const allowedNames = [
  "Mom",
  "Dad",
  "J R Smith",
  "A B C",
  "Big Sis",
  "Little One",
  "Grandpa Raj",
  "Player 1",
  "Cassie",
  "Titus",
  "Essex",
  "Sussex",
  "Shital",
  "Nazir",
  "Hancock",
  "Peacock",
  "Dickens",
  "Grape",
  "Passion",
  "Glass",
  "Cumberbatch",
  "Assad",
  "Shitij",
  "Analise",
  "Harshit",
  "Dikshit",
  "👧",
  "",
];

describe("name filter", () => {
  it("blocks dataset samples across separated-letter variants", () => {
    expect(samples.length).toBe(3);
    for (const word of samples) {
      const lettersSeparatedBySpaces = Array.from(word).join(" ");
      expect(isBlockedName(word), "as-is").toBe(true);
      expect(isBlockedName(word.toUpperCase()), "uppercase").toBe(true);
      expect(
        isBlockedName(lettersSeparatedBySpaces),
        "letters separated by spaces",
      ).toBe(true);
      expect(
        isBlockedName(Array.from(word).join(".")),
        "letters separated by dots",
      ).toBe(true);
      expect(
        isBlockedName(`Big ${lettersSeparatedBySpaces}`),
        "inside a longer name with letters separated",
      ).toBe(true);
      expect(isBlockedName(`Big ${word}`), "inside a longer name").toBe(true);
    }
  });

  it.each(allowedNames)("allows the name %s", (name) => {
    expect(isBlockedName(name)).toBe(false);
  });
});
