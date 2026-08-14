import { deleteEvent, getEvent, updateEvent, type UpdateEventParams } from "@/entities/event";
import { createSystemMessage } from "@/entities/message";
import { notifyMessageRecipients } from "@/features/notify-chat";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { snowflakeSchema } from "@/shared/config";
import type { SystemAction, User } from "@/shared/db";
import { composeEventNoticeBody, safelyRunAsync, type EventId, type Nullable } from "@/shared/lib";
import { NextResponse, after } from "next/server";
import type { z } from "zod";
import { eventPatchSchema } from "../schema";

// WARN: `string`, because Next validates a route's own `params` shape against its file path — the id is branded by `paramsSchema` inside each handler instead, exactly as every other `[id]` route does.
type RouteParams = { params: Promise<{ id: string }> };

const paramsSchema = snowflakeSchema<EventId>();

/**
 * REQUIREMENTS.md § 11.4. Both users may edit every event, so nothing here is
 * scoped to `created_by` — a missing row is the only 404.
 */
export async function PATCH(request: Request, { params }: RouteParams) {
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

  const patch = toUpdateParams(body.data);

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

  return NextResponse.json({ event });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const id = paramsSchema.safeParse((await params).id);

  if (!id.success) {
    return apiError("invalid_request");
  }

  const event = await deleteEvent(id.data);

  if (!event) {
    return apiError("not_found");
  }

  // WARN: `eventId` is null — the row is already gone, and `messages.event_id` is `ON DELETE SET NULL` anyway (§ 6.). The snapshot is what lets the notice still name what was deleted.
  await postNotice(user, "event_deleted", null, event.title, event.startsAt);

  return new NextResponse(null, { status: 204 });
}

async function postNotice(
  user: User,
  action: SystemAction,
  eventId: Nullable<EventId>,
  title: string,
  startsAt: string,
) {
  const notice = await createSystemMessage({
    senderId: user.id,
    action,
    eventId,
    eventTitle: title,
    eventStartsAt: new Date(startsAt),
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
  startsAt,
  endsAt,
  ...rest
}: z.infer<typeof eventPatchSchema>): UpdateEventParams {
  return {
    ...rest,
    ...(startsAt === undefined ? {} : { startsAt: new Date(startsAt) }),
    ...(endsAt === undefined ? {} : { endsAt: new Date(endsAt) }),
  };
}

function isOrderedAgainst(before: { startsAt: string; endsAt: string }, patch: UpdateEventParams) {
  const startsAt = patch.startsAt ?? new Date(before.startsAt);
  const endsAt = patch.endsAt ?? new Date(before.endsAt);

  return startsAt <= endsAt;
}
