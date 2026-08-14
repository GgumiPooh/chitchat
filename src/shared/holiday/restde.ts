import type { Optional } from "@/shared/lib";
import { z } from "zod";

/** Where a 특일 정보 일반 인증키 is issued. */
export const HOLIDAY_PORTAL_URL = "https://www.data.go.kr/data/15012690/openapi.do";

/**
 * The 공공데이터포털 인증키 every request below carries.
 *
 * WARN: data.go.kr grants a key a two-year 활용기간 and the gateway rejects every
 * call the moment it lapses — an expiry on a calendar rather than a revocation, so
 * nothing announces it. REQUIREMENTS.md § 11.7. is what makes that survivable.
 */
export const HOLIDAY_SERVICE_KEY_ENV = "DATA_GO_KR_SERVICE_KEY";

// INFO: 특일 정보's published history begins at 2004, so an earlier year is a range the service has nothing to answer with.
export const EARLIEST_HOLIDAY_YEAR = 2004;

const ENDPOINT = "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo";

const MONTHS_IN_YEAR = 12;

// INFO: A third of the year in flight at a time — `LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR` is a documented answer to a burst, and one throttled month discards the whole year below.
// WARN: Also what keeps the shared signal under Node's EventTarget listener cap, since each in-flight request adds an abort listener to it and removes it on completion.
const REQUEST_CONCURRENCY = 4;

// INFO: `numOfRows` defaults to 10, which would silently truncate a month like 2025-10 — a hundred rows is far past any single month 특일 정보 has ever answered.
const PAGE_SIZE = 100;

// INFO: How much of an unparseable body is quoted back, so a log line names what arrived without pasting a whole XML document into it.
const ERROR_EXCERPT_LENGTH = 200;

// INFO: `locdate` and `seq` are documented as strings but arrive as JSON numbers.
const numeric = z.union([z.string(), z.number()]);

const ItemSchema = z.object({
  dateName: z.string(),
  isHoliday: z.string(),
  locdate: numeric.transform(String),
  seq: numeric.transform(Number),
});

// INFO: A single row comes back as a bare object where two or more come back as an array, and a month with nothing in it answers `""` or an `items` carrying no `item` at all.
const ItemsSchema = z.union([
  z.literal(""),
  z
    .object({ item: z.union([ItemSchema.array(), ItemSchema.transform((item) => [item])]) })
    .partial(),
]);

const ResponseSchema = z.object({
  response: z.object({
    header: z.object({ resultCode: z.string(), resultMsg: z.string() }),
    body: z.object({ items: ItemsSchema, totalCount: numeric.transform(Number) }),
  }),
});

const GatewayErrorSchema = z.object({
  OpenAPI_ServiceResponse: z.object({
    cmmMsgHeader: z.object({
      errMsg: z.string(),
      returnAuthMsg: z.string().optional(),
      returnReasonCode: numeric.transform(String).optional(),
    }),
  }),
});

/** One 특일 정보 row, already narrowed to the 공휴일 the calendar draws. */
export type RestDeItem = z.infer<typeof ItemSchema>;

export type HolidayRequestOptions = {
  serviceKey: string;
  /**
   * The deadline, owned by the caller and shared by every request one year makes.
   *
   * WARN: A budget for the year, not a timeout per request. Twelve months each
   * allowed their own deadline multiply by however many rounds `REQUEST_CONCURRENCY`
   * leaves, and a page render cannot be bounded by a number that does that.
   *
   * WARN: A `signal` opts the fetch out of Next's request memoization, and
   * `patch-fetch` writes a Data Cache entry only for a request that was not aborted
   * — so whatever this cuts off is work fetched and thrown away rather than saved,
   * which is why the runtime sets it generously and leans on its circuit breaker.
   */
  signal: AbortSignal;
  /**
   * Seconds, for Next's `fetch` Data Cache (REQUIREMENTS.md § 11.7.).
   *
   * INFO: Optional because `pnpm holidays` runs under plain Node, where `fetch` has no such option and always reaches the network.
   */
  revalidate?: number;
};

/**
 * The key as the endpoint wants it, from either copy the portal hands out.
 *
 * INFO: Decoding an encoded copy first leaves `URLSearchParams` exactly one layer to apply, and a decoded (base64) key never contains `%` to confuse the test.
 */
export function normalizeServiceKey(key: string): string {
  return key.includes("%") ? decodeURIComponent(key) : key;
}

