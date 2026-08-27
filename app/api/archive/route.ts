import { destroyArchiveMedia, listArchiveMedia } from "@/entities/media";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import {
  ARCHIVE_PAGE_SIZE,
  LIBRARY_SHELVES,
  MAX_ARCHIVE_PAGE_SIZE,
  MAX_ARCHIVE_SELECTION,
  snowflakeSchema,
  type LibraryShelf,
} from "@/shared/config";
import type { MediaId } from "@/shared/lib";
import { NextResponse } from "next/server";
import { z } from "zod";

// INFO: The finished restructure. What a pre-rename client calls each shelf. Only 사진 moved; the other two are listed so one table answers the whole deprecated parameter rather than a branch answering half of it.
const DEPRECATED_SHELF_NAMES = ["photo", "file", "voice"] as const;

const SHELVES_BY_DEPRECATED_NAME: Record<(typeof DEPRECATED_SHELF_NAMES)[number], LibraryShelf> = {
  photo: "gallery",
  file: "file",
  voice: "voice",
};

// INFO: The finished restructure. Every cursor here is one `media` id — the pair of query parameters each of them used to take, and the refinement that rejected a half-given one, went with the `created_at` half.
const querySchema = z.object({
  // INFO: REQUIREMENTS.md § 10. Which segment is being paged, 갤러리 when the caller says nothing. An unknown value is a 400 rather than a silent fallback — a client asking for a shelf this build has never heard of must not be handed the gallery.
  shelf: z.enum(LIBRARY_SHELVES).optional(),
  /**
   * TODO: The finished restructure. Removed in the following cycle, exactly as § 5.7.'s
   * `slot=image` alias is.
   *
   * WARN: A tab left open across the deploy goes on sending `kind=photo`, and this
   * route is the only thing standing between that tab and a 400 on every page it
   * asks for — the shelf it is showing does not exist under the new name.
   */
  kind: z.enum(DEPRECATED_SHELF_NAMES).optional(),
  // INFO: REQUIREMENTS.md § 10. The last tile of the loaded window — the page older than it comes next.
  before: snowflakeSchema<MediaId>().optional(),
  // INFO: REQUIREMENTS.md § 10. The window's first tile, for paging upward out of a jumped window.
  after: snowflakeSchema<MediaId>().optional(),
  /**
   * TODO: The finished restructure. The id half of the pair each cursor used to be. Removed
   * in the following cycle with `kind` above.
   *
   * WARN: Silently ignoring these was worse than rejecting them. A tab left open across
   * the deploy sends `beforeId` and no `before`, so the route answered the **newest**
   * page every time; `useArchiveMedia` de-duplicates it away, never advances, and asks
   * again — an unbounded loop of identical requests on a shelf that never scrolls. The
   * `created_at` halves are dropped rather than mapped, since the id alone is the cursor
   * now and it is the half that ordered the page.
   */
  beforeId: snowflakeSchema<MediaId>().optional(),
  afterId: snowflakeSchema<MediaId>().optional(),
  // INFO: REQUIREMENTS.md § 10. The photo 보관함 is to open on, for the position jump.
  around: snowflakeSchema<MediaId>().optional(),
  limit: z.coerce.number().int().positive().optional(),
  modeFilter: z.enum(["all", "onlyMe", "shared"]).optional(),
});

const bodySchema = z.object({
  ids: z.array(snowflakeSchema<MediaId>()).min(1).max(MAX_ARCHIVE_SELECTION),
  /**
   * TODO: § 18. #1. Removed in the following cycle, exactly as `kind` above is.
   *
   * WARN: `"hide"` is **refused**, never ignored. A tab left open across the deploy
   * still offers 숨기기, whose whole promise was that the bytes survive — answering it
   * with the destroy this route now performs would spend that tap on the irreversible
   * act the dialog had just ruled out. A 400 costs that tab its 삭제 and nothing else.
   */
  mode: z.literal("delete").optional(),
});

// INFO: AGENTS.md § 6.4. A Route Handler answers its own 401 — the App Router does not honour a thrown `Response`.
export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const query = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );

  if (!query.success) {
    return apiError("invalid_request");
  }

  const { limit, shelf, kind, before, after, beforeId, afterId, modeFilter, ...cursors } =
    query.data;

  return NextResponse.json({
    media: await listArchiveMedia({
      ...cursors,
      // INFO: The current parameter wins outright, exactly as `shelf` does over `kind`.
      before: before ?? beforeId,
      after: after ?? afterId,
      // INFO: The current parameter wins outright. A client sending both is one mid-upgrade, and the name it knows the new build by is the one to answer.
      shelf: shelf ?? (kind && SHELVES_BY_DEPRECATED_NAME[kind]),
      limit: Math.min(limit ?? ARCHIVE_PAGE_SIZE, MAX_ARCHIVE_PAGE_SIZE),
      currentUserId: user.id,
      modeFilter,
    }),
  });
}

/**
 * REQUIREMENTS.md § 18. #1. Destroys the objects behind the ids it is given, which is
 * 보관함's only removal.
 *
 * INFO: Not scoped to the uploader: the library belongs to the conversation (§ 6.), so
 * curating it — including throwing something out for good — belongs to both. What keeps
 * that answerable is that it never removes a bubble, only the picture inside one, and
 * § 4.3.'s tombstone is what stands in its place.
 *
 * INFO: An id the caller may not act on simply does nothing — no per-id 404 to report,
 * and no way to probe with one.
 */
export async function DELETE(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const body = bodySchema.safeParse(await request.json().catch(() => null));

  if (!body.success) {
    return apiError("invalid_request");
  }

  const deletedIds = await destroyArchiveMedia(body.data.ids, user.id);

  // TODO: § 18. #1. Drop `hiddenIds` in the following cycle, with `mode` above.
  // WARN: The empty array is load-bearing for one cycle. A tab left open across the deploy destructures **both** names and spreads them, so answering without this one throws in the client *after* the objects are already destroyed — reporting a failure for a delete that happened, over tiles it then leaves on screen.
  return NextResponse.json({ hiddenIds: [], deletedIds });
}
