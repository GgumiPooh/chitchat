import type { LinkPreview } from "@/entities/link-preview";
import { LINK_PREVIEW_PATH } from "@/shared/config";
import type { Nullable } from "@/shared/lib";

export async function fetchLinkPreview(url: string): Promise<Nullable<LinkPreview>> {
  const response = await fetch(`${LINK_PREVIEW_PATH}?url=${encodeURIComponent(url)}`);

  if (!response.ok) {
    throw new Error(`GET ${LINK_PREVIEW_PATH} responded ${response.status}`);
  }

  const { preview } = (await response.json()) as { preview: Nullable<LinkPreview> };

  return preview;
}
