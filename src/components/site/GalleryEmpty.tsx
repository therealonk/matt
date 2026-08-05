/*
 * Shown when the wall has nothing to draw — either Dropbox isn't wired up
 * yet or the Shoots folder is empty. Visitors get a calm, on-brand message
 * and a way to reach the studio; the operator gets the actual reason, which
 * only renders outside production so it can't leak configuration detail to
 * the public.
 */

import Link from "next/link";
import { SITE } from "@/content/site";

export default function GalleryEmpty({ error }: { error?: string }) {
  const showDetail = error && process.env.NODE_ENV !== "production";

  return (
    <section className="flex h-screen w-full flex-col items-center justify-center gap-6 px-[6vw] text-center">
      <div className="eyebrow mono-tight">{SITE.name}</div>
      <h1 className="display text-[clamp(40px,8vw,110px)]">
        The gallery is being hung
      </h1>
      <p
        className="mono-tight max-w-[46ch] text-[13px]"
        style={{ color: "var(--dim)" }}
      >
        New work is on its way. In the meantime, we&apos;d be glad to talk
        about a shoot.
      </p>
      <Link
        href="/contact"
        className="mono-tight mt-2 border px-9 py-4 text-[13px] uppercase !tracking-[0.18em] transition-colors hover:bg-[var(--foreground)] hover:text-[var(--background)]"
        style={{ borderColor: "var(--foreground)", borderRadius: 2 }}
      >
        Get in touch
      </Link>

      {showDetail && (
        <pre
          className="mono-tight mt-8 max-w-[70ch] whitespace-pre-wrap text-left text-[11px]"
          style={{ color: "var(--error)" }}
        >
          {error}
        </pre>
      )}
    </section>
  );
}
