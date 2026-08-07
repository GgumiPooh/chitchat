import "server-only";

import { getDb, sessions } from "@/shared/db";
import { and, desc, eq, gt } from "drizzle-orm";
import type { DeviceSession } from "../model/types";

/**
 * REQUIREMENTS.md § 12. One user's live sessions, most recently active first.
 *
 * INFO: Expired rows are filtered, not deleted. § 5.2. clears a session only when its
 * own cookie is presented, so a device that simply stopped being opened leaves a row
 * nothing will ever visit again — listing it offers a 로그아웃 for a session that is
 * already dead, and deleting it here would make a read route write.
 */
export async function listUserSessions(
  userId: string,
  currentSessionId: string,
): Promise<DeviceSession[]> {
  // WARN: An explicit projection, never `select()` — `token_hash` is the credential (§ 5.2.) and everything selected here reaches the browser.
  const rows = await getDb()
    .select({
      id: sessions.id,
      label: sessions.deviceLabel,
      createdAt: sessions.createdAt,
      lastSeenAt: sessions.lastSeenAt,
    })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, new Date())))
    .orderBy(desc(sessions.lastSeenAt));

  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    createdAt: row.createdAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    isCurrent: row.id === currentSessionId,
  }));
}
