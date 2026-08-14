import "server-only";

import {
  EMOTICON_SEARCH_CANDIDATE_LIMIT,
  EMOTICON_SEARCH_PAGE_SIZE,
  MAX_EMOTICON_KEYWORD_LENGTH,
  MIN_KEYWORD_LENGTH,
  toKeywordRelevance,
} from "@/shared/config";
import { emoticonItems, emoticonKeywords, getDb } from "@/shared/db";
import { and, asc, ilike, inArray, isNull, type SQL } from "drizzle-orm";
import { union } from "drizzle-orm/pg-core";
import { toEmoticon } from "../model/to-emoticon";
import type { Emoticon } from "../model/types";
import { toLikeLiteral } from "./to-like-literal";

/**
 * REQUIREMENTS.md § 13.9. The picker's search, ranked (§ 13.9.1.).
 *
 * WARN: § 13.8. No `enabled` filter, deliberately. Hiding a pack takes it out of the
 * tab strip and withdraws no answer — filtered here, an emoticon the other
 * participant sent from a pack this user hid would be unreachable by any means at
 * all, and § 13.9.'s 따라하기 would have nothing to land on.
 *
 * INFO: § 13.9.1. Two statements rather than one join: `emoticon_keywords` selects
 * the candidate ids off its indexes, and the items are then read whole so
 * `toKeywordRelevance` can rank them against the authored `keywords` array — which
 * is the case-preserving list the ladder is defined over.
 */
export async function searchEmoticons(terms: string[]): Promise<Emoticon[]> {
  const candidateIds = toCandidateIds(terms);

  if (!candidateIds) {
    return [];
  }

  const rows = await getDb()
    .select()
    .from(emoticonItems)
    // INFO: RESTRUCTURE.md § 4.4. A retired item is gone from everywhere the user chooses from — the picker, search and 최근 사용 — while every bubble that already carries it renders unchanged.
    .where(and(inArray(emoticonItems.id, candidateIds), isNull(emoticonItems.retiredAt)))
    // INFO: § 13.9.1. Authoring order, which decides nothing about what is kept — the cut is upstream — and everything about which of two equally relevant items the stable sort below leaves first.
    .orderBy(asc(emoticonItems.packId), asc(emoticonItems.sortOrder), asc(emoticonItems.id));

  return (
    rows
      .map((row) => ({ item: toEmoticon(row), relevance: toKeywordRelevance(row.keywords, terms) }))
      // INFO: The ladder and the SQL above select the same set, so this drops nothing in practice — it is what keeps a drift between them out of the results rather than at the top of them.
      .filter((scored) => scored.relevance > 0)
      // WARN: A stable sort, so authoring order still decides inside one relevance step — an item must not change places with an equally relevant one between keystrokes.
      .sort((left, right) => right.relevance - left.relevance)
      .slice(0, EMOTICON_SEARCH_PAGE_SIZE)
      .map((scored) => scored.item)
  );
}

/**
 * The bounded set of candidate item ids the terms reach (REQUIREMENTS.md § 13.9.1.),
 * or null when there is nothing to ask at all.
 *
 * WARN: § 13.9.1. A `UNION` of one select per predicate, never an `OR` of several in
 * one `WHERE`. Postgres plans a single `WHERE` as one predicate over one relation, so
 * an arm it cannot index costs every other arm its index too — which is how the
 * reverse direction's btree came to go unused for every search, and then how one
 * two-character term came to take the trigram index away from every longer term
 * beside it.
 *
 * WARN: § 13.9.1. The cap belongs **here** and not on the items select. Applied
 * downstream it bounded the rows the candidates produced while the candidate set
 * itself stayed unbounded, which is the opposite of what
 * `EMOTICON_SEARCH_CANDIDATE_LIMIT` is for.
 *
 * WARN: `item_id` order, which is relevance-blind — the compromise that constant
 * documents. It is ordered at all so two identical searches answer identically, which
 * an unordered `LIMIT` does not.
 *
 * WARN: Null when the terms reach nothing at all, which is not the same as a predicate
 * matching nothing — an empty `where` is the whole library.
 */
function toCandidateIds(terms: string[]) {
  const [first, second, ...rest] = toCandidatePredicates(terms);

  if (!first) {
    return null;
  }

  // WARN: `selectDistinct` here and plain selects in the arms below, because `union()` already deduplicates — inside an arm it only buys a second sort. This branch has no union over it, and an item carrying two matching keywords would otherwise spend two of the cap's rows on itself.
  if (!second) {
    return getDb()
      .selectDistinct({ itemId: emoticonKeywords.itemId })
      .from(emoticonKeywords)
      .where(first)
      .orderBy(emoticonKeywords.itemId)
      .limit(EMOTICON_SEARCH_CANDIDATE_LIMIT);
  }

  return union(
    selectCandidateIds(first),
    selectCandidateIds(second),
    ...rest.map((predicate) => selectCandidateIds(predicate)),
  )
    .orderBy(emoticonKeywords.itemId)
    .limit(EMOTICON_SEARCH_CANDIDATE_LIMIT);
}

