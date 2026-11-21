export function largeCoverUrl(source: string): string {
  try {
    const url = new URL(source);
    if (url.hostname.endsWith(".googleusercontent.com") || url.hostname.endsWith(".ggpht.com")) {
      url.pathname = url.pathname.replace(/=w\d+-h\d+[^/]*$|=s\d+[^/]*$/, "=w640-h640-l90-rj");
    } else if (url.hostname.endsWith(".dzcdn.net")) {
      url.pathname = url.pathname.replace(/\/\d+x\d+(-[^/]+)$/, "/500x500$1");
    } else if (url.hostname === "i.ytimg.com" || url.hostname === "img.youtube.com") {
      url.pathname = url.pathname.replace(/\/(?:default|mqdefault)\.jpg$/, "/hqdefault.jpg");
    }
    return url.href;
  } catch {
    return source;
  }
}

type CoverColor = { hue: number; saturation: number; mostlyBlack: boolean };
const coverColors = new Map<string, CoverColor>();

export function dominantCoverColor(pixels: Uint8ClampedArray): CoverColor {
  const buckets = Array.from({ length: 24 }, () => ({ weight: 0, hue: 0, saturation: 0 }));
  let opaque = 0;
  let black = 0;
  let colorful = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] < 160) continue;
    opaque++;
    const r = pixels[index] / 255, g = pixels[index + 1] / 255, b = pixels[index + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const delta = max - min;
    const lightness = (max + min) / 2;
    if (max <= 0.12) black++;
    if (delta < 0.09 || lightness < 0.08 || lightness > 0.94) continue;
    colorful++;
    const saturation = delta / (1 - Math.abs(2 * lightness - 1));
    const sector = max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
    const hue = (sector * 60 + 360) % 360;
    const weight = delta * saturation;
    const bucket = buckets[Math.floor(hue / 15)];
    bucket.weight += weight;
    bucket.hue += hue * weight;
    bucket.saturation += saturation * weight;
  }
  const strongest = buckets.reduce((best, bucket) => bucket.weight > best.weight ? bucket : best);
  const mostlyBlack = opaque > 0 && black / opaque >= 0.72 && colorful / opaque <= 0.08;
  // Small colored details must not tint the whole UI on grayscale covers.
  const minimumColor = mostlyBlack ? Math.max(4, opaque * 0.002) : opaque * 0.10;
  const hasAccent = strongest.weight > 0 && colorful >= minimumColor;
  return {
    hue: hasAccent ? Math.round(strongest.hue / strongest.weight) : 0,
    saturation: hasAccent ? Math.round(strongest.saturation / strongest.weight * 100) : 0,
    mostlyBlack,
  };
}

export async function readCoverColor(source: string): Promise<CoverColor> {
  const cached = coverColors.get(source);
  if (cached) return cached;
  // Artwork is often displayed before the palette is read. Fetch it explicitly
  // in CORS mode so a cached display-only response cannot taint the canvas.
  const response = await fetch(source, { mode: "cors", cache: "reload", signal: AbortSignal.timeout(7_000) });
  if (!response.ok) throw new Error("Could not load cover colors");
  const image = await createImageBitmap(await response.blob());

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 48;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (context) context.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  if (!context) return { hue: 0, saturation: 0, mostlyBlack: false };
  const color = dominantCoverColor(context.getImageData(0, 0, canvas.width, canvas.height).data);
  if (coverColors.size >= 64) coverColors.delete(coverColors.keys().next().value!);
  coverColors.set(source, color);
  return color;
}
