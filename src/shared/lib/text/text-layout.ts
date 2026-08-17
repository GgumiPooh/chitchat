"use client";

import { clearCache, layout, prepare, setLocale, type PrepareOptions } from "@chenglou/pretext";
import {
  measureRichInlineStats,
  prepareRichInline,
  type RichInlineItem,
} from "@chenglou/pretext/rich-inline";
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
const inlineLineCounts = new Map<string, number>();
const boxGlyphWidths = new Map<string, number>();
let isConfigured = false;

/**
 * One piece of a line that mixes text with atomic boxes — a run of characters, or a box
 * of a known width that the line breaks around but never inside.
 */
export type InlineRun = { text: string } | { boxWidth: number };

/**
 * WARN: A **non-empty**, non-whitespace stand-in for a box, and it cannot be `""`.
 * `prepareRichInline` drops any item whose text trims to nothing and takes its
 * `extraWidth` with it — so the documented `{ text: "", extraWidth }` shape silently
 * measures a line with no box in it at all. The glyph's own advance is measured once per
 * font and subtracted below, so which character this is never reaches the answer.
 */
const BOX_GLYPH = "￼";

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

/**
 * How many lines a run of text mixed with atomic boxes wraps to at `maxWidth` — what an
 * inline emoticon standing between the characters of a bubble costs (REQUIREMENTS.md
 * § 8.3.).
 *
 * WARN: The `rich-inline` subpath is `white-space: normal` only, so the hard lines are
 * split here and measured one at a time. A bubble is `pre-wrap` (§ 6.5.), and left to the
 * measurer every `\n` would be one more collapsed space rather than a break.
 *
 * WARN: Its `word-break` is the library's own default, which is `normal` — the same mode
 * the bubble opts into (DESIGN.md § 4.2.3.) and deliberately **not** `countTextLines`'
 * app-wide `keep-all`. It takes no option for it, so a bubble that stopped opting out
 * would silently be measured in the wrong mode with nothing here to change.
 *
 * WARN: Runs of spaces are pre-expanded, because `normal` collapses them and `pre-wrap`
 * keeps them. Collapsed, the text measures narrower than it draws and the estimate lands
 * **short**, which is § 8.3.'s accumulating direction.
 */
export function countInlineLines(
  runs: readonly InlineRun[],
  { size, weight, family }: FontSpec,
  maxWidth: number,
): number {
  // INFO: No runs is no line box, and CSS agrees — an inline holding no text and no preserved space lays out at zero height, which is what a bubble whose every emoticon went unresolved draws.
  if (runs.length === 0) {
    return 0;
  }

  if (!family || typeof document === "undefined") {
    return approximateInlineLines(runs, size, maxWidth);
  }

  const font = `${weight} ${size}px ${family}`;
  // WARN: Both separators stay escapes, exactly as `countTextLines`' key does. Written as literal control bytes they make git read this whole file as binary — no line diff, no blame, no three-way merge — and nothing in the diff says so.
  const key = `${font}\u0000${maxWidth}\u0000${runs.map(toRunKey).join("\u0001")}`;
  const cached = inlineLineCounts.get(key);

  if (cached !== undefined) {
    return cached;
  }

  configure();

  const width = Math.max(maxWidth, 1);
  const glyph = toBoxGlyphWidth(font);
  let lineCount = 0;

  for (const line of toHardLines(runs)) {
    // INFO: An empty hard line is one line — the blank line a sender left between paragraphs.
    if (line.length === 0) {
      lineCount += 1;

      continue;
    }

    const items = line.map<RichInlineItem>((run) =>
      "text" in run
        ? { text: toNonCollapsingRun(run.text), font }
        : // WARN: `naturalWidth + extraWidth` is what the item occupies, so the stand-in glyph's own advance comes back out here. Clamped, since a box narrower than that glyph would otherwise occupy a negative width.
          {
            text: BOX_GLYPH,
            font,
            break: "never",
            extraWidth: Math.max(-glyph, run.boxWidth - glyph),
          },
    );

    lineCount += Math.max(1, measureRichInlineStats(prepareRichInline(items), width).lineCount);
  }

  if (inlineLineCounts.size >= CACHE_LIMIT) {
    for (const stale of [...inlineLineCounts.keys()].slice(0, CACHE_LIMIT / 2)) {
      inlineLineCounts.delete(stale);
    }
  }

  inlineLineCounts.set(key, lineCount);

  return lineCount;
}

