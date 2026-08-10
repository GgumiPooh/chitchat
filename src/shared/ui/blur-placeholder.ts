"use client";

import { ensure, safelyGet, useHydrated, type Maybe, type Optional } from "@/shared/lib";
import { decode } from "blurhash";
import type { CSSProperties } from "react";

// INFO: The wire format. A blurhash is `[size flag][max value][4 chars of DC][2 chars per AC component]`, so the average colour is characters 2–5 and nothing after them is read here.
const DC_START = 2;
const DC_END = 6;

const BASE83_DIGITS =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~";

const BYTE_MASK = 0xff;

/**
 * The image's average colour, read straight off `hash`'s DC term — which *is* the
 * mean of the image, so this is string arithmetic on a value every caller already
 * holds. Available before a byte of the asset has arrived, and on the server.
 *
 * WARN: Decoded by hand rather than through the package's own `decode`, which renders pixels: a 1×1 render is the top-left **corner**, where every basis function evaluates to 1, so the AC terms are summed into the answer. The package exports no DC accessor.
 *
 * WARN: Guarded rather than trusted. `registerMedia` validates the hash at the write (REQUIREMENTS.md § 9.), but a malformed one must yield nothing rather than a colour built from `NaN`.
 */
export function toBlurhashAverage(hash: Maybe<string>): Optional<string> {
  if (!hash || hash.length < DC_END) {
    return undefined;
  }

  const packed = decodeBase83(hash.slice(DC_START, DC_END));

  if (packed === undefined) {
    return undefined;
  }

  // INFO: The DC is stored already sRGB-encoded, packed into 24 bits, so there is no linear-light conversion to undo here.
  return `rgb(${(packed >> 16) & BYTE_MASK} ${(packed >> 8) & BYTE_MASK} ${packed & BYTE_MASK})`;
}

function decodeBase83(digits: string): Optional<number> {
  let value = 0;

  for (const digit of digits) {
    const index = BASE83_DIGITS.indexOf(digit);

    if (index < 0) {
      return undefined;
    }

    value = value * BASE83_DIGITS.length + index;
  }

  return value;
}

/** How the element the blur stands in for is fitted to its box, since the placeholder has to be framed by the same rule. */
export type BlurhashFit = "cover" | "contain";

export type BlurhashBox = {
  /** The asset's own width ÷ height, so the decode carries the picture's shape. Absent is a square decode — see `toDecodeExtent`. */
  ratio?: number;
  /** Defaults to `cover`, which every caller but the DESIGN.md § 7.10. viewer's `object-contain` slide draws its asset with. */
  fit?: BlurhashFit;
};

// INFO: Four samples per component along the long axis, where the encoder spends four of them (`upload-media/model/canvas.ts`) — a bilinear upscale of this is within 8/255 of a 256px decode of the same hash, and the paint measures 59µs in Chrome against the square 32's 224µs.
const DECODE_LONG_EDGE = 16;

/**
 * WARN: Bounded because the thing feeding it is not. 보관함's grid is virtualized
 * (REQUIREMENTS.md § 10.), so a session that scrolls a year of photos hands this a
 * fresh hash per tile and would otherwise hold a data URL for every photo ever
 * scrolled past until the tab closes.
 *
 * WARN: Evicted by half rather than cleared, exactly as `countTextLines`' cache is —
 * emptying at the cap would drop the rows a reader is scrolling back through and
 * re-decode every one of them on the return trip.
 */
const CACHE_LIMIT = 256;

const styles = new Map<string, Optional<CSSProperties>>();

let scratch: Optional<HTMLCanvasElement>;

/**
 * The `style` that paints `hash` across a box: its average colour immediately, and
 * the decoded blur over that once there is a canvas to decode on. `undefined` when
 * there is nothing to paint — no hash, or one the decoder rejects.
 *
 * WARN: The **`background-image` alone** is gated on hydration, and it has to be. A
 * canvas exists only in the browser, so the server paints no blur; a client render
 * that decoded on its first pass would hand React a `background-image` the SSR markup
 * does not carry and fail hydration on every placeholder on screen.
 *
 * WARN: The `background-color` is deliberately **not** gated, and that is what the
 * iOS 26 chrome depends on. It is string arithmetic on the hash's DC term, so the
 * server and the client's first pass compute the identical value and there is no
 * mismatch to suppress. Gated with the image, the first paint was a flat
 * `chat-canvas` plate — which is the colour Safari then sampled its status bar with
 * for the whole session, since it never re-samples (DESIGN.md § 3.3.).
 *
 * WARN: `cover` only. That fit fills the box, so the colour is invisible the moment
 * the blur lands and only ever shows in the window before it; under `contain` it
 * would paint the letterbox the § 7.10. viewer deliberately leaves to the backdrop.
 */
