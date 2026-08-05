/*
 * Builds the shoot catalogue from Dropbox and keeps it warm.
 *
 * One recursive list_folder call covers the whole tree, so a rebuild is
 * roughly one API round-trip plus a small download per shoot.txt. The
 * result is cached for CACHE_TTL_MS; when the cache is stale we rebuild,
 * and if Dropbox is unreachable we keep serving the last good copy rather
 * than showing an empty gallery.
 */

import "server-only";
import { revalidateTag, unstable_cache } from "next/cache";
import {
  DropboxError,
  downloadText,
  dropboxConfigured,
  listFolder,
  type DbxFile,
} from "./api";
import {
  METADATA_FILE,
  extname,
  isWebImage,
  NON_WEB_EXT,
  orderPhotos,
  parseShootMeta,
  slugify,
  splitOrderPrefix,
  byName,
  type ShootMeta,
} from "./parse";
import { exifCached, readCamera } from "./exif";
import type { Shoot, ShootPhoto } from "@/content/shoots";

export type { Shoot, ShootPhoto, CameraData } from "@/content/shoots";

/** Root inside the Dropbox App Folder (/Apps/MK8/Shoots). */
export const SHOOTS_ROOT = process.env.DROPBOX_SHOOTS_PATH || "/Shoots";

/** How long a built manifest is considered fresh. */
export const CACHE_TTL_MS = 5 * 60_000;

/** Time budget for reading EXIF during a build; the rest fills in later. */
const EXIF_BUDGET_MS = 3_000;
const EXIF_CONCURRENCY = 6;

/** Cache tag, so a webhook can invalidate the manifest on demand. */
const SHOOTS_TAG = "dropbox-shoots";

/* ---------------- building ---------------- */

function groupByShoot(entries: DbxFile[]) {
  const rootDepth = SHOOTS_ROOT.split("/").filter(Boolean).length;
  const folders = new Map<string, { display: string; files: DbxFile[] }>();

  for (const e of entries) {
    const parts = e.path_display.split("/").filter(Boolean);
    // want exactly <root>/<shoot folder>/<file>; ignore deeper nesting
    if (parts.length !== rootDepth + 2) continue;
    const folderName = parts[rootDepth];
    const key = folderName.toLowerCase();
    if (!folders.has(key)) folders.set(key, { display: folderName, files: [] });
    folders.get(key)!.files.push(e);
  }
  return folders;
}

async function buildShoot(
  folderName: string,
  files: DbxFile[]
): Promise<Shoot | null> {
  const metaFile = files.find(
    (f) => f.name.toLowerCase() === METADATA_FILE.toLowerCase()
  );
  let meta: ShootMeta = {};
  if (metaFile) {
    const text = await downloadText(metaFile.path_lower).catch(() => null);
    if (text) meta = parseShootMeta(text);
  }

  const byFileName = new Map(files.map((f) => [f.name, f]));
  const ordered = orderPhotos([...byFileName.keys()], meta);
  if (!ordered.length) return null; // a folder with no usable images isn't a shoot

  const skipped = files
    .filter(
      (f) =>
        !isWebImage(f.name) &&
        f.name.toLowerCase() !== METADATA_FILE.toLowerCase()
    )
    .map((f) => ({
      name: f.name,
      reason: NON_WEB_EXT.has(extname(f.name))
        ? "not web-safe — export as JPEG"
        : "not a recognised image",
    }));

  const { order, title } = splitOrderPrefix(folderName);
  const photos: ShootPhoto[] = ordered.map((name) => {
    const f = byFileName.get(name)!;
    return {
      name: f.name,
      path: f.path_lower,
      rev: f.rev,
      size: f.size,
      camera: exifCached(f.rev) ?? undefined,
    };
  });

  return {
    id: slugify(meta.title || title),
    title: meta.title || title,
    category: meta.category || "",
    description: meta.description || "",
    location: meta.location || "",
    year: meta.year ?? null,
    photos,
    skipped,
    // carried on the side for sorting, stripped before returning
    ...({ _order: order } as object),
  } as Shoot & { _order: number | null };
}

