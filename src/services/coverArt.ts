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

export type AmbientMode = "classic" | "cover" | "secondary";
type RGB = [number, number, number];
type CoverColor = {
  hue: number;
  saturation: number;
  mostlyBlack: boolean;
  mostlyWhite?: boolean;
  secondaryHue?: number;
  background?: { color: string; light: boolean; muted: string };
  ambient?: { dominant: string; secondaryDark: string; deepest: string; detail: string } | null;
  auraImage?: string;
};
const coverColors = new Map<string, CoverColor>();
const pendingColors = new Map<string, Promise<CoverColor>>();
const cacheKey = "ibrastream_cover_palettes_v8";
const cacheLimit = 128;

function storedColors(): Array<[string, CoverColor]> {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(cacheKey) ?? "[]");
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function getCachedCoverColor(source: string): CoverColor | undefined {
  const match = coverColors.get(source) ?? storedColors().find(entry => entry?.[0] === source)?.[1];
  if (match && typeof match.hue === "number" && typeof match.saturation === "number"
    && typeof match.mostlyBlack === "boolean") return match;
}

export function rememberCoverColor(source: string, color: CoverColor) {
  if (coverColors.size >= cacheLimit) coverColors.delete(coverColors.keys().next().value!);
  coverColors.set(source, color);
  if (source.length > 2048) return;
  try {
    const entries = storedColors().filter(entry => entry?.[0] !== source);
    entries.push([source, color]);
    localStorage.setItem(cacheKey, JSON.stringify(entries.slice(-cacheLimit)));
  } catch {
    // The in-memory cache still works when browser storage is unavailable.
  }
}

export function dominantCoverColor(pixels: Uint8ClampedArray): CoverColor {
  const buckets = Array.from({ length: 24 }, () => ({ weight: 0, hue: 0, saturation: 0 }));
  let opaque = 0;
  let black = 0;
  let white = 0;
  let paleNeutral = 0;
  let colorful = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] < 160) continue;
    opaque++;
    const r = pixels[index] / 255, g = pixels[index + 1] / 255, b = pixels[index + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const delta = max - min;
    const lightness = (max + min) / 2;
    if (max <= 0.12) black++;
    if (min >= 0.83) white++;
    if (min >= 0.68 && delta <= 0.16) paleNeutral++;
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
  const mostlyBlack = opaque > 0 && black / opaque >= 0.5;
  const mostlyWhite = opaque > 0 && (
    (white / opaque >= 0.45 && (white + black) / opaque >= 0.65)
    || (white / opaque >= 0.25 && paleNeutral / opaque >= 0.46)
    || (white / opaque >= 0.20 && paleNeutral / opaque >= 0.24 && colorful / opaque <= 0.35)
  );
  const ranked = [...buckets].sort((a, b) => b.weight - a.weight);
  const isCool = (bucket: typeof ranked[number]) => bucket.hue / bucket.weight >= 175 && bucket.hue / bucket.weight <= 275;
  const cool = ranked.find(bucket => bucket.weight >= ranked[0].weight * (mostlyWhite ? 0.05 : 0.35) && isCool(bucket));
  const strongest = mostlyWhite || (!mostlyBlack && ranked[0].saturation / ranked[0].weight < 0.45)
    ? cool ?? ranked[0] : ranked[0];
  // Small colored details must not tint the whole UI on grayscale covers.
  const minimumColor = mostlyBlack ? Math.max(4, opaque * 0.002) : mostlyWhite ? opaque * 0.02 : opaque * 0.10;
  const hasAccent = strongest.weight > 0 && colorful >= minimumColor;
  const hue = hasAccent ? Math.round(strongest.hue / strongest.weight) : 0;
  const alternatives = hasAccent ? ranked.filter(bucket => {
    if (bucket.weight < strongest.weight * (mostlyWhite ? 0.10 : 0.18)) return false;
    const distance = Math.abs(hue - bucket.hue / bucket.weight);
    return Math.min(distance, 360 - distance) >= (mostlyWhite || mostlyBlack ? 50 : 38);
  }) : [];
  const secondary = !mostlyWhite && !mostlyBlack && isCool(strongest)
    ? alternatives.find(bucket => isCool(bucket) && bucket.weight >= strongest.weight * 0.35) ?? alternatives[0]
    : alternatives[0];
  return {
    hue,
    saturation: hasAccent ? Math.round(strongest.saturation / strongest.weight * 100) : 0,
    mostlyBlack,
    ...(mostlyWhite ? { mostlyWhite: true } : {}),
    ...(secondary ? { secondaryHue: Math.round(secondary.hue / secondary.weight) } : {}),
  };
}

