import { toMediaLabel } from "@/shared/config";
import { cn, type Maybe, type Optional } from "@/shared/lib";
import {
  MediaTombstone,
  toBlurhashAverage,
  toCellNoun,
  toCellRatio,
  type MediaCell,
} from "@/shared/ui";
import { josa } from "es-hangul";
import { WifiOff } from "lucide-react";

export type MirrorMediaBoxProps = {
  className?: string;
  iconClassName?: string;
  cell: MediaCell;
  /** Caps the box at DESIGN.md § 6.5.'s attachment column; omitted, it fills its parent. */
  maxWidth?: number;
  /** Draws the box square instead of at the stored ratio — 보관함's grid is a square grid (REQUIREMENTS.md § 10.), where a bubble keeps the picture's own shape. */
  isSquare?: boolean;
  /** Leaves the icon to say it alone, for a box that is one of several saying the same thing. */
  isIconOnly?: boolean;
};

/**
 * The box an attachment occupies offline, saying that the picture is the one thing
 * the snapshot does not carry (REQUIREMENTS.md § 16.2.).
 *
 * INFO: The stored average colour rather than `useBlurhashStyle`'s decoded blur, which `shared/ui` does not publish — the DC term is the same value at the same fidelity the first paint of every online screen already uses.
 */
export function MirrorMediaBox({
  className,
  iconClassName,
  cell,
  maxWidth,
  isSquare,
  isIconOnly,
}: MirrorMediaBoxProps) {
  return (
    <div
      className={cn("overflow-hidden rounded-md bg-surface-soft", className)}
      style={{
        width: toWidth(cell.width, maxWidth),
        // WARN: An inline ratio beats any `aspect-*` a caller passes, so the square has to be asked for here — left to the class it held only for the rows whose stored geometry happened to be missing, and the grid came out ragged.
        aspectRatio: isSquare ? 1 : toCellRatio(cell),
        backgroundColor: cell.isDeleted ? undefined : toMirrorFill(cell.blurhash),
      }}
    >
      {cell.isDeleted ? <MediaTombstone cell={cell} /> : renderNotice()}
    </div>
  );

  /**
   * WARN: The sentence stays as the `aria-label` wherever the icon is left to carry
   * it. A sighted reader infers the state from nine boxes wearing one icon; a screen
   * reader is handed one box at a time and would be given nothing at all.
   */
  function renderNotice() {
    const text = toUnavailableMediaText(cell);

    return (
      <div
        className="flex h-full w-full flex-col items-center justify-center gap-2xs px-xs text-center select-none"
        role="img"
        aria-label={text}
      >
        <WifiOff
          className={cn("size-5 shrink-0 text-meta-soft", iconClassName)}
          strokeWidth={1.75}
        />
        {/* INFO: DESIGN.md § 6.5. `meta` rather than the bubble's own ink, exactly as a tombstone — this is the screen telling the reader what is missing, not the message speaking. */}
        {!isIconOnly && <p className="text-caption text-meta">{text}</p>}
      </div>
    );
  }
}

/**
 * REQUIREMENTS.md § 16.2. What stands where the picture would be.
 *
 * INFO: 해요체, matching `toDeletedMediaText`'s `삭제된 사진이에요` — the same box saying a different reason it is empty.
 *
 * WARN: AGENTS.md § 0.4. The particle is picked rather than written. `사진을` and `동영상을` agree today only because both nouns close on a 받침, and `toMediaLabel` gains one that does not the moment a kind is added.
 */
function toUnavailableMediaText(cell: MediaCell): string {
  return `${josa(toMediaLabel(toCellNoun(cell)), "을/를")} 불러올 수 없어요`;
}

// WARN: The average is washed rather than worn bare, and the amount is what `text-meta` and `text-meta-soft` are legible over. A photo's own colour is whatever it happened to be — a dark one takes the icon and the sentence below the contrast floor, and there is no second value to fall back to.
const WASH_AMOUNT = "80%";

/**
 * WARN: AGENTS.md § 5.3. Composited in CSS against the live token, never resolved
 * here. `--color-surface-soft` moves with the theme (§ 5.2.), so a value mixed at
 * render time is baked against whichever theme was up then, with nothing to
 * recompute on when it swaps under the reader.
 */
function toMirrorFill(blurhash: Maybe<string>): Optional<string> {
  const average = toBlurhashAverage(blurhash);

  if (!average) {
    return undefined;
  }

  return `color-mix(in srgb, var(--color-surface-soft) ${WASH_AMOUNT}, ${average})`;
}

function toWidth(width: Maybe<number>, maxWidth: Optional<number>): Optional<number> {
  if (maxWidth === undefined) {
    return undefined;
  }

  return width === null || width === undefined ? maxWidth : Math.min(width, maxWidth);
}
