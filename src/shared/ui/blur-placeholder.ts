"use client";

import { ensure, safelyGet, useHydrated, type Maybe, type Optional } from "@/shared/lib";
import { decode } from "blurhash";
import type { CSSProperties } from "react";

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
 * The `style` that paints `hash`'s decoded blur across a box, or `undefined` when
 * there is nothing to paint — no hash, one the decoder rejects, or a render with no
 * canvas to decode on.
 *
 * WARN: Gated on hydration, and it has to be. A canvas exists only in the browser,
 * so the server paints nothing; a client render that decoded on its first pass would
 * hand React a `background-image` the SSR markup does not carry and fail hydration on
 * every placeholder on screen. A component mounted after hydration — every tile a
 * scroll brings in — reads `true` on its first render and pays no extra pass.
 */
export function useBlurhashStyle(
  hash: Maybe<string>,
  box: BlurhashBox = {},
): Optional<CSSProperties> {
  const isHydrated = useHydrated();

  if (!isHydrated || !hash) {
    return undefined;
  }

  return toBlurhashStyle(hash, box.ratio, box.fit ?? "cover");
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
