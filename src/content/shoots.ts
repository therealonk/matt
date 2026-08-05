/*
 * Shoot types and photo URLs — shared by server and client.
 *
 * The catalogue itself lives in Dropbox and is built by
 * src/lib/dropbox/manifest.ts (server only). This module holds just the
 * shapes and the URL helpers, so client components can import it freely.
 *
 * Photo URLs are keyed by the Dropbox `rev` (its version id). That makes
 * every URL immutable: edit a photo in Dropbox and the rev changes, the
 * URL changes, and caches update by themselves — no purging.
 */

import { encodePath } from "@/lib/photo-path";

export { encodePath, decodePath } from "@/lib/photo-path";

export type CameraData = {
  body: string;
  lens: string;
  focalLength: string;
  aperture: string;
  shutter: string;
  iso: string;
};

export type ShootPhoto = {
  /** File name as it appears in Dropbox. */
  name: string;
  /** Dropbox path (lower-cased), inside the app folder. */
  path: string;
  /** Dropbox version id. */
  rev: string;
  size: number;
  /** Read from the photo's EXIF; absent when it carries none. */
  camera?: CameraData;
};

export type Shoot = {
  id: string;
  title: string;
  category: string;
  description: string;
  location: string;
  year: number | null;
  /** photos[0] is the cover shown on the wall. */
  photos: ShootPhoto[];
  /** Files that couldn't be used, for the audit script. */
  skipped: { name: string; reason: string }[];
};

/**
 * Wall-sized cover (~1200px): what the gallery grid loads. Derived by
 * Dropbox's own thumbnailer — as much detail as a wall frame can show.
 */
export const wallUrl = (shoot: Shoot) => {
  const p = shoot.photos[0];
  return `/api/photo/wall/${p.rev}/${encodePath(p.path)}`;
};

/** Full-quality original: what the detail view shows. Never resized. */
export const photoUrl = (shoot: Shoot, photo: ShootPhoto) =>
  `/api/photo/full/${photo.rev}/${encodePath(photo.path)}`;

/** The cover at full quality — the detail view's first frame. */
export const coverUrl = (shoot: Shoot) => photoUrl(shoot, shoot.photos[0]);
