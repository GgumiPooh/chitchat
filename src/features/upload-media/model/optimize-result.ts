import type { Nullable } from "@/shared/lib";

/** `0`–`1` as a re-encode runs, so a bubble can show the phase that precedes its upload bar. */
export type EncodeProgress = (ratio: number) => void;

/**
 * What an optimizer answers: the bytes to upload, and the box they actually have.
 *
 * WARN: `width`/`height` are null when the file came back untouched, and non-null
 * only when a re-encode changed the picture's size. A draft measured its box from
 * the original (REQUIREMENTS.md § 8.3.), so an optimizer that shrinks one has to say
 * so — the row would otherwise record a resolution the stored object does not have.
 */
export type OptimizedMedia = {
  file: File;
  width: Nullable<number>;
  height: Nullable<number>;
};

export function unoptimized(file: File): OptimizedMedia {
  return { file, width: null, height: null };
}
