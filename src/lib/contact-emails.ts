/*
 * Email bodies for the contact form — one notification to the studio, one
 * confirmation to the visitor. Kept as plain functions (no JSX) so the
 * route stays light, and every message ships text + HTML: some clients
 * strip HTML, and a text part keeps us out of spam folders.
 *
 * Styling is deliberately restrained. Mail clients support a small subset
 * of CSS, so this borrows the site's palette and hairline rules via inline
 * styles rather than trying to reproduce the pages.
 */

import { SITE } from "@/content/site";
import { inquiryLabel, type ContactInput } from "./contact";

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const nl2br = (s: string) => esc(s).replace(/\r?\n/g, "<br>");

const SHELL_OPEN = `<div style="background:#EDEBE6;padding:32px 20px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#161512;font-size:14px;line-height:1.7">
<div style="max-width:560px;margin:0 auto">`;
const SHELL_CLOSE = `</div></div>`;

const RULE = `<div style="border-top:1px solid rgba(22,21,18,0.18);margin:22px 0"></div>`;

const label = (t: string) =>
  `<div style="font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:rgba(22,21,18,0.55);margin-bottom:4px">${esc(
    t
  )}</div>`;

/** Sent to the studio. Reply-To is the visitor, so "reply" just works. */
export function studioNotification(data: ContactInput, meta: { submittedAt: Date }) {
  const type = inquiryLabel(data.inquiryType);
  const when = meta.submittedAt.toISOString().replace("T", " ").slice(0, 16) + " UTC";

  const text = [
    `New ${type.toLowerCase()} inquiry from ${data.name}`,
    ``,
    `Name:     ${data.name}`,
    `Email:    ${data.email}`,
    `Phone:    ${data.phone || "—"}`,
    `Type:     ${type}`,
    `Received: ${when}`,
    ``,
    `Comment:`,
    data.comment,
    ``,
    `— Reply directly to this email to reach ${data.name}.`,
  ].join("\n");

  const html = `${SHELL_OPEN}
  <div style="font-size:11px;letter-spacing:0.24em;text-transform:uppercase;color:rgba(22,21,18,0.55)">${esc(
    SITE.name
  )} · New inquiry</div>
  <h1 style="font-family:Helvetica,Arial,sans-serif;font-weight:bold;font-size:30px;line-height:1.1;margin:14px 0 6px;text-transform:uppercase;letter-spacing:0.01em">${esc(
    type
  )}</h1>
  <div style="color:rgba(22,21,18,0.55);font-size:12px">${esc(when)}</div>
  ${RULE}
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:14px">
    <tr><td style="padding-bottom:14px">${label("Name")}${esc(data.name)}</td></tr>
    <tr><td style="padding-bottom:14px">${label("Email")}<a href="mailto:${esc(
      data.email
    )}" style="color:#161512">${esc(data.email)}</a></td></tr>
    <tr><td style="padding-bottom:14px">${label("Phone")}${
      data.phone
        ? `<a href="tel:${esc(data.phone.replace(/[^+\d]/g, ""))}" style="color:#161512">${esc(
            data.phone
          )}</a>`
        : "—"
    }</td></tr>
  </table>
  ${RULE}
  ${label("Comment")}
  <div style="white-space:pre-wrap">${nl2br(data.comment)}</div>
  ${RULE}
  <div style="color:rgba(22,21,18,0.55);font-size:12px">Reply directly to this email to reach ${esc(
    data.name
  )}.</div>
${SHELL_CLOSE}`;

  return {
    subject: `${type} inquiry — ${data.name}`,
    text,
    html,
  };
}

/** Confirmation to the visitor, so they know it landed. */
export function visitorConfirmation(data: ContactInput) {
  const firstName = data.name.trim().split(/\s+/)[0];

  const text = [
    `Hi ${firstName},`,
    ``,
    `Thanks for getting in touch with ${SITE.name} — your note arrived and`,
    `we'll reply within two business days.`,
    ``,
    `For your records, here's what you sent:`,
    ``,
    `Type:    ${inquiryLabel(data.inquiryType)}`,
    `Phone:   ${data.phone || "—"}`,
    ``,
    data.comment,
    ``,
    `— ${SITE.contact.name}, ${SITE.name}`,
    `${SITE.contact.email} · ${SITE.contact.phone}`,
  ].join("\n");

  const html = `${SHELL_OPEN}
  <div style="font-size:11px;letter-spacing:0.24em;text-transform:uppercase;color:rgba(22,21,18,0.55)">${esc(
    SITE.name
  )}</div>
  <h1 style="font-family:Helvetica,Arial,sans-serif;font-weight:bold;font-size:30px;line-height:1.1;margin:14px 0 16px;text-transform:uppercase;letter-spacing:0.01em">Thanks — we've got it</h1>
  <p style="margin:0 0 16px">Hi ${esc(firstName)}, your note arrived and we'll reply within
  two business days.</p>
  ${RULE}
  ${label("You sent")}
  <div style="white-space:pre-wrap;color:rgba(22,21,18,0.75)">${nl2br(data.comment)}</div>
  <div style="margin-top:14px;color:rgba(22,21,18,0.55);font-size:12px">Inquiry type: ${esc(
    inquiryLabel(data.inquiryType)
  )}${data.phone ? ` · Phone: ${esc(data.phone)}` : ""}</div>
  ${RULE}
  <div style="font-size:13px">${esc(SITE.contact.name)} · ${esc(SITE.name)}<br>
  <a href="mailto:${esc(SITE.contact.email)}" style="color:#161512">${esc(
    SITE.contact.email
  )}</a> · ${esc(SITE.contact.phone)}</div>
${SHELL_CLOSE}`;

  return {
    subject: `We got your note — ${SITE.name}`,
    text,
    html,
  };
}
