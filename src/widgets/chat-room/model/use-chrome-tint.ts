"use client";

import { useIsomorphicLayoutEffect, type Maybe, type Optional } from "@/shared/lib";

const TINT_PROPERTY = "--chat-chrome-tint";

// INFO: The wire format. A blurhash is `[size flag][max value][4 chars of DC][2 chars per AC component]`, so the average colour is characters 2–5 and nothing after them is read here.
const DC_START = 2;
const DC_END = 6;

const BASE83_DIGITS =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~";

const BYTE_MASK = 0xff;

// WARN: DESIGN.md § 7.16. The same 45% `ChatBackdrop` draws its wash at, and the two MUST move together — what borders the chrome is the photo *under* that wash, so the bare average publishes a colour visibly deeper than the room beside it.
const WASH_AMOUNT = "45%";

/**
 * REQUIREMENTS.md § 12.2. Publishes the wallpaper's own colour as
 * `--chat-chrome-tint`, which `ChatScreen` paints itself with — that box is the one
 * iOS 26 Safari samples its status bar and toolbar from while the room is on screen
 * (DESIGN.md § 3.3.), since it covers `body` entirely.
 *
 * INFO: The hash, never the photo. A blurhash's DC term *is* the image's average
 * colour, so this is string arithmetic on a value the shell was already seeded with.
 * The canvas read it replaced cost a second full-size download, published nothing
 * until that download had decoded — the chrome visibly changed colour under the
 * reader — and was subject to a CORS check `/api/media/{id}`'s redirect into R2
 * answers differently cold and warm, so it failed on a refresh and worked after a
 * route change.
 */
export function useChromeTint(blurhash: Maybe<string>) {
  const tint = toWashedAverage(blurhash);

  // WARN: A layout effect, so the tint is in place for the frame the room first paints. Passive, it lands after it, which on a route change into 채팅 is the flat `chat-canvas` chrome flashing before the wallpaper's colour.
  useIsomorphicLayoutEffect(() => {
    if (!tint) {
      return;
    }

    document.documentElement.style.setProperty(TINT_PROPERTY, tint);

    // WARN: Cleared on the way out, not left standing. The property lives on the root, so unsetting the wallpaper without leaving the room — or leaving the room at all — would otherwise keep every other screen's chrome tinted with a photo that is behind nothing.
    return () => {
      document.documentElement.style.removeProperty(TINT_PROPERTY);
    };
  }, [tint]);
}

/**
 * The photo's average colour, composited under the wash it is seen through.
 *
 * WARN: A `color-mix` against the live token rather than three numbers, and that is
 * the whole reason the composite is expressed in CSS. `--color-chat-scrim` moves
 * with the theme (DESIGN.md § 5.2.), so a value resolved here is baked against
 * whichever theme was up when the wallpaper landed — and a theme swapped while the
 * room is on screen fires no signal this could recompute on.
 */
function toWashedAverage(blurhash: Maybe<string>): Optional<string> {
  const average = toAverageColor(blurhash);

  if (!average) {
    return undefined;
  }

  return `color-mix(in srgb, var(--color-chat-scrim) ${WASH_AMOUNT}, ${average})`;
}

/**
 * WARN: Decoded by hand rather than through the package's own `decode`. That one
 * renders pixels, and a 1×1 render is the top-left corner — every basis function
 * evaluates to 1 there, so the AC terms are summed in with the DC instead of being
 * left out of it. The package exports no DC accessor.
 */
function toAverageColor(blurhash: Maybe<string>): Optional<string> {
  if (!blurhash || blurhash.length < DC_END) {
    return undefined;
  }

  const packed = decodeBase83(blurhash.slice(DC_START, DC_END));

  if (packed === undefined) {
    return undefined;
  }

  // INFO: The DC is stored already sRGB-encoded, packed into 24 bits, so there is no linear-light conversion to undo here.
  return `rgb(${(packed >> 16) & BYTE_MASK} ${(packed >> 8) & BYTE_MASK} ${packed & BYTE_MASK})`;
}

// INFO: Guarded rather than trusted. `registerMedia` validates the hash at the write (REQUIREMENTS.md § 9.), but a malformed one reaching here must leave the chrome on its `chat-canvas` fallback rather than publish a colour built from `NaN`.
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
