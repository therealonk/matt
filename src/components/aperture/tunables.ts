/*
 * Every magic number from aperture.md, in one file.
 * Section references point back to the spec.
 */

// §3 — layout
export const TILE_H_DESKTOP = 1.49; // tile height (vw units) — loops vertically

export type Slot = { x: number; y: number; w: number; aspect: number };

// 13 frames, grouped into 3 columns (x, y, w, aspect) — fractions of vw
export const DESKTOP_SLOTS: Slot[] = [
  // Left column (centre ≈ 0.16)
  { x: -0.02, y: 0.04, w: 0.3, aspect: 0.78 }, // LARGE portrait, bleeds left
  { x: 0.065, y: 0.47, w: 0.19, aspect: 0.8 }, // medium portrait
  { x: 0.05, y: 0.84, w: 0.22, aspect: 0.82 }, // medium-large portrait
  { x: 0.085, y: 1.16, w: 0.15, aspect: 0.9 }, // small portrait
  // Centre column (centre = 0.50)
  { x: 0.415, y: 0.1, w: 0.17, aspect: 0.78 }, // medium portrait
  { x: 0.44, y: 0.42, w: 0.12, aspect: 0.8 }, // SMALL portrait
  { x: 0.4, y: 0.6, w: 0.2, aspect: 0.85 }, // medium
  { x: 0.425, y: 0.95, w: 0.15, aspect: 0.95 }, // small near-square
  { x: 0.415, y: 1.19, w: 0.17, aspect: 0.8 }, // portrait
  // Right column (centre ≈ 0.84)
  { x: 0.74, y: 0.02, w: 0.2, aspect: 0.78 }, // portrait
  { x: 0.74, y: 0.32, w: 0.2, aspect: 0.85 }, // portrait
  { x: 0.72, y: 0.72, w: 0.3, aspect: 0.8 }, // LARGE portrait, bleeds right
  { x: 0.76, y: 1.12, w: 0.16, aspect: 0.8 }, // small portrait
];

export const MOBILE_OUTER = 0.05; // mobile L/R margin (vw)
export const MOBILE_GUTTER = 0.055; // column gutter (vw)
export const MOBILE_VGAP = 0.08; // base vertical gap (vw)
export const MOBILE_BREAKPOINT = 768;

// §4 — lens-bow
export const PERSPECTIVE_PX = 1200;
export const MAX_ANGLE = 0.36; // rad (~21°) — tilt of a screen-EDGE frame at full curl
export const Z_DEPTH = 85; // px — max recede/advance depth
export const ROT_SIGN = -1; // tilt direction (flip if the bow looks inverted)
export const BALLOON_UP = 0.12; // scroll-down: wall scales UP from centre
export const BALLOON_DOWN = 0.12; // scroll-up: wall scales DOWN slightly
export const DEG = 180 / Math.PI;

// §4.5 — progressive edge blur
// Perf-tuned from the spec's 8 layers / 10px: each slab is a backdrop
// re-blur of the moving wall every frame, and cost scales linearly with
// the layer count. 4 slabs keeps the graded melt at half the price.
export const EDGE_BLUR_LAYERS = 4;
export const EDGE_BLUR_MAX = 9; // px at the very edge
export const EDGE_BLUR_GROWTH = 0.3; // bands grow up to +30%
export const EDGE_BLUR_VEL_REF = 150; // px/frame at which growth maxes
export const EDGE_BLUR_EASE = 0.08;

// §5 — motion
export const AUTO_SCROLL = 0.35; // px/frame — ambient upward drift (~21 px/s)
export const WHEEL_GAIN = 0.2;
export const VEL_MAX = 48;
export const VEL_FRICTION = 0.9;
export const DRAG_NORM = 16;
export const CURL_GAIN = 0.02;
export const CURL_MAX = 0.8;
export const CURL_EASE = 0.04;
export const CURL_MOBILE = 0.6;
export const SPIN_FRICTION = 0.95; // velocity counter decay
export const SPIN_MAX = 5;
export const SPIN_VEL_BOOST = 0.85;
export const SPIN_PER_WHEEL = 0.1;
export const SPIN_GAIN_BOOST = 0.5;
export const SPIN_CARRY = 0.012;
export const CULL_Y = 280; // px cull margin
export const TAP_SLOP = 6; // px before a press counts as a drag

// image grade shared by every frame
export const IMG_GRADE = "saturate(0.96) contrast(1.03)";
