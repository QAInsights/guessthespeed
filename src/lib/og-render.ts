import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { getIconData, iconToSVG } from "@iconify/utils";
import { Resvg } from "@resvg/resvg-js";
import { createElement as h, type CSSProperties } from "satori/jsx";
import type { OgCard } from "./og-cards";

const width = 1200;
const height = 630;
const ink = "#16171b";
const muted = "#565b66";
const orange = "#ff5a36";
const accents: Record<OgCard["group"], string> = {
  Play: orange,
  Learn: "#2ec4b6",
  Tools: "#ffb020",
  About: "#8ac926",
};

const require = createRequire(import.meta.url);
const phIconSet = require("@iconify-json/ph/icons.json") as Parameters<
  typeof getIconData
>[0];

type FontData = {
  name: string;
  data: Buffer;
  weight: 400 | 700 | 800;
  style: "normal";
};

type SatoriRenderer = (
  element: unknown,
  options: { width: number; height: number; fonts: FontData[] },
) => Promise<string>;

const satori = (require("satori") as { default: SatoriRenderer }).default;

let fontDataPromise: Promise<FontData[]> | undefined;

function loadFonts(): Promise<FontData[]> {
  fontDataPromise ??= Promise.all([
    readFile(
      join(
        process.cwd(),
        "node_modules/@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-800-normal.woff",
      ),
    ),
    readFile(
      join(
        process.cwd(),
        "node_modules/@fontsource/figtree/files/figtree-latin-400-normal.woff",
      ),
    ),
    readFile(
      join(
        process.cwd(),
        "node_modules/@fontsource/figtree/files/figtree-latin-700-normal.woff",
      ),
    ),
  ]).then(([bricolage, figtreeRegular, figtreeBold]) => [
    {
      name: "Bricolage Grotesque",
      data: bricolage,
      weight: 800,
      style: "normal",
    },
    {
      name: "Figtree",
      data: figtreeRegular,
      weight: 400,
      style: "normal",
    },
    {
      name: "Figtree",
      data: figtreeBold,
      weight: 700,
      style: "normal",
    },
  ]);
  return fontDataPromise;
}

function headlineSize(card: OgCard): number {
  const longestLine = Math.max(card.line1.length, card.line2.length);
  if (longestLine <= 12) return 84;
  if (longestLine <= 16) return 78;
  if (longestLine <= 19) return 72;
  if (longestLine <= 20) return 66;
  return 60;
}

function node(
  type: string,
  style: CSSProperties,
  ...children: unknown[]
): unknown {
  return h(type, { style }, ...(children as never[]));
}

function iconDataUri(iconName: string): string {
  const icon = getIconData(phIconSet, iconName);
  if (!icon) throw new Error(`Missing Phosphor icon: ${iconName}`);

  const { attributes, body } = iconToSVG(icon, {
    width: "256",
    height: "256",
  });
  const svgAttributes = Object.entries(attributes)
    .map(([name, value]) => `${name}="${value}"`)
    .join(" ");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" ${svgAttributes} fill="${ink}">${body.replaceAll("currentColor", ink)}</svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export async function renderOgCard(card: OgCard): Promise<Buffer> {
  const accent = accents[card.group];
  const iconSrc = iconDataUri(card.icon.slice("ph:".length));
  const size = headlineSize(card);
  const headingStyle: CSSProperties = {
    color: ink,
    display: "flex",
    fontFamily: "Bricolage Grotesque",
    fontSize: size,
    fontWeight: 800,
    lineHeight: 1.02,
    whiteSpace: "nowrap",
  };
  const tree = node(
    "div",
    {
      alignItems: "center",
      backgroundColor: "#eceff3",
      display: "flex",
      height,
      justifyContent: "center",
      width,
    },
    node(
      "div",
      {
        alignItems: "center",
        backgroundColor: "#ffffff",
        border: `4px solid ${ink}`,
        borderRadius: 28,
        boxShadow: `18px 18px 0 ${ink}`,
        display: "flex",
        gap: 28,
        height: 510,
        padding: "42px 52px",
        width: 1080,
      },
      node(
        "div",
        {
          alignItems: "flex-start",
          display: "flex",
          flexDirection: "column",
          height: "100%",
          justifyContent: "space-between",
          width: 680,
        },
        node(
          "div",
          {
            alignItems: "flex-start",
            display: "flex",
            flexDirection: "column",
            width: "100%",
          },
          node(
            "div",
            {
              alignItems: "center",
              display: "flex",
              gap: 18,
            },
            node(
              "div",
              {
                alignItems: "center",
                backgroundColor: orange,
                border: `4px solid ${ink}`,
                borderRadius: 16,
                boxShadow: `4px 4px 0 ${ink}`,
                color: ink,
                display: "flex",
                fontFamily: "Bricolage Grotesque",
                fontSize: 36,
                fontWeight: 800,
                height: 58,
                justifyContent: "center",
                transform: "rotate(-6deg)",
                width: 58,
              },
              "?",
            ),
            node(
              "div",
              {
                backgroundColor: accent,
                border: `2px solid ${ink}`,
                borderRadius: 999,
                boxShadow: `3px 3px 0 ${ink}`,
                color: ink,
                display: "flex",
                fontFamily: "Figtree",
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: 1,
                padding: "9px 14px",
                textTransform: "uppercase",
              },
              card.kicker,
            ),
          ),
          node(
            "div",
            {
              alignItems: "flex-start",
              display: "flex",
              flexDirection: "column",
              gap: 0,
              marginTop: 22,
              width: "100%",
            },
            node("div", headingStyle, card.line1),
            node(
              "div",
              {
                ...headingStyle,
                backgroundColor: accent,
                borderRadius: 12,
                padding: "0 12px 4px",
              },
              card.line2,
            ),
          ),
          node(
            "div",
            {
              color: muted,
              display: "flex",
              fontFamily: "Figtree",
              fontSize: 30,
              fontWeight: 400,
              lineHeight: 1.2,
              marginTop: 20,
              width: "100%",
            },
            card.subtitle,
          ),
        ),
        node(
          "div",
          {
            alignItems: "center",
            color: ink,
            display: "flex",
            fontFamily: "Figtree",
            fontSize: 15,
            fontWeight: 700,
            justifyContent: "space-between",
            width: "100%",
          },
          node("span", {}, "guessthespeed.com"),
          node("span", {}, "Made for family game night"),
        ),
      ),
      node(
        "div",
        {
          alignItems: "center",
          backgroundColor: accent,
          border: `4px solid ${ink}`,
          borderRadius: 28,
          boxShadow: `14px 14px 0 ${ink}`,
          display: "flex",
          flex: "0 0 260px",
          height: 260,
          justifyContent: "center",
          transform: "rotate(-4deg)",
          width: 260,
        },
        h("img", {
          src: iconSrc,
          style: {
            height: 156,
            objectFit: "contain",
            width: 156,
          },
        }),
      ),
    ),
  );

  const svg = await satori(tree, {
    width,
    height,
    fonts: await loadFonts(),
  });
  return Buffer.from(new Resvg(svg).render().asPng());
}
