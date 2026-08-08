import type { Emoticon } from "@/entities/emoticon";
import { KEYWORD_SUGGESTION_BATCH } from "@/shared/config";
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
 * emoticons at a time.
 *
 * WARN: The chunking is the caller's, not the server's, and that is the whole design.
 * One request is provably one model call, so it cannot outrun the platform's
 * invocation limit — and the screen gets something true to say between chunks, which
 * a single long request can never provide. The route caps itself at the same number
 * so this cannot be bypassed by asking for more.
 *
 * WARN: Batches run in order and `onBatch` fires after each, so the grid fills in as
 * the run proceeds and the line beside it can state a fraction. § 13.8.1. departs
 * from § 13.4.'s countdown deliberately: every item is already on screen here, so the
 * total is settled before the first batch rather than growing under the progress.
 *
 * WARN: A batch that fails does not end the run. Suggestions are an assist over a
 * field the user can always type into, so one refused chunk costs those items their
 * words and nothing else — and pressing again retries exactly them, since the pack
 * screen only ever offers the items that still have none.
 *
 * WARN: A **quota** refusal is the one exception and does end it. Every batch behind
 * it would be another request against the limit that just refused this one, which
 * answers nothing and lengthens the wait. What was already filled stays filled.
 */
export async function fillEmoticonKeywords(
  items: Emoticon[],
  onBatch: (batch: KeywordFillBatch) => void,
): Promise<KeywordFillResult> {
  let filled = 0;
  let failed = 0;

  for (let start = 0; start < items.length; start += KEYWORD_SUGGESTION_BATCH) {
    const batch = items.slice(start, start + KEYWORD_SUGGESTION_BATCH);
    let saved: Emoticon[];

    try {
      saved = await fillBatch(batch);
    } catch (cause) {
      if (cause instanceof KeywordRateLimitError) {
        return { filled, failed, rateLimit: cause.rateLimit };
      }

      throw cause;
    }

    filled += saved.length;
    failed += batch.length - saved.length;

    onBatch({ saved, remaining: items.length - start - batch.length });
  }

  return { filled, failed };
}

/** INFO: The saves are parallel where the suggestion is not — they are ordinary writes, and `sort_order` is untouched by them. */
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
