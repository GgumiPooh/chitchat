import { cn } from "@/shared/lib";
import { Trash2 } from "lucide-react";

export type InlineEmoticonTombstoneProps = {
  className?: string;
  iconClassName?: string;
};

/**
 * REQUIREMENTS.md § 13. What stands where a deleted inline emoticon was.
 *
 * WARN: It fills the box its caller gives it and sizes nothing itself, exactly as
 * `MediaTombstone` does and for the same reason — the item's row survives its objects so
 * the stored width and height are still there, and § 8.3.'s list re-measures nothing when
 * one appears.
 *
 * WARN: An icon and no sentence. Inline it is one line tall, which is a box no copy fits
 * in; `MediaTombstone`'s own text would wrap out of it or be clipped. The tokens are that
 * component's so the two read as one idea.
 */
export function InlineEmoticonTombstone({
  className,
  iconClassName,
}: InlineEmoticonTombstoneProps) {
  return (
    <span
      className={cn(
        "flex h-full w-full items-center justify-center rounded-xs bg-surface-soft ring-1 ring-hairline select-none ring-inset",
        className,
      )}
      role="img"
      // INFO: The one thing a reader cannot get from an icon in a line of text, and it is on the box rather than beside it — there is no room for a caption.
      aria-label="삭제된 이모티콘"
    >
      <Trash2 className={cn("size-3 shrink-0 text-meta-soft", iconClassName)} strokeWidth={1.75} />
    </span>
  );
}
