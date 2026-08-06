// INFO: DESIGN.md § 6.5. The long edge of an image message. A grid takes the same width so a bubble of one and a bubble of nine line up in the column.
export const MEDIA_EDGE_REM = 13.75;

// WARN: The px twin of the edge above, which REQUIREMENTS.md § 8.3.'s row estimate needs and `rem` cannot give it. A reader's enlarged default font size moves the rendered edge and not this one, so the estimate drifts on exactly those devices — it is an estimate, and the measurement that follows corrects it.
const MEDIA_EDGE = MEDIA_EDGE_REM * 16;

// INFO: `--spacing-2xs`, the `gap-2xs` between grid cells.
const CELL_GAP = 4;

type Sized = {
  width: number;
  height: number;
};

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

  if (cells.length === 1) {
    return (MEDIA_EDGE * first.height) / first.width;
  }

  const columns = toMediaColumns(cells.length);
  const rows = Math.ceil(cells.length / columns);
  const cell = (MEDIA_EDGE - CELL_GAP * (columns - 1)) / columns;

  return rows * cell + CELL_GAP * (rows - 1);
}
