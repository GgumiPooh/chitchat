import { createEvent, listEventOccurrences } from "@/entities/event";
import { syncCreatedEventToGoogle } from "@/entities/google-calendar";
import { createSystemMessage } from "@/entities/message";
import { notifyMessageRecipients } from "@/features/notify-chat";
import { apiError } from "@/shared/api";
import { getCurrentUser, withEncryptedRoute } from "@/shared/auth";
import { composeEventNoticeBody, safelyRunAsync } from "@/shared/lib";
import { after, NextResponse } from "next/server";
import { eventBodySchema, rangeSchema } from "./schema";

/** REQUIREMENTS.md § 11.3. One month's cells, with `yearly` rows projected onto the year in view. */
export const GET = withEncryptedRoute(async (request: Request) => {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const query = rangeSchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );

  if (!query.success) {
    return apiError("invalid_request");
  }

  return NextResponse.json({
    occurrences: await listEventOccurrences(query.data.from, query.data.to),
  });
});

export const POST = withEncryptedRoute(async (request: Request) => {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const body = eventBodySchema.safeParse(await request.json().catch(() => null));

  if (!body.success) {
    return apiError("invalid_request");
  }

  const {
    allDay,
    color,
    description,
    endsAt,
    recurrence,
    recurrenceUntil,
    reminderEnabled,
    scope,
    startsAt,
    targetCalendarId,
    title,
  } = body.data;

  const event = await createEvent({
    allDay,
    color,
    createdBy: user.id,
    description,
    endsAt: new Date(endsAt),
    recurrence,
    recurrenceUntil,
    reminderEnabled,
    scope,
    startsAt: new Date(startsAt),
    title,
  });

  // INFO: REQUIREMENTS.md § 11.5. The notice rides the § 8.4. pipeline — the `AFTER INSERT` trigger on `messages` is what delivers it, so nothing is published here.
  const notice = await createSystemMessage({
    action: "event_created",
    eventId: event.id,
    eventStartsAt: new Date(event.startsAt),
    eventTitle: event.title,
    senderId: user.id,
  });

  // WARN: REQUIREMENTS.md § 16.1. `after`, for the same reason `POST /api/messages` uses it — the fan-out's round trips must never sit between the user and their 201.
  after(() => {
    safelyRunAsync(() =>
      notifyMessageRecipients(
        user,
        composeEventNoticeBody(notice.systemAction, notice.eventTitle, notice.eventStartsAt),
      ),
    );
    safelyRunAsync(() => syncCreatedEventToGoogle(event, user.id, targetCalendarId));
  });

  return NextResponse.json({ event }, { status: 201 });
});
