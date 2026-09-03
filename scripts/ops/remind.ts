import { notifyOps } from "./notify";
/**
 * WARN: Deep path, not the slice barrel — see `notify.ts` for why a CLI entry is the one
 * place that rule is paid for rather than honoured.
 */
/* eslint-disable no-restricted-imports */
import { remindUpcomingEvents } from "../../src/features/notify-chat/api/remind-upcoming-events";
/* eslint-enable no-restricted-imports */

/**
 * REQUIREMENTS.md § 16.3. The GitHub Actions clock for the reminders. The pass itself is
 * `remindUpcomingEvents`, which `POST /api/ops/remind` runs from the Worker's cron too.
 */
async function main() {
  const { sent, occurrences } = await remindUpcomingEvents();

  console.log(`[remind] ${sent} reminder(s) sent over ${occurrences} occurrence(s)`);
}

main().then(
  () => process.exit(0),
  async (error: unknown) => {
    console.error("[remind] failed", error);

    // INFO: § 16.3. The one ops job serving a product feature, so a run that died is the feature not happening — and nothing else would say so. Per-occurrence failures are contained inside the pass and do not reach here, which is what keeps this from firing every ten minutes.
    await notifyOps("일정 알림 실패", error instanceof Error ? error.message : String(error));

    process.exit(1);
  },
);
