import "server-only";

import { LINK_PREVIEW_TIMEOUT, LINK_PREVIEW_USER_AGENT } from "@/shared/config";
import type { Nullable } from "@/shared/lib";
import type { PageMetadata } from "../model/parse-metadata";

const YOUTUBE_HOSTS = ["youtube.com", "youtu.be", "youtube-nocookie.com"];

const OEMBED_ENDPOINT = "https://www.youtube.com/oembed";

type OEmbedResponse = {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
};

export function isYouTubeUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\.|^m\./, "");

    return YOUTUBE_HOSTS.includes(host);
  } catch {
    return false;
  }
}

/**
 * REQUIREMENTS.md § 8.9. YouTube's own oEmbed endpoint, rather than scraping the
 * watch page: the page renders its metadata from JS for an agent it does not
 * recognise, so the generic path gets a title and no thumbnail.
 *
 * INFO: The channel lands in `siteName` rather than a literal `YouTube` — the play
 * badge on the tile already says which site this is, and the channel does not.
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
    siteName: data.author_name ?? "YouTube",
  };
}
