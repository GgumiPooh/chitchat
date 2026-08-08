import type { Emoticon, EmoticonPackSummary } from "@/entities/emoticon";
import { request } from "@/shared/api";
import { EMOTICON_ITEMS_PATH, EMOTICON_KEYWORDS_PATH, EMOTICON_PACKS_PATH } from "@/shared/config";
import type { Maybe, Nullable } from "@/shared/lib";

export type CreateEmoticonBody = {
  imageKey: string;
  width: number;
  height: number;
  audioKey?: Maybe<string>;
  keywords?: string[];
};

/**
 * REQUIREMENTS.md § 13.4. An absent `audioKey` keeps the item's current sound;
 * `null` removes it.
 *
 * INFO: § 13.8. `keywords` is absent-or-whole for the same reason: an edit that
 * only replaces the image must leave the words the item answers to alone.
 */
export type UpdateEmoticonBody = {
  imageKey?: string;
  width?: number;
  height?: number;
  audioKey?: Nullable<string>;
  keywords?: string[];
};

/**
 * REQUIREMENTS.md § 13.8. Words the model would give these items, keyed by item id.
 *
 * WARN: Suggestions only — nothing is saved by asking. The caller puts them in the
 * field the user is already editing, and § 13.4.'s own write is what commits them.
 */
export async function suggestEmoticonKeywords(
  itemIds: string[],
): Promise<Record<string, string[]>> {
  const { keywords } = await send<{ keywords: Record<string, string[]> }>(
    EMOTICON_KEYWORDS_PATH,
    "POST",
    { itemIds },
  );

  return keywords;
}

export async function createEmoticonPack(name: string): Promise<EmoticonPackSummary> {
  const { pack } = await send<{ pack: EmoticonPackSummary }>(EMOTICON_PACKS_PATH, "POST", { name });

  return pack;
}

export async function createEmoticon(packId: string, body: CreateEmoticonBody): Promise<Emoticon> {
  const { emoticon } = await send<{ emoticon: Emoticon }>(
    `${EMOTICON_PACKS_PATH}/${packId}/items`,
    "POST",
    body,
  );

  return emoticon;
}

export async function updateEmoticon(itemId: string, body: UpdateEmoticonBody): Promise<Emoticon> {
  const { emoticon } = await send<{ emoticon: Emoticon }>(
    `${EMOTICON_ITEMS_PATH}/${itemId}`,
    "PATCH",
    body,
  );

  return emoticon;
}

export async function updateEmoticonPack(
  packId: string,
  body: { name?: string; thumbnailItemId?: Nullable<string> },
): Promise<void> {
  await send(`${EMOTICON_PACKS_PATH}/${packId}`, "PATCH", body);
}

export async function deleteEmoticonPack(packId: string): Promise<void> {
  await send(`${EMOTICON_PACKS_PATH}/${packId}`, "DELETE");
}

export async function deleteEmoticon(itemId: string): Promise<void> {
  await send(`${EMOTICON_ITEMS_PATH}/${itemId}`, "DELETE");
}

/**
 * WARN: Throws the response status as the message. `409` is the one the screens
 * branch on — REQUIREMENTS.md § 13.6. items that have been sent cannot be deleted,
 * and the user needs to be told that rather than shown a generic failure.
 */
async function send<T = void>(path: string, method: string, body?: unknown): Promise<T> {
  const response = await request(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(String(response.status));
  }

  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}
