import type { Nullable, Optional } from "../nullish";
import {
  decryptWithCryptoKey,
  encryptWithCryptoKey,
  fromBase64Url,
  importAesGcmKey,
  toBase64Url,
} from "./aes-gcm";

const SESSION_KEY_STORAGE_KEY = "jandh:session-key";
const PINNED_PUBKEY_HASH_STORAGE_KEY = "jandh:server-pubkey-hash";
export const ENCRYPTED_HEADER = "x-jandh-enc";

async function computePublicKeySha256(publicKeyB64: string): Promise<string> {
  const encoded = new TextEncoder().encode(publicKeyB64);
  const digest = await crypto.subtle.digest("SHA-256", encoded);

  return toBase64Url(new Uint8Array(digest));
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
    return Boolean(window.sessionStorage.getItem(SESSION_KEY_STORAGE_KEY));
  } catch {
    return false;
  }
}

export function getStoredSessionKeyString(): Nullable<string> {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.sessionStorage.getItem(SESSION_KEY_STORAGE_KEY);
  } catch {
    return null;
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
    } catch {
      // INFO: Guard against sessionStorage quota or security exceptions.
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
