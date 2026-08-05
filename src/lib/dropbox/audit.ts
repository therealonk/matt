/*
 * Health check for what's in Dropbox — the same advice the old local
 * ingest script gave, now pointed at the customer's folder.
 *
 * It reads only the head of each photo (a Range request), so auditing a
 * whole catalogue costs kilobytes rather than gigabytes.
 */

import "server-only";
import { temporaryLink } from "./api";
import { getShoots } from "./manifest";
import type { Shoot } from "@/content/shoots";

/* --- thresholds, mirrored from the wall's own geometry --- */
const MP_WARN = 12; // soft decode-cost warning
const MP_STRONG = 24; // strong decode-cost warning
const DETAIL_SOFT_EDGE = 800; // px long edge — soft in the detail view
const COVER_SOFT_W = 1000; // px — soft on the largest wall frames
const COVER_LANDSCAPE_AR = 1.2; // wall frames are portrait
const TALL_AR = 0.5;
const PANO_AR = 2.5; // renders small in the height-fit detail pane
const WALL_SLOT_AR = 0.85; // representative wall frame aspect
const PAYLOAD_WARN_MB = 25;
const DROPBOX_THUMB_MAX_MB = 20; // past this Dropbox won't thumbnail

const HEAD_BYTES = 262_144;
const CONCURRENCY = 6;

export type Warning = { shoot: string; file?: string; message: string };

type Probe = { width: number; height: number } | null;

async function probeSize(path: string): Promise<Probe> {
  try {
    const link = await temporaryLink(path);
    const res = await fetch(link, {
      headers: { Range: `bytes=0-${HEAD_BYTES - 1}` },
      cache: "no-store",
    });
    if (!res.ok && res.status !== 206) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const sharp = (await import("sharp")).default;
    const meta = await sharp(buf).metadata();
    if (!meta.width || !meta.height) return null;
    // EXIF orientations 5–8 swap the display dimensions
    const swap = (meta.orientation ?? 1) >= 5;
    return {
      width: swap ? meta.height : meta.width,
      height: swap ? meta.width : meta.height,
    };
  } catch {
    return null;
  }
}

function photoWarnings(
  shoot: Shoot,
  file: string,
  sizeBytes: number,
  dims: Probe,
  isCover: boolean
): Warning[] {
  const out: Warning[] = [];
  const add = (message: string) => out.push({ shoot: shoot.title, file, message });
  const mb = sizeBytes / 1048576;

  if (mb > DROPBOX_THUMB_MAX_MB && isCover)
    add(
      `${mb.toFixed(0)} MB — past Dropbox's 20 MB thumbnail limit, so the site resizes this cover itself (slower first load)`
    );

  if (!dims) {
    add("could not read this image's dimensions — is the file complete?");
    return out;
  }

  const { width, height } = dims;
  const mp = (width * height) / 1e6;
  const ar = width / height;
  const ramMB = Math.round((width * height * 4) / 1048576);

  if (mp >= MP_STRONG)
    add(
      `${mp.toFixed(0)} MP — decodes to ~${ramMB} MB of browser RAM; a ~2400px export would look identical in the detail view`
    );
  else if (mp >= MP_WARN) add(`${mp.toFixed(0)} MP — decodes to ~${ramMB} MB of browser RAM`);

  if (Math.max(width, height) < DETAIL_SOFT_EDGE)
    add(`only ${width}×${height} — may look soft in the detail view`);

  if (ar > PANO_AR)
    add(`panorama (${ar.toFixed(1)}:1) — will render small in the height-fit detail pane`);

  if (isCover) {
    if (width < COVER_SOFT_W)
      add(`cover is ${width}px wide — may look soft on the largest wall frames`);
    if (ar > COVER_LANDSCAPE_AR)
      add(
        `landscape cover — wall frames are portrait, so only the centre ~${Math.round(
          (WALL_SLOT_AR / ar) * 100
        )}% of its width shows`
      );
    else if (ar < TALL_AR)
      add(`very tall cover (1:${(1 / ar).toFixed(1)}) — the wall will crop top and bottom`);
  }
  return out;
}

export type AuditResult = {
  shoots: number;
  photos: number;
  warnings: Warning[];
  checkedAt: string;
};

export async function auditShoots(): Promise<AuditResult> {
  const { shoots, error } = await getShoots();
  const warnings: Warning[] = [];

  if (error) {
    return {
      shoots: 0,
      photos: 0,
      warnings: [{ shoot: "—", message: error }],
      checkedAt: new Date().toISOString(),
    };
  }
  if (!shoots.length)
    warnings.push({
      shoot: "—",
      message:
        "No shoots found. Add a folder of photos under /Shoots in the app folder.",
    });

  // files the manifest had to ignore
  for (const s of shoots)
    for (const sk of s.skipped)
      warnings.push({ shoot: s.title, file: sk.name, message: `skipped — ${sk.reason}` });

  // probe every photo, a few at a time
  const jobs: { shoot: Shoot; index: number }[] = [];
  for (const s of shoots) s.photos.forEach((_, i) => jobs.push({ shoot: s, index: i }));

  let cursor = 0;
  const worker = async () => {
    while (cursor < jobs.length) {
      const { shoot, index } = jobs[cursor++];
      const photo = shoot.photos[index];
      const dims = await probeSize(photo.path);
      warnings.push(
        ...photoWarnings(shoot, photo.name, photo.size, dims, index === 0)
      );
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker)
  );

  // whole-shoot payload
  for (const s of shoots) {
    const totalMB = s.photos.reduce((sum, p) => sum + p.size, 0) / 1048576;
    if (totalMB > PAYLOAD_WARN_MB)
      warnings.push({
        shoot: s.title,
        message: `${totalMB.toFixed(0)} MB of photos — heavy on mobile data if a visitor browses the whole shoot`,
      });
    if (!s.category && !s.description && !s.location && s.year === null)
      warnings.push({
        shoot: s.title,
        message:
          "no shoot.txt — the detail page shows only a title. Add one for category, location, year and description.",
      });
  }

  return {
    shoots: shoots.length,
    photos: jobs.length,
    warnings,
    checkedAt: new Date().toISOString(),
  };
}
