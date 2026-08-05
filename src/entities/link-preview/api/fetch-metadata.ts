import "server-only";

import {
  LINK_PREVIEW_TIMEOUT,
  LINK_PREVIEW_USER_AGENT,
  MAX_LINK_PREVIEW_BYTES,
  MAX_LINK_PREVIEW_REDIRECTS,
} from "@/shared/config";
import { isHttpUrl, type Nullable } from "@/shared/lib";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { findMetaCharset, parseMetadata, type PageMetadata } from "../model/parse-metadata";
import { isPublicAddress } from "../model/public-address";
import { fetchYouTubeMetadata, isYouTubeUrl } from "./fetch-youtube-metadata";

const HTML_CONTENT_TYPES = ["text/html", "application/xhtml+xml"];

/**
 * REQUIREMENTS.md § 8.9. Resolves one URL into the card's fields, or `null` when
 * the target is not a page we can read anything off. Everything here is a hop the
 * server makes on a URL a user typed, so the guards below are the point of the
 * function as much as the parsing is.
 */
export async function fetchMetadata(url: string): Promise<Nullable<PageMetadata>> {
  // INFO: YouTube's watch page ships its metadata behind JS for most agents; oEmbed answers the same title and thumbnail as JSON to anyone.
  if (isYouTubeUrl(url)) {
    return fetchYouTubeMetadata(url);
  }

  const response = await followToPage(url);

  if (!response) {
    return null;
  }

  const html = await readBody(response.body);

  return html ? parseMetadata(html, response.url) : null;
}

/**
 * WARN: Redirects are followed by hand rather than by `fetch`, because every hop
 * has to clear `isPublicHttpUrl` — a URL on a public host that 302s to
 * `http://169.254.169.254/` is exactly the request this endpoint must not make.
 */
async function followToPage(url: string): Promise<Nullable<{ body: Response; url: string }>> {
  // WARN: One signal for the whole chain, not one per hop — armed inside the loop, four slow redirects and their DNS lookups cost four times the timeout and the platform's own function limit ends the request first, which caches nothing and pays the same price again on the next scroll.
  const signal = AbortSignal.timeout(LINK_PREVIEW_TIMEOUT);
  let current = url;

  for (let hop = 0; hop <= MAX_LINK_PREVIEW_REDIRECTS; hop += 1) {
    if (!(await isPublicHttpUrl(current))) {
      return null;
    }

    const response = await fetch(current, {
      redirect: "manual",
      signal,
      headers: {
        "User-Agent": LINK_PREVIEW_USER_AGENT,
        // INFO: Korean first — a site that localises by header should describe itself the way the two people reading the bubble would.
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
      },
    });

    const location = response.headers.get("location");

    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel();
      current = new URL(location, current).toString();
      continue;
    }

    if (!response.ok || !isHtml(response)) {
      await response.body?.cancel();
      return null;
    }

    return { body: response, url: current };
  }

  return null;
}

/**
 * WARN: Read in chunks and stopped at the cap rather than `response.text()` — the
 * `Content-Length` of a hostile response is a claim, and a stream that never ends
 * would otherwise be buffered until the process runs out of memory.
 */
async function readBody(response: Response): Promise<Nullable<string>> {
  const reader = response.body?.getReader();

  if (!reader) {
    return null;
  }

  const chunks: Uint8Array[] = [];
  let size = 0;

  try {
    while (size < MAX_LINK_PREVIEW_BYTES) {
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

  const bytes = concat(chunks, size);
  const utf8 = new TextDecoder().decode(bytes);
  const charset = charsetOf(response) ?? findMetaCharset(utf8.split(/<\/head>/i)[0] ?? utf8);

  return charset && !/^utf-?8$/i.test(charset) ? (decodeAs(bytes, charset) ?? utf8) : utf8;
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

function charsetOf(response: Response): Nullable<string> {
  return response.headers.get("content-type")?.match(/charset=([\w-]+)/i)?.[1] ?? null;
}

function isHtml(response: Response): boolean {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

  return HTML_CONTENT_TYPES.some((type) => contentType.includes(type));
}

/**
 * REQUIREMENTS.md § 14. The URL comes from a message body, so the fetch is an
 * attacker-chosen request made from inside the deployment — every address the
 * host resolves to has to be a public one before it is dialled.
 */
async function isPublicHttpUrl(url: string): Promise<boolean> {
  if (!isHttpUrl(url)) {
    return false;
  }

  const { hostname } = new URL(url);
  const host = hostname.replace(/^\[|\]$/g, "");

  if (isIP(host)) {
    return isPublicAddress(host);
  }

  try {
    const addresses = await lookup(host, { all: true });

    return addresses.length > 0 && addresses.every(({ address }) => isPublicAddress(address));
  } catch {
    return false;
  }
}
