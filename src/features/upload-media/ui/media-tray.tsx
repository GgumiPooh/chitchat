"use client";

import type { MediaDraft } from "@/entities/media";
import { isVideoMime } from "@/shared/config";
import { cn, formatDuration } from "@/shared/lib";
import { Skeleton } from "@/shared/ui";
import { FileText, Mic, Pencil, Play, Scissors, X } from "lucide-react";

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
 * control, and a photo or a video an edit one — a photo crops and filters, a video
 * trims. A file has neither editor and nothing to draw (REQUIREMENTS.md § 9.1.).
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
          {/* INFO: REQUIREMENTS.md § 9.1., § 9.3. Branched on the two discriminators in `toDraftKind`'s order — a preview that failed to mint is a broken photo, not a file, and a recording carries no filename, so testing that first would draw it as one. */}
          {renderTile(draft)}
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

  function renderTile(draft: MediaDraft) {
    if (draft.waveformPeaks) {
      return renderVoiceTile(draft);
    }

    return draft.filename ? renderFileTile(draft) : renderMediaTile(draft);
  }

  /**
   * REQUIREMENTS.md § 9.3. A staged recording, which only 보관함's 음성 shelf
   * produces — the composer sends one outright rather than staging it, because a
   * recording beside photos would compete for a § 6. row it cannot share.
   *
   * INFO: No edit control. Neither editor takes audio, and trimming a recording is
   * `MAX_VOICE_DURATION`'s job rather than a gesture.
   */
  function renderVoiceTile(draft: MediaDraft) {
    return (
      <span className="flex size-16 flex-col items-center justify-center gap-2xs rounded-sm bg-surface-soft px-1 ring-1 ring-hairline ring-inset">
        <Mic className="size-5 shrink-0 text-meta" strokeWidth={1.75} />
        <span className="text-micro text-meta tabular-nums">
          {formatDuration(draft.durationMs ?? 0)}
        </span>
      </span>
    );
  }

  // INFO: REQUIREMENTS.md § 9.1. Nothing to draw, so the tile is the name — in the same 64px square, since a tray of mixed attachments has to stay one row of one height.
  function renderFileTile(draft: MediaDraft) {
    return (
      <span className="flex size-16 flex-col items-center justify-center gap-2xs rounded-sm bg-surface-soft px-1 ring-1 ring-hairline ring-inset">
        <FileText className="size-5 shrink-0 text-meta" strokeWidth={1.75} />
        <span className="line-clamp-2 w-full text-center text-micro break-all text-meta">
          {draft.filename}
        </span>
      </span>
    );
  }

  function renderMediaTile(draft: MediaDraft) {
    const isVideo = isVideoMime(draft.mime);

    return (
      <>
        {/* WARN: DESIGN.md § 8.1. bans hex in TSX, and this is a user photo rather than a token surface — the ring is what keeps a light image off the glass. */}
        <img
          className="size-16 rounded-sm object-cover ring-1 ring-hairline ring-inset"
          src={draft.previewUrl ?? undefined}
          alt=""
        />
        {/* INFO: The play glyph marks the tile as a video; it is not a control, so it takes no pointer events and the edit strip below it stays reachable. */}
        {isVideo && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <Play className="size-5 text-on-scrim drop-shadow-sm" strokeWidth={1.75} />
          </span>
        )}
        {/* INFO: Both kinds are editable — a photo crops and filters (§ 9.), a video trims (§ 12.1.'s trimmer, with no length cap here). */}
        <button
          className="absolute inset-x-0 bottom-0 flex h-6 cursor-pointer items-center justify-center rounded-b-sm bg-scrim/45 text-on-scrim transition-colors outline-none hover:bg-scrim/60 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
          type="button"
          aria-label={isVideo ? "영상 자르기" : "사진 편집"}
          onClick={() => onEdit(draft)}
        >
          {isVideo ? (
            <Scissors className="size-3.5" strokeWidth={1.75} />
          ) : (
            <Pencil className="size-3.5" strokeWidth={1.75} />
          )}
        </button>
      </>
    );
  }
}
