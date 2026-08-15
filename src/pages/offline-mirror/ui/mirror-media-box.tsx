import { cn, type Maybe, type Optional } from "@/shared/lib";
import { MediaTombstone, toBlurhashAverage, toCellRatio, type MediaCell } from "@/shared/ui";

export type MirrorMediaBoxProps = {
  className?: string;
  cell: MediaCell;
  /** Caps the box at DESIGN.md § 6.5.'s attachment column; omitted, it fills its parent. */
  maxWidth?: number;
};

/**
 * The box an attachment occupies, painted its stored average colour
 * (AGENTS.md § 5.3.).
 *
 * INFO: The DC term alone rather than `useBlurhashStyle`'s decoded blur, which
 * `shared/ui` does not publish — the average is the same value at the same fidelity
 * the first paint of every online screen already uses.
 */
export function MirrorMediaBox({ className, cell, maxWidth }: MirrorMediaBoxProps) {
  return (
    <div
      className={cn("overflow-hidden rounded-md bg-surface-soft", className)}
      style={{
        width: toWidth(cell.width, maxWidth),
        aspectRatio: toCellRatio(cell),
        backgroundColor: cell.isDeleted ? undefined : toBlurhashAverage(cell.blurhash),
      }}
    >
      {cell.isDeleted && <MediaTombstone cell={cell} />}
    </div>
  );
}

function toWidth(width: Maybe<number>, maxWidth: Optional<number>): Optional<number> {
  if (maxWidth === undefined) {
    return undefined;
  }

  return width === null || width === undefined ? maxWidth : Math.min(width, maxWidth);
}
