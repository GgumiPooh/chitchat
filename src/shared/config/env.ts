/**
 * Reads a required environment variable, treating blank as missing — a half-filled
 * `.env` would otherwise sail through and fail much later as a confusing 4xx from
 * a third party.
 *
 * WARN: Server modules only. A client bundle has no `process.env` beyond `NEXT_PUBLIC_*`.
 */
export function ensureEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is not set`);
  }

  return value;
}
