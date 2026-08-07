import { cn, formatSize } from "@/shared/lib";
import { FileText } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

export type FileCardProps = ComponentProps<"button"> & {
  className?: string;
  filename: string;
  sizeBytes: number;
  isSelected?: boolean;
  /** The row's trailing edge — the 보관함 list puts its selection mark here; a bubble leaves it empty. */
  trailing?: ReactNode;
};

/**
 * DESIGN.md § 6.5. The file card — a fixed-height row naming what the app cannot
 * draw.
 *
 * WARN: Lives in `shared/ui` rather than beside either caller. `widgets/chat-room`
 * stacks these inside a bubble and `widgets/gallery-grid` lists them under a month
 * header (REQUIREMENTS.md § 10.), and a widget cannot import a sibling widget
 * (§ 2.) — copied, the two rows would drift on the next change to either.
 *
 * WARN: A tap **saves**, it does not open. § 9.1. serves a file as
 * `Content-Disposition: attachment` whatever is asked for, so there is no inline
 * view for the § 7.10. viewer to have shown.
 */
export function FileCard({
  className,
  filename,
  sizeBytes,
  isSelected = false,
  trailing,
  ...props
}: FileCardProps) {
  return (
    <button
      className={cn(
        "flex h-14 w-full cursor-pointer items-center gap-xs rounded-md border border-hairline bg-surface-soft px-sm text-left transition-colors outline-none hover:bg-surface-strong focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset active:bg-surface-pressed disabled:cursor-default",
        // INFO: DESIGN.md § 7.10. A ring rather than the grid's 90% inset — a row has no photograph to shrink, and the mark beside it is what says which state this is.
        isSelected && "border-primary ring-1 ring-primary",
        className,
      )}
      type="button"
      {...props}
    >
      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-sm bg-primary-tint text-primary">
        <FileText className="size-4" strokeWidth={1.75} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body-sm text-ink">{filename}</span>
        <span className="text-caption text-meta">{formatSize(sizeBytes)}</span>
      </span>
      {trailing}
    </button>
  );
}
