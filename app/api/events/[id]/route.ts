import { deleteEvent, getEvent, updateEvent, type UpdateEventParams } from "@/entities/event";
import {
  deleteLinkedGoogleEvents,
  listEventGoogleLinksForDelete,
  syncUpdatedEventToGoogle,
} from "@/entities/google-calendar";
import { createSystemMessage } from "@/entities/message";
import { notifyMessageRecipients } from "@/features/notify-chat";
import { apiError } from "@/shared/api";
import { getCurrentUser, withEncryptedRoute } from "@/shared/auth";
import { snowflakeSchema } from "@/shared/config";
import type { SystemAction, User } from "@/shared/db";
import {
  composeEventNoticeBody,
  safelyRunAsync,
  toDayKey,
  type EventId,
  type Nullable,
} from "@/shared/lib";
import { after, NextResponse } from "next/server";
import type { z } from "zod";
import { eventPatchSchema } from "../schema";

// WARN: `string`, because Next validates a route's own `params` shape against its file path — the id is branded by `paramsSchema` inside each handler instead, exactly as every other `[id]` route does.
type RouteParams = { params: Promise<{ id: string }> };

const paramsSchema = snowflakeSchema<EventId>();

/** REQUIREMENTS.md § 11.5. What a chat notice opens its event from — a 404 is the row deleted since the notice was posted. */
export const GET = withEncryptedRoute(async (_request: Request, { params }: RouteParams) => {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const id = paramsSchema.safeParse((await params).id);

  if (!id.success) {
    return apiError("invalid_request");
  }

  const event = await getEvent(id.data);

  if (!event) {
    return apiError("not_found");
  }

  return NextResponse.json({ event });
});

/**
 * REQUIREMENTS.md § 11.4. Both users may edit every event, so nothing here is
 * scoped to `created_by` — a missing row is the only 404.
 */
export const PATCH = withEncryptedRoute(async (request: Request, { params }: RouteParams) => {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const body = eventPatchSchema.safeParse(await request.json().catch(() => null));

  if (!body.success) {
    return apiError("invalid_request");
  }

  const id = paramsSchema.safeParse((await params).id);

  if (!id.success) {
    return apiError("invalid_request");
  }

  const before = await getEvent(id.data);

  if (!before) {
    return apiError("not_found");
  }

  if (before.isReadOnly) {
    return apiError("unprocessable");
  }

  const patch = toUpdateParams(body.data);

  if (patch.recurrence === "custom" && before.recurrence !== "custom") {
    return apiError("invalid_request");
  }

  // INFO: The schema can only compare two ends it was given both of; moving one alone is checked against the row we just read.
  if (!isOrderedAgainst(before, patch)) {
    return apiError("invalid_request");
  }

  const event = await updateEvent(id.data, patch);

  if (!event) {
    return apiError("not_found");
  }

  // INFO: REQUIREMENTS.md § 11.5. A retitled or re-described event posts nothing — only a move is news to the other person.
  if (before.startsAt !== event.startsAt) {
    await postNotice(user, "event_rescheduled", event.id, event.title, event.startsAt);
  }

  after(() => {
    safelyRunAsync(() => syncUpdatedEventToGoogle(before, event));
  });

  return NextResponse.json({ event });
});

export const DELETE = withEncryptedRoute(async (_request: Request, { params }: RouteParams) => {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const id = paramsSchema.safeParse((await params).id);

  if (!id.success) {
    return apiError("invalid_request");
  }

  const before = await getEvent(id.data);

  if (!before) {
    return apiError("not_found");
  }

  if (before.isReadOnly) {
    return apiError("unprocessable");
  }

  const googleLinks = await listEventGoogleLinksForDelete(id.data);
  try {
    await deleteLinkedGoogleEvents(googleLinks);
  } catch (error) {
    console.error("[events] failed to delete linked Google events before local delete", error);
  }

  const event = await deleteEvent(id.data);

  if (!event) {
    return apiError("not_found");
  }

  // WARN: `eventId` is null — the row is already gone, and `messages.event_id` is `ON DELETE SET NULL` anyway (§ 6.). The snapshot is what lets the notice still name what was deleted.
  await postNotice(user, "event_deleted", null, event.title, event.startsAt);

  return new NextResponse(null, { status: 204 });
});

async function postNotice(
  user: User,
  action: SystemAction,
  eventId: Nullable<EventId>,
  title: string,
  startsAt: string,
) {
  const notice = await createSystemMessage({
    action,
    eventId,
    eventStartsAt: new Date(startsAt),
    eventTitle: title,
    senderId: user.id,
  });

  after(() =>
    safelyRunAsync(() =>
      notifyMessageRecipients(
        user,
        composeEventNoticeBody(notice.systemAction, notice.eventTitle, notice.eventStartsAt),
      ),
    ),
  );
}

// INFO: The wire carries instants as ISO strings; the column takes a `Date`. An absent key stays absent, so the UPDATE never overwrites a field the edit did not touch.
function toUpdateParams({
  endsAt,
  recurrenceUntil,
  startsAt,
  ...rest
}: z.infer<typeof eventPatchSchema>): UpdateEventParams {
  return {
    ...rest,
    ...(endsAt === undefined ? {} : { endsAt: new Date(endsAt) }),
    ...(recurrenceUntil === undefined ? {} : { recurrenceUntil }),
    ...(startsAt === undefined ? {} : { startsAt: new Date(startsAt) }),
  };
}

function isOrderedAgainst(
  before: { endsAt: string; recurrenceUntil: Nullable<string>; startsAt: string },
  patch: UpdateEventParams,
) {
  const startsAt = patch.startsAt ?? new Date(before.startsAt);
  const endsAt = patch.endsAt ?? new Date(before.endsAt);
  const effectiveRecurrenceUntil =
    patch.recurrenceUntil !== undefined ? patch.recurrenceUntil : before.recurrenceUntil;

  return (
    startsAt <= endsAt &&
    (effectiveRecurrenceUntil === null || toDayKey(startsAt) <= effectiveRecurrenceUntil)
  );
}
