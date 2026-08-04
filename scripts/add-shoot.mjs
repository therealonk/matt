#!/usr/bin/env node
/*
 * add-shoot — register a folder of photos as a shoot on the wall.
 *
 *   npm run add-shoot -- /path/to/folder-of-images
 *   npm run add-shoot -- --list            show registered shoots
 *   npm run add-shoot -- --remove <id>     delete a shoot (files + entry)
 *   npm run add-shoot -- --audit           re-check every shoot's photos
 *   npm run add-shoot -- --rederive        (re)generate wall derivatives
 *
 * Quality model:
 *   - ORIGINALS ARE NEVER MODIFIED. They are copied as-is and remain what
 *     the per-shoot detail view shows.
 *   - The gallery wall gets a derived cover (`<name>.wall.jpg`, ~1200px
 *     wide, EXIF-oriented, high-quality Lanczos downscale) — as detailed
 *     as any wall frame can display, and no more. Covers already ≤1200px
 *     are used directly with no derivative.
 *
 * Ingest warnings (informative, never blocking):
 *   - files skipped as not web-safe (HEIC/TIFF/RAW/PSD…), by name
 *   - decode cost of big photos (megapixels → browser RAM)
 *   - photos too small to stay sharp in the detail view / on the wall
 *   - landscape covers (wall frames are portrait → centre crop, with %)
 *   - extreme panoramas (render small in the height-fit detail pane)
 *   - total shoot payload (mobile data)
 */

import { createInterface } from "node:readline/promises";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const JSON_PATH = path.join(ROOT, "src", "content", "shoots.json");
const SHOOTS_DIR = path.join(ROOT, "public", "shoots");

const IMG_EXT = new Set([
  ".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif", ".svg",
]);
// recognised-but-not-web-safe, called out by name so nothing is skipped silently
const BAD_EXT = new Set([
  ".heic", ".heif", ".tif", ".tiff", ".bmp", ".psd", ".dng",
  ".cr2", ".cr3", ".nef", ".arw", ".raf", ".orf", ".rw2",
]);

// --- thresholds (see README · "Adding / swapping photos") ---
const WALL_MAX_W = 1200; // px — derived wall cover width ceiling
const JPEG_QUALITY = 82;
const WEBP_QUALITY = 80; // used when the source has transparency
const MP_WARN = 12; // soft decode-cost warning
const MP_STRONG = 24; // strong decode-cost warning
const DETAIL_SOFT_EDGE = 800; // px long edge — may look soft in the detail view
const COVER_SOFT_W = 1000; // px — may look soft on the largest wall frames
const COVER_LANDSCAPE_AR = 1.2; // wall frames are portrait; warn past this
const TALL_AR = 0.5; // extremely tall covers crop top/bottom
const PANO_AR = 2.5; // renders small in the height-fit detail pane
const WALL_SLOT_AR = 0.85; // representative wall frame aspect, for crop %
const PAYLOAD_WARN_MB = 25;
const FILE_WARN_MB = 4;

const readShoots = () => JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));
const writeShoots = (shoots) =>
  fs.writeFileSync(JSON_PATH, JSON.stringify(shoots, null, 2) + "\n");

const slugify = (s) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "shoot";

const prettify = (s) =>
  s
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

const mb = (bytes) => bytes / 1048576;

function die(msg) {
  console.error(`\n  ✗ ${msg}\n`);
  process.exit(1);
}

async function loadSharp() {
  try {
    return (await import("sharp")).default;
  } catch {
    die('The "sharp" dev dependency is missing — run "npm install" first.');
  }
}

/*
 * Prompt helper that also works with piped answers
 * (e.g. `printf 'a\nb\n' | node scripts/add-shoot.mjs dir`):
 * readline drops lines that arrive before question() is listening, so for
 * non-TTY stdin we read everything up front and replay it.
 */
