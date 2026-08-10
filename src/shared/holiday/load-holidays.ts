import "server-only";

import { ensureEnv, IS_DEV } from "@/shared/config";
import {
  A_DAY,
  A_MINUTE,
  A_SECOND,
  AN_HOUR,
  FALLBACK_HOLIDAYS,
  toDayKey,
  type HolidayEntry,
  type HolidayTable,
  type Nullable,
  type Optional,
} from "@/shared/lib";
import { cache } from "react";
import { findMissingLunisolar, toHolidayEntries } from "./resolve";
import {
  fetchHolidayYear,
  HOLIDAY_PORTAL_URL,
  HOLIDAY_SERVICE_KEY_ENV,
  normalizeServiceKey,
} from "./restde";

const TABLE_PATH = "src/shared/lib/date/holiday-table.ts";

/**
 * How long an answered year stays in Next's `fetch` Data Cache.
 *
 * INFO: REQUIREMENTS.md § 11.7. A month is the cadence an 임시공휴일 needs — it is decreed with weeks of notice, and 월력요항 moves once a year.
 */
const CACHE_LIFETIME = 30 * A_DAY;

/**
 * How long one year's requests may take between them.
 *
 * WARN: A budget for the year rather than a deadline per request (`HolidayRequestOptions.signal`), so the worst a render blocks for is this times the number of years asked about.
 * INFO: Generous, because an aborted fetch writes nothing to the Data Cache — cutting off a slow-but-working gateway discards work that would otherwise have lasted a month, and `FAILURE_BACKOFF` is what bounds a gateway that is actually down.
 */
const YEAR_DEADLINE = 8 * A_SECOND;

/**
 * How long a year that failed is left alone before it is asked about again.
 *
 * WARN: REQUIREMENTS.md § 11.7. This is what a lapsed 활용기간 needs. The variable is still set, so the key itself reads fine and every render would otherwise spend the whole request budget rediscovering the same rejection — and nothing durable remembers it, since neither a rejected nor an aborted fetch is written to the Data Cache.
 * INFO: An hour, not a day: long enough that a dead gateway costs one blocked render an hour rather than one per reader, short enough that an operator who renews the key sees it take effect in the session they renewed it in.
 */
const FAILURE_BACKOFF = AN_HOUR;

// INFO: REQUIREMENTS.md § 11.7. 특일 정보 covers 2004 through the year after the current one, and everything behind the current year is settled — so this window is the whole of what a request can usefully ask.
const YEARS_AHEAD = 1;

/**
 * When each year may be asked about again, after a failure on it.
 *
 * WARN: Module scope, so it is per serverless instance and a cold one pays a failed
 * load of its own. That is the bound rather than a defect — the alternative is the
 * full request budget on every render — and it is deliberately keyed by year: a year
 * already in the Data Cache costs no request at all, so one year failing must not
 * stop the other being served from that cache.
 */
const askAgainAt = new Map<number, number>();

// INFO: The years already described in the log, so a condition that persists for weeks (a 월력요항 not yet published) is stated once per instance rather than once per render.
const reportedYears = new Set<number>();

// INFO: Only ever set in development, where having no key is the documented normal state (.env.example) rather than something to repeat.
let hasReportedMissingKey = false;

/**
 * WARN: A deployment without a key and a laptop without one are the same absence and
 * must not read the same. Locally it is exactly what `.env.example` prescribes; on a
 * deployment it is § 15.'s list unfulfilled, and one message for both makes a lapsed
 * production key — the case § 11.7. exists for — read like somebody's laptop.
 */
function reportMissingKey() {
  if (!IS_DEV) {
    console.error(
      `[공휴일] ${HOLIDAY_SERVICE_KEY_ENV} is not set on this deployment, so 특일 정보 is never asked and 공휴일 are frozen at ${TABLE_PATH}. REQUIREMENTS.md § 15. expects it set; issue a key at ${HOLIDAY_PORTAL_URL}.`,
    );

    return;
  }

  if (hasReportedMissingKey) {
    return;
  }

  hasReportedMissingKey = true;
  console.info(
    `[공휴일] ${HOLIDAY_SERVICE_KEY_ENV} is not set, so the calendar is drawing ${TABLE_PATH} as committed. That is the expected local default (.env.example) — set the key in .env.local to exercise 특일 정보 itself.`,
  );
}

