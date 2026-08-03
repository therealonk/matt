"use client";

/*
 * Corner chrome — the only persistent navigation on inner pages:
 * a small wordmark top-left (→ home/landing) and "Menu" top-right opening
 * a fullscreen theme-field menu with big Bebas links. Nothing else sits
 * over the photographs.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SITE } from "@/content/site";

export default function Chrome() {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <>
      <Link
        href="/"
        className="display fixed left-[clamp(16px,3vw,32px)] top-[clamp(16px,3vh,28px)] z-40 text-[15px] tracking-[0.08em] transition-opacity hover:opacity-60"
        title="Back to the landing page"
      >
        {SITE.name}
      </Link>
      <button
        onClick={() => setMenuOpen(true)}
        className="eyebrow fixed right-[clamp(16px,3vw,32px)] top-[clamp(16px,3vh,28px)] z-40 cursor-pointer !text-[12px] tracking-[0.08em] transition-opacity hover:opacity-60"
        style={{ color: "var(--foreground)" }}
      >
        Menu
      </button>

      {/* fullscreen menu — theme field, clip-path shutter */}
      <div
        className="fixed inset-0 z-[60] flex flex-col justify-center gap-[2vh] px-[8vw] transition-[clip-path] duration-700"
        style={{
          background: "rgb(var(--background-rgb))",
          clipPath: menuOpen ? "inset(0 0 0% 0)" : "inset(0 0 100% 0)",
          transitionTimingFunction: "cubic-bezier(0.8, 0, 0.2, 1)",
          pointerEvents: menuOpen ? "auto" : "none",
        }}
        role="dialog"
        aria-label="Site menu"
        aria-hidden={!menuOpen}
      >
        <button
          onClick={() => setMenuOpen(false)}
          className="eyebrow absolute right-[clamp(16px,3vw,32px)] top-[clamp(16px,3vh,28px)] cursor-pointer"
          style={{ color: "var(--foreground)" }}
          tabIndex={menuOpen ? 0 : -1}
        >
          Close
        </button>
        {SITE.nav.map((link, i) => (
          <Link
            key={link.href}
            href={link.href}
            onClick={() => setMenuOpen(false)}
            tabIndex={menuOpen ? 0 : -1}
            className="display flex items-baseline gap-6 text-[clamp(40px,8vw,110px)] transition-opacity hover:opacity-45"
            style={{ opacity: pathname === link.href ? 0.45 : 0.9 }}
          >
            <span
              className="mono-tight font-[family-name:var(--font-geist-mono)] text-xs tracking-[0.2em]"
              style={{ color: "var(--dim)" }}
            >
              0{i + 1}
            </span>
            {link.label}
          </Link>
        ))}
      </div>
    </>
  );
}
