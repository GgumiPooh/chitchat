"use client";

import { clearCache, layout, prepare, setLocale, type PrepareOptions } from "@chenglou/pretext";
import { LOCALE } from "../date/time";

export type FontSpec = {
  size: number;
  weight: number;
  /** As `getComputedStyle` reports it. Blank falls back to the ratio below, which is what the server render gets. */
  family: string;
};

// INFO: The server's answer, and the answer until a family is resolved: a Hangul or CJK glyph advances a full em and Latin lands near half of one.
const NARROW_RATIO = 0.55;

// WARN: Evicted by half and never cleared outright. A room larger than the cap would otherwise fill it, drop everything, and refill from the same walk — so the rows past each clear miss forever and every render pays thousands of canvas layouts. Halving keeps the most recent entries, which is exactly the window a scroll is walking.
const CACHE_LIMIT = 4000;

const lineCounts = new Map<string, number>();
let isConfigured = false;

/**
 * How many lines `text` wraps to at `maxWidth`, broken the way the browser will
 * break it — the same Unicode segmentation, measured in the page's own font.
 *
 * WARN: Not `ceil(totalWidth / maxWidth)`, which is what this replaced. Measured against real layout that arithmetic is right for Hangul, for CJK and even for ordinary spaced Latin — and wrong by a whole line for a run that cannot break, a **URL** above all: the run is pushed down whole, so the line before it ends early and the arithmetic never sees the gap. A URL in a message is common, and a line of REQUIREMENTS.md § 8.3. drift is 22px.
 */
export function countTextLines(
  text: string,
  { size, weight, family }: FontSpec,
  maxWidth: number,
  whiteSpace: PrepareOptions["whiteSpace"] = "normal",
  wordBreak: PrepareOptions["wordBreak"] = "keep-all",
): number {
  if (!text) {
    return 0;
  }

  // INFO: No family means no resolved font to measure against — the server render, and the first paint before one is read off the DOM.
  if (!family || typeof document === "undefined") {
    return approximateLines(text, size, maxWidth);
  }

  const font = `${weight} ${size}px ${family}`;
  // WARN: The separator stays an escape. Written as a literal NUL byte it makes git read this whole file as binary — no line diff, no blame, no three-way merge.
  const key = `${font}\u0000${whiteSpace}\u0000${wordBreak}\u0000${maxWidth}\u0000${text}`;
  const cached = lineCounts.get(key);

  if (cached !== undefined) {
    return cached;
  }

  configure();

  // WARN: The default is the app's own `keep-all` (DESIGN.md § 4.2.3.) and not pretext's `normal`. Whichever the caller's element renders under, it MUST be the one passed here — the two disagree by a whole line on any long 어절, always in the same direction.
  const { lineCount } = layout(prepare(text, font, { whiteSpace, wordBreak }), maxWidth, 1);

  if (lineCounts.size >= CACHE_LIMIT) {
    // INFO: A `Map` iterates in insertion order, so the first half is the oldest half.
    for (const stale of [...lineCounts.keys()].slice(0, CACHE_LIMIT / 2)) {
      lineCounts.delete(stale);
    }
  }

  lineCounts.set(key, lineCount);

  return lineCount;
}

// INFO: Arithmetic rather than line breaking, so it models neither mode — the whole-어절 pushes DESIGN.md § 4.2.3. produces are invisible to it, and the count above replaces them the moment a family resolves.
function approximateLines(text: string, size: number, maxWidth: number): number {
  return text.split("\n").reduce((total, line) => {
    let width = 0;

    for (const character of line) {
      width += character.codePointAt(0)! < 0x80 ? size * NARROW_RATIO : size;
    }

    return total + Math.max(1, Math.ceil(width / Math.max(maxWidth, size)));
  }, 0);
}

function configure() {
  if (isConfigured) {
    return;
  }

  isConfigured = true;
  // INFO: Segmentation is locale-sensitive, and this app's copy is Korean (CLAUDE.md § 0.2.).
  setLocale(LOCALE);

  // WARN: The app's font is `display: "swap"`, so anything measured before it lands was measured in a fallback. Both caches hold those widths until they are dropped.
  if (document.fonts) {
    void document.fonts.ready.then(() => {
      clearCache();
      lineCounts.clear();
    });
  }
}
