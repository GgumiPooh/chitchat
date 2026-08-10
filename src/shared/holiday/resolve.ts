import { shiftDayKey, type HolidayEntry, type Optional } from "@/shared/lib";
import { type RestDeItem } from "./restde";

const MODULE_PATH = "src/shared/holiday/resolve.ts";

/**
 * The API's `dateName` mapped onto this product's own copy.
 *
 * WARN: Every name that reaches a cell comes through here, and an unmapped one
 * fails the year. That is deliberate — API wording is not product copy (`기독탄신일`
 * is not `성탄절`), so a renamed or newly decreed holiday has to fail loudly rather
 * than walk onto a calendar cell in 천문연구원's spelling, and a table that quietly
 * omits a 공휴일 is the worse outcome. REQUIREMENTS.md § 11.7.'s fallback is what
 * the reader sees while that is true.
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

// INFO: REQUIREMENTS.md § 11.7. Two 공휴일 on one date are one red cell, so the join is what one entry's name carries and what `findMissingLunisolar` has to split back apart.
const NAME_SEPARATOR = " · ";

// INFO: REQUIREMENTS.md § 11.7. The lunisolar 공휴일, which reach 특일 정보 only when 월력요항 does — 부처님오신날 rides the same publication as the two blocks above and is not derivable without it either.
const LUNISOLAR_HOLIDAYS = [...BLOCK_HOLIDAYS, "부처님오신날"];

type ResolvedRow = { dayKey: string; seq: number; base: string; isSubstitute: boolean };

function resolveName(dateName: string): string {
  const key = dateName.replace(ORDINAL_PATTERN, "").replaceAll(" ", "");

  // WARN: `Object.hasOwn` and not a truthiness test, exactly as `findHoliday` does — a `dateName` normalising to `toString` would otherwise answer with an inherited member and carry a Function onto a calendar cell.
  if (!Object.hasOwn(HOLIDAY_NAMES, key)) {
    throw new Error(
      `특일 정보 returned an unmapped dateName ${JSON.stringify(dateName)}. Decide the Korean copy it should carry and add it to HOLIDAY_NAMES in ${MODULE_PATH}.`,
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
      `The 대체공휴일 on ${dayKey} follows another one, so which holiday each stands in for is not derivable — add "${dayKey}" to SUBSTITUTE_BASES in ${MODULE_PATH} naming the one it replaces.`,
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
      `${displaced.dayKey} carried more than one 공휴일, so the bare 대체공휴일 on ${dayKey} could stand in for either — add "${dayKey}" to SUBSTITUTE_BASES in ${MODULE_PATH} naming the one it replaces.`,
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
    const name = indexes.map((index) => names[index]).join(NAME_SEPARATOR);

    entries.set(dayKey, substitutes[0] ? [name, true] : [name]);
  }

  return entries;
}

/**
 * 특일 정보's rows as the calendar's own entries, keyed by day.
 *
 * WARN: Throws on anything it cannot attribute — an unmapped `dateName`, a 설날
 * block that is no longer three days, a bare `대체공휴일` with no unambiguous holiday
 * behind it. A year is resolved whole or not at all, because a partial answer looks
 * exactly like a year with fewer 공휴일 in it.
 */
export function toHolidayEntries(items: RestDeItem[]): Map<string, HolidayEntry> {
  const resolved = resolveRows(items);

  return toEntries(resolved, toDisplayNames(resolved));
}

/**
 * The lunisolar 공휴일 a resolved year does not contain — empty when it is whole.
 *
 * WARN: REQUIREMENTS.md § 11.7. The test a year must pass before it may replace a
 * committed one, and **counting rows cannot stand in for it**. Asked about a year
 * 월력요항 has not reached, 특일 정보 answers with the fixed dates it can derive by
 * rule and nothing else — nine or ten entries, enough to read as an answer, short
 * exactly the tail no arithmetic can reconstruct.
 *
 * INFO: Substitutes are ignored because a qualified `대체공휴일(설날)` can arrive without the 설날 it replaces being in the same answer, which would let a partial year vouch for itself.
 */
export function findMissingLunisolar(entries: Map<string, HolidayEntry>): string[] {
  const names = [...entries.values()]
    .filter(([, isSubstitute]) => !isSubstitute)
    .flatMap(([name]) => name.split(NAME_SEPARATOR));

  return LUNISOLAR_HOLIDAYS.filter((holiday) => !names.some((name) => name.startsWith(holiday)));
}
