export const AURORA_PALETTE_SIZE = 5;

export interface AuroraStyle {
  colors: number[];
  durationS: number;
  angleDeg: number;
  delayS: number;
}

function fnv1a(seed: string): number {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(seed)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    let value = (state += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function auroraFor(seed: string): AuroraStyle {
  const random = mulberry32(fnv1a(seed));
  const colorCount = random() < 0.5 ? 2 : 3;
  const colors: number[] = [];
  while (colors.length < colorCount) {
    const color = 1 + Math.floor(random() * AURORA_PALETTE_SIZE);
    if (!colors.includes(color)) colors.push(color);
  }
  const durationS = Math.round((12 + random() * 6) * 10) / 10;
  const angleDeg = Math.floor(random() * 360);
  const delayS = -Math.round(random() * (durationS - 0.1) * 10) / 10;

  return { colors, durationS, angleDeg, delayS };
}

export function auroraStyleVars(style: AuroraStyle): string {
  const [a, b, third] = style.colors;
  const c = third ?? a;
  return `--aurora-a:var(--aurora-${a});--aurora-b:var(--aurora-${b});--aurora-c:var(--aurora-${c});--aurora-dur:${style.durationS.toFixed(1)}s;--aurora-start:${style.angleDeg}deg;--aurora-delay:${style.delayS.toFixed(1)}s`;
}
