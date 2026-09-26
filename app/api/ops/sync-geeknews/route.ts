import "server-only";

import { syncBatchArticles, type IngestArticleInput } from "@/entities/geeknews";
import { pushToUser } from "@/entities/push-subscription";
import { apiError } from "@/shared/api";
import { geeknewsSubscriptions, getDb } from "@/shared/db";
import { isOpsCronConfigured, isOpsCronRequest } from "@/shared/ops";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Syncs a batch of GeekNews articles sent by `infra/geeknews-worker`.
 *
 * Authenticated via `Authorization: Bearer <OPS_CRON_TOKEN>`.
 */
export async function POST(request: Request) {
  if (!isOpsCronConfigured()) {
    return apiError("unavailable");
  }

  if (!isOpsCronRequest(request)) {
    return apiError("unauthorized");
  }

  let body: { articles?: IngestArticleInput[] };
  try {
    body = await request.json();
  } catch {
    return apiError("invalid_request");
  }

  if (!body || !Array.isArray(body.articles)) {
    return apiError("invalid_request");
  }

  const { inserted, isInitialBackfill } = await syncBatchArticles(body.articles);

  let pushesSent = 0;

  if (isInitialBackfill) {
    console.log(
      `[geeknews-sync] initial backfill of ${inserted.length} articles complete; pushes suppressed`,
    );
  } else if (inserted.length > 0) {
    const db = getDb();
    const subscribers = await db
      .select({ userId: geeknewsSubscriptions.userId })
      .from(geeknewsSubscriptions)
      .where(eq(geeknewsSubscriptions.enabled, true));

    if (subscribers.length > 0) {
      for (const article of inserted) {
        for (const subscriber of subscribers) {
          await pushToUser(subscriber.userId, {
            title: `[GeekNews] ${article.title}`,
            body: article.summary,
            url: `/playground/news?id=${article.id}`,
            tag: `geeknews-${article.id}`,
          });
          pushesSent += 1;
        }
      }
    }
  }

  console.log(
    `[geeknews-sync] ${inserted.length} inserted, ${pushesSent} push(es) sent over ${body.articles.length} items`,
  );

  return NextResponse.json({
    ok: true,
    inserted: inserted.length,
    sent: pushesSent,
    isInitialBackfill,
  });
}
