import type { Nullable } from "@/shared/lib";
import type { PageMetadata } from "./parse-metadata";

const INSTAGRAM_HOST = /(^|\.)instagram\.com$/i;

const REEL_PATH = /^\/reels?\//i;

// INFO: Measured, not documented: a reel and a post publish no `og:title`, only `twitter:title` as `이름 (@handle) • Instagram 릴스` / `… • Instagram photos and videos`.
const TITLE_SUFFIX = /\s*[•·]\s*Instagram\b.*$/i;

// INFO: The other shape Instagram answers with, seen in production and not from here: `Instagram의 이름: "캡션"` in Korean, `이름 on Instagram: "캡션"` in English. The closing quote is optional because the title is cut at `MAX_TITLE_LENGTH`.
const CAPTIONED_TITLE = /^(?:Instagram의\s+(.+?)|(.+?)\s+on\s+Instagram):\s*["“](.*?)["”]?\s*$/is;

// WARN: The login page publishes tags of its own — `og:title: Instagram` and the logo as `og:image` — so read as a card it is a plausible-looking one for a post nobody can see.
const LOGIN_PATH = /^\/accounts\/login\//i;

export function isInstagramUrl(url: string): boolean {
  return INSTAGRAM_HOST.test(hostOf(url));
}

/**
 * REQUIREMENTS.md § 8.9. The URL the scrape dials for an Instagram link.
 *
 * WARN: The app's own 링크 복사 writes `/reels/{id}/`, and that path answers a login
 * page to every crawler — the singular `/reel/{id}/` answers the tags. The cache row
 * stays keyed by the URL as typed; only the request moves.
 */
export function toInstagramScrapeUrl(url: string): string {
  if (!isInstagramUrl(url)) {
    return url;
  }

  const parsed = new URL(url);
  parsed.pathname = parsed.pathname.replace(/^\/reels\//i, "/reel/");

  return parsed.toString();
}

/**
 * REQUIREMENTS.md § 8.9. What Instagram's tags leave out, read off the URL and the
 * title instead: a reel is `og:type: article` like a post, so the path decides the
 * kind, and the title carries the site's own suffix the card already says.
 *
 * INFO: Every rule here degrades to the generic card when Instagram moves — an unknown
 * path keeps `metadata.kind`, an unknown title shape keeps the title. The one thing
 * that is withheld rather than kept is a login wall, which is `null` like a 404.
 */
export function withInstagramFallbacks(
  metadata: Nullable<PageMetadata>,
  url: string,
  resolvedUrl: string,
): Nullable<PageMetadata> {
  if (!metadata || LOGIN_PATH.test(new URL(resolvedUrl).pathname)) {
    return null;
  }

  const captioned = metadata.title?.match(CAPTIONED_TITLE);

  return {
    ...metadata,
    kind: REEL_PATH.test(new URL(url).pathname) ? "video" : metadata.kind,
    // INFO: DESIGN.md § 6.9. The author above and the caption beneath, as Instagram's own share card lays them out — and the title as published when neither shape matches.
    title:
      (captioned
        ? (captioned[1] ?? captioned[2])
        : metadata.title?.replace(TITLE_SUFFIX, "")
      )?.trim() || metadata.title,
    // INFO: The caption over the page's own description, which is the engagement line (`63K likes, 133 comments - handle - date: …`) rather than what the post says.
    description: captioned?.[3]?.trim() || metadata.description,
    siteName: "Instagram",
  };
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}
