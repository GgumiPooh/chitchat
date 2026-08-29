import type { Emoticon } from "@/entities/emoticon";
import { KEYWORD_SUGGESTION_BATCH, KEYWORD_SUGGESTION_CONCURRENCY } from "@/shared/config";
import { mapPooled } from "@/shared/lib";
import {
  KeywordRateLimitError,
  suggestEmoticonKeywords,
  updateEmoticon,
  type KeywordRateLimit,
} from "../api/write-emoticon";

export type KeywordFillBatch = {
  /** The items this batch saved, ready to be folded back into the screen's list. */
  saved: Emoticon[];
  /** How many items are still waiting, which the progress line subtracts from the total it settled on before the run (REQUIREMENTS.md § 13.8.1.). */
  remaining: number;
};

export type KeywordFillResult = {
  filled: number;
  /** Items the run reached but could not describe or could not save. */
  failed: number;
  /** REQUIREMENTS.md § 13.8.1. Set when a quota ended the run early; the items it never reached are untouched. */
  rateLimit?: KeywordRateLimit;
};

/**
 * REQUIREMENTS.md § 13.8.1. Fills a pack's search keywords, `KEYWORD_SUGGESTION_BATCH`
 * emoticons per request and `KEYWORD_SUGGESTION_CONCURRENCY` requests at a time.
 *
 * WARN: The chunking is the caller's, not the server's, and that is the whole design.
 * One request is provably one model call, so it cannot outrun the platform's
 * invocation limit — and the screen gets something true to say between chunks, which
 * a single long request can never provide. The route caps itself independently at its
 * own ceiling, and `KEYWORD_SUGGESTION_BATCH` is clamped to a copy of that number
 * so a misconfigured value degrades to the ceiling instead of failing every chunk.
 *
 * WARN: The chunks are pooled rather than sequential, and what bounds the width is
 * Google's per-minute quota rather than anything here — `KEYWORD_SUGGESTION_CONCURRENCY`
 * carries that argument. Widening it inside a run that already exceeds the quota
 * only reaches the refusal sooner.
 *
 * WARN: `onBatch` therefore fires **out of order**, so its `remaining` counts what
 * has settled rather than what lies behind a cursor. Derived from a chunk's position
 * it would run backwards the moment a later chunk answered first, and the screen
 * subtracts it from a fixed total. § 13.8.1. departs from § 13.4.'s countdown
 * deliberately: every item is already on screen here, so the total is settled before
 * the first chunk rather than growing under the progress.
 *
 * WARN: A batch that fails does not end the run. Suggestions are an assist over a
 * field the user can always type into, so one refused chunk costs those items their
 * words and nothing else — and pressing again retries exactly them, since the pack
 * screen only ever offers the items that still have none.
 *
 * WARN: A **quota** refusal is the one exception and does end it, which is why
 * `fillBatch` is written to reject on that alone: `mapPooled` stops launching at the
 * first rejection, so nothing new is sent against a limit that has already refused.
 * Chunks already in flight are still awaited, and what they fill stays filled.
 */
export async function fillEmoticonKeywords(
  items: Emoticon[],
  onBatch: (batch: KeywordFillBatch) => void,
): Promise<KeywordFillResult> {
  const chunks: Emoticon[][] = [];

  for (let start = 0; start < items.length; start += KEYWORD_SUGGESTION_BATCH) {
    chunks.push(items.slice(start, start + KEYWORD_SUGGESTION_BATCH));
  }

  let filled = 0;
  let failed = 0;
  let settled = 0;

  try {
    await mapPooled(
      chunks,
      async (chunk) => {
        const saved = await fillBatch(chunk);

        filled += saved.length;
        failed += chunk.length - saved.length;
        settled += chunk.length;

        onBatch({ saved, remaining: items.length - settled });
      },
      { limit: KEYWORD_SUGGESTION_CONCURRENCY },
    );
  } catch (cause) {
    if (cause instanceof KeywordRateLimitError) {
      return { filled, failed, rateLimit: cause.rateLimit };
    }

    throw cause;
  }

  return { filled, failed };
}

/** INFO: The writes inside a chunk are unbounded where the suggestion feeding them is pooled — they answer to no quota, and `sort_order` is untouched by them. */
async function fillBatch(batch: Emoticon[]): Promise<Emoticon[]> {
  // WARN: § 13.8.1. Everything is swallowed except the quota refusal, which the caller has to act on — `fillEmoticonKeywords` stops the run on it rather than queueing more requests against a limit that has already said no.
  const suggested = await suggestEmoticonKeywords(batch.map((item) => item.id)).catch(
    (cause: unknown) => {
      if (cause instanceof KeywordRateLimitError) {
        throw cause;
      }

      return null;
    },
  );

  if (!suggested) {
    return [];
  }

  const writes = await Promise.allSettled(
    batch.flatMap((item) => {
      const keywords = suggested[item.id];

      // INFO: An item the model had nothing for is left alone rather than written back as the empty list it already holds.
      return keywords?.length ? [updateEmoticon(item.id, { keywords })] : [];
    }),
  );

  return writes.filter((write) => write.status === "fulfilled").map((write) => write.value);
}
