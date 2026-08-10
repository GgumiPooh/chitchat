import { ensureEnv } from "@/shared/config";
import { A_SECOND, shiftDayKey, toDayKey, type Optional } from "@/shared/lib";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { format, resolveConfig } from "prettier";
import { z } from "zod";
import { HOLIDAYS, type HolidayEntry } from "../src/shared/lib/date/holiday-table";

const SCRIPT_PATH = "scripts/generate-holidays.ts";
const SERVICE_KEY_ENV = "DATA_GO_KR_SERVICE_KEY";
const PORTAL_URL = "https://www.data.go.kr/data/15012690/openapi.do";
const ENDPOINT = "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo";

const REQUEST_TIMEOUT = 15 * A_SECOND;

// INFO: `numOfRows` defaults to 10, which would silently truncate a month like 2025-10 — a hundred rows is far past any single month 특일 정보 has ever answered.
const PAGE_SIZE = 100;

const MONTHS_IN_YEAR = 12;

// INFO: REQUIREMENTS.md § 11.7. — 월력요항 lands around mid-year for the year following, so two years ahead is the furthest a run can ever confirm.
const FUTURE_YEARS = 2;

// INFO: 특일 정보's published history begins at 2004, so an earlier `--from` is a range the service has nothing to answer with.
const EARLIEST_YEAR = 2004;

const FROM_FLAG = "--from=";

const CURRENT_YEAR = Number(toDayKey(Date.now()).slice(0, 4));

const TABLE_PATH = path.join(process.cwd(), "src", "shared", "lib", "date", "holiday-table.ts");
const TABLE_RELATIVE_PATH = path.relative(process.cwd(), TABLE_PATH);

const USAGE = `Usage: pnpm holidays [${FROM_FLAG}YYYY] [--help]

Regenerates ${TABLE_RELATIVE_PATH} from 공공데이터포털 특일 정보 (한국천문연구원).

A plain run refetches ${CURRENT_YEAR}-${CURRENT_YEAR + FUTURE_YEARS} and leaves every earlier year in the table
untouched, so a routine regeneration cannot show settled history drifting.

${FROM_FLAG}YYYY widens that back to any year from ${EARLIEST_YEAR} onward, re-verifying those
older years against the API. That is how the table's hand-typed entries get
checked, and it is expected to produce a large diff the first time.

${SERVICE_KEY_ENV} must be set; see .env.example.`;

/**
 * The API's `dateName` mapped onto this product's own copy.
 *
 * WARN: Every name that reaches the table comes through here, and an unmapped one
 * aborts the run. That is deliberate — API wording is not product copy (`기독탄신일`
 * is not `성탄절`), so a renamed or newly decreed holiday has to fail loudly rather
 * than walk onto a calendar cell in 천문연구원's spelling, and a table that quietly
 * omits a 공휴일 is the worse outcome. A default run covers three years, so the
 * blast radius of that failure is the years actually in play.
 */
const HOLIDAY_NAMES: Record<string, string> = {
  "1월1일": "신정",
  설날: "설날",
  삼일절: "삼일절",
  국회의원선거: "국회의원선거",
  대통령선거: "대통령선거",
  전국동시지방선거: "지방선거",
  근로자의날: "노동절",
  노동절: "노동절",
  어린이날: "어린이날",
  부처님오신날: "부처님오신날",
  현충일: "현충일",
  제헌절: "제헌절",
  광복절: "광복절",
  추석: "추석",
  개천절: "개천절",
  한글날: "한글날",
  기독탄신일: "성탄절",
  임시공휴일: "임시공휴일",
};

/**
 * What a bare `대체공휴일` on a given day key stands in for.
 *
 * WARN: Only needed where the displaced date carried two 공휴일 and the attribution
 * is therefore not derivable — 2025-05-05 was 어린이날 and 부처님오신날, and the law
 * granted the substitute to the latter. Anything ambiguous and unlisted throws
 * rather than picking by an API `seq` that pins nothing.
 */
const SUBSTITUTE_BASES: Record<string, string> = {
  "2025-05-06": "부처님오신날",
};

const SUBSTITUTE_NAME = "대체공휴일";

// INFO: `대체공휴일(설날)` and `임시공휴일(제21대 대통령 선거)` are both live shapes — the parenthesis names the holiday, and the prefix says whether it is a substitute.
const QUALIFIED_PATTERN = /^(대체공휴일|임시공휴일)\((.+)\)$/;

// INFO: An election arrives carrying its ordinal (`제21대 대통령 선거`), which no fixed table can enumerate, so the ordinal and the inner spacing come off before the lookup.
const ORDINAL_PATTERN = /^제\d+[대회]\s*/;

