import type { Nullable } from "@/shared/lib";

// INFO: DESIGN.md § 6.5. The long edge of an image message. A grid takes the same width so a bubble of one and a bubble of nine line up in the column.
export const MEDIA_EDGE_REM = 13.75;

// WARN: The px twin of the edge above, which REQUIREMENTS.md § 8.3.'s row estimate needs and `rem` cannot give it. A reader's enlarged default font size moves the rendered edge and not this one, so the estimate drifts on exactly those devices — it is an estimate, and the measurement that follows corrects it.
export const MEDIA_EDGE = MEDIA_EDGE_REM * 16;

// INFO: `--spacing-2xs`, the `gap-2xs` between grid cells.
const CELL_GAP = 4;

// INFO: DESIGN.md § 6.5. `h-14` on the file card. Fixed rather than derived from the name, so REQUIREMENTS.md § 8.3.'s estimate is exact for a bubble whose contents it cannot measure — a document title has no reliable height and the card clamps it to one line for that reason.
export const FILE_CARD_HEIGHT = 56;

// INFO: `--spacing-2xs`, the `gap-2xs` between stacked file cards.
const FILE_CARD_GAP = 4;

// INFO: REQUIREMENTS.md § 9.3. `h-14` on `VoicePlayer`, fixed for the same reason the file card is — a waveform has no intrinsic height, so REQUIREMENTS.md § 8.3.'s estimate would have nothing to derive one from.
export const VOICE_CARD_HEIGHT = 56;

type Sized = {
  // INFO: RESTRUCTURE.md § 2.4. Null on the two kinds that reserve no box, which is what makes the fixed-height branches below the compiler's business rather than the reader's.
  width: Nullable<number>;
  height: Nullable<number>;
  /** REQUIREMENTS.md § 9.1. Set on a file attachment, which is a stacked card rather than a tile in the grid. */
  filename?: Nullable<string>;
  /** Set on a sent voice message, which is one fixed-height row rather than a box with a ratio. */
  voice?: Nullable<unknown>;
  /** REQUIREMENTS.md § 9.3. The same thing on a **draft**, which carries the raw peaks rather than the shaped track. */
  waveformPeaks?: Nullable<number[]>;
};

/**
 * WARN: Both fields, because a voice bubble reaches this from two shapes — `ChatMedia.voice`
 * once it is registered and `MediaDraft.waveformPeaks` while it is still optimistic. Testing
 * only the first let a draft fall through to the ratio branch, where its `0 / 0` box resolved
 * the whole virtualized list's total size to `NaN` (§ 8.3.).
 */
function isVoiceSized({ voice, waveformPeaks }: Sized): boolean {
  return Boolean(voice ?? waveformPeaks);
}

// INFO: Two sits on one line and four squares up; everything else fills three columns, which is what the nine-per-bubble split of REQUIREMENTS.md § 18. #10 was chosen around.
export function toMediaColumns(count: number): number {
  return count === 2 || count === 4 ? 2 : 3;
}

/**
 * REQUIREMENTS.md § 8.1., § 8.3. The height a `MediaGrid` will take, from the stored
 * dimensions alone — which is the whole reason § 8.3. stores them.
 *
 * INFO: Branch on count alone, exactly as the grid does: one keeps its own aspect ratio, two or more take square cells whose height follows from the layout rather than from the images.
 */
export function toMediaBoxHeight(cells: Sized[]): number {
  const [first] = cells;

  if (!first) {
    return 0;
  }

  // INFO: REQUIREMENTS.md § 9.3. A voice bubble is one clip, so the count never enters into it.
  if (isVoiceSized(first)) {
    return VOICE_CARD_HEIGHT;
  }

  // INFO: REQUIREMENTS.md § 9.1. A bubble is files or photos, never both (§ 6.), so the first cell decides for all of them — a stack of fixed-height cards rather than a grid of ratios.
  // INFO: RESTRUCTURE.md § 2.4. A boxless cell that is not a recording is a file attachment, so the missing box lands in this branch rather than being answered with a number.
  if (first.filename || first.width === null || first.height === null) {
    return cells.length * FILE_CARD_HEIGHT + (cells.length - 1) * FILE_CARD_GAP;
  }

  if (cells.length === 1) {
    return (MEDIA_EDGE * first.height) / first.width;
  }

  const columns = toMediaColumns(cells.length);
  const rows = Math.ceil(cells.length / columns);
  const cell = (MEDIA_EDGE - CELL_GAP * (columns - 1)) / columns;

  return rows * cell + CELL_GAP * (rows - 1);
}
