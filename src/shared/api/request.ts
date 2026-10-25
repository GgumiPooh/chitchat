import {
  clearClientSessionKey,
  decryptClientText,
  encryptClientText,
  isDormant,
  markNetworkReached,
  markNetworkUnreachable,
} from "@/shared/lib";

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

export function shouldEncryptApiPath(path: string): boolean {
  if (!path.startsWith("/api/")) {
    return false;
  }
  if (
    path.startsWith("/api/auth/") ||
    path.startsWith("/api/health") ||
    path.startsWith("/api/emoticons/") ||
    path.startsWith("/api/webhooks/")
  ) {
    return false;
  }
  if (path.startsWith("/api/media/")) {
    return path.startsWith("/api/media/upload-url");
  }

  return true;
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
export async function request(path: string, init?: RequestInit): Promise<Response> {
  if (isDormant()) {
    throw new DormantRequestError(path);
  }

  let finalPath = path;
  let finalInit = init;
  const isEncrypted = shouldEncryptApiPath(path);

  if (isEncrypted) {
    const queryIndex = path.indexOf("?");
    if (queryIndex !== -1) {
      const basePath = path.slice(0, queryIndex);
      const queryString = path.slice(queryIndex + 1);
      if (queryString.length > 0) {
        const encryptedQuery = await encryptClientText(queryString);
        if (encryptedQuery) {
          finalPath = `${basePath}?e=${encodeURIComponent(encryptedQuery)}`;
        }
      }
    }

    const headers = new Headers(init?.headers);
    headers.set("x-jandh-enc", "1");

    let body = init?.body;
    if (typeof body === "string" && body.length > 0) {
      const encryptedBody = await encryptClientText(body);
      if (encryptedBody) {
        body = JSON.stringify({ e: encryptedBody });
        headers.set("content-type", "application/json; charset=utf-8");
      }
    }

    finalInit = {
      ...init,
      headers,
      body,
    };
  }

  let response: Response;
  try {
    response = await fetch(
      finalPath,
      isCrossOrigin(finalPath) ? { credentials: "include", ...finalInit } : finalInit,
    );
    markNetworkReached();
  } catch (error: unknown) {
    if (!isAborted(error)) {
      markNetworkUnreachable();
    }

    throw error;
  }

  if (isEncrypted) {
    if (response.status === 428) {
      clearClientSessionKey();
      return response;
    }

    if (response.headers.get("x-jandh-enc") === "1") {
      const rawJson = await response.text();
      let envelope: { e?: unknown } | null = null;
      try {
        envelope = JSON.parse(rawJson);
      } catch {
        clearClientSessionKey();
        throw new Error("Invalid encrypted response envelope");
      }

      if (!envelope || typeof envelope.e !== "string") {
        clearClientSessionKey();
        throw new Error("Invalid encrypted payload");
      }

      const decryptedText = await decryptClientText(envelope.e);
      if (decryptedText === null) {
        clearClientSessionKey();
        throw new Error("Failed to decrypt server response");
      }

      return new Response(decryptedText, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }
  }

  return response;
}

function isAborted(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

// WARN: § 13.7.1. An absolute URL is the signal, because every path this app writes is relative — so only a constant deliberately pointed at another origin reaches the credentialed branch, and it cannot be reached by a route of ours that merely redirects.
function isCrossOrigin(path: string): boolean {
  return /^https?:\/\//i.test(path);
}
