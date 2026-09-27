# dispatch-letters-worker

`REQUIREMENTS.md § 18.` Calls `POST /api/ops/dispatch-letters` every minute to deliver scheduled time letters into the chat timeline and send push notifications.

The delivery pass itself runs inside the app using `FOR UPDATE SKIP LOCKED` claims against the database, so overlapping runs or concurrent triggers cannot double-dispatch letters.

Deployed separately from the app, like `remind-worker`: one file, no build, no dependencies.

## Deploy

1. Use the existing `OPS_CRON_TOKEN` configured on the app server:

2. Store it here and deploy:

   ```sh
   npx wrangler secret put OPS_CRON_TOKEN
   npx wrangler deploy
   ```

`APP_ORIGIN` is an optional var defaulting to `https://jandh.jeheecheon.com`.

## Try it locally

```sh
echo 'OPS_CRON_TOKEN=...' > .dev.vars
npx wrangler dev --test-scheduled
curl "http://localhost:8787/__scheduled"
```

## What can go wrong, and how you would know

A `401` means `OPS_CRON_TOKEN` does not match the app's secret; a `503` means `OPS_CRON_TOKEN` is unset on the server. Check the Worker's logs in the Cloudflare dashboard.
