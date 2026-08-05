# Aperture — Photographer Portfolio Site

A Next.js (App Router) site built around the **Aperture** editorial photo
wall: a curated three-column gallery with ambient auto-scroll, a gentle
velocity-driven lens-bow, and a zoom-to-editorial-split detail view with
per-shoot navigation.

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
```

## Pages

| Route | What it is |
|---|---|
| `/` | Landing — static blurred impression of the gallery under a theme-field overlay with name, contact and "See our work". No animation engine loads here. |
| `/work` | The Aperture wall. Click any frame to open its shoot. |
| `/services`, `/about`, `/contact` | Styled stubs sharing the site's type/theme via `PageShell`. |

Navigation: the corner **wordmark** (top-left) returns home; **Menu**
(top-right) opens a fullscreen menu. The browser back button also works —
pages are real routes.

## Where to change things

| You want to… | Edit |
|---|---|
| Studio name, contact info, nav links, inquiry types | `src/content/site.ts` |
| Shoots, photos, camera data | the customer's Dropbox — see below |
| Dropbox folder path, cache window | `src/lib/dropbox/manifest.ts` |
| Any motion/layout constant (spec-pinned) | `src/components/aperture/tunables.ts` |
| Wall slot composition | `DESKTOP_SLOTS` in `tunables.ts` |
| Theme colors (light/dark) | tokens at the top of `src/app/globals.css` |
| Fonts | `src/app/layout.tsx` (`next/font`) |

## Photos live in Dropbox

There is nothing to upload to this repo and no build step for images. The
customer manages the gallery entirely from their own Dropbox:

```
Dropbox / Apps / MK8 / Shoots /
   01 Golden Hour Terrace /
      shoot.txt              ← optional metadata
      DSC_0142.jpg           ← the cover
      terrace wide.jpg
   02 Harbor Fog /
      harbor-01.jpg          ← no shoot.txt: first file is the cover
```

- **Add a shoot** — make a folder, drop photos in.
- **Edit one** — rename, add or remove files.
- **Delete one** — delete the folder.
- **Order the wall** — the number prefix (`01`, `02`, …) sorts the shoots
  and is stripped from the displayed title. A folder named
  `north-light-portraits` displays as "North Light Portraits".
- Changes appear on the site within about **five minutes**.

File names, types and sizes are unrestricted. Anything a browser can render
(`.jpg`, `.png`, `.webp`, `.avif`, `.gif`, spaces in names) works; anything
else is reported by the audit rather than silently ignored.

### shoot.txt (optional)

Plain `Key: value` lines. Every one is optional, unknown keys are ignored,
`#` starts a comment, and a missing file just means the defaults apply:

```
Category: Editorial
Location: Los Angeles
Year: 2026
Cover: DSC_0142.jpg
Description: A rooftop editorial shot in the last twenty minutes of light.
Order: DSC_0142.jpg, terrace wide.jpg
```

Keys are matched loosely — `Focal Length`, `focal length` and `focallength`
are the same key, and `Year: March 2026` parses to 2026.

**Camera details are read from each photo's own EXIF**, so nobody types
them. `shoot.txt` can override any field if the EXIF is wrong or missing.

### How photos reach the browser

| | Wall cover | Detail view |
|---|---|---|
| Source | Dropbox's thumbnailer (~1200px) | the untouched original |
| Served by | `/api/photo/wall/…` (proxied) | `/api/photo/full/…` (redirect) |
| Cached | immutably, keyed by Dropbox `rev` | 1 hour |

URLs carry the file's Dropbox `rev`, so they are immutable: replace a photo
and its URL changes, which busts every cache by itself. Originals are
redirected rather than proxied, which keeps large files off Vercel's 4.5 MB
response cap and off its bandwidth allowance. If Dropbox refuses to
thumbnail a cover — it declines anything over 20 MB, which is exactly what
a straight-from-camera JPEG looks like — the site resizes it instead.

If Dropbox is unreachable, the last good catalogue keeps serving rather
than the gallery going blank.

### Checking what's in there

```bash
npm run shoots:audit                              # against `npm run dev`
AUDIT_TOKEN=… npm run shoots:audit -- <site-url>  # against the deployed site
```

Reports files that were skipped and why, covers that will crop on the wall,
photos big enough to slow a phone down, and shoots with no `shoot.txt`. It
reads `/api/shoots/audit`, so the answers come from the same code that
builds the gallery. That endpoint needs `SHOOTS_AUDIT_TOKEN` in production
because it lists file names.

## Contact form

`/contact` shows the direct details, then an inquiry form: name and email
required, phone optional, inquiry type, and a required comment. Submissions
POST to `/api/contact`, which emails the studio and sends the visitor a
confirmation. Nothing is stored — the inbox is the record.

