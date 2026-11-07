import "server-only";

import {
  decryptGoogleCalendarToken,
  encryptGoogleCalendarToken,
  getGoogleClient,
} from "@/shared/auth";
import { isExcludedGoogleCalendarId } from "@/shared/config";
import { getDb, googleCalendarAccounts } from "@/shared/db";
import { A_MINUTE, A_SECOND, type Nullable, type Optional, type UserId } from "@/shared/lib";
import { OAuth2RequestError } from "arctic";
import { eq } from "drizzle-orm";

export class GoogleApiAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleApiAuthError";
  }
}

export class GoogleCalendarApiError extends Error {
  readonly status: number;
  readonly reason: Nullable<string>;
  readonly isApiDisabled: boolean;
  readonly isInsufficientPermissions: boolean;

  constructor(params: {
    isApiDisabled: boolean;
    isInsufficientPermissions: boolean;
    message: string;
    reason?: Nullable<string>;
    status: number;
  }) {
    super(params.message);
    this.name = "GoogleCalendarApiError";
    this.status = params.status;
    this.reason = params.reason ?? null;
    this.isApiDisabled = params.isApiDisabled;
    this.isInsufficientPermissions = params.isInsufficientPermissions;
  }
}

export function toSyncErrorCode(error: unknown): string {
  if (error instanceof GoogleCalendarApiError) {
    if (error.isApiDisabled) {
      return "api_disabled";
    }
    if (error.isInsufficientPermissions) {
      return "reauth_required";
    }
  }

  if (error instanceof GoogleApiAuthError) {
    return "reauth_required";
  }

  return "sync_failed";
}

async function parseGoogleApiError(
  operation: string,
  response: Response,
): Promise<GoogleCalendarApiError> {
  const rawText = await response.text().catch(() => "");
  let apiMessage = "";
  let reason: Nullable<string> = null;
  let detailReason: Nullable<string> = null;

  try {
    const body = JSON.parse(rawText) as {
      error?: {
        details?: Array<{ reason?: unknown }>;
        errors?: Array<{ reason?: unknown }>;
        message?: unknown;
      };
    };

    if (typeof body?.error?.message === "string") {
      apiMessage = body.error.message;
    }
    if (typeof body?.error?.errors?.[0]?.reason === "string") {
      reason = body.error.errors[0].reason;
    }
    if (Array.isArray(body?.error?.details)) {
      const detailEntry = body.error.details.find((entry) => typeof entry?.reason === "string");
      if (detailEntry && typeof detailEntry.reason === "string") {
        detailReason = detailEntry.reason;
      }
    }
  } catch {
    if (rawText) {
      apiMessage = rawText.slice(0, 300);
    }
  }

  const effectiveReason = detailReason || reason || null;
  const isApiDisabled =
    response.status === 403 &&
    (reason === "accessNotConfigured" ||
      detailReason === "SERVICE_DISABLED" ||
      apiMessage.includes("has not been used in project") ||
      apiMessage.includes("it is disabled"));

  const isInsufficientPermissions =
    response.status === 403 &&
    (reason === "insufficientPermissions" || detailReason === "ACCESS_TOKEN_SCOPE_INSUFFICIENT");

  console.error(
    `[google-calendar-api] ${operation} failed (${response.status}${effectiveReason ? ` ${effectiveReason}` : ""}): ${apiMessage || "no body"}`,
  );

  return new GoogleCalendarApiError({
    isApiDisabled,
    isInsufficientPermissions,
    message: apiMessage || `Google Calendar API error (${response.status})`,
    reason: effectiveReason,
    status: response.status,
  });
}

export type RemoteCalendarEntry = {
  accessRole: string;
  backgroundColor: Nullable<string>;
  calendarId: string;
  isPrimary: boolean;
  summary: string;
};

export type GoogleEventDate = {
  date?: string;
  dateTime?: string;
  timeZone?: string;
};

