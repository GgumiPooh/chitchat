# geeknews-worker

Fetches the GeekNews Atom feed (`https://news.hada.io/rss/news`) every 5 minutes, parses the articles,
and sends them in a single batch POST request to `POST /api/ops/sync-geeknews`.

The pass itself runs inside the app, which is the only thing that can reach the database.
On the app side:
- Duplicates are ignored by `geeknews_id`.
- On the initial run (empty database), all articles are backfilled silently without push notifications.
- On incremental runs, newly inserted articles trigger web push notifications to opted-in users (`geeknews_subscriptions`).

Deployed separately from the app, like `remind-worker`: one file, no build, no dependencies.

## Deploy

1. Use the existing `OPS_CRON_TOKEN` (or generate one and set on the app's server):

   ```sh
   openssl rand -base64 32
   ```

2. Store it here and deploy:

   ```sh
   npx wrangler secret put OPS_CRON_TOKEN
   npx wrangler deploy
   ```

`APP_ORIGIN` is an optional var defaulting to `https://jandh.jeheecheon.com`.

## Try it without waiting five minutes

```sh
echo 'OPS_CRON_TOKEN=...' > .dev.vars
npx wrangler dev --test-scheduled
curl "http://localhost:8787/__scheduled"
```

## What can go wrong, and how you would know

A `401` is the two tokens disagreeing; a `503` is the app's `OPS_CRON_TOKEN` unset.
Check the Worker's observability logs after deploying.
