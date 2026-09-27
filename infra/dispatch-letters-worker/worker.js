/**
 * REQUIREMENTS.md § 18. Calls POST /api/ops/dispatch-letters every minute to deliver
 * due time letters into the chat room.
 *
 * INFO: Cloudflare Workers Cron Trigger with `* * * * *` provides reliable 1-minute precision delivery.
 * The delivery pass itself runs inside the app via POST /api/ops/dispatch-letters with FOR UPDATE SKIP LOCKED
 * transaction claims, making concurrent runs or overlapping clocks safe.
 */

const DEFAULT_ORIGIN = "https://jandh.jeheecheon.com";

const DISPATCH_PATH = "/api/ops/dispatch-letters";

const handler = {
  async scheduled(event, env, context) {
    context.waitUntil(dispatch(env));
  },

  // INFO: No HTTP surface on purpose — the route it calls is already the one to call by hand. Use `wrangler dev --test-scheduled` and `/__scheduled` locally.
  fetch() {
    return new Response("scheduled only", { status: 405 });
  },
};

export default handler;

async function dispatch(env) {
  if (!env.OPS_CRON_TOKEN) {
    console.error(
      "[dispatch-letters] no OPS_CRON_TOKEN — set a secret to deploy, or .dev.vars to run locally",
    );

    return;
  }

  const origin = env.APP_ORIGIN?.trim().replace(/\/$/, "") || DEFAULT_ORIGIN;
  const response = await fetch(`${origin}${DISPATCH_PATH}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPS_CRON_TOKEN}`,
      "User-Agent": "chitchat-dispatch-letters",
    },
  });

  if (!response.ok) {
    console.error(
      `[dispatch-letters] ${DISPATCH_PATH} answered ${response.status}`,
      await response.text().catch(() => ""),
    );

    return;
  }

  const { dispatched } = await response.json();

  if (dispatched > 0) {
    console.log(`[dispatch-letters] ${dispatched} letter(s) dispatched`);
  }
}
