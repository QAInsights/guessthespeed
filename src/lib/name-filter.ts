import {
  englishDataset,
  englishRecommendedTransformers,
  RegExpMatcher,
} from "obscenity";

export const BLOCKED_NAME_MESSAGE =
  "That name isn't allowed here. Try a friendlier one.";

const dataset = englishDataset.build();
const matcher = new RegExpMatcher({
  ...dataset,
  ...englishRecommendedTransformers,
  whitelistedTerms: [
    ...(dataset.whitelistedTerms ?? []),
    "shital",
    "shitij",
    "analise",
    "harshit",
    "dikshit",
  ],
});

export function isBlockedName(value: string): boolean {
  if (matcher.hasMatch(value)) return true;

  let run: string[] = [];
  for (const token of value.split(/[\s._*\-]+/)) {
    if (Array.from(token).length === 1) {
      run.push(token);
      continue;
    }
    if (run.length >= 3 && matcher.hasMatch(run.join(""))) return true;
    run = [];
  }
  return run.length >= 3 && matcher.hasMatch(run.join(""));
}
