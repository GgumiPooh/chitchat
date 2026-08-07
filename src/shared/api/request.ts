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
 * INFO: Our origin only. R2's presigned PUT and § 8.9.'s oEmbed lookup never reach
 * our server, so they cost Neon nothing and stay on plain `fetch`.
 */
export function request(path: string, init?: RequestInit): Promise<Response> {
  if (isDormant()) {
    return Promise.reject(new DormantRequestError(path));
  }

  return fetch(path, init);
}
