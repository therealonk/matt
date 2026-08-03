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

function slabs(edge: "top" | "bottom") {
  const nodes = [];
  for (let j = 0; j < EDGE_BLUR_LAYERS; j++) {
    // slab j covers [j/8, (j+1)/8] measured from the screen edge inward
    const blur = EDGE_BLUR_MAX * (1 - (j + 0.5) / EDGE_BLUR_LAYERS);
    const start = (j / EDGE_BLUR_LAYERS) * 100;
    const end = ((j + 1) / EDGE_BLUR_LAYERS) * 100;
    const feather = (0.85 / EDGE_BLUR_LAYERS) * 100;
    const dir = edge === "top" ? "to bottom" : "to top";
    const mask = `linear-gradient(${dir}, transparent ${Math.max(
      0,
      start - feather
    )}%, black ${start}%, black ${end}%, transparent ${Math.min(
      100,
      end + feather
    )}%)`;
    nodes.push(
      <div
        key={j}
        className="absolute inset-0"
        style={{
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
