import type { MediaNoun } from "@/shared/config";
import type { MediaId, MessageId, Nullable, Optional } from "@/shared/lib";

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
  /**
   * The finished restructure. The asset's own box, and null wherever there is none — a
   * file card and a voice player are drawn at a fixed height instead.
   *
   * WARN: `0` was what a boxless cell used to carry, which is why every reader of
   * these had to test `filename` and `voice` first. A null is the same fact stated
   * where the compiler can see it; do not restore a `?? 0`, which puts the trap back
   * one layer down.
   */
  width: Nullable<number>;
  height: Nullable<number>;
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
  messageId?: Nullable<MessageId>;
  /**
   * DESIGN.md § 7.10. When the slide was sent, for the viewer's caption.
   *
   * INFO: An ISO string rather than a formatted one. The viewer is the only reader and it formats to Korean itself, so a preformatted value would be one more thing for a caller to get wrong.
   */
  sentAt?: Nullable<string>;
  /** DESIGN.md § 7.10. Who sent the slide, shown above the caption. Unset where the viewer has no sender to name — a draft, or a profile photo (§ 7.7.). */
  senderName?: Nullable<string>;
  /**
   * The finished restructure. The uploader has deleted the object, so the cell is a
   * tombstone rather than a picture — `MediaTombstone`, keeping the box.
   *
   * WARN: § 4.3. It keeps its place, exactly as REQUIREMENTS.md § 8.13.'s withdrawn
   * message does. A bubble of three with one deleted draws two tiles and a tombstone;
   * dropping the cell instead would silently rewrite what the other participant
   * remembers seeing.
   *
   * WARN: The geometry above survives the delete on purpose, so the tombstone fills the box the photo did and § 8.3.'s virtualized list re-measures nothing.
   */
  isDeleted: boolean;
  /** REQUIREMENTS.md § 16.1. 나에게만 보내기 — drives the viewer's `나에게 보낸 사진`/`나에게 보낸 동영상` label. Unset wherever a cell carries no sender to have set it (a draft, a profile photo). */
  onlyMe?: boolean;
  /**
   * WARN: A `media` id for every cell built from a stored row, and a **local draft
   * id** for one `toCellsFromDrafts` built (REQUIREMENTS.md § 8.5.). A draft cell
   * carries no `originalUrl` and reaches no id-taking endpoint, which is what makes
   * the shared brand safe here — anything added that sends this id to the server has
   * to exclude draft cells first.
   */
  id: MediaId;
};

/**
 * What a deleted cell was, for `MediaTombstone`'s copy and for anything else that
 * has to name an attachment it cannot draw.
 *
 * INFO: Derived from the cell rather than taken from `toMediaNoun`, which reads a `mime` a cell does not carry — `isVideo` is the same answer already resolved.
 */
export function toCellNoun(cell: MediaCell): MediaNoun {
  if (cell.voice) {
    return "voice";
  }

  if (cell.filename) {
    return "file";
  }

  return cell.isVideo ? "video" : "photo";
}

/**
 * The shape a cell is drawn at, for `aspect-ratio` and `blurhashRatio` alike, and
 * `undefined` for a cell with no box (`MediaCell.width`).
 *
 * INFO: Both readers already take the absence: the CSS property drops out, and `PreloadImage` decodes the hash square — which is what a cell that reserves no box of its own wants from them.
 */
export function toCellRatio({ width, height }: MediaCell): Optional<number> {
  return width === null || height === null ? undefined : width / height;
}