export function useBlurhashStyle(
  hash: Maybe<string>,
  box: BlurhashBox = {},
): Optional<CSSProperties> {
  const isHydrated = useHydrated();
  const fit = box.fit ?? "cover";

  if (!hash) {
    return undefined;
  }

  const base = fit === "cover" ? toAverageStyle(hash) : undefined;

  if (!isHydrated) {
    return base;
  }

  const blur = toBlurhashStyle(hash, box.ratio, fit);

  return blur ? { ...base, ...blur } : base;
}

// INFO: Cached like the blur below it, so a re-render hands the element the identical object and React diffs nothing.
const averages = new Map<string, Optional<CSSProperties>>();

function toAverageStyle(hash: string): Optional<CSSProperties> {
  if (!averages.has(hash)) {
    const average = toBlurhashAverage(hash);

    if (averages.size >= CACHE_LIMIT) {
      for (const stale of [...averages.keys()].slice(0, CACHE_LIMIT / 2)) {
        averages.delete(stale);
      }
    }

    averages.set(hash, average ? { backgroundColor: average } : undefined);
  }

  return averages.get(hash);
}

// INFO: Cached by the whole style object rather than by its URL, so a re-render hands the element the identical object and React diffs nothing.
// INFO: The decode's own shape and the fit join the key, because one asset is painted at a tile's square and again at the § 7.10. viewer's `contain` while both are on screen.
function toBlurhashStyle(
  hash: string,
  ratio: Optional<number>,
  fit: BlurhashFit,
): Optional<CSSProperties> {
  const [width, height] = toDecodeExtent(ratio);
  const key = `${hash}|${width}x${height}|${fit}`;

  if (styles.has(key)) {
    return styles.get(key);
  }

  // INFO: A failed decode is cached as its own answer — an unparseable hash is unparseable every time, and `decode` throws rather than returning.
  const style = safelyGet(() => paint(hash, width, height, fit));

  if (styles.size >= CACHE_LIMIT) {
    // INFO: A `Map` iterates in insertion order, so the first half is the oldest half.
    for (const stale of [...styles.keys()].slice(0, CACHE_LIMIT / 2)) {
      styles.delete(stale);
    }
  }

  styles.set(key, style);

  return style;
}

/**
 * The pixels the hash is decoded into: `DECODE_LONG_EDGE` on the asset's long axis,
 * and its own ratio on the other.
 *
 * WARN: A decode is the **whole** picture at whatever dimensions it is asked for — the
 * basis functions are evaluated over a normalized domain, so the extent resamples the
 * image rather than cropping it, and a square one of a 4:3 photo squashes it. The
 * asset's shape is what lets `background-size` below crop the blur exactly where
 * `object-fit` crops the photo beside it.
 *
 * INFO: Square where the caller holds no dimensions, which is the least a stand-in can assume about a crop nobody can compute — DESIGN.md § 7.8.'s two id-only surfaces, `BackgroundMedia`'s § 7.16. cover and `ChatBackdrop`'s wallpaper, have no `media` row in reach to carry one.
 */
function toDecodeExtent(ratio: Optional<number>): [number, number] {
  if (!ratio || !Number.isFinite(ratio) || ratio <= 0) {
    return [DECODE_LONG_EDGE, DECODE_LONG_EDGE];
  }

  const short = Math.max(1, Math.round(DECODE_LONG_EDGE / Math.max(ratio, 1 / ratio)));

  return ratio >= 1 ? [DECODE_LONG_EDGE, short] : [short, DECODE_LONG_EDGE];
}

/**
 * WARN: `cover` / `contain` and never `100% 100%`. The decode above already carries
 * the picture's shape, so handing the box the same rule the asset is drawn with is
 * what keeps the two framings identical — stretched instead, a square tile showed the
 * strips `object-cover` crops away and the picture visibly re-framed on the reveal.
 *
 * INFO: `no-repeat` is what `contain` needs — a blur letterboxed into a wider box tiles without it — and `center` is `object-position`'s own default, which the elements beside this all keep.
 * INFO: PNG stays. The encode measures 12µs of the 59µs paint in Chrome, so hand-writing a BMP header here to skip it would buy back a fifth of what the extent above already gave.
 */
function paint(hash: string, width: number, height: number, fit: BlurhashFit): CSSProperties {
  const canvas = (scratch ??= document.createElement("canvas"));

  canvas.width = width;
  canvas.height = height;

  const context = ensure(canvas.getContext("2d"));
  // INFO: Copied into the context's own buffer rather than wrapped by `new ImageData` — the decoder returns a view over an `ArrayBufferLike`, which the constructor no longer takes.
  const image = context.createImageData(width, height);

  image.data.set(decode(hash, width, height));
  context.putImageData(image, 0, 0);

  return {
    backgroundImage: `url("${canvas.toDataURL()}")`,
    backgroundSize: fit,
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
  };
}
