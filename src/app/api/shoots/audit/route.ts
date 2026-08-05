/*
 * GET /api/shoots/audit — a health check on what's in Dropbox: files that
 * were skipped, covers that will crop, photos big enough to hurt, shoots
 * missing a shoot.txt.
 *
 * It reveals file names and folder structure, so in production it requires
 * a token: set SHOOTS_AUDIT_TOKEN and pass it as ?token= or a Bearer
 * header. In development it's open, since there's nothing to protect.
 */

import { NextResponse } from "next/server";
import { auditShoots } from "@/lib/dropbox/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const expected = process.env.SHOOTS_AUDIT_TOKEN;
  const isProd = process.env.NODE_ENV === "production";

  if (isProd) {
    if (!expected) {
      return NextResponse.json(
        {
          error: "audit_disabled",
          message:
            "Set SHOOTS_AUDIT_TOKEN to enable the audit endpoint in production.",
        },
        { status: 404 }
      );
    }
    const url = new URL(request.url);
    const supplied =
      url.searchParams.get("token") ??
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (supplied !== expected)
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await auditShoots();
  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}
