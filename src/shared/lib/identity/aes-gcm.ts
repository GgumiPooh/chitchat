import type { Nullable } from "../nullish";

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(str: string): Uint8Array {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4 !== 0) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function importAesGcmKey(rawKeyBytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", rawKeyBytes as BufferSource, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptWithCryptoKey(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return toBase64Url(combined);
}

export async function decryptWithCryptoKey(
  key: CryptoKey,
  token: string,
): Promise<Nullable<string>> {
  try {
    const bytes = fromBase64Url(token);
    // INFO: 12-byte IV + 16-byte AES-GCM auth tag = 28 bytes minimum.
    if (bytes.byteLength <= 28) {
      return null;
    }
    const iv = bytes.subarray(0, 12);
    const data = bytes.subarray(12);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      data as BufferSource,
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

export type ClientEcdhHandshake = {
  clientPublicKey: string;
  payload: string;
  decryptResponse: (encryptedToken: string) => Promise<Nullable<string>>;
};

export async function createClientEcdhHandshake(
  serverPublicKeyB64: string,
  payloadObj: unknown,
): Promise<ClientEcdhHandshake> {
  const keyPair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ])) as CryptoKeyPair;

  const serverKeyBytes = fromBase64Url(serverPublicKeyB64);
  const serverPublicKey = await crypto.subtle.importKey(
    "raw",
    serverKeyBytes as BufferSource,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );

  const sharedBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: serverPublicKey },
    keyPair.privateKey,
    256,
  );

  const staticPubKeyB64 = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  let keyMaterial: ArrayBuffer;
  if (staticPubKeyB64) {
    // SEC: Dual-ECDH combining ephemeral session ECDH with build-time pinned static VAPID public key.
    const staticKeyBytes = fromBase64Url(staticPubKeyB64);
    const staticPublicKey = await crypto.subtle.importKey(
      "raw",
      staticKeyBytes as BufferSource,
      { name: "ECDH", namedCurve: "P-256" },
      false,
      [],
    );
    const staticSharedBits = await crypto.subtle.deriveBits(
      { name: "ECDH", public: staticPublicKey },
      keyPair.privateKey,
      256,
    );

    const combinedSecret = new Uint8Array(64);
    combinedSecret.set(new Uint8Array(sharedBits), 0);
    combinedSecret.set(new Uint8Array(staticSharedBits), 32);
    keyMaterial = await crypto.subtle.digest("SHA-256", combinedSecret);
  } else {
    keyMaterial = await crypto.subtle.digest("SHA-256", sharedBits);
  }

  const derivedKey = await importAesGcmKey(new Uint8Array(keyMaterial));

  const clientPubRaw = await crypto.subtle.exportKey("raw", keyPair.publicKey);
  const clientPublicKey = toBase64Url(new Uint8Array(clientPubRaw));

  const payload = await encryptWithCryptoKey(derivedKey, JSON.stringify(payloadObj));

  return {
    clientPublicKey,
    payload,
    decryptResponse: (encryptedToken: string) => decryptWithCryptoKey(derivedKey, encryptedToken),
  };
}
