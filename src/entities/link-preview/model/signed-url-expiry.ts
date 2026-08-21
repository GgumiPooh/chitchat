import { A_SECOND, type Maybe, type Nullable } from "@/shared/lib";

// INFO: REQUIREMENTS.md § 8.9. SigV4 states a lifetime in seconds from the moment it was signed rather than an absolute instant, so the two parameters are only meaningful together.
const AMZ_DATE_KEY = "x-amz-date";

const AMZ_EXPIRES_KEY = "x-amz-expires";

// INFO: REQUIREMENTS.md § 8.9. The absolute forms: `exp` from a signed CDN path, `se` from an Azure SAS, `Expires` from SigV2 and CloudFront.
const ABSOLUTE_EXPIRY_KEYS = ["exp", "se", "expires"];

// INFO: Meta's CDN (Instagram, Facebook) signs with `oe`, epoch seconds written in hex — kept apart from the list above, since a hex reader would misread every decimal one.
const HEX_EXPIRY_KEYS = ["oe"];

const HEX = /^[0-9a-f]+$/i;

// WARN: `20260807T123456Z` is ISO 8601 *basic*, which `Date` does not accept — parsed with it, every signed thumbnail reads as `NaN` and the tile is withheld on the spot.
const AMZ_DATE = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/;

const DIGITS = /^\d+$/;

// INFO: A signed expiry is epoch seconds by convention; only a magnitude seconds cannot reach for another thirty millennia is read as milliseconds instead.
const MILLISECONDS_FROM = 1e12;

/**
 * REQUIREMENTS.md § 8.9. The instant a signed image URL stops resolving, read out of
 * the URL itself rather than from a request. `null` for an unsigned URL — most of
 * them — which is the same answer as "never expires".
 */
export function readSignedUrlExpiry(url: Nullable<string>): Nullable<Date> {
  const params = readParams(url);

  if (!params) {
    return null;
  }

  return readAmazonExpiry(params) ?? readAbsoluteExpiry(params);
}

function readParams(url: Nullable<string>): Nullable<Map<string, string>> {
  if (!url) {
    return null;
  }

  try {
    const params = new Map<string, string>();

    // INFO: Folded to lower case on the way in — the same parameter arrives as `X-Amz-Expires` from S3 and `x-amz-expires` from anything that rewrote the URL on the way.
    for (const [key, value] of new URL(url).searchParams) {
      const name = key.toLowerCase();

      if (!params.has(name)) {
        params.set(name, value);
      }
    }

    return params;
  } catch {
    return null;
  }
}

function readAmazonExpiry(params: Map<string, string>): Nullable<Date> {
  const signedAt = parseAmzDate(params.get(AMZ_DATE_KEY));
  const lifetime = Number(params.get(AMZ_EXPIRES_KEY));

  if (signedAt === null || !Number.isFinite(lifetime) || lifetime <= 0) {
    return null;
  }

  return new Date(signedAt + lifetime * A_SECOND);
}

function parseAmzDate(value: Maybe<string>): Nullable<number> {
  const match = value?.match(AMZ_DATE);

  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute, second] = match;

  return Date.UTC(+year, +month - 1, +day, +hour, +minute, +second);
}

function readAbsoluteExpiry(params: Map<string, string>): Nullable<Date> {
  for (const key of ABSOLUTE_EXPIRY_KEYS) {
    const parsed = parseExpiry(params.get(key));

    if (parsed) {
      return parsed;
    }
  }

  for (const key of HEX_EXPIRY_KEYS) {
    const value = params.get(key);

    if (value && HEX.test(value)) {
      return toDate(parseInt(value, 16) * A_SECOND);
    }
  }

  return null;
}

function parseExpiry(value: Maybe<string>): Nullable<Date> {
  if (!value) {
    return null;
  }

  if (DIGITS.test(value)) {
    const epoch = Number(value);

    return toDate(epoch >= MILLISECONDS_FROM ? epoch : epoch * A_SECOND);
  }

  return toDate(Date.parse(value));
}

function toDate(time: number): Nullable<Date> {
  return Number.isFinite(time) ? new Date(time) : null;
}