export function coverBackground(pixels: Uint8ClampedArray, width: number, height: number): CoverColor["background"] {
  const border = Math.max(1, Math.round(Math.min(width, height) * 0.06));
  const colors = new Map<number, { count: number; red: number; green: number; blue: number }>();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x >= border && x < width - border && y >= border && y < height - border) continue;
      const index = (y * width + x) * 4;
      if (pixels[index + 3] < 160) continue;
      const red = pixels[index], green = pixels[index + 1], blue = pixels[index + 2];
      const key = ((red >> 5) << 6) | ((green >> 5) << 3) | (blue >> 5);
      const color = colors.get(key) ?? { count: 0, red: 0, green: 0, blue: 0 };
      color.count++;
      color.red += red;
      color.green += green;
      color.blue += blue;
      colors.set(key, color);
    }
  }
  const dominant = [...colors.values()].sort((a, b) => b.count - a.count)[0];
  if (!dominant) return undefined;
  const rgb = [dominant.red, dominant.green, dominant.blue].map(total => Math.round(total / dominant.count));
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = linear(rgb[0]) * 0.2126 + linear(rgb[1]) * 0.7152 + linear(rgb[2]) * 0.0722;
  const light = luminance >= 0.18;
  let gray = light ? 85 : 174;
  const contrast = () => light ? (luminance + 0.05) / (linear(gray) + 0.05) : (linear(gray) + 0.05) / (luminance + 0.05);
  while (gray > 0 && gray < 255 && contrast() < 5.5) gray += light ? -1 : 1;
  return {
    color: `rgb(${rgb.join(" ")})`,
    light,
    muted: `rgb(${gray} ${gray} ${gray})`,
  };
}

const linearChannels = Array.from({ length: 256 }, (_, channel) => {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
});

const rgbColor = (rgb: RGB) => `rgb(${rgb.join(" ")})`;
const luminance = ([r, g, b]: RGB) => linearChannels[r] * 0.2126 + linearChannels[g] * 0.7152 + linearChannels[b] * 0.0722;

export function desktopAmbientBackground(mode: Exclude<AmbientMode, "classic">, theme: "dark" | "bright" | "noir", palette?: CoverColor | null) {
  const base: RGB = theme === "bright" ? [251, 250, 248] : theme === "noir" ? [0, 0, 0] : [23, 24, 29];
  const color = mode === "secondary" ? palette?.ambient?.secondaryDark
    : palette?.ambient?.detail ?? palette?.background?.color;
  const channels = color?.match(/^rgb\((\d+) (\d+) (\d+)\)$/)?.slice(1).map(Number);
  if (!channels) return rgbColor(base);
  if (!palette?.saturation && Math.max(...channels) - Math.min(...channels) <= 12) {
    const neutralBase = Math.round((base[0] + base[1] + base[2]) / 3);
    const neutralCover = Math.round((channels[0] + channels[1] + channels[2]) / 3);
    base.fill(neutralBase);
    channels.fill(neutralCover);
  }
  const weights = {
    dark: { cover: 0.10, secondary: 0.78 },
    bright: { cover: 0.04, secondary: 0.16 },
    noir: { cover: 0.02, secondary: 0.12 },
  };
  const weight = weights[theme][mode];
  return rgbColor(base.map((channel, index) => Math.round(channel + (channels[index] - channel) * weight)) as RGB);
}

export function readableCoverColors(background: string, accent = background, artwork = false) {
  const parse = (color: string): RGB => {
    const channels = color.match(/^rgb\((\d+) (\d+) (\d+)\)$/)?.slice(1).map(Number);
    if (channels) return channels as RGB;
    const hsl = color.match(/^hsl\(([\d.]+) ([\d.]+)% ([\d.]+)%\)$/)?.slice(1).map(Number);
    if (hsl) {
      const [hue, saturation, lightness] = hsl;
      const l = lightness / 100;
      const a = saturation / 100 * Math.min(l, 1 - l);
      return [0, 8, 4].map(offset => {
        const k = (offset + hue / 30) % 12;
        return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
      }) as RGB;
    }
    const hex = color.match(/^#([\da-f]{6})$/i)?.[1];
    return hex ? [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16)) as RGB : [0, 0, 0];
  };
  const backgroundRGB = parse(background);
  let base = luminance(backgroundRGB);
  const light = base >= Math.sqrt(0.0525) - 0.05;
  const ink = light ? 0 : 255;
  const coverStrength = (opacity: number) => luminance(backgroundRGB.map(channel =>
    Math.round(channel + (ink - channel) * opacity)) as RGB);
  let imageOpacity = artwork ? 0.46 : 0;
  while (imageOpacity > 0 && (light ? coverStrength(imageOpacity) < 0.18 : coverStrength(imageOpacity) > 0.18)) {
    imageOpacity = Math.max(0, imageOpacity - 0.02);
  }
  base = coverStrength(imageOpacity);
  const adapt = (color: RGB) => {
    const contrast = (rgb: RGB) => {
      const value = luminance(rgb);
      return light ? (base + 0.05) / (value + 0.05) : (value + 0.05) / (base + 0.05);
    };
    for (let weight = 0; weight < 1; weight += 0.05) {
      const result = color.map(channel => Math.round(channel + (ink - channel) * weight)) as RGB;
      if (contrast(result) >= 4.5) return rgbColor(result);
    }
    return rgbColor([ink, ink, ink]);
  };
  return {
    light,
    imageOpacity,
    muted: adapt(light ? [85, 85, 85] : [174, 174, 174]),
    accent: adapt(parse(accent)),
  };
}

