import type { Nullable } from "@/shared/lib";

/**
 * One attachment as the grid and the viewer render it — a stored `media` row, a
 * draft still uploading, or a gallery tile.
 *
 * WARN: Lives in `shared/ui` rather than beside either caller. `widgets/chat-room`
 * and `widgets/gallery-grid` both render it and a widget cannot import a sibling
 * widget (REQUIREMENTS.md § 2.), so this and `MediaViewer` are what the two share.
 */
export type MediaCell = {
  /** What the tile shows — the stored thumbnail, or the draft's local preview. */
  previewUrl: string;
  // INFO: Null while the attachment is still a local draft. The viewer needs the full-size object, which does not exist until the upload is registered.
  originalUrl: Nullable<string>;
  /** The same object as `originalUrl`, signed to save rather than to display. */
  downloadUrl: Nullable<string>;
  width: number;
  height: number;
  durationMs: Nullable<number>;
  isVideo: boolean;
  id: string;
};
