import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const OUTPUT_DIR = path.join(process.cwd(), "public", "icons");

// INFO: DESIGN.md § 4.1. `primary` and `canvas`; the icon set is the one place hex has to be duplicated, since no CSS runs here.
const PRIMARY = "#b65c4e";
const CANVAS = "#fbf9f6";

/**
 * The J&H monogram. `inset` is the fraction of the canvas the mark is inset by —
 * `0.2` keeps it inside the maskable safe zone that Android crops to.
 */
function markSvg(size: number, inset: number) {
  const stroke = size * 0.036;
  const box = size * (1 - inset * 2);
  const left = size * inset;
  const top = size * inset;

  // INFO: `J&H` is a wordmark, not a square — the cap height follows from fitting the three glyphs and their gaps across `box`, and the mark is then centered vertically.
  const jWidth = 0.5;
  const ampWidth = 0.6;
  const hWidth = 0.62;
  const gap = 0.16;
  const capHeight = box / (jWidth + ampWidth + hWidth + gap * 2);

  const capTop = top + (box - capHeight) / 2;
  const baseline = capTop + capHeight;

  const jStemX = left + jWidth * capHeight;
  const jHookRadius = (jWidth * capHeight) / 2;

  const ampLeft = jStemX + gap * capHeight;
  const ampHeight = capHeight * 0.72;
  const ampTop = baseline - ampHeight;

  const hLeft = ampLeft + (ampWidth + gap) * capHeight;
  const hRight = left + box;

  // INFO: The ampersand is one continuous stroke — tail, diagonal, top loop, bowl, exit — drawn on a 0.75:1 box and scaled, so it stays a path and never depends on a font being installed.
  const amp = (x: number, y: number) =>
    `${ampLeft + x * ampWidth * capHeight} ${ampTop + y * ampHeight}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${PRIMARY}"/>
  <g fill="none" stroke="${CANVAS}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">
    <path d="M ${jStemX} ${capTop} L ${jStemX} ${baseline - jHookRadius} A ${jHookRadius} ${jHookRadius} 0 0 1 ${jStemX - jHookRadius * 2} ${baseline - jHookRadius}"/>
    <path d="M ${amp(1, 0.92)} C ${amp(0.62, 0.96)} ${amp(0.1, 0.55)} ${amp(0.3, 0.22)} C ${amp(0.4, 0.05)} ${amp(0.68, 0.05)} ${amp(0.68, 0.24)} C ${amp(0.68, 0.44)} ${amp(0.06, 0.55)} ${amp(0.06, 0.75)} C ${amp(0.06, 0.96)} ${amp(0.46, 1.02)} ${amp(0.64, 0.8)} C ${amp(0.74, 0.68)} ${amp(0.82, 0.56)} ${amp(0.88, 0.46)}"/>
    <path d="M ${hLeft} ${capTop} L ${hLeft} ${baseline}"/>
    <path d="M ${hRight} ${capTop} L ${hRight} ${baseline}"/>
    <path d="M ${hLeft} ${capTop + capHeight / 2} L ${hRight} ${capTop + capHeight / 2}"/>
  </g>
</svg>`;
}

async function render(name: string, size: number, inset: number) {
  const file = path.join(OUTPUT_DIR, name);

  await sharp(Buffer.from(markSvg(size, inset)))
    .png()
    .toFile(file);

  return name;
}

async function generateIcons() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  // INFO: 0.24 on the maskable variant — Android crops to a 80%-diameter circle, so the mark needs more inset than the plain icons.
  const written = await Promise.all([
    render("icon-32.png", 32, 0.16),
    render("icon-180.png", 180, 0.16),
    render("icon-192.png", 192, 0.16),
    render("icon-512.png", 512, 0.16),
    render("icon-maskable-512.png", 512, 0.24),
  ]);

  await writeFile(path.join(OUTPUT_DIR, "icon.svg"), markSvg(512, 0.16), "utf8");

  console.log(`Wrote ${written.length + 1} icons to ${path.relative(process.cwd(), OUTPUT_DIR)}`);
}

generateIcons().catch((error) => {
  console.error(error);
  process.exit(1);
});
