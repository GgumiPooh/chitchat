/**
 * A random UUID v4, for browser code.
 *
 * WARN: Not `crypto.randomUUID()` directly — that one is secure-context only, and
 * a phone reaching a dev server at `http://<lan-ip>:3000` has `crypto` without it.
 * `crypto.getRandomValues` carries no such restriction.
 *
 * WARN: Server modules call `crypto.randomUUID()` instead. Node always has it, and
 * importing this from a `server-only` module would pull the whole `@/shared/lib`
 * barrel — `"use client"` hooks included — into the server graph.
 */
export function randomId(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const bytes = crypto.getRandomValues(new Uint8Array(16));

  // INFO: RFC 4122 § 4.4. Version 4 in the high nibble of byte 6, variant `10xx` in the top bits of byte 8.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}
