import "server-only";

import {
  LINK_PREVIEW_FAILURE_TTL,
  LINK_PREVIEW_TTL,
  MAX_LINK_PREVIEW_URL_LENGTH,
} from "@/shared/config";
import { getDb, linkPreviews, type LinkPreviewRow, type LinkPreviewStatus } from "@/shared/db";
import { isHttpUrl, safelyGetAsync, type Maybe, type Nullable } from "@/shared/lib";
import { eq } from "drizzle-orm";
import type { PageMetadata } from "../model/parse-metadata";
import type { LinkPreview } from "../model/types";
import { fetchMetadata } from "./fetch-metadata";

/**
 * REQUIREMENTS.md § 8.9. The card behind one URL: the cached row while it is fresh,
 * a scrape otherwise. Returns `null` for a page that describes itself with nothing —
 * the bubble then renders as it did before previews existed.
 *
 * WARN: A scrape failure is written to the cache as one. Without that row, a link
 * to a host that is down costs a timeout every time the bubble scrolls back on.
 */
export async function getLinkPreview(url: string): Promise<Nullable<LinkPreview>> {
  const normalized = normalizeUrl(url);

  if (!normalized) {
    return null;
  }

  const cached = await readCached(normalized);

  if (cached && isFresh(cached)) {
    return toLinkPreview(cached);
  }

  // WARN: `undefined` (the scrape threw) and `null` (it read the page and there was nothing) are kept apart all the way to `statusOf` — collapsing them is what turns a PDF link or a page behind a login into an outbound request every hour forever.
  const scraped = await safelyGetAsync(() => fetchMetadata(normalized));
  const stored = await store(normalized, scraped);

  // INFO: Only a *failed* refetch falls back to the row it could not replace — a page that has dropped its tags since is `empty`, and answering it with yesterday's card would keep a stale one alive for as long as the link keeps being scrolled past.
  return stored.status === "failed" && cached ? toLinkPreview(cached) : toLinkPreview(stored);
}

function normalizeUrl(url: string): Nullable<string> {
  const trimmed = url.trim();

  if (!isHttpUrl(trimmed)) {
    return null;
  }

  const parsed = new URL(trimmed);
  // INFO: The fragment never reaches the server, so two links differing only in it describe the same page and share one cache row.
  parsed.hash = "";
  const normalized = parsed.toString();

  return normalized.length <= MAX_LINK_PREVIEW_URL_LENGTH ? normalized : null;
}

async function readCached(url: string): Promise<Nullable<LinkPreviewRow>> {
  const [row] = await getDb().select().from(linkPreviews).where(eq(linkPreviews.url, url)).limit(1);

  return row ?? null;
}

function isFresh(row: LinkPreviewRow): boolean {
  const ttl = row.status === "failed" ? LINK_PREVIEW_FAILURE_TTL : LINK_PREVIEW_TTL;

  return Date.now() - row.fetchedAt.getTime() < ttl;
}

async function store(url: string, scraped: Maybe<PageMetadata>): Promise<LinkPreviewRow> {
  const metadata = scraped ?? null;
  const values = {
    url,
    status: statusOf(scraped),
    kind: metadata?.kind ?? ("link" as const),
    title: metadata?.title ?? null,
    description: metadata?.description ?? null,
    imageUrl: metadata?.imageUrl ?? null,
    siteName: metadata?.siteName ?? null,
    fetchedAt: new Date(),
  };

  const [row] = await getDb()
    .insert(linkPreviews)
    .values(values)
    .onConflictDoUpdate({ target: linkPreviews.url, set: values })
    .returning();

  return row;
}

/**
 * REQUIREMENTS.md § 8.9. `empty` is "we read the situation and there is no card" —
 * a page with no tags, but equally a PDF, a 404, or a host the § 14. guard refused.
 * `failed` is the scrape that threw, and it alone earns the short retry window,
 * because it alone might answer differently in an hour.
 */
function statusOf(scraped: Maybe<PageMetadata>): LinkPreviewStatus {
  if (scraped === undefined) {
    return "failed";
  }

  return scraped?.title || scraped?.imageUrl ? "ok" : "empty";
}

function toLinkPreview(row: LinkPreviewRow): Nullable<LinkPreview> {
  if (row.status !== "ok") {
    return null;
  }

  return {
    url: row.url,
    kind: row.kind,
    title: row.title,
    description: row.description,
    imageUrl: row.imageUrl,
    siteName: row.siteName,
  };
}
