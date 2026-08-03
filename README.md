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
| Studio name, contact info, nav links | `src/content/site.ts` |
| Shoots, photos, camera data | `src/content/shoots.ts` + `public/shoots/` |
| Any motion/layout constant (spec-pinned) | `src/components/aperture/tunables.ts` |
| Wall slot composition | `DESKTOP_SLOTS` in `tunables.ts` |
| Theme colors (light/dark) | tokens at the top of `src/app/globals.css` |
| Fonts | `src/app/layout.tsx` (`next/font`) |

## Adding / swapping photos

1. Drop a folder of images into `public/shoots/<shoot-id>/`.
2. Add an entry to `SHOOTS` in `src/content/shoots.ts` listing the files in
   display order. **The first photo is the cover** shown on the wall.

File names, extensions and dimensions are unrestricted — anything the
browser renders (`.jpg`, `.png`, `.webp`, `.avif`, `.svg`, spaces in names)
works. Aspect ratios are measured at runtime; nothing needs pre-declaring.

Notes on the loose-file approach:
- Covers are displayed `object-cover` inside portrait wall frames, so an
  extremely wide cover will crop hard on the wall (fine in the detail view,
  which re-fits per photo). Prefer portrait-ish covers.
- Files are served as-is from `public/` — no build-time resizing. For a
  production hand-off, export web-sized files (~1600 px long edge). If
  automatic optimization is ever wanted, the `<img>` tags in
  `Aperture.tsx` / `ShootDetail.tsx` / `app/page.tsx` are the three places
  to swap in `next/image` (that *would* reintroduce sizing metadata
  requirements, which is why it's not done here).
- The bundled images are generated gradient placeholders with the file
  name baked in (so shoot navigation is visibly working) — replace them
  folder-by-folder.

## Architecture

```
src/
  content/            site.ts (config) · shoots.ts (catalogue)
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
