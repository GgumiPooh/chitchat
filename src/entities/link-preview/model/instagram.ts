import type { Nullable } from "@/shared/lib";
import type { PageMetadata } from "./parse-metadata";

const INSTAGRAM_HOST = /(^|\.)instagram\.com$/i;

const REEL_PATH = /^\/reels?\//i;

// INFO: Measured, not documented: a reel and a post publish no `og:title`, only `twitter:title` as `이름 (@handle) • Instagram reel` / `… • Instagram photos and videos`.
const TITLE_SUFFIX = /\s*[•·]\s*Instagram\b.*$/i;

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

  return {
    ...metadata,
    kind: REEL_PATH.test(new URL(url).pathname) ? "video" : metadata.kind,
    title: metadata.title?.replace(TITLE_SUFFIX, "").trim() || metadata.title,
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
