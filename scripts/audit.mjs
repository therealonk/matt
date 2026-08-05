#!/usr/bin/env node
/*
 * audit — report on what's in the Dropbox folder: files that were skipped,
 * covers that will crop, photos big enough to slow the site down, shoots
 * with no shoot.txt.
 *
 *   npm run shoots:audit                    # against a local dev server
 *   npm run shoots:audit -- <base-url>      # against the deployed site
 *
 * Reads the running site's /api/shoots/audit, so the answers come from the
 * same code that builds the gallery — no second copy of the rules.
 * For a deployed site set SHOOTS_AUDIT_TOKEN and pass it as AUDIT_TOKEN.
 */

const base = (process.argv[2] || "http://localhost:3000").replace(/\/+$/, "");
const token = process.env.AUDIT_TOKEN || process.env.SHOOTS_AUDIT_TOKEN || "";
const url = `${base}/api/shoots/audit${token ? `?token=${encodeURIComponent(token)}` : ""}`;

let res;
try {
  res = await fetch(url);
} catch {
  console.error(`
  ✗ Couldn't reach ${base}
    Start the site first ("npm run dev"), or pass the deployed URL:
    npm run shoots:audit -- https://your-site.vercel.app
`);
  process.exit(1);
}

if (res.status === 401 || res.status === 404) {
  const body = await res.json().catch(() => ({}));
  console.error(`
  ✗ ${body.message || "The audit endpoint refused the request."}
    On a deployed site, set SHOOTS_AUDIT_TOKEN in Vercel and run:
    AUDIT_TOKEN=... npm run shoots:audit -- ${base}
`);
  process.exit(1);
}

if (!res.ok) {
  console.error(`\n  ✗ ${base} returned ${res.status}\n`);
  process.exit(1);
}

const { shoots, photos, warnings } = await res.json();

console.log(`\n  ${shoots} shoot${shoots === 1 ? "" : "s"}, ${photos} photo${photos === 1 ? "" : "s"}\n`);

if (!warnings.length) {
  console.log("  ✓ No warnings — everything looks healthy.\n");
  process.exit(0);
}

// group by shoot so the output reads like the folder structure
const grouped = new Map();
for (const w of warnings) {
  if (!grouped.has(w.shoot)) grouped.set(w.shoot, []);
  grouped.get(w.shoot).push(w);
}
for (const [shoot, items] of grouped) {
  console.log(`  ${shoot}`);
  for (const w of items)
    console.log(`    ${w.file ? w.file + "  " : ""}⚠ ${w.message}`);
  console.log("");
}
console.log(`  ${warnings.length} warning${warnings.length === 1 ? "" : "s"}.\n`);
