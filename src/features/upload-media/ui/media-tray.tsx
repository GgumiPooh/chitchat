"use client";

import type { MediaDraft } from "@/entities/media";
import { isVideoMime } from "@/shared/config";
import { cn } from "@/shared/lib";
import { Skeleton } from "@/shared/ui";
import { Pencil, Play, X } from "lucide-react";

export type MediaTrayProps = {
  className?: string;
  drafts: MediaDraft[];
  /** A pick is still being decoded — its tiles do not exist yet (REQUIREMENTS.md § 18. #10). */
  isReading?: boolean;
  onEdit: (draft: MediaDraft) => void;
  onRemove: (id: string) => void;
};

/**
 * The staged attachments, above the composer. Every tile carries its own remove
 * control, and images carry an edit one — a video has no editor (§ 9. stores it
 * as it arrived).
 */
export function MediaTray({ className, drafts, isReading, onEdit, onRemove }: MediaTrayProps) {
  if (drafts.length === 0 && !isReading) {
    return null;
  }

  return (
    <div
      className={cn(
        "pointer-events-auto flex gap-xs overflow-x-auto rounded-lg border border-hairline glass p-xs shadow-floating",
        "scrollbar-hidden",
        className,
      )}
    >
      {drafts.map((draft) => (
        <div key={draft.id} className="relative shrink-0">
          {/* WARN: DESIGN.md § 8.1. bans hex in TSX, and this is a user photo rather than a token surface — the ring is what keeps a light image off the glass. */}
          <img
            className="size-16 rounded-sm object-cover ring-1 ring-hairline ring-inset"
            src={draft.previewUrl}
            alt=""
          />
          {isVideoMime(draft.mime) ? (
            <span className="absolute inset-0 flex items-center justify-center">
              <Play className="size-5 text-on-primary drop-shadow-sm" strokeWidth={1.75} />
            </span>
          ) : (
            <button
              className="absolute inset-x-0 bottom-0 flex h-6 cursor-pointer items-center justify-center rounded-b-sm bg-scrim/45 text-on-primary transition-colors outline-none hover:bg-scrim/60 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
              type="button"
              aria-label="사진 편집"
              onClick={() => onEdit(draft)}
            >
              <Pencil className="size-3.5" strokeWidth={1.75} />
            </button>
          )}
          {/* INFO: DESIGN.md § 3.2. The glyph stays small while the button keeps a finger-sized hit area through its negative inset. */}
          <button
            className="absolute -top-1 -right-1 inline-flex size-6 cursor-pointer items-center justify-center rounded-full border border-hairline bg-canvas text-meta transition-colors outline-none hover:bg-surface-strong hover:text-ink focus-visible:ring-2 focus-visible:ring-primary active:bg-surface-pressed"
            type="button"
            aria-label="첨부 취소"
            onClick={() => onRemove(draft.id)}
          >
            <X className="size-3.5" strokeWidth={2} />
          </button>
        </div>
      ))}
      {/* INFO: Decoding is serial and a large pick takes seconds, so the tray shows the wait rather than staying empty until the last file lands. */}
      {isReading && <Skeleton className="size-16 shrink-0 rounded-sm" />}
    </div>
  );
}
