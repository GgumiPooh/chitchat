import "server-only";

import { pushToUser } from "@/entities/push-subscription";
import { apiError } from "@/shared/api";
import { geeknewsArticles, geeknewsSubscriptions, getDb, nextSnowflake } from "@/shared/db";
import { safelyRunAsync, type NewsArticleId } from "@/shared/lib";
import { eq } from "drizzle-orm";
import { after, NextResponse } from "next/server";
import crypto from "node:crypto";

type SlackAttachment = {
  title?: string;
  title_link?: string;
  text?: string;
  fallback?: string;
  ts?: number | string;
};

type DiscordEmbed = {
  title?: string;
  url?: string;
  description?: string;
  timestamp?: string;
};

type WebhookPayload = {
  attachments?: SlackAttachment[];
  embeds?: DiscordEmbed[];
  // Discord plain-text message format
  content?: string;
  timestamp?: string;
  title?: string;
  url?: string;
  geeknewsUrl?: string;
  summary?: string;
  publishedAt?: string | number | Date;
  geeknewsId?: string;
};

function extractTopicId(candidate: string): string | null {
  const match = candidate.match(/[?&]id=(\d+)/) ?? candidate.match(/\/topic\/(\d+)/);
  return match ? match[1] : null;
}

function stripHtmlAndCdata(text: string): string {
  return text
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/<[^>]*>?/gm, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function normalizeSourceUrl(rawUrl: string | null | undefined, geeknewsId: string): string | null {
  if (!rawUrl) {
    return null;
  }
  const trimmed = rawUrl.trim();
  if (
    trimmed.startsWith("topic?") ||
    trimmed.startsWith("/topic?") ||
    trimmed.includes("news.hada.io/topic?") ||
    trimmed === `https://news.hada.io/topic?id=${geeknewsId}`
  ) {
    return null;
  }
  if (trimmed.startsWith("/")) {
    return `https://news.hada.io${trimmed}`;
  }
  return trimmed;
}

type TopicDetails = {
  sourceUrl: string | null;
  summary: string | null;
  title: string | null;
};

async function fetchTopicDetails(geeknewsId: string): Promise<TopicDetails> {
  try {
    const res = await fetch(`https://news.hada.io/topic?id=${geeknewsId}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return { sourceUrl: null, summary: null, title: null };
    }
    const html = await res.text();

    const hrefMatch =
      html.match(/<a\s+[^>]*href=["']([^"']+)["'][^>]*class=["'][^"']*topic-title-link/i) ||
      html.match(/class=["'][^"']*topic-title-link[^"']*["'][^>]*href=["']([^"']+)["']/i);
    const sourceUrl = hrefMatch ? normalizeSourceUrl(hrefMatch[1], geeknewsId) : null;

    const titleTagMatch = html.match(
      /<a[^>]*class=["'][^"']*topic-title-link[^"']*["'][^>]*>([\s\S]*?)<\/a>/i,
    );
    const title = titleTagMatch ? stripHtmlAndCdata(titleTagMatch[1]) : null;

    let summary: string | null = null;
    const sectionMatch = html.match(
      /<section[^>]*id=["']topic_contents["'][^>]*>([\s\S]*?)<\/section>/i,
    );
    if (sectionMatch) {
      const ulMatch = sectionMatch[1].match(/<ul>([\s\S]*?)<\/ul>/i);
      if (ulMatch) {
        const items = [...ulMatch[1].matchAll(/<li>([\s\S]*?)<\/li>/gi)];
        if (items.length > 0) {
          summary = items.map((m) => `• ${stripHtmlAndCdata(m[1])}`).join("\n");
        }
      }
    }

    return { sourceUrl, summary, title };
  } catch {
    return { sourceUrl: null, summary: null, title: null };
  }
}

export async function POST(request: Request) {
  const secret = process.env.GEEKNEWS_WEBHOOK_SECRET;
  if (secret) {
    const token = new URL(request.url).searchParams.get("token");
    if (!token) {
      return apiError("unauthorized");
    }
    const tokenBuf = Buffer.from(token);
    const secretBuf = Buffer.from(secret);
    if (tokenBuf.length !== secretBuf.length || !crypto.timingSafeEqual(tokenBuf, secretBuf)) {
      return apiError("unauthorized");
    }
  } else if (process.env.NODE_ENV === "production") {
    return apiError("unauthorized");
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return apiError("invalid_request");
  }

  if (!rawBody || typeof rawBody !== "object") {
    return apiError("invalid_request");
  }

  const payload = rawBody as WebhookPayload;

  let title = "";
  let url = "";
  let geeknewsUrl = "";
  let summary = "";
  let publishedAt = new Date();
  let geeknewsId: string | null = null;

  if (payload.attachments && payload.attachments.length > 0) {
    // Slack webhook format
    const att = payload.attachments[0];
    title = att.title ?? "";
    url = att.title_link ?? "";
    geeknewsUrl = att.title_link ?? "";
    summary = att.text ?? att.fallback ?? "";
    if (att.ts) {
      publishedAt = new Date(typeof att.ts === "number" ? att.ts * 1000 : att.ts);
    }
  } else if (payload.embeds && payload.embeds.length > 0) {
    // Discord embed format
    const emb = payload.embeds[0];
    title = emb.title ?? "";
    url = emb.url ?? "";
    geeknewsUrl = emb.url ?? "";
    summary = emb.description ?? "";
    if (emb.timestamp) {
      publishedAt = new Date(emb.timestamp);
    }
  } else if (payload.content) {
    // Discord plain-text message format: **[title]** [<https://news.hada.io/topic?id=xxx>]
    const content = payload.content;
    const urlMatch = content.match(/https?:\/\/news\.hada\.io\/topic\?[^\s>"')]+/);
    if (urlMatch) {
      geeknewsUrl = urlMatch[0];
    }
    const boldBracketMatch = content.match(/\*\*\[([^\]]+)\]\*\*/);
    const boldMatch = content.match(/\*\*([^*\n[]+)\*\*/);
    title = boldBracketMatch ? boldBracketMatch[1].trim() : boldMatch ? boldMatch[1].trim() : "";
    if (payload.timestamp) {
      publishedAt = new Date(payload.timestamp);
    }
  } else {
    // Raw JSON format
    title = payload.title ?? "";
    url = payload.url ?? "";
    geeknewsUrl = payload.geeknewsUrl ?? payload.url ?? "";
    summary = payload.summary ?? "";
    if (payload.publishedAt) {
      publishedAt = new Date(payload.publishedAt);
    }
    if (payload.geeknewsId) {
      geeknewsId = payload.geeknewsId;
    }
  }

  if (isNaN(publishedAt.getTime())) {
    publishedAt = new Date();
  }

  if (!geeknewsId) {
    geeknewsId =
      extractTopicId(geeknewsUrl) ?? extractTopicId(url) ?? extractTopicId(summary) ?? null;
  }

  if (!geeknewsId) {
    return apiError("invalid_request");
  }

  title = stripHtmlAndCdata(title);
  summary = stripHtmlAndCdata(summary);

  const canonicalUrl = geeknewsUrl || `https://news.hada.io/topic?id=${geeknewsId}`;
  let sourceUrl: string | null = normalizeSourceUrl(
    url && url !== canonicalUrl ? url : null,
    geeknewsId,
  );
  if (!title || !sourceUrl || !summary || !summary.startsWith("•")) {
    const details = await fetchTopicDetails(geeknewsId);
    if (!title && details.title) {
      title = details.title;
    }
    if (!sourceUrl && details.sourceUrl) {
      sourceUrl = details.sourceUrl;
    }
    if ((!summary || !summary.startsWith("•")) && details.summary) {
      summary = details.summary;
    }
  }

  if (!title) {
    return apiError("invalid_request");
  }

  const db = getDb();
  const [article] = await db
    .insert(geeknewsArticles)
    .values({
      id: nextSnowflake<NewsArticleId>(),
      geeknewsId,
      title,
      url: canonicalUrl,
      sourceUrl,
      summary,
      publishedAt,
    })
    .onConflictDoUpdate({
      target: geeknewsArticles.geeknewsId,
      set: {
        title,
        url: canonicalUrl,
        sourceUrl,
        summary,
        publishedAt,
      },
    })
    .returning();

  const subscribers = await db
    .select({ userId: geeknewsSubscriptions.userId })
    .from(geeknewsSubscriptions)
    .where(eq(geeknewsSubscriptions.enabled, true));

  after(() =>
    safelyRunAsync(async () => {
      for (const subscriber of subscribers) {
        await pushToUser(subscriber.userId, {
          title: `[GeekNews] ${article.title}`,
          body: article.summary,
          url: `/playground/news?id=${article.id}`,
          tag: `geeknews-${article.id}`,
        });
      }
    }),
  );

  return NextResponse.json({ ok: true, id: article.id });
}
