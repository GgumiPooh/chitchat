import "server-only";

import {
  decryptGoogleCalendarToken,
  encryptGoogleCalendarToken,
  getGoogleClient,
} from "@/shared/auth";
import { isExcludedGoogleCalendarId } from "@/shared/config";
import {
  eventGoogleLinks,
  events,
  getDb,
  googleCalendarAccounts,
  googleCalendarSources,
  type GoogleCalendarAccount,
  type GoogleCalendarSourceRow,
} from "@/shared/db";
import type { Nullable, Optional, UserId } from "@/shared/lib";
import { and, asc, desc, eq } from "drizzle-orm";
import type {
  GoogleCalendarConnection,
  GoogleCalendarOverview,
  GoogleCalendarSource,
} from "../model/types";
import {
  GoogleApiAuthError,
  listRemoteCalendars,
  toSyncErrorCode,
  withGoogleAccessToken,
} from "./client";

export function isWritableAccessRole(role: string): boolean {
  return role === "owner" || role === "writer";
}

export function resolveTargetCalendarId(
  account: GoogleCalendarAccount,
  sources: readonly GoogleCalendarSourceRow[],
  requestedCalendarId?: Optional<string>,
): Nullable<string> {
  const primarySource = sources.find((source) => source.isPrimary);

  if (requestedCalendarId) {
    const candidateId =
      requestedCalendarId === "primary" ? primarySource?.calendarId : requestedCalendarId;

    if (candidateId) {
      const matched = sources.find(
        (source) =>
          source.calendarId === candidateId &&
          source.syncEnabled &&
          isWritableAccessRole(source.accessRole),
      );

      if (matched) {
        return matched.calendarId;
      }
    }
  }

  const defaultCandidateId =
    account.defaultCalendarId === "primary" ? primarySource?.calendarId : account.defaultCalendarId;

  if (defaultCandidateId) {
    const matched = sources.find(
      (source) =>
        source.calendarId === defaultCandidateId &&
        source.syncEnabled &&
        isWritableAccessRole(source.accessRole),
    );

    if (matched) {
      return matched.calendarId;
    }
  }

  if (
    primarySource &&
    primarySource.syncEnabled &&
    isWritableAccessRole(primarySource.accessRole)
  ) {
    return primarySource.calendarId;
  }

  const firstWritableEnabled = sources.find(
    (source) => source.syncEnabled && isWritableAccessRole(source.accessRole),
  );

  return firstWritableEnabled?.calendarId ?? null;
}

export async function cleanupGoogleEventLinksForUser(
  userId: UserId,
  calendarId?: string,
): Promise<void> {
  const db = getDb();
  const whereClause = calendarId
    ? and(eq(eventGoogleLinks.userId, userId), eq(eventGoogleLinks.calendarId, calendarId))
    : eq(eventGoogleLinks.userId, userId);

  const matchedLinks = await db
    .select({ eventId: eventGoogleLinks.eventId })
    .from(eventGoogleLinks)
    .where(whereClause);

  if (matchedLinks.length === 0) {
    return;
  }

  const affectedEventIds = Array.from(new Set(matchedLinks.map((link) => link.eventId)));

  await db.delete(eventGoogleLinks).where(whereClause);

  for (const eventId of affectedEventIds) {
    const [eventRow] = await db
      .select({ createdBy: events.createdBy, id: events.id, source: events.source })
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);

    if (!eventRow || eventRow.source !== "google") {
      continue;
    }

    const remainingLinks = await db
      .select({ userId: eventGoogleLinks.userId })
      .from(eventGoogleLinks)
      .where(eq(eventGoogleLinks.eventId, eventId));

    if (remainingLinks.length === 0) {
      await db.delete(events).where(eq(events.id, eventId));
    } else {
      const remainingUser = remainingLinks[0].userId;
      await db
        .update(events)
        .set({ createdBy: remainingUser, scope: "mine", updatedAt: new Date() })
        .where(eq(events.id, eventId));
    }
  }
}