export type GoogleEventResource = {
  colorId?: string;
  description?: string;
  end?: GoogleEventDate;
  etag?: string;
  eventType?: string;
  iCalUID?: string;
  originalStartTime?: GoogleEventDate;
  recurrence?: string[];
  recurringEventId?: string;
  start?: GoogleEventDate;
  status?: string;
  summary?: string;
  updated?: string;
  visibility?: string;
  id: string;
  extendedProperties?: {
    private?: Record<string, string>;
    shared?: Record<string, string>;
  };
};

export type GoogleRemoteEvent = GoogleEventResource;

export type ListRemoteEventsResult = {
  items: GoogleEventResource[];
  nextSyncToken: Nullable<string>;
  syncTokenExpired: boolean;
};

export type PatchRemoteEventResult = {
  event?: GoogleEventResource;
  notFound: boolean;
};

export async function getValidGoogleAccessToken(userId: UserId): Promise<Nullable<string>> {
  const db = getDb();
  const [account] = await db
    .select()
    .from(googleCalendarAccounts)
    .where(eq(googleCalendarAccounts.userId, userId))
    .limit(1);

  if (!account) {
    return null;
  }

  if (account.encryptedAccessToken && account.accessTokenExpiresAt) {
    const expiresMs = account.accessTokenExpiresAt.getTime();
    if (expiresMs > Date.now() + 2 * A_MINUTE) {
      const decrypted = decryptGoogleCalendarToken(account.encryptedAccessToken);
      if (decrypted) {
        return decrypted;
      }
    }
  }

  const refreshToken = decryptGoogleCalendarToken(account.encryptedRefreshToken);
  if (!refreshToken) {
    return null;
  }

  try {
    const tokens = await getGoogleClient().refreshAccessToken(refreshToken);
    const newAccessToken = tokens.accessToken();
    const expiresAt = tokens.accessTokenExpiresAt();

    await db
      .update(googleCalendarAccounts)
      .set({
        accessTokenExpiresAt: expiresAt,
        encryptedAccessToken: encryptGoogleCalendarToken(newAccessToken),
        syncError: null,
        updatedAt: new Date(),
      })
      .where(eq(googleCalendarAccounts.userId, userId));

    return newAccessToken;
  } catch (error) {
    if (error instanceof OAuth2RequestError && error.code === "temporarily_unavailable") {
      throw error;
    }

    if (
      error instanceof OAuth2RequestError ||
      (typeof error === "object" &&
        error !== null &&
        "status" in error &&
        (error.status === 400 || error.status === 401))
    ) {
      await db
        .update(googleCalendarAccounts)
        .set({
          accessTokenExpiresAt: null,
          encryptedAccessToken: null,
          syncError: "reauth_required",
          updatedAt: new Date(),
        })
        .where(eq(googleCalendarAccounts.userId, userId));

      return null;
    }

    throw error;
  }
}

export async function invalidateGoogleAccessToken(userId: UserId): Promise<void> {
  const db = getDb();
  await db
    .update(googleCalendarAccounts)
    .set({
      accessTokenExpiresAt: null,
      encryptedAccessToken: null,
      updatedAt: new Date(),
    })
    .where(eq(googleCalendarAccounts.userId, userId));
}

export async function withGoogleAccessToken<T>(
  userId: UserId,
  operation: (accessToken: string) => Promise<T>,
): Promise<Nullable<T>> {
  const token = await getValidGoogleAccessToken(userId);
  if (!token) {
    return null;
  }

  try {
    return await operation(token);
  } catch (error) {
    if (!(error instanceof GoogleApiAuthError)) {
      throw error;
    }
  }

  await invalidateGoogleAccessToken(userId);
  const refreshed = await getValidGoogleAccessToken(userId);
  if (!refreshed) {
    return null;
  }

  return operation(refreshed);
}

