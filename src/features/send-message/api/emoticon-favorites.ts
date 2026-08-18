import type { Emoticon } from "@/entities/emoticon";
import { request } from "@/shared/api";
import { EMOTICON_FAVORITES_URL } from "@/shared/config";
import type { EmoticonItemId } from "@/shared/lib";

export async function fetchUserEmoticonFavorites(): Promise<Emoticon[]> {
  const response = await request(EMOTICON_FAVORITES_URL);

  if (!response.ok) {
    throw new Error(`GET ${EMOTICON_FAVORITES_URL} responded ${response.status}`);
  }

  return (await response.json()) as Emoticon[];
}

export async function addEmoticonFavoriteRequest(itemId: EmoticonItemId): Promise<void> {
  const response = await request(EMOTICON_FAVORITES_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemId }),
  });

  if (!response.ok) {
    throw new Error(`POST ${EMOTICON_FAVORITES_URL} responded ${response.status}`);
  }
}

export async function removeEmoticonFavoriteRequest(itemId: EmoticonItemId): Promise<void> {
  const url = `${EMOTICON_FAVORITES_URL}/${itemId}`;
  const response = await request(url, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(`DELETE ${url} responded ${response.status}`);
  }
}
