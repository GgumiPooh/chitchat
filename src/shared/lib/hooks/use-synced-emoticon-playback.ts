"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { playSound, warmSound } from "../audio/sound";
import { cn } from "../class-name";
import { A_SECOND } from "../date/time";
import {
  prepareAnimatedImage,
  releaseAnimatedImage,
  warmAnimatedImage,
} from "../dom/animated-image";
import type { Nullable } from "../nullish";

/**
 * How long a picture may be held back waiting for its assets.
 *
 * WARN: REQUIREMENTS.md § 13.6. Past it the sound plays on its own and the network
 * `<img>` is drawn — an emoticon that cannot be heard is a sound nobody notices, where
 * one that cannot be *seen* is the message missing from the conversation.
 */
export const EMOTICON_PLAYBACK_HOLD = A_SECOND;

export type SyncedEmoticonPlaybackOptions = {
  frameClassName?: string;
  imageSrc: string;
  audioSrc: string;
  hasAnimated: boolean;
  hasAudio: boolean;
  /** Off for an emoticon nothing will ever play — an inline run, the composer draft — so it warms nothing. */
  isEnabled?: boolean;
  /** REQUIREMENTS.md § 13.6. Shows nothing until the first `play` lands — a live arrival, the staged preview. */
  startsHeld?: boolean;
};

export type SyncedEmoticonPlaybackPhase = "idle" | "held" | "frame";

/**
 * REQUIREMENTS.md § 13.6. One emoticon's picture and sound, started on the same
 * frame.
 *
 * INFO: The sound goes first and the picture follows it, because that is the order
 * the two can be observed in: an animated image's clock starts on the first paint
 * after it is mounted (`prepareAnimatedImage`), which a caller can place, where the
 * sound's own start is only reported (`playSound` resolving on `playing`). So `play`
 * decodes the picture off-DOM, starts the sound, and on the frame after output
 * begins mounts the decoded element into `frameRef`'s box — through `flushSync`, so
 * the reveal commits before that frame paints rather than a scheduler task later.
 *
 * WARN: The box under `frameRef` must have no React children; the frame is put
 * there imperatively so the very element that decoded is the one that paints.
 */
export function useSyncedEmoticonPlayback<T extends HTMLElement = HTMLDivElement>({
  frameClassName,
  imageSrc,
  audioSrc,
  hasAnimated,
  hasAudio,
  isEnabled = true,
  startsHeld = false,
}: SyncedEmoticonPlaybackOptions) {
  const [phase, setPhase] = useState<SyncedEmoticonPlaybackPhase>(startsHeld ? "held" : "idle");
  const frameRef = useRef<Nullable<T>>(null);
  const mountedRef = useRef<Nullable<HTMLImageElement>>(null);
  const runRef = useRef(0);

  useEffect(() => {
    if (!isEnabled) {
      return;
    }

    if (hasAudio) {
      void warmSound(audioSrc);
    }

    if (hasAnimated) {
      void warmAnimatedImage(imageSrc);
    }
  }, [isEnabled, hasAudio, hasAnimated, audioSrc, imageSrc]);

  /** REQUIREMENTS.md § 13.6. `isSilent` is the viewport re-entry — the picture restarts and the sound stays down. */
  const play = useCallback(
    async ({ isSilent = false } = {}) => {
      const run = ++runRef.current;
      const isStale = () => run !== runRef.current;
      const sounds = hasAudio && !isSilent;

      if (!hasAnimated) {
        if (sounds) {
          void playSound(audioSrc);
        }

        return;
      }

      const image = await withHold(
        Promise.all([
          sounds ? warmSound(audioSrc) : Promise.resolve(),
          prepareAnimatedImage(imageSrc),
        ]).then(([, prepared]) => prepared),
      );

      if (isStale()) {
        if (image) {
          releaseAnimatedImage(image);
        }

        return;
      }

      if (sounds) {
        await playSound(audioSrc);
      }

      if (isStale()) {
        if (image) {
          releaseAnimatedImage(image);
        }

        return;
      }

      if (!image) {
        setPhase("idle");

        return;
      }

      await nextFrame();

      if (isStale() || !frameRef.current) {
        releaseAnimatedImage(image);

        return;
      }

      image.alt = "";
      image.draggable = false;
      image.className = cn("size-full object-contain", frameClassName);

      const previous = mountedRef.current;

      frameRef.current.replaceChildren(image);
      mountedRef.current = image;
      flushSync(() => setPhase("frame"));

      if (previous) {
        releaseAnimatedImage(previous);
      }
    },
    [hasAnimated, hasAudio, audioSrc, imageSrc, frameClassName],
  );

  useEffect(
    () => () => {
      runRef.current++;

      if (mountedRef.current) {
        releaseAnimatedImage(mountedRef.current);
        mountedRef.current = null;
      }
    },
    [],
  );

  return { phase, frameRef, play };
}

// WARN: A prepare that outlives the hold still resolves, and its element is released there — otherwise every timed-out replay leaks a decoded frame and its object URL.
function withHold(
  prepared: Promise<Nullable<HTMLImageElement>>,
): Promise<Nullable<HTMLImageElement>> {
  let isSettled = false;

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      isSettled = true;
      resolve(null);
    }, EMOTICON_PLAYBACK_HOLD);

    void prepared.then((image) => {
      if (isSettled) {
        if (image) {
          releaseAnimatedImage(image);
        }

        return;
      }

      isSettled = true;
      clearTimeout(timer);
      resolve(image);
    });
  });
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
