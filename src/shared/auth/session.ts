import "server-only";

import {
  SESSION_COOKIE_DOMAIN,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
  SESSION_DURATION,
  SESSION_EXPIRE_ROUTE,
} from "@/shared/config";
import { getDb, nextSnowflake, sessions, users, type Session, type User } from "@/shared/db";
import { A_DAY, type Nullable, type SessionId, type UserId } from "@/shared/lib";
import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

// INFO: Sliding renewal (REQUIREMENTS.md § 5.2.) — one write per day per device instead of one per request.
const SESSION_RENEWAL_INTERVAL = A_DAY;

export type SessionContext = {
  session: Session;
  user: User;
};

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function generateSessionToken(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

// INFO: REQUIREMENTS.md § 5.2. Only the hash is stored, so a database leak cannot be replayed as a login.
async function hashSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));

  return toHex(new Uint8Array(digest));
}

export async function createSession(
  userId: UserId,
  deviceLabel: Nullable<string>,
): Promise<string> {
  const token = generateSessionToken();

  await getDb()
    .insert(sessions)
    .values({
      id: nextSnowflake<SessionId>(),
      userId,
      tokenHash: await hashSessionToken(token),
      deviceLabel,
      expiresAt: new Date(Date.now() + SESSION_DURATION),
    });

  return token;
}

/**
 * Resolves the session behind the request cookie, or `null`. Cached per request
 * (REQUIREMENTS.md § 5.2.) so a layout and its page share a single query.
 */
export const getSessionContext = cache(async (): Promise<Nullable<SessionContext>> => {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const db = getDb();
  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.tokenHash, await hashSessionToken(token)))
    .limit(1);

  if (!row) {
    return null;
  }

  const now = Date.now();

  if (row.session.expiresAt.getTime() <= now) {
    await db.delete(sessions).where(eq(sessions.id, row.session.id));

    return null;
  }

  if (now - row.session.lastSeenAt.getTime() > SESSION_RENEWAL_INTERVAL) {
    const renewed = {
      lastSeenAt: new Date(now),
      expiresAt: new Date(now + SESSION_DURATION),
    };

    await db.update(sessions).set(renewed).where(eq(sessions.id, row.session.id));

    return { session: { ...row.session, ...renewed }, user: row.user };
  }

  return row;
});

export async function getCurrentUser(): Promise<Nullable<User>> {
  return (await getSessionContext())?.user ?? null;
}

/**
 * Whether a session row is still present and unexpired.
 *
 * WARN: Deliberately **not** `cache()`d, unlike `getSessionContext`. This exists for
 * the one caller that outlives its own authentication — § 8.4.'s SSE stream is a
 * single request held open for as long as the tab is, and a memoized answer would
 * report the session it opened with until the socket dropped, which is exactly the
 * window § 12. revocation has to close. It renews nothing, so re-asking cannot keep
 * a session alive.
 */
export async function isSessionLive(sessionId: SessionId): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date())))
    .limit(1);

  return row !== undefined;
}

/**
 * For Server Components. A cookie the proxy accepted but the database rejects
 * must be cleared, and a Server Component cannot write cookies — so the redirect
 * goes through the Route Handler that can, which also breaks the
 * `/login` ⇄ `/chat` bounce the proxy would otherwise produce.
 */
export async function requireUserOrRedirect(): Promise<User> {
  const user = await getCurrentUser();

  if (!user) {
    redirect(SESSION_EXPIRE_ROUTE);
  }

  return user;
}

/**
 * `requireUserOrRedirect` for a Server Component that needs the session row too —
 * REQUIREMENTS.md § 12.'s device list, which marks the caller's own session rather
 * than offering to revoke it. Shares the request cache, so it costs no second query.
 */
export async function requireSessionOrRedirect(): Promise<SessionContext> {
  const context = await getSessionContext();

  if (!context) {
    redirect(SESSION_EXPIRE_ROUTE);
  }

  return context;
}

export async function invalidateCurrentSession(): Promise<void> {
  const context = await getSessionContext();

  if (context) {
    await getDb().delete(sessions).where(eq(sessions.id, context.session.id));
  }
}

export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE_NAME, token, SESSION_COOKIE_OPTIONS);
}

export async function clearSessionCookie(): Promise<void> {
  // WARN: The name alone clears a host-only cookie, and the session cookie is issued over a parent domain (REQUIREMENTS.md § 5.2.) — a delete that omits `Domain` leaves it in place, and the proxy then bounces off `SESSION_EXPIRE_ROUTE` forever.
  (await cookies()).delete({
    name: SESSION_COOKIE_NAME,
    domain: SESSION_COOKIE_DOMAIN,
    path: SESSION_COOKIE_OPTIONS.path,
  });
}
