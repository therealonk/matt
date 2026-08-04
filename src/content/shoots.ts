/*
 * Shoot catalogue — the wall shows each shoot's COVER (photos[0]);
 * opening a cover reveals the full shoot in the editorial split.
 *
 * The DATA lives in shoots.json (kept machine-editable so the add-shoot
 * script can write it); this file owns the types and URL helpers.
 *
 * Adding a shoot the easy way:
 *   npm run add-shoot -- /path/to/folder-of-images
 * The script asks for title, description, cover photo etc., copies the
 * files into public/shoots/<id>/ and registers the shoot in shoots.json.
 *
 * Adding one by hand:
 *   1. Drop a folder of images into  public/shoots/<shoot-id>/
 *   2. Add an entry to shoots.json listing the files in display order.
 * File names, extensions and dimensions are unrestricted — any image the
 * browser can render (.jpg, .png, .webp, .avif, .svg, …) works, and each
 * photo's aspect ratio is measured at runtime when it first loads.
 * The first photo in the list is the cover shown on the wall.
 */

import data from "./shoots.json";

export type CameraData = {
  body: string;
  lens: string;
  focalLength: string;
  aperture: string;
  shutter: string;
  iso: string;
};

export type ShootPhoto = {
  /** File name inside public/shoots/<shoot-id>/ — any name/type. */
  file: string;
  /** Optional six-field camera panel; omit to fall back to the cover's. */
  camera?: CameraData;
};

export type Shoot = {
  id: string;
  title: string;
  category: string;
  description: string;
  location: string;
  year: number;
  photos: ShootPhoto[];
};

export const photoUrl = (shoot: Shoot, photo: ShootPhoto) =>
  `/shoots/${shoot.id}/${encodeURIComponent(photo.file)}`;

export const coverUrl = (shoot: Shoot) => photoUrl(shoot, shoot.photos[0]);

export const SHOOTS: Shoot[] = data as Shoot[];
