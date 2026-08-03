import type { Metadata } from "next";
import Aperture from "@/components/aperture/Aperture";
import Chrome from "@/components/site/Chrome";
import { SITE } from "@/content/site";

export const metadata: Metadata = {
  title: `Work — ${SITE.name}`,
};

export default function WorkPage() {
  return (
    <main>
      <Chrome />
      <Aperture />
    </main>
  );
}
