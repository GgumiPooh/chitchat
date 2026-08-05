import type { Emoticon, EmoticonPackSummary } from "@/entities/emoticon";
import { EMOTICON_ITEMS_PATH, EMOTICON_PACKS_PATH } from "@/shared/config";
import type { Maybe, Nullable } from "@/shared/lib";

export type CreateEmoticonBody = {
  stillKey: string;
  width: number;
  height: number;
  animatedKey?: Maybe<string>;
  audioKey?: Maybe<string>;
};

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

/** REQUIREMENTS.md § 13.1. The whole ordered list — `sort_order` is positional, and it is shared by both users rather than per-user. */
export async function saveEmoticonOrder(packId: string, itemIds: string[]): Promise<void> {
  await send(`${EMOTICON_PACKS_PATH}/${packId}/items`, "PUT", { itemIds });
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
  const response = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(String(response.status));
  }

  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}
