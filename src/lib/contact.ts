/*
 * Shared contact-form contract — imported by BOTH the browser form and the
 * API route, so the two can never drift. The client validates for fast
 * feedback; the server validates again because a hand-made POST never
 * touches our form code.
 */

import { SITE } from "@/content/site";

export const INQUIRY_TYPES: ReadonlyArray<{ value: string; label: string }> =
  SITE.inquiryTypes;
export const INQUIRY_VALUES: string[] = INQUIRY_TYPES.map((t) => t.value);
/** Submitted when the visitor never picks a type (last entry: "other"). */
export const DEFAULT_INQUIRY = INQUIRY_VALUES[INQUIRY_VALUES.length - 1];

export const inquiryLabel = (value: string) =>
  INQUIRY_TYPES.find((t) => t.value === value)?.label ?? value;

export const LIMITS = {
  name: 100,
  email: 200,
  phone: 40,
  comment: 4000,
} as const;

export type ContactField = "name" | "email" | "phone" | "inquiryType" | "comment";

export type ContactInput = {
  name: string;
  email: string;
  phone: string;
  inquiryType: string;
  comment: string;
};

export type ContactErrors = Partial<Record<ContactField, string>>;

/* Deliberately permissive: shape only. Real deliverability is proven by
 * the reply, not by a regex, and over-strict patterns reject valid
 * addresses (plus tags, new TLDs, unicode domains). */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[\d\s()+.\-]{7,}$/;

/** Validate one field. Returns "" when valid. */
export function fieldError(field: ContactField, raw: string): string {
  const v = (raw ?? "").trim();
  switch (field) {
    case "name":
      if (!v) return "Please tell us your name.";
      if (v.length > LIMITS.name) return `Please keep this under ${LIMITS.name} characters.`;
      return "";
    case "email":
      if (!v) return "Please add an email so we can reply.";
      if (v.length > LIMITS.email) return `Please keep this under ${LIMITS.email} characters.`;
      if (!EMAIL_RE.test(v)) return "That email doesn't look right — check for a typo.";
      return "";
    case "phone":
      if (!v) return ""; // optional
      if (v.length > LIMITS.phone) return `Please keep this under ${LIMITS.phone} characters.`;
      if (!PHONE_RE.test(v)) return "That phone number doesn't look right.";
      return "";
    case "comment":
      if (!v) return "Please add a note about what you have in mind.";
      if (v.length > LIMITS.comment) return `Please keep this under ${LIMITS.comment} characters.`;
      return "";
    case "inquiryType":
      if (v && !INQUIRY_VALUES.includes(v)) return "Please choose one of the listed options.";
      return "";
  }
}

export const FIELDS: ContactField[] = [
  "name",
  "email",
  "phone",
  "inquiryType",
  "comment",
];

/** Validate the whole form. */
export function validateContact(input: Partial<ContactInput>): ContactErrors {
  const errors: ContactErrors = {};
  for (const f of FIELDS) {
    const msg = fieldError(f, (input[f] ?? "") as string);
    if (msg) errors[f] = msg;
  }
  return errors;
}
