"use client";

import { clearAll } from "@/shared/snapshot";
import { useEffect } from "react";

/**
 * Renders nothing. It drops this browser's offline snapshots on arrival at the login
 * screen (REQUIREMENTS.md § 16.).
 *
 * 로그아웃 is only one of three ways a session ends on a device, and it is the only one
 * that runs code of its own: `SESSION_EXPIRE_ROUTE` clears the cookie alone, and a
 * revoke from another device's 로그인된 기기 clears nothing here at all. Both reach this
 * screen on the next launch, and § 16.'s "cleared on logout" — the argument that admits
 * IndexedDB where Cache Storage is refused — is only true if they do.
 *
 * WARN: This screen is the signal precisely because `proxy.ts` redirects a browser that still holds a session cookie away from it, so nothing reaches here with data it is entitled to keep.
 */
export function SessionEndSync() {
  useEffect(() => {
    void clearAll();
  }, []);

  return null;
}
