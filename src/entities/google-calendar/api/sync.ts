import "server-only";

import {
  isCuratedObservance,
  isGooglePublicHoliday,
  isHolidayCalendarId,
  snowflakeSchema,
} from "@/shared/config";
import {
  eventGoogleLinks,
  events,
  getDb,
  googleCalendarAccounts,
  googleCalendarSources,
  nextSnowflake,
  type Event,
  type GoogleCalendarSourceRow,
  type NewEventGoogleLink,
} from "@/shared/db";
import {
  A_MINUTE,
  A_SECOND,
  toDayKey,
  type EventId,
  type Nullable,
  type Optional,
  type UserId,
} from "@/shared/lib";
import { and, eq, inArray, isNull, lt, ne, or } from "drizzle-orm";
import type { GoogleCalendarSyncResult } from "../model/types";
import {
  isWritableAccessRole,
  resolveTargetCalendarId,
  syncRemoteCalendarSources,
} from "./account";
import {
  GoogleApiAuthError,
  GoogleCalendarApiError,
  deleteRemoteEvent,
  getValidGoogleAccessToken,
  insertRemoteEvent,
  invalidateGoogleAccessToken,
  listRemoteEvents,
  patchRemoteEvent,
  toSyncErrorCode,
  withGoogleAccessToken,
  type ListRemoteEventsResult,
} from "./client";
import { fromRemotePayload, toGoogleEventPayload } from "./payload";

const LEASE_POLL_INTERVAL_MS = A_SECOND / 4;
const LEASE_MAX_WAIT_MS = 10 * A_SECOND;
const EXPORT_BATCH_SIZE = 10;
const EXPORT_BATCH_PAUSE_MS = A_SECOND / 20;

async function upsertEventGoogleLink(values: NewEventGoogleLink): Promise<void> {
  const db = getDb();
  await db
    .insert(eventGoogleLinks)
    .values(values)
    .onConflictDoUpdate({
      set: {
        calendarId: values.calendarId,
        etag: values.etag ?? null,
        googleEventId: values.googleEventId,
        lastSyncedAt: values.lastSyncedAt ?? new Date(),
        originalStartKey: values.originalStartKey ?? null,
        recurringMasterGoogleId: values.recurringMasterGoogleId ?? null,
      },
      target: [eventGoogleLinks.eventId, eventGoogleLinks.userId],
    });
}

async function resolveGoogleEventReadOnly(
  eventId: EventId,
  currentUserId: UserId,
  currentAccessRole: string,
): Promise<boolean> {
  if (isWritableAccessRole(currentAccessRole)) {
    return false;
  }

  const db = getDb();
  const otherUserLinks = await db
    .select({
      calendarId: eventGoogleLinks.calendarId,
      userId: eventGoogleLinks.userId,
    })
    .from(eventGoogleLinks)
    .where(and(eq(eventGoogleLinks.eventId, eventId), ne(eventGoogleLinks.userId, currentUserId)));

  for (const otherLink of otherUserLinks) {
    const [otherSource] = await db
      .select({ accessRole: googleCalendarSources.accessRole })
      .from(googleCalendarSources)
      .where(
        and(
          eq(googleCalendarSources.userId, otherLink.userId),
          eq(googleCalendarSources.calendarId, otherLink.calendarId),
        ),
      )
      .limit(1);

    if (otherSource && isWritableAccessRole(otherSource.accessRole)) {
      return false;
    }
  }

  return true;
}

async function cleanupDeletedEvent(eventId: EventId, userId: UserId): Promise<number> {
  const db = getDb();
  const allLinks = await db
    .select()
    .from(eventGoogleLinks)
    .where(eq(eventGoogleLinks.eventId, eventId));

  await db
    .delete(eventGoogleLinks)
    .where(and(eq(eventGoogleLinks.eventId, eventId), eq(eventGoogleLinks.userId, userId)));

  const [eventRow] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);

  if (!eventRow) {
    return 0;
  }

  const remainingLinks = allLinks.filter((otherLink) => otherLink.userId !== userId);

  if (eventRow.scope === "shared" && remainingLinks.length > 0) {
    if (eventRow.source === "google") {
      // INFO: Preserve partner's native Google event when one user removes or declines their own copy.
      const remainingLink = remainingLinks[0];
      const [remainingSource] = await db
        .select({ accessRole: googleCalendarSources.accessRole })
        .from(googleCalendarSources)
        .where(
          and(
            eq(googleCalendarSources.userId, remainingLink.userId),
            eq(googleCalendarSources.calendarId, remainingLink.calendarId),
          ),
        )
        .limit(1);

      const nextReadOnly = remainingSource
        ? !isWritableAccessRole(remainingSource.accessRole)
        : false;
      const syncNow = new Date();

      await db
        .update(events)
        .set({
          createdBy: remainingLink.userId,
          isReadOnly: nextReadOnly,
          scope: "mine",
          updatedAt: syncNow,
        })
        .where(eq(events.id, eventId));

      await db
        .update(eventGoogleLinks)
        .set({ lastSyncedAt: syncNow })
        .where(eq(eventGoogleLinks.eventId, eventId));

      return 1;
    }

    for (const otherLink of remainingLinks) {
      const [otherSource] = await db
        .select({ accessRole: googleCalendarSources.accessRole })
        .from(googleCalendarSources)
        .where(
          and(
            eq(googleCalendarSources.userId, otherLink.userId),
            eq(googleCalendarSources.calendarId, otherLink.calendarId),
          ),
        )
        .limit(1);

      if (!otherSource || isWritableAccessRole(otherSource.accessRole)) {
        await withGoogleAccessToken(otherLink.userId, (otherToken) =>
          deleteRemoteEvent(otherToken, otherLink.calendarId, otherLink.googleEventId),
        ).catch(() => undefined);
      }
      await db
        .delete(eventGoogleLinks)
        .where(
          and(eq(eventGoogleLinks.eventId, eventId), eq(eventGoogleLinks.userId, otherLink.userId)),
        );
    }
    await db.delete(events).where(eq(events.id, eventId));
    return 1;
  }

  if (remainingLinks.length === 0) {
    await db.delete(events).where(eq(events.id, eventId));
    return 1;
  }

  if (eventRow.source === "google" && eventRow.createdBy === userId) {
    const syncNow = new Date();
    await db
      .update(events)
      .set({ createdBy: remainingLinks[0].userId, updatedAt: syncNow })
      .where(eq(events.id, eventId));
    await db
      .update(eventGoogleLinks)
      .set({ lastSyncedAt: syncNow })
      .where(eq(eventGoogleLinks.eventId, eventId));
    return 1;
  }

  return 0;
}