export function ambientCoverPalette(pixels: Uint8ClampedArray): CoverColor["ambient"] {
  const bins = new Map<number, { rgb: RGB; count: number }>();
  let total = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] < 160) continue;
    const r = pixels[index], g = pixels[index + 1], b = pixels[index + 2];
    const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    const bin = bins.get(key) ?? { rgb: [0, 0, 0], count: 0 };
    bin.rgb[0] += r;
    bin.rgb[1] += g;
    bin.rgb[2] += b;
    bin.count++;
    total++;
    bins.set(key, bin);
  }
  const groups: { rgb: RGB; count: number }[] = [];
  for (const bin of [...bins.values()].sort((a, b) => b.count - a.count)) {
    const rgb = bin.rgb.map(sum => Math.round(sum / bin.count)) as RGB;
    const group = groups.find(candidate => Math.hypot(...candidate.rgb.map((channel, i) => channel - rgb[i])) < 49);
    if (group) {
      group.rgb = group.rgb.map((channel, i) =>
        Math.round((channel * group.count + rgb[i] * bin.count) / (group.count + bin.count))) as RGB;
      group.count += bin.count;
    } else {
      groups.push({ rgb, count: bin.count });
    }
  }
  const ranked = groups.filter(group => group.count >= total * 0.035).sort((a, b) => b.count - a.count);
  const dominant = ranked[0]?.rgb;
  if (!dominant) return null;
  const dark = ranked.filter(group => luminance(group.rgb) < 0.22);
  const detail = ranked.find(group => Math.max(...group.rgb) - Math.min(...group.rgb) >= 28)?.rgb ?? dominant;
  const representative = dark[0]?.rgb ?? detail;
  const fallback = Math.max(...representative) - Math.min(...representative) < 28 ? detail : representative;
  const second = dark[1]?.rgb ?? fallback.map(channel => Math.round(channel * 0.48)) as RGB;
  const deepest = dark.length
    ? dark.reduce((current, group) => luminance(group.rgb) < luminance(current) ? group.rgb : current, dark[0].rgb)
    : second;
  return { dominant: rgbColor(dominant), secondaryDark: rgbColor(second), deepest: rgbColor(deepest), detail: rgbColor(detail) };
}

export async function readCoverColor(source: string, fullAmbient = false): Promise<CoverColor> {
  const cached = getCachedCoverColor(source);
  if (cached && (!fullAmbient || cached.ambient !== undefined)) return cached;
  const pending = pendingColors.get(source);
  if (pending) return pending;
  const request = extractCoverColor(source).finally(() => pendingColors.delete(source));
  pendingColors.set(source, request);
  return request;
}

async function extractCoverColor(source: string): Promise<CoverColor> {
  // Artwork is often displayed before the palette is read. Fetch it explicitly
  // in CORS mode so a cached display-only response cannot taint the canvas.
  const response = await fetch(source, { mode: "cors", cache: "reload", signal: AbortSignal.timeout(7_000) });
  if (!response.ok) throw new Error("Could not load cover colors");
  const image = await createImageBitmap(await response.blob());

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 48;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (context) context.drawImage(image, 0, 0, canvas.width, canvas.height);
  if (!context) {
    image.close();
    return { hue: 0, saturation: 0, mostlyBlack: false, ambient: null };
  }
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const color: CoverColor = {
    ...dominantCoverColor(pixels),
    background: coverBackground(pixels, canvas.width, canvas.height),
    ambient: ambientCoverPalette(pixels),
  };
  // Rasterize the blur at thumbnail size once, so displaying the aura needs no CSS filter.
  const aura = document.createElement("canvas");
  aura.width = aura.height = 96;
  const auraContext = aura.getContext("2d");
  if (auraContext && color.ambient) {
    auraContext.filter = "blur(3px)";
    auraContext.drawImage(image, -5, -5, 106, 106);
    color.auraImage = aura.toDataURL("image/webp", 0.75);
  }
  image.close();
  rememberCoverColor(source, color);
  return color;
}
