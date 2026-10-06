import * as m from "../paraglide/messages.js";
import type { RoleId } from "./game";
import type { ThemeId } from "./themes";

export const themeLabelMessages: Record<ThemeId, () => string> = {
  light: () => m.theme_light(),
  dark: () => m.theme_dark(),
  halloween: () => m.theme_halloween(),
  diwali: () => m.theme_diwali(),
  thanksgiving: () => m.theme_thanksgiving(),
  winter: () => m.theme_winter(),
  christmas: () => m.theme_christmas(),
  newyear: () => m.theme_newyear(),
  pongal: () => m.theme_pongal(),
  valentines: () => m.theme_valentines(),
  holi: () => m.theme_holi(),
  easter: () => m.theme_easter(),
};

export const themeHintMessages: Record<ThemeId, () => string> = {
  light: () => m.theme_hint_light(),
  dark: () => m.theme_hint_dark(),
  halloween: () => m.theme_hint_halloween(),
  diwali: () => m.theme_hint_diwali(),
  thanksgiving: () => m.theme_hint_thanksgiving(),
  winter: () => m.theme_hint_winter(),
  christmas: () => m.theme_hint_christmas(),
  newyear: () => m.theme_hint_newyear(),
  pongal: () => m.theme_hint_pongal(),
  valentines: () => m.theme_hint_valentines(),
  holi: () => m.theme_hint_holi(),
  easter: () => m.theme_hint_easter(),
};

export const roleLabelMessages: Record<RoleId, () => string> = {
  dad: () => m.role_dad(),
  mom: () => m.role_mom(),
  brother: () => m.role_brother(),
  sister: () => m.role_sister(),
  baby: () => m.role_baby(),
  grandpa: () => m.role_grandpa(),
  grandma: () => m.role_grandma(),
  cousin: () => m.role_cousin(),
  friend: () => m.role_friend(),
  dog: () => m.role_dog(),
  cat: () => m.role_cat(),
};

const legacyRoleIds: Record<string, RoleId> = {
  Dad: "dad",
  Mom: "mom",
  Brother: "brother",
  Sister: "sister",
  Baby: "baby",
  Grandpa: "grandpa",
  Grandma: "grandma",
  Cousin: "cousin",
  Friend: "friend",
  Dog: "dog",
  Cat: "cat",
};

export function roleLabel(role: string): string {
  const id = Object.hasOwn(roleLabelMessages, role)
    ? (role as RoleId)
    : legacyRoleIds[role];
  return id ? roleLabelMessages[id]() : role;
}

export function defaultPlayerNames(): string[] {
  return [
    m.role_default_mom_name(),
    m.role_default_dad_name(),
    m.role_default_big_sis_name(),
    m.role_default_little_sis_name(),
  ];
}
