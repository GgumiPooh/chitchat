import { extensionForMime } from "@/shared/config";
import type { MediaId } from "@/shared/lib";
import { request } from "./request";

/**
 * Fetches the object `url` answers and reads it back as a `File`, named from
 * `mediaId` and the mime the response carries.
 *
 * WARN: `fallbackMime` stands in only where the response's own `Content-Type` is
 * blank — never overrides it, since the fetched bytes are what get named and typed.
 */
export async function readMediaFile(
  url: string,
  mediaId: MediaId,
  fallbackMime?: string,
): Promise<File> {
  const response = await request(url);

  if (!response.ok) {
    throw new Error(`GET ${url} responded ${response.status}`);
  }

  const blob = await response.blob();
  const mime = blob.type || fallbackMime || blob.type;

  return new File([blob], `${mediaId}.${extensionForMime(mime)}`, { type: mime });
}
