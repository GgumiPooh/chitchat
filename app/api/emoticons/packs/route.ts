import {
  createEmoticonPack,
  listEmoticonPacks,
  listEmoticonPacksPage,
  parseEmoticonPackCursor,
} from "@/entities/emoticon";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import {
  EMOTICON_PACK_PAGE_SIZE,
  MAX_EMOTICON_PACK_NAME_LENGTH,
  MAX_EMOTICON_PACK_PAGE_SIZE,
  emoticonPackScopeSchema,
  emoticonPackTypeSchema,
} from "@/shared/config";
import { NextResponse } from "next/server";
import { z } from "zod";

// WARN: REQUIREMENTS.md § 13.7.1. jandh-emoticons mirrors this handler, and the browser reaches whichever copy the switch names. Both sides change together — a fix landed here alone is one this app stops running the moment the switch is on.

const bodySchema = z.object({
  name: z.string().trim().min(1).max(MAX_EMOTICON_PACK_NAME_LENGTH),
  // WARN: § 13. Required, and settled once — nothing may change a pack's kind afterwards (`0045`), so this is the only request that decides it.
  type: emoticonPackTypeSchema,
});

const querySchema = z.object({
  // WARN: § 13. Required, never defaulted. A missing kind is a `400` rather than a list quietly holding both — `all` is how a caller says it wants both, and § 13.6.'s picker is the only one that may.
  type: emoticonPackScopeSchema,
  enabled: z.literal("1").nullable(),
  // WARN: § 13.5. Truncated rather than refused, matching the field's own `maxLength`, and a blank one is **no filter** — never a filter nothing matches.
  q: z
    .string()
    .nullable()
    .transform((value) => value?.trim().slice(0, MAX_EMOTICON_PACK_NAME_LENGTH) ?? null),
  // INFO: The cursor stays opaque here — `parseEmoticonPackCursor` is the only question this route may ask about one, and a cursor this server did not write is a `400` rather than a silent first page.
  cursor: z
    .string()
    .nullable()
    .refine((value) => value === null || parseEmoticonPackCursor(value) !== null),
  limit: z.coerce.number().int().min(1).max(MAX_EMOTICON_PACK_PAGE_SIZE).nullable(),
});

/**
 * Every pack of one kind, in this user's own order (REQUIREMENTS.md § 13.1.),
 * summaries and nothing else.
 *
 * WARN: § 13. `?type=` is required and has no default. Every caller is a list someone
 * picks from, and each of them belongs to exactly one kind — a request that omits it is
 * a caller that has not decided, which is answered as a bad one rather than with both.
 *
 * INFO: § 13.6. `?items=1` is gone with the picker's payload. The panel takes this
 * list and asks `packs/{id}/items` for the one tab it opens; each summary already
 * names the thumbnail it draws with, which is what the picker used to need the items
 * for.
 *
 * WARN: § 13.8. Hidden packs are included **by default**, and the picker is what
 * filters them out of its tabs. `?enabled=1` used to be the only behaviour and it was
 * not a parameter — which made a hidden pack's items unreachable by search as well as
 * by tab, and § 13.9.'s 따라하기 undeliverable for exactly the emoticon that needs it
 * most. It is opt-in now, and § 13.5.'s 사용중 tab is the one caller.
 *
 * INFO: § 13.5. `q`, `cursor` and `limit` page the answer and add `nextCursor` to it;
 * a request carrying none of the three answers `{ packs }` and the whole list, which is
 * what the picker and 사용중 both read. `?enabled=1` alone is not paging — that tab
 * holds the user's thirty-odd packs and drags them.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const params = new URL(request.url).searchParams;
  const query = querySchema.safeParse({
    type: params.get("type"),
    enabled: params.get("enabled"),
    q: params.get("q"),
    cursor: params.get("cursor"),
    limit: params.get("limit"),
  });

  if (!query.success) {
    return apiError("invalid_request");
  }

  const filter = {
    type: query.data.type,
    enabledOnly: query.data.enabled === "1",
    query: query.data.q ?? undefined,
  };

  if (!isPaged(params)) {
    return NextResponse.json({ packs: await listEmoticonPacks(user.id, filter) });
  }

  return NextResponse.json(
    await listEmoticonPacksPage(user.id, {
      ...filter,
      cursor: query.data.cursor,
      limit: query.data.limit ?? EMOTICON_PACK_PAGE_SIZE,
    }),
  );
}

/** REQUIREMENTS.md § 13.4. A title is the whole form — items and a thumbnail come later. */
export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const body = bodySchema.safeParse(await request.json().catch(() => null));

  if (!body.success) {
    return apiError("invalid_request");
  }

  const pack = await createEmoticonPack(body.data.name, body.data.type);

  return NextResponse.json({ pack }, { status: 201 });
}

/**
 * WARN: § 13.5. Keyed on the parameter being **present**, not on it holding a filter.
 * A search field cleared to nothing still belongs to the paged tab, and answering it
 * with ten thousand summaries is the payload the whole split exists to avoid.
 */
function isPaged(params: URLSearchParams): boolean {
  return params.has("q") || params.has("cursor") || params.has("limit");
}
