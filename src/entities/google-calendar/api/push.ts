import "server-only";

import {
  eventGoogleLinks,
  events,
  getDb,
  googleCalendarAccounts,
  googleCalendarSources,
  type EventGoogleLink,
} from "@/shared/db";
import type { EventId, Optional, UserId } from "@/shared/lib";
import { and, eq } from "drizzle-orm";
import type { SyncableCalendarEvent } from "../model/types";
import { isWritableAccessRole, resolveTargetCalendarId } from "./account";
import {
  deleteRemoteEvent,
  insertRemoteEvent,
  patchRemoteEvent,
  withGoogleAccessToken,
} from "./client";
import { toGoogleEventPayload } from "./payload";

export async function syncCreatedEventToGoogle(
  event: SyncableCalendarEvent,
  creatorUserId: UserId,
  targetCalendarId?: Optional<string>,
): Promise<void> {
  const db = getDb();
  const accounts = await db.select().from(googleCalendarAccounts);

  const targetUserIds =
    event.scope === "shared"
      ? accounts.map((account) => account.userId)
      : accounts.filter((account) => account.userId === event.createdBy).map((a) => a.userId);

  for (const targetUserId of targetUserIds) {
    const account = accounts.find((a) => a.userId === targetUserId);
    if (!account) {
      continue;
    }

    const sources = await db
      .select()
      .from(googleCalendarSources)
      .where(eq(googleCalendarSources.userId, targetUserId));

    const requestedId = targetUserId === creatorUserId ? targetCalendarId : undefined;
    const calendarId = resolveTargetCalendarId(account, sources, requestedId);

    if (!calendarId) {
      continue;
    }

    const payload = toGoogleEventPayload(event, false);
    const created = await withGoogleAccessToken(targetUserId, (token) =>
      insertRemoteEvent(token, calendarId, payload),
    );

    if (!created) {
      continue;
    }

    await db
      .insert(eventGoogleLinks)
      .values({
        calendarId,
        etag: created.etag ?? null,
        eventId: event.id,
        googleEventId: created.id,
        lastSyncedAt: new Date(),
        userId: targetUserId,
      })
      .onConflictDoUpdate({
        set: {
          calendarId,
          etag: created.etag ?? null,
          googleEventId: created.id,
          lastSyncedAt: new Date(),
          originalStartKey: null,
          recurringMasterGoogleId: null,
        },
        target: [eventGoogleLinks.eventId, eventGoogleLinks.userId],
      });

    if (created.iCalUID && !event.iCalUid) {
      await db.update(events).set({ iCalUid: created.iCalUID }).where(eq(events.id, event.id));
    }
  }
}

