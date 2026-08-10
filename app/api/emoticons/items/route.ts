import { listEmoticonKeywords, listEmoticonsByIds, searchEmoticons } from "@/entities/emoticon";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { MAX_KEYWORD_QUERY_LENGTH, splitKeywordQuery } from "@/shared/config";
import { NextResponse } from "next/server";
import { z } from "zod";

// WARN: REQUIREMENTS.md § 13.7.1. jandh-emoticons mirrors this handler, and the browser reaches whichever copy the switch names. Both sides change together — a fix landed here alone is one this app stops running the moment the switch is on.

const idSchema = z.uuid();

/**
 * The item collection, read three ways (REQUIREMENTS.md § 13.9.1.).
 *
 * INFO: One route rather than three, because all three modes are the same collection
 * asked a different question and `EMOTICON_ITEMS_URL` already names this path.
 *
 * INFO: § 13.8. `?keywords=1` answers strings where `?q=` answers items — the
 * composer's underline needs to know a word has emoticons behind it, not which.
 *
 * INFO: § 13.6. `?ids=` is how 최근 사용 resolves what it stored, which is ids alone.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const params = new URL(request.url).searchParams;

  if (params.get("keywords") === "1") {
    return NextResponse.json({ keywords: await listEmoticonKeywords() });
  }

  const ids = params.get("ids");

  if (ids !== null) {
    return NextResponse.json({ emoticons: await listEmoticonsByIds(toIds(ids)) });
  }

  const query = params.get("q");

  if (query === null) {
    return apiError("invalid_request");
  }

  // WARN: § 13.9. Truncated rather than refused, matching the field's own `maxLength` — a query past the cap is a paste, and answering it for the first `MAX_KEYWORD_QUERY_LENGTH` characters is what the user sees in the field anyway.
  const terms = splitKeywordQuery(query.slice(0, MAX_KEYWORD_QUERY_LENGTH));

  // WARN: § 13.9. An empty field is answered with nothing, never with the library. Both directions of the match are containment, and every keyword contains the empty string.
  if (terms.length === 0) {
    return NextResponse.json({ emoticons: [] });
  }

  return NextResponse.json({ emoticons: await searchEmoticons(terms) });
}

/**
 * WARN: § 13.6. Anything that is not a uuid is dropped rather than refused. The list
 * comes out of `localStorage`, where whatever a previous build wrote is still sitting
 * — a `400` for one bad entry would leave 최근 사용 empty until the user cleared their
 * browser, and `inArray` on a non-uuid is a database error rather than no rows.
 *
 * WARN: `MAX_EMOTICON_ID_LOOKUP` is applied by `listEmoticonsByIds` and deliberately
 * not here as well. Two cuts with one constant is one of them going stale silently,
 * and the query is where the bound has to hold whatever the caller is.
 */
function toIds(raw: string): string[] {
  return [...new Set(raw.split(","))].filter((id) => idSchema.safeParse(id).success);
}
