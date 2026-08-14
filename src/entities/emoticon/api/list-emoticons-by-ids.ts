import type { EmoticonItemId } from "@/shared/lib";
import "server-only";

import { MAX_EMOTICON_ID_LOOKUP } from "@/shared/config";
import { emoticonItems, getDb } from "@/shared/db";
import { and, asc, inArray, isNull } from "drizzle-orm";
import { toEmoticon } from "../model/to-emoticon";
import type { Emoticon } from "../model/types";

/**
 * The items named by id (REQUIREMENTS.md § 13.6.).
 *
 * INFO: § 13.6. 최근 사용 stores ids and nothing else, so this is what draws it.
 * Storing whole items instead would freeze `version` in `localStorage` and serve the
 * asset an edit replaced, which is the staleness § 13.2. versions the URL against.
 *
 * WARN: The caller's order is not this order and MUST be reapplied — 최근 사용 is
 * most-recent-first, and an id whose item is gone is simply absent here.
 *
 * WARN: `MAX_EMOTICON_ID_LOOKUP` is applied **here and nowhere else**. The route used
 * to cut the list as well, which is one constant read in two places and only one of
 * them ever being corrected — the bound belongs on the query, where it holds for
 * whatever calls it.
 */
export async function listEmoticonsByIds(ids: EmoticonItemId[]): Promise<Emoticon[]> {
  if (ids.length === 0) {
    return [];
  }

  const rows = await getDb()
    .select()
    .from(emoticonItems)
    // INFO: The finished restructure. A retired item is gone from everywhere the user chooses from — the picker, search and 최근 사용 — while every bubble that already carries it renders unchanged.
    .where(
      and(
        inArray(emoticonItems.id, ids.slice(0, MAX_EMOTICON_ID_LOOKUP)),
        isNull(emoticonItems.retiredAt),
      ),
    )
    .orderBy(asc(emoticonItems.packId), asc(emoticonItems.sortOrder), asc(emoticonItems.id));

  return rows.map(toEmoticon);
}
