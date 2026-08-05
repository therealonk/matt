/*
 * POST /api/contact — receives a contact-form submission, validates it,
 * screens it for bots, and emails the studio (plus a confirmation to the
 * visitor). Nothing is persisted: the inbox is the system of record.
 *
 * Environment (see .env.example):
 *   RESEND_API_KEY    required to actually send
 *   CONTACT_TO        inbox that receives inquiries (default: SITE.contact.email)
 *   CONTACT_FROM      verified sender, e.g. "MK8 Media <hello@mk8media.com>"
 *   CONTACT_DRY_RUN   "true" to log instead of send (no key needed)
 *
 * Without a key: in development the route dry-runs (logs to the server
 * console and reports success) so the form is testable; in production it
 * returns 503 with a fallback address rather than pretending it sent.
 */

import { NextResponse } from "next/server";
import { SITE } from "@/content/site";
import {
  DEFAULT_INQUIRY,
  INQUIRY_VALUES,
  LIMITS,
  validateContact,
  type ContactInput,
} from "@/lib/contact";
import { studioNotification, visitorConfirmation } from "@/lib/contact-emails";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/*
 * Bots fill this invisible field; humans never see it. Deliberately NOT
 * named "company"/"organization" — browser autofill targets those, and a
 * false positive would silently discard a real inquiry.
 */
const HONEYPOT_FIELD = "bot-field";
/** A real person cannot read and complete the form this fast. */
const MIN_FILL_MS = 2000;
/** Body cap — the fields themselves are capped far below this. */
const MAX_BODY_BYTES = 16_000;

const str = (v: unknown) => (typeof v === "string" ? v : "");

function ok(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status });
}

export async function POST(request: Request) {
  /*
   * Two-tier rate limiting. The coarse tier stops someone hammering the
   * endpoint; the strict tier (applied further down, only once a
   * submission is valid and about to be sent) protects the email quota.
   * Keeping them separate means a visitor who mistypes their address five
   * times isn't locked out — only real sends spend the strict budget.
   */
  const ip = clientIp(request.headers);
  if (!rateLimit(`contact:req:${ip}`, { max: 30 }).ok) {
    return ok(
      {
        error: "rate_limited",
        message: `Too many attempts just now — please try again in a few minutes, or email ${SITE.contact.email} directly.`,
      },
      429
    );
  }

  // --- parse ---
  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES)
      return ok({ error: "too_large", message: "That message is too long." }, 413);
    raw = JSON.parse(text);
  } catch {
    return ok({ error: "bad_request", message: "Malformed submission." }, 400);
  }
  const body = (raw ?? {}) as Record<string, unknown>;

  // --- bot screening: honeypot + fill timing ---
  // Both answer 200 OK on purpose: a bot that learns it was blocked just
  // adapts. A real visitor can never reach this branch.
  const trapped = str(body[HONEYPOT_FIELD]).trim() !== "";
  const elapsed = Number(body.elapsedMs);
  const tooFast = Number.isFinite(elapsed) && elapsed >= 0 && elapsed < MIN_FILL_MS;
  if (trapped || tooFast) {
    console.warn(
      `[contact] discarded submission from ${ip} (${trapped ? "honeypot" : "too fast"})`
    );
    return ok({ ok: true, discarded: true });
  }

  // --- validate (the client checked too; this is the one that counts) ---
  const inquiryTypeRaw = str(body.inquiryType).trim();
  const data: ContactInput = {
    name: str(body.name).trim().slice(0, LIMITS.name + 1),
    email: str(body.email).trim().slice(0, LIMITS.email + 1),
    phone: str(body.phone).trim().slice(0, LIMITS.phone + 1),
    // an absent or unknown type falls back rather than failing the send
    inquiryType: INQUIRY_VALUES.includes(inquiryTypeRaw)
      ? inquiryTypeRaw
      : DEFAULT_INQUIRY,
    comment: str(body.comment).trim().slice(0, LIMITS.comment + 1),
  };

  const errors = validateContact(data);
  if (Object.keys(errors).length) {
    return ok({ error: "invalid", errors }, 422);
  }

  // --- strict tier: this one is about to cost an email ---
  if (!rateLimit(`contact:send:${ip}`, { max: 5 }).ok) {
    return ok(
      {
        error: "rate_limited",
        message: `That's a few messages in a row — please give us a chance to reply, or email ${SITE.contact.email} directly.`,
      },
      429
    );
  }

  // --- send ---
  const to = process.env.CONTACT_TO || SITE.contact.email;
  const from = process.env.CONTACT_FROM || "onboarding@resend.dev";
  const apiKey = process.env.RESEND_API_KEY;
  const dryRun =
    process.env.CONTACT_DRY_RUN === "true" ||
    (!apiKey && process.env.NODE_ENV !== "production");

  const submittedAt = new Date();
  const studio = studioNotification(data, { submittedAt });
  const visitor = visitorConfirmation(data);

  if (dryRun) {
    console.info(
      `[contact] DRY RUN — would email ${to}\n` +
        `  subject: ${studio.subject}\n` +
        `  reply-to: ${data.email}\n` +
        `  phone: ${data.phone || "—"}\n` +
        `  comment: ${data.comment.slice(0, 200)}${data.comment.length > 200 ? "…" : ""}`
    );
    return ok({ ok: true, dryRun: true });
  }

  if (!apiKey) {
    console.error("[contact] RESEND_API_KEY is not set — cannot send.");
    return ok(
      {
        error: "not_configured",
        message: `Our form isn't connected yet — please email ${SITE.contact.email} directly.`,
      },
      503
    );
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);

    // The studio notification is the one that must not fail.
    const sent = await resend.emails.send({
      from,
      to,
      replyTo: data.email,
      subject: studio.subject,
      text: studio.text,
      html: studio.html,
    });
    if (sent.error) throw new Error(sent.error.message);

    // Confirmation is a courtesy — never fail the visitor's submission
    // because their own receipt bounced.
    try {
      await resend.emails.send({
        from,
        to: data.email,
        replyTo: to,
        subject: visitor.subject,
        text: visitor.text,
        html: visitor.html,
      });
    } catch (err) {
      console.warn("[contact] confirmation email failed:", err);
    }

    return ok({ ok: true });
  } catch (err) {
    console.error("[contact] send failed:", err);
    return ok(
      {
        error: "send_failed",
        message: `We couldn't send that just now — please email ${SITE.contact.email} directly.`,
      },
      502
    );
  }
}
