"use client";

/*
 * Progressive edge blur — aperture.md §4.5. Two bands (top + bottom), each
 * 8 stacked masked backdrop-filter slabs whose blur ramps linearly from
 * EDGE_BLUR_MAX at the screen edge to 0 at the band's inner line. Each slab
 * is windowed to its 1/8 of the band with an 85%-of-slab feather so
 * neighbours cross-fade. Band height is driven per-frame by the engine
 * (velocity growth) through the refs handed up via `bandsRef`.
 */

import { forwardRef } from "react";
import { EDGE_BLUR_LAYERS, EDGE_BLUR_MAX } from "./tunables";

/*
 * Each slab's BOX covers only the strip it actually shows (plus a margin),
 * rather than the whole band.
 *
 * A backdrop-filter costs in proportion to the area it processes, and it
 * processes the element's entire box — the mask only decides what survives
 * afterwards. Giving all eight slabs the full band therefore blurred the
 * band eight times over and threw away roughly seven eighths of the result.
 *
 * The margin matters: a blur samples only within its own box, so a box cut
 * tight to the visible strip renders differently near its edges. Measured
 * against the full-band original, no margin deviates by up to 22/255;
 * PAD_BLUR = 0.75 brings that to 9/255 with essentially no pixel past
 * 8/255, which is below what an eye can pick out of a soft gradient.
 * Together: 16.3 -> 25.2 fps on a software rasteriser, same appearance.
 */

/** Extra box margin, as a multiple of that slab's own blur radius. */
const PAD_BLUR = 0.75;
/**
 * Padding is expressed as a fraction of the band so it survives the band
 * breathing with scroll speed. This is the band's resting height, from
 * clamp(38px, 6.8vh, 76px) — it only sets how generous the margin is.
 */
const NOMINAL_BAND_PX = 61;

function slabs(edge: "top" | "bottom") {
  const nodes = [];
  const feather = 0.85 / EDGE_BLUR_LAYERS;
  const dir = edge === "top" ? "to bottom" : "to top";
  const pct = (v: number) => `${(v * 100).toFixed(3)}%`;

  for (let j = 0; j < EDGE_BLUR_LAYERS; j++) {
    // slab j shows [start, end] of the band, measured from the screen edge
    const blur = EDGE_BLUR_MAX * (1 - (j + 0.5) / EDGE_BLUR_LAYERS);
    const start = j / EDGE_BLUR_LAYERS;
    const end = (j + 1) / EDGE_BLUR_LAYERS;

    // what the mask lets through: the window plus its cross-fade feather
    const visLo = Math.max(0, start - feather);
    const visHi = Math.min(1, end + feather);

    // the box: that, plus room for the blur kernel, clipped to the band
    const padFrac = (PAD_BLUR * blur) / NOMINAL_BAND_PX;
    const boxLo = Math.max(0, visLo - padFrac);
    const boxHi = Math.min(1, visHi + padFrac);
    const span = boxHi - boxLo;

    // the same stops as before, now as fractions of this smaller box
    const at = (v: number) => ((v - boxLo) / span) * 100;
    const mask =
      `linear-gradient(${dir}, transparent ${at(visLo).toFixed(3)}%, ` +
      `black ${at(start).toFixed(3)}%, black ${at(end).toFixed(3)}%, ` +
      `transparent ${at(visHi).toFixed(3)}%)`;

    nodes.push(
      <div
        key={j}
        className="absolute inset-x-0"
        style={{
          // offset from whichever edge this band hugs
          [edge === "top" ? "top" : "bottom"]: pct(boxLo),
          height: pct(span),
          backdropFilter: `blur(${blur.toFixed(2)}px)`,
          WebkitBackdropFilter: `blur(${blur.toFixed(2)}px)`,
          maskImage: mask,
          WebkitMaskImage: mask,
        }}
      />
    );
  }
  return nodes;
}

/** ref receives [topBand, bottomBand] so the engine can write heights. */
const EdgeBlur = forwardRef<HTMLDivElement[], object>(function EdgeBlur(
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
        style={{ height: "clamp(38px, 6.8vh, 76px)" }}
        aria-hidden
      >
        {slabs("top")}
      </div>
      <div
        ref={(el) => attach(el, 1)}
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[13]"
        style={{ height: "clamp(38px, 6.8vh, 76px)" }}
        aria-hidden
      >
        {slabs("bottom")}
      </div>
    </>
  );
});

export default EdgeBlur;
