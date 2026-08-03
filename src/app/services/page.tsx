import type { Metadata } from "next";
import PageShell from "@/components/site/PageShell";
import { SITE } from "@/content/site";

export const metadata: Metadata = {
  title: `Services — ${SITE.name}`,
};

const SERVICES = [
  {
    name: "Photography",
    blurb:
      "Editorial, portrait, product and location shoots — planned, shot and delivered as finished, retouched sets.",
  },
  {
    name: "Marketing",
    blurb:
      "Campaign imagery, social content programs and brand asset libraries built to run across channels.",
  },
  {
    name: "Direction",
    blurb:
      "Art direction and visual identity for launches — moodboards to final selects, one accountable partner.",
  },
];

// Placeholder brand names for the "Trusted by" strip — replace with real
// client wordmarks (SVG logos drop into the same row).
const TRUSTED_BY = ["Northline", "Atelier V", "Field & Co", "Meridian", "Oslo Works"];

export default function ServicesPage() {
  return (
    <PageShell eyebrow={`${SITE.name} · Services`} title="Services">
      <div className="flex flex-col gap-12">
        {SERVICES.map((s) => (
          <div key={s.name} className="flex flex-col gap-3">
            <h2 className="display text-[clamp(28px,4vw,48px)]">{s.name}</h2>
            <p className="max-w-[60ch]">{s.blurb}</p>
          </div>
        ))}
      </div>
      <div className="mt-6">
        <div className="eyebrow mono-tight mb-6">Trusted by</div>
        <div
          className="flex flex-wrap items-baseline gap-x-10 gap-y-4"
          style={{ color: "var(--dim)" }}
        >
          {TRUSTED_BY.map((brand) => (
            <span key={brand} className="display text-[22px] tracking-[0.04em]">
              {brand}
            </span>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
