#!/usr/bin/env node
/*
 * dropbox-check — verify the three Dropbox credentials in seconds, without
 * deploying and without printing anything secret.
 *
 *   npm run dropbox:check                 # reads .env.local
 *   DROPBOX_APP_KEY=… npm run dropbox:check
 *
 * Checks the shape of each value (the invisible paste damage that causes
 * most failures), then does a real token refresh and, if that works, a
 * real listing of the shoots folder.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/* --- load .env.local without adding a dependency --- */
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    out[t.slice(0, eq).trim()] = t.slice(eq + 1);
  }
  return out;
}

const fromFile = loadEnvFile(path.join(ROOT, ".env.local"));
const raw = (name) => process.env[name] ?? fromFile[name] ?? "";

// same override the app honours, so this can be pointed at a stand-in
const API = (raw("DROPBOX_API_BASE") || "https://api.dropboxapi.com").replace(/\/+$/, "");

const NAMES = [
  "DROPBOX_APP_KEY",
  "DROPBOX_APP_SECRET",
  "DROPBOX_REFRESH_TOKEN",
];

console.log("\n  Dropbox credential check\n  ========================\n");

/* --- 1. shape --- */
let shapeProblem = false;
const clean = {};
for (const name of NAMES) {
  const v = raw(name);
  const trimmed = v.trim().replace(/^['"]|['"]$/g, "");
  clean[name] = trimmed;

  const notes = [];
  if (!v) notes.push("MISSING");
  else {
    if (v !== v.trim()) notes.push("has surrounding whitespace");
    if (/^['"]|['"]$/.test(v.trim())) notes.push("wrapped in quotes");
    if (/\s/.test(trimmed)) notes.push("contains a space or newline INSIDE the value");
    if (name === "DROPBOX_APP_KEY" && trimmed.length < 10)
      notes.push("looks too short for an app key");
    if (name === "DROPBOX_APP_SECRET" && trimmed.length < 10)
      notes.push("looks too short for an app secret");
    if (name === "DROPBOX_REFRESH_TOKEN" && trimmed.length < 20)
      notes.push("looks too short for a refresh token");
    if (name === "DROPBOX_REFRESH_TOKEN" && trimmed.startsWith("sl."))
      notes.push(
        'starts with "sl." — that is an ACCESS token, not a refresh token; re-read the refresh_token field'
      );
  }

  // never print the value: just its shape
  const shape = trimmed
    ? `${trimmed.length} chars, starts "${trimmed.slice(0, 3)}…"`
    : "—";
  const flag = notes.length ? "  ⚠ " + notes.join("; ") : "  ok";
  if (notes.length) shapeProblem = true;
  console.log(`  ${name.padEnd(24)} ${shape.padEnd(28)}${flag}`);
}

if (NAMES.some((n) => !clean[n])) {
  console.error(`
  ✗ Missing values. Put them in .env.local (see .env.example), or run:
      npm run dropbox:auth
`);
  process.exit(1);
}
if (shapeProblem)
  console.log(
    "\n  Note: the site trims whitespace and quotes automatically, but a\n  dashboard may store them literally — worth cleaning up there too."
  );

/* --- 2. does the key/secret pair authenticate? --- */
console.log("\n  Refreshing an access token…");
const res = await fetch(`${API}/oauth2/token`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: clean.DROPBOX_REFRESH_TOKEN,
    client_id: clean.DROPBOX_APP_KEY,
    client_secret: clean.DROPBOX_APP_SECRET,
  }),
});
const body = await res.text();

if (!res.ok) {
  const isClient = body.includes("invalid_client");
  const isGrant = body.includes("invalid_grant");
  console.error(`
  ✗ Dropbox rejected the request (${res.status})
    ${body.slice(0, 200)}
`);
  if (isClient)
    console.error(`  This is the APP KEY / APP SECRET pair — your refresh token was never
  checked. Things to verify, in order:

    1. Both values come from the SAME app at
       https://www.dropbox.com/developers/apps → your app → Settings
    2. They are not swapped (key is the shorter one shown first)
    3. No quotes, spaces or line breaks were copied along with them
    4. The secret wasn't regenerated after you copied it
       (clicking "Regenerate" invalidates the old one immediately)
`);
  else if (isGrant)
    console.error(`  The key/secret pair is FINE — the refresh token is the problem. It was
  either revoked, or issued by a different app. Re-issue one:

    npm run dropbox:auth
`);
  process.exit(1);
}

console.log("  ✓ Token refresh succeeded — key, secret and refresh token all valid.");

/* --- 3. does this grant actually carry the scopes we need? --- */
const parsed = JSON.parse(body);
const { access_token } = parsed;
const REQUIRED = ["files.metadata.read", "files.content.read"];
const granted = (parsed.scope || "").split(/\s+/).filter(Boolean);

if (granted.length) {
  const missing = REQUIRED.filter((r) => !granted.includes(r));
  console.log(`  ${missing.length ? "✗" : "✓"} Scopes on this token: ${granted.join(" ")}`);
  if (missing.length) {
    console.error(`
  ✗ Missing: ${missing.join(", ")}

    Ticking the box in the app console does NOT add the permission to a
    grant you already made — the token keeps whatever it was issued with.
    To fix it, in this order:

      1. https://www.dropbox.com/developers/apps → your app → Permissions
         tick files.metadata.read and files.content.read, click Submit
      2. https://www.dropbox.com/account/connected_apps
         find the app and disconnect it (this clears the old grant)
      3. npm run dropbox:auth
         it now names the scopes explicitly and verifies what came back
`);
    process.exit(1);
  }
}
const shootsPath = (raw("DROPBOX_SHOOTS_PATH") || "/Shoots").trim();

const list = await fetch(`${API}/2/files/list_folder`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${access_token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ path: shootsPath, recursive: false }),
});
const listBody = await list.text();

if (!list.ok) {
  console.error(`\n  ✗ Could not list ${shootsPath} (${list.status})\n    ${listBody.slice(0, 200)}\n`);
  if (listBody.includes("not_found"))
    console.error(`  The folder doesn't exist yet. In your Dropbox, open
    Apps / <your app name> / and create a folder called "Shoots".
`);
  else if (listBody.includes("missing_scope"))
    console.error(`  The TOKEN lacks a permission the app has. Enabling a scope in the
  console does not add it to a grant a user already made — you must
  disconnect and re-authorize:

    1. https://www.dropbox.com/developers/apps → your app → Permissions
       tick files.metadata.read and files.content.read, click Submit
    2. https://www.dropbox.com/account/connected_apps → disconnect the app
    3. npm run dropbox:auth
`);
  process.exit(1);
}

const entries = JSON.parse(listBody).entries ?? [];
const folders = entries.filter((e) => e[".tag"] === "folder");
console.log(`  ✓ ${shootsPath} is readable — ${folders.length} shoot folder${folders.length === 1 ? "" : "s"}:`);
for (const f of folders.slice(0, 10)) console.log(`      ${f.name}`);
if (!folders.length)
  console.log(`      (empty — add a folder of photos and the gallery will fill in)`);
console.log("");
