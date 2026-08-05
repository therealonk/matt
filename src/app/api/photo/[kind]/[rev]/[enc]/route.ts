/*
 * GET /api/photo/{kind}/{rev}/{base64url(path)}
 *
 * The only way photos reach the browser. Two kinds, deliberately different:
 *
 *   wall  — the gallery grid's cover. Dropbox renders the thumbnail (its
 *           box is 2048×1536 "bestfit", which lands a portrait cover at
 *           ~1230px wide — right at the ceiling a wall frame can show). We
 *           proxy those bytes and mark them immutable.
 *
 *   full  — the detail view's photo, always the untouched original. Rather
 *           than stream 20+ MB through the function (Vercel caps a response
 *           at 4.5 MB, and it would burn the bandwidth allowance), we hand
 *           back a redirect to Dropbox's own temporary link and let the
 *           browser fetch it directly.
 *
 * `rev` is in the path purely so the URL changes when the file does: every
 * response is immutable, so a CDN can hold it forever and a re-uploaded
 * photo busts its own cache.
 */

import { NextResponse } from "next/server";
import { content, temporaryLink } from "@/lib/dropbox/api";
import { SHOOTS_ROOT } from "@/lib/dropbox/manifest";
import { decodePath, WEB_IMAGE_EXT } from "@/lib/photo-path";

export const runtime = "nodejs";

/** Dropbox refuses to thumbnail anything past this; we resize it ourselves. */
const DROPBOX_THUMB_MAX_BYTES = 20 * 1024 * 1024;
/** Our own ceiling for a wall cover, used only by the fallback path. */
const WALL_MAX_W = 1200;

const IMMUTABLE = "public, max-age=31536000, s-maxage=31536000, immutable";
/** Redirects expire with the temporary link they point at (4 h). */
const REDIRECT_CACHE = "public, max-age=3600, s-maxage=3600";

function bad(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ kind: string; rev: string; enc: string }> }
) {
  const { kind, enc } = await ctx.params;
  if (kind !== "wall" && kind !== "full") return bad("Unknown photo kind", 404);

  let path: string;
  try {
    path = decodePath(enc);
  } catch {
    return bad("Malformed photo path", 400);
  }

  /*
   * The app is already scoped to its own App Folder, so nothing private is
   * reachable — but the path still comes from a URL, so confine it to the
   * shoots tree and to renderable image types before handing it to Dropbox.
   */
  const lower = path.toLowerCase();
  const root = SHOOTS_ROOT.toLowerCase();
  const ext = lower.slice(lower.lastIndexOf("."));
  if (!lower.startsWith(root + "/") || lower.includes("..") || !WEB_IMAGE_EXT.has(ext))
    return bad("Not a gallery photo", 400);

  try {
    if (kind === "full") {
      const link = await temporaryLink(path);
      return NextResponse.redirect(link, {
        status: 302,
        headers: { "Cache-Control": REDIRECT_CACHE },
      });
    }

    // --- wall cover ---
    const res = await content("files/get_thumbnail_v2", {
      resource: { ".tag": "path", path },
      format: { ".tag": "jpeg" },
      size: { ".tag": "w2048h1536" },
      mode: { ".tag": "bestfit" },
    });

    if (res.ok) {
      return new NextResponse(res.body, {
        status: 200,
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": IMMUTABLE,
        },
      });
    }

    /*
     * Dropbox declined — almost always a file over 20 MB, which is exactly
     * what a straight-from-camera JPEG looks like. Resize it ourselves so
     * the customer's most likely upload isn't the one that breaks the wall.
     */
    const detail = await res.text().catch(() => "");
    console.warn(`[photo] thumbnail declined for ${path} (${res.status}) ${detail.slice(0, 160)}`);

    const link = await temporaryLink(path);
    const head = await fetch(link, { method: "HEAD", cache: "no-store" });
    const size = Number(head.headers.get("content-length") ?? 0);
    if (size && size > DROPBOX_THUMB_MAX_BYTES * 6) {
      // absurdly large: don't pull it into memory, just send them the original
      return NextResponse.redirect(link, {
        status: 302,
        headers: { "Cache-Control": REDIRECT_CACHE },
      });
    }

    const original = await fetch(link, { cache: "no-store" });
    if (!original.ok) return bad("Could not read the photo", 502);
    const sharp = (await import("sharp")).default;
    const resized = await sharp(Buffer.from(await original.arrayBuffer()))
      .rotate()
      .resize({ width: WALL_MAX_W, withoutEnlargement: true })
      .jpeg({ quality: 82, progressive: true, mozjpeg: true })
      .toBuffer();

    return new NextResponse(new Uint8Array(resized), {
      status: 200,
      headers: { "Content-Type": "image/jpeg", "Cache-Control": IMMUTABLE },
    });
  } catch (err) {
    console.error("[photo] failed:", err);
    return bad("Photo unavailable", 502);
  }
}
