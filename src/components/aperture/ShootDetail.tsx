"use client";

/*
 * ShootDetail — the editorial split (aperture.md §6) extended with per-shoot
 * navigation. The clicked cover zooms from its exact on-screen rectangle
 * into a contained, ratio-preserving print in the right pane; a Bebas title
 * and tightly-kerned Geist Mono details reveal on the left. Arrows + dots
 * below the print step through the shoot: each photo is loaded only when
 * reached (neighbours prefetch in the background), its aspect measured at
 * runtime, and the print re-fits to it. Close always shrinks back to the
 * cover's exact rectangle on the frozen wall.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import { photoUrl, type Shoot } from "@/content/shoots";
import { SITE } from "@/content/site";
import { IMG_GRADE, MOBILE_BREAKPOINT } from "./tunables";

export type OriginRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type Props = {
  shoot: Shoot;
  shootNumber: number; // 1-based, for the eyebrow
  shootCount: number;
  origin: OriginRect;
  reduced: boolean;
  onClosed: () => void;
};

/** Contained print target — never full-bleed (§6). */
function targetRect(aspect: number, vw: number, vh: number): OriginRect {
  if (vw < MOBILE_BREAKPOINT) {
    // stacked 40/60 in the copy's favour — print band at the top
    let h = 0.4 * vh;
    let w = h * aspect;
    if (w > 0.86 * vw) {
      w = 0.86 * vw;
      h = w / aspect;
    }
    return {
      left: (vw - w) / 2,
      top: 0.05 * vh + (0.4 * vh - h) / 2,
      width: w,
      height: h,
    };
  }
  const padY = Math.min(96, 0.11 * vh);
  const padX = Math.min(112, 0.055 * vw);
  let h = Math.min(vh - 2 * padY, 0.84 * vh);
  let w = h * aspect;
  const maxW = 0.58 * vw - 2 * padX;
  if (w > maxW) {
    w = maxW;
    h = w / aspect;
  }
  return {
    left: 0.42 * vw + (0.58 * vw - w) / 2,
    top: (vh - h) / 2,
    width: w,
    height: h,
  };
}

