"use client";

/*
 * Aperture — the editorial photo wall (aperture.md §§2–5, 7).
 * A single rAF loop owns the wall: ambient auto-scroll, user momentum with
 * the spin velocity-counter, the gentle lens-bow + balloon, looping wrap,
 * culling and the edge-fade band heights. GSAP owns only the entrance rise
 * and (inside ShootDetail) the open/close zoom geometry.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { wallUrl, type Shoot } from "@/content/shoots";
import { buildSlots, isMobile, type WallLayout } from "./layout";
import EdgeFade from "./EdgeFade";
import ShootDetail, { type OriginRect } from "./ShootDetail";
import {
  AUTO_SCROLL,
  BALLOON_DOWN,
  BALLOON_UP,
  CULL_Y,
  CURL_EASE,
  CURL_GAIN,
  CURL_MAX,
  CURL_MOBILE,
  DEG,
  DRAG_NORM,
  EDGE_FADE_EASE,
  EDGE_FADE_GROWTH,
  EDGE_FADE_MAX_PX,
  EDGE_FADE_MIN_PX,
  EDGE_FADE_VEL_REF,
  EDGE_FADE_VH,
  IMG_GRADE,
  MAX_ANGLE,
  PERSPECTIVE_PX,
  ROT_SIGN,
  SPIN_CARRY,
  SPIN_FRICTION,
  SPIN_GAIN_BOOST,
  SPIN_MAX,
  SPIN_PER_WHEEL,
  SPIN_VEL_BOOST,
  TAP_SLOP,
  VEL_FRICTION,
  VEL_MAX,
  WHEEL_GAIN,
  WHEEL_LINE_PX,
  WHEEL_PAGE_FRAC,
  Z_DEPTH,
} from "./tunables";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/**
 * A wheel notch in pixels, whatever units the browser chose to report.
 * Firefox on Windows/Linux sends lines; a few configurations send pages.
 * Browsers already reporting pixels pass straight through.
 */
const wheelPixels = (e: WheelEvent, vh: number) => {
  if (e.deltaMode === 1) return e.deltaY * WHEEL_LINE_PX;
  if (e.deltaMode === 2) return e.deltaY * vh * WHEEL_PAGE_FRAC;
  return e.deltaY;
};

type OpenState = { shootIndex: number; origin: OriginRect };

