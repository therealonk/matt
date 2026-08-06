"use client";

/*
 * The wall's top and bottom edges — aperture.md §4.5, painted rather than
 * blurred.
 *
 * The spec stacked backdrop-filter slabs so the wall genuinely softened
 * into each edge. Measured, that was ~95% of the frame: a backdrop-filter
 * re-blurs the moving wall behind it every frame, sixteen times over. This
 * paints a fade to the theme background instead — one gradient per band,
 * composited once, no per-frame GPU work at all. Frames stay sharp and
 * dissolve into the ground rather than smearing into it.
 *
 * Band height is still driven per frame by the engine (it grows with
 * scroll speed) through the refs handed up via `bandsRef` — that costs
 * nothing now that the bands only carry a background.
 */

import { forwardRef } from "react";
import { EDGE_FADE_CURVE, EDGE_FADE_STOPS } from "./tunables";

/**
 * Opacity falls as (1 − t)^CURVE from the screen edge to the band's inner
 * line. Approximated with explicit stops because a two-stop linear ramp
 * leaves a faint but visible line where it ends — the eye picks up the
 * discontinuity in the gradient's slope, even though the colour is smooth.
 */
function fade(edge: "top" | "bottom"): string {
  const dir = edge === "top" ? "to bottom" : "to top";
  const stops: string[] = [];
  for (let i = 0; i <= EDGE_FADE_STOPS; i++) {
    const t = i / EDGE_FADE_STOPS;
    const alpha = Math.pow(1 - t, EDGE_FADE_CURVE);
    stops.push(
      `rgba(var(--background-rgb), ${alpha.toFixed(4)}) ${(t * 100).toFixed(1)}%`
    );
  }
  return `linear-gradient(${dir}, ${stops.join(", ")})`;
}

/** ref receives [topBand, bottomBand] so the engine can write heights. */
const EdgeFade = forwardRef<HTMLDivElement[], object>(function EdgeFade(
  _props,
  ref
) {
  const attach = (el: HTMLDivElement | null, i: number) => {
    if (!el || typeof ref === "function" || !ref) return;
    const arr = (ref.current ??= []);
    arr[i] = el;
  };

  return (
    <>
      <div
        ref={(el) => attach(el, 0)}
        className="pointer-events-none absolute inset-x-0 top-0 z-[13]"
        style={{ background: fade("top") }}
        aria-hidden
      />
      <div
        ref={(el) => attach(el, 1)}
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[13]"
        style={{ background: fade("bottom") }}
        aria-hidden
      />
    </>
  );
});

export default EdgeFade;
