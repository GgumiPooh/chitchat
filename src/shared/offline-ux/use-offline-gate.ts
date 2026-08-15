"use client";

import { useIsOffline } from "@/shared/lib";
import { useCallback } from "react";
// WARN: The package, not `@/shared/ui`'s re-export — `SettingsRow`, `Switch` and `VoicePlayer` import this segment, so going back through that barrel is a cycle between the two.
import { toast } from "sonner";
import { OFFLINE_NOTICE_ID } from "./offline-notice";

/**
 * WARN: `aria-disabled`, never the `disabled` attribute. A disabled control leaves the tab order, is exempt from the contrast floor, and explains nothing — so the refusal has to be suppressed in the handler instead.
 */
export type OfflineBlockedProps = {
  "aria-disabled"?: true;
  "aria-describedby"?: string;
};

export type OfflineGate = {
  isBlocked: boolean;
  /** Spread onto the control that is refusing. */
  blockedProps: OfflineBlockedProps;
  /** Says why, for a handler whose own arguments stop `guard` from wrapping it. */
  refuse: () => void;
  /** Wraps a handler so a blocked tap says why instead of running. */
  guard: (run: () => void) => () => void;
};

/**
 * Turns a control into one that refuses while the device is offline, and says why
 * when it is tapped.
 *
 * INFO: A hook rather than a wrapper component, because the controls it has to reach are heterogeneous — `Button`, `IconButton`, a bare `<button>` and a settings row all take these fields and nothing else in common.
 *
 * @param isGated Off for a control the network is not actually between — a voice draft plays from a local blob, so the same disc is live offline.
 */
export function useOfflineGate(message: string, isGated = true): OfflineGate {
  const isOffline = useIsOffline();
  const isBlocked = isOffline && isGated;

  const refuse = useCallback(() => toast(message), [message]);

  const guard = useCallback(
    (run: () => void) => () => {
      if (isBlocked) {
        refuse();

        return;
      }

      run();
    },
    [isBlocked, refuse],
  );

  return {
    isBlocked,
    blockedProps: isBlocked ? { "aria-disabled": true, "aria-describedby": OFFLINE_NOTICE_ID } : {},
    refuse,
    guard,
  };
}