async function propagateSharedEventPatchToPartners(
  eventId: EventId,
  sourceUserId: UserId,
): Promise<void> {
  const db = getDb();
  const otherLinks = await db
    .select()
    .from(eventGoogleLinks)
    .where(and(eq(eventGoogleLinks.eventId, eventId), ne(eventGoogleLinks.userId, sourceUserId)));

  if (otherLinks.length === 0) {
    return;
  }

  const [updatedEvent] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);

  if (!updatedEvent) {
    return;
  }

  for (const otherLink of otherLinks) {
    const [otherSource] = await db
      .select({ accessRole: googleCalendarSources.accessRole })
      .from(googleCalendarSources)
      .where(
        and(
          eq(googleCalendarSources.userId, otherLink.userId),
          eq(googleCalendarSources.calendarId, otherLink.calendarId),
        ),
      )
      .limit(1);

    if (otherSource && !isWritableAccessRole(otherSource.accessRole)) {
      continue;
    }

    const patched = await withGoogleAccessToken(otherLink.userId, (token) =>
      patchRemoteEvent(
        token,
        otherLink.calendarId,
        otherLink.googleEventId,
        toGoogleEventPayload(updatedEvent, {
          isPatch: true,
          omitRecurrence: Boolean(otherLink.recurringMasterGoogleId),
        }),
      ),
    ).catch(() => null);

    if (patched && !patched.notFound) {
      await db
        .update(eventGoogleLinks)
        .set({
          etag: patched.event?.etag ?? otherLink.etag,
          lastSyncedAt: new Date(),
        })
        .where(
          and(eq(eventGoogleLinks.eventId, eventId), eq(eventGoogleLinks.userId, otherLink.userId)),
        );
    }
  }
}

export type SyncUserGoogleCalendarOptions = {
  minIntervalMs?: number;
  source?: "cron" | "manual";
  waitForInFlight?: boolean;
};