function readTag(xml: string, tag: string): Optional<string> {
  return new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(xml)?.[1];
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// WARN: An auth or quota failure never reaches the service — data.go.kr's gateway answers its own `OpenAPI_ServiceResponse` envelope instead, as JSON under `_type=json` and as XML on the paths that ignore it, so both forms have to be read before the body is trusted.
function describeGatewayError(text: string, payload: unknown): Optional<string> {
  const header = GatewayErrorSchema.safeParse(payload).data?.OpenAPI_ServiceResponse.cmmMsgHeader;

  if (header) {
    return `${header.errMsg} (${header.returnReasonCode ?? "?"}) ${header.returnAuthMsg ?? ""}`.trim();
  }

  const errMsg = text.trimStart().startsWith("<") ? readTag(text, "errMsg") : undefined;

  return (
    errMsg &&
    `${errMsg} (${readTag(text, "returnReasonCode") ?? "?"}) ${readTag(text, "returnAuthMsg") ?? ""}`.trim()
  );
}

async function fetchMonth(
  year: number,
  month: number,
  options: HolidayRequestOptions,
): Promise<RestDeItem[]> {
  const period = `${year}-${String(month).padStart(2, "0")}`;
  const url = new URL(ENDPOINT);

  url.search = new URLSearchParams({
    serviceKey: options.serviceKey,
    _type: "json",
    numOfRows: String(PAGE_SIZE),
    pageNo: "1",
    solYear: String(year),
    solMonth: String(month).padStart(2, "0"),
  }).toString();

  const response = await fetch(url, {
    next: { revalidate: options.revalidate },
    signal: options.signal,
  });
  const text = await response.text();
  const payload = parseJson(text);
  const rejection = describeGatewayError(text, payload);

  if (rejection) {
    throw new Error(
      `특일 정보 rejected the request for ${period}: ${rejection}. Check ${HOLIDAY_SERVICE_KEY_ENV} at ${HOLIDAY_PORTAL_URL} — a key is granted a two-year 활용기간 and the gateway refuses every call once it lapses.`,
    );
  }

  if (!response.ok) {
    throw new Error(`특일 정보 answered HTTP ${response.status} for ${period}: ${text.trim()}`);
  }

  // WARN: The service answers XML unless `_type=json` is honoured, and the success path has never been observed to ignore it — so this is a failure to fall back from, not a second format to parse.
  if (payload === undefined) {
    throw new Error(
      `특일 정보 answered ${period} with a body that is not JSON: ${text.slice(0, ERROR_EXCERPT_LENGTH).trim()}`,
    );
  }

  const parsed = ResponseSchema.safeParse(payload);

  // INFO: The issues are flattened rather than thrown raw, because REQUIREMENTS.md § 11.7. makes one log line the only report there is and a zod dump buries the period in it.
  if (!parsed.success) {
    throw new Error(
      `특일 정보 answered ${period} in a shape this app does not know: ${parsed.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`).join("; ")}`,
    );
  }

  const { header, body } = parsed.data.response;

  if (header.resultCode !== "00") {
    throw new Error(
      `특일 정보 answered ${header.resultCode} ${header.resultMsg} for ${period}, so nothing about that month can be trusted.`,
    );
  }

  if (body.totalCount > PAGE_SIZE) {
    throw new Error(
      `특일 정보 has ${body.totalCount} rows for ${period}, past the ${PAGE_SIZE}-row page this request asks for — raise PAGE_SIZE or start paging.`,
    );
  }

  const items = body.items === "" ? [] : (body.items.item ?? []);

  return items.filter((item) => item.isHoliday === "Y");
}

/**
 * Every 공휴일 특일 정보 holds for a year, in no particular order.
 *
 * WARN: Every month is named because nothing pins what omitting `solMonth` returns,
 * and they go out in rounds of `REQUEST_CONCURRENCY` rather than all at once —
 * twelve simultaneous connections is the shape the gateway answers with
 * `LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR`.
 *
 * WARN: One month failing still fails the whole year, and must. REQUIREMENTS.md
 * § 11.7. replaces a year outright, so eleven months written back is not a year
 * missing one month — it is a year with a hole in it that reads as settled.
 */
export async function fetchHolidayYear(
  year: number,
  options: HolidayRequestOptions,
): Promise<RestDeItem[]> {
  const items: RestDeItem[] = [];

  for (let month = 1; month <= MONTHS_IN_YEAR; month += REQUEST_CONCURRENCY) {
    const round = Array.from(
      { length: Math.min(REQUEST_CONCURRENCY, MONTHS_IN_YEAR - month + 1) },
      (_, index) => fetchMonth(year, month + index, options),
    );

    items.push(...(await Promise.all(round)).flat());
  }

  return items;
}
