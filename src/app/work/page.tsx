import type { Metadata } from "next";
import Aperture from "@/components/aperture/Aperture";
import Chrome from "@/components/site/Chrome";
import GalleryEmpty from "@/components/site/GalleryEmpty";
import { SITE } from "@/content/site";
import { getShoots } from "@/lib/dropbox/manifest";

export const metadata: Metadata = {
  title: `Work — ${SITE.name}`,
};

/*
 * Rendered per request; the Dropbox manifest behind it is cached for five
 * minutes in Next's data cache, so a change in Dropbox appears within about
 * five minutes and Dropbox is swept once per window, not once per visitor.
 */
export const dynamic = "force-dynamic";

export default async function WorkPage() {
  const { shoots, error } = await getShoots();

  return (
    <main>
      <Chrome />
      {shoots.length ? (
        <Aperture shoots={shoots} />
      ) : (
        <GalleryEmpty error={error} />
      )}
    </main>
  );
}
