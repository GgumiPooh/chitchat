import { deleteEvent, getEvent, updateEvent, type UpdateEventParams } from "@/entities/event";
import { createSystemMessage } from "@/entities/message";
import { notifyMessageRecipients } from "@/features/notify-chat";
import { getCurrentUser } from "@/shared/auth";
import type { SystemAction, User } from "@/shared/db";
import { composeEventNoticeBody, safelyRunAsync, type Nullable } from "@/shared/lib";
import { NextResponse, after } from "next/server";
import type { z } from "zod";
import { eventPatchSchema } from "../schema";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * REQUIREMENTS.md § 11.4. Both users may edit every event, so nothing here is
 * scoped to `created_by` — a missing row is the only 404.
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = eventPatchSchema.safeParse(await request.json().catch(() => null));

  if (!body.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { id } = await params;
  const before = await getEvent(id);

  if (!before) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const patch = toUpdateParams(body.data);

  // INFO: The schema can only compare two ends it was given both of; moving one alone is checked against the row we just read.
  if (!isOrderedAgainst(before, patch)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const event = await updateEvent(id, patch);

  if (!event) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
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
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const event = await deleteEvent(id);

  if (!event) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // WARN: `eventId` is null — the row is already gone, and `messages.event_id` is `ON DELETE SET NULL` anyway (§ 6.). The snapshot is what lets the notice still name what was deleted.
  await postNotice(user, "event_deleted", null, event.title, event.startsAt);

  return new NextResponse(null, { status: 204 });
}

async function postNotice(
  user: User,
  action: SystemAction,
  eventId: Nullable<string>,
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
