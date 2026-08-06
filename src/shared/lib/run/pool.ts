export type PoolOptions<T> = {
  /** How many tasks may be in flight at once. */
  limit: number;
  /**
   * A ceiling on the bytes in flight, in addition to `limit`.
   *
   * INFO: REQUIREMENTS.md § 13.4. What lets one pool serve every upload path — an 8MB emoticon runs `limit` wide while a 500MB video (§ 9.) takes the whole budget and is effectively alone.
   */
  byteBudget?: number;
  /** What `byteBudget` counts. Omitted, the budget is not applied. */
  weigh?: (item: T, index: number) => number;
};

/**
 * Runs `run` over `items` with at most `limit` in flight, answering the results in
 * **input order** regardless of the order they settled in.
 *
 * WARN: The first rejection stops the queue — nothing further is launched — and it
 * is rethrown once the tasks already in flight have settled, so a caller that
 * records progress per task still sees each one that landed. No results array comes
 * back in that case; a caller that needs the partial set must resolve its own
 * failures, as the upload paths do.
 */
export async function mapPooled<T, R>(
  items: readonly T[],
  run: (item: T, index: number) => Promise<R>,
  { limit, byteBudget = Number.POSITIVE_INFINITY, weigh }: PoolOptions<T>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const running = new Set<Promise<void>>();
  let hasFailed = false;
  let failure: unknown;
  let inFlightBytes = 0;

  for (const [index, item] of items.entries()) {
    const weight = weigh?.(item, index) ?? 0;

    // WARN: The `running.size > 0` term is what admits an item heavier than the whole budget. Without it a single 500MB video would wait for room that can never open and the upload would hang forever.
    while (
      !hasFailed &&
      (running.size >= limit || (running.size > 0 && inFlightBytes + weight > byteBudget))
    ) {
      await Promise.race(running);
    }

    // WARN: The queue stops at the first rejection, as the `for…of` loops this replaced did. Without it a bubble whose first upload fails would still push its remaining eight attachments — minutes and hundreds of megabytes on a phone — before the failure ever reaches the user.
    if (hasFailed) {
      break;
    }

    inFlightBytes += weight;

    const task = run(item, index)
      .then((result) => {
        results[index] = result;
      })
      .catch((error: unknown) => {
        if (hasFailed) {
          return;
        }

        hasFailed = true;
        failure = error;
      })
      .finally(() => {
        inFlightBytes -= weight;
        running.delete(task);
      });

    running.add(task);
  }

  await Promise.all(running);

  if (hasFailed) {
    throw failure;
  }

  return results;
}
