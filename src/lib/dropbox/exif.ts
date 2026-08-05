/*
 * Camera data, read from each photo's own EXIF — so nobody types it.
 *
 * Two things make this cheap enough to do during a manifest build:
 *   1. EXIF lives in the first few KB of a JPEG, so we Range-request only
 *      the head of the file instead of downloading 20 MB of pixels;
 *   2. results are cached by Dropbox `rev`, which changes only when the
 *      file itself does — so a given photo is read exactly once, ever.
 */

import "server-only";
import exifr from "exifr";
import { temporaryLink } from "./api";

export type CameraData = {
  body: string;
  lens: string;
  focalLength: string;
  aperture: string;
  shutter: string;
  iso: string;
};

/** EXIF sits at the head of the file; 256 KB is generous. */
const HEAD_BYTES = 262_144;

// rev → camera data (or null when the photo carries no usable EXIF)
const cache = new Map<string, CameraData | null>();
const MAX_CACHE = 2_000;

export const exifCached = (rev: string) => cache.get(rev);

function fraction(exposure: number): string {
  if (!exposure) return "";
  if (exposure >= 1) return `${Number(exposure.toFixed(1))}s`;
  return `1/${Math.round(1 / exposure)}`;
}

function toCamera(tags: Record<string, unknown>): CameraData | null {
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const n = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : 0);

  const make = s(tags.Make);
  const model = s(tags.Model);
  // "NIKON CORPORATION" + "NIKON Z 8" shouldn't read as "NIKON NIKON Z 8"
  const body =
    model && make && !model.toLowerCase().startsWith(make.split(" ")[0].toLowerCase())
      ? `${make} ${model}`
      : model || make;

  const lens = s(tags.LensModel) || s(tags.LensMake) || s(tags.Lens);
  const focal = n(tags.FocalLength);
  const fnum = n(tags.FNumber);
  const exposure = n(tags.ExposureTime);
  const isoRaw = tags.ISO ?? tags.ISOSpeedRatings ?? tags.PhotographicSensitivity;
  const iso = n(Array.isArray(isoRaw) ? isoRaw[0] : isoRaw);

  const data: CameraData = {
    body,
    lens,
    focalLength: focal ? `${Math.round(focal)} mm` : "",
    aperture: fnum ? `f/${Number(fnum.toFixed(1))}` : "",
    shutter: fraction(exposure),
    iso: iso ? `ISO ${iso}` : "",
  };

  // a panel of six blanks is worse than no panel
  return Object.values(data).some(Boolean) ? data : null;
}

/**
 * Read camera data for one photo. Returns null when the file has no usable
 * EXIF (screenshots, exported PNGs, stripped files) — callers should treat
 * that as "no camera panel", not as an error.
 */
export async function readCamera(
  path: string,
  rev: string
): Promise<CameraData | null> {
  if (cache.has(rev)) return cache.get(rev) ?? null;
  try {
    const link = await temporaryLink(path);
    const res = await fetch(link, {
      headers: { Range: `bytes=0-${HEAD_BYTES - 1}` },
      cache: "no-store",
    });
    if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const tags = (await exifr.parse(buf, {
      tiff: true,
      exif: true,
      // we only want these; skipping the rest keeps parsing fast
      pick: [
        "Make",
        "Model",
        "LensModel",
        "LensMake",
        "Lens",
        "FocalLength",
        "FNumber",
        "ExposureTime",
        "ISO",
        "ISOSpeedRatings",
        "PhotographicSensitivity",
      ],
    })) as Record<string, unknown> | undefined;

    const camera = tags ? toCamera(tags) : null;
    if (cache.size > MAX_CACHE) cache.clear();
    cache.set(rev, camera);
    return camera;
  } catch {
    // a failed read is not worth failing a page over; remember the miss so
    // we don't retry it on every rebuild
    if (cache.size > MAX_CACHE) cache.clear();
    cache.set(rev, null);
    return null;
  }
}
