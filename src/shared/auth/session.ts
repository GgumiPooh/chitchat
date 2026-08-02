import "server-only";

import { SESSION_COOKIE_NAME, SESSION_EXPIRE_ROUTE } from "@/shared/config";
import { getDb, sessions, users, type Session, type User } from "@/shared/db";
import { A_DAY, A_SECOND, type Nullable } from "@/shared/lib";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

// INFO: REQUIREMENTS.md § 5.2. Long-lived by design — the pair opens this app in bursts, not daily.
export const SESSION_DURATION = 180 * A_DAY;

// INFO: Sliding renewal (REQUIREMENTS.md § 5.2.) — one write per day per device instead of one per request.
const SESSION_RENEWAL_INTERVAL = A_DAY;

const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: SESSION_DURATION / A_SECOND,
} as const;

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
  userId: string,
  deviceLabel: Nullable<string>,
): Promise<string> {
  const token = generateSessionToken();

  await getDb()
    .insert(sessions)
    .values({
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

/** Throws a 401 `Response` when unauthenticated — API routes let it propagate (REQUIREMENTS.md § 14.). */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();

  if (!user) {
    throw new Response(null, { status: 401 });
  }

  return user;
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
  (await cookies()).delete(SESSION_COOKIE_NAME);
}
