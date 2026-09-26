/**
 * Fetches GeekNews Atom feed every five minutes, parses the articles,
 * and delivers them in a single batch to the app via POST /api/ops/sync-geeknews.
 */

const DEFAULT_ORIGIN = "https://jandh.jeheecheon.com";
const FEED_URL = "https://news.hada.io/rss/news";
const SYNC_PATH = "/api/ops/sync-geeknews";

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

function parseFeed(xml) {
  const articles = [];
  const regex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;

  while ((match = regex.exec(xml)) !== null) {
    const block = match[1];
    const idMatch = block.match(/<id>(?:https:\/\/news\.hada\.io\/topic\?id=)?(\d+)<\/id>/);
    const geeknewsId = idMatch ? idMatch[1] : null;
    const titleRaw = block.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "";
    const publishedRaw = block.match(/<published>([\s\S]*?)<\/published>/)?.[1] || "";
    const contentRaw = block.match(/<content[^>]*>([\s\S]*?)<\/content>/)?.[1] || "";

    const title = stripHtmlAndCdata(titleRaw);
    const summary = stripHtmlAndCdata(contentRaw);
    const geeknewsUrl = `https://news.hada.io/topic?id=${geeknewsId}`;

    if (geeknewsId && title) {
      articles.push({
        geeknewsId,
        title,
        url: geeknewsUrl,
        geeknewsUrl,
        summary,
        publishedAt: new Date(publishedRaw).toISOString(),
      });
    }
  }

  return articles;
}

async function syncGeeknews(env) {
  if (!env.OPS_CRON_TOKEN) {
    console.error(
      "[geeknews] no OPS_CRON_TOKEN — set a secret to deploy, or .dev.vars to run locally",
    );
    return;
  }

  let feedText = "";
  try {
    const feedRes = await fetch(FEED_URL, {
      headers: { "User-Agent": "chitchat-geeknews-worker/1.0" },
    });
    if (!feedRes.ok) {
      console.error(`[geeknews] feed answered status ${feedRes.status}`);
      return;
    }
    feedText = await feedRes.text();
  } catch (error) {
    console.error("[geeknews] feed fetch failed:", error);
    return;
  }

  const articles = parseFeed(feedText);
  if (articles.length === 0) {
    console.warn("[geeknews] no articles parsed from feed");
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
