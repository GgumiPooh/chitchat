/**
 * Fetches GeekNews articles and delivers them in a single batch
 * to the app via POST /api/ops/sync-geeknews.
 *
 * Ingestion sources (prioritized):
 * 1. Discord Channel REST API (if DISCORD_BOT_TOKEN & DISCORD_CHANNEL_ID are set)
 *    Reads the exact messages posted by the GeekNews bot in your Discord server.
 * 2. GeekNews GN⁺ curated feed (https://news.hada.io/plus) HTML scraping fallback.
 */

const DEFAULT_ORIGIN = "https://jandh.jeheecheon.com";
const CURATED_NEWS_URL = "https://news.hada.io/plus";
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

function parseDiscordMessages(messages) {
  const articles = [];
  for (const msg of messages) {
    if (!msg) {
      continue;
    }
    let title = "";
    let geeknewsUrl = "";
    let geeknewsId = null;
    let summary = "";
    let publishedAt = msg.timestamp || new Date().toISOString();

    if (msg.embeds && msg.embeds.length > 0) {
      const emb = msg.embeds[0];
      title = stripHtmlAndCdata(emb.title || "");
      geeknewsUrl = (emb.url || "").trim();
      summary = stripHtmlAndCdata(emb.description || "");
    } else if (msg.content) {
      const content = msg.content;
      const mdLinkMatch = content.match(/\*\*\[([^\]]+)\]\(<?( ?https?:\/\/[^>)\s]+)>?\)\*\*/);
      if (mdLinkMatch) {
        title = stripHtmlAndCdata(mdLinkMatch[1]);
        geeknewsUrl = mdLinkMatch[2].trim();
      } else {
        const urlMatch = content.match(/https?:\/\/news\.hada\.io\/topic\?[^\s>"')]+/);
        if (urlMatch) {
          geeknewsUrl = urlMatch[0];
        }
        const boldMatch = content.match(/\*\*([^*\n[]+)\*\*/);
        if (boldMatch) {
          title = stripHtmlAndCdata(boldMatch[1]);
        }
      }
      const lines = content
        .split("\n")
        .slice(1)
        .map((l) => l.trim())
        .filter(Boolean);
      summary = lines.map((l) => (l.startsWith("- ") ? "• " + l.slice(2).trim() : l)).join("\n");
    }

    if (geeknewsUrl) {
      const idMatch = geeknewsUrl.match(/[?&]id=(\d+)/);
      if (idMatch) {
        geeknewsId = idMatch[1];
      }
    }

    if (geeknewsId && title) {
      articles.push({
        geeknewsId,
        title,
        url: `https://news.hada.io/topic?id=${geeknewsId}`,
        sourceUrl: null,
        summary: summary || title,
        publishedAt,
      });
    }
  }
  return articles;
}

async function fetchFromDiscord(env) {
  const res = await fetch(
    `https://discord.com/api/v10/channels/${env.DISCORD_CHANNEL_ID}/messages?limit=20`,
    {
      headers: {
        Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
        "User-Agent": "chitchat-geeknews-worker",
      },
    },
  );
  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`Discord API status ${res.status}: ${errorText}`);
  }
  const messages = await res.json();
  if (!Array.isArray(messages)) {
    throw new Error("Discord API response is not an array");
  }
  return parseDiscordMessages(messages);
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

async function fetchCuratedHtmlArticles() {
  const res = await fetch(CURATED_NEWS_URL, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    },
  });
  if (!res.ok) {
    throw new Error(`Curated page status ${res.status}`);
  }
  const html = await res.text();
  return parseCuratedPage(html);
}

async function syncGeeknews(env) {
  if (!env.OPS_CRON_TOKEN) {
    console.error(
      "[geeknews] no OPS_CRON_TOKEN — set a secret to deploy, or .dev.vars to run locally",
    );
    return;
  }

  let articles = [];
  if (env.DISCORD_BOT_TOKEN && env.DISCORD_CHANNEL_ID) {
    try {
      articles = await fetchFromDiscord(env);
      console.log(
        `[geeknews] fetched ${articles.length} article(s) from Discord channel ${env.DISCORD_CHANNEL_ID}`,
      );
    } catch (error) {
      console.error("[geeknews] Discord fetch failed, falling back to HTML:", error);
    }
  }

  if (articles.length === 0) {
    try {
      articles = await fetchCuratedHtmlArticles();
      console.log(`[geeknews] fetched ${articles.length} article(s) from curated HTML`);
    } catch (error) {
      console.error("[geeknews] HTML fetch failed:", error);
      return;
    }
  }

  if (articles.length === 0) {
    console.warn("[geeknews] no articles available to sync");
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
