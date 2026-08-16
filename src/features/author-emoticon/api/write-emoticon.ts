import type { Emoticon, EmoticonPackSummary } from "@/entities/emoticon";
import { request } from "@/shared/api";
import {
  EMOTICON_ITEMS_URL,
  EMOTICON_KEYWORDS_URL,
  EMOTICON_PACKS_URL,
  type EmoticonPackType,
} from "@/shared/config";
import type { EmoticonItemId, EmoticonPackId, Maybe, Nullable } from "@/shared/lib";

/** INFO: § 8.3. The box travels with the key, because new bytes are a new box — neither is editable on its own. */
export type EmoticonImageBody = {
  key: string;
  width: number;
  height: number;
};

/** INFO: The finished restructure. Either image alone is a whole emoticon; the route refuses a body carrying neither. */
export type CreateEmoticonBody = {
  still?: EmoticonImageBody;
  animated?: EmoticonImageBody;
  audioKey?: Maybe<string>;
  keywords?: string[];
};

/**
 * REQUIREMENTS.md § 13.4. An absent slot keeps what the item has; `null` empties
 * it, and the route refuses an edit that would leave the item with no image at all.
 *
 * INFO: § 13.8. `keywords` is absent-or-whole for the same reason: an edit that
 * only replaces an image must leave the words the item answers to alone.
 */
export type UpdateEmoticonBody = {
  still?: Nullable<EmoticonImageBody>;
  animated?: Nullable<EmoticonImageBody>;
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
 * WARN: § 13.8.1. Cross-origin, and the session rides on `request`'s own
 * `credentials: "include"` rather than on a line here — § 13.7.1. made every emoticon
 * call a candidate for leaving the origin, so naming it per caller was one more thing
 * to forget. Sharing `jeheecheon.com` makes the two same-**site**, which is what stops
 * `SameSite=Lax` refusing the cookie; it does nothing about SOP, and the far route
 * answers that with CORS.
 */
export async function suggestEmoticonKeywords(
  itemIds: EmoticonItemId[],
): Promise<Record<string, string[]>> {
  const response = await request(EMOTICON_KEYWORDS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemIds }),
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

// WARN: § 13. The kind is settled by this call and by nothing after it — the route refuses one in a PATCH body, so a pack created under the wrong kind can only be deleted.
export async function createEmoticonPack(
  name: string,
  type: EmoticonPackType,
): Promise<EmoticonPackSummary> {
  const { pack } = await send<{ pack: EmoticonPackSummary }>(EMOTICON_PACKS_URL, "POST", {
    name,
    type,
  });

  return pack;
}

export async function createEmoticon(
  packId: EmoticonPackId,
  body: CreateEmoticonBody,
): Promise<Emoticon> {
  const { emoticon } = await send<{ emoticon: Emoticon }>(
    `${EMOTICON_PACKS_URL}/${packId}/items`,
    "POST",
    body,
  );

  return emoticon;
}

export async function updateEmoticon(
  itemId: EmoticonItemId,
  body: UpdateEmoticonBody,
): Promise<Emoticon> {
  const { emoticon } = await send<{ emoticon: Emoticon }>(
    `${EMOTICON_ITEMS_URL}/${itemId}`,
    "PATCH",
    body,
  );

  return emoticon;
}

// WARN: § 13. `?type=` **selects** the pack and never sets it — the route answers 404 for a pack of the other kind, so a screen passing the wrong one edits nothing rather than the wrong thing.
export async function updateEmoticonPack(
  packId: EmoticonPackId,
  type: EmoticonPackType,
  body: { name?: string; thumbnailItemId?: Nullable<string> },
): Promise<void> {
  await send(`${EMOTICON_PACKS_URL}/${packId}?type=${type}`, "PATCH", body);
}

export async function deleteEmoticonPack(packId: EmoticonPackId): Promise<void> {
  await send(`${EMOTICON_PACKS_URL}/${packId}`, "DELETE");
}

export async function deleteEmoticon(itemId: EmoticonItemId): Promise<void> {
  await send(`${EMOTICON_ITEMS_URL}/${itemId}`, "DELETE");
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
