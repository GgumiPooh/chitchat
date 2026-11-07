import "server-only";

import { snowflakeSchema } from "@/shared/config";
import {
  eventGoogleLinks,
  events,
  getDb,
  googleCalendarAccounts,
  googleCalendarSources,
  nextSnowflake,
  type NewEventGoogleLink,
} from "@/shared/db";
import {
  A_MINUTE,
  A_SECOND,
  toDayKey,
  type EventId,
  type Nullable,
  type UserId,
} from "@/shared/lib";
import { and, eq, isNull, lt, ne, or } from "drizzle-orm";
import type { GoogleCalendarSyncResult } from "../model/types";
import {
  isWritableAccessRole,
  refreshAndGetGoogleCalendarSources,
  resolveTargetCalendarId,
} from "./account";
import {
  GoogleApiAuthError,
  deleteRemoteEvent,
  getValidGoogleAccessToken,
  insertRemoteEvent,
  invalidateGoogleAccessToken,
  listRemoteEvents,
  patchRemoteEvent,
  withGoogleAccessToken,
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

export async function syncUserGoogleCalendar(
  userId: UserId,
  options?: { waitForInFlight?: boolean },
): Promise<GoogleCalendarSyncResult> {
  const db = getDb();
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

    await refreshAndGetGoogleCalendarSources(userId);

    const sources = await db
      .select()
      .from(googleCalendarSources)
      .where(eq(googleCalendarSources.userId, userId));

    const enabledSources = sources.filter((source) => source.syncEnabled);

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

      const masters = remoteRes.items.filter((item) => !item.recurringEventId);
      const exceptions = remoteRes.items.filter((item) => Boolean(item.recurringEventId));
      const orderedItems = [...masters, ...exceptions];

      for (const item of orderedItems) {
        try {
          const userLinksOnItem = await db
            .select()
            .from(eventGoogleLinks)
            .where(
              and(eq(eventGoogleLinks.userId, userId), eq(eventGoogleLinks.googleEventId, item.id)),
            );

          const link =
            userLinksOnItem.find((l) => l.calendarId === source.calendarId) ?? userLinksOnItem[0];

          if (item.status === "cancelled") {
            if (item.recurringEventId && item.originalStartTime) {
              const originalStartKey =
                item.originalStartTime.date ??
                (item.originalStartTime.dateTime
                  ? toDayKey(item.originalStartTime.dateTime)
                  : null);

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

                  if (updatedMaster && updatedMaster.scope === "shared") {
                    const partnerLinks = await db
                      .select()
                      .from(eventGoogleLinks)
                      .where(
                        and(
                          eq(eventGoogleLinks.eventId, masterEvent.id),
                          ne(eventGoogleLinks.userId, userId),
                        ),
                      );

                    for (const partnerLink of partnerLinks) {
                      const [partnerSource] = await db
                        .select({ accessRole: googleCalendarSources.accessRole })
                        .from(googleCalendarSources)
                        .where(
                          and(
                            eq(googleCalendarSources.userId, partnerLink.userId),
                            eq(googleCalendarSources.calendarId, partnerLink.calendarId),
                          ),
                        )
                        .limit(1);

                      if (partnerSource && isWritableAccessRole(partnerSource.accessRole)) {
                        const patched = await withGoogleAccessToken(partnerLink.userId, (token) =>
                          patchRemoteEvent(
                            token,
                            partnerLink.calendarId,
                            partnerLink.googleEventId,
                            toGoogleEventPayload(updatedMaster, true),
                          ),
                        ).catch(() => null);

                        if (patched && !patched.notFound && patched.event?.etag) {
                          await db
                            .update(eventGoogleLinks)
                            .set({
                              etag: patched.event.etag,
                              lastSyncedAt: new Date(),
                            })
                            .where(
                              and(
                                eq(eventGoogleLinks.eventId, masterEvent.id),
                                eq(eventGoogleLinks.userId, partnerLink.userId),
                              ),
                            );
                        }
                      }
                    }
                  }
                }
              }

              if (link) {
                await db.delete(events).where(eq(events.id, link.eventId));
                deleted += 1;
              }
            } else if (link) {
              const allLinks = await db
                .select()
                .from(eventGoogleLinks)
                .where(eq(eventGoogleLinks.eventId, link.eventId));

              await db
                .delete(eventGoogleLinks)
                .where(
                  and(
                    eq(eventGoogleLinks.eventId, link.eventId),
                    eq(eventGoogleLinks.userId, userId),
                  ),
                );

              const [eventRow] = await db
                .select()
                .from(events)
                .where(eq(events.id, link.eventId))
                .limit(1);

              if (eventRow) {
                if (eventRow.scope === "shared" && allLinks.length > 1) {
                  for (const otherLink of allLinks) {
                    if (otherLink.userId !== userId) {
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
                          deleteRemoteEvent(
                            otherToken,
                            otherLink.calendarId,
                            otherLink.googleEventId,
                          ),
                        ).catch(() => undefined);
                      }
                      await db
                        .delete(eventGoogleLinks)
                        .where(
                          and(
                            eq(eventGoogleLinks.eventId, link.eventId),
                            eq(eventGoogleLinks.userId, otherLink.userId),
                          ),
                        );
                    }
                  }
                  await db.delete(events).where(eq(events.id, link.eventId));
                  deleted += 1;
                } else if (allLinks.length <= 1) {
                  await db.delete(events).where(eq(events.id, link.eventId));
                  deleted += 1;
                }
              }
            }
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

                if (updatedMaster && updatedMaster.scope === "shared") {
                  const partnerLinks = await db
                    .select()
                    .from(eventGoogleLinks)
                    .where(
                      and(
                        eq(eventGoogleLinks.eventId, masterEvent.id),
                        ne(eventGoogleLinks.userId, userId),
                      ),
                    );

                  for (const partnerLink of partnerLinks) {
                    const [partnerSource] = await db
                      .select({ accessRole: googleCalendarSources.accessRole })
                      .from(googleCalendarSources)
                      .where(
                        and(
                          eq(googleCalendarSources.userId, partnerLink.userId),
                          eq(googleCalendarSources.calendarId, partnerLink.calendarId),
                        ),
                      )
                      .limit(1);

                    if (partnerSource && isWritableAccessRole(partnerSource.accessRole)) {
                      const patched = await withGoogleAccessToken(partnerLink.userId, (token) =>
                        patchRemoteEvent(
                          token,
                          partnerLink.calendarId,
                          partnerLink.googleEventId,
                          toGoogleEventPayload(updatedMaster, true),
                        ),
                      ).catch(() => null);

                      if (patched && !patched.notFound && patched.event?.etag) {
                        await db
                          .update(eventGoogleLinks)
                          .set({
                            etag: patched.event.etag,
                            lastSyncedAt: new Date(),
                          })
                          .where(
                            and(
                              eq(eventGoogleLinks.eventId, masterEvent.id),
                              eq(eventGoogleLinks.userId, partnerLink.userId),
                            ),
                          );
                      }
                    }
                  }
                }
              }
            }

            const mapped = fromRemotePayload(
              item,
              source.isPrimary ? null : source.backgroundColor,
              source.accessRole,
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
              if (link.etag && item.etag && link.etag === item.etag) {
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

              // INFO: Protect an in-flight or newer local J&H write from being reverted by an older Google snapshot during a 1-minute cron overlap.
              if (
                localUpdatedMs > linkSyncedMs + A_SECOND &&
                (Number.isNaN(remoteUpdatedMs) || localUpdatedMs > remoteUpdatedMs)
              ) {
                if (isWritableAccessRole(source.accessRole)) {
                  const patched = await runWithToken((token) =>
                    patchRemoteEvent(
                      token,
                      source.calendarId,
                      item.id,
                      toGoogleEventPayload(existing, true),
                    ),
                  );
                  if (!patched.notFound) {
                    await db
                      .update(eventGoogleLinks)
                      .set({
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

              const effectiveColor =
                existing.source === "jandh"
                  ? item.colorId
                    ? mapped.color
                    : existing.color
                  : mapped.color;

              await db
                .update(events)
                .set({
                  ...standaloneValues,
                  color: effectiveColor,
                  isReadOnly: !isWritableAccessRole(source.accessRole),
                  updatedAt: new Date(),
                })
                .where(eq(events.id, link.eventId));

              await db
                .update(eventGoogleLinks)
                .set({
                  etag: item.etag ?? null,
                  lastSyncedAt: new Date(),
                })
                .where(
                  and(
                    eq(eventGoogleLinks.eventId, link.eventId),
                    eq(eventGoogleLinks.userId, userId),
                  ),
                );

              updated += 1;
            } else {
              const newId = nextSnowflake<EventId>();
              await db.insert(events).values({
                ...standaloneValues,
                createdBy: userId,
                id: newId,
                isReadOnly: !isWritableAccessRole(source.accessRole),
                reminderEnabled: false,
                scope: "mine",
                source: "google",
                updatedAt: new Date(),
              });

              await upsertEventGoogleLink({
                calendarId: source.calendarId,
                etag: item.etag ?? null,
                eventId: newId,
                googleEventId: item.id,
                lastSyncedAt: new Date(),
                originalStartKey,
                recurringMasterGoogleId: item.recurringEventId,
                userId,
              });

              imported += 1;
            }
            continue;
          }

          const mapped = fromRemotePayload(
            item,
            source.isPrimary ? null : source.backgroundColor,
            source.accessRole,
          );
          if (!mapped) {
            continue;
          }

          if (link) {
            if (link.etag && item.etag && link.etag === item.etag) {
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

            // INFO: Protect an in-flight or newer local J&H write from being reverted by an older Google snapshot during a 1-minute cron overlap.
            if (
              localUpdatedMs > linkSyncedMs + A_SECOND &&
              (Number.isNaN(remoteUpdatedMs) || localUpdatedMs > remoteUpdatedMs)
            ) {
              if (isWritableAccessRole(source.accessRole)) {
                const patched = await runWithToken((token) =>
                  patchRemoteEvent(
                    token,
                    source.calendarId,
                    item.id,
                    toGoogleEventPayload(existing, true),
                  ),
                );
                if (!patched.notFound) {
                  await db
                    .update(eventGoogleLinks)
                    .set({
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

            let isReadOnlyValue = existing.isReadOnly;
            if (existing.source === "google") {
              let shouldBeReadOnly = !isWritableAccessRole(source.accessRole);
              if (shouldBeReadOnly) {
                const otherUserLinks = await db
                  .select({
                    calendarId: eventGoogleLinks.calendarId,
                    userId: eventGoogleLinks.userId,
                  })
                  .from(eventGoogleLinks)
                  .where(
                    and(
                      eq(eventGoogleLinks.eventId, existing.id),
                      ne(eventGoogleLinks.userId, userId),
                    ),
                  );

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
                    shouldBeReadOnly = false;
                    break;
                  }
                }
              }
              isReadOnlyValue = shouldBeReadOnly;
            }

            const effectiveColor =
              existing.source === "jandh"
                ? item.colorId
                  ? mapped.color
                  : existing.color
                : mapped.color;

            await db
              .update(events)
              .set({
                allDay: mapped.allDay,
                color: effectiveColor,
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
                updatedAt: new Date(),
              })
              .where(eq(events.id, existing.id));

            await db
              .update(eventGoogleLinks)
              .set({
                etag: item.etag ?? null,
                lastSyncedAt: new Date(),
              })
              .where(
                and(eq(eventGoogleLinks.eventId, existing.id), eq(eventGoogleLinks.userId, userId)),
              );

            updated += 1;

            if (existing.scope === "shared") {
              const otherLinks = await db
                .select()
                .from(eventGoogleLinks)
                .where(
                  and(
                    eq(eventGoogleLinks.eventId, existing.id),
                    ne(eventGoogleLinks.userId, userId),
                  ),
                );

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

                const [updatedEvent] = await db
                  .select()
                  .from(events)
                  .where(eq(events.id, existing.id))
                  .limit(1);

                if (updatedEvent) {
                  const patched = await withGoogleAccessToken(otherLink.userId, (token) =>
                    patchRemoteEvent(
                      token,
                      otherLink.calendarId,
                      otherLink.googleEventId,
                      toGoogleEventPayload(updatedEvent, true),
                    ),
                  ).catch(() => null);

                  if (patched && !patched.notFound && patched.event?.etag) {
                    await db
                      .update(eventGoogleLinks)
                      .set({
                        etag: patched.event.etag,
                        lastSyncedAt: new Date(),
                      })
                      .where(
                        and(
                          eq(eventGoogleLinks.eventId, existing.id),
                          eq(eventGoogleLinks.userId, otherLink.userId),
                        ),
                      );
                  }
                }
              }
            }
          } else {
            let dedupedEventId: Nullable<EventId> = null;

            // INFO: Step A (Deterministic J&H Event Re-Link)
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

                await upsertEventGoogleLink({
                  calendarId: source.calendarId,
                  etag: item.etag ?? null,
                  eventId: existingJandh.id,
                  googleEventId: item.id,
                  lastSyncedAt: new Date(),
                  userId,
                });

                if (!hasLink || hasLink.googleEventId !== item.id) {
                  updated += 1;
                }
                dedupedEventId = existingJandh.id;
              }
            }

            // INFO: Step B (Cross-User iCalUID Deduplication with Split-Series Protection)
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

                if (hasLinkForSameUser && hasLinkForSameUser.googleEventId !== item.id) {
                  // INFO: Google split a recurring series into a separate event sharing iCalUID on the same user's calendar — do not dedupe.
                  dedupedEventId = null;
                } else if (hasLinkForSameUser && hasLinkForSameUser.googleEventId === item.id) {
                  dedupedEventId = existingByIcal.id;
                } else {
                  await upsertEventGoogleLink({
                    calendarId: source.calendarId,
                    etag: item.etag ?? null,
                    eventId: existingByIcal.id,
                    googleEventId: item.id,
                    lastSyncedAt: new Date(),
                    userId,
                  });

                  if (existingByIcal.source === "google" && existingByIcal.createdBy !== userId) {
                    const shouldBeReadOnly = !isWritableAccessRole(source.accessRole);
                    await db
                      .update(events)
                      .set({
                        isReadOnly: shouldBeReadOnly ? existingByIcal.isReadOnly : false,
                        scope: "shared",
                        updatedAt: new Date(),
                      })
                      .where(eq(events.id, existingByIcal.id));
                  }

                  dedupedEventId = existingByIcal.id;
                  updated += 1;
                }
              }
            }

            if (!dedupedEventId) {
              const newId = nextSnowflake<EventId>();
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
                updatedAt: new Date(),
              });

              await upsertEventGoogleLink({
                calendarId: source.calendarId,
                etag: item.etag ?? null,
                eventId: newId,
                googleEventId: item.id,
                lastSyncedAt: new Date(),
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
      .where(
        and(eq(eventGoogleLinks.userId, userId), isNull(eventGoogleLinks.recurringMasterGoogleId)),
      );

    for (const { event: eventRow, link: linkRow } of dirtyLinks) {
      if (eventRow.updatedAt.getTime() <= linkRow.lastSyncedAt.getTime() + 5 * A_SECOND) {
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
            toGoogleEventPayload(eventRow, true),
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

    if (refreshedAccount && !refreshedAccount.initialExportDone) {
      const targetCalendarId = resolveTargetCalendarId(refreshedAccount, sources);

      if (targetCalendarId) {
        const candidateEvents = await db
          .select()
          .from(events)
          .where(
            and(
              eq(events.source, "jandh"),
              or(eq(events.scope, "shared"), eq(events.createdBy, userId)),
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
              itemError instanceof Error &&
              (itemError.message.includes("401") || itemError.message.includes("403"))
            ) {
              authFailed = true;
              break;
            }
          }
        }

        if (!authFailed) {
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
    const [current] = await db
      .select()
      .from(googleCalendarAccounts)
      .where(eq(googleCalendarAccounts.userId, userId))
      .limit(1);

    const finalSyncError =
      current?.syncError === "reauth_required" ? "reauth_required" : "sync_failed";
    if (current?.syncError !== "reauth_required") {
      await db
        .update(googleCalendarAccounts)
        .set({ syncError: "sync_failed", updatedAt: new Date() })
        .where(eq(googleCalendarAccounts.userId, userId));
    }

    return {
      changed: false,
      deleted,
      exported,
      imported,
      lastSyncedAt: current?.lastSyncedAt?.toISOString() ?? null,
      syncError: finalSyncError,
      updated,
    };
  } finally {
    await db
      .update(googleCalendarAccounts)
      .set({ syncingUntil: null })
      .where(eq(googleCalendarAccounts.userId, userId));
  }
}

export async function syncAllGoogleCalendars(): Promise<{
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
      const result = await syncUserGoogleCalendar(account.userId);
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
