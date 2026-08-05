import type { Metadata } from "next";
import PageShell from "@/components/site/PageShell";
import ContactForm from "@/components/site/ContactForm";
import { SITE } from "@/content/site";

export const metadata: Metadata = {
  title: `Contact — ${SITE.name}`,
};

export default function ContactPage() {
  return (
    <PageShell eyebrow={`${SITE.name} · Contact`} title="Contact">
      <p className="max-w-[60ch]">
        For bookings, campaign work or a portfolio walkthrough, reach out —
        we reply within two business days.
      </p>

      {/* direct details first: some visitors only want the address */}
      <div className="flex flex-col gap-6">
        <span className="display w-fit text-[clamp(28px,5vw,64px)]">
          {SITE.contact.name}
        </span>
        <a
          href={`mailto:${SITE.contact.email}`}
          className="display w-fit text-[clamp(28px,5vw,64px)] transition-opacity hover:opacity-60"
        >
          {SITE.contact.email}
        </a>
        <a
          href={`tel:${SITE.contact.phone.replace(/[^+\d]/g, "")}`}
          className="display w-fit text-[clamp(28px,5vw,64px)] transition-opacity hover:opacity-60"
        >
          {SITE.contact.phone}
        </a>
        <span style={{ color: "var(--dim)" }}>{SITE.contact.location}</span>
      </div>

      <div
        className="mt-2 h-px w-full"
        style={{ background: "var(--hairline)" }}
      />

      <section className="flex flex-col gap-6">
        <div className="eyebrow mono-tight">Send an inquiry</div>
        <ContactForm />
      </section>
    </PageShell>
  );
}
