import type { LinkPreviewKind } from "@/shared/db";
import { isHttpUrl, type Nullable } from "@/shared/lib";

export type PageMetadata = {
  kind: LinkPreviewKind;
  title: Nullable<string>;
  description: Nullable<string>;
  imageUrl: Nullable<string>;
  siteName: Nullable<string>;
};

const META_TAG = /<meta\b[^>]*>/gi;

// WARN: Every quantifier before the `=` is bounded, and that is the whole point — `[\w:-]*\s*=` backtracks quadratically over a `<meta>` tag full of word characters that never reaches one, and the body this runs on is `MAX_LINK_PREVIEW_BYTES` — a megabyte — of whatever the linked host chose to send (§ 8.9.). No real attribute name or gap is anywhere near these bounds.
const ATTRIBUTE =
  /([a-z][\w:-]{0,63})[ \t\n\r\f]{0,16}=[ \t\n\r\f]{0,16}(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi;

const TITLE_TAG = /<title[^>]*>([\s\S]*?)<\/title>/i;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
};

// INFO: Trimmed to what a two-line card can show — a page that ships a 4KB description would otherwise be stored whole and shipped to the client on every read.
const MAX_TITLE_LENGTH = 200;

const MAX_DESCRIPTION_LENGTH = 300;

// WARN: An image URL is measured against its own limit, not the title's — a signed CDN URL runs past 200 characters routinely, and a truncated one is a tile that can only 403.
const MAX_IMAGE_URL_LENGTH = 2_048;

/**
 * REQUIREMENTS.md § 8.9. Reads the card out of a page's `<head>`. Open Graph first
 * and Twitter's tags second, because a site that publishes both is describing the
 * same page twice — the `<title>` element is the last resort, since it carries the
 * site's own suffix (`… - YouTube`) that `og:title` leaves off.
 *
 * WARN: Regex over HTML, deliberately. A parser is a dependency and a full DOM for
 * a document we read five tags from; the input is never trusted or re-emitted — it
 * is read, and every value is escaped by React at render.
 */
export function parseMetadata(html: string, pageUrl: string): PageMetadata {
  const head = html.split(/<\/head>/i)[0] ?? html;
  const tags = readMetaTags(head);
  const imageUrl = pick(
    tags,
    ["og:image:secure_url", "og:image:url", "og:image", "twitter:image"],
    MAX_IMAGE_URL_LENGTH,
  );

  return {
    kind: tags.get("og:type")?.startsWith("video") ? "video" : "link",
    title:
      pick(tags, ["og:title", "twitter:title"], MAX_TITLE_LENGTH) ??
      clean(head.match(TITLE_TAG)?.[1], MAX_TITLE_LENGTH),
    description: pick(
      tags,
      ["og:description", "twitter:description", "description"],
      MAX_DESCRIPTION_LENGTH,
    ),
    imageUrl: imageUrl ? toAbsoluteUrl(imageUrl, pageUrl) : null,
    siteName: pick(tags, ["og:site_name"], MAX_TITLE_LENGTH) ?? hostOf(pageUrl),
  };
}

/** The character encoding the document declares, for a page that is not UTF-8. */
export function findMetaCharset(head: string): Nullable<string> {
  const tags = readMetaTags(head);
  const fromCharset = tags.get("charset");

  if (fromCharset) {
    return fromCharset;
  }

  return tags.get("content-type")?.match(/charset=([\w-]+)/i)?.[1] ?? null;
}

function readMetaTags(head: string): Map<string, string> {
  const tags = new Map<string, string>();

  for (const tag of head.match(META_TAG) ?? []) {
    const attributes = readAttributes(tag);
    // INFO: `http-equiv` is here only for the `Content-Type` charset declaration `findMetaCharset` reads.
    const key =
      attributes.get("property") ?? attributes.get("name") ?? attributes.get("http-equiv");
    const value = attributes.get("content") ?? attributes.get("charset");

    if (key && value && !tags.has(key.toLowerCase())) {
      tags.set(key.toLowerCase(), value);
    }

    if (attributes.has("charset")) {
      tags.set("charset", attributes.get("charset") ?? "");
    }
  }

  return tags;
}

function readAttributes(tag: string): Map<string, string> {
  const attributes = new Map<string, string>();

  for (const match of tag.matchAll(ATTRIBUTE)) {
    attributes.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? "");
  }

  return attributes;
}

function pick(tags: Map<string, string>, keys: string[], maxLength: number): Nullable<string> {
  for (const key of keys) {
    const value = clean(tags.get(key), maxLength);

    if (value) {
      return value;
    }
  }

  return null;
}

function clean(value: Nullable<string> | undefined, maxLength: number): Nullable<string> {
  if (!value) {
    return null;
  }

  const text = decodeEntities(value).replace(/\s+/g, " ").trim();

  return text ? text.slice(0, maxLength) : null;
}

function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, name: string) => {
    const named = NAMED_ENTITIES[name.toLowerCase()];

    if (named) {
      return named;
    }

    if (name.startsWith("#")) {
      const code = name.startsWith("#x") ? parseInt(name.slice(2), 16) : Number(name.slice(1));

      // WARN: The range check is `String.fromCodePoint`'s, not decoration — it throws on anything past `0x10FFFF`, and `&#99999999;` in a title would take the whole scrape down and cache the page as a failure.
      return isCodePoint(code) ? String.fromCodePoint(code) : entity;
    }

    return entity;
  });
}

function isCodePoint(code: number): boolean {
  return Number.isInteger(code) && code >= 0 && code <= 0x10ffff;
}

// INFO: `og:image` is allowed to be a path, and a relative one resolved against the wrong base is a broken tile in the bubble.
function toAbsoluteUrl(value: string, pageUrl: string): Nullable<string> {
  try {
    const resolved = new URL(value, pageUrl).toString();

    return isHttpUrl(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

function hostOf(pageUrl: string): Nullable<string> {
  try {
    return new URL(pageUrl).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
