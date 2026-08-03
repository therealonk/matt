import type { Metadata } from "next";
import PageShell from "@/components/site/PageShell";
import { SITE } from "@/content/site";

export const metadata: Metadata = {
  title: `About — ${SITE.name}`,
};

export default function AboutPage() {
  return (
    <PageShell eyebrow={`${SITE.name} · About`} title="About">
      <p className="max-w-[60ch]">
        {SITE.name} is a photography and marketing studio. This page is a
        styled stub — replace this copy with the studio&apos;s story, the
        people behind it, and the way they like to work. It inherits the
        site&apos;s type and theme automatically.
      </p>
      <p className="max-w-[60ch]" style={{ color: "var(--dim)" }}>
        Suggested content: a short biography, an approach or philosophy
        section, selected clients, and press or awards.
      </p>
    </PageShell>
  );
}
