/**
 * Fetches GeekNews curated front page (https://news.hada.io/) every five minutes,
 * parses the 20 curated/upvoted articles, and delivers them in a single batch
 * to the app via POST /api/ops/sync-geeknews.
 */

const DEFAULT_ORIGIN = "https://jandh.jeheecheon.com";
const CURATED_NEWS_URL = "https://news.hada.io/";
const SYNC_PATH = "/api/ops/sync-geeknews";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const handler = {
  async scheduled(event, env, context) {
    context.waitUntil(syncGeeknews(env));
  },

  // INFO: No HTTP surface on purpose — the route it calls is already the one to call by hand. Use `wrangler dev --test-scheduled` and `/__scheduled` locally.
  fetch() {
    return new Response("scheduled only", { status: 405 });
  },
};

export default handler;

function stripHtmlAndCdata(text) {
  return text
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/<[^>]*>?/gm, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCuratedPage(html) {
  const articles = [];
  const rowRegex =
    /<div class=['"]topic_row['"]([\s\S]*?)(?=<div class=['"]topic_row['"]|<div class=['"]next commentTD['"]|<\/article>|$)/g;
  let match;

  while ((match = rowRegex.exec(html)) !== null) {
    const block = match[1];
    const idMatch = block.match(/data-topic-state-id=['"](\d+)['"]/);
    const geeknewsId = idMatch ? idMatch[1] : null;

    const titleMatch = block.match(
      /<h2[^>]*class=['"][^'"]*topic-title-heading[^'"]*['"][^>]*>([\s\S]*?)<\/h2>/i,
    );
    const title = stripHtmlAndCdata(titleMatch ? titleMatch[1] : "");

    const linkMatch =
      block.match(/<a\s+[^>]*href=['"]([^'"]+)['"][^>]*class=['"][^'"]*topic-title-link/i) ||
      block.match(
        /<a\s+[^>]*class=['"][^'"]*topic-title-link[^'"]*['"][^>]*href=['"]([^'"]+)['"]/i,
      );
    let rawUrl = (linkMatch && linkMatch[1] ? linkMatch[1] : "").trim();
    if (rawUrl.startsWith("/")) {
      rawUrl = `https://news.hada.io${rawUrl}`;
    }

    const descMatch = block.match(/<div class=['"]topicdesc['"]>([\s\S]*?)<\/div>/i);
    const summary = stripHtmlAndCdata(descMatch ? descMatch[1] : "");

    const timeMatch = block.match(/<time[^>]*datetime=['"]([^'"]+)['"]/i);
    const publishedAt = timeMatch ? new Date(timeMatch[1]).toISOString() : new Date().toISOString();

    const geeknewsUrl = `https://news.hada.io/topic?id=${geeknewsId}`;
    const sourceUrl = normalizeSourceUrl(rawUrl, geeknewsId);

    if (geeknewsId && title) {
      articles.push({
        geeknewsId,
        title,
        url: geeknewsUrl,
        sourceUrl,
        summary,
        publishedAt,
      });
    }
  }

  return articles;
}

function normalizeSourceUrl(rawUrl, geeknewsId) {
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

async function syncGeeknews(env) {
  if (!env.OPS_CRON_TOKEN) {
    console.error(
      "[geeknews] no OPS_CRON_TOKEN — set a secret to deploy, or .dev.vars to run locally",
    );
    return;
  }

  let html = "";
  try {
    const res = await fetch(CURATED_NEWS_URL, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });
    if (!res.ok) {
      console.error(`[geeknews] page answered status ${res.status}`);
      return;
    }
    html = await res.text();
  } catch (error) {
    console.error("[geeknews] page fetch failed:", error);
    return;
  }

  const articles = parseCuratedPage(html);
  if (articles.length === 0) {
    console.warn("[geeknews] no articles parsed from curated page");
    return;
  }

  const origin = env.APP_ORIGIN?.trim().replace(/\/$/, "") || DEFAULT_ORIGIN;
  const response = await fetch(`${origin}${SYNC_PATH}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPS_CRON_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "chitchat-geeknews-worker",
    },
    body: JSON.stringify({ articles }),
  });

  if (!response.ok) {
    console.error(
      `[geeknews] ${SYNC_PATH} answered ${response.status}`,
      await response.text().catch(() => ""),
    );
    return;
  }

  const report = await response.json();
  console.log(
    `[geeknews] sync complete: ${report.inserted} inserted, ${report.sent} push(es) sent over ${articles.length} fetched`,
  );
}