export async function syncUserGoogleCalendar(
  userId: UserId,
  options?: SyncUserGoogleCalendarOptions,
): Promise<GoogleCalendarSyncResult> {
  const source = options?.source ?? "cron";
  const db = getDb();

  if (source === "cron") {
    const [existingAccount] = await db
      .select()
      .from(googleCalendarAccounts)
      .where(eq(googleCalendarAccounts.userId, userId))
      .limit(1);

    if (!existingAccount) {
      return {
        changed: false,
        deleted: 0,
        exported: 0,
        imported: 0,
        lastSyncedAt: null,
        syncError: null,
        updated: 0,
      };
    }

    if (existingAccount.syncError === "reauth_required") {
      return {
        changed: false,
        deleted: 0,
        exported: 0,
        imported: 0,
        lastSyncedAt: existingAccount.lastSyncedAt?.toISOString() ?? null,
        syncError: "reauth_required",
        updated: 0,
      };
    }

    if (
      existingAccount.syncError === "api_disabled" &&
      existingAccount.updatedAt.getTime() > Date.now() - 5 * A_MINUTE
    ) {
      return {
        changed: false,
        deleted: 0,
        exported: 0,
        imported: 0,
        lastSyncedAt: existingAccount.lastSyncedAt?.toISOString() ?? null,
        syncError: "api_disabled",
        updated: 0,
      };
    }

    if (
      options?.minIntervalMs &&
      existingAccount.lastSyncedAt &&
      existingAccount.lastSyncedAt.getTime() > Date.now() - options.minIntervalMs
    ) {
      return {
        changed: false,
        deleted: 0,
        exported: 0,
        imported: 0,
        lastSyncedAt: existingAccount.lastSyncedAt.toISOString(),
        syncError: existingAccount.syncError ?? null,
        updated: 0,
      };
    }
  }

  const waitStartedAt = Date.now();
  const leaseUntil = new Date(waitStartedAt + 2 * A_MINUTE);

  let [account] = await db
    .update(googleCalendarAccounts)
    .set({ syncingUntil: leaseUntil })
    .where(
      and(
        eq(googleCalendarAccounts.userId, userId),
        or(
          isNull(googleCalendarAccounts.syncingUntil),
          lt(googleCalendarAccounts.syncingUntil, new Date()),
        ),
      ),
    )
    .returning();

  if (!account && options?.waitForInFlight) {
    const startWaitMs = Date.now();
    while (Date.now() - startWaitMs < LEASE_MAX_WAIT_MS) {
      await new Promise((resolve) => setTimeout(resolve, LEASE_POLL_INTERVAL_MS));
      const [current] = await db
        .select()
        .from(googleCalendarAccounts)
        .where(eq(googleCalendarAccounts.userId, userId))
        .limit(1);

      if (!current) {
        break;
      }

      const isLeaseActive = current.syncingUntil && current.syncingUntil.getTime() > Date.now();
      if (!isLeaseActive) {
        if (current.lastSyncedAt && current.lastSyncedAt.getTime() >= waitStartedAt) {
          return {
            changed: true,
            deleted: 0,
            exported: 0,
            imported: 0,
            lastSyncedAt: current.lastSyncedAt.toISOString(),
            syncError: current.syncError ?? null,
            updated: 0,
          };
        }

        const [acquired] = await db
          .update(googleCalendarAccounts)
          .set({ syncingUntil: new Date(Date.now() + 2 * A_MINUTE) })
          .where(
            and(
              eq(googleCalendarAccounts.userId, userId),
              or(
                isNull(googleCalendarAccounts.syncingUntil),
                lt(googleCalendarAccounts.syncingUntil, new Date()),
              ),
            ),
          )
          .returning();

        if (acquired) {
          account = acquired;
          break;
        }
      }
    }
  }

  if (!account) {
    const [current] = await db
      .select()
      .from(googleCalendarAccounts)
      .where(eq(googleCalendarAccounts.userId, userId))
      .limit(1);

    return {
      changed: false,
      deleted: 0,
      exported: 0,
      imported: 0,
      lastSyncedAt: current?.lastSyncedAt?.toISOString() ?? null,
      syncError: current?.syncError ?? null,
      updated: 0,
    };
  }

  let imported = 0;
  let updated = 0;
  let deleted = 0;
  let exported = 0;

  try {
    let accessToken = await getValidGoogleAccessToken(userId);
    if (!accessToken) {
      const [current] = await db
        .select()
        .from(googleCalendarAccounts)
        .where(eq(googleCalendarAccounts.userId, userId))
        .limit(1);

      return {
        changed: false,
        deleted: 0,
        exported: 0,
        imported: 0,
        lastSyncedAt: current?.lastSyncedAt?.toISOString() ?? null,
        syncError: current?.syncError ?? "reauth_required",
        updated: 0,
      };
    }

    const runWithToken = async <T>(fn: (token: string) => Promise<T>): Promise<T> => {
      if (!accessToken) {
        throw new GoogleApiAuthError("No valid Google access token available");
      }
      try {
        return await fn(accessToken);
      } catch (error) {
        if (!(error instanceof GoogleApiAuthError)) {
          throw error;
        }
      }

      await invalidateGoogleAccessToken(userId);
      accessToken = await getValidGoogleAccessToken(userId);
      if (!accessToken) {
        throw new GoogleApiAuthError("Google access token refresh failed");
      }
      return fn(accessToken);
    };

    await syncRemoteCalendarSources(userId);

    // INFO: REQUIREMENTS.md § 11.8. Purge generic Google birthday greetings ("생일 축하합니다!") so they don't duplicate alongside contact birthdays.
    const greetingLinks = await db
      .select({ eventId: eventGoogleLinks.eventId })
      .from(eventGoogleLinks)
      .innerJoin(events, eq(events.id, eventGoogleLinks.eventId))
      .where(
        and(
          eq(eventGoogleLinks.userId, userId),
          eq(events.source, "google"),
          inArray(events.title, [
            "생일 축하합니다!",
            "생일 축하합니다",
            "Happy Birthday!",
            "Happy Birthday",
          ]),
        ),
      );

    if (greetingLinks.length > 0) {
      const greetingEventIds = Array.from(new Set(greetingLinks.map((l) => l.eventId)));
      await db.delete(eventGoogleLinks).where(inArray(eventGoogleLinks.eventId, greetingEventIds));
      await db.delete(events).where(inArray(events.id, greetingEventIds));
    }

    // INFO: REQUIREMENTS.md § 11.7. Purge duplicate public holiday events and uncurated holiday noise previously imported from Google holiday calendars.
    const holidayLinks = await db
      .select({
        calendarId: eventGoogleLinks.calendarId,
        eventId: eventGoogleLinks.eventId,
        title: events.title,
      })
      .from(eventGoogleLinks)
      .innerJoin(events, eq(events.id, eventGoogleLinks.eventId))
      .where(and(eq(eventGoogleLinks.userId, userId), eq(events.source, "google")));

    const staleHolidayEventIds: EventId[] = [];
    for (const link of holidayLinks) {
      if (isHolidayCalendarId(link.calendarId)) {
        if (isGooglePublicHoliday(link.title) || !isCuratedObservance(link.title)) {
          staleHolidayEventIds.push(link.eventId);
        }
      }
    }

    if (staleHolidayEventIds.length > 0) {
      const uniqueIds = Array.from(new Set(staleHolidayEventIds));
      await db.delete(eventGoogleLinks).where(inArray(eventGoogleLinks.eventId, uniqueIds));
      await db.delete(events).where(inArray(events.id, uniqueIds));
    }

    const sources = await db
      .select()
      .from(googleCalendarSources)
      .where(eq(googleCalendarSources.userId, userId));

    const enabledSources = sources.filter((source) => source.syncEnabled);

    type FetchedSource = {
      remoteRes: ListRemoteEventsResult;
      source: GoogleCalendarSourceRow;
    };

    const fetchedSources: FetchedSource[] = [];

    for (const source of enabledSources) {
      let remoteRes = await runWithToken((token) =>
        listRemoteEvents(token, source.calendarId, source.syncToken),
      );

      if (remoteRes.syncTokenExpired) {
        await db
          .update(googleCalendarSources)
          .set({ syncToken: null, updatedAt: new Date() })
          .where(
            and(
              eq(googleCalendarSources.userId, userId),
              eq(googleCalendarSources.calendarId, source.calendarId),
            ),
          );

        remoteRes = await runWithToken((token) => listRemoteEvents(token, source.calendarId, null));
      }

      fetchedSources.push({ remoteRes, source });
    }

    // INFO: Process active items across every enabled source before cancellations so cross-calendar moves re-home links before tombstones run.
    for (const { remoteRes, source } of fetchedSources) {
      const masters = remoteRes.items.filter(
        (item) => !item.recurringEventId && item.status !== "cancelled",
      );
      const exceptions = remoteRes.items.filter(
        (item) => Boolean(item.recurringEventId) && item.status !== "cancelled",
      );
      const activeItems = [...masters, ...exceptions];

      for (const item of activeItems) {
        try {
          const userLinksOnItem = await db
            .select()
            .from(eventGoogleLinks)
            .where(
              and(eq(eventGoogleLinks.userId, userId), eq(eventGoogleLinks.googleEventId, item.id)),
            );

          const link =
            userLinksOnItem.find((l) => l.calendarId === source.calendarId) ?? userLinksOnItem[0];

          if (item.recurringEventId && item.originalStartTime) {
            const originalStartKey =
              item.originalStartTime.date ??
              (item.originalStartTime.dateTime ? toDayKey(item.originalStartTime.dateTime) : null);

            if (!originalStartKey) {
              continue;
            }

            let resolvedMasterEvent: Optional<Event>;

            const [masterLink] = await db
              .select()
              .from(eventGoogleLinks)
              .where(
                and(
                  eq(eventGoogleLinks.userId, userId),
                  eq(eventGoogleLinks.googleEventId, item.recurringEventId),
                ),
              )
              .limit(1);

            if (masterLink) {
              const [masterEvent] = await db
                .select()
                .from(events)
                .where(eq(events.id, masterLink.eventId))
                .limit(1);

              if (masterEvent) {
                resolvedMasterEvent = masterEvent;
                if (!masterEvent.exdates.includes(originalStartKey)) {
                  const masterNow = new Date();
                  const [updatedMaster] = await db
                    .update(events)
                    .set({
                      exdates: [...masterEvent.exdates, originalStartKey],
                      updatedAt: masterNow,
                    })
                    .where(eq(events.id, masterEvent.id))
                    .returning();

                  if (updatedMaster) {
                    resolvedMasterEvent = updatedMaster;
                    updated += 1;
                  }

                  await db
                    .update(eventGoogleLinks)
                    .set({ lastSyncedAt: masterNow })
                    .where(
                      and(
                        eq(eventGoogleLinks.eventId, masterEvent.id),
                        eq(eventGoogleLinks.userId, userId),
                      ),
                    );

                  if (updatedMaster && updatedMaster.scope === "shared") {
                    await propagateSharedEventPatchToPartners(masterEvent.id, userId);
                  }
                }
              }
            }

            const mapped = fromRemotePayload(
              item,
              source.isPrimary ? null : source.backgroundColor,
              source.accessRole,
              source.calendarId,
            );
            if (!mapped) {
              continue;
            }

            const standaloneValues = {
              ...mapped,
              exdates: [] as string[],
              recurrence: "none" as const,
              recurrenceUntil: null,
              rrule: null,
            };

            if (link) {
              if (
                link.calendarId === source.calendarId &&
                link.etag &&
                item.etag &&
                link.etag === item.etag
              ) {
                continue;
              }

              const [existing] = await db
                .select()
                .from(events)
                .where(eq(events.id, link.eventId))
                .limit(1);

              if (!existing) {
                continue;
              }

              const localUpdatedMs = existing.updatedAt.getTime();
              const linkSyncedMs = link.lastSyncedAt.getTime();
              const remoteUpdatedMs = item.updated ? Date.parse(item.updated) : 0;

              // INFO: Protect a newer local edit from being overwritten by an older Google snapshot during an overlapping sync.
              if (
                localUpdatedMs > linkSyncedMs &&
                (Number.isNaN(remoteUpdatedMs) || localUpdatedMs > remoteUpdatedMs)
              ) {
                if (isWritableAccessRole(source.accessRole)) {
                  const patched = await runWithToken((token) =>
                    patchRemoteEvent(
                      token,
                      source.calendarId,
                      item.id,
                      toGoogleEventPayload(existing, {
                        isPatch: true,
                        omitRecurrence: Boolean(link.recurringMasterGoogleId),
                      }),
                    ),
                  );
                  if (!patched.notFound) {
                    await db
                      .update(eventGoogleLinks)
                      .set({
                        calendarId: source.calendarId,
                        etag: patched.event?.etag ?? null,
                        lastSyncedAt: new Date(),
                      })
                      .where(
                        and(
                          eq(eventGoogleLinks.eventId, existing.id),
                          eq(eventGoogleLinks.userId, userId),
                        ),
                      );
                  }
                }
                continue;
              }

              const syncNow = new Date();
              const isReadOnlyValue =
                existing.source === "google"
                  ? await resolveGoogleEventReadOnly(link.eventId, userId, source.accessRole)
                  : existing.isReadOnly;

              await db
                .update(events)
                .set({
                  ...standaloneValues,
                  color: mapped.color,
                  isReadOnly: isReadOnlyValue,
                  updatedAt: syncNow,
                })
                .where(eq(events.id, link.eventId));

              await db
                .update(eventGoogleLinks)
                .set({
                  calendarId: source.calendarId,
                  etag: item.etag ?? null,
                  lastSyncedAt: syncNow,
                })
                .where(
                  and(
                    eq(eventGoogleLinks.eventId, link.eventId),
                    eq(eventGoogleLinks.userId, userId),
                  ),
                );

              updated += 1;

              if (existing.scope === "shared") {
                await propagateSharedEventPatchToPartners(existing.id, userId);
              }
            } else {
              let siblingExceptionEventId: Nullable<EventId> = null;
              if (resolvedMasterEvent) {
                const masterLinks = await db
                  .select({ googleEventId: eventGoogleLinks.googleEventId })
                  .from(eventGoogleLinks)
                  .where(eq(eventGoogleLinks.eventId, resolvedMasterEvent.id));

                for (const mLink of masterLinks) {
                  const [existingExc] = await db
                    .select({ eventId: events.id })
                    .from(eventGoogleLinks)
                    .innerJoin(events, eq(events.id, eventGoogleLinks.eventId))
                    .where(
                      and(
                        eq(eventGoogleLinks.recurringMasterGoogleId, mLink.googleEventId),
                        eq(eventGoogleLinks.originalStartKey, originalStartKey),
                      ),
                    )
                    .limit(1);

                  if (existingExc) {
                    siblingExceptionEventId = existingExc.eventId;
                    break;
                  }
                }
              }

              if (siblingExceptionEventId) {
                const syncNow = new Date();
                await upsertEventGoogleLink({
                  calendarId: source.calendarId,
                  etag: item.etag ?? null,
                  eventId: siblingExceptionEventId,
                  googleEventId: item.id,
                  lastSyncedAt: syncNow,
                  originalStartKey,
                  recurringMasterGoogleId: item.recurringEventId,
                  userId,
                });

                updated += 1;
              } else {
                const newId = nextSnowflake<EventId>();
                const syncNow = new Date();
                const [insertedExceptionEvent] = await db
                  .insert(events)
                  .values({
                    ...standaloneValues,
                    color: mapped.color ?? resolvedMasterEvent?.color ?? null,
                    createdBy: resolvedMasterEvent?.createdBy ?? userId,
                    id: newId,
                    isReadOnly: !isWritableAccessRole(source.accessRole),
                    reminderEnabled: resolvedMasterEvent?.reminderEnabled ?? false,
                    scope: resolvedMasterEvent?.scope ?? "mine",
                    source: resolvedMasterEvent?.source ?? "google",
                    updatedAt: syncNow,
                  })
                  .returning();

                await upsertEventGoogleLink({
                  calendarId: source.calendarId,
                  etag: item.etag ?? null,
                  eventId: newId,
                  googleEventId: item.id,
                  lastSyncedAt: syncNow,
                  originalStartKey,
                  recurringMasterGoogleId: item.recurringEventId,
                  userId,
                });

                imported += 1;

                if (
                  insertedExceptionEvent &&
                  insertedExceptionEvent.scope === "shared" &&
                  insertedExceptionEvent.source === "jandh"
                ) {
                  const partnerAccounts = await db
                    .select()
                    .from(googleCalendarAccounts)
                    .where(ne(googleCalendarAccounts.userId, userId));

                  for (const partnerAccount of partnerAccounts) {
                    const partnerSources = await db
                      .select()
                      .from(googleCalendarSources)
                      .where(eq(googleCalendarSources.userId, partnerAccount.userId));

                    const partnerCalId = resolveTargetCalendarId(partnerAccount, partnerSources);
                    if (!partnerCalId) {
                      continue;
                    }

                    const createdRemote = await withGoogleAccessToken(
                      partnerAccount.userId,
                      (token) =>
                        insertRemoteEvent(
                          token,
                          partnerCalId,
                          toGoogleEventPayload(insertedExceptionEvent, false),
                        ),
                    ).catch(() => null);

                    if (createdRemote) {
                      await upsertEventGoogleLink({
                        calendarId: partnerCalId,
                        etag: createdRemote.etag ?? null,
                        eventId: insertedExceptionEvent.id,
                        googleEventId: createdRemote.id,
                        lastSyncedAt: new Date(),
                        originalStartKey: null,
                        recurringMasterGoogleId: null,
                        userId: partnerAccount.userId,
                      });
                    }
                  }
                }
              }
            }
            continue;
          }

          const mapped = fromRemotePayload(
            item,
            source.isPrimary ? null : source.backgroundColor,
            source.accessRole,
            source.calendarId,
          );
          if (!mapped) {
            continue;
          }

          if (link) {
            if (
              link.calendarId === source.calendarId &&
              link.etag &&
              item.etag &&
              link.etag === item.etag
            ) {
              continue;
            }

            const [existing] = await db
              .select()
              .from(events)
              .where(eq(events.id, link.eventId))
              .limit(1);

            if (!existing) {
              continue;
            }

            const localUpdatedMs = existing.updatedAt.getTime();
            const linkSyncedMs = link.lastSyncedAt.getTime();
            const remoteUpdatedMs = item.updated ? Date.parse(item.updated) : 0;

            // INFO: Protect a newer local edit from being overwritten by an older Google snapshot during an overlapping sync.
            if (
              localUpdatedMs > linkSyncedMs &&
              (Number.isNaN(remoteUpdatedMs) || localUpdatedMs > remoteUpdatedMs)
            ) {
              if (isWritableAccessRole(source.accessRole)) {
                const patched = await runWithToken((token) =>
                  patchRemoteEvent(
                    token,
                    source.calendarId,
                    item.id,
                    toGoogleEventPayload(existing, {
                      isPatch: true,
                      omitRecurrence: Boolean(link.recurringMasterGoogleId),
                    }),
                  ),
                );
                if (!patched.notFound) {
                  await db
                    .update(eventGoogleLinks)
                    .set({
                      calendarId: source.calendarId,
                      etag: patched.event?.etag ?? null,
                      lastSyncedAt: new Date(),
                    })
                    .where(
                      and(
                        eq(eventGoogleLinks.eventId, existing.id),
                        eq(eventGoogleLinks.userId, userId),
                      ),
                    );
                }
              }
              continue;
            }

            const isReadOnlyValue =
              existing.source === "google"
                ? await resolveGoogleEventReadOnly(existing.id, userId, source.accessRole)
                : existing.isReadOnly;

            const syncNow = new Date();

            await db
              .update(events)
              .set({
                allDay: mapped.allDay,
                color: mapped.color,
                description: mapped.description,
                endsAt: mapped.endsAt,
                exdates: mapped.exdates,
                iCalUid: item.iCalUID ?? existing.iCalUid,
                isReadOnly: isReadOnlyValue,
                recurrence: mapped.recurrence,
                recurrenceUntil: mapped.recurrenceUntil,
                rrule: mapped.rrule,
                startsAt: mapped.startsAt,
                title: mapped.title,
                updatedAt: syncNow,
              })
              .where(eq(events.id, existing.id));

            await db
              .update(eventGoogleLinks)
              .set({
                calendarId: source.calendarId,
                etag: item.etag ?? null,
                lastSyncedAt: syncNow,
              })
              .where(
                and(eq(eventGoogleLinks.eventId, existing.id), eq(eventGoogleLinks.userId, userId)),
              );

            updated += 1;

            if (existing.scope === "shared") {
              await propagateSharedEventPatchToPartners(existing.id, userId);
            }
          } else {
            let dedupedEventId: Nullable<EventId> = null;

            const rawJandhId = item.extendedProperties?.shared?.jandhEventId;
            const parsedJandhId = rawJandhId
              ? snowflakeSchema<EventId>().safeParse(rawJandhId)
              : null;

            if (parsedJandhId?.success) {
              const [existingJandh] = await db
                .select()
                .from(events)
                .where(eq(events.id, parsedJandhId.data))
                .limit(1);

              if (existingJandh) {
                const [hasLink] = await db
                  .select()
                  .from(eventGoogleLinks)
                  .where(
                    and(
                      eq(eventGoogleLinks.eventId, existingJandh.id),
                      eq(eventGoogleLinks.userId, userId),
                    ),
                  )
                  .limit(1);

                const localUpdatedMs = existingJandh.updatedAt.getTime();
                const linkSyncedMs = hasLink ? hasLink.lastSyncedAt.getTime() : localUpdatedMs;
                const remoteUpdatedMs = item.updated ? Date.parse(item.updated) : 0;
                const isLocalNewer =
                  localUpdatedMs > linkSyncedMs &&
                  (Number.isNaN(remoteUpdatedMs) || localUpdatedMs > remoteUpdatedMs);
                const isMovedOrChanged = hasLink
                  ? hasLink.calendarId !== source.calendarId ||
                    hasLink.googleEventId !== item.id ||
                    hasLink.etag !== item.etag
                  : !Number.isNaN(remoteUpdatedMs) && remoteUpdatedMs > localUpdatedMs + A_SECOND;

                if (!isLocalNewer && isMovedOrChanged) {
                  const syncNow = new Date();
                  const isReadOnlyValue =
                    existingJandh.source === "google"
                      ? await resolveGoogleEventReadOnly(
                          existingJandh.id,
                          userId,
                          source.accessRole,
                        )
                      : existingJandh.isReadOnly;

                  await db
                    .update(events)
                    .set({
                      allDay: mapped.allDay,
                      color: mapped.color,
                      description: mapped.description,
                      endsAt: mapped.endsAt,
                      exdates: mapped.exdates,
                      iCalUid: item.iCalUID ?? existingJandh.iCalUid,
                      isReadOnly: isReadOnlyValue,
                      recurrence: mapped.recurrence,
                      recurrenceUntil: mapped.recurrenceUntil,
                      rrule: mapped.rrule,
                      startsAt: mapped.startsAt,
                      title: mapped.title,
                      updatedAt: syncNow,
                    })
                    .where(eq(events.id, existingJandh.id));

                  await upsertEventGoogleLink({
                    calendarId: source.calendarId,
                    etag: item.etag ?? null,
                    eventId: existingJandh.id,
                    googleEventId: item.id,
                    lastSyncedAt: syncNow,
                    userId,
                  });

                  updated += 1;

                  if (existingJandh.scope === "shared") {
                    await propagateSharedEventPatchToPartners(existingJandh.id, userId);
                  }
                } else {
                  await upsertEventGoogleLink({
                    calendarId: source.calendarId,
                    etag: item.etag ?? null,
                    eventId: existingJandh.id,
                    googleEventId: item.id,
                    lastSyncedAt: isLocalNewer ? new Date(0) : new Date(),
                    userId,
                  });

                  if (!hasLink || hasLink.googleEventId !== item.id) {
                    updated += 1;
                  }
                }

                dedupedEventId = existingJandh.id;
              } else {
                // INFO: Remote item carries a ChitChat event id whose local row was deleted, so purge the remote orphan instead of re-importing it.
                if (isWritableAccessRole(source.accessRole)) {
                  await runWithToken((token) =>
                    deleteRemoteEvent(token, source.calendarId, item.id),
                  ).catch(() => undefined);
                }
                continue;
              }
            }

            if (!dedupedEventId && item.iCalUID) {
              const [existingByIcal] = await db
                .select()
                .from(events)
                .where(eq(events.iCalUid, item.iCalUID))
                .limit(1);

              if (existingByIcal) {
                const [hasLinkForSameUser] = await db
                  .select()
                  .from(eventGoogleLinks)
                  .where(
                    and(
                      eq(eventGoogleLinks.eventId, existingByIcal.id),
                      eq(eventGoogleLinks.userId, userId),
                    ),
                  )
                  .limit(1);

                if (
                  hasLinkForSameUser &&
                  hasLinkForSameUser.calendarId === source.calendarId &&
                  hasLinkForSameUser.googleEventId !== item.id
                ) {
                  // INFO: Google splits "this and following" recurring edits into a second series sharing iCalUID on the same calendar.
                  dedupedEventId = null;
                } else if (
                  hasLinkForSameUser &&
                  hasLinkForSameUser.calendarId === source.calendarId &&
                  hasLinkForSameUser.googleEventId === item.id
                ) {
                  dedupedEventId = existingByIcal.id;
                } else if (
                  hasLinkForSameUser &&
                  hasLinkForSameUser.calendarId !== source.calendarId
                ) {
                  const syncNow = new Date();
                  const isReadOnlyValue =
                    existingByIcal.source === "google"
                      ? await resolveGoogleEventReadOnly(
                          existingByIcal.id,
                          userId,
                          source.accessRole,
                        )
                      : existingByIcal.isReadOnly;

                  await db
                    .update(events)
                    .set({
                      allDay: mapped.allDay,
                      color: mapped.color,
                      description: mapped.description,
                      endsAt: mapped.endsAt,
                      exdates: mapped.exdates,
                      iCalUid: item.iCalUID ?? existingByIcal.iCalUid,
                      isReadOnly: isReadOnlyValue,
                      recurrence: mapped.recurrence,
                      recurrenceUntil: mapped.recurrenceUntil,
                      rrule: mapped.rrule,
                      startsAt: mapped.startsAt,
                      title: mapped.title,
                      updatedAt: syncNow,
                    })
                    .where(eq(events.id, existingByIcal.id));

                  await upsertEventGoogleLink({
                    calendarId: source.calendarId,
                    etag: item.etag ?? null,
                    eventId: existingByIcal.id,
                    googleEventId: item.id,
                    lastSyncedAt: syncNow,
                    userId,
                  });

                  if (existingByIcal.scope === "shared") {
                    await propagateSharedEventPatchToPartners(existingByIcal.id, userId);
                  }

                  dedupedEventId = existingByIcal.id;
                  updated += 1;
                } else {
                  const syncNow = new Date();
                  await upsertEventGoogleLink({
                    calendarId: source.calendarId,
                    etag: item.etag ?? null,
                    eventId: existingByIcal.id,
                    googleEventId: item.id,
                    lastSyncedAt: syncNow,
                    userId,
                  });

                  if (existingByIcal.source === "google" && existingByIcal.createdBy !== userId) {
                    const shouldBeReadOnly = !isWritableAccessRole(source.accessRole);
                    await db
                      .update(events)
                      .set({
                        isReadOnly: shouldBeReadOnly ? existingByIcal.isReadOnly : false,
                        scope: "shared",
                        updatedAt: syncNow,
                      })
                      .where(eq(events.id, existingByIcal.id));

                    await db
                      .update(eventGoogleLinks)
                      .set({ lastSyncedAt: syncNow })
                      .where(eq(eventGoogleLinks.eventId, existingByIcal.id));
                  }

                  dedupedEventId = existingByIcal.id;
                  updated += 1;
                }
              }
            }

            if (!dedupedEventId) {
              const newId = nextSnowflake<EventId>();
              const syncNow = new Date();
              await db.insert(events).values({
                allDay: mapped.allDay,
                color: mapped.color,
                createdBy: userId,
                description: mapped.description,
                endsAt: mapped.endsAt,
                exdates: mapped.exdates,
                iCalUid: item.iCalUID ?? null,
                id: newId,
                isReadOnly: !isWritableAccessRole(source.accessRole),
                recurrence: mapped.recurrence,
                recurrenceUntil: mapped.recurrenceUntil,
                reminderEnabled: false,
                rrule: mapped.rrule,
                scope: "mine",
                source: "google",
                startsAt: mapped.startsAt,
                title: mapped.title,
                updatedAt: syncNow,
              });

              await upsertEventGoogleLink({
                calendarId: source.calendarId,
                etag: item.etag ?? null,
                eventId: newId,
                googleEventId: item.id,
                lastSyncedAt: syncNow,
                userId,
              });

              imported += 1;
            }
          }
        } catch (itemError) {
          console.error(
            `[sync-google-calendar] failed to process remote event ${item.id}`,
            itemError,
          );
        }
      }
    }

    for (const { remoteRes, source } of fetchedSources) {
      const cancelledItems = remoteRes.items.filter((item) => item.status === "cancelled");

      for (const item of cancelledItems) {
        try {
          const userLinksOnItem = await db
            .select()
            .from(eventGoogleLinks)
            .where(
              and(eq(eventGoogleLinks.userId, userId), eq(eventGoogleLinks.googleEventId, item.id)),
            );

          const link =
            userLinksOnItem.find((l) => l.calendarId === source.calendarId) ?? userLinksOnItem[0];

          // WARN: A cancellation whose link already moved to another calendarId is the source-side tombstone of a cross-calendar move.
          if (link && link.calendarId !== source.calendarId) {
            continue;
          }

          if (item.recurringEventId && item.originalStartTime) {
            const originalStartKey =
              item.originalStartTime.date ??
              (item.originalStartTime.dateTime ? toDayKey(item.originalStartTime.dateTime) : null);

            if (!originalStartKey) {
              continue;
            }

            const [masterLink] = await db
              .select()
              .from(eventGoogleLinks)
              .where(
                and(
                  eq(eventGoogleLinks.userId, userId),
                  eq(eventGoogleLinks.googleEventId, item.recurringEventId),
                ),
              )
              .limit(1);

            if (masterLink && masterLink.calendarId !== source.calendarId) {
              continue;
            }

            if (masterLink) {
              const [masterEvent] = await db
                .select()
                .from(events)
                .where(eq(events.id, masterLink.eventId))
                .limit(1);

              if (masterEvent && !masterEvent.exdates.includes(originalStartKey)) {
                const masterNow = new Date();
                const [updatedMaster] = await db
                  .update(events)
                  .set({
                    exdates: [...masterEvent.exdates, originalStartKey],
                    updatedAt: masterNow,
                  })
                  .where(eq(events.id, masterEvent.id))
                  .returning();

                await db
                  .update(eventGoogleLinks)
                  .set({ lastSyncedAt: masterNow })
                  .where(
                    and(
                      eq(eventGoogleLinks.eventId, masterEvent.id),
                      eq(eventGoogleLinks.userId, userId),
                    ),
                  );

                if (updatedMaster) {
                  updated += 1;
                  if (updatedMaster.scope === "shared") {
                    await propagateSharedEventPatchToPartners(masterEvent.id, userId);
                  }
                }
              }
            }

            if (link) {
              deleted += await cleanupDeletedEvent(link.eventId, userId);
            }
          } else if (link) {
            deleted += await cleanupDeletedEvent(link.eventId, userId);
          }
        } catch (itemError) {
          console.error(
            `[sync-google-calendar] failed to process cancelled remote event ${item.id}`,
            itemError,
          );
        }
      }
    }

    for (const { remoteRes, source } of fetchedSources) {
      await db
        .update(googleCalendarSources)
        .set({
          lastSyncedAt: new Date(),
          syncToken: remoteRes.nextSyncToken ?? source.syncToken,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(googleCalendarSources.userId, userId),
            eq(googleCalendarSources.calendarId, source.calendarId),
          ),
        );
    }

    const dirtyLinks = await db
      .select({
        event: events,
        link: eventGoogleLinks,
      })
      .from(eventGoogleLinks)
      .innerJoin(events, eq(events.id, eventGoogleLinks.eventId))
      .where(eq(eventGoogleLinks.userId, userId));

    // INFO: Hold dirty-link reconciliation back for 10s so an in-flight route `after()` push finishes without racing.
    const dirtyCutoffMs = Date.now() - 10 * A_SECOND;

    for (const { event: eventRow, link: linkRow } of dirtyLinks) {
      if (
        eventRow.updatedAt.getTime() <= linkRow.lastSyncedAt.getTime() ||
        eventRow.updatedAt.getTime() > dirtyCutoffMs
      ) {
        continue;
      }

      const matchedSource = enabledSources.find((s) => s.calendarId === linkRow.calendarId);
      if (!matchedSource || !isWritableAccessRole(matchedSource.accessRole)) {
        continue;
      }

      try {
        const patched = await runWithToken((token) =>
          patchRemoteEvent(
            token,
            linkRow.calendarId,
            linkRow.googleEventId,
            toGoogleEventPayload(eventRow, {
              isPatch: true,
              omitRecurrence: Boolean(linkRow.recurringMasterGoogleId),
            }),
          ),
        );

        if (patched.notFound) {
          const [currentAccount] = await db
            .select()
            .from(googleCalendarAccounts)
            .where(eq(googleCalendarAccounts.userId, userId))
            .limit(1);

          if (currentAccount) {
            const targetCalId = resolveTargetCalendarId(currentAccount, sources);
            if (targetCalId) {
              const created = await runWithToken((token) =>
                insertRemoteEvent(token, targetCalId, toGoogleEventPayload(eventRow, false)),
              );

              await db
                .update(eventGoogleLinks)
                .set({
                  calendarId: targetCalId,
                  etag: created.etag ?? null,
                  googleEventId: created.id,
                  lastSyncedAt: new Date(),
                  originalStartKey: null,
                  recurringMasterGoogleId: null,
                })
                .where(
                  and(
                    eq(eventGoogleLinks.eventId, linkRow.eventId),
                    eq(eventGoogleLinks.userId, userId),
                  ),
                );
            }
          }
        } else {
          await db
            .update(eventGoogleLinks)
            .set({
              etag: patched.event?.etag ?? null,
              lastSyncedAt: new Date(),
            })
            .where(
              and(
                eq(eventGoogleLinks.eventId, linkRow.eventId),
                eq(eventGoogleLinks.userId, userId),
              ),
            );
        }
      } catch (dirtyErr) {
        console.error(
          `[sync-google-calendar] failed dirty-link reconciliation for event ${eventRow.id}`,
          dirtyErr,
        );
      }
    }

    const [refreshedAccount] = await db
      .select()
      .from(googleCalendarAccounts)
      .where(eq(googleCalendarAccounts.userId, userId))
      .limit(1);

    if (refreshedAccount) {
      const targetCalendarId = resolveTargetCalendarId(refreshedAccount, sources);

      if (targetCalendarId) {
        const isInitialExport = !refreshedAccount.initialExportDone;
        const candidateEvents = await db
          .select()
          .from(events)
          .where(
            isInitialExport
              ? or(
                  eq(events.scope, "shared"),
                  and(eq(events.source, "jandh"), eq(events.createdBy, userId)),
                )
              : and(
                  eq(events.scope, "shared"),
                  lt(events.updatedAt, new Date(Date.now() - 15 * A_SECOND)),
                ),
          );

        const existingUserLinks = await db
          .select({ eventId: eventGoogleLinks.eventId })
          .from(eventGoogleLinks)
          .where(eq(eventGoogleLinks.userId, userId));

        const linkedEventIds = new Set(existingUserLinks.map((link) => link.eventId));
        const unlinkedEvents = candidateEvents.filter(
          (candidate) => !linkedEventIds.has(candidate.id),
        );

        let exportCount = 0;
        let authFailed = false;

        for (const candidate of unlinkedEvents) {
          // WARN: Re-check right before insertRemoteEvent because an `after()` push may have linked the row while earlier exports ran.
          const [alreadyLinked] = await db
            .select({ eventId: eventGoogleLinks.eventId })
            .from(eventGoogleLinks)
            .where(
              and(eq(eventGoogleLinks.eventId, candidate.id), eq(eventGoogleLinks.userId, userId)),
            )
            .limit(1);

          if (alreadyLinked) {
            continue;
          }

          if (!isInitialExport && candidate.updatedAt.getTime() > Date.now() - 15 * A_SECOND) {
            continue;
          }

          try {
            const created = await runWithToken((token) =>
              insertRemoteEvent(token, targetCalendarId, toGoogleEventPayload(candidate, false)),
            );

            await upsertEventGoogleLink({
              calendarId: targetCalendarId,
              etag: created.etag ?? null,
              eventId: candidate.id,
              googleEventId: created.id,
              lastSyncedAt: new Date(),
              userId,
            });

            if (created.iCalUID && !candidate.iCalUid) {
              await db
                .update(events)
                .set({ iCalUid: created.iCalUID })
                .where(eq(events.id, candidate.id));
            }

            exported += 1;
            exportCount += 1;

            if (exportCount % EXPORT_BATCH_SIZE === 0) {
              await new Promise((resolve) => setTimeout(resolve, EXPORT_BATCH_PAUSE_MS));
            }
          } catch (itemError) {
            console.error(
              `[sync-google-calendar] failed to export event ${candidate.id} for user ${userId}`,
              itemError,
            );
            if (itemError instanceof GoogleApiAuthError) {
              throw itemError;
            }
            if (
              (itemError instanceof GoogleCalendarApiError &&
                (itemError.status === 401 || itemError.status === 403)) ||
              (itemError instanceof Error &&
                (itemError.message.includes("401") || itemError.message.includes("403")))
            ) {
              authFailed = true;
              break;
            }
          }
        }

        if (isInitialExport && !authFailed) {
          await db
            .update(googleCalendarAccounts)
            .set({ initialExportDone: true, updatedAt: new Date() })
            .where(eq(googleCalendarAccounts.userId, userId));
        }
      }
    }

    const now = new Date();
    await db
      .update(googleCalendarAccounts)
      .set({
        lastSyncedAt: now,
        syncError: null,
        updatedAt: now,
      })
      .where(eq(googleCalendarAccounts.userId, userId));

    return {
      changed: imported + updated + deleted > 0,
      deleted,
      exported,
      imported,
      lastSyncedAt: now.toISOString(),
      syncError: null,
      updated,
    };
  } catch (syncErr) {
    console.error(`[sync-google-calendar] sync failed for user ${userId}`, syncErr);
    const errorCode = toSyncErrorCode(syncErr);

    await db
      .update(googleCalendarAccounts)
      .set({ syncError: errorCode, updatedAt: new Date() })
      .where(eq(googleCalendarAccounts.userId, userId));

    const [current] = await db
      .select()
      .from(googleCalendarAccounts)
      .where(eq(googleCalendarAccounts.userId, userId))
      .limit(1);

    return {
      changed: false,
      deleted,
      exported,
      imported,
      lastSyncedAt: current?.lastSyncedAt?.toISOString() ?? null,
      syncError: errorCode,
      updated,
    };
  } finally {
    await db
      .update(googleCalendarAccounts)
      .set({ syncingUntil: null })
      .where(eq(googleCalendarAccounts.userId, userId));
  }
}

export async function syncAllGoogleCalendars(options?: { minIntervalMs?: number }): Promise<{
  changed: boolean;
  syncedUsers: number;
}> {
  const db = getDb();
  const accounts = await db
    .select({ userId: googleCalendarAccounts.userId })
    .from(googleCalendarAccounts);

  let anyChanged = false;
  let syncedUsers = 0;

  for (const account of accounts) {
    try {
      const result = await syncUserGoogleCalendar(account.userId, {
        minIntervalMs: options?.minIntervalMs,
        source: "cron",
      });
      if (result.changed) {
        anyChanged = true;
      }
      syncedUsers += 1;
    } catch (error) {
      console.error(`[sync-google-calendar] failed for user ${account.userId}`, error);
    }
  }

  return {
    changed: anyChanged,
    syncedUsers,
  };
}
