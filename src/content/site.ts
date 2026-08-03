/*
 * Site-wide config — the single place a customer hand-off edits.
 * Name, contact details and navigation feed the landing overlay,
 * the fullscreen menu, page metadata and the corner wordmark.
 */

export type NavLink = { label: string; href: string };

export const SITE = {
  /** Display name — used in the landing headline, wordmark and <title>. */
  name: "Aperture",
  /** Short tagline under the landing eyebrow. */
  tagline: "Photography & Marketing",
  description:
    "A curated editorial photography portfolio and marketing studio.",
  contact: {
    email: "hello@example.com",
    phone: "+1 (000) 000-0000",
    location: "Los Angeles, CA",
  },
  /** Order defines the fullscreen menu (numbered 01, 02, …). */
  nav: [
    { label: "Work", href: "/work" },
    { label: "Services", href: "/services" },
    { label: "About", href: "/about" },
    { label: "Contact", href: "/contact" },
  ] as NavLink[],
} as const;
