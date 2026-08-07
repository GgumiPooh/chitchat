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
import { readSignedUrlExpiry } from "../model/signed-url-expiry";
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
  const imageUrl = metadata?.imageUrl ?? null;
  const fetchedAt = new Date();
  const values = {
    url,
    status: statusOf(scraped),
    kind: metadata?.kind ?? ("link" as const),
    title: metadata?.title ?? null,
    description: metadata?.description ?? null,
    imageUrl,
    imageExpiresAt: readImageExpiry(imageUrl, fetchedAt),
    siteName: metadata?.siteName ?? null,
    fetchedAt,
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

/**
 * REQUIREMENTS.md § 8.9. Only an expiry the scrape itself outran is kept. A live page
 * hands out a signature that is good now, so one that already passed is far more
 * likely a parameter named `expires` that means something else entirely — and reading
 * it as a deadline would withhold a working tile forever, where ignoring it leaves
 * exactly the broken frame we already had.
 */
function readImageExpiry(imageUrl: Nullable<string>, fetchedAt: Date): Nullable<Date> {
  const expiry = readSignedUrlExpiry(imageUrl);

  return expiry && expiry.getTime() > fetchedAt.getTime() ? expiry : null;
}

function toLinkPreview(row: LinkPreviewRow): Nullable<LinkPreview> {
  if (row.status !== "ok") {
    return null;
  }

  // INFO: REQUIREMENTS.md § 8.9. The signature dies long before the row does, and a card that decays into a broken frame is worse than one that was always text.
  const imageUrl = isImageLive(row) ? row.imageUrl : null;

  // INFO: The `statusOf` rule applied a second time — what made the row a card was a title or an image, and withholding the image can take the last of them away.
  if (!row.title && !imageUrl) {
    return null;
  }

  return {
    url: row.url,
    kind: row.kind,
    title: row.title,
    description: row.description,
    imageUrl,
    siteName: row.siteName,
  };
}

function isImageLive(row: LinkPreviewRow): boolean {
  return !row.imageExpiresAt || row.imageExpiresAt.getTime() > Date.now();
}