/** Fill in camera data for photos we haven't read yet, within a time budget. */
async function warmExif(shoots: Shoot[], budgetMs: number) {
  const pending: ShootPhoto[] = [];
  for (const s of shoots)
    for (const p of s.photos) if (!p.camera && exifCached(p.rev) === undefined) pending.push(p);
  if (!pending.length) return;

  const deadline = Date.now() + budgetMs;
  let cursor = 0;
  const worker = async () => {
    while (cursor < pending.length && Date.now() < deadline) {
      const photo = pending[cursor++];
      const camera = await readCamera(photo.path, photo.rev);
      if (camera) photo.camera = camera;
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(EXIF_CONCURRENCY, pending.length) }, worker)
  );
}

async function build(): Promise<Shoot[]> {
  const entries = await listFolder(SHOOTS_ROOT, { recursive: true });
  const files = entries.filter((e): e is DbxFile => e[".tag"] === "file");
  const grouped = groupByShoot(files);

  const built = await Promise.all(
    [...grouped.values()].map((g) => buildShoot(g.display, g.files))
  );
  const shoots = built.filter((s): s is Shoot => s !== null);

  // numeric folder prefix first (01, 02, …), then everything else by name
  shoots.sort((a, b) => {
    const ao = (a as Shoot & { _order?: number | null })._order;
    const bo = (b as Shoot & { _order?: number | null })._order;
    if (ao != null && bo != null) return ao - bo;
    if (ao != null) return -1;
    if (bo != null) return 1;
    return byName(a.title, b.title);
  });
  for (const s of shoots) delete (s as Shoot & { _order?: unknown })._order;

  await warmExif(shoots, EXIF_BUDGET_MS);
  return shoots;
}

/* ---------------- public API ---------------- */

export type ShootsResult = {
  shoots: Shoot[];
  /** True when Dropbox failed and this is the last good copy. */
  stale: boolean;
  /** Set when the gallery is empty for a reason worth showing an operator. */
  error?: string;
};

/*
 * Cached through Next's data cache rather than a module variable, so the
 * five-minute window is shared across serverless instances instead of
 * restarting on every cold boot — one Dropbox sweep per window for the
 * whole site, not one per container.
 */
const cachedBuild = unstable_cache(build, ["dropbox-shoots"], {
  revalidate: CACHE_TTL_MS / 1000,
  tags: [SHOOTS_TAG],
});

/** Last successful build, kept in-process purely as an outage fallback. */
let lastGood: Shoot[] | null = null;

export async function getShoots(): Promise<ShootsResult> {
  if (!dropboxConfigured()) {
    return {
      shoots: [],
      stale: false,
      error:
        "Dropbox is not configured — set DROPBOX_APP_KEY, DROPBOX_APP_SECRET and DROPBOX_REFRESH_TOKEN.",
    };
  }

  try {
    const shoots = await cachedBuild();
    lastGood = shoots;
    return { shoots, stale: false };
  } catch (err) {
    const message =
      err instanceof DropboxError
        ? `${err.message}${err.body ? ` — ${err.body.slice(0, 200)}` : ""}`
        : String(err);
    console.error("[dropbox] manifest build failed:", message);

    // Serving the previous gallery beats serving none of it.
    if (lastGood) return { shoots: lastGood, stale: true };
    return { shoots: [], stale: false, error: message };
  }
}

/** Drop the cached manifest (used by any future Dropbox webhook). */
export function invalidateShoots() {
  revalidateTag(SHOOTS_TAG);
  lastGood = null;
}

/** Look up one photo by path, for the photo route's validation. */
export async function findPhoto(
  path: string
): Promise<{ shoot: Shoot; photo: ShootPhoto } | null> {
  const { shoots } = await getShoots();
  for (const shoot of shoots) {
    const photo = shoot.photos.find((p) => p.path === path.toLowerCase());
    if (photo) return { shoot, photo };
  }
  return null;
}