/**
 * One indexable predicate per arm of the `UNION` above (REQUIREMENTS.md § 13.9.1.).
 *
 * WARN: § 13.9.1. **Per term**, not one `OR` over every term. `MIN_KEYWORD_LENGTH` is
 * two, so a two-character term is an ordinary query rather than an edge case, and
 * 따라하기 fills the field with up to `MAX_EMOTICON_KEYWORDS` of them — folded into one
 * arm, that single unindexable term made every longer term beside it a full scan too.
 */
function toCandidatePredicates(terms: string[]): SQL[] {
  // INFO: § 13.9.1. The forward direction, `keyword.includes(term)` — `고민` reaching the item tagged `고민되는군`. Trigram GIN, which a term under three characters cannot use (§ 8.6. accepts the same limit in message search).
  const predicates = terms.map((term) =>
    ilike(emoticonKeywords.keyword, `%${toLikeLiteral(term.toLowerCase())}%`),
  );
  const substrings = new Set<string>();

  for (const term of terms) {
    for (const substring of toProbeSubstrings(term.toLowerCase())) {
      substrings.add(substring);
    }
  }

  // INFO: A term shorter than `MIN_KEYWORD_LENGTH` enumerates no substring at all, so the reverse arm can be absent where a forward one always is.
  if (substrings.size > 0) {
    // INFO: § 13.9.1. The reverse direction as equality against the btree — Postgres rewrites an `IN` list into `= ANY`, which is one index scan whatever the list's length. One arm shared by every term, unlike the forward direction above — the probe is exact at any length, so no term loses an index by riding in it, and the btree is read once instead of per term.
    predicates.push(inArray(emoticonKeywords.keyword, [...substrings]));
  }

  return predicates;
}

function selectCandidateIds(where: SQL) {
  return getDb().select({ itemId: emoticonKeywords.itemId }).from(emoticonKeywords).where(where);
}

/**
 * Every substring of a query term that could be a stored keyword
 * (REQUIREMENTS.md § 13.9.1.).
 *
 * WARN: This is **exact**, not an approximation, and the bounds are what make it so.
 * The reverse direction asks `term.includes(keyword)`, which no index can answer as
 * written; inverted, it asks whether any stored keyword equals a substring of the
 * term. Every indexed keyword is at least `MIN_KEYWORD_LENGTH` and at most
 * `MAX_EMOTICON_KEYWORD_LENGTH`, because the migration's trigger and backfill drop
 * both ends — `normalizeKeywords` guards only the two write paths it is called from,
 * so a row older than that rule is exactly the one the index has to bound itself. A
 * keyword contained in the term is therefore necessarily one of the substrings
 * enumerated here.
 *
 * WARN: Widening either bound silently breaks the equivalence rather than the query.
 * A keyword allowed to be one character would be missed in this direction; one
 * allowed past twenty would be missed for a term long enough to hold it.
 *
 * WARN: § 13.9.1. The **term** is bounded here as well as the substrings taken off
 * it, and that bound is where the identity above stops. Nothing caps one term's
 * length — `splitKeywordQuery` splits on commas, so a paste with none in it is a
 * single 264-character term (`MAX_KEYWORD_QUERY_LENGTH`) and enumerated whole it is
 * some 4,800 bind parameters per debounced keystroke. Cut to
 * `MAX_EMOTICON_KEYWORD_LENGTH` the worst case is `MAX_EMOTICON_KEYWORDS` × 190,
 * which is what 따라하기 already costs. What it gives up is a keyword sitting past
 * the twentieth character of such a paste; a term that long is not a word with a
 * particle on it, which is the case this direction exists for.
 */
function toProbeSubstrings(foldedTerm: string): string[] {
  const letters = [...foldedTerm].slice(0, MAX_EMOTICON_KEYWORD_LENGTH);
  const found: string[] = [];
  const longest = Math.min(MAX_EMOTICON_KEYWORD_LENGTH, letters.length);

  for (let length = MIN_KEYWORD_LENGTH; length <= longest; length += 1) {
    for (let start = 0; start + length <= letters.length; start += 1) {
      found.push(letters.slice(start, start + length).join(""));
    }
  }

  return found;
}
