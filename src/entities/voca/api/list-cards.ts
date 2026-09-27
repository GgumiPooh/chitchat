import "server-only";

import { getDb, vocaCards } from "@/shared/db";
import type { Nullable, UserId, VocaCardId } from "@/shared/lib";
import { and, desc, eq, ilike, isNull, lt, or, type SQL } from "drizzle-orm";
import { toVocaCard, type VocaCard, type VocaCardState } from "../model/types";

export type ListVocaCardsOptions = {
  userId: UserId;
  state?: VocaCardState;
  suspended?: boolean;
  search?: string;
  query?: string;
  tag?: string;
  cursor?: VocaCardId;
  before?: VocaCardId;
  limit?: number;
};

export type ListVocaCardsResult = {
  items: VocaCard[];
  cards: VocaCard[];
  nextCursor: Nullable<VocaCardId>;
  hasMore: boolean;
};

export async function listVocaCards({
  userId,
  state,
  suspended,
  search,
  query,
  tag,
  cursor,
  before,
  limit = 30,
}: ListVocaCardsOptions): Promise<ListVocaCardsResult> {
  const db = getDb();
  const filters: SQL[] = [eq(vocaCards.userId, userId), isNull(vocaCards.deletedAt)];

  if (state) {
    filters.push(eq(vocaCards.state, state));
  }

  if (suspended !== undefined) {
    filters.push(eq(vocaCards.suspended, suspended));
  }

  const effectiveSearch = (search ?? query)?.trim();
  if (effectiveSearch && effectiveSearch.length > 0) {
    const pattern = `%${effectiveSearch}%`;
    filters.push(
      or(
        ilike(vocaCards.targetWord, pattern),
        ilike(vocaCards.koreanMeaning, pattern),
        ilike(vocaCards.sentence, pattern),
        ilike(vocaCards.tags, pattern),
      )!,
    );
  }

  if (tag && tag.trim().length > 0) {
    filters.push(ilike(vocaCards.tags, `%${tag.trim()}%`));
  }

  const effectiveBefore = before ?? cursor;
  if (effectiveBefore) {
    filters.push(lt(vocaCards.id, effectiveBefore));
  }

  const rows = await db
    .select()
    .from(vocaCards)
    .where(and(...filters))
    .orderBy(desc(vocaCards.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const slicedRows = hasMore ? rows.slice(0, limit) : rows;
  const items = slicedRows.map(toVocaCard);
  const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

  return {
    items,
    cards: items,
    nextCursor,
    hasMore,
  };
}
