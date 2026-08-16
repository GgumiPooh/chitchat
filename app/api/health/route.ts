// WARN: REQUIREMENTS.md § 16.2. Never anything else. This route exists so a client can find out whether its requests reach anything at all, and the answer to that is the response arriving — not what it says. A database check added here for a container probe's benefit would wake the compute § 8.4.1. exists to let sleep, on a request that fires whenever a connection wobbles, and would report an outage for a database outage.
export const dynamic = "force-dynamic";

/**
 * REQUIREMENTS.md § 16.2. Answers, and nothing more.
 *
 * INFO: The client that reads this discards the response. `useIsOffline` distrusts `navigator.onLine`'s `false` until this app's own traffic corroborates it, and a settled response of any status is what does — the probe is the one way to get that at the moment the flag flips, where a screen nobody is touching has no other request to make.
 *
 * WARN: It authenticates nothing on purpose. Behind the session check it would answer a signed-out client with a redirect, and although that is still evidence the network works, it is evidence by accident — the day the redirect changes, connection detection changes with it and nothing says so.
 */
export function GET(): Response {
  // WARN: `no-store` is the whole contract. A cached 204 answers over a dead network and reports it as live, which is the one way this route can lie.
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
