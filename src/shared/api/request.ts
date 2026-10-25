import { SESSION_EXPIRE_ROUTE } from "@/shared/config";
import {
  ENCRYPTED_HEADER,
  ENCRYPTED_META_HEADER,
  clearClientSessionKey,
  clearPinnedServerPublicKey,
  computeTextSha256,
  decryptClientText,
  encryptClientText,
  getCalibratedNow,
  isDormant,
  markNetworkReached,
  markNetworkUnreachable,
  randomId,
  setServerTimeOffset,
  type Nullable,
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
    path.startsWith("/api/webhooks/")
  ) {
    return false;
  }
  if (path.startsWith("/api/emoticons/items/") && path.endsWith("/asset")) {
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
  let requestNonce: Nullable<string> = null;

  if (isEncrypted) {
    const queryIndex = path.indexOf("?");
    const basePath = queryIndex !== -1 ? path.slice(0, queryIndex) : path;
    const queryString = queryIndex !== -1 ? path.slice(queryIndex + 1) : "";
    let encryptedQuery: Nullable<string> = null;

    if (queryString.length > 0) {
      encryptedQuery = await encryptClientText(queryString);
      if (encryptedQuery) {
        finalPath = `${basePath}?e=${encodeURIComponent(encryptedQuery)}`;
      }
    }

    const headers = new Headers(init?.headers);
    headers.set(ENCRYPTED_HEADER, "1");

    let body = init?.body;
    let encryptedBody: Nullable<string> = null;
    if (typeof body === "string" && body.length > 0) {
      encryptedBody = await encryptClientText(body);
      if (encryptedBody) {
        body = JSON.stringify({ e: encryptedBody });
        headers.set("content-type", "application/json; charset=utf-8");
      }
    }

    // SEC: Anti-replay envelope binding calibrated timestamp, one-time nonce, HTTP method, pathname, and SHA-256 hashes of encrypted query/body.
    requestNonce = randomId();
    const method = (init?.method ?? "GET").toUpperCase();
    const pathname = resolvePathname(basePath);
    const [qHash, bHash] = await Promise.all([
      encryptedQuery ? computeTextSha256(encryptedQuery) : Promise.resolve(""),
      encryptedBody ? computeTextSha256(encryptedBody) : Promise.resolve(""),
    ]);
    const encryptedMeta = await encryptClientText(
      JSON.stringify({
        ts: getCalibratedNow(),
        nonce: requestNonce,
        method,
        path: pathname,
        q: qHash,
        b: bHash,
      }),
    );
    if (encryptedMeta) {
      headers.set(ENCRYPTED_META_HEADER, encryptedMeta);
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
    if (response.status === 401) {
      clearClientSessionKey();
      clearPinnedServerPublicKey();
      if (typeof window !== "undefined") {
        window.location.href = SESSION_EXPIRE_ROUTE;
      }
      return response;
    }

    if (response.status === 428) {
      clearClientSessionKey();
      return response;
    }

    if (response.headers.get(ENCRYPTED_HEADER) === "1") {
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

      const responseMetaHeader = response.headers.get(ENCRYPTED_META_HEADER);
      if (!responseMetaHeader || !requestNonce) {
        clearClientSessionKey();
        throw new Error("Missing encrypted response metadata");
      }

      const isMetaValid = await verifyResponseMeta(
        responseMetaHeader,
        requestNonce,
        response.status,
        envelope.e,
      );
      if (!isMetaValid) {
        clearClientSessionKey();
        throw new Error("Encrypted response replay or tampering detected");
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

    const responseMetaHeader = response.headers.get(ENCRYPTED_META_HEADER);
    if (responseMetaHeader && requestNonce) {
      const isMetaValid = await verifyResponseMeta(
        responseMetaHeader,
        requestNonce,
        response.status,
        "",
      );
      if (!isMetaValid) {
        clearClientSessionKey();
        throw new Error("Encrypted response replay or tampering detected");
      }
    }
  }

  return response;
}

async function verifyResponseMeta(
  encryptedMetaHeader: string,
  expectedNonce: string,
  expectedStatus: number,
  encryptedBodyToken: string,
): Promise<boolean> {
  const decryptedMeta = await decryptClientText(encryptedMetaHeader);
  if (!decryptedMeta) {
    return false;
  }

  try {
    const parsed = JSON.parse(decryptedMeta) as {
      nonce?: unknown;
      ts?: unknown;
      s?: unknown;
      b?: unknown;
    };
    if (
      parsed.nonce !== expectedNonce ||
      parsed.s !== expectedStatus ||
      typeof parsed.b !== "string"
    ) {
      return false;
    }

    const expectedBodyHash = encryptedBodyToken ? await computeTextSha256(encryptedBodyToken) : "";
    if (parsed.b !== expectedBodyHash) {
      return false;
    }

    if (typeof parsed.ts === "number") {
      setServerTimeOffset(parsed.ts);
    }

    return true;
  } catch {
    return false;
  }
}

function resolvePathname(path: string): string {
  if (path.startsWith("/")) {
    return path;
  }

  try {
    return new URL(path, "http://localhost").pathname;
  } catch {
    return path;
  }
}

function isAborted(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

// WARN: § 13.7.1. An absolute URL is the signal, because every path this app writes is relative — so only a constant deliberately pointed at another origin reaches the credentialed branch, and it cannot be reached by a route of ours that merely redirects.
function isCrossOrigin(path: string): boolean {
  return /^https?:\/\//i.test(path);
}
