import { A_MINUTE, A_SECOND } from "@/shared/lib";

const SECONDS_PER_MINUTE = A_MINUTE / A_SECOND;

/** `0:07`, `1:42`, `12:05` — the running time on a video tile. */
export function formatDuration(durationMs: number): string {
  // WARN: Minutes are derived from the rounded seconds, not from the raw milliseconds — rounding them independently renders a 59.6s clip as `0:00`.
  const totalSeconds = Math.max(Math.round(durationMs / A_SECOND), 0);
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