export async function listRemoteCalendars(accessToken: string): Promise<RemoteCalendarEntry[]> {
  const calendars: RemoteCalendarEntry[] = [];
  let pageToken: Optional<string>;

  do {
    const url = new URL("https://www.googleapis.com/calendar/v3/users/me/calendarList");
    url.searchParams.set("minAccessRole", "reader");
    url.searchParams.set("showHidden", "false");
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(15 * A_SECOND),
    });

    if (response.status === 401) {
      throw new GoogleApiAuthError("Google Calendar list unauthorized (401)");
    }

    if (!response.ok) {
      throw await parseGoogleApiError("listRemoteCalendars", response);
    }

    const data = (await response.json()) as {
      nextPageToken?: string;
      items?: Array<{
        accessRole?: string;
        backgroundColor?: string;
        deleted?: boolean;
        primary?: boolean;
        summary?: string;
        summaryOverride?: string;
        id?: string;
      }>;
    };

    if (data.items) {
      for (const item of data.items) {
        if (!item.id || item.deleted === true || isExcludedGoogleCalendarId(item.id)) {
          continue;
        }

        calendars.push({
          accessRole: item.accessRole ?? "reader",
          backgroundColor: item.backgroundColor ?? null,
          calendarId: item.id,
          isPrimary: Boolean(item.primary),
          summary: item.summaryOverride || item.summary || item.id,
        });
      }
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  return calendars;
}

export async function listRemoteEvents(
  accessToken: string,
  calendarId: string,
  syncToken: Nullable<string>,
): Promise<ListRemoteEventsResult> {
  const items: GoogleEventResource[] = [];
  let pageToken: Optional<string>;
  let nextSyncToken: Nullable<string> = null;

  do {
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    );
    url.searchParams.set("singleEvents", "false");
    url.searchParams.set("showDeleted", "true");
    url.searchParams.set("maxResults", "2500");
    if (syncToken) {
      url.searchParams.set("syncToken", syncToken);
    }
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(15 * A_SECOND),
    });

    if (response.status === 401) {
      throw new GoogleApiAuthError("Google Calendar events fetch unauthorized (401)");
    }

    if (response.status === 410 && syncToken) {
      return { items: [], nextSyncToken: null, syncTokenExpired: true };
    }

    if (!response.ok) {
      throw await parseGoogleApiError("listRemoteEvents", response);
    }

    const data = (await response.json()) as {
      items?: GoogleEventResource[];
      nextPageToken?: string;
      nextSyncToken?: string;
    };

    if (data.items) {
      items.push(...data.items);
    }

    pageToken = data.nextPageToken;
    if (data.nextSyncToken) {
      nextSyncToken = data.nextSyncToken;
    }
  } while (pageToken);

  return {
    items,
    nextSyncToken,
    syncTokenExpired: false,
  };
}

export async function insertRemoteEvent(
  accessToken: string,
  calendarId: string,
  body: Record<string, unknown>,
): Promise<GoogleEventResource> {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  const response = await fetch(url, {
    body: JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    method: "POST",
    signal: AbortSignal.timeout(15 * A_SECOND),
  });

  if (response.status === 401) {
    throw new GoogleApiAuthError("Google Calendar insert unauthorized (401)");
  }

  if (!response.ok) {
    throw await parseGoogleApiError("insertRemoteEvent", response);
  }

  return (await response.json()) as GoogleEventResource;
}

export async function patchRemoteEvent(
  accessToken: string,
  calendarId: string,
  googleEventId: string,
  body: Record<string, unknown>,
): Promise<PatchRemoteEventResult> {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}`;
  const response = await fetch(url, {
    body: JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    method: "PATCH",
    signal: AbortSignal.timeout(15 * A_SECOND),
  });

  if (response.status === 401) {
    throw new GoogleApiAuthError("Google Calendar patch unauthorized (401)");
  }

  if (response.status === 404 || response.status === 410) {
    return { notFound: true };
  }

  if (!response.ok) {
    throw await parseGoogleApiError("patchRemoteEvent", response);
  }

  const event = (await response.json()) as GoogleEventResource;

  return { event, notFound: false };
}

export async function deleteRemoteEvent(
  accessToken: string,
  calendarId: string,
  googleEventId: string,
): Promise<void> {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    method: "DELETE",
    signal: AbortSignal.timeout(15 * A_SECOND),
  });

  if (response.status === 401) {
    throw new GoogleApiAuthError("Google Calendar delete unauthorized (401)");
  }

  if (
    response.status === 200 ||
    response.status === 204 ||
    response.status === 404 ||
    response.status === 410
  ) {
    return;
  }

  throw await parseGoogleApiError("deleteRemoteEvent", response);
}
