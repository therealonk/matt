/*
 * Shared frame for the inner pages (About / Services / Contact):
 * corner chrome + an editorial column on the theme field. Headings are
 * Bebas, body copy is tightly-kerned Geist Mono — same voice as the wall.
 */

import Chrome from "./Chrome";

export default function PageShell({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen">
      <Chrome />
      <div className="mx-auto max-w-[880px] px-6 pb-[12vh] pt-[18vh] md:px-10">
        <div className="eyebrow mono-tight mb-5">{eyebrow}</div>
        <h1 className="display mb-12 text-[clamp(56px,10vw,140px)]">{title}</h1>
        <div className="mono-tight flex flex-col gap-10 text-[13px] leading-[1.8]">
          {children}
        </div>
      </div>
    </main>
  );
}