// INFO: REQUIREMENTS.md § 11.7. — 설날 and 추석 are three rows the API names identically, and only their position in the block distinguishes 전날 from 다음 날.
const BLOCK_HOLIDAYS = ["설날", "추석"];
const BLOCK_SUFFIXES = [" 전날", "", " 다음 날"];

type ResolvedRow = { dayKey: string; seq: number; base: string; isSubstitute: boolean };

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

type RestDeItem = z.infer<typeof ItemSchema>;

function readServiceKey(): string {
  let key: string;

  try {
    key = ensureEnv(SERVICE_KEY_ENV);
  } catch {
    throw new Error(
      `${SERVICE_KEY_ENV} is not set. Issue a 특일 정보 key at ${PORTAL_URL} and put it in .env.local.`,
    );
  }

  // INFO: The portal issues the key twice; decoding an encoded copy first leaves `URLSearchParams` exactly one layer to apply, so either copy works and a base64 key never contains `%` to confuse the test.
  return key.includes("%") ? decodeURIComponent(key) : key;
}

function readFromYear(): number {
  const flag = process.argv.find((value) => value.startsWith(FROM_FLAG));

  if (!flag) {
    return CURRENT_YEAR;
  }

  const from = Number(flag.slice(FROM_FLAG.length));

  if (!Number.isInteger(from) || from < EARLIEST_YEAR || from > CURRENT_YEAR) {
    throw new Error(
      `${FROM_FLAG}${flag.slice(FROM_FLAG.length)} is not a year this table can be extended back to. Pass a year between ${EARLIEST_YEAR} and ${CURRENT_YEAR}, or drop the flag to refetch ${CURRENT_YEAR} onward.`,
    );
  }

  return from;
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

async function fetchMonth(year: number, month: number, serviceKey: string): Promise<RestDeItem[]> {
  const period = `${year}-${String(month).padStart(2, "0")}`;
  const url = new URL(ENDPOINT);

  url.search = new URLSearchParams({
    serviceKey,
    _type: "json",
    numOfRows: String(PAGE_SIZE),
    pageNo: "1",
    solYear: String(year),
    solMonth: String(month).padStart(2, "0"),
  }).toString();

  const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT) });
  const text = await response.text();
  const payload = parseJson(text);
  const rejection = describeGatewayError(text, payload);

  if (rejection) {
    throw new Error(
      `특일 정보 rejected the request for ${period}: ${rejection}. Check ${SERVICE_KEY_ENV} against ${PORTAL_URL}.`,
    );
  }

  if (!response.ok) {
    throw new Error(`특일 정보 answered HTTP ${response.status} for ${period}: ${text.trim()}`);
  }

  const { header, body } = ResponseSchema.parse(payload).response;

  if (header.resultCode !== "00") {
    throw new Error(
      `특일 정보 answered ${header.resultCode} ${header.resultMsg} for ${period}, so nothing about that month can be trusted.`,
    );
  }

  if (body.totalCount > PAGE_SIZE) {
    throw new Error(
      `특일 정보 has ${body.totalCount} rows for ${period}, past the ${PAGE_SIZE}-row page this script asks for — raise PAGE_SIZE or start paging.`,
    );
  }

  const items = body.items === "" ? [] : (body.items.item ?? []);

  return items.filter((item) => item.isHoliday === "Y");
}

// WARN: Every month is named because nothing pins what omitting `solMonth` returns, and no month may be caught individually — a single-month answer and a swallowed request both delete a year and write a fraction of it back.
async function fetchYear(year: number, serviceKey: string): Promise<RestDeItem[]> {
  const items: RestDeItem[] = [];

  for (let month = 1; month <= MONTHS_IN_YEAR; month += 1) {
    items.push(...(await fetchMonth(year, month, serviceKey)));
  }

  return items;
}

function resolveName(dateName: string): string {
  const key = dateName.replace(ORDINAL_PATTERN, "").replaceAll(" ", "");

  // WARN: `Object.hasOwn` and not a truthiness test, exactly as `findHoliday` does — a `dateName` normalising to `toString` would otherwise answer with an inherited member and interpolate a Function into the emitted source.
  if (!Object.hasOwn(HOLIDAY_NAMES, key)) {
    throw new Error(
      `특일 정보 returned an unmapped dateName ${JSON.stringify(dateName)}. Decide the Korean copy it should carry and add it to HOLIDAY_NAMES in ${SCRIPT_PATH}.`,
    );
  }

  return HOLIDAY_NAMES[key];
}

/**
 * The holiday a bare `대체공휴일` stands in for, claiming it so the next one cannot.
 *
 * WARN: The row is claimed because two consecutive bare substitutes would otherwise
 * both read the same displaced holiday and one 빨간 날 would carry the wrong name.
 * The qualified `대체공휴일(설날)` form the API now mostly sends never reaches here;
 * this is the legacy shape's safety net.
 */
