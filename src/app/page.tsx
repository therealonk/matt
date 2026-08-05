/*
 * Landing — the site's front door. A static, blurred impression of the
 * gallery sits behind a theme-field overlay carrying the studio name,
 * contact details and the on-ramp to the work. No animation engine loads
 * here; visitors after a phone number never pay for the gallery.
 */

import Link from "next/link";
import { SITE } from "@/content/site";
import { wallUrl } from "@/content/shoots";
import { getShoots } from "@/lib/dropbox/manifest";
import { DESKTOP_SLOTS, IMG_GRADE } from "@/components/aperture/tunables";

// the upper slots of the wall composition — enough to fill the first viewport
const BACKDROP_SLOT_INDEXES = [0, 1, 4, 5, 9, 10];

/* Same five-minute Dropbox cadence as the gallery. */
export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const { shoots } = await getShoots();
  return (
    <main className="relative h-screen overflow-hidden select-none">
      {/* static impression of the wall (no engine, no interactivity) */}
      <div
        aria-hidden
        className="absolute inset-0 max-md:origin-top max-md:scale-[1.9]"
      >
        {(shoots.length ? BACKDROP_SLOT_INDEXES : []).map((slotIdx, i) => {
          const s = DESKTOP_SLOTS[slotIdx];
          const shoot = shoots[i % shoots.length];
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={slotIdx}
              src={wallUrl(shoot)}
              alt=""
              draggable={false}
              className="absolute rounded-[4px] object-cover"
              style={{
                left: `${s.x * 100}vw`,
                top: `${s.y * 100}vw`,
                width: `${s.w * 100}vw`,
                height: `${(s.w / s.aspect) * 100}vw`,
                filter: IMG_GRADE,
              }}
            />
          );
        })}
      </div>

      {/* greyed overlay — blurs and dims the impression behind it */}
      <div
        className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-[clamp(20px,4vh,40px)] px-[6vw] text-center"
        style={{
          background: "rgba(var(--background-rgb), 0.55)",
          backdropFilter: "blur(14px) saturate(0.9)",
          WebkitBackdropFilter: "blur(14px) saturate(0.9)",
        }}
      >
        <div className="eyebrow mono-tight !tracking-[0.28em]">
          {SITE.tagline}
        </div>
        <h1 className="display text-[clamp(56px,12vw,168px)]">{SITE.name}</h1>
        <div
          className="mono-tight flex flex-wrap items-center justify-center gap-x-7 gap-y-2.5 text-[13px] max-md:flex-col"
          style={{ color: "var(--dim)" }}
        >
          <a
            href={`mailto:${SITE.contact.email}`}
            className="border-b border-transparent transition-colors hover:border-current hover:text-[var(--foreground)]"
          >
            {SITE.contact.email}
          </a>
          <a
            href={`tel:${SITE.contact.phone.replace(/[^+\d]/g, "")}`}
            className="border-b border-transparent transition-colors hover:border-current hover:text-[var(--foreground)]"
          >
            {SITE.contact.phone}
          </a>
          <span>{SITE.contact.location}</span>
        </div>
        <Link
          href="/work"
          className="mono-tight mt-[clamp(4px,1.5vh,16px)] border px-9 py-4 text-[13px] uppercase !tracking-[0.18em] transition-colors hover:bg-[var(--foreground)] hover:text-[var(--background)]"
          style={{ borderColor: "var(--foreground)", borderRadius: 2 }}
        >
          See our work
        </Link>
        <nav className="mono-tight flex gap-8 text-[12px] uppercase !tracking-[0.14em]">
          {SITE.nav
            .filter((l) => l.href !== "/work")
            .map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="transition-colors hover:text-[var(--foreground)]"
                style={{ color: "var(--dim)" }}
              >
                {l.label}
              </Link>
            ))}
        </nav>
      </div>
    </main>
  );
}