export async function getGoogleCalendarOverview(userId: UserId): Promise<GoogleCalendarOverview> {
  const db = getDb();
  const [account] = await db
    .select()
    .from(googleCalendarAccounts)
    .where(eq(googleCalendarAccounts.userId, userId))
    .limit(1);

  const sourcesRows = await db
    .select()
    .from(googleCalendarSources)
    .where(eq(googleCalendarSources.userId, userId))
    .orderBy(desc(googleCalendarSources.isPrimary), asc(googleCalendarSources.summary));

  const validSources = sourcesRows.filter(
    (source) => !isExcludedGoogleCalendarId(source.calendarId),
  );

  const accountView: Nullable<GoogleCalendarConnection> = account
    ? {
        connectedAt: account.connectedAt.toISOString(),
        defaultCalendarId: account.defaultCalendarId,
        googleEmail: account.googleEmail,
        initialExportDone: account.initialExportDone,
        lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
        syncError: account.syncError ?? null,
      }
    : null;

  const sourcesViews: GoogleCalendarSource[] = validSources.map((source) => ({
    accessRole: source.accessRole,
    backgroundColor: source.backgroundColor ?? null,
    calendarId: source.calendarId,
    isPrimary: source.isPrimary,
    isWritable: isWritableAccessRole(source.accessRole),
    lastSyncedAt: source.lastSyncedAt?.toISOString() ?? null,
    summary: source.summary,
    syncEnabled: source.syncEnabled,
  }));

  return {
    account: accountView,
    sources: sourcesViews,
  };
}

export async function syncRemoteCalendarSources(userId: UserId): Promise<GoogleCalendarOverview> {
  const db = getDb();
  const remoteCalendars = await withGoogleAccessToken(userId, (accessToken) =>
    listRemoteCalendars(accessToken),
  );

  if (!remoteCalendars) {
    throw new GoogleApiAuthError("Google access token unavailable");
  }

  const existingSources = await db
    .select()
    .from(googleCalendarSources)
    .where(eq(googleCalendarSources.userId, userId));

  const existingMap = new Map(existingSources.map((source) => [source.calendarId, source]));
  const remoteMap = new Map(remoteCalendars.map((calendar) => [calendar.calendarId, calendar]));

  for (const remote of remoteCalendars) {
    const existing = existingMap.get(remote.calendarId);

    if (existing) {
      await db
        .update(googleCalendarSources)
        .set({
          accessRole: remote.accessRole,
          backgroundColor: remote.backgroundColor,
          isPrimary: remote.isPrimary,
          summary: remote.summary,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(googleCalendarSources.userId, userId),
            eq(googleCalendarSources.calendarId, remote.calendarId),
          ),
        );
    } else {
      await db.insert(googleCalendarSources).values({
        accessRole: remote.accessRole,
        backgroundColor: remote.backgroundColor,
        calendarId: remote.calendarId,
        isPrimary: remote.isPrimary,
        summary: remote.summary,
        syncEnabled: remote.isPrimary,
        updatedAt: new Date(),
        userId,
      });
    }
  }

  for (const existing of existingSources) {
    if (!remoteMap.has(existing.calendarId) || isExcludedGoogleCalendarId(existing.calendarId)) {
      await cleanupGoogleEventLinksForUser(userId, existing.calendarId);
      await db
        .delete(googleCalendarSources)
        .where(
          and(
            eq(googleCalendarSources.userId, userId),
            eq(googleCalendarSources.calendarId, existing.calendarId),
          ),
        );
    }
  }

  const [account] = await db
    .select()
    .from(googleCalendarAccounts)
    .where(eq(googleCalendarAccounts.userId, userId))
    .limit(1);

  if (account) {
    const updates: { defaultCalendarId?: string; syncError?: Nullable<string>; updatedAt: Date } = {
      updatedAt: new Date(),
    };
    let shouldUpdate = false;

    if (account.syncError === "api_disabled") {
      updates.syncError = null;
      shouldUpdate = true;
    }

    if (account.defaultCalendarId === "primary") {
      const primarySource = remoteCalendars.find((calendar) => calendar.isPrimary);
      if (primarySource) {
        updates.defaultCalendarId = primarySource.calendarId;
        shouldUpdate = true;
      }
    }

    if (shouldUpdate) {
      await db
        .update(googleCalendarAccounts)
        .set(updates)
        .where(eq(googleCalendarAccounts.userId, userId));
    }
  }

  return getGoogleCalendarOverview(userId);
}

