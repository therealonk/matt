/*
 * The conventions that turn a Dropbox folder into a shoot.
 *
 * Everything here is forgiving on purpose: the customer manages this with
 * folders and a text file, so a missing line, an odd name or a stray file
 * must degrade gracefully rather than break the gallery.
 */

/** Image types a browser can render — anything else is ignored. */
export const WEB_IMAGE_EXT = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".avif",
  ".gif",
]);

/** Recognised camera/design formats a browser cannot show. */
export const NON_WEB_EXT = new Set([
  ".heic",
  ".heif",
  ".tif",
  ".tiff",
  ".bmp",
  ".psd",
  ".dng",
  ".cr2",
  ".cr3",
  ".nef",
  ".arw",
  ".raf",
  ".orf",
  ".rw2",
]);

export const METADATA_FILE = "shoot.txt";

export const extname = (name: string) => {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i).toLowerCase();
};

export const isWebImage = (name: string) => WEB_IMAGE_EXT.has(extname(name));

/**
 * A folder named with hyphens or underscores and no spaces was almost
 * certainly typed for a filesystem, not for display — "north-light-portraits"
 * should read as "North Light Portraits". A name that already contains
 * spaces is left exactly as the customer wrote it.
 */
function prettifyFolderTitle(name: string): string {
  if (/\s/.test(name) || !/[-_]/.test(name)) return name;
  return name
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\b\p{Ll}/gu, (c) => c.toUpperCase());
}

/** "01 Golden Hour Terrace" → { order: 1, title: "Golden Hour Terrace" } */
export function splitOrderPrefix(folderName: string): {
  order: number | null;
  title: string;
} {
  const m = folderName.match(/^\s*(\d{1,3})\s*[-_.)\]]?\s+(.+)$/);
  if (m) return { order: Number(m[1]), title: prettifyFolderTitle(m[2].trim()) };

  // also handle "01-golden-hour" where the prefix has no space after it
  const dashed = folderName.match(/^\s*(\d{1,3})[-_.]\s*(.+)$/);
  if (dashed)
    return { order: Number(dashed[1]), title: prettifyFolderTitle(dashed[2].trim()) };

  return { order: null, title: prettifyFolderTitle(folderName.trim()) };
}

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "shoot"
  );
}

/** Natural sort so "photo-2" precedes "photo-10". */
export const byName = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

export type ShootMeta = {
  title?: string;
  category?: string;
  description?: string;
  location?: string;
  year?: number;
  cover?: string;
  order?: string[];
  /** Optional manual camera overrides, applied to the cover. */
  camera?: Partial<{
    body: string;
    lens: string;
    focalLength: string;
    aperture: string;
    shutter: string;
    iso: string;
  }>;
};

/*
 * `shoot.txt` is "Key: value", one per line. Unknown keys are ignored so a
 * customer's own notes in the file can't break anything; `#` starts a
 * comment. Keys are matched case- and space-insensitively, because
 * "Focal Length", "focal length" and "focallength" should all work.
 */
const KEY_ALIASES: Record<string, keyof ShootMeta | `camera.${string}`> = {
  title: "title",
  name: "title",
  category: "category",
  type: "category",
  description: "description",
  desc: "description",
  about: "description",
  location: "location",
  place: "location",
  city: "location",
  year: "year",
  date: "year",
  cover: "cover",
  thumbnail: "cover",
  thumb: "cover",
  order: "order",
  camera: "camera.body",
  body: "camera.body",
  lens: "camera.lens",
  focal: "camera.focalLength",
  focallength: "camera.focalLength",
  aperture: "camera.aperture",
  fstop: "camera.aperture",
  shutter: "camera.shutter",
  shutterspeed: "camera.shutter",
  iso: "camera.iso",
};

export function parseShootMeta(text: string): ShootMeta {
  const meta: ShootMeta = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const colon = line.indexOf(":");
    if (colon < 1) continue;

    const key = line.slice(0, colon).trim().toLowerCase().replace(/[\s_-]/g, "");
    const value = line.slice(colon + 1).trim();
    if (!value) continue;

    const target = KEY_ALIASES[key];
    if (!target) continue;

    if (target.startsWith("camera.")) {
      const field = target.slice("camera.".length) as keyof NonNullable<
        ShootMeta["camera"]
      >;
      meta.camera = { ...meta.camera, [field]: value };
      continue;
    }

    switch (target) {
      case "year": {
        // tolerate "2026", "March 2026", "2026-03-14"
        const y = value.match(/(19|20)\d{2}/);
        if (y) meta.year = Number(y[0]);
        break;
      }
      case "order":
        meta.order = value
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        break;
      case "title":
      case "category":
      case "description":
      case "location":
      case "cover":
        meta[target] = value;
        break;
    }
  }
  return meta;
}

/**
 * Decide the cover and the display order for a shoot's files.
 * Precedence: explicit `Cover:` / `Order:` → a file named "cover.*" →
 * a numeric filename prefix → natural alphabetical.
 */
export function orderPhotos(fileNames: string[], meta: ShootMeta): string[] {
  const images = fileNames.filter(isWebImage);
  const norm = (s: string) => s.trim().toLowerCase();

  let ordered: string[];
  if (meta.order?.length) {
    const wanted = meta.order.map(norm);
    const seen = new Set<string>();
    ordered = [];
    for (const w of wanted) {
      const hit = images.find((f) => norm(f) === w && !seen.has(f));
      if (hit) {
        ordered.push(hit);
        seen.add(hit);
      }
    }
    // anything not named in Order: keeps its natural place at the end
    ordered.push(...images.filter((f) => !seen.has(f)).sort(byName));
  } else {
    ordered = [...images].sort(byName);
  }

  const coverName =
    (meta.cover && images.find((f) => norm(f) === norm(meta.cover!))) ||
    images.find((f) => /^cover\./i.test(f));

  if (coverName) {
    ordered = [coverName, ...ordered.filter((f) => f !== coverName)];
  }
  return ordered;
}
