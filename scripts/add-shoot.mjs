#!/usr/bin/env node
/*
 * add-shoot — register a folder of photos as a shoot on the wall.
 *
 *   npm run add-shoot -- /path/to/folder-of-images
 *   npm run add-shoot -- --list            show registered shoots
 *   npm run add-shoot -- --remove <id>     delete a shoot (files + entry)
 *
 * Asks for the shoot's title, category, description, location, year,
 * which photo is the cover (the wall thumbnail) and optional camera data,
 * then copies the images into public/shoots/<id>/ and appends the entry
 * to src/content/shoots.json. No dependencies beyond Node itself.
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
const BIG_FILE_MB = 4;

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

function die(msg) {
  console.error(`\n  ✗ ${msg}\n`);
  process.exit(1);
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

function listShoots() {
  const shoots = readShoots();
  if (!shoots.length) return console.log("\n  No shoots registered.\n");
  console.log("");
  for (const s of shoots) {
    console.log(
      `  ${s.id.padEnd(26)} "${s.title}"  ·  ${s.photos.length} photo${
        s.photos.length === 1 ? "" : "s"
      }  ·  cover: ${s.photos[0].file}`
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

async function addShoot(srcDir) {
  const src = path.resolve(srcDir);
  if (!fs.existsSync(src) || !fs.statSync(src).isDirectory())
    die(`"${srcDir}" is not a folder.`);

  const files = fs
    .readdirSync(src)
    .filter((f) => IMG_EXT.has(path.extname(f).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (!files.length)
    die(`No image files found in "${srcDir}" (${[...IMG_EXT].join(" ")}).`);

  const shoots = readShoots();
  const asker = makeAsker();
  const ask = asker.ask;

  console.log(`\n  Found ${files.length} photo${files.length === 1 ? "" : "s"} in ${srcDir}:\n`);
  files.forEach((f, i) => {
    const mb = fs.statSync(path.join(src, f)).size / 1048576;
    const warn = mb > BIG_FILE_MB ? `   ← ${mb.toFixed(1)} MB — consider a ~1600px web export` : "";
    console.log(`    ${String(i + 1).padStart(2)}. ${f}${warn}`);
  });
  console.log("");

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

  // copy files — cover first, the rest keep their listed order
  const destDir = path.join(SHOOTS_DIR, id);
  fs.mkdirSync(destDir, { recursive: true });
  const ordered = [files[coverIdx], ...files.filter((_, i) => i !== coverIdx)];
  for (const f of ordered)
    fs.copyFileSync(path.join(src, f), path.join(destDir, f));

  const photos = ordered.map((file, i) =>
    i === 0 && camera ? { file, camera } : { file }
  );
  shoots.push({ id, title, category, description, location, year, photos });
  writeShoots(shoots);

  console.log(`
  ✓ Added "${title}"
      ${ordered.length} photos → public/shoots/${id}/
      cover: ${ordered[0]}
      registered in src/content/shoots.json (${shoots.length} shoots total)

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
`);
  process.exit(arg ? 0 : 1);
} else if (arg === "--list") {
  listShoots();
} else if (arg === "--remove") {
  if (!process.argv[3]) die("--remove needs a shoot id. Try --list.");
  await removeShoot(process.argv[3]);
} else {
  await addShoot(arg);
}
