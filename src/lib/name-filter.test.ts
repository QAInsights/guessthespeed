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
  it("checks package-provided samples and reports unsupported variant types", () => {
    expect(samples.length).toBe(3);
    const unsupported = new Set<string>();
    for (const word of samples) {
      expect(isBlockedName(word), "as-is").toBe(true);
      expect(isBlockedName(word.toUpperCase()), "uppercase").toBe(true);
      if (!isBlockedName(Array.from(word).join(" ")))
        unsupported.add("letters separated by spaces");
      expect(isBlockedName(`Big ${word}`), "inside a longer name").toBe(true);
    }
    if (unsupported.size)
      console.info(
        `Package matcher does not catch: ${[...unsupported].sort().join(", ")}`,
      );
  });

  it.each(allowedNames)("allows the name %s", (name) => {
    expect(isBlockedName(name)).toBe(false);
  });
});