function inferSubstituteBase(
  resolved: ResolvedRow[],
  claimed: Set<number>,
  dayKey: string,
): string {
  const override = Object.hasOwn(SUBSTITUTE_BASES, dayKey) ? SUBSTITUTE_BASES[dayKey] : undefined;

  // WARN: The statute pairs consecutive substitutes to the holidays they replace in the order those fall, which a backward search cannot see — the two red days differ only in name, so the pairing is guessed rather than derived.
  if (!override && resolved.at(-1)?.isSubstitute) {
    throw new Error(
      `The 대체공휴일 on ${dayKey} follows another one, so which holiday each stands in for is not derivable — add "${dayKey}" to SUBSTITUTE_BASES in ${SCRIPT_PATH} naming the one it replaces.`,
    );
  }

  const candidate = resolved.findLastIndex(
    (row, index) =>
      !row.isSubstitute && !claimed.has(index) && (!override || row.base === override),
  );

  if (candidate < 0) {
    throw new Error(
      `The 대체공휴일 on ${dayKey} has no unclaimed ${override ?? "holiday"} before it to stand in for.`,
    );
  }

  claimed.add(candidate);

  if (override) {
    return override;
  }

  const displaced = resolved[candidate];
  const isAmbiguous = resolved.some(
    (row, index) => index !== candidate && !row.isSubstitute && row.dayKey === displaced.dayKey,
  );

  if (isAmbiguous) {
    throw new Error(
      `${displaced.dayKey} carried more than one 공휴일, so the bare 대체공휴일 on ${dayKey} could stand in for either — add "${dayKey}" to SUBSTITUTE_BASES in ${SCRIPT_PATH} naming the one it replaces.`,
    );
  }

  return displaced.base;
}

function resolveRows(items: RestDeItem[]): ResolvedRow[] {
  const sorted = [...items].sort((a, b) => a.locdate.localeCompare(b.locdate) || a.seq - b.seq);
  const resolved: ResolvedRow[] = [];
  const claimed = new Set<number>();

  for (const item of sorted) {
    const dayKey = `${item.locdate.slice(0, 4)}-${item.locdate.slice(4, 6)}-${item.locdate.slice(6)}`;
    const qualified = QUALIFIED_PATTERN.exec(item.dateName);

    if (qualified) {
      resolved.push({
        dayKey,
        seq: item.seq,
        base: resolveName(qualified[2]),
        isSubstitute: qualified[1] === SUBSTITUTE_NAME,
      });
    } else if (item.dateName === SUBSTITUTE_NAME) {
      resolved.push({
        dayKey,
        seq: item.seq,
        base: inferSubstituteBase(resolved, claimed, dayKey),
        isSubstitute: true,
      });
    } else {
      resolved.push({
        dayKey,
        seq: item.seq,
        base: resolveName(item.dateName),
        isSubstitute: false,
      });
    }
  }

  return resolved;
}

function groupConsecutiveDays(indexes: number[], resolved: ResolvedRow[]): number[][] {
  const blocks: number[][] = [];
  let previous: Optional<number>;

  for (const index of indexes) {
    const isNextDay =
      previous !== undefined &&
      shiftDayKey(resolved[previous].dayKey, 1) === resolved[index].dayKey;

    if (isNextDay) {
      blocks[blocks.length - 1].push(index);
    } else {
      blocks.push([index]);
    }

    previous = index;
  }

  return blocks;
}

function toDisplayNames(resolved: ResolvedRow[]): string[] {
  const names = resolved.map((row) => row.base);

  for (const holiday of BLOCK_HOLIDAYS) {
    const indexes = resolved
      .map((row, index) => (row.base === holiday && !row.isSubstitute ? index : -1))
      .filter((index) => index >= 0);

    for (const block of groupConsecutiveDays(indexes, resolved)) {
      if (block.length !== BLOCK_SUFFIXES.length) {
        throw new Error(
          `${holiday} runs ${block.length} day(s) from ${resolved[block[0]].dayKey}, where REQUIREMENTS.md § 11.7. names a three-day block — the statute moved and the 전날/다음 날 split no longer follows.`,
        );
      }

      block.forEach((index, position) => {
        names[index] = `${holiday}${BLOCK_SUFFIXES[position]}`;
      });
    }
  }

  return names;
}

