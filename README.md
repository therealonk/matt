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
| Shoots, photos, camera data | `npm run add-shoot`, or `src/content/shoots.json` + `public/shoots/` |
| Any motion/layout constant (spec-pinned) | `src/components/aperture/tunables.ts` |
| Wall slot composition | `DESKTOP_SLOTS` in `tunables.ts` |
| Theme colors (light/dark) | tokens at the top of `src/app/globals.css` |
| Fonts | `src/app/layout.tsx` (`next/font`) |

## Adding / swapping photos

The easy way — point the script at a folder of images:

```bash
npm run add-shoot -- /path/to/folder-of-images
npm run add-shoot -- --list          # show registered shoots
npm run add-shoot -- --remove <id>   # delete a shoot (files + entry)
npm run add-shoot -- --audit         # re-check every shoot's photos
npm run add-shoot -- --rederive      # (re)generate wall derivatives
```

It asks for the title, category, description, location, year, which photo
is the cover (the wall thumbnail) and optional camera data, then copies
the images into `public/shoots/<id>/` and registers the shoot in
`src/content/shoots.json`. Answers can also be piped in for scripted use.

**Quality model.** Originals are never modified — they're copied as-is
and are always what the per-shoot detail view shows (the zoom opens on
the cached wall image and silently upgrades to the original once loaded).
For the gallery wall, the script derives `<name>.wall.jpg` from the cover:
same aspect (never cropped), EXIF-oriented, high-quality downscale to
1200px wide — as detailed as any wall frame can display, and no more.
Covers already ≤1200px are served directly with no derivative. Existing
shoots can be upgraded any time with `--rederive`.

**Ingest warnings** (informative, never blocking): skipped non-web-safe
files by name (HEIC/TIFF/RAW/PSD…); decode cost of big photos
(megapixels → browser RAM); photos too small to stay sharp in the detail
view or on the wall; landscape covers (wall frames are portrait — the
warning includes the visible-width %); extreme panoramas (render small in
the height-fit detail pane); total shoot payload over 25 MB. Thresholds
live at the top of `scripts/add-shoot.mjs`.

By hand:

1. Drop a folder of images into `public/shoots/<shoot-id>/`.
2. Add an entry to `src/content/shoots.json` listing the files in
   display order. **The first photo is the cover** shown on the wall.
   (Types and URL helpers live in `src/content/shoots.ts`.)

File names, extensions and dimensions are unrestricted — anything the
browser renders (`.jpg`, `.png`, `.webp`, `.avif`, `.svg`, spaces in names)
works. Aspect ratios are measured at runtime; nothing needs pre-declaring.

Notes on the loose-file approach:
- Covers are displayed `object-cover` inside portrait wall frames, so an
  extremely wide cover will crop hard on the wall (fine in the detail view,
  which re-fits per photo). Prefer portrait-ish covers.
- Detail-view photos are served as-is from `public/` — that's the
  quality guarantee. For visitors' sake, exporting shoot photos at
  ~2400 px long edge is visually identical to camera-native files on any
  realistic screen (the ingest warnings say so when it matters).
- The bundled images are generated gradient placeholders with the file
  name baked in (so shoot navigation is visibly working) — replace them
  folder-by-folder.

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
  content/            site.ts (config) · shoots.ts (catalogue)
  lib/                contact.ts (shared validation) · contact-emails.ts
                      · rate-limit.ts
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
                      · ContactForm
  app/                routes; globals.css holds the theme tokens
```

Design decisions of note:

- **The wall freezes while a detail is open** (the engine skips its tick),
  so the zoom's origin rectangle stays valid and the close animation lands
  exactly back in place.
- **Shoot photos load late**: only covers load with the wall; opening a
  shoot loads the current photo and prefetches its neighbours as you
  navigate.
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
- Images are local files with unrestricted names/types instead of the
  hosted `<id>.avif` set.

Everything else — layout slots, motion constants, bow/balloon math, edge
blur, zoom geometry, fonts, theme tokens — follows the spec's pinned
values (`tunables.ts`).
