import { toMediaLabel } from "@/shared/config";
import { cn } from "@/shared/lib";
import { josa } from "es-hangul";
import { Trash2 } from "lucide-react";
import { toCellNoun, type MediaCell } from "./media-cell";

export type MediaTombstoneProps = {
  className?: string;
  iconClassName?: string;
  cell: MediaCell;
};

/**
 * The finished restructure. What stands where a deleted attachment was.
 *
 * WARN: It fills its parent rather than sizing itself, and every caller gives it the
 * box the attachment had. That is the whole point — § 4.3. keeps `width`/`height` on a
 * deleted row so this occupies the same space, and REQUIREMENTS.md § 8.3.'s virtualized
 * list re-measures nothing when one appears.
 *
 * INFO: Column-centred by default, which suits a tile and a full-width photo. The two fixed-height rows — a file card and a voice player — pass `flex-row` through `className`.
 *
 * INFO: Not interactive, and it takes no handler. There is nothing behind it to open, which is also why the § 7.10. viewer never receives one.
 */
export function MediaTombstone({ className, iconClassName, cell }: MediaTombstoneProps) {
  return (
    <div
      className={cn(
        "flex size-full flex-col items-center justify-center gap-2xs rounded-md bg-surface-soft px-sm text-center ring-1 ring-hairline select-none ring-inset",
        className,
      )}
    >
      <Trash2 className={cn("size-5 shrink-0 text-meta-soft", iconClassName)} strokeWidth={1.75} />
      {/* INFO: DESIGN.md § 6.5. `meta` rather than the bubble's own ink — a tombstone is the room telling the reader what is missing, not the message speaking. */}
      <p className="text-caption text-meta">{toDeletedMediaText(toCellNoun(cell))}</p>
    </div>
  );
}

/**
 * The finished restructure. The sentence a tombstone shows.
 *
 * WARN: Exported because 보관함's 완전히 삭제 confirmation quotes it, to show the reader
 * what the other participant will be left looking at. Spelled out a second time there it
 * drifted the moment the copula changed here, which is exactly what it now cannot do.
 *
 * INFO: 해요체, matching `DELETED_MESSAGE_TEXT`'s `삭제된 메시지예요` (REQUIREMENTS.md
 * § 8.13.) — the same event said about an attachment rather than a message. DESIGN.md
 * § 6.10. keeps the whole app on 해요체, and `삭제된 사진입니다` would be its one 합쇼체
 * string.
 *
 * WARN: AGENTS.md § 0.4. The copula is picked rather than written. `삭제된 사진이에요`
 * and `삭제된 파일이에요` are one sentence over two 받침, and `toMediaLabel` gains a noun
 * ending in a vowel the moment one is added.
 */
export function toDeletedMediaText(noun: Parameters<typeof toMediaLabel>[0]): string {
  return `삭제된 ${josa(toMediaLabel(noun), "이에요/예요")}`;
}
