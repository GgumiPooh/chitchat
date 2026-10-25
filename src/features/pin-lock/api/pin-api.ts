import { request } from "@/shared/api";
import {
  clearClientSessionKey,
  createClientEcdhHandshake,
  setClientSessionKey,
  type Nullable,
} from "@/shared/lib";

export type PinSessionState = {
  serverPublicKey: string;
  hasPin: boolean;
  isLocked: boolean;
  lockedUntil: Nullable<string>;
  remainingAttempts: number;
};

export type SubmitPinResult =
  | { ok: true }
  | {
      ok: false;
      status: number;
      remainingAttempts: Nullable<number>;
      lockedUntil: Nullable<string>;
    };

export type PinHandshakePayload =
  | { mode: "verify" | "setup"; pin: string }
  | { mode: "change"; currentPin: string; newPin: string };

// INFO: Fetches current PIN configuration and lockout state for the active session.
export async function fetchPinSessionState(): Promise<PinSessionState> {
  const response = await request("/api/auth/session/pin", { method: "GET" });
  if (!response.ok) {
    throw new Error(`GET /api/auth/session/pin responded with status ${response.status}`);
  }
  return (await response.json()) as PinSessionState;
}

// INFO: Derives ephemeral ECDH secret, exchanges encrypted PIN payload, and stores session encryption key.
export async function submitPinHandshake(
  serverPublicKey: string,
  payload: PinHandshakePayload,
): Promise<SubmitPinResult> {
  const handshake = await createClientEcdhHandshake(serverPublicKey, payload);
  const response = await request("/api/auth/session/pin", {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      clientPublicKey: handshake.clientPublicKey,
      payload: handshake.payload,
    }),
  });

  if (response.ok) {
    const data = (await response.json()) as { payload?: string };
    if (!data?.payload) {
      return { ok: false, status: 500, remainingAttempts: null, lockedUntil: null };
    }

    const decrypted = await handshake.decryptResponse(data.payload);
    if (!decrypted) {
      return { ok: false, status: 500, remainingAttempts: null, lockedUntil: null };
    }

    try {
      const parsed = JSON.parse(decrypted) as { sessionKey?: string };
      if (!parsed.sessionKey) {
        return { ok: false, status: 500, remainingAttempts: null, lockedUntil: null };
      }
      await setClientSessionKey(parsed.sessionKey);
      return { ok: true };
    } catch {
      return { ok: false, status: 500, remainingAttempts: null, lockedUntil: null };
    }
  }

  if (response.status === 401 || response.status === 429) {
    const errData = (await response.json().catch(() => ({}))) as {
      error?: string;
      remainingAttempts?: number;
      lockedUntil?: Nullable<string>;
    };
    return {
      ok: false,
      status: response.status,
      remainingAttempts: errData.remainingAttempts ?? 0,
      lockedUntil: errData.lockedUntil ?? null,
    };
  }

  return {
    ok: false,
    status: response.status,
    remainingAttempts: null,
    lockedUntil: null,
  };
}

// INFO: Logs out current session while planting a reset cookie to re-enter PIN setup on next login.
export async function requestPinResetLogout(): Promise<void> {
  try {
    await request("/api/auth/logout?resetPin=1", { method: "POST" });
  } finally {
    clearClientSessionKey();
    if (typeof window !== "undefined") {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/login";
    }
  }
}
