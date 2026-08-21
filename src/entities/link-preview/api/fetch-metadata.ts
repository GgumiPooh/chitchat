import "server-only";

import {
  LINK_PREVIEW_TIMEOUT,
  LINK_PREVIEW_USER_AGENT,
  MAX_LINK_PREVIEW_BYTES,
  MAX_LINK_PREVIEW_REDIRECTS,
} from "@/shared/config";
import { isHttpUrl, safelyGetAsync, type Nullable } from "@/shared/lib";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Agent, fetch as dialFetch, type Response as DialResponse } from "undici";
import { isInstagramUrl, toInstagramScrapeUrl, withInstagramFallbacks } from "../model/instagram";
import { findMetaCharset, parseMetadata, type PageMetadata } from "../model/parse-metadata";
import { isPublicAddress } from "../model/public-address";
import { IMAGE_HEADER_BYTES, readImageSize, type ImageSize } from "../model/read-image-size";
import {
  fetchYouTubeMetadata,
  findYouTubeVideoId,
  withYouTubeFallbacks,
} from "./fetch-youtube-metadata";

const HTML_CONTENT_TYPES = ["text/html", "application/xhtml+xml"];

type Accept = (response: DialResponse) => boolean;

const HEAD_END = /<\/head>/i;

// INFO: One character short of `</head>`, which is the most of it that can be left in the previous chunk.
const HEAD_END_OVERLAP = 6;

const LATIN1 = new TextDecoder("latin1");

/**
 * REQUIREMENTS.md § 8.9. Resolves one URL into the card's fields, or `null` when
 * the target is not a page we can read anything off. Everything here is a hop the
 * server makes on a URL a user typed, so the guards below are the point of the
 * function as much as the parsing is.
 */
export async function fetchMetadata(url: string): Promise<Nullable<PageMetadata>> {
  const videoId = findYouTubeVideoId(url);
  // WARN: § 8.9. One signal for the whole resolution, oEmbed and the scrape behind it included — armed per call instead, a YouTube link that oEmbed refuses costs two timeouts and the platform's own function limit ends the request before anything reaches the cache.
  const signal = AbortSignal.timeout(LINK_PREVIEW_TIMEOUT);

  if (videoId) {
    // WARN: Swallowed rather than propagated — oEmbed refuses a video whose uploader disabled embedding (401), and that video's watch page still has the tags. Letting it throw would cache the link as a failure.
    const embedded = await safelyGetAsync(() => fetchYouTubeMetadata(url, signal));

    // INFO: § 8.9. Wrapped too, not returned raw — oEmbed can answer a title with no `thumbnail_url`, and the id is in hand either way.
    if (embedded) {
      return withYouTubeFallbacks(embedded, videoId);
    }
  }

  const page = await follow(toInstagramScrapeUrl(url), signal, isHtml);

  if (!page) {
    return null;
  }

  try {
    const html = await readBody(page.body);
    const parsed = html ? parseMetadata(html, page.url) : null;
    const metadata = isInstagramUrl(url) ? withInstagramFallbacks(parsed, url, page.url) : parsed;

    if (videoId) {
      return withYouTubeFallbacks(metadata, videoId);
    }

    return metadata && { ...metadata, imageSize: await probeImageSize(metadata.imageUrl, signal) };
  } finally {
    // WARN: The dispatcher is pinned to one address (§ 14.), so it cannot be pooled across calls and has to be torn down with the response it dialled.
    await page.agent.destroy();
  }
}

/**
 * REQUIREMENTS.md § 8.9. The thumbnail's box, off its first `IMAGE_HEADER_BYTES`.
 * Same vetting and same budget as the page (§ 14.) — it is a second request to a
 * host the message chose.
 *
 * WARN: Never fails the scrape. A host that refuses a `Range`, or an image in a format
 * the reader does not know, is a card at 16:9 rather than no card.
 */
async function probeImageSize(
  imageUrl: Nullable<string>,
  signal: AbortSignal,
): Promise<Nullable<ImageSize>> {
  if (!imageUrl) {
    return null;
  }

  const image = await safelyGetAsync(() =>
    follow(imageUrl, signal, isImage, { Range: `bytes=0-${IMAGE_HEADER_BYTES - 1}` }),
  );

  if (!image) {
    return null;
  }

  try {
    return readImageSize(await readBytes(image.body, IMAGE_HEADER_BYTES));
  } catch {
    return null;
  } finally {
    await image.agent.destroy();
  }
}

/**
 * WARN: Redirects are followed by hand rather than by `fetch`, because every hop
 * has to clear `vetHost` — a URL on a public host that 302s to
 * `http://169.254.169.254/` is exactly the request this endpoint must not make.
 *
 * WARN: The `signal` bounds the whole chain and is the caller's, not this
 * function's (§ 8.9.). Armed per hop, four slow redirects and their DNS lookups
 * cost four times the timeout.
 */
