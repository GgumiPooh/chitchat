import "server-only";

import { LINK_PREVIEW_USER_AGENT } from "@/shared/config";
import type { Maybe, Nullable } from "@/shared/lib";
import type { PageMetadata } from "../model/parse-metadata";

const YOUTUBE_HOSTS = ["youtube.com", "youtu.be", "youtube-nocookie.com"];

const OEMBED_ENDPOINT = "https://www.youtube.com/oembed";

// INFO: `hqdefault` rather than `maxresdefault` — every video has it, while the higher resolution is only generated for some and 404s for the rest.
const THUMBNAIL_ENDPOINT = "https://i.ytimg.com/vi";

const WATCH_PATHS = ["/embed/", "/shorts/", "/live/", "/v/"];

// WARN: YouTube's canonical playlist embed is `/embed/videoseries?list=…`, and it passes the id shape below — left in, the card is forced to `video` and its thumbnail points at a video that does not exist.
const NON_VIDEO_IDS = ["videoseries"];

// INFO: Any ytimg host, not just the one `THUMBNAIL_ENDPOINT` names — oEmbed answers `i9.ytimg.com` as readily as `i.ytimg.com`.
const YOUTUBE_THUMBNAIL_HOST = /^https?:\/\/([\w-]+\.)?ytimg\.com\//i;

type OEmbedResponse = {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
};

/** The video this URL plays, or `null` when it is a YouTube URL that is not one video (a channel, a playlist, the home page). */
export function findYouTubeVideoId(url: string): Nullable<string> {
  let parsed;

  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\.|^m\./, "");

  if (!YOUTUBE_HOSTS.includes(host)) {
    return null;
  }

  const id =
    host === "youtu.be"
      ? parsed.pathname.slice(1)
      : (parsed.searchParams.get("v") ??
        WATCH_PATHS.reduce<string>(
          (found, prefix) =>
            found ||
            (parsed.pathname.startsWith(prefix) ? parsed.pathname.slice(prefix.length) : ""),
          "",
        ));

  return /^[\w-]{6,20}$/.test(id) && !NON_VIDEO_IDS.includes(id) ? id : null;
}

// INFO: The thumbnail every video has, whatever its page or its oEmbed entry says.
function toYouTubeThumbnailUrl(videoId: string): string {
  return `${THUMBNAIL_ENDPOINT}/${videoId}/hqdefault.jpg`;
}

/**
 * REQUIREMENTS.md § 8.9. YouTube's own oEmbed endpoint, tried before the watch
 * page because it answers the title, the channel and the thumbnail as a few
 * hundred bytes of JSON.
 *
 * WARN: It answers **401 for a video whose uploader disabled embedding**, which is
 * not an error the caller should give up on — the watch page still publishes the
 * Open Graph tags. `null` here means "fall through to the scrape", never "no card".
 *
 * WARN: § 8.9. Takes the caller's `signal` rather than arming its own. This hop and
 * the scrape behind it are one resolution on one budget — a second timeout here
 * doubles the worst case for a YouTube link past the platform's function limit,
 * which caches nothing and pays the same price on the next scroll.
 */
export async function fetchYouTubeMetadata(
  url: string,
  signal: AbortSignal,
): Promise<Nullable<PageMetadata>> {
  const endpoint = `${OEMBED_ENDPOINT}?url=${encodeURIComponent(url)}&format=json`;
  const response = await fetch(endpoint, {
    signal,
    headers: { "User-Agent": LINK_PREVIEW_USER_AGENT },
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as OEmbedResponse;

  if (!data.title) {
    return null;
  }

  return {
    kind: "video",
    title: data.title,
    description: null,
    imageUrl: data.thumbnail_url ?? null,
    // INFO: The channel rather than a literal `YouTube` — the play badge on the tile already says which site this is, and the channel does not.
    siteName: data.author_name ?? "YouTube",
  };
}

/**
 * REQUIREMENTS.md § 8.9. Whatever the page gave up, completed from the video id.
 *
 * WARN: Applied on both YouTube paths, and it never gives up on a known id. A page
 * that answered a consent interstitial has no `og:title`, and returning it
 * untouched files the link as `empty` for the whole TTL — `statusOf` takes a card
 * that carries only a thumbnail, which is exactly what this can always build.
 */
export function withYouTubeFallbacks(
  metadata: Nullable<PageMetadata>,
  videoId: string,
): PageMetadata {
  return {
    kind: "video",
    title: metadata?.title ?? null,
    description: metadata?.description ?? null,
    siteName: metadata?.siteName ?? "YouTube",
    imageUrl: toReliableThumbnailUrl(metadata?.imageUrl, videoId),
  };
}

/**
 * WARN: A ytimg URL is *replaced*, not kept. The watch page always publishes
 * `og:image` as `maxresdefault.jpg`, which YouTube generates for some videos and
 * 404s for the rest — so trusting what the page said is what left an SD video's
 * card with a hidden tile (§ 8.9.). Only a thumbnail from somewhere else survives.
 */
function toReliableThumbnailUrl(imageUrl: Maybe<string>, videoId: string): string {
  return !imageUrl || YOUTUBE_THUMBNAIL_HOST.test(imageUrl)
    ? toYouTubeThumbnailUrl(videoId)
    : imageUrl;
}
