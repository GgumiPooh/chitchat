import "server-only";

import { apiError } from "@/shared/api";
import { NextResponse } from "next/server";
import { decryptServerString, encryptServerString } from "./pin-crypto";
import { getSessionContext } from "./session";

export type EncryptedRouteOptions = {
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

    if (request.headers.get("x-jandh-enc") !== "1") {
      return apiError("key_required");
    }

    const url = new URL(request.url);

    if (url.searchParams.has("e")) {
      const encryptedQuery = url.searchParams.get("e")!;
      const decryptedQuery = decryptServerString(sessionKey, encryptedQuery);
      if (decryptedQuery === null) {
        return apiError("key_mismatch");
      }
      url.search = decryptedQuery.startsWith("?") ? decryptedQuery : `?${decryptedQuery}`;
    }

    let unwrappedRequest: Req = request;

    if (request.method !== "GET" && request.method !== "HEAD") {
      const rawText = await request.text();
      if (rawText.length > 0) {
        let encryptedToken: string | null = null;
        try {
          const parsed = JSON.parse(rawText) as { e?: unknown };
          if (typeof parsed?.e === "string") {
            encryptedToken = parsed.e;
          }
        } catch {
          return apiError("invalid_request");
        }

        if (!encryptedToken) {
          return apiError("invalid_request");
        }

        const decryptedBody = decryptServerString(sessionKey, encryptedToken);
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
      return response;
    }

    const plainResponseText = await response.text();
    const encryptedResponse = encryptServerString(sessionKey, plainResponseText);
    const headers = new Headers(response.headers);
    headers.set("x-jandh-enc", "1");
    headers.set("content-type", "application/json; charset=utf-8");

    return new NextResponse(JSON.stringify({ e: encryptedResponse }), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}