export default function Aperture({
  shoots,
  className,
}: {
  /** Built from Dropbox by the page that renders this. */
  shoots: Shoot[];
  className?: string;
}) {
  // the engine reads this from a ref so the rAF loop never closes over
  // a stale prop after a revalidation
  const shootsRef = useRef(shoots);
  shootsRef.current = shoots;
  const sectionRef = useRef<HTMLElement | null>(null);
  const planeRef = useRef<HTMLDivElement | null>(null);
  const hintRef = useRef<HTMLDivElement | null>(null);
  const bandsRef = useRef<HTMLDivElement[]>([]);
  const cellEls = useRef<(HTMLDivElement | null)[]>([]);

  const [layout, setLayout] = useState<WallLayout | null>(null);
  const [open, setOpen] = useState<OpenState | null>(null);
  const [reduced, setReduced] = useState(false);

  const layoutRef = useRef<WallLayout | null>(null);
  const dimsRef = useRef({ vw: 0, vh: 0 });
  const openRef = useRef(false);
  const reducedRef = useRef(false);

  // motion state (§5)
  const posY = useRef(0);
  const vel = useRef(0);
  const spin = useRef(0);
  const curl = useRef({ cur: 0, target: 0 });
  const appear = useRef(0);
  const bandH = useRef(0);
  const currentZ = useRef<number[]>([]);
  const drag = useRef({
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    lastY: 0,
    lastT: 0,
  });

  // ---- mount: dims, layout, reduced-motion, entrance ----
  useLayoutEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedRef.current = mq.matches;
    setReduced(mq.matches);
    const onMq = (e: MediaQueryListEvent) => {
      reducedRef.current = e.matches;
      setReduced(e.matches);
    };
    mq.addEventListener("change", onMq);

    const measure = () => {
      dimsRef.current = { vw: window.innerWidth, vh: window.innerHeight };
      const next = buildSlots(window.innerWidth, shootsRef.current.length);
      layoutRef.current = next;
      currentZ.current = new Array(next.cells.length).fill(-Infinity);
      setLayout(next);
    };
    measure();

    // Entrance (§5): a linear driver mapped through power4.out per frame —
    // the whole wall rises from below the fold as one cohesive block.
    let entrance: gsap.core.Tween | null = null;
    if (reducedRef.current) {
      appear.current = 1;
    } else {
      entrance = gsap.to(appear, {
        current: 1,
        duration: 1.5,
        delay: 0.04,
        ease: "none",
      });
      if (hintRef.current) {
        gsap.fromTo(
          hintRef.current,
          { y: 20, opacity: 0, filter: "blur(8px)" },
          {
            y: 0,
            opacity: 1,
            filter: "blur(0px)",
            duration: 0.8,
            delay: 0.9,
            ease: "power3.out",
          }
        );
      }
    }

    const onResize = () => {
      const { vw, vh } = dimsRef.current;
      // ignore vh-only jitter < 200px (mobile URL bar)
      if (window.innerWidth === vw && Math.abs(window.innerHeight - vh) < 200)
        return;
      measure();
    };
    window.addEventListener("resize", onResize);

    return () => {
      mq.removeEventListener("change", onMq);
      window.removeEventListener("resize", onResize);
      entrance?.kill();
      if (hintRef.current) gsap.killTweensOf(hintRef.current);
    };
  }, []);

  // ---- the rAF engine + inputs ----
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    let raf = 0;

    const tick = () => {
      raf = requestAnimationFrame(tick);
      // frozen while a detail is open — originRect stays valid (§6)
      if (openRef.current) return;
      const lay = layoutRef.current;
      const plane = planeRef.current;
      if (!lay || !plane) return;
      const { vw, vh } = dimsRef.current;
      const half = vh / 2;
      const mobile = isMobile(vw);

      // 1 — scroll: ambient drift + user momentum with spin-carried friction
      if (!drag.current.active) {
        posY.current -= AUTO_SCROLL + vel.current;
        vel.current *= Math.min(
          0.95,
          VEL_FRICTION + spin.current * SPIN_CARRY
        );
        if (Math.abs(vel.current) < 0.01) vel.current = 0;
      }
      spin.current *= SPIN_FRICTION;
      if (spin.current < 0.001) spin.current = 0;

      // 2 — curl from USER velocity only (auto-scroll never bends the wall)
      const cap = CURL_MAX * (mobile ? CURL_MOBILE : 1);
      curl.current.target = reducedRef.current
        ? 0
        : Math.sign(vel.current) *
          Math.min(cap, Math.abs(vel.current) * CURL_GAIN);
      curl.current.cur +=
        (curl.current.target - curl.current.cur) * CURL_EASE;
      if (curl.current.target === 0 && Math.abs(curl.current.cur) < 0.0005)
        curl.current.cur = 0;
      const c = curl.current.cur;
      const curlMag = Math.abs(c);
      const dirSign = c >= 0 ? 1 : -1;

      // 3 — balloon: the whole plane scales from centre with direction
      const planeScale = 1 + (c >= 0 ? c * BALLOON_UP : c * BALLOON_DOWN);
      plane.style.transform = `scale(${planeScale})`;

      // entrance rise — same offset + uniform blur for every cell
      const eased = 1 - Math.pow(1 - appear.current, 4);
      const yRise = (1 - eased) * 1.05 * vh;
      const entranceBlur = (1 - eased) * 4;

      // 4 — per cell: wrap, cull, project (§4), write styles
      for (let i = 0; i < lay.cells.length; i++) {
        const cell = lay.cells[i];
        const el = cellEls.current[i];
        if (!el) continue;
        const kY = Math.round(
          (half - (cell.baseY + posY.current)) / lay.tileH
        );
        const flatTopY = cell.baseY + kY * lay.tileH + posY.current;
        // cull on the flat rect with margin (§5.4)
        if (flatTopY + cell.height < -CULL_Y || flatTopY > vh + CULL_Y) {
          if (el.style.opacity !== "0") el.style.opacity = "0";
          currentZ.current[i] = -Infinity;
          continue;
        }
        const flatCenterY = flatTopY + cell.height / 2;
        const n = (flatCenterY - half) / half;
        const theta = n * curlMag * MAX_ANGLE;
        const adjCY = half + (flatCenterY - half) * Math.cos(Math.abs(theta));
        const zS = -dirSign * Z_DEPTH * curlMag * n * n;
        const rotX = ROT_SIGN * dirSign * theta * DEG;
        el.style.transform = `translate3d(${cell.x}px, ${
          adjCY - cell.height / 2 + yRise
        }px, ${zS}px) rotateX(${rotX}deg)`;
        el.style.zIndex = String(Math.round(2000 + zS));
        el.style.opacity = "1";
        el.style.filter =
          entranceBlur > 0.05 ? `blur(${entranceBlur.toFixed(2)}px)` : "";
        currentZ.current[i] = zS;
      }

      // edge fade breathes with |vel| (§4.5)
      const base = Math.min(
        EDGE_FADE_MAX_PX,
        Math.max(EDGE_FADE_MIN_PX, EDGE_FADE_VH * vh)
      );
      const targetH =
        base *
        (1 +
          EDGE_FADE_GROWTH *
            Math.min(1, Math.abs(vel.current) / EDGE_FADE_VEL_REF));
      if (bandH.current === 0) bandH.current = base;
      bandH.current += (targetH - bandH.current) * EDGE_FADE_EASE;
      for (const b of bandsRef.current)
        if (b) b.style.height = `${bandH.current.toFixed(1)}px`;
    };
    raf = requestAnimationFrame(tick);

    // ---- inputs (§5) ----
    const onWheel = (e: WheelEvent) => {
      if (openRef.current) return;
      e.preventDefault();
      // normalise units first — both the counter and the push depend on it
      const dy = wheelPixels(e, dimsRef.current.vh || window.innerHeight);
      spin.current = Math.min(
        SPIN_MAX,
        spin.current + Math.min(1, Math.abs(dy) / 100) * SPIN_PER_WHEEL
      );
      const ceil = VEL_MAX * (1 + spin.current * SPIN_VEL_BOOST);
      vel.current = clamp(
        vel.current + dy * WHEEL_GAIN * (1 + spin.current * SPIN_GAIN_BOOST),
        -ceil,
        ceil
      );
    };

    const onPointerDown = (e: PointerEvent) => {
      if (openRef.current || e.button !== 0) return;
      drag.current = {
        active: true,
        moved: false,
        startX: e.clientX,
        startY: e.clientY,
        lastY: e.clientY,
        lastT: performance.now(),
      };
      section.style.cursor = "grabbing";
    };

    const onPointerMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d.active) return;
      const now = performance.now();
      const dy = e.clientY - d.lastY;
      const dt = Math.max(1, now - d.lastT);
      posY.current += dy; // wall follows the finger
      vel.current = clamp((-(dy / dt)) * DRAG_NORM, -VEL_MAX, VEL_MAX);
      if (
        Math.abs(e.clientX - d.startX) > TAP_SLOP ||
        Math.abs(e.clientY - d.startY) > TAP_SLOP
      )
        d.moved = true;
      d.lastY = e.clientY;
      d.lastT = now;
    };

    const onPointerUp = (e: PointerEvent) => {
      const d = drag.current;
      if (!d.active) return;
      d.active = false;
      section.style.cursor = "grab";
      if (!d.moved && !openRef.current) openAtPoint(e.clientX, e.clientY);
    };

    section.addEventListener("wheel", onWheel, { passive: false });
    section.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    return () => {
      cancelAnimationFrame(raf);
      section.removeEventListener("wheel", onWheel);
      section.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- open: hit-test live rects, top-most by zS, freeze synchronously ----
  const openAtPoint = (x: number, y: number) => {
    const lay = layoutRef.current;
    if (!lay) return;
    let best = -1;
    let bestZ = -Infinity;
    for (let i = 0; i < lay.cells.length; i++) {
      const el = cellEls.current[i];
      if (!el || currentZ.current[i] === -Infinity) continue;
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        if (currentZ.current[i] > bestZ) {
          bestZ = currentZ.current[i];
          best = i;
        }
      }
    }
    if (best < 0) return;
    openRef.current = true; // the very next tick freezes the wall here
    const r = cellEls.current[best]!.getBoundingClientRect();
    setOpen({
      shootIndex: lay.cells[best].shootIndex,
      origin: { left: r.left, top: r.top, width: r.width, height: r.height },
    });
  };

  const handleClosed = () => {
    openRef.current = false; // lifts the freeze — the wall resumes
    setOpen(null);
  };

  return (
    <section
      ref={sectionRef}
      className={`relative h-screen w-full overflow-hidden isolate select-none ${
        className ?? ""
      }`}
      style={{
        background: "var(--background)",
        touchAction: "none",
        cursor: open ? "default" : "grab",
      }}
    >
      {/* static perspective wrapper — never transformed */}
      <div
        className="absolute inset-0"
        style={{
          perspective: `${PERSPECTIVE_PX}px`,
          perspectiveOrigin: "50% 50%",
          transformStyle: "preserve-3d",
        }}
      >
        <div
          ref={planeRef}
          className="absolute inset-0"
          style={{ transformStyle: "preserve-3d", transformOrigin: "50% 50%" }}
        >
          {layout?.cells.map((cell, i) => {
            const shoot = shoots[cell.shootIndex];
            return (
              <div
                key={cell.index}
                ref={(el) => {
                  cellEls.current[i] = el;
                }}
                className="pointer-events-none absolute left-0 top-0 overflow-hidden rounded-[4px] will-change-transform"
                style={{
                  width: cell.width,
                  height: cell.height,
                  opacity: 0,
                  transformStyle: "preserve-3d",
                  backfaceVisibility: "hidden",
                  transformOrigin: "center",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={wallUrl(shoot)}
                  alt={shoot.title}
                  className="h-full w-full object-cover"
                  style={{ filter: IMG_GRADE }}
                  decoding="async"
                  draggable={false}
                />
              </div>
            );
          })}
        </div>
      </div>

      <EdgeFade ref={bandsRef} />

      {/* hint sits top-centre, clear of the corner chrome */}
      <div className="pointer-events-none absolute inset-x-0 top-[clamp(16px,3vh,28px)] z-40 flex justify-center">
        <div ref={hintRef} className="eyebrow" style={{ opacity: reduced ? 1 : 0 }}>
          Scroll · Click to open
        </div>
      </div>

      {open && (
        <ShootDetail
          shoot={shoots[open.shootIndex]}
          shootNumber={open.shootIndex + 1}
          shootCount={shoots.length}
          origin={open.origin}
          reduced={reduced}
          onClosed={handleClosed}
        />
      )}
    </section>
  );
}
