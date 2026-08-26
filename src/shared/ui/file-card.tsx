import { cn, formatSize } from "@/shared/lib";
import { FileText } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

export type FileCardProps = ComponentProps<"button"> & {
  className?: string;
  filename: string;
  sizeBytes: number;
  isSelected?: boolean;
  /** REQUIREMENTS.md § 16.1. 나에게만 보내기 — a ring, since the card is already a fixed `h-14` § 8.3.'s estimate depends on. */
  isOnlyMe?: boolean;
  /** The row's trailing edge — the 보관함 list puts its selection mark here; a bubble leaves it empty. */
  trailing?: ReactNode;
  /**
   * What stands under the name in place of the size — 보관함's audio row puts its
   * elapsed clock here (REQUIREMENTS.md § 9.1.).
   */
  meta?: ReactNode;
  /**
   * `0`–`1`. Draws a fill along the card's bottom edge, and nothing at all when it is
   * omitted.
   *
   * INFO: Inside the card rather than a bar beside it, because the row is already a
   * fixed `h-14` (DESIGN.md § 6.5.) that the § 8.3. estimate depends on — a sibling
   * would change the height of a bubble the virtualizer has already measured.
   */
  progress?: number;
};

/**
 * DESIGN.md § 6.5. The file card — a fixed-height row naming what the app cannot
 * draw.
 *
 * WARN: Lives in `shared/ui` rather than beside either caller. `widgets/chat-room`
 * stacks these inside a bubble and `widgets/archive-shelves` lists them under a month
 * header (REQUIREMENTS.md § 10.), and a widget cannot import a sibling widget
 * (§ 2.) — copied, the two rows would drift on the next change to either.
 *
 * WARN: A tap **saves**, it does not open. § 9.1. serves a file as
 * `Content-Disposition: attachment` whatever is asked for, so there is no inline
 * view for the § 7.10. viewer to have shown. 보관함's audio row is the one place
 * something else can also happen to a file, and it happens through a **sibling**
 * control rather than through this tap (§ 9.1., DESIGN.md § 7.10.1.).
 */
export function FileCard({
  className,
  filename,
  sizeBytes,
  isSelected = false,
  isOnlyMe = false,
  trailing,
  meta,
  progress,
  ...props
}: FileCardProps) {
  return (
    <button
      className={cn(
        "relative flex h-14 w-full cursor-pointer items-center gap-xs overflow-hidden rounded-md border px-sm text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset disabled:cursor-default",
        // INFO: REQUIREMENTS.md § 16.1. 나에게만 보내기 — the other theme's own surface, exactly as `bubble-mine-private` swaps a text bubble's fill, rather than a ring on a card that already carries a border.
        isOnlyMe
          ? "border-transparent bg-surface-soft-private"
          : "border-hairline bg-surface-soft hover:bg-surface-strong active:bg-surface-pressed",
        // INFO: DESIGN.md § 7.10. A ring rather than the grid's 90% inset — a row has no photograph to shrink, and the mark beside it is what says which state this is.
        isSelected && "border-primary ring-1 ring-primary",
        className,
      )}
      type="button"
      {...props}
    >
      <span
        className={cn(
          "inline-flex size-8 shrink-0 items-center justify-center rounded-sm",
          isOnlyMe
            ? "bg-primary-tint-private text-primary-private"
            : "bg-primary-tint text-primary",
        )}
      >
        <FileText className="size-4" strokeWidth={1.75} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className={cn("truncate text-body-sm", isOnlyMe ? "text-bubble-private-ink" : "text-ink")}
        >
          {filename}
        </span>
        <span
          className={cn(
            "truncate text-caption",
            isOnlyMe ? "text-bubble-private-ink/70" : "text-meta",
          )}
        >
          {meta ?? formatSize(sizeBytes)}
        </span>
      </span>
      {trailing}
      {/* INFO: DESIGN.md § 7.10.1. A 2px rule along the bottom edge, not a slider — playback here is a tap and a second tap, and § 9.1. stores no duration for an attached file to seek against before it has played. */}
      {progress !== undefined && (
        <span
          className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-primary"
          style={{ transform: `scaleX(${Math.min(Math.max(progress, 0), 1)})` }}
          aria-hidden
        />
      )}
    </button>
  );
}
