import type { Nullable, SessionId } from "@/shared/lib";

/**
 * REQUIREMENTS.md § 12. One logged-in device as the settings list shows it. The
 * timestamps are ISO strings because the wire format is JSON.
 *
 * WARN: No `token_hash`. It is the credential itself (§ 5.2.), and this row is
 * rendered by a Client Component — a projection that carried it would put every live
 * session's key into the page.
 */
export type DeviceSession = {
  /** `iPhone · Safari`, or `null` for a sign-in whose request sent no user agent. */
  label: Nullable<string>;
  createdAt: string;
  lastSeenAt: string;
  /** REQUIREMENTS.md § 12. The caller's own session, which is marked rather than revocable. */
  isCurrent: boolean;
  id: SessionId;
};
