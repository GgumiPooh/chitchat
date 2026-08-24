import "server-only";

import { getDb, linkPreviews } from "@/shared/db";
import { withoutFragment } from "@/shared/lib";
import { and, eq, gt, inArray, isNotNull, isNull, or } from "drizzle-orm";

/**
 * REQUIREMENTS.md § 8.9. The card images behind a set of links, keyed by the URL
 * without its fragment — what `DESIGN.md § 6.10.`'s quote draws as its tile.
 *
 * WARN: The cache only, never a scrape. `getLinkPreview` is a page-fetch on a miss,
 * and a page of quotes would pay it once per link before the room could render.
 */
export async function listLinkPreviewImages(urls: string[]): Promise<Map<string, string>> {
  const byUrl = new Map<string, string>();
  const targets = [...new Set(urls.map(withoutFragment))];

  if (targets.length === 0) {
    return byUrl;
  }

  const rows = await getDb()
    .select({ url: linkPreviews.url, imageUrl: linkPreviews.imageUrl })
    .from(linkPreviews)
    .where(
      and(
        inArray(linkPreviews.url, targets),
        eq(linkPreviews.status, "ok"),
        isNotNull(linkPreviews.imageUrl),
        // INFO: § 8.9. The same deadline `toLinkPreview` withholds a decayed thumbnail by, stated in SQL because this reads the cache without building a card.
        or(isNull(linkPreviews.imageExpiresAt), gt(linkPreviews.imageExpiresAt, new Date())),
      ),
    );

  for (const row of rows) {
    if (row.imageUrl) {
      byUrl.set(row.url, row.imageUrl);
    }
  }

  return byUrl;
}
