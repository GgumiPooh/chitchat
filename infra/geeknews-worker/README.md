# geeknews-worker

Fetches GeekNews articles every 5 minutes and sends them in a single batch POST request to `POST /api/ops/sync-geeknews`.

## Data Sources

1. **Discord Channel REST API (Recommended)**:
   If `DISCORD_BOT_TOKEN` and `DISCORD_CHANNEL_ID` are configured, reads messages directly from the Discord channel where the official GeekNews bot posts curated news.
2. **GN⁺ Curated Feed (Fallback)**:
   If Discord variables are not set or Discord is unreachable, falls back to parsing `https://news.hada.io/plus`.

## App Side Processing

The pass itself runs inside the app, which is the only thing that can reach the database.
On the app side:

- Duplicates are ignored by `geeknews_id`.
- On the initial run (empty database), all articles are backfilled silently without push notifications.
- On incremental runs, newly inserted articles trigger web push notifications to opted-in users (`geeknews_subscriptions`).
- Automatically resolves full bulleted (`•`) summary and external source URL via topic page self-healing.

Deployed separately from the app, like `remind-worker`: one file, no build, no dependencies.

## Deploy

1. Store the required app cron token:

   ```sh
   npx wrangler secret put OPS_CRON_TOKEN
   ```

2. (Optional but recommended) Set Discord Bot Token and Channel ID:

   ```sh
   npx wrangler secret put DISCORD_BOT_TOKEN
   npx wrangler secret put DISCORD_CHANNEL_ID
   ```

3. Deploy:

   ```sh
   npx wrangler deploy
   ```

`APP_ORIGIN` is an optional var defaulting to `https://jandh.jeheecheon.com`.

## Try it locally

```sh
echo 'OPS_CRON_TOKEN=...' > .dev.vars
echo 'DISCORD_BOT_TOKEN=...' >> .dev.vars
echo 'DISCORD_CHANNEL_ID=1417510710157643776' >> .dev.vars
npx wrangler dev --test-scheduled
curl "http://localhost:8787/__scheduled"
```

## What can go wrong, and how you would know

A `401` is the two tokens disagreeing; a `503` is the app's `OPS_CRON_TOKEN` unset.
Check the Worker's observability logs after deploying.
