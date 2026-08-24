# keepalive-worker

`REQUIREMENTS.md § 12.4.` GitHub disables a **public** repository's scheduled workflows after
60 days with no activity. This app's four ops jobs — including `§ 16.3.`'s event reminders —
stop with them, and nothing anywhere says so. This Worker commits to `.github/keepalive`
once a week to keep the counter from ever reaching 60.

It is deployed separately from the app and is **not** part of the pnpm workspace: one file,
no build step, no dependencies.

## Deploy

1. Mint a **classic** PAT with the `public_repo` scope only, and no expiry.

   `repo` also works and is far wider — it opens every repository the account can reach,
   private ones included. Do not use it. A fine-grained token scoped to this repository with
   `Contents: write` is tighter still, but has a maximum lifetime and therefore a renewal
   date to forget; the failure mode of a forgotten renewal is this Worker going quiet.

2. Store it and deploy:

   ```sh
   npx wrangler secret put GITHUB_TOKEN
   npx wrangler deploy
   ```

`GITHUB_REPO` and `GITHUB_BRANCH` are optional vars that default to `GgumiPooh/chitchat` and
`main` — set them only for a fork.

## Try it without waiting a week

`wrangler dev` reads **`.dev.vars`**, never the deployed secret, so put the same token there
first. The file is gitignored.

```sh
echo 'GITHUB_TOKEN=ghp_...' > .dev.vars
npx wrangler dev --test-scheduled
curl "http://localhost:8787/__scheduled"
```

This commits for real — it is the same code path the cron runs.

The Worker has no HTTP surface in production: a public URL that commits on request is one
anybody can spend, so `fetch` answers 405.

## What can go wrong, and how you would know

A failed run logs to the Worker's own observability and to nothing else — this is the one
weakness of keeping the app alive from outside it. It is survivable rather than fixed: one
missed week costs seven days out of a sixty-day budget, so eight consecutive failures pass
before anything actually stops.

The token expiring is the likeliest cause, which is why step 1 says no expiry.
