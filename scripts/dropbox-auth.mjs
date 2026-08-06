#!/usr/bin/env node
/*
 * dropbox-auth — one-time setup: turn a Dropbox app key + secret into the
 * permanent refresh token the site uses.
 *
 *   npm run dropbox:auth
 *
 * Everything happens on this machine. The key, the secret and the token are
 * printed here and never sent anywhere except Dropbox itself.
 */

import { createInterface } from "node:readline/promises";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENV_FILE = path.join(ROOT, ".env.local");

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = async (q) => (await rl.question(q)).trim();

console.log(`
  Dropbox setup
  =============
  From https://www.dropbox.com/developers/apps → your app → Settings.
`);

const key = await ask("  App key: ");
const secret = await ask("  App secret: ");
if (!key || !secret) {
  console.error("\n  ✗ Both values are required.\n");
  rl.close();
  process.exit(1);
}

/*
 * Scopes are requested EXPLICITLY. Dropbox does not add newly-enabled
 * permissions to a grant a user already gave, and re-authorizing an
 * already-connected app can silently reuse that old grant — which shows up
 * later as "missing_scope" even though the boxes are ticked in the console.
 * Naming them here forces the consent to cover exactly what we need.
 */
const SCOPES = ["files.metadata.read", "files.content.read"];

const authUrl =
  "https://www.dropbox.com/oauth2/authorize" +
  `?client_id=${encodeURIComponent(key)}` +
  "&token_access_type=offline&response_type=code" +
  `&scope=${encodeURIComponent(SCOPES.join(" "))}`;

console.log(`
  1. If this app has been authorized before, disconnect it first:
     https://www.dropbox.com/account/connected_apps
     (A grant made earlier does NOT gain permissions you enabled later,
      and re-authorizing can quietly reuse it.)

  2. Open this URL and click "Allow":

     ${authUrl}

  3. Dropbox shows an authorization code. Copy it and paste it below.
     (It is single-use and expires within a few minutes.)
`);

const code = await ask("  Authorization code: ");
rl.close();
if (!code) {
  console.error("\n  ✗ No code entered.\n");
  process.exit(1);
}

const res = await fetch("https://api.dropboxapi.com/oauth2/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    code,
    grant_type: "authorization_code",
    client_id: key,
    client_secret: secret,
  }),
});

const data = await res.json().catch(() => ({}));

if (!res.ok || !data.refresh_token) {
  const hint =
    data.error === "invalid_grant"
      ? "The code expired or was already used — run this again for a fresh one."
      : data.error === "invalid_client"
        ? "The app key or secret doesn't match. Recheck the Settings tab."
        : !data.refresh_token
          ? "No refresh token came back — the authorize URL needs token_access_type=offline."
          : "";
  console.error(`\n  ✗ Dropbox said: ${data.error_description || data.error || res.status}`);
  if (hint) console.error(`    ${hint}`);
  console.error("");
  process.exit(1);
}

const block = [
  `DROPBOX_APP_KEY=${key}`,
  `DROPBOX_APP_SECRET=${secret}`,
  `DROPBOX_REFRESH_TOKEN=${data.refresh_token}`,
].join("\n");

const granted = (data.scope || "").split(/\s+/).filter(Boolean);
const missing = SCOPES.filter((s) => !granted.includes(s));

console.log(`
  ✓ Success. These three values are what the site needs:

${block
  .split("\n")
  .map((l) => "     " + l)
  .join("\n")}
`);

if (missing.length) {
  console.error(`  ✗ But the grant is missing: ${missing.join(", ")}
    Granted instead: ${granted.join(" ") || "(none)"}

    The gallery will fail with "missing_scope" using this token. Fix it:
      1. https://www.dropbox.com/developers/apps → your app → Permissions
         tick files.metadata.read and files.content.read, click Submit
      2. https://www.dropbox.com/account/connected_apps → disconnect the app
      3. run this again
`);
  process.exit(1);
}
console.log(`  Scopes granted: ${granted.join(" ")}\n`);

// offer to write them locally so `npm run dev` just works
const existing = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, "utf8") : "";
if (existing.includes("DROPBOX_REFRESH_TOKEN=")) {
  console.log(
    "  .env.local already has Dropbox values — left untouched. Update it by hand if you meant to replace them.\n"
  );
} else {
  fs.appendFileSync(
    ENV_FILE,
    (existing && !existing.endsWith("\n") ? "\n" : "") + block + "\n"
  );
  console.log(`  Written to .env.local (git-ignored) for local development.

  For the live site, add the same three to Vercel:
  Settings → Environment Variables, then redeploy.
`);
}