export default function ShootDetail({
  shoot,
  shootNumber,
  shootCount,
  origin,
  reduced,
  onClosed,
}: Props) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const copyRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const navRef = useRef<HTMLDivElement | null>(null);

  const [idx, setIdx] = useState(0);
  const idxRef = useRef(0);
  const closingRef = useRef(false);
  // measured natural aspects per photo index; the cover uses the FRAME's
  // ratio (origin.w/origin.h) so the zoom round-trip is seamless
  const aspects = useRef<Record<number, number>>({
    0: origin.width / origin.height,
  });

  const coverAspect = origin.width / origin.height;
  const aspectOf = (i: number) => aspects.current[i] ?? coverAspect;

  const placeNav = useCallback((rect: OriginRect, animate: boolean) => {
    const nav = navRef.current;
    if (!nav) return;
    const vw = window.innerWidth;
    const centre =
      vw < MOBILE_BREAKPOINT ? vw / 2 : 0.42 * vw + (0.58 * vw) / 2;
    const style = {
      left: centre - nav.offsetWidth / 2,
      top: rect.top + rect.height + 16,
    };
    if (animate) gsap.to(nav, { ...style, duration: 0.42, ease: "power3.inOut" });
    else gsap.set(nav, style);
  }, []);

  // ---- open (§6): grow from the exact origin rect ----
  useLayoutEffect(() => {
    const box = boxRef.current;
    const backdrop = backdropRef.current;
    const copy = copyRef.current;
    const title = titleRef.current;
    const nav = navRef.current;
    if (!box || !backdrop || !copy || !title || !nav) return;

    const target = targetRect(coverAspect, window.innerWidth, window.innerHeight);
    gsap.set(box, { ...origin, borderRadius: 4 });
    gsap.set(nav, { opacity: 0 });
    placeNav(target, false);

    if (reduced) {
      gsap.set(box, { ...target });
      gsap.set(backdrop, { opacity: 1 });
      gsap.set(copy, { opacity: 1, y: 0 });
      gsap.set(title, { yPercent: 0 });
      gsap.set(nav, { opacity: 1 });
      return;
    }

    gsap.set(copy, { opacity: 0, y: 14 });
    gsap.set(title, { yPercent: 112 });
    const tl = gsap.timeline();
    tl.to(backdrop, { opacity: 1, duration: 0.45, ease: "power2.out" }, 0)
      .to(box, { ...target, duration: 0.62, ease: "power3.inOut" }, 0)
      .to(copy, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, 0.26)
      .to(title, { yPercent: 0, duration: 0.85, ease: "power4.out" }, 0.26)
      .to(nav, { opacity: 1, duration: 0.5, ease: "power2.out" }, 0.4);

    return () => {
      tl.kill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- navigate the shoot: late-load, measure, re-fit, cross-fade ----
  const goTo = useCallback(
    (next: number) => {
      if (closingRef.current) return;
      const n = ((next % shoot.photos.length) + shoot.photos.length) %
        shoot.photos.length;
      if (n === idxRef.current) return;
      idxRef.current = n;
      setIdx(n);
      const img = imgRef.current;
      const box = boxRef.current;
      if (!img || !box) return;

      const url = photoUrl(shoot, shoot.photos[n]);
      const show = (aspect: number) => {
        if (idxRef.current !== n || closingRef.current) return;
        aspects.current[n] = aspect;
        const t = targetRect(aspect, window.innerWidth, window.innerHeight);
        img.src = url;
        if (reduced) {
          gsap.set(box, { ...t });
          gsap.set(img, { opacity: 1 });
          placeNav(t, false);
        } else {
          gsap.to(box, { ...t, duration: 0.42, ease: "power3.inOut" });
          gsap.to(img, { opacity: 1, duration: 0.3, ease: "power2.out" });
          placeNav(t, true);
        }
      };

      gsap.to(img, { opacity: 0, duration: reduced ? 0 : 0.16 });
      if (aspects.current[n] !== undefined) {
        // already measured — swap immediately
        show(aspects.current[n]);
      } else {
        const probe = new Image();
        probe.onload = () =>
          show(probe.naturalWidth / Math.max(1, probe.naturalHeight));
        probe.onerror = () => show(coverAspect);
        probe.src = url;
      }
    },
    [shoot, reduced, coverAspect, placeNav]
  );

  // prefetch neighbours of the current photo so the arrows feel instant
  useEffect(() => {
    const nbrs = [idx - 1, idx + 1].map(
      (i) => ((i % shoot.photos.length) + shoot.photos.length) %
        shoot.photos.length
    );
    for (const i of nbrs) {
      if (i === idx) continue;
      const probe = new Image();
      probe.onload = () => {
        aspects.current[i] ??=
          probe.naturalWidth / Math.max(1, probe.naturalHeight);
      };
      probe.src = photoUrl(shoot, shoot.photos[i]);
    }
  }, [idx, shoot]);

  // ---- close: fade the chrome, return to the cover, shrink to origin ----
  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    const box = boxRef.current;
    const backdrop = backdropRef.current;
    const copy = copyRef.current;
    const img = imgRef.current;
    const nav = navRef.current;
    if (!box || !backdrop || !copy || !img || !nav) {
      onClosed();
      return;
    }
    gsap.killTweensOf([box, img, nav]);
    const coverSrc = photoUrl(shoot, shoot.photos[0]);
    if (reduced) {
      onClosed();
      return;
    }
    const tl = gsap.timeline({ onComplete: onClosed });
    if (img.src !== coverSrc && !img.src.endsWith(coverSrc)) {
      // cross-fade back to the cover so the shrink lands exactly
      tl.to(img, { opacity: 0, duration: 0.14 }, 0).add(() => {
        img.src = coverSrc;
        gsap.set(img, { opacity: 1 });
      }, 0.14);
    }
    tl.to([copy, nav], { opacity: 0, duration: 0.25, ease: "power2.in" }, 0)
      .to(backdrop, { opacity: 0, duration: 0.4, ease: "power2.in" }, 0.1)
      .to(
        box,
        { ...origin, borderRadius: 4, duration: 0.5, ease: "power3.inOut" },
        0.08
      );
  }, [onClosed, origin, reduced, shoot]);

  // ---- keys + resize re-fit ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") goTo(idxRef.current + 1);
      if (e.key === "ArrowLeft") goTo(idxRef.current - 1);
    };
    const onResize = () => {
      if (closingRef.current) return;
      const t = targetRect(
        aspectOf(idxRef.current),
        window.innerWidth,
        window.innerHeight
      );
      if (boxRef.current) gsap.set(boxRef.current, { ...t });
      placeNav(t, false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [close, goTo]);

  const photo = shoot.photos[idx];
  const camera = photo.camera ?? shoot.photos[0].camera;
  const nn = String(shootNumber).padStart(2, "0");

  // Portalled to <body> so the overlay stacks above the corner chrome
  // (the section's isolate stacking context would otherwise cap it).
  return createPortal(
    <div ref={overlayRef} className="fixed inset-0 z-50">
      {/* theme-field backdrop covering the frozen wall */}
      <div
        ref={backdropRef}
        className="absolute inset-0"
        style={{ background: "rgb(var(--background-rgb))", opacity: 0 }}
        onClick={close}
      />

      {/* left copy pane (bottom pane on mobile) */}
      <div
        ref={copyRef}
        className="absolute flex flex-col justify-between overflow-y-auto max-md:inset-x-0 max-md:bottom-0 max-md:top-[52vh] max-md:px-6 max-md:pb-6 md:inset-y-0 md:left-0 md:w-[42%] md:p-[clamp(24px,5vh,64px)] md:pl-[clamp(24px,4vw,56px)]"
      >
        <div>
          <div className="eyebrow mono-tight mb-4">
            {SITE.name} · Nº{nn} / {shootCount}
          </div>
          <div className="mono-tight mb-2 text-xs" style={{ color: "var(--dim)" }}>
            {shoot.category}
          </div>
          <div className="overflow-hidden">
            <h2
              ref={titleRef}
              className="display text-[clamp(40px,6vw,92px)]"
            >
              {shoot.title}
            </h2>
          </div>
          <div
            className="mono-tight mb-5 mt-3 text-xs"
            style={{ color: "var(--dim)" }}
          >
            {shoot.location} · {shoot.year}
          </div>
          <p className="mono-tight max-w-[36ch] text-[13px] leading-[1.7]">
            {shoot.description}
          </p>
        </div>
        {camera && (
          <div className="mt-8">
            <div className="mono-tight grid grid-cols-3 gap-x-6 gap-y-4 text-xs">
              {(
                [
                  ["Camera", camera.body],
                  ["Lens", camera.lens],
                  ["Focal", camera.focalLength],
                  ["Aperture", camera.aperture],
                  ["Shutter", camera.shutter],
                  ["ISO", camera.iso],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <span
                    className="mb-1 block text-[10px] uppercase"
                    style={{ color: "var(--dim)", letterSpacing: "0.18em" }}
                  >
                    {label}
                  </span>
                  {value}
                </div>
              ))}
            </div>
            <div
              className="mt-5 h-px w-full"
              style={{ background: "var(--hairline)" }}
            />
          </div>
        )}
      </div>

      {/* the contained print — zooms from / back to the exact frame rect */}
      <div
        ref={boxRef}
        className="fixed overflow-hidden"
        style={{ borderRadius: 4 }}
        onClick={close}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={photoUrl(shoot, shoot.photos[0])}
          alt={shoot.title}
          className="h-full w-full object-cover"
          style={{ filter: IMG_GRADE }}
          draggable={false}
        />
      </div>

      {/* shoot navigator — arrows + dots below the print */}
      <div
        ref={navRef}
        className="fixed flex items-center gap-5"
        style={{ opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          aria-label="Previous photo"
          className="px-3 py-1 text-lg opacity-80 transition-opacity hover:opacity-40"
          onClick={() => goTo(idx - 1)}
        >
          ←
        </button>
        <div className="flex items-center gap-2.5">
          {shoot.photos.map((_, i) => (
            <button
              key={i}
              aria-label={`Photo ${i + 1}`}
              aria-current={i === idx}
              onClick={() => goTo(i)}
              className="h-[7px] w-[7px] rounded-full transition-all"
              style={{
                background: "var(--foreground)",
                opacity: i === idx ? 1 : 0.25,
                transform: i === idx ? "scale(1.25)" : "none",
              }}
            />
          ))}
        </div>
        <button
          aria-label="Next photo"
          className="px-3 py-1 text-lg opacity-80 transition-opacity hover:opacity-40"
          onClick={() => goTo(idx + 1)}
        >
          →
        </button>
      </div>

      <button
        onClick={close}
        className="eyebrow fixed right-[clamp(16px,3vw,32px)] top-[clamp(16px,3vh,28px)] z-[2] cursor-pointer"
      >
        Close
      </button>
    </div>,
    document.body
  );
}
