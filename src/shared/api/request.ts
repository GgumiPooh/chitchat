import { isDormant } from "@/shared/lib";

/**
 * REQUIREMENTS.md § 8.4.1. Thrown instead of reaching the network while the app is
 * dormant. A type of its own so a caller that needs to tell "asleep" from "failed"
 * can, and so the reason is legible where the rejection surfaces.
 */
export class DormantRequestError extends Error {
  constructor(path: string) {
    super(`${path} was not sent — the app is dormant (REQUIREMENTS.md § 8.4.1.)`);
    this.name = "DormantRequestError";
  }
}

/**
 * REQUIREMENTS.md § 8.4.1. Every request to our own API goes through here, so
 * 절전 모드 is one gate rather than a check each caller has to remember — and a
 * fetcher added later is covered by having been written the ordinary way.
 *
 * INFO: The gate is "does this wake Neon", not "is this same-origin". R2's presigned
 * PUT and § 8.9.'s oEmbed lookup reach no server of ours and stay on plain `fetch`;
 * § 13.8.1.'s suggester is cross-origin and belongs here anyway, since it reads the
 * items out of the same database.
 */
export function request(path: string, init?: RequestInit): Promise<Response> {
  if (isDormant()) {
    return Promise.reject(new DormantRequestError(path));
  }

  return fetch(path, init);
}