export async function refreshAndGetGoogleCalendarSources(
  userId: UserId,
): Promise<GoogleCalendarOverview> {
  try {
    return await syncRemoteCalendarSources(userId);
  } catch (error) {
    const errorCode = toSyncErrorCode(error);
    const db = getDb();
    await db
      .update(googleCalendarAccounts)
      .set({ syncError: errorCode, updatedAt: new Date() })
      .where(eq(googleCalendarAccounts.userId, userId));

    return getGoogleCalendarOverview(userId);
  }
}

export async function connectGoogleCalendarAccount(params: {
  accessToken: string;
  accessTokenExpiresAt: Date;
  googleEmail: string;
  refreshToken: Optional<string>;
  userId: UserId;
}): Promise<boolean> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(googleCalendarAccounts)
    .where(eq(googleCalendarAccounts.userId, params.userId))
    .limit(1);

  let refreshTokenToStore = params.refreshToken;

  if (
    !refreshTokenToStore &&
    existing &&
    existing.googleEmail.trim().toLowerCase() === params.googleEmail.trim().toLowerCase()
  ) {
    refreshTokenToStore = decryptGoogleCalendarToken(existing.encryptedRefreshToken) ?? undefined;
  }

  if (!refreshTokenToStore) {
    return false;
  }

  if (
    existing &&
    existing.googleEmail.trim().toLowerCase() !== params.googleEmail.trim().toLowerCase()
  ) {
    await cleanupGoogleEventLinksForUser(params.userId);
    await db.delete(googleCalendarSources).where(eq(googleCalendarSources.userId, params.userId));
  }

  await db
    .insert(googleCalendarAccounts)
    .values({
      accessTokenExpiresAt: params.accessTokenExpiresAt,
      connectedAt: new Date(),
      defaultCalendarId: "primary",
      encryptedAccessToken: encryptGoogleCalendarToken(params.accessToken),
      encryptedRefreshToken: encryptGoogleCalendarToken(refreshTokenToStore),
      googleEmail: params.googleEmail,
      initialExportDone: false,
      syncError: null,
      updatedAt: new Date(),
      userId: params.userId,
    })
    .onConflictDoUpdate({
      set: {
        accessTokenExpiresAt: params.accessTokenExpiresAt,
        encryptedAccessToken: encryptGoogleCalendarToken(params.accessToken),
        encryptedRefreshToken: encryptGoogleCalendarToken(refreshTokenToStore),
        googleEmail: params.googleEmail,
        syncError: null,
        updatedAt: new Date(),
      },
      target: googleCalendarAccounts.userId,
    });

  await refreshAndGetGoogleCalendarSources(params.userId);

  return true;
}

