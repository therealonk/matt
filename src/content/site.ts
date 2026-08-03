/*
 * Site-wide config — the single place a customer hand-off edits.
 * Name, contact details and navigation feed the landing overlay,
 * the fullscreen menu, page metadata and the corner wordmark.
 */

export type NavLink = { label: string; href: string };

export const SITE = {
  /** Display name — used in the landing headline, wordmark and <title>. */
  name: "MK8 Media",
  /** Short tagline under the landing eyebrow. */
  tagline: "Photography & Marketing",
  description:
    "A curated editorial photography portfolio and marketing studio.",
  contact: {
    /** Person to reach — shown above the contact details. */
    name: "Matt",
    email: "mk8mediateam@gmail.com",
    phone: "646-123-4567",
    location: "New York, NY",
  },
  /** Order defines the fullscreen menu (numbered 01, 02, …). */
  nav: [
    { label: "Work", href: "/work" },
    { label: "Services", href: "/services" },
    { label: "About", href: "/about" },
    { label: "Contact", href: "/contact" },
  ] as NavLink[],
} as const;
