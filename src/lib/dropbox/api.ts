/*
 * Dropbox API client — auth + the two call styles Dropbox uses.
 *
 * Auth model: the app holds a refresh token (permanent, issued once during
 * setup) and exchanges it for short-lived access tokens as needed. Tokens
 * are cached in module scope and refreshed a minute before expiry; a single
 * in-flight refresh is shared so a burst of calls can't stampede.
 *
 * The app is scoped to its own App Folder, so every path here is relative
 * to /Apps/<app name>/ — the code says "/Shoots", Dropbox resolves it
 * inside the app folder, and nothing outside it is reachable.
 */

import "server-only";

/*
 * Endpoints are overridable so the suite can point the whole data layer at
 * a local stand-in Dropbox. Unset in production, where the real hosts win.
 */
const API_HOST = process.env.DROPBOX_API_BASE || "https://api.dropboxapi.com";
const CONTENT_HOST =
  process.env.DROPBOX_CONTENT_BASE || "https://content.dropboxapi.com";
const TOKEN_URL = `${API_HOST}/oauth2/token`;
const RPC_BASE = `${API_HOST}/2`;
const CONTENT_BASE = `${CONTENT_HOST}/2`;

/** Refresh this many ms before the token actually expires. */
const TOKEN_SKEW_MS = 60_000;

export class DropboxError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: string
  ) {
    super(message);
    this.name = "DropboxError";
  }
}

export function dropboxConfigured(): boolean {
  return Boolean(
    process.env.DROPBOX_APP_KEY &&
      process.env.DROPBOX_APP_SECRET &&
      process.env.DROPBOX_REFRESH_TOKEN
  );
}

let cachedToken: { value: string; expiresAt: number } | null = null;
let inFlight: Promise<string> | null = null;

async function fetchAccessToken(): Promise<string> {
  const key = process.env.DROPBOX_APP_KEY;
  const secret = process.env.DROPBOX_APP_SECRET;
  const refresh = process.env.DROPBOX_REFRESH_TOKEN;
  if (!key || !secret || !refresh)
    throw new DropboxError("Dropbox credentials are not configured", 0);

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refresh,
      client_id: key,
      client_secret: secret,
    }),
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) {
    // 400 here almost always means the refresh token was revoked or the
    // key/secret don't match it — worth saying plainly in the logs.
    throw new DropboxError(
      `Could not refresh the Dropbox access token (${res.status}). Check DROPBOX_APP_KEY / DROPBOX_APP_SECRET / DROPBOX_REFRESH_TOKEN.`,
      res.status,
      text
    );
  }
  const json = JSON.parse(text) as { access_token: string; expires_in: number };
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000 - TOKEN_SKEW_MS,
  };
  return json.access_token;
}

export async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;
  if (!inFlight) {
    inFlight = fetchAccessToken().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

/** Force the next call to mint a fresh token (used after a 401). */
function invalidateToken() {
  cachedToken = null;
}

type CallOpts = { retryOn401?: boolean; signal?: AbortSignal };

/** JSON-in / JSON-out endpoints (files/list_folder, files/get_metadata, …). */
export async function rpc<T>(
  endpoint: string,
  body: unknown,
  opts: CallOpts = {}
): Promise<T> {
  const run = async (): Promise<Response> =>
    fetch(`${RPC_BASE}/${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await accessToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: opts.signal,
    });

  let res = await run();
  if (res.status === 401 && opts.retryOn401 !== false) {
    invalidateToken();
    res = await run();
  }
  if (res.status === 429) {
    const wait = Number(res.headers.get("Retry-After") ?? 1);
    await new Promise((r) => setTimeout(r, Math.min(10, wait) * 1000));
    res = await run();
  }
  if (!res.ok) {
    throw new DropboxError(
      `Dropbox ${endpoint} failed (${res.status})`,
      res.status,
      await res.text().catch(() => undefined)
    );
  }
  return (await res.json()) as T;
}

/**
 * Content endpoints (files/download, files/get_thumbnail_v2). Arguments go
 * in the Dropbox-API-Arg header and the body is the raw bytes. Returns the
 * Response so callers can stream or buffer as they see fit.
 */
export async function content(
  endpoint: string,
  args: unknown,
  opts: CallOpts = {}
): Promise<Response> {
  const run = async (): Promise<Response> =>
    fetch(`${CONTENT_BASE}/${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await accessToken()}`,
        // must be ASCII-safe: non-ASCII file names would otherwise break the header
        "Dropbox-API-Arg": asciiJson(args),
      },
      cache: "no-store",
      signal: opts.signal,
    });

  let res = await run();
  if (res.status === 401 && opts.retryOn401 !== false) {
    invalidateToken();
    res = await run();
  }
  return res;
}

/** JSON with every non-ASCII character escaped, for Dropbox-API-Arg. */
function asciiJson(value: unknown): string {
  return JSON.stringify(value).replace(/[\u007f-\uffff]/g, (c) =>
    "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0")
  );
}

/* ---------------- typed shapes we actually use ---------------- */

export type DbxFile = {
  ".tag": "file";
  id: string;
  name: string;
  path_lower: string;
  path_display: string;
  rev: string;
  size: number;
  client_modified: string;
};

export type DbxFolder = {
  ".tag": "folder";
  id: string;
  name: string;
  path_lower: string;
  path_display: string;
};

export type DbxEntry = DbxFile | DbxFolder;

/** List a folder, following pagination to the end. */
export async function listFolder(
  path: string,
  { recursive = false }: { recursive?: boolean } = {}
): Promise<DbxEntry[]> {
  const first = await rpc<{
    entries: DbxEntry[];
    cursor: string;
    has_more: boolean;
  }>("files/list_folder", {
    path,
    recursive,
    include_deleted: false,
    include_media_info: false,
    limit: 2000,
  });

  const entries = [...first.entries];
  let cursor = first.cursor;
  let more = first.has_more;
  // guard against a pathological loop on a huge account
  for (let page = 0; more && page < 50; page++) {
    const next = await rpc<{
      entries: DbxEntry[];
      cursor: string;
      has_more: boolean;
    }>("files/list_folder/continue", { cursor });
    entries.push(...next.entries);
    cursor = next.cursor;
    more = next.has_more;
  }
  return entries;
}

/** A direct, temporary (4 hour) URL to the file's bytes. */
export async function temporaryLink(path: string): Promise<string> {
  const res = await rpc<{ link: string }>("files/get_temporary_link", { path });
  return res.link;
}

/** Download a (small) file as text — used for shoot.txt. */
export async function downloadText(path: string): Promise<string | null> {
  const res = await content("files/download", { path });
  if (!res.ok) return null;
  return res.text();
}
