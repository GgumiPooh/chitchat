import { request } from "@/shared/api";
import { setClientSessionKey, type Nullable } from "@/shared/lib";

export type OtpSetupResponse = {
  secret: string;
  uri: string;
  qrSvg: string;
};

export type SubmitOtpLoginResult =
  | { ok: true; redirectUrl?: string }
  | {
      ok: false;
      remainingAttempts?: number;
      remainingSeconds?: number;
      lockedUntil?: Nullable<string>;
      error:
        | "invalid_code"
        | "replayed"
        | "too_many_attempts"
        | "collision"
        | "no_totp_enrolled"
        | "failed";
    };

export async function fetchOtpStatus(): Promise<{ hasOtp: boolean }> {
  const response = await request("/api/auth/otp", { method: "GET" });
  if (!response.ok) {
    throw new Error(`GET /api/auth/otp failed with ${response.status}`);
  }
  return response.json() as Promise<{ hasOtp: boolean }>;
}

export async function requestOtpSetup(): Promise<OtpSetupResponse> {
  const response = await request("/api/auth/otp", { method: "POST" });
  if (!response.ok) {
    throw new Error(`POST /api/auth/otp failed with ${response.status}`);
  }
  return response.json() as Promise<OtpSetupResponse>;
}

export async function verifyOtpSetup(code: string): Promise<{ ok: boolean; error?: string }> {
  const response = await request("/api/auth/otp/verify", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ code }),
  });

  if (response.ok) {
    return { ok: true };
  }

  const data = (await response.json().catch(() => ({}))) as { error?: string };
  return { ok: false, error: data.error ?? "failed" };
}

export async function disableOtp(): Promise<{ ok: boolean }> {
  const response = await request("/api/auth/otp", { method: "DELETE" });
  if (!response.ok) {
    throw new Error(`DELETE /api/auth/otp failed with ${response.status}`);
  }
  return { ok: true };
}

export async function submitOtpLogin(code: string): Promise<SubmitOtpLoginResult> {
  const response = await request("/api/auth/login/otp", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ code }),
  });

  const data = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: SubmitOtpLoginResult extends { ok: false; error: infer E } ? E : never;
    sessionKey?: string;
    redirectUrl?: string;
    remainingAttempts?: number;
    remainingSeconds?: number;
    lockedUntil?: Nullable<string>;
  };

  if (response.ok && data.ok) {
    if (data.sessionKey) {
      await setClientSessionKey(data.sessionKey);
    }
    return { ok: true, redirectUrl: data.redirectUrl };
  }

  return {
    ok: false,
    error: data.error ?? "failed",
    remainingAttempts: data.remainingAttempts,
    remainingSeconds: data.remainingSeconds,
    lockedUntil: data.lockedUntil,
  };
}
