import type { Nullable, Optional } from "../nullish";
import {
  decryptWithCryptoKey,
  encryptWithCryptoKey,
  fromBase64Url,
  importAesGcmKey,
  toBase64Url,
} from "./aes-gcm";

const SESSION_KEY_STORAGE_KEY = "jandh:session-key";
const PERSISTENT_SESSION_KEY_STORAGE_KEY = "jandh:persistent-session-key";
const CLOCK_OFFSET_STORAGE_KEY = "jandh:clock-offset";
const PINNED_PUBKEY_HASH_STORAGE_KEY = "jandh:server-pubkey-hash";
export const ENCRYPTED_HEADER = "x-jandh-enc";
export const ENCRYPTED_META_HEADER = "x-jandh-meta";

let cachedClockOffsetMs: Nullable<number> = null;

export function setServerTimeOffset(serverTimeMs: number): void {
  if (!Number.isFinite(serverTimeMs) || serverTimeMs <= 0) {
    return;
  }

  const offset = Math.round(serverTimeMs - Date.now());
  cachedClockOffsetMs = offset;

  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(CLOCK_OFFSET_STORAGE_KEY, String(offset));
    } catch {
      // INFO: Guard against sessionStorage quota or security exceptions.
    }
  }
}

export function getCalibratedNow(): number {
  if (cachedClockOffsetMs === null && typeof window !== "undefined") {
    try {
      const stored = window.sessionStorage.getItem(CLOCK_OFFSET_STORAGE_KEY);
      if (stored !== null) {
        const parsed = Number(stored);
        cachedClockOffsetMs = Number.isFinite(parsed) ? parsed : 0;
      } else {
        cachedClockOffsetMs = 0;
      }
    } catch {
      cachedClockOffsetMs = 0;
    }
  }

  return Date.now() + (cachedClockOffsetMs ?? 0);
}

export async function computeTextSha256(text: string): Promise<string> {
  const encoded = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", encoded);

  return toBase64Url(new Uint8Array(digest));
}

async function computePublicKeySha256(publicKeyB64: string): Promise<string> {
  return computeTextSha256(publicKeyB64);
}

// SEC: TOFU pinning of build-time static P-256 public key (or session fallback) to detect active bundle/key tampering without breaking across session rotation.
function resolvePinningTargetKey(serverPublicKeyB64: string): string {
  const staticPubKeyB64 = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

  return staticPubKeyB64.length > 0 ? staticPubKeyB64 : serverPublicKeyB64;
}

export async function verifyPinnedServerPublicKey(serverPublicKeyB64: string): Promise<boolean> {
  if (typeof window === "undefined") {
    return true;
  }

  try {
    const pinned = window.localStorage.getItem(PINNED_PUBKEY_HASH_STORAGE_KEY);
    if (!pinned) {
      return true;
    }

    const currentHash = await computePublicKeySha256(resolvePinningTargetKey(serverPublicKeyB64));

    return pinned === currentHash;
  } catch {
    // INFO: Guard against localStorage access restrictions in private browsing.
    return true;
  }
}

export async function pinServerPublicKey(serverPublicKeyB64: string): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const hash = await computePublicKeySha256(resolvePinningTargetKey(serverPublicKeyB64));
    window.localStorage.setItem(PINNED_PUBKEY_HASH_STORAGE_KEY, hash);
  } catch {
    // INFO: Guard against localStorage quota or security exceptions.
  }
}

export function clearPinnedServerPublicKey(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(PINNED_PUBKEY_HASH_STORAGE_KEY);
  } catch {
    // INFO: Guard against localStorage quota or security exceptions.
  }
}

const MAX_CACHE_ENTRIES = 100;
let cachedCryptoKey: Nullable<CryptoKey> = null;
let cachedRawKeyString: Nullable<string> = null;
const decryptedPayloadCache = new Map<string, unknown>();

const listeners = new Set<() => void>();
const cacheListeners = new Set<() => void>();

function notifyListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

function notifyCacheListeners(): void {
  for (const listener of cacheListeners) {
    listener();
  }
}

export function subscribeDecryptedCache(listener: () => void): () => void {
  cacheListeners.add(listener);

  return () => {
    cacheListeners.delete(listener);
  };
}

export function getDecryptedPayloadFromCache<T>(encryptedPayload: string): Nullable<T> {
  if (!encryptedPayload) {
    return null;
  }

  return (decryptedPayloadCache.get(encryptedPayload) as Optional<T>) ?? null;
}

export function hasDecryptedPayloadInCache(encryptedPayload: string): boolean {
  return decryptedPayloadCache.has(encryptedPayload);
}

