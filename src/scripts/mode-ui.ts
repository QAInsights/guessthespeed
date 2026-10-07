export function devBadgeVisible(input: {
  devMode: boolean;
  modeSwitchVisible: boolean;
}): boolean {
  return input.devMode && !input.modeSwitchVisible;
}
