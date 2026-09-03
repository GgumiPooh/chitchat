# remind-worker

`REQUIREMENTS.md § 16.3.` GitHub drops most of a public repository's ten-minute schedules, so
`ops-remind.yml` ran a handful of times a day and the 2시간 banner landed hours late or not
at all. This Worker calls `POST /api/ops/remind` every ten minutes instead; the pass itself
runs inside the app, which is the only thing that can reach the database. The Actions
workflow stays deployed beside it — the app's claim makes two clocks safe.

Deployed separately from the app, like `keepalive-worker`: one file, no build, no dependencies.

## Deploy

1. Generate a token and set it as `OPS_CRON_TOKEN` on the app's server as well:

   ```sh
   openssl rand -base64 32
   ```

2. Store it here and deploy:

   ```sh
   npx wrangler secret put OPS_CRON_TOKEN
   npx wrangler deploy
   ```

`APP_ORIGIN` is an optional var defaulting to `https://jandh.jeheecheon.com`.

## Try it without waiting ten minutes

```sh
echo 'OPS_CRON_TOKEN=...' > .dev.vars
npx wrangler dev --test-scheduled
curl "http://localhost:8787/__scheduled"
```

This sends real reminders — it is the same code path the cron runs.

## What can go wrong, and how you would know

A `401` is the two tokens disagreeing; a `503` is the app's `OPS_CRON_TOKEN` unset. Either
leaves the Actions schedule as the only clock, which is the state this Worker exists to
improve on, so check the Worker's logs after deploying.
