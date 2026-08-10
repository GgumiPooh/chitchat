import type { Nullable } from "@/shared/lib";

/**
 * What a voice message carries beyond an ordinary attachment: the precomputed
 * waveform the bubble is drawn from, since the file itself is not decoded to draw
 * it (REQUIREMENTS.md § 8.3. — the row's height has to be known before anything
 * loads).
 */
export type VoiceTrack = {
  /** `0`–`1`, a fixed number of them per clip. The count is the recorder's, and the player draws however many it is given. */
  peaks: number[];
};

/**
 * One attachment as the grid and the viewer render it — a stored `media` row, a
 * draft still uploading, or a library tile.
 *
 * WARN: Lives in `shared/ui` rather than beside either caller. `widgets/chat-room`
 * and `widgets/archive-shelves` both render it and a widget cannot import a sibling
 * widget (REQUIREMENTS.md § 2.), so this and `MediaViewer` are what the two share.
 */
export type MediaCell = {
  /** What the tile shows — the stored thumbnail, or the draft's local preview. Null for a file attachment (REQUIREMENTS.md § 9.1.), which has neither. */
  previewUrl: Nullable<string>;
  /**
   * REQUIREMENTS.md § 9. The row's stored hash, which is what the box is painted
   * with while `previewUrl` loads. It describes the thumbnail and nothing else, so it
   * stands in for the same image every reader of this cell draws.
   *
   * WARN: Null is ordinary rather than absent data, and DESIGN.md § 7.8.'s skeleton
   * is what fills the box wherever it is. A file attachment and a recording have no
   * thumbnail to describe (§ 9.1., § 9.3.), a row registered before the column existed
   * carries none, and `toCellsFromDrafts` withholds the one a draft holds.
   */
  blurhash: Nullable<string>;
  // INFO: Null while the attachment is still a local draft. The viewer needs the full-size object, which does not exist until the upload is registered.
  originalUrl: Nullable<string>;
  /** The same object as `originalUrl`, signed to save rather than to display. */
  downloadUrl: Nullable<string>;
  width: number;
  height: number;
  durationMs: Nullable<number>;
  isVideo: boolean;
  /**
   * REQUIREMENTS.md § 9.1. The name a file attachment carries, and the flag that
   * says it is one — `null` for a photo or a video.
   *
   * WARN: A cell with a filename is never handed to `MediaViewer`. It has no
   * thumbnail, no original to display and no box; § 6. keeps a bubble's cells all
   * of one kind so the two never meet in one track.
   */
  filename: Nullable<string>;
  /** § 9.1. The stored byte count, which is all the file card can say about what it cannot draw. */
  sizeBytes: number;
  /**
   * Set on a voice message, and the flag that says it is one — the same job
   * `filename` does for a file attachment. A bubble carrying one carries nothing
   * else (§ 6.), so the first cell decides the whole bubble's layout.
   *
   * TODO: Optional until the § 9. read path carries peaks; `toCellsFromMedia` and
   * `toCellsFromDrafts` are what fill it once the column exists.
   */
  voice?: Nullable<VoiceTrack>;
  /**
   * REQUIREMENTS.md § 10. The message this attachment was sent in, which the
   * viewer's top-right jump travels to.
   *
   * INFO: Left unset by a bubble's own cells, which is the state the viewer opens in before § 8.1.'s conversation-wide track replaces them — the reader is on that message either way, so nothing is lost in the gap.
   */
  messageId?: Nullable<number>;
  /**
   * DESIGN.md § 7.10. When the slide was sent, for the viewer's caption.
   *
   * INFO: An ISO string rather than a formatted one. The viewer is the only reader and it formats to Korean itself, so a preformatted value would be one more thing for a caller to get wrong.
   */
  sentAt?: Nullable<string>;
  /** DESIGN.md § 7.10. Who sent the slide, shown above the caption. Unset where the viewer has no sender to name — a draft, or a profile photo (§ 7.7.). */
  senderName?: Nullable<string>;
  id: string;
};