function toRunKey(run: InlineRun): string {
  return "text" in run ? `t${run.text}` : `b${run.boxWidth}`;
}

/** INFO: The advance of `BOX_GLYPH` in this font, so a box can be given the width it actually draws at rather than that width plus a glyph. */
function toBoxGlyphWidth(font: string): number {
  const cached = boxGlyphWidths.get(font);

  if (cached !== undefined) {
    return cached;
  }

  const { maxLineWidth } = measureRichInlineStats(
    prepareRichInline([{ text: BOX_GLYPH, font, break: "never" }]),
    Number.MAX_SAFE_INTEGER,
  );

  boxGlyphWidths.set(font, maxLineWidth);

  return maxLineWidth;
}

/** INFO: `pre-wrap` keeps every space and `normal` keeps one, so all but the first of a run are made non-collapsible — the first stays a space to leave the break opportunity where the browser has one. */
function toNonCollapsingRun(text: string): string {
  return text.replace(/ {2,}/gu, (run) => ` ${" ".repeat(run.length - 1)}`);
}

/** INFO: The runs cut at every `\n`, since the measurer has no `pre-wrap` of its own. A box never carries one, so only the text runs are split. */
function toHardLines(runs: readonly InlineRun[]): InlineRun[][] {
  const lines: InlineRun[][] = [[]];

  for (const run of runs) {
    if (!("text" in run)) {
      lines[lines.length - 1].push(run);

      continue;
    }

    run.text.split("\n").forEach((piece, index) => {
      if (index > 0) {
        lines.push([]);
      }

      if (piece) {
        lines[lines.length - 1].push({ text: piece });
      }
    });
  }

  // WARN: CSS lays out **no** line box for a newline that ends the block, where a split produces one — `오늘\n` is one line and not two. Measured against the DOM, and `countTextLines` already answers it this way, so without this the two paths disagree by a line on exactly the drafts a Return key ends. Only the last empty line and never the only one: a *leading* newline's empty line does render.
  if (lines.length > 1 && lines[lines.length - 1].length === 0) {
    lines.pop();
  }

  return lines;
}

// INFO: `approximateLines`' arithmetic with the boxes added in, for the server and for the first paint before a family resolves.
function approximateInlineLines(
  runs: readonly InlineRun[],
  size: number,
  maxWidth: number,
): number {
  return toHardLines(runs).reduce((total, line) => {
    const width = line.reduce(
      (sum, run) => sum + ("text" in run ? toApproximateWidth(run.text, size) : run.boxWidth),
      0,
    );

    return total + Math.max(1, Math.ceil(width / Math.max(maxWidth, size)));
  }, 0);
}

function toApproximateWidth(text: string, size: number): number {
  let width = 0;

  for (const character of text) {
    width += character.codePointAt(0)! < 0x80 ? size * NARROW_RATIO : size;
  }

  return width;
}

// INFO: Arithmetic rather than line breaking, so it models neither mode — the whole-어절 pushes DESIGN.md § 4.2.3. produces are invisible to it, and the count above replaces them the moment a family resolves.
function approximateLines(text: string, size: number, maxWidth: number): number {
  return text
    .split("\n")
    .reduce(
      (total, line) =>
        total + Math.max(1, Math.ceil(toApproximateWidth(line, size) / Math.max(maxWidth, size))),
      0,
    );
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
      // WARN: All three, or an inline count and a box advance measured in the fallback font outlive the swap that invalidated the plain one beside them.
      inlineLineCounts.clear();
      boxGlyphWidths.clear();
    });
  }
}