function readServiceKey(): Optional<string> {
  try {
    return normalizeServiceKey(ensureEnv(HOLIDAY_SERVICE_KEY_ENV));
  } catch {
    reportMissingKey();

    return undefined;
  }
}

function reportKeptYear(year: number, reason: string) {
  if (reportedYears.has(year)) {
    return;
  }

  reportedYears.add(year);
  console.error(`[공휴일] ${reason}. ${TABLE_PATH} keeps ${year} rather than replacing it.`);
}

async function readYear(
  year: number,
  serviceKey: string,
  signal: AbortSignal,
): Promise<Nullable<Map<string, HolidayEntry>>> {
  try {
    const items = await fetchHolidayYear(year, {
      serviceKey,
      signal,
      revalidate: CACHE_LIFETIME / A_SECOND,
    });

    return toHolidayEntries(items);
  } catch (error) {
    askAgainAt.set(year, Date.now() + FAILURE_BACKOFF);

    // WARN: REQUIREMENTS.md § 11.7. Silent for the reader and loud here, because an expired key announces itself nowhere else — behind a month-long cache this line is the only thing that reports one.
    console.error(
      `[공휴일] 특일 정보 could not be read for ${year}, so the calendar is drawing ${TABLE_PATH} as committed for that year and will not ask again for ${FAILURE_BACKOFF / A_MINUTE} minutes. ${error instanceof Error ? error.message : String(error)}`,
    );

    return null;
  }
}

/**
 * REQUIREMENTS.md § 11.7. Every 공휴일 the calendar draws — the committed table with
 * 특일 정보's answer for the mutable years laid over it.
 *
 * INFO: The requests underneath are cached (`CACHE_LIFETIME`) through `fetch`'s own
 * `next.revalidate`, which is a layer of its own and needs no configuration flag. The
 * year they are asked about is read from the clock and is not cached with them.
 */
export const loadHolidays = cache(async (): Promise<HolidayTable> => {
  const table: HolidayTable = { ...FALLBACK_HOLIDAYS };
  const serviceKey = readServiceKey();

  if (!serviceKey) {
    return table;
  }

  const now = Date.now();
  const currentYear = Number(toDayKey(now).slice(0, 4));
  const years: number[] = [];

  for (let year = currentYear; year <= currentYear + YEARS_AHEAD; year += 1) {
    if ((askAgainAt.get(year) ?? 0) <= now) {
      years.push(year);
    }
  }

  for (const year of years) {
    // WARN: One signal per year rather than one for the load — a first-ever fill has both years to fetch, and a shared budget would spend it on the first and open the second's breaker against a gateway that is answering perfectly well.
    const entries = await readYear(year, serviceKey, AbortSignal.timeout(YEAR_DEADLINE));

    if (!entries) {
      continue;
    }

    // WARN: REQUIREMENTS.md § 11.7. Coverage, never a row count. Asked about a year 월력요항 has not reached, 특일 정보 answers with the fixed dates it derives by rule and nothing else — replacing a committed year with those deletes the lunisolar tail and leaves a hole that reads as settled.
    const missing = findMissingLunisolar(entries);

    if (missing.length > 0) {
      if (entries.size === 0) {
        // INFO: A future year answered with nothing is a 월력요항 not yet published, which is the normal state for months at a time; the same answer for a year already under way is a broken request.
        if (year === currentYear) {
          reportKeptYear(
            year,
            `특일 정보 answered ${year}, a year already under way, with no 공휴일 at all — that is a broken request rather than an empty one`,
          );
        }
      } else {
        reportKeptYear(
          year,
          `특일 정보 answered ${year} with ${entries.size} 공휴일 but no ${missing.join(", ")}, so 월력요항 has not reached it and the answer is the rule-derived half of a year`,
        );
      }

      continue;
    }

    for (const dayKey of Object.keys(table)) {
      if (dayKey.startsWith(`${year}-`)) {
        delete table[dayKey];
      }
    }

    for (const [dayKey, entry] of entries) {
      table[dayKey] = entry;
    }
  }

  return table;
});
