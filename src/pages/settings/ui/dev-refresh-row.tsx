"use client";

import { cn, safelyRunAsync } from "@/shared/lib";
import { SettingsRow } from "@/shared/ui";
import { RotateCw } from "lucide-react";
import { useState } from "react";

export type DevRefreshRowProps = {
  className?: string;
};

/**
 * A development-only escape hatch for the staleness § 15.1. automates away.
 *
 * The automatic refresh needs a deployment id that actually changes, and locally
 * `BUILD_ID` is the constant `development` — so on a dev build there is no signal
 * and this is the only way to force the reload path by hand.
 */
export function DevRefreshRow({ className }: DevRefreshRowProps) {
  const [isBusy, setIsBusy] = useState(false);

  return (
    <SettingsRow
      className={cn(className)}
      description="서비스 워커와 캐시를 비우고 다시 불러와요"
      Icon={RotateCw}
      label="강제 새로고침"
      onClick={() => void refresh()}
    />
  );

  /**
   * WARN: Goes further than `location.reload()` on purpose. `sw.js` caches nothing
   * (§ 16.1.), but a worker left over from an experiment does not announce itself —
   * and this row exists precisely for the times the page is not what the source says.
   */
  async function refresh() {
    if (isBusy) {
      return;
    }

    setIsBusy(true);

    await safelyRunAsync(async () => {
      const registrations = (await navigator.serviceWorker?.getRegistrations()) ?? [];

      await Promise.all(registrations.map((registration) => registration.unregister()));
    });

    await safelyRunAsync(async () => {
      const keys = await caches.keys();

      await Promise.all(keys.map((key) => caches.delete(key)));
    });

    window.location.reload();
  }
}