**Setup.** Copy `.env.example` to `.env.local` and add a
[Resend](https://resend.com) API key (their free tier covers a studio's
volume many times over):

```bash
RESEND_API_KEY=re_...
CONTACT_TO=mk8mediateam@gmail.com          # defaults to SITE.contact.email
CONTACT_FROM="MK8 Media <hello@yourdomain>" # must be a verified sender
```

Without a key, `npm run dev` **dry-runs**: submissions are logged to the
server console and the form reports success, so the whole flow is testable
with no mail account. A production build without a key returns a clear
"not connected — email us directly" message rather than pretending to
send. `CONTACT_DRY_RUN=true` forces log-only mode anywhere (handy for a
demo).

**Inquiry types** come from `SITE.inquiryTypes` — add, rename or reorder
them there and the form, the validator and the notification email all
follow. The **last entry is the fallback**: nothing looks pre-selected,
but an untouched submit sends that value (currently `other`).

**How submissions are handled**

- **Validated twice** — `src/lib/contact.ts` is imported by both the form
  and the route, so a hand-crafted POST faces the same rules as the UI.
- **Bot screening** — an off-screen honeypot plus a fill-timing check.
  Both answer `200 OK` so bots can't learn they were caught; discards are
  logged with the reason. The honeypot is deliberately *not* named
  `company`, which browser autofill would fill, silently killing real
  inquiries.
- **Two-tier rate limiting** — 30 requests / 10 min per IP, and separately
  5 actual sends. Split on purpose: someone mistyping their email five
  times isn't locked out, only real sends spend the strict budget. State
  is in-process (see `src/lib/rate-limit.ts` for the scaling note).
- **Failure is visible** — a failed send keeps the form filled and offers
  the direct address. A submission is never silently swallowed. The
  visitor's confirmation is best-effort: if it bounces, their inquiry
  still counts as sent.
- **Reply-To is the visitor**, so replying from the inbox reaches them.
- **PII discipline** — only these five fields, no analytics on the
  message body, no database, and a short "we only use these details to
  reply to you" note by the submit button.

## Architecture

```
src/
  content/            site.ts (config) · shoots.ts (types + photo URLs)
  lib/
    dropbox/          api.ts (auth + calls) · parse.ts (folder & shoot.txt
                      conventions) · manifest.ts (catalogue + 5-min cache)
                      · exif.ts (camera data) · audit.ts (health check)
    contact.ts        shared form validation · contact-emails.ts
    rate-limit.ts · photo-path.ts
  components/
    aperture/         the gallery, self-contained
      tunables.ts     every magic number from the spec, one file
      layout.ts       buildSlots — desktop slots + mobile masonry
      Aperture.tsx    the wall: single rAF engine (scroll, spin, curl,
                      balloon, wrap/cull, entrance rise)
      EdgeBlur.tsx    stacked masked backdrop-filter bands (top/bottom)
      ShootDetail.tsx zoom to editorial split + arrows/dots shoot nav,
                      late image loading + neighbour prefetch
    site/             Chrome (wordmark + fullscreen menu) · PageShell
                      · ContactForm · GalleryEmpty
  app/                routes; globals.css holds the theme tokens
    api/photo/…       the only path photos take to the browser
    api/shoots/audit  catalogue health check
```

Design decisions of note:

- **The wall freezes while a detail is open** (the engine skips its tick),
  so the zoom's origin rectangle stays valid and the close animation lands
  exactly back in place.
- **Shoot photos load late**: only covers load with the wall; opening a
  shoot loads the current photo and prefetches its neighbours as you
  navigate.
- **`/` and `/work` render per request**, backed by a five-minute shared
  cache of the Dropbox catalogue — so Dropbox is swept once per window for
  the whole site rather than once per visitor, and edits appear without a
  redeploy.
- **Reduced motion** is respected everywhere: no entrance rise, flat wall
  (no bow), instant zoom, no menu/overlay animation dependencies.
- The intro word-drum from the original spec was deliberately replaced by
  the landing-overlay route (`/`); the wall's entrance rise plays on
  mounting `/work` instead.

## Deviations from `aperture.md` (agreed)

- No intro word-drum loader — the landing page at `/` is the front door.
- Photos are organized as **shoots** (cover + set) instead of a flat list
  of 14; the editorial split gains arrows/dots navigation and a per-photo
  camera panel.
- Photos live in the customer's Dropbox instead of the repo; the catalogue
  is built from folder conventions plus an optional `shoot.txt`, and camera
  data comes from EXIF.

Everything else — layout slots, motion constants, bow/balloon math, edge
blur, zoom geometry, fonts, theme tokens — follows the spec's pinned
values (`tunables.ts`).