function toEntries(resolved: ResolvedRow[], names: string[]): Map<string, HolidayEntry> {
  const byDay = Map.groupBy(resolved.keys(), (index) => resolved[index].dayKey);
  const entries = new Map<string, HolidayEntry>();

  for (const [dayKey, indexes] of byDay) {
    const substitutes = indexes.map((index) => resolved[index].isSubstitute);

    if (substitutes.some(Boolean) && !substitutes.every(Boolean)) {
      throw new Error(
        `${dayKey} carries a 대체공휴일 and an ordinary 공휴일 at once, which one table entry cannot say.`,
      );
    }

    // INFO: REQUIREMENTS.md § 11.7. — two holidays on one date are still one red cell, so their names join in the order the API sequenced them.
    const name = indexes.map((index) => names[index]).join(" · ");

    entries.set(dayKey, substitutes[0] ? [name, true] : [name]);
  }

  return entries;
}

function renderSource(entries: Map<string, HolidayEntry>): string {
  const sorted = [...entries].sort(([a], [b]) => (a < b ? -1 : 1));
  const years = sorted.map(([dayKey]) => dayKey.slice(0, 4));
  const lines = sorted.map(
    ([dayKey, [name, isSubstitute]]) =>
      `  "${dayKey}": ["${name}"${isSubstitute ? ", true" : ""}],`,
  );

  return `// WARN: Generated by \`pnpm holidays\` from 공공데이터포털 특일 정보 (한국천문연구원) — a hand edit is lost on the next run.

import type { Optional } from "../nullish";

/**
 * \`[name]\`, or \`[name, true]\` for a 대체공휴일.
 *
 * WARN: One entry per day, so a date carrying two holidays writes both into the one
 * name joined by \` · \` — 2025-05-05 is 어린이날 and 부처님오신날, 2028-10-03 is 추석 and
 * 개천절. Splitting the field would buy nothing: the day is one red cell either way,
 * and the 대체공휴일 the collision produces is already its own dated entry.
 */
export type HolidayEntry = readonly [name: string, isSubstitute?: true];

/**
 * REQUIREMENTS.md § 11.7. ${years.at(0)} – ${years.at(-1)}, as a table rather than a derivation.
 *
 * WARN: 설날 · 추석 · 부처님오신날 are lunisolar, 대체공휴일 follows from wherever they
 * land, and an 임시공휴일 is a cabinet decree — so no arithmetic here can carry this
 * past the last year written out below, and a day outside it answers \`null\`.
 *
 * INFO: \`pnpm holidays\` refetches the current year and the two after it and carries
 * every other year over untouched, so a year outside that window moves only under an
 * explicit \`--from\` (REQUIREMENTS.md § 11.7.).
 */
export const HOLIDAYS: Record<string, Optional<HolidayEntry>> = {
${lines.join("\n")}
};
`;
}

function countYear(entries: Map<string, HolidayEntry>, year: number): number {
  return [...entries.keys()].filter((dayKey) => dayKey.startsWith(`${year}-`)).length;
}

async function main() {
  if (process.argv.includes("--help")) {
    console.log(USAGE);

    return;
  }

  const serviceKey = readServiceKey();
  const fromYear = readFromYear();
  const lastYear = CURRENT_YEAR + FUTURE_YEARS;
  const merged = new Map<string, HolidayEntry>();

  for (const [dayKey, entry] of Object.entries(HOLIDAYS)) {
    if (entry) {
      merged.set(dayKey, entry);
    }
  }

  console.log(
    `Refetching ${fromYear}-${lastYear}; earlier years keep what the table holds (${FROM_FLAG}YYYY widens this).`,
  );

  for (let year = fromYear; year <= lastYear; year += 1) {
    const items = await fetchYear(year, serviceKey);

    // WARN: Korea has no holiday-free year, so an empty answer is 월력요항 that has not been published yet — never a year whose holidays were withdrawn, and never a reason to drop what the table already holds.
    if (items.length === 0) {
      if (year <= CURRENT_YEAR) {
        throw new Error(
          `특일 정보 returned no 공휴일 for ${year}, a year that has already begun — that is a broken request, not an empty one.`,
        );
      }

      console.log(`${year}: not published yet, kept ${countYear(merged, year)} existing entries`);
      continue;
    }

    for (const dayKey of [...merged.keys()]) {
      if (dayKey.startsWith(`${year}-`)) {
        merged.delete(dayKey);
      }
    }

    const resolved = resolveRows(items);

    for (const [dayKey, entry] of toEntries(resolved, toDisplayNames(resolved))) {
      merged.set(dayKey, entry);
    }

    console.log(`${year}: ${countYear(merged, year)} 공휴일 from 특일 정보`);
  }

  const config = await resolveConfig(TABLE_PATH);
  const next = await format(renderSource(merged), { ...config, filepath: TABLE_PATH });

  await writeFile(TABLE_PATH, next, "utf8");
  console.log(`Wrote ${merged.size} holidays to ${TABLE_RELATIVE_PATH}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
