import "server-only";

import { apiError } from "@/shared/api";
import { getDb, requestNonces } from "@/shared/db";
import { ENCRYPTED_HEADER, ENCRYPTED_META_HEADER } from "@/shared/lib";
import { lte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { decryptServerString, encryptServerString } from "./pin-crypto";
import { getSessionContext } from "./session";

// SEC: ±30s replay acceptance window; clock skew is calibrated during the PIN handshake and refreshed on every encrypted response.
const REPLAY_WINDOW_MS = 30_000;
const NONCE_CLEANUP_INTERVAL_MS = 30_000;

// SEC: L1 in-memory anti-replay map (`${sessionId}:${nonce}` -> expiresAtMs) for zero-IO rejection of same-instance replays on all HTTP methods.
const seenMemoryNonces = new Map<string, number>();
let lastMemoryPruneAt = 0;
let lastDbPruneAt = 0;

const requestMetaSchema = z.object({
  ts: z.number().finite(),
  nonce: z.string().min(8).max(128),
  method: z.string().min(1).max(16),
  path: z.string().min(1).max(512),
  q: z.string().max(128),
  b: z.string().max(128),
});

function isEphemeralSignalPath(pathname: string): boolean {
  return pathname === "/api/chat/typing" || pathname === "/api/chat/read";
}

function sha256Base64UrlServer(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("base64url");
}

function pruneMemoryNonces(now: number): void {
  if (now - lastMemoryPruneAt < NONCE_CLEANUP_INTERVAL_MS && seenMemoryNonces.size < 2000) {
    return;
  }

  lastMemoryPruneAt = now;
  for (const [key, expiresAt] of seenMemoryNonces) {
    if (expiresAt <= now) {
      seenMemoryNonces.delete(key);
    }
  }
}

export type EncryptedRouteOptions = {
  allowPlaintextFallback?: boolean;
  allowShareKey?: boolean;
};

export function withEncryptedRoute<
  Req extends Request = Request,
  Args extends unknown[] = unknown[],
>(
  handler: (request: Req, ...args: Args) => Response | Promise<Response>,
  options?: EncryptedRouteOptions,
) {
  return async (request: Req, ...args: Args): Promise<Response> => {
    if (options?.allowShareKey && request.headers.get("x-share-key")) {
      return handler(request, ...args);
    }

    const context = await getSessionContext();
    if (!context) {
      return apiError("unauthorized");
    }

    const sessionKey = context.session.encryptionKey;
    if (!sessionKey) {
      return apiError("key_required");
    }

    if (request.headers.get(ENCRYPTED_HEADER) !== "1") {
      if (options?.allowPlaintextFallback) {
        return handler(request, ...args);
      }
      return apiError("key_required");
    }

    const encryptedMetaHeader = request.headers.get(ENCRYPTED_META_HEADER);
    if (!encryptedMetaHeader) {
      return apiError("key_mismatch");
    }

    const decryptedMetaText = decryptServerString(sessionKey, encryptedMetaHeader);
    if (decryptedMetaText === null) {
      return apiError("key_mismatch");
    }

    let rawMeta: unknown;
    try {
      rawMeta = JSON.parse(decryptedMetaText);
    } catch {
      return apiError("invalid_request");
    }

    const parsedMeta = requestMetaSchema.safeParse(rawMeta);
    if (!parsedMeta.success) {
      return apiError("invalid_request");
    }

    const meta = parsedMeta.data;
    const now = Date.now();

    if (Math.abs(now - meta.ts) > REPLAY_WINDOW_MS) {
      return apiError("invalid_request");
    }

    const url = new URL(request.url);
    const upperMethod = request.method.toUpperCase();

    if (meta.method !== upperMethod || meta.path !== url.pathname) {
      return apiError("invalid_request");
    }

    const encryptedQuery = url.searchParams.get("e");
    const expectedQueryHash = encryptedQuery ? sha256Base64UrlServer(encryptedQuery) : "";
    if (meta.q !== expectedQueryHash) {
      return apiError("invalid_request");
    }

    if (encryptedQuery !== null) {
      const decryptedQuery = decryptServerString(sessionKey, encryptedQuery);
      if (decryptedQuery === null) {
        return apiError("key_mismatch");
      }
      url.search = decryptedQuery.startsWith("?") ? decryptedQuery : `?${decryptedQuery}`;
    }

    let unwrappedRequest: Req = request;
    let encryptedBodyToken: string | null = null;

    if (upperMethod !== "GET" && upperMethod !== "HEAD") {
      const rawText = await request.text();
      if (rawText.length > 0) {
        try {
          const parsed = JSON.parse(rawText) as { e?: unknown };
          if (typeof parsed?.e === "string") {
            encryptedBodyToken = parsed.e;
          }
        } catch {
          return apiError("invalid_request");
        }

        if (!encryptedBodyToken) {
          return apiError("invalid_request");
        }
      }
    }

    const expectedBodyHash = encryptedBodyToken ? sha256Base64UrlServer(encryptedBodyToken) : "";
    if (meta.b !== expectedBodyHash) {
      return apiError("invalid_request");
    }

    // SEC: L1 in-memory replay check across all requests (`GET` included).
    pruneMemoryNonces(now);
    const memoryNonceKey = `${context.session.id}:${meta.nonce}`;
    const existingExpiry = seenMemoryNonces.get(memoryNonceKey);
    if (existingExpiry !== undefined && existingExpiry > now) {
      return apiError("invalid_request");
    }
    seenMemoryNonces.set(memoryNonceKey, now + REPLAY_WINDOW_MS);

    // SEC: L2 multi-instance atomic DB nonce check on UNLOGGED `request_nonces` for state-changing requests (`POST`, `PUT`, `PATCH`, `DELETE`), excluding high-frequency ephemeral signals (`typing`, `read`) that are already idempotent/monotonic.
    if (upperMethod !== "GET" && upperMethod !== "HEAD" && !isEphemeralSignalPath(url.pathname)) {
      const db = getDb();
      const inserted = await db
        .insert(requestNonces)
        .values({
          sessionId: context.session.id,
          nonce: meta.nonce,
          expiresAt: new Date(now + REPLAY_WINDOW_MS),
        })
        .onConflictDoNothing()
        .returning({ nonce: requestNonces.nonce });

      if (inserted.length === 0) {
        return apiError("invalid_request");
      }

      if (now - lastDbPruneAt >= NONCE_CLEANUP_INTERVAL_MS) {
        lastDbPruneAt = now;
        void db
          .delete(requestNonces)
          .where(lte(requestNonces.expiresAt, new Date(now)))
          .catch(() => undefined);
      }
    }

    if (encryptedBodyToken !== null) {
      const decryptedBody = decryptServerString(sessionKey, encryptedBodyToken);
      if (decryptedBody === null) {
        return apiError("key_mismatch");
      }

      const headers = new Headers(request.headers);
      headers.delete("content-length");

      unwrappedRequest = new Request(url.toString(), {
        method: request.method,
        headers,
        body: decryptedBody,
        signal: request.signal,
      }) as unknown as Req;
    } else if (url.toString() !== request.url) {
      unwrappedRequest = new Request(url.toString(), {
        method: request.method,
        headers: request.headers,
        signal: request.signal,
      }) as unknown as Req;
    }

    const response = await handler(unwrappedRequest, ...args);

    if (
      response.status === 204 ||
      !response.headers.get("content-type")?.includes("application/json")
    ) {
      const headers = new Headers(response.headers);
      headers.set(
        ENCRYPTED_META_HEADER,
        encryptServerString(
          sessionKey,
          JSON.stringify({
            nonce: meta.nonce,
            ts: Date.now(),
            s: response.status,
            b: "",
          }),
        ),
      );

      return new NextResponse(response.status === 204 ? null : response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    const plainResponseText = await response.text();
    const encryptedResponse = encryptServerString(sessionKey, plainResponseText);
    const responseBodyHash = sha256Base64UrlServer(encryptedResponse);
    const headers = new Headers(response.headers);
    headers.set(ENCRYPTED_HEADER, "1");
    headers.set(
      ENCRYPTED_META_HEADER,
      encryptServerString(
        sessionKey,
        JSON.stringify({
          nonce: meta.nonce,
          ts: Date.now(),
          s: response.status,
          b: responseBodyHash,
        }),
      ),
    );
    headers.set("content-type", "application/json; charset=utf-8");

    return new NextResponse(JSON.stringify({ e: encryptedResponse }), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}