export function setDecryptedPayloadInCache<T>(encryptedPayload: string, value: T): void {
  if (decryptedPayloadCache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = decryptedPayloadCache.keys().next().value;
    if (firstKey !== undefined) {
      decryptedPayloadCache.delete(firstKey);
    }
  }

  decryptedPayloadCache.set(encryptedPayload, value);
  notifyCacheListeners();
}

export function subscribeSessionKey(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function hasStoredSessionKey(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return Boolean(
      window.sessionStorage.getItem(SESSION_KEY_STORAGE_KEY) ||
      window.localStorage.getItem(PERSISTENT_SESSION_KEY_STORAGE_KEY),
    );
  } catch {
    return false;
  }
}

export function getStoredSessionKeyString(): Nullable<string> {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const sessionKey = window.sessionStorage.getItem(SESSION_KEY_STORAGE_KEY);
    if (sessionKey) {
      return sessionKey;
    }

    const persistentKey = window.localStorage.getItem(PERSISTENT_SESSION_KEY_STORAGE_KEY);
    if (persistentKey) {
      // INFO: Mirror to sessionStorage so current session maintains key in memory.
      window.sessionStorage.setItem(SESSION_KEY_STORAGE_KEY, persistentKey);
      return persistentKey;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Whether PIN lock is active on this device. Defaults to `true` (locks on browser/tab close).
 * When toggled to `false`, the session encryption key is saved in localStorage so the app auto-unlocks.
 */
export function isDevicePinLockEnabled(): boolean {
  if (typeof window === "undefined") {
    return true;
  }

  try {
    return window.localStorage.getItem(PERSISTENT_SESSION_KEY_STORAGE_KEY) === null;
  } catch {
    return true;
  }
}

export function setDevicePinLockEnabled(enabled: boolean): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    if (enabled) {
      window.localStorage.removeItem(PERSISTENT_SESSION_KEY_STORAGE_KEY);
    } else {
      const key = getStoredSessionKeyString();
      if (!key) {
        return false;
      }
      window.localStorage.setItem(PERSISTENT_SESSION_KEY_STORAGE_KEY, key);
    }

    notifyListeners();
    return true;
  } catch {
    return false;
  }
}

export async function getClientSessionCryptoKey(): Promise<Nullable<CryptoKey>> {
  const rawKey = getStoredSessionKeyString();

  if (!rawKey) {
    cachedCryptoKey = null;
    cachedRawKeyString = null;
    return null;
  }

  if (cachedCryptoKey && cachedRawKeyString === rawKey) {
    return cachedCryptoKey;
  }

  try {
    const bytes = fromBase64Url(rawKey);
    if (bytes.byteLength !== 32) {
      return null;
    }

    const key = await importAesGcmKey(bytes);
    cachedCryptoKey = key;
    cachedRawKeyString = rawKey;

    return key;
  } catch {
    return null;
  }
}

export async function setClientSessionKey(keyB64: string): Promise<boolean> {
  try {
    const bytes = fromBase64Url(keyB64);
    if (bytes.byteLength !== 32) {
      return false;
    }

    const key = await importAesGcmKey(bytes);

    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(SESSION_KEY_STORAGE_KEY, keyB64);
      // INFO: If persistent storage was enabled on this device, keep it in sync with the new key.
      if (window.localStorage.getItem(PERSISTENT_SESSION_KEY_STORAGE_KEY) !== null) {
        window.localStorage.setItem(PERSISTENT_SESSION_KEY_STORAGE_KEY, keyB64);
      }
    }

    cachedCryptoKey = key;
    cachedRawKeyString = keyB64;
    notifyListeners();

    return true;
  } catch {
    return false;
  }
}

export function clearClientSessionKey(): void {
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(SESSION_KEY_STORAGE_KEY);
      window.localStorage.removeItem(PERSISTENT_SESSION_KEY_STORAGE_KEY);
    } catch {
      // INFO: Guard against sessionStorage/localStorage quota or security exceptions.
    }
  }

  cachedCryptoKey = null;
  cachedRawKeyString = null;
  decryptedPayloadCache.clear();
  notifyListeners();
  notifyCacheListeners();
}

export async function encryptClientText(plaintext: string): Promise<Nullable<string>> {
  const key = await getClientSessionCryptoKey();
  if (!key) {
    return null;
  }

  return encryptWithCryptoKey(key, plaintext);
}

export async function decryptClientText(token: string): Promise<Nullable<string>> {
  const key = await getClientSessionCryptoKey();
  if (!key) {
    return null;
  }

  return decryptWithCryptoKey(key, token);
}
