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
        {SITE.name} is a photography and marketing studio.
      </p>
    </PageShell>
  );
}
