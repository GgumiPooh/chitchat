"use client";

import { toMediaUrl } from "@/shared/config";
import type { Nullable } from "@/shared/lib";
import { useEffect } from "react";

const TINT_PROPERTY = "--chat-chrome-tint";

// INFO: The grid the average is taken over. Large enough that one bright corner cannot carry the whole answer, small enough that the draw and the read are a rounding error.
const SAMPLE_SIZE = 16;

// WARN: DESIGN.md § 4.1. The same 45% the wash over the wallpaper is drawn at (`ChatBackdrop`). What is on screen is the photo *under* that wash, so sampling the bare photo publishes a colour visibly deeper than the room it borders.
const WASH_ALPHA = 0.45;

/**
 * REQUIREMENTS.md § 12.2. Publishes the wallpaper's own colour as
 * `--chat-chrome-tint`, which `ChatScreen` paints itself with — that box is the
 * one iOS 26 Safari samples its status bar and toolbar from while the room is on
 * screen (DESIGN.md § 3.3.), since it covers `body` entirely.
 *
 * WARN: `crossOrigin`, and the same URL the backdrop displays. The media route
 * answers a 302 to a presigned R2 URL (REQUIREMENTS.md § 9.), so the pixels are
 * cross-origin and `getImageData` throws on a canvas drawn from a request that did
 * not ask for CORS. The browser caches a CORS request separately from a plain one,
 * which is why the displayed `<img>` carries the attribute too — the two would
 * otherwise be two downloads of the same full-size photo.
 */
export function useBackdropTint(mediaId: string) {
  useEffect(() => {
    const image = new Image();
    let isCancelled = false;

    image.crossOrigin = "anonymous";
    image.decoding = "async";

    image.addEventListener("load", () => {
      const tint = isCancelled ? null : toWashedAverage(image);

      if (tint) {
        document.documentElement.style.setProperty(TINT_PROPERTY, tint);
      }
    });

    image.src = toMediaUrl(mediaId, "original");

    // WARN: Cleared on the way out, not left standing. The property lives on the root, so unsetting the wallpaper without leaving the room would otherwise keep the chrome tinted with the photo that is no longer behind it.
    return () => {
      isCancelled = true;
      document.documentElement.style.removeProperty(TINT_PROPERTY);
    };
  }, [mediaId]);
}

/** The photo's average colour, composited under the wash it is seen through. */
function toWashedAverage(image: HTMLImageElement): Nullable<string> {
  const canvas = document.createElement("canvas");

  canvas.width = SAMPLE_SIZE;
  canvas.height = SAMPLE_SIZE;

  const context = canvas.getContext("2d");

  if (!context) {
    return null;
  }

  context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

  // WARN: Still guarded. The CORS request above is what normally keeps the canvas readable, but a deployment whose origin is missing from the bucket's rules answers without the header and this throws — `body` keeps its own `canvas` rather than the room failing to render.
  let pixels: Uint8ClampedArray;

  try {
    pixels = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
  } catch {
    return null;
  }

  const wash = toWashColor();
  const totals = [0, 0, 0];

  for (let offset = 0; offset < pixels.length; offset += 4) {
    totals[0] += pixels[offset];
    totals[1] += pixels[offset + 1];
    totals[2] += pixels[offset + 2];
  }

  const count = pixels.length / 4;
  const [r, g, b] = totals.map((total, channel) =>
    Math.round((total / count) * (1 - WASH_ALPHA) + wash[channel] * WASH_ALPHA),
  );

  return `rgb(${r} ${g} ${b})`;
}

/**
 * The wash's own colour, read back from the token rather than written out here —
 * `--color-chat-scrim` moves with the theme (DESIGN.md § 5.2.) and a literal would
 * composite the dark room against the light wash.
 */
function toWashColor(): [number, number, number] {
  const declared = getComputedStyle(document.documentElement)
    .getPropertyValue("--color-chat-scrim")
    .trim();
  const hex = /^#([\da-f]{6})$/i.exec(declared);

  if (!hex) {
    return [0, 0, 0];
  }

  const value = Number.parseInt(hex[1], 16);

  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}
