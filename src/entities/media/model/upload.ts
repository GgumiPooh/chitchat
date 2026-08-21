import { VOICE_PEAK_SCALE, VOICE_WAVEFORM_PEAKS } from "@/shared/config";
import type { Nullable } from "@/shared/lib";
import { isBlurhashValid } from "blurhash";
import { z } from "zod";

/** The wire shape the browser sends: the R2 key plus what only the browser could measure. */
export type MediaUpload = {
  r2Key: string;
  width: number;
  height: number;
  durationMs?: Nullable<number>;
  blurhash?: Nullable<string>;
  filename?: Nullable<string>;
  waveformPeaks?: Nullable<number[]>;
};

export const mediaUploadSchema = z.object({
  r2Key: z.string().min(1),
  // INFO: REQUIREMENTS.md § 8.3. Read off the decoded `<img>` / `<video>` in the browser, because the server never receives the bytes to measure.
  // INFO: § 9.1. Zero is allowed because a file attachment has no box to measure; `validateMediaUpload` zeroes it there regardless and refuses a media row whose thumbnail never landed.
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative().nullish(),
  // INFO: REQUIREMENTS.md § 9. The placeholder the browser encoded from the `_thumb` object it had just uploaded — the server never sees those pixels, so it can only check the string.
  // INFO: Shape is `isBlurhashValid` from the package that wrote it, never a regex spelled out here: the leading character encodes the component counts the rest of the length must agree with, and base83 is exactly what a dependency exists to avoid hand-rolling.
  // WARN: A malformed value is **caught to null**, never refused. Registration runs after the bytes are in R2, so a 400 at this schema orphans an object no row can name and no retry can rescue — the same argument `filename` above carries for its missing `.max()`. What a nulled placeholder costs is § 8.3.'s empty box, which is what every row drew before this column was written at all.
  blurhash: z
    .string()
    .refine((value) => isBlurhashValid(value).result)
    .nullish()
    .catch(null),
  // INFO: REQUIREMENTS.md § 9.1. The name the file was picked under. Sanitized and accepted only for a stored type the app cannot draw — `validateMediaUpload` decides that from R2, not from here.
  // WARN: Length is not bounded here, by either `.max()` or a code-point refine. Registration is the step *after* the bytes are in R2, so every rejection at this schema orphans an object that no row can name and that no retry can rescue — the same 400 comes back forever. `validateMediaUpload` runs `toSafeFilename`, which truncates to `MAX_FILENAME_LENGTH` by code point, so an over-long name is already a harmless truncation rather than a failure. Bounding it here converts that into the orphan.
  filename: z.string().min(1).nullish(),
  // INFO: REQUIREMENTS.md § 9.3. The waveform the recorder extracted. Bounded here only in shape; `validateMediaUpload` is what refuses it on a mime this app does not record into, which is the check that matters.
  // WARN: Shape only, and the length is exact rather than a ceiling — unlike `filename` above, a malformed array is not a name to salvage, and `validateMediaUpload` refuses the row on it either way.
  waveformPeaks: z
    .array(z.number().int().min(0).max(VOICE_PEAK_SCALE))
    .length(VOICE_WAVEFORM_PEAKS)
    .nullish(),
}) satisfies z.ZodType<MediaUpload>;
