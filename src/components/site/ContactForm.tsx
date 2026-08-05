"use client";

/*
 * Contact form — editorial underline fields, type chips, and the site's
 * button treatment (direction "A" from the design mocks).
 *
 * Behaviour notes:
 *   - Inquiry type shows nothing selected until the visitor picks one;
 *     an untouched submit sends the fallback ("other"), per spec.
 *   - Fields validate on blur, then everything validates on submit and
 *     focus jumps to the first problem.
 *   - Validation rules come from lib/contact.ts, the same module the API
 *     route uses, so client and server can never disagree.
 *   - A honeypot field plus a fill-timing value ride along for the
 *     server's bot screening.
 *   - If the send fails, the form is preserved and the direct email
 *     address is offered — a submission is never silently swallowed.
 */

import { useEffect, useRef, useState } from "react";
import { SITE } from "@/content/site";
import {
  DEFAULT_INQUIRY,
  INQUIRY_TYPES,
  fieldError,
  validateContact,
  type ContactErrors,
  type ContactField,
  type ContactInput,
} from "@/lib/contact";

const EMPTY: ContactInput = {
  name: "",
  email: "",
  phone: "",
  inquiryType: "",
  comment: "",
};

export default function ContactForm() {
  const [values, setValues] = useState<ContactInput>(EMPTY);
  const [errors, setErrors] = useState<ContactErrors>({});
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [sendError, setSendError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const successRef = useRef<HTMLDivElement | null>(null);
  const mountedAt = useRef(Date.now());

  // move focus to the confirmation so keyboard and screen-reader users
  // land on the outcome rather than the top of the page
  useEffect(() => {
    if (status === "sent") successRef.current?.focus();
  }, [status]);

  const set = (field: ContactField, value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    // clear an error as soon as the visitor fixes it
    if (errors[field] && !fieldError(field, value))
      setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const blur = (field: ContactField) =>
    setErrors((e) => ({ ...e, [field]: fieldError(field, values[field]) || undefined }));

  const focusField = (field: ContactField) => {
    const el = formRef.current?.elements.namedItem(field);
    if (el instanceof HTMLElement) el.focus();
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSendError(null);

    const found = validateContact(values);
    setErrors(found);
    const firstBad = (Object.keys(found) as ContactField[])[0];
    if (firstBad) return focusField(firstBad);

    setStatus("sending");
    const honeypot =
      (formRef.current?.elements.namedItem("bot-field") as HTMLInputElement | null)
        ?.value ?? "";

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          // an untouched control submits the fallback type
          inquiryType: values.inquiryType || DEFAULT_INQUIRY,
          "bot-field": honeypot,
          elapsedMs: Date.now() - mountedAt.current,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setStatus("sent");
        return;
      }
      if (res.status === 422 && data.errors) {
        setErrors(data.errors as ContactErrors);
        const bad = (Object.keys(data.errors) as ContactField[])[0];
        if (bad) focusField(bad);
        setStatus("idle");
        return;
      }
      setSendError(
        data.message ??
          `We couldn't send that just now — please email ${SITE.contact.email} directly.`
      );
      setStatus("idle");
    } catch {
      setSendError(
        `We couldn't reach the server — please check your connection, or email ${SITE.contact.email} directly.`
      );
      setStatus("idle");
    }
  }

  if (status === "sent") {
    return (
      <div
        ref={successRef}
        tabIndex={-1}
        role="status"
        className="flex flex-col gap-4 outline-none"
      >
        <div className="display text-[clamp(28px,5vw,46px)]">
          Thank you — it&apos;s sent.
        </div>
        <p className="mono-tight max-w-[52ch]" style={{ color: "var(--dim)" }}>
          We&apos;ve got your note and will reply within two business days. A
          copy is on its way to your inbox.
        </p>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      noValidate
      className="mono-tight flex flex-col gap-5"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          field="name"
          label="Name"
          required
          value={values.name}
          error={errors.name}
          autoComplete="name"
          placeholder="Your name"
          onChange={set}
          onBlur={blur}
        />
        <Field
          field="email"
          label="Email"
          required
          type="email"
          value={values.email}
          error={errors.email}
          autoComplete="email"
          placeholder="you@example.com"
          onChange={set}
          onBlur={blur}
        />
      </div>

      <Field
        field="phone"
        label="Phone"
        optional
        type="tel"
        value={values.phone}
        error={errors.phone}
        autoComplete="tel"
        placeholder="Optional"
        onChange={set}
        onBlur={blur}
      />

      <fieldset className="border-0 p-0">
        <legend className="field-label p-0">Inquiry type</legend>
        <div className="flex flex-wrap gap-2">
          {INQUIRY_TYPES.map((t) => (
            <label key={t.value} className="chip relative">
              <input
                type="radio"
                name="inquiryType"
                value={t.value}
                checked={values.inquiryType === t.value}
                onChange={() => set("inquiryType", t.value)}
              />
              <span>{t.label}</span>
            </label>
          ))}
        </div>
        {!values.inquiryType && (
          <div className="mt-2 text-[11px]" style={{ color: "var(--dim)" }}>
            Select… (defaults to Other)
          </div>
        )}
      </fieldset>

      <Field
        field="comment"
        label="Comment"
        required
        textarea
        value={values.comment}
        error={errors.comment}
        placeholder="Dates, location, what you have in mind…"
        onChange={set}
        onBlur={blur}
      />

      {/*
        Honeypot — off-screen and never tabbable, so only bots fill it.
        Named "bot-field" rather than "company"/"organization" precisely
        because browser autofill targets those, and a false positive here
        would silently discard a genuine inquiry.
      */}
      <input
        className="honeypot"
        name="bot-field"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
      />

      {sendError && (
        <p
          role="alert"
          className="text-[12px]"
          style={{ color: "var(--error)" }}
        >
          {sendError}
        </p>
      )}

      <div className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-3">
        <button type="submit" className="btn-line" disabled={status === "sending"}>
          {status === "sending" ? "Sending…" : "Send inquiry"}
        </button>
        <span className="text-[11px]" style={{ color: "var(--dim)" }}>
          Replies within two business days. We only use these details to reply
          to you.
        </span>
      </div>
    </form>
  );
}

function Field({
  field,
  label,
  value,
  error,
  onChange,
  onBlur,
  type = "text",
  required,
  optional,
  textarea,
  placeholder,
  autoComplete,
}: {
  field: ContactField;
  label: string;
  value: string;
  error?: string;
  onChange: (f: ContactField, v: string) => void;
  onBlur: (f: ContactField) => void;
  type?: string;
  required?: boolean;
  optional?: boolean;
  textarea?: boolean;
  placeholder?: string;
  autoComplete?: string;
}) {
  const id = `contact-${field}`;
  const errId = `${id}-error`;
  const shared = {
    id,
    name: field,
    value,
    placeholder,
    autoComplete,
    className: "field-line",
    "aria-invalid": error ? (true as const) : undefined,
    "aria-describedby": error ? errId : undefined,
    onChange: (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => onChange(field, e.target.value),
    onBlur: () => onBlur(field),
  };

  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}{" "}
        {required && <span style={{ color: "var(--dim)" }}>*</span>}
        {optional && <span style={{ color: "var(--dim)" }}>— optional</span>}
      </label>
      {textarea ? (
        <textarea rows={4} {...shared} />
      ) : (
        <input type={type} {...shared} />
      )}
      <div
        id={errId}
        className="min-h-[1.2em] text-[11px]"
        style={{ color: "var(--error)" }}
      >
        {error}
      </div>
    </div>
  );
}
