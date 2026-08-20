import { APPLE_SPLASH_DIR, APPLE_SPLASH_LINKS } from "@/shared/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp, { type PngOptions } from "sharp";

const OUTPUT_DIR = path.join(process.cwd(), "public", "icons");
const SPLASH_DIR = path.join(
  process.cwd(),
  "public",
  ...APPLE_SPLASH_DIR.split("/").filter(Boolean),
);

// INFO: DESIGN.md § 4.1. `primary` and `canvas`; the icon set is the one place hex has to be duplicated, since no CSS runs here.
const PRIMARY = "#b65c4e";
const CANVAS = "#fbf9f6";

/**
 * A minimalist smile chat icon, stroked in `stroke` inside a `size`-square box.
 */
function smileChat(size: number, inset: number, stroke: string) {
  const strokeWidth = size * 0.05;
  const cx = size / 2;
  const cy = size * 0.46;
  const r = size * (0.5 - inset) * 0.9;
  
  const tailX1 = cx - r * 0.6;
  const tailY1 = cy + r * 0.75;
  const tailTipX = cx - r * 1.0;
  const tailTipY = cy + r * 1.15;
  const tailX2 = cx - r * 0.2;
  const tailY2 = cy + r * 0.95;

  return `<g fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">
    <path d="M ${tailX1} ${tailY1} L ${tailTipX} ${tailTipY} L ${tailX2} ${tailY2} A ${r} ${r} 0 1 0 ${tailX1} ${tailY1} Z"/>
    <circle cx="${cx - r * 0.35}" cy="${cy - r * 0.1}" r="${strokeWidth * 0.7}" fill="${stroke}" stroke="none" />
    <circle cx="${cx + r * 0.35}" cy="${cy - r * 0.1}" r="${strokeWidth * 0.7}" fill="${stroke}" stroke="none" />
    <path d="M ${cx - r * 0.35} ${cy + r * 0.3} Q ${cx} ${cy + r * 0.6} ${cx + r * 0.35} ${cy + r * 0.3}" />
  </g>`;
}

function markSvg(size: number, inset: number) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${PRIMARY}"/>
  ${smileChat(size, inset, CANVAS)}
</svg>`;
}

function splashSvg(width: number, height: number) {
  const mark = Math.min(width, height) * 0.4;
  const left = (width - mark) / 2;
  const top = (height - mark) / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${CANVAS}"/>
  <g transform="translate(${left} ${top})">${smileChat(mark, 0, PRIMARY)}</g>
</svg>`;
}

async function render(dir: string, name: string, svg: string, options?: PngOptions) {
  await sharp(Buffer.from(svg)).png(options).toFile(path.join(dir, name));
  return name;
}

async function generateIcons() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const written = await Promise.all([
    render(OUTPUT_DIR, "icon-32.png", markSvg(32, 0.16)),
    render(OUTPUT_DIR, "icon-180.png", markSvg(180, 0.16)),
    render(OUTPUT_DIR, "icon-192.png", markSvg(192, 0.16)),
    render(OUTPUT_DIR, "icon-512.png", markSvg(512, 0.16)),
    render(OUTPUT_DIR, "icon-maskable-512.png", markSvg(512, 0.24)),
  ]);
  await writeFile(path.join(OUTPUT_DIR, "icon.svg"), markSvg(512, 0.16), "utf8");
  console.log(`Wrote ${written.length + 1} icons to ${path.relative(process.cwd(), OUTPUT_DIR)}`);
}

async function generateSplashScreens() {
  await mkdir(SPLASH_DIR, { recursive: true });
  const written = await Promise.all(
    APPLE_SPLASH_LINKS.map(({ fileName, pixelWidth, pixelHeight }) =>
      render(SPLASH_DIR, fileName, splashSvg(pixelWidth, pixelHeight), { palette: true }),
    ),
  );
  console.log(`Wrote ${written.length} splash screens to ${path.relative(process.cwd(), SPLASH_DIR)}`);
}

Promise.all([generateIcons(), generateSplashScreens()]).catch((error) => {
  console.error(error);
  process.exit(1);
});
