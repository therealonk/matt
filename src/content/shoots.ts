/*
 * Shoot catalogue — the wall shows each shoot's COVER (photos[0]);
 * opening a cover reveals the full shoot in the editorial split.
 *
 * Adding a shoot:
 *   1. Drop a folder of images into  public/shoots/<shoot-id>/
 *   2. Add an entry here listing the files in display order.
 * File names, extensions and dimensions are unrestricted — any image the
 * browser can render (.jpg, .png, .webp, .avif, .svg, …) works, and each
 * photo's aspect ratio is measured at runtime when it first loads.
 * The first photo in the list is the cover shown on the wall.
 */

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

export const SHOOTS: Shoot[] = [
  {
    id: "golden-hour-terrace",
    title: "Golden Hour Terrace",
    category: "Editorial",
    description:
      "A rooftop editorial shot in the last twenty minutes of light — warm stone, long shadows and a skyline dissolving into haze.",
    location: "Los Angeles",
    year: 2026,
    photos: [
      {
        file: "cover.jpg",
        camera: {
          body: "GFX 100S",
          lens: "GF 80mm f/1.7",
          focalLength: "80 mm",
          aperture: "f/1.7",
          shutter: "1/250",
          iso: "ISO 100",
        },
      },
      {
        file: "DSC_0142.jpg",
        camera: {
          body: "GFX 100S",
          lens: "GF 80mm f/1.7",
          focalLength: "80 mm",
          aperture: "f/2.8",
          shutter: "1/125",
          iso: "ISO 200",
        },
      },
      { file: "terrace wide.jpg" },
      {
        file: "IMG_2210.png",
        camera: {
          body: "GFX 100S",
          lens: "GF 45mm f/2.8",
          focalLength: "45 mm",
          aperture: "f/4",
          shutter: "1/60",
          iso: "ISO 400",
        },
      },
      { file: "final-edit-5.jpg" },
    ],
  },
  {
    id: "harbor-fog",
    title: "Harbor Fog",
    category: "Landscape",
    description:
      "Dawn fog swallowing the harbour — masts, cranes and gulls reduced to greyscale silhouettes over still water.",
    location: "Reykjavík",
    year: 2025,
    photos: [
      {
        file: "harbor-01.jpg",
        camera: {
          body: "A7R V",
          lens: "FE 24-70mm GM II",
          focalLength: "35 mm",
          aperture: "f/8",
          shutter: "1/500",
          iso: "ISO 100",
        },
      },
      { file: "harbor-02.jpg" },
      { file: "harbor-03-pano.jpg" },
      { file: "harbor-04.jpg" },
    ],
  },
  {
    id: "atelier-linen",
    title: "Atelier Linen",
    category: "Fashion",
    description:
      "Natural-fibre lookbook in a north-lit atelier — undyed linen, raw seams and quiet gestures against plaster walls.",
    location: "Paris",
    year: 2026,
    photos: [
      {
        file: "look-01.jpg",
        camera: {
          body: "Hasselblad X2D",
          lens: "XCD 55V",
          focalLength: "55 mm",
          aperture: "f/2.5",
          shutter: "1/200",
          iso: "ISO 64",
        },
      },
      { file: "look-02.jpg" },
      { file: "look-03.jpg" },
      { file: "detail-seam.jpg" },
      { file: "look-05.jpg" },
    ],
  },
  {
    id: "midnight-market",
    title: "Midnight Market",
    category: "Street",
    description:
      "Neon signage, steam and wet asphalt — a night market photographed hand-held between the stalls.",
    location: "Tokyo",
    year: 2025,
    photos: [
      {
        file: "market-001.jpg",
        camera: {
          body: "Leica Q3",
          lens: "Summilux 28mm",
          focalLength: "28 mm",
          aperture: "f/1.7",
          shutter: "1/60",
          iso: "ISO 1600",
        },
      },
      { file: "market-002.jpg" },
      { file: "market-003.jpg" },
      { file: "lantern row.png" },
    ],
  },
  {
    id: "cedar-and-stone",
    title: "Cedar & Stone",
    category: "Architecture",
    description:
      "A hillside teahouse in cedar and rough stone — joinery, shadow gaps and the geometry of quiet rooms.",
    location: "Kyoto",
    year: 2024,
    photos: [
      {
        file: "teahouse-facade.jpg",
        camera: {
          body: "Z 8",
          lens: "PC-E 24mm",
          focalLength: "24 mm",
          aperture: "f/11",
          shutter: "1/15",
          iso: "ISO 64",
        },
      },
      { file: "teahouse-interior.jpg" },
      { file: "teahouse-detail.jpg" },
    ],
  },
  {
    id: "north-light-portraits",
    title: "North Light Portraits",
    category: "Portrait",
    description:
      "Single-window portrait sessions — soft directional light, honest grain and no retouching beyond the print.",
    location: "Copenhagen",
    year: 2026,
    photos: [
      {
        file: "sitter-a.jpg",
        camera: {
          body: "GFX 100S",
          lens: "GF 110mm f/2",
          focalLength: "110 mm",
          aperture: "f/2",
          shutter: "1/320",
          iso: "ISO 160",
        },
      },
      { file: "sitter-b.jpg" },
      { file: "sitter-c.jpg" },
      { file: "sitter-d.jpg" },
    ],
  },
  {
    id: "salt-flats",
    title: "Salt Flats",
    category: "Travel",
    description:
      "The mirror season on the salar — horizonless white, doubled clouds and a single figure for scale.",
    location: "Uyuni",
    year: 2025,
    photos: [
      {
        file: "salar-01.jpg",
        camera: {
          body: "A7R V",
          lens: "FE 16-35mm GM",
          focalLength: "16 mm",
          aperture: "f/11",
          shutter: "1/800",
          iso: "ISO 100",
        },
      },
      { file: "salar-02.jpg" },
      { file: "salar-03.jpg" },
      { file: "salar-04.jpg" },
    ],
  },
];