export async function syncUpdatedEventToGoogle(
  before: SyncableCalendarEvent,
  after: SyncableCalendarEvent,
): Promise<void> {
  void before;
  const db = getDb();
  const existingLinks = await db
    .select()
    .from(eventGoogleLinks)
    .where(eq(eventGoogleLinks.eventId, after.id));

  const accounts = await db.select().from(googleCalendarAccounts);
  const connectedUserIds = new Set(accounts.map((account) => account.userId));

  const desiredTargetUserIds =
    after.scope === "shared"
      ? accounts.map((account) => account.userId)
      : connectedUserIds.has(after.createdBy)
        ? [after.createdBy]
        : [];

  const desiredSet = new Set(desiredTargetUserIds);

  for (const existingLink of existingLinks) {
    if (!desiredSet.has(existingLink.userId)) {
      const [sourceRow] = await db
        .select({ accessRole: googleCalendarSources.accessRole })
        .from(googleCalendarSources)
        .where(
          and(
            eq(googleCalendarSources.userId, existingLink.userId),
            eq(googleCalendarSources.calendarId, existingLink.calendarId),
          ),
        )
        .limit(1);

      if (!sourceRow || isWritableAccessRole(sourceRow.accessRole)) {
        await withGoogleAccessToken(existingLink.userId, (token) =>
          deleteRemoteEvent(token, existingLink.calendarId, existingLink.googleEventId),
        ).catch(() => undefined);
      }

      await db
        .delete(eventGoogleLinks)
        .where(
          and(
            eq(eventGoogleLinks.eventId, after.id),
            eq(eventGoogleLinks.userId, existingLink.userId),
          ),
        );
    }
  }

  for (const targetUserId of desiredTargetUserIds) {
    const existingLink = existingLinks.find((link) => link.userId === targetUserId);
    const account = accounts.find((a) => a.userId === targetUserId);
    if (!account) {
      continue;
    }

    const sources = await db
      .select()
      .from(googleCalendarSources)
      .where(eq(googleCalendarSources.userId, targetUserId));

    if (existingLink) {
      const matchedSource = sources.find((s) => s.calendarId === existingLink.calendarId);
      if (matchedSource && !isWritableAccessRole(matchedSource.accessRole)) {
        continue;
      }

      const patchResult = await withGoogleAccessToken(targetUserId, (token) =>
        patchRemoteEvent(
          token,
          existingLink.calendarId,
          existingLink.googleEventId,
          toGoogleEventPayload(after, {
            isPatch: true,
            omitRecurrence: Boolean(existingLink.recurringMasterGoogleId),
          }),
        ),
      );

      if (!patchResult) {
        continue;
      }

      if (patchResult.notFound) {
        const targetCalendarId = resolveTargetCalendarId(account, sources);
        if (targetCalendarId) {
          const created = await withGoogleAccessToken(targetUserId, (token) =>
            insertRemoteEvent(token, targetCalendarId, toGoogleEventPayload(after, false)),
          );

          if (created) {
            await db
              .update(eventGoogleLinks)
              .set({
                calendarId: targetCalendarId,
                etag: created.etag ?? null,
                googleEventId: created.id,
                lastSyncedAt: new Date(),
                originalStartKey: null,
                recurringMasterGoogleId: null,
              })
              .where(
                and(
                  eq(eventGoogleLinks.eventId, after.id),
                  eq(eventGoogleLinks.userId, targetUserId),
                ),
              );
          }
        }
      } else {
        await db
          .update(eventGoogleLinks)
          .set({
            etag: patchResult.event?.etag ?? null,
            lastSyncedAt: new Date(),
          })
          .where(
            and(eq(eventGoogleLinks.eventId, after.id), eq(eventGoogleLinks.userId, targetUserId)),
          );
      }
    } else {
      const targetCalendarId = resolveTargetCalendarId(account, sources);
      if (targetCalendarId) {
        const created = await withGoogleAccessToken(targetUserId, (token) =>
          insertRemoteEvent(token, targetCalendarId, toGoogleEventPayload(after, false)),
        );

        if (created) {
          await db
            .insert(eventGoogleLinks)
            .values({
              calendarId: targetCalendarId,
              etag: created.etag ?? null,
              eventId: after.id,
              googleEventId: created.id,
              lastSyncedAt: new Date(),
              userId: targetUserId,
            })
            .onConflictDoUpdate({
              set: {
                calendarId: targetCalendarId,
                etag: created.etag ?? null,
                googleEventId: created.id,
                lastSyncedAt: new Date(),
                originalStartKey: null,
                recurringMasterGoogleId: null,
              },
              target: [eventGoogleLinks.eventId, eventGoogleLinks.userId],
            });
        }
      }
    }
  }
}

export async function listEventGoogleLinksForDelete(eventId: EventId): Promise<EventGoogleLink[]> {
  const db = getDb();

  return db.select().from(eventGoogleLinks).where(eq(eventGoogleLinks.eventId, eventId));
}

export async function deleteLinkedGoogleEvents(links: readonly EventGoogleLink[]): Promise<void> {
  const db = getDb();

  for (const link of links) {
    const [sourceRow] = await db
      .select({ accessRole: googleCalendarSources.accessRole })
      .from(googleCalendarSources)
      .where(
        and(
          eq(googleCalendarSources.userId, link.userId),
          eq(googleCalendarSources.calendarId, link.calendarId),
        ),
      )
      .limit(1);

    if (sourceRow && !isWritableAccessRole(sourceRow.accessRole)) {
      continue;
    }

    await withGoogleAccessToken(link.userId, (token) =>
      deleteRemoteEvent(token, link.calendarId, link.googleEventId),
    ).catch(() => undefined);
  }
}
