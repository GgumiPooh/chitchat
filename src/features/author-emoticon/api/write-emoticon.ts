import type { Emoticon, EmoticonPackSummary } from "@/entities/emoticon";
import { request } from "@/shared/api";
import { EMOTICON_ITEMS_PATH, EMOTICON_KEYWORDS_URL, EMOTICON_PACKS_PATH } from "@/shared/config";
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

/** REQUIREMENTS.md § 13.8.1. Which of Google's quotas refused, since a minute and a day are different advice. */
export type KeywordRateLimit = "minute" | "day";

/**
 * WARN: § 13.8.1. A typed error where the rest of this file throws the bare status,
 * because this is the one refusal a caller must **act** on rather than report: every
 * batch queued behind it would be a fresh request against the quota that just said
 * no. The route names which quota in the body, and the status alone cannot.
 */
export class KeywordRateLimitError extends Error {
  constructor(readonly rateLimit: KeywordRateLimit) {
    super(`429 ${rateLimit}`);
    this.name = "KeywordRateLimitError";
  }
}

/**
 * REQUIREMENTS.md § 13.8. Words the model would give these items, keyed by item id.
 *
 * WARN: Suggestions only — nothing is saved by asking. The caller puts them in the
 * field the user is already editing, and § 13.4.'s own write is what commits them.
 *
 * WARN: § 13.8.1. The one request in this app that leaves its origin, so it is the
 * one that names `credentials` — `fetch` defaults to `same-origin` and would send
 * the session cookie nowhere. Sharing `jeheecheon.com` makes the two same-**site**,
 * which is what stops `SameSite=Lax` refusing the cookie; it does nothing about SOP,
 * and the far route answers that with CORS.
 */
export async function suggestEmoticonKeywords(
  itemIds: string[],
): Promise<Record<string, string[]>> {
  const response = await request(EMOTICON_KEYWORDS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemIds }),
    credentials: "include",
  });

  if (response.status === 429) {
    const body = (await response.json().catch(() => null)) as Nullable<{ rateLimit?: unknown }>;

    throw new KeywordRateLimitError(body?.rateLimit === "day" ? "day" : "minute");
  }

  if (!response.ok) {
    throw new Error(String(response.status));
  }

  const { keywords } = (await response.json()) as { keywords: Record<string, string[]> };

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
