"use client";

import { A_DAY, A_MINUTE, A_SECOND, AN_HOUR, LOCALE, useHydrated } from "@/shared/lib";
import { useEffect, useState } from "react";

export type RelativeTimeProps = {
  className?: string;
  date: Date | number | string;
};

const relativeFormatter = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });

const UNITS = [
  { limit: A_MINUTE, ms: A_SECOND, unit: "second" },
  { limit: AN_HOUR, ms: A_MINUTE, unit: "minute" },
  { limit: A_DAY, ms: AN_HOUR, unit: "hour" },
  { limit: 30 * A_DAY, ms: A_DAY, unit: "day" },
  { limit: 365 * A_DAY, ms: 30 * A_DAY, unit: "month" },
  { limit: Infinity, ms: 365 * A_DAY, unit: "year" },
] as const;

export function RelativeTime({ className, date }: RelativeTimeProps) {
  const target = new Date(date);
  const [now, setNow] = useState(() => Date.now());
  const hydrated = useHydrated();

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), A_MINUTE);

    return () => clearInterval(id);
  }, []);

  return (
    // WARN: The server renders a different `now` than the client — the key remount is what keeps hydration quiet.
    <time
      key={String(hydrated)}
      className={className}
      dateTime={target.toISOString()}
      suppressHydrationWarning
    >
      {formatRelative(target.getTime() - now)}
    </time>
  );
}

function formatRelative(deltaMs: number): string {
  const magnitude = Math.abs(deltaMs);
  const { ms, unit } = UNITS.find(({ limit }) => magnitude < limit) ?? UNITS[UNITS.length - 1];

  return relativeFormatter.format(Math.round(deltaMs / ms), unit);
}