function makeAsker() {
  if (!process.stdin.isTTY) {
    const lines = fs.readFileSync(0, "utf8").split(/\r?\n/);
    return {
      ask: async (q, def) => {
        const a = (lines.shift() ?? "").trim();
        console.log(
          `  ${q}${def !== undefined ? ` [${def}]` : ""}: ${a || def || ""}`
        );
        return a || def || "";
      },
      close: () => {},
    };
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return {
    ask: async (q, def) =>
      (
        await rl.question(def !== undefined ? `  ${q} [${def}]: ` : `  ${q}: `)
      ).trim() || def || "",
    close: () => rl.close(),
  };
}

/* ---------------- probing & warnings ---------------- */

/** EXIF-orientation-corrected display dimensions + format info. */
async function probe(sharp, filePath) {
  const meta = await sharp(filePath).metadata();
  const swap = (meta.orientation ?? 1) >= 5; // EXIF 5–8 rotate 90°
  const width = swap ? meta.height : meta.width;
  const height = swap ? meta.width : meta.height;
  return {
    width,
    height,
    ar: width / height,
    mp: (width * height) / 1e6,
    format: meta.format,
    hasAlpha: !!meta.hasAlpha,
    bytes: fs.statSync(filePath).size,
  };
}

/** Informative warnings for one photo; cover gets extra checks. */
function photoWarnings(p, { isCover }) {
  const w = [];
  if (p.mp >= MP_STRONG)
    w.push(
      `${p.mp.toFixed(0)} MP — decodes to ~${Math.round(
        (p.width * p.height * 4) / 1048576
      )} MB of browser RAM; a ~2400px export would look identical in the detail view`
    );
  else if (p.mp >= MP_WARN)
    w.push(
      `${p.mp.toFixed(0)} MP — decodes to ~${Math.round(
        (p.width * p.height * 4) / 1048576
      )} MB of browser RAM`
    );
  if (mb(p.bytes) > FILE_WARN_MB && p.mp < MP_WARN)
    w.push(`${mb(p.bytes).toFixed(1)} MB file — heavy for its pixel count`);
  if (Math.max(p.width, p.height) < DETAIL_SOFT_EDGE)
    w.push(
      `only ${p.width}×${p.height} — may look soft in the detail view`
    );
  if (p.ar > PANO_AR)
    w.push(
      `panorama (${p.ar.toFixed(1)}:1) — will render small in the height-fit detail pane`
    );
  if (isCover) {
    if (p.width < COVER_SOFT_W && p.format !== "svg")
      w.push(
        `cover is ${p.width}px wide — may look soft on the largest wall frames`
      );
    if (p.ar > COVER_LANDSCAPE_AR)
      w.push(
        `landscape cover — wall frames are portrait, only the centre ~${Math.round(
          (WALL_SLOT_AR / p.ar) * 100
        )}% of its width will show (centre crop)`
      );
    else if (p.ar < TALL_AR)
      w.push(
        `very tall cover (1:${(1 / p.ar).toFixed(1)}) — wall frames will centre-crop the top/bottom`
      );
  }
  return w;
}

function printFileLine(idx, name, p, warnings) {
  const dims = p ? `  ${p.width}×${p.height} · ${mb(p.bytes).toFixed(1)} MB` : "";
  console.log(`    ${String(idx).padStart(2)}. ${name}${dims}`);
  for (const w of warnings) console.log(`        ⚠ ${w}`);
}

function reportSkipped(srcDir, files) {
  const skipped = fs
    .readdirSync(srcDir)
    .filter((f) => !files.includes(f) && !f.startsWith("."))
    .filter((f) => fs.statSync(path.join(srcDir, f)).isFile());
  for (const f of skipped) {
    const ext = path.extname(f).toLowerCase();
    const why = BAD_EXT.has(ext)
      ? "not web-safe — export as JPEG"
      : "not a recognised image";
    console.log(`    --  ${f}   ⚠ skipped: ${why}`);
  }
  return skipped.length;
}

/* ---------------- wall derivative ---------------- */

/**
 * Derive the wall cover: same aspect (never cropped), EXIF-oriented,
 * Lanczos downscale to WALL_MAX_W. Returns { file, width, height, bytes }
 * or { skip: reason }. The original is untouched.
 */
async function makeWallDerivative(sharp, origPath, destDir, baseName, meta) {
  if (meta.format === "svg" || meta.format === "gif")
    return { skip: `${meta.format} — used as-is on the wall` };
  if (meta.width <= WALL_MAX_W)
    return { skip: `already ${meta.width}px wide (≤ ${WALL_MAX_W}px) — original serves the wall` };
  const ext = meta.hasAlpha ? "webp" : "jpg";
  const outName = baseName.replace(/\.[^.]+$/, "") + `.wall.${ext}`;
  const outPath = path.join(destDir, outName);
  let pipe = sharp(origPath).rotate().resize({ width: WALL_MAX_W });
  pipe = meta.hasAlpha
    ? pipe.webp({ quality: WEBP_QUALITY })
    : pipe.jpeg({ quality: JPEG_QUALITY, progressive: true, mozjpeg: true });
  const info = await pipe.toFile(outPath);
  return { file: outName, width: info.width, height: info.height, bytes: info.size };
}

/* ---------------- commands ---------------- */

function listShoots() {
  const shoots = readShoots();
  if (!shoots.length) return console.log("\n  No shoots registered.\n");
  console.log("");
  for (const s of shoots) {
    const wall = s.photos[0].wallFile ? ` (wall: ${s.photos[0].wallFile})` : "";
    console.log(
      `  ${s.id.padEnd(26)} "${s.title}"  ·  ${s.photos.length} photo${
        s.photos.length === 1 ? "" : "s"
      }  ·  cover: ${s.photos[0].file}${wall}`
    );
  }
  console.log("");
}

async function removeShoot(id) {
  const shoots = readShoots();
  const idx = shoots.findIndex((s) => s.id === id);
  if (idx < 0) die(`No shoot with id "${id}". Try --list.`);
  const asker = makeAsker();
  const sure = (
    await asker.ask(
      `Delete "${shoots[idx].title}" (${shoots[idx].photos.length} photos) and its files? (y/N)`,
      "N"
    )
  ).toLowerCase();
  asker.close();
  if (!sure.startsWith("y")) return console.log("  Cancelled.");
  shoots.splice(idx, 1);
  writeShoots(shoots);
  fs.rmSync(path.join(SHOOTS_DIR, id), { recursive: true, force: true });
  console.log(`  ✓ Removed "${id}".`);
}

async function auditShoots() {
  const sharp = await loadSharp();
  const shoots = readShoots();
  let total = 0;
  console.log("");
  for (const s of shoots) {
    const dir = path.join(SHOOTS_DIR, s.id);
    const lines = [];
    for (let i = 0; i < s.photos.length; i++) {
      const ph = s.photos[i];
      const p = path.join(dir, ph.file);
      if (!fs.existsSync(p)) {
        lines.push(`    ${ph.file}   ⚠ file missing on disk`);
        continue;
      }
      const meta = await probe(sharp, p);
      const warns = photoWarnings(meta, { isCover: i === 0 });
      if (i === 0 && !ph.wallFile && meta.width > WALL_MAX_W)
        warns.push(
          `no wall derivative — the wall loads the full ${meta.width}px original (run --rederive)`
        );
      for (const w of warns) lines.push(`    ${ph.file}   ⚠ ${w}`);
    }
    if (lines.length) {
      console.log(`  ${s.id}`);
      lines.forEach((l) => console.log(l));
      total += lines.length;
    }
  }
  console.log(
    total
      ? `\n  ${total} warning${total === 1 ? "" : "s"}.\n`
      : "  ✓ No warnings — every shoot looks healthy.\n"
  );
}

async function rederive() {
  const sharp = await loadSharp();
  const shoots = readShoots();
  let changed = 0;
  console.log("");
  for (const s of shoots) {
    const cover = s.photos[0];
    const dir = path.join(SHOOTS_DIR, s.id);
    const orig = path.join(dir, cover.file);
    if (!fs.existsSync(orig)) {
      console.log(`  ${s.id.padEnd(26)} ⚠ cover missing on disk — skipped`);
      continue;
    }
    const meta = await probe(sharp, orig);
    const res = await makeWallDerivative(sharp, orig, dir, cover.file, meta);
    if (res.file) {
      if (cover.wallFile && cover.wallFile !== res.file) {
        fs.rmSync(path.join(dir, cover.wallFile), { force: true });
      }
      cover.wallFile = res.file;
      changed++;
      console.log(
        `  ${s.id.padEnd(26)} ✓ ${res.file}  ${res.width}×${res.height} · ${(
          res.bytes / 1024
        ).toFixed(0)} KB`
      );
    } else {
      if (cover.wallFile) {
        // original no longer needs a derivative — clean up
        fs.rmSync(path.join(dir, cover.wallFile), { force: true });
        delete cover.wallFile;
        changed++;
      }
      console.log(`  ${s.id.padEnd(26)} — ${res.skip}`);
    }
  }
  if (changed) writeShoots(shoots);
  console.log(`\n  ${changed ? `Updated ${changed} shoot${changed === 1 ? "" : "s"}.` : "Nothing to change."}\n`);
}

async function addShoot(srcDir) {
  const src = path.resolve(srcDir);
  if (!fs.existsSync(src) || !fs.statSync(src).isDirectory())
    die(`"${srcDir}" is not a folder.`);

  const files = fs
    .readdirSync(src)
    .filter((f) => IMG_EXT.has(path.extname(f).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (!files.length)
    die(`No web-safe image files found in "${srcDir}" (${[...IMG_EXT].join(" ")}).`);

  const sharp = await loadSharp();
  const shoots = readShoots();

  console.log(
    `\n  Found ${files.length} photo${files.length === 1 ? "" : "s"} in ${srcDir}:\n`
  );
  const metas = [];
  for (let i = 0; i < files.length; i++) {
    const full = path.join(src, files[i]);
    let meta = null;
    try {
      meta = await probe(sharp, full);
    } catch {
      /* unreadable file — listed without dims, warned below */
    }
    metas.push(meta);
    printFileLine(
      i + 1,
      files[i],
      meta,
      meta ? photoWarnings(meta, { isCover: false }) : ["unreadable — is this a valid image?"]
    );
  }
  reportSkipped(src, files);
  console.log("");

  const asker = makeAsker();
  const ask = asker.ask;

  const title = await ask("Shoot title", prettify(path.basename(src)));

  let id = slugify(await ask("Folder id (url-safe)", slugify(title)));
  while (
    shoots.some((s) => s.id === id) ||
    fs.existsSync(path.join(SHOOTS_DIR, id))
  ) {
    console.log(`  ! "${id}" already exists.`);
    id = slugify(await ask("Choose another id", `${id}-2`));
  }

  const category = await ask("Category (Editorial, Portrait, …)", "Editorial");
  const description = await ask("Description (1–2 sentences)", "");
  const location = await ask("Location", "");
  const year =
    parseInt(await ask("Year", String(new Date().getFullYear())), 10) ||
    new Date().getFullYear();

  let coverIdx = NaN;
  while (!(coverIdx >= 1 && coverIdx <= files.length)) {
    coverIdx = parseInt(
      await ask(`Cover photo — the wall thumbnail (1–${files.length})`, "1"),
      10
    );
  }
  coverIdx -= 1;

  const coverMeta = metas[coverIdx];
  if (coverMeta) {
    const coverWarns = photoWarnings(coverMeta, { isCover: true }).filter(
      (w) => w.includes("cover") // only the cover-specific ones are new here
    );
    for (const w of coverWarns) console.log(`    ⚠ ${w}`);
  }

  let camera;
  const wantCam = (await ask("Add camera data for the cover? (y/N)", "N"))
    .toLowerCase()
    .startsWith("y");
  if (wantCam) {
    camera = {
      body: await ask("  Camera body", ""),
      lens: await ask("  Lens", ""),
      focalLength: await ask("  Focal length", ""),
      aperture: await ask("  Aperture", ""),
      shutter: await ask("  Shutter", ""),
      iso: await ask("  ISO", ""),
    };
  }
  asker.close();

  // copy originals untouched — cover first, the rest keep their listed order
  const destDir = path.join(SHOOTS_DIR, id);
  fs.mkdirSync(destDir, { recursive: true });
  const ordered = [files[coverIdx], ...files.filter((_, i) => i !== coverIdx)];
  for (const f of ordered)
    fs.copyFileSync(path.join(src, f), path.join(destDir, f));

  // wall derivative for the cover (original untouched, aspect preserved)
  let wallNote = "";
  let wallFile;
  if (coverMeta) {
    const res = await makeWallDerivative(
      sharp,
      path.join(destDir, ordered[0]),
      destDir,
      ordered[0],
      coverMeta
    );
    if (res.file) {
      wallFile = res.file;
      wallNote = `      wall derivative: ${res.file}  ${res.width}×${res.height} · ${(
        res.bytes / 1024
      ).toFixed(0)} KB (the wall loads this; the detail view keeps the original)\n`;
    } else {
      wallNote = `      wall derivative: skipped — ${res.skip}\n`;
    }
  }

  const photos = ordered.map((file, i) => {
    const entry = { file };
    if (i === 0 && wallFile) entry.wallFile = wallFile;
    if (i === 0 && camera) entry.camera = camera;
    return entry;
  });
  shoots.push({ id, title, category, description, location, year, photos });
  writeShoots(shoots);

  const totalMB = ordered.reduce(
    (sum, f) => sum + mb(fs.statSync(path.join(destDir, f)).size),
    0
  );
  const payloadWarn =
    totalMB > PAYLOAD_WARN_MB
      ? `      ⚠ shoot payload is ${totalMB.toFixed(0)} MB — heavy on mobile data if a visitor browses the whole shoot\n`
      : "";

  console.log(`
  ✓ Added "${title}"
      ${ordered.length} photos → public/shoots/${id}/
      cover: ${ordered[0]}
${wallNote}${payloadWarn}
  The wall shows covers in catalogue order. To reorder photos within the
  shoot, edit its "photos" list in src/content/shoots.json — first is the
  cover. Run "npm run dev" to see it.
`);
}

const arg = process.argv[2];
if (!arg || arg === "--help" || arg === "-h") {
  console.log(`
  Usage:
    npm run add-shoot -- /path/to/folder-of-images
    npm run add-shoot -- --list
    npm run add-shoot -- --remove <id>
    npm run add-shoot -- --audit
    npm run add-shoot -- --rederive
`);
  process.exit(arg ? 0 : 1);
} else if (arg === "--list") {
  listShoots();
} else if (arg === "--remove") {
  if (!process.argv[3]) die("--remove needs a shoot id. Try --list.");
  await removeShoot(process.argv[3]);
} else if (arg === "--audit") {
  await auditShoots();
} else if (arg === "--rederive") {
  await rederive();
} else {
  await addShoot(arg);
}
