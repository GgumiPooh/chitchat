import { isDormant, markNetworkReached, markNetworkUnreachable } from "@/shared/lib";

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
 *
 * WARN: `credentials: "include"` is added for a caller whose URL has left this origin
 * on purpose, and for that caller alone (§ 13.7.1.). It removes the one thing that
 * switch could otherwise break quietly — a fetcher reaching the far origin with no
 * session, which is answered `401` rather than by an error naming the omission. An
 * `init` that names its own `credentials` still wins.
 *
 * WARN: Setting it for **every** caller is wrong, and wrong somewhere else entirely.
 * Credentials mode belongs to the whole fetch rather than to its first hop, so a
 * same-origin request that 302s off-origin becomes a *credentialed* CORS request at
 * the destination — and § 9.'s media download redirects into R2, whose S3-compatible
 * CORS cannot answer `Access-Control-Allow-Credentials`. `collectShareFiles` reads
 * exactly that redirect, so 보관함's 공유 would fail as an opaque network error.
 */
export function request(path: string, init?: RequestInit): Promise<Response> {
  if (isDormant()) {
    return Promise.reject(new DormantRequestError(path));
  }

  // INFO: The one place the app learns first-hand whether the network works, which is what `useIsOffline` corroborates `navigator.onLine` against before anything refuses on it.
  return fetch(path, isCrossOrigin(path) ? { credentials: "include", ...init } : init).then(
    (response) => {
      markNetworkReached();

      return response;
    },
    (error: unknown) => {
      // WARN: An abort is the caller changing its mind, not the network — a search keystroke cancels the request before it, and filing those as outages would corroborate a stuck flag on every fast typist.
      if (!isAborted(error)) {
        markNetworkUnreachable();
      }

      throw error;
    },
  );
}

function isAborted(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

// WARN: § 13.7.1. An absolute URL is the signal, because every path this app writes is relative — so only a constant deliberately pointed at another origin reaches the credentialed branch, and it cannot be reached by a route of ours that merely redirects.
function isCrossOrigin(path: string): boolean {
  return /^https?:\/\//i.test(path);
}