export async function updateGoogleCalendarDefault(
  userId: UserId,
  defaultCalendarId: string,
): Promise<Nullable<GoogleCalendarOverview>> {
  const db = getDb();
  const sources = await db
    .select()
    .from(googleCalendarSources)
    .where(eq(googleCalendarSources.userId, userId));

  const primarySource = sources.find((source) => source.isPrimary);
  const targetId = defaultCalendarId === "primary" ? primarySource?.calendarId : defaultCalendarId;

  if (!targetId) {
    return null;
  }

  const matched = sources.find(
    (source) => source.calendarId === targetId && isWritableAccessRole(source.accessRole),
  );

  if (!matched) {
    return null;
  }

  if (!matched.syncEnabled) {
    await db
      .update(googleCalendarSources)
      .set({ syncEnabled: true, updatedAt: new Date() })
      .where(
        and(
          eq(googleCalendarSources.userId, userId),
          eq(googleCalendarSources.calendarId, targetId),
        ),
      );
  }

  await db
    .update(googleCalendarAccounts)
    .set({ defaultCalendarId: targetId, updatedAt: new Date() })
    .where(eq(googleCalendarAccounts.userId, userId));

  return getGoogleCalendarOverview(userId);
}

export async function updateGoogleCalendarSourceSelection(
  userId: UserId,
  updates: readonly { calendarId: string; syncEnabled: boolean }[],
): Promise<GoogleCalendarOverview> {
  const db = getDb();
  const [account] = await db
    .select()
    .from(googleCalendarAccounts)
    .where(eq(googleCalendarAccounts.userId, userId))
    .limit(1);

  for (const update of updates) {
    if (isExcludedGoogleCalendarId(update.calendarId)) {
      continue;
    }

    const [current] = await db
      .select()
      .from(googleCalendarSources)
      .where(
        and(
          eq(googleCalendarSources.userId, userId),
          eq(googleCalendarSources.calendarId, update.calendarId),
        ),
      )
      .limit(1);

    if (!current) {
      continue;
    }

    if (current.syncEnabled && !update.syncEnabled) {
      await db
        .update(googleCalendarSources)
        .set({ syncEnabled: false, syncToken: null, updatedAt: new Date() })
        .where(
          and(
            eq(googleCalendarSources.userId, userId),
            eq(googleCalendarSources.calendarId, update.calendarId),
          ),
        );

      await cleanupGoogleEventLinksForUser(userId, update.calendarId);

      if (account && account.defaultCalendarId === update.calendarId) {
        const remainingSources = await db
          .select()
          .from(googleCalendarSources)
          .where(eq(googleCalendarSources.userId, userId));

        const fallbackId = resolveTargetCalendarId(account, remainingSources);
        if (fallbackId) {
          await db
            .update(googleCalendarAccounts)
            .set({ defaultCalendarId: fallbackId, updatedAt: new Date() })
            .where(eq(googleCalendarAccounts.userId, userId));
        }
      }
    } else if (!current.syncEnabled && update.syncEnabled) {
      await db
        .update(googleCalendarSources)
        .set({ syncEnabled: true, updatedAt: new Date() })
        .where(
          and(
            eq(googleCalendarSources.userId, userId),
            eq(googleCalendarSources.calendarId, update.calendarId),
          ),
        );
    }
  }

  return getGoogleCalendarOverview(userId);
}

export async function disconnectGoogleCalendarAccount(userId: UserId): Promise<void> {
  const db = getDb();
  const [account] = await db
    .select()
    .from(googleCalendarAccounts)
    .where(eq(googleCalendarAccounts.userId, userId))
    .limit(1);

  if (account) {
    const refreshToken = decryptGoogleCalendarToken(account.encryptedRefreshToken);
    if (refreshToken) {
      await getGoogleClient()
        .revokeToken(refreshToken)
        .catch(() => undefined);
    }
  }

  await cleanupGoogleEventLinksForUser(userId);
  await db.delete(googleCalendarSources).where(eq(googleCalendarSources.userId, userId));
  await db.delete(googleCalendarAccounts).where(eq(googleCalendarAccounts.userId, userId));
}

export async function hasGoogleCalendarAccount(userId: UserId): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ userId: googleCalendarAccounts.userId })
    .from(googleCalendarAccounts)
    .where(eq(googleCalendarAccounts.userId, userId))
    .limit(1);

  return Boolean(row);
}
