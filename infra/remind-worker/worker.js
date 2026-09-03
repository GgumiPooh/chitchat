/**
 * REQUIREMENTS.md § 16.3. Asks the app to run one reminder pass every ten minutes.
 *
 * INFO: GitHub drops most of a public repository's ten-minute schedules — the Actions run
 * lands a handful of times a day — so the 3시간 banner arrived hours late or not at all.
 * This is the clock that keeps time; the pass itself stays in the app, which is the only
 * thing that can reach the database.
 *
 * WARN: The Actions workflow stays deployed beside this. The claim on `events.notified_at`
 * is an UPDATE predicate, so two clocks cannot send one banner twice.
 */

const DEFAULT_ORIGIN = "https://jandh.jeheecheon.com";

const REMIND_PATH = "/api/ops/remind";

const handler = {
  async scheduled(event, env, context) {
    context.waitUntil(remind(env));
  },

  // INFO: No HTTP surface on purpose — the route it calls is already the one to call by hand. Use `wrangler dev --test-scheduled` and `/__scheduled` locally.
  fetch() {
    return new Response("scheduled only", { status: 405 });
  },
};

export default handler;

async function remind(env) {
  if (!env.OPS_CRON_TOKEN) {
    console.error(
      "[remind] no OPS_CRON_TOKEN — set a secret to deploy, or .dev.vars to run locally",
    );

    return;
  }

  const origin = env.APP_ORIGIN?.trim().replace(/\/$/, "") || DEFAULT_ORIGIN;
  const response = await fetch(`${origin}${REMIND_PATH}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPS_CRON_TOKEN}`, "User-Agent": "chitchat-remind" },
  });

  if (!response.ok) {
    console.error(
      `[remind] ${REMIND_PATH} answered ${response.status}`,
      await response.text().catch(() => ""),
    );

    return;
  }

  const { sent, occurrences } = await response.json();

  console.log(`[remind] ${sent} reminder(s) sent over ${occurrences} occurrence(s)`);
}
