import "server-only";

import { LINK_PREVIEW_TIMEOUT, LINK_PREVIEW_USER_AGENT } from "@/shared/config";
import type { Nullable } from "@/shared/lib";
import type { PageMetadata } from "../model/parse-metadata";

const YOUTUBE_HOSTS = ["youtube.com", "youtu.be", "youtube-nocookie.com"];

const OEMBED_ENDPOINT = "https://www.youtube.com/oembed";

// INFO: `hqdefault` rather than `maxresdefault` — every video has it, while the higher resolution is only generated for some and 404s for the rest.
const THUMBNAIL_ENDPOINT = "https://i.ytimg.com/vi";

const WATCH_PATHS = ["/embed/", "/shorts/", "/live/", "/v/"];

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

  return /^[\w-]{6,20}$/.test(id) ? id : null;
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
 */
export async function fetchYouTubeMetadata(url: string): Promise<Nullable<PageMetadata>> {
  const endpoint = `${OEMBED_ENDPOINT}?url=${encodeURIComponent(url)}&format=json`;
  const response = await fetch(endpoint, {
    signal: AbortSignal.timeout(LINK_PREVIEW_TIMEOUT),
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

/** REQUIREMENTS.md § 8.9. What the watch page gave us, with the two things a video's card cannot go without filled in from its id. */
export function withYouTubeFallbacks(
  metadata: Nullable<PageMetadata>,
  videoId: string,
): Nullable<PageMetadata> {
  if (!metadata?.title) {
    return metadata;
  }

  return {
    ...metadata,
    kind: "video",
    imageUrl: metadata.imageUrl ?? toYouTubeThumbnailUrl(videoId),
  };
}
