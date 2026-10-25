"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { Nullable } from "../nullish";
import {
  clearClientSessionKey,
  decryptClientText,
  getDecryptedPayloadFromCache,
  hasDecryptedPayloadInCache,
  hasStoredSessionKey,
  setDecryptedPayloadInCache,
  subscribeDecryptedCache,
  subscribeSessionKey,
} from "./session-key-store";

const getSessionKeySnapshot = () => hasStoredSessionKey();
const getServerSessionKeySnapshot = () => false;

export function useHasSessionKey(): boolean {
  return useSyncExternalStore(
    subscribeSessionKey,
    getSessionKeySnapshot,
    getServerSessionKeySnapshot,
  );
}

export function useDecryptedServerPayload<T>(encryptedPayload: string): Nullable<T> {
  const getSnapshot = useCallback(
    () => getDecryptedPayloadFromCache<T>(encryptedPayload),
    [encryptedPayload],
  );

  const getServerSnapshot = useCallback(() => null, []);

  const cached = useSyncExternalStore(subscribeDecryptedCache, getSnapshot, getServerSnapshot);

  useEffect(() => {
    if (!encryptedPayload || hasDecryptedPayloadInCache(encryptedPayload)) {
      return;
    }

    let cancelled = false;

    void decryptClientText(encryptedPayload).then((decryptedText) => {
      if (cancelled) {
        return;
      }
      if (decryptedText === null) {
        clearClientSessionKey();
        return;
      }

      try {
        const parsed = JSON.parse(decryptedText) as T;
        setDecryptedPayloadInCache(encryptedPayload, parsed);
      } catch {
        clearClientSessionKey();
      }
    });

    return () => {
      cancelled = true;
    };
  }, [encryptedPayload]);

  return cached;
}
