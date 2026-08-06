"use client";

// INFO: Keyed by the class list — one probe per distinct set, then a map lookup forever after.
const used = new Map<string, number>();

// INFO: Enough lines that the division averages away any rounding in the box itself, few enough to stay one layout.
const PROBE_LINES = 4;

/**
 * The height of one line of text in `className`, as the engine actually lays it
 * out — or `fallback` until `warmLineHeights` has been asked for it.
 *
 * WARN: Never `fontSize × ratio` from the stylesheet. WebKit floors a fractional line-height and Blink keeps it — `15px` at `1.45` is **21.75** in Chrome and **21** in Safari — so a value mirrored into JS is three quarters of a pixel off per line on Safari. Every line, every row, and REQUIREMENTS.md § 8.3. turns that into drift the reader watches accumulate.
 *
 * WARN: Reads only. Callers run inside React's render phase, and this used to append its probe there — a DOM mutation and a synchronous reflow in a pass React is free to discard and re-run. The probe moved to `warmLineHeights`, which the room calls from a layout effect; until it lands, both the server and the client's first render see `fallback`, which is also what keeps the two agreeing at hydration.
 */
export function measureLineHeight(className: string, fallback: number): number {
  return used.get(className) ?? fallback;
}

/** Measures and caches every class in `classNames`. Call from a layout effect, never from render. */
export function warmLineHeights(classNames: readonly string[]) {
  if (typeof document === "undefined" || !document.body) {
    return;
  }

  for (const className of classNames) {
    if (used.has(className)) {
      continue;
    }

    const probe = document.createElement("div");

    probe.className = className;
    // INFO: `pre` so the newlines below are the only breaks, and no box of its own so the height is the line boxes and nothing else.
    probe.style.cssText =
      "position:absolute;visibility:hidden;top:0;left:-9999px;white-space:pre;padding:0;border:0;margin:0";
    probe.textContent = Array(PROBE_LINES).fill("가").join("\n");
    document.body.append(probe);

    const line = probe.getBoundingClientRect().height / PROBE_LINES;

    probe.remove();

    if (line > 0) {
      used.set(className, line);
    }
  }
}
