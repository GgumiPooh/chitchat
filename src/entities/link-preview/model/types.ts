import type { LinkPreviewKind } from "@/shared/db";
import type { Nullable } from "@/shared/lib";

/**
 * REQUIREMENTS.md § 8.9. One link's card as it crosses `/api/link-preview`. A page
 * that published neither a title nor an image resolves to `null` instead of this —
 * a card with nothing on it is worse than no card.
 */
export type LinkPreview = {
  url: string;
  kind: LinkPreviewKind;
  title: Nullable<string>;
  description: Nullable<string>;
  // WARN: A third-party URL rendered directly by the browser, not a `/api/media` route (§ 9.).
  imageUrl: Nullable<string>;
  siteName: Nullable<string>;
};