async function follow(
  url: string,
  signal: AbortSignal,
  accept: Accept,
  headers: Record<string, string> = {},
): Promise<Nullable<{ body: DialResponse; url: string; agent: Agent }>> {
  let current = url;

  for (let hop = 0; hop <= MAX_LINK_PREVIEW_REDIRECTS; hop += 1) {
    const vetted = await vetHost(current);

    if (!vetted) {
      return null;
    }

    const agent = toPinnedAgent(vetted);
    const response = await dialFetch(current, {
      dispatcher: agent,
      redirect: "manual",
      signal,
      headers: {
        "User-Agent": LINK_PREVIEW_USER_AGENT,
        // INFO: Korean first — a site that localises by header should describe itself the way the two people reading the bubble would.
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
        ...headers,
      },
    }).catch(async (error: unknown) => {
      await agent.destroy();

      throw error;
    });

    const location = response.headers.get("location");

    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel();
      await agent.destroy();
      current = new URL(location, current).toString();
      continue;
    }

    if (!response.ok || !accept(response)) {
      await response.body?.cancel();
      await agent.destroy();

      return null;
    }

    return { body: response, url: current, agent };
  }

  return null;
}

/**
 * Reads as much of the document as the metadata can be in: everything up to
 * `</head>`, and never more than `MAX_LINK_PREVIEW_BYTES`.
 *
 * WARN: Chunked rather than `response.text()` — the `Content-Length` of a hostile
 * response is a claim, and a stream that never ends would otherwise be buffered
 * until the process runs out of memory.
 */
async function readBody(response: DialResponse): Promise<Nullable<string>> {
  const reader = response.body?.getReader();

  if (!reader) {
    return null;
  }

  const chunks: Uint8Array[] = [];
  let size = 0;
  // INFO: The tags are ASCII wherever they sit in the document, so the closing tag is searched for as bytes and the charset question (below) is left until the whole head is in hand.
  let scanned = "";

  try {
    while (size < MAX_LINK_PREVIEW_BYTES) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      chunks.push(value);
      size += value.length;
      scanned += LATIN1.decode(value);

      if (HEAD_END.test(scanned)) {
        break;
      }

      // WARN: Only the tail is carried forward, or this holds a second copy of the whole document — but it has to be *some* of it, since `</head>` can straddle two chunks.
      scanned = scanned.slice(-HEAD_END_OVERLAP);
    }
  } finally {
    await reader.cancel();
  }

  const bytes = concat(chunks, size);
  const utf8 = new TextDecoder().decode(bytes);
  const charset = charsetOf(response) ?? findMetaCharset(utf8.split(/<\/head>/i)[0] ?? utf8);

  return charset && !/^utf-?8$/i.test(charset) ? (decodeAs(bytes, charset) ?? utf8) : utf8;
}

// INFO: The image's head and no more — a server that ignored the `Range` would otherwise stream the whole file into memory.
async function readBytes(response: DialResponse, limit: number): Promise<Uint8Array> {
  const reader = response.body?.getReader();

  if (!reader) {
    return new Uint8Array();
  }

  const chunks: Uint8Array[] = [];
  let size = 0;

  try {
    while (size < limit) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      chunks.push(value);
      size += value.length;
    }
  } finally {
    await reader.cancel();
  }

  return concat(chunks, size);
}

function concat(chunks: Uint8Array[], size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }

  return bytes;
}

// INFO: A Korean page served as EUC-KR is common enough to be worth the second decode — read as UTF-8 its title is mojibake, which is what would land in the bubble.
function decodeAs(bytes: Uint8Array, charset: string): Nullable<string> {
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return null;
  }
}

function charsetOf(response: DialResponse): Nullable<string> {
  return response.headers.get("content-type")?.match(/charset=([\w-]+)/i)?.[1] ?? null;
}

function isHtml(response: DialResponse): boolean {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

  return HTML_CONTENT_TYPES.some((type) => contentType.includes(type));
}

function isImage(response: DialResponse): boolean {
  return (response.headers.get("content-type") ?? "").toLowerCase().startsWith("image/");
}

type VettedHost = { address: string; family: number };

/**
 * REQUIREMENTS.md § 14. The URL comes from a message body, so the fetch is an
 * attacker-chosen request made from inside the deployment — every address the
 * host resolves to has to be a public one before it is dialled.
 *
 * WARN: It answers with the address, not a verdict, and `toPinnedAgent` dials
 * exactly that. Handing the *hostname* to `fetch` after checking it lets the name
 * resolve a second time, and an authoritative server that answers a public record
 * here and `169.254.169.254` there walks straight through this check — DNS
 * rebinding defeats a guard that only ever sees the first answer.
 */
async function vetHost(url: string): Promise<Nullable<VettedHost>> {
  if (!isHttpUrl(url)) {
    return null;
  }

  const { hostname } = new URL(url);
  const host = hostname.replace(/^\[|\]$/g, "");
  const literal = isIP(host);

  if (literal) {
    return isPublicAddress(host) ? { address: host, family: literal } : null;
  }

  try {
    const addresses = await lookup(host, { all: true });
    const [first] = addresses;

    if (!first || !addresses.every(({ address }) => isPublicAddress(address))) {
      return null;
    }

    return { address: first.address, family: first.family };
  } catch {
    return null;
  }
}

// WARN: `connect.lookup`, not a rewritten URL. The hostname still reaches TLS, so SNI and certificate validation stay on the name the user typed while only the vetted address is ever dialled.
function toPinnedAgent({ address, family }: VettedHost): Agent {
  return new Agent({
    connect: {
      lookup: (_hostname, options, callback) =>
        options.all
          ? callback(null, [{ address, family }] as never, family)
          : callback(null, address, family),
    },
  });
}
