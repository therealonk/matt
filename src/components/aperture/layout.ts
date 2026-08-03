/*
 * buildSlots — aperture.md §3. Deterministic (no RNG); rebuilt on resize.
 * Desktop: 13 hand-placed slots on three column lines, looping every
 * TILE_H_DESKTOP·vw. Mobile: two-column masonry with a hand-placed feel,
 * varied by a stable per-index hash.
 */

import {
  DESKTOP_SLOTS,
  MOBILE_BREAKPOINT,
  MOBILE_GUTTER,
  MOBILE_OUTER,
  MOBILE_VGAP,
  TILE_H_DESKTOP,
} from "./tunables";

export type Cell = {
  index: number;
  x: number; // px
  baseY: number; // px, within one tile
  width: number; // px
  height: number; // px
  shootIndex: number; // which shoot's cover this frame shows
};

export type WallLayout = { cells: Cell[]; tileH: number };

export const isMobile = (vw: number) => vw < MOBILE_BREAKPOINT;

// frac(sin((i+1)·12.9898 + seed·7.233) · 43758.5453) — stable across resizes
const rand = (i: number, seed: number) => {
  const v = Math.sin((i + 1) * 12.9898 + seed * 7.233) * 43758.5453;
  return v - Math.floor(v);
};

export function buildSlots(vw: number, shootCount: number): WallLayout {
  if (!isMobile(vw)) {
    const cells: Cell[] = DESKTOP_SLOTS.map((s, i) => ({
      index: i,
      x: s.x * vw,
      baseY: s.y * vw,
      width: s.w * vw,
      height: (s.w / s.aspect) * vw,
      shootIndex: i % shootCount,
    }));
    return { cells, tileH: TILE_H_DESKTOP * vw };
  }

  // Mobile: two-column masonry — each photo drops into the shorter column.
  const outer = MOBILE_OUTER * vw;
  const gutter = MOBILE_GUTTER * vw;
  const colW = (vw - 2 * outer - gutter) / 2;
  const colX = [outer, outer + colW + gutter];
  const colH = [0, 0];
  const count = Math.max(shootCount, 14);
  const cells: Cell[] = [];
  for (let i = 0; i < count; i++) {
    const col = colH[0] <= colH[1] ? 0 : 1;
    const aspect = 0.78 + rand(i, 5) * 0.17; // portrait range, like the set
    const fw = colW * (0.82 + rand(i, 1) * 0.18); // 82–100% of the column
    const x = colX[col] + (colW - fw) * rand(i, 2); // nudge within the slack
    const h = fw / aspect;
    cells.push({
      index: i,
      x,
      baseY: colH[col],
      width: fw,
      height: h,
      shootIndex: i % shootCount,
    });
    colH[col] += h + MOBILE_VGAP * vw * (0.7 + rand(i, 3) * 1.1);
  }
  return { cells, tileH: Math.max(colH[0], colH[1]) };
}
