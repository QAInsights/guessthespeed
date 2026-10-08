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
  return matcher.hasMatch(value);
}
