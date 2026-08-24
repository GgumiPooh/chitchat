/**
 * REQUIREMENTS.md § 12.4. Overwrites `.github/keepalive` on a schedule so GitHub does not
 * disable this repository's scheduled workflows.
 *
 * INFO: A public repository's schedules stop after 60 days with no activity, and § 16.3.'s
 * reminders stop silently with them. The content written here carries nothing — only the
 * commit does.
 *
 * WARN: This cannot live in the repository it keeps alive. A workflow on a `schedule`
 * trigger is disabled by the very rule it would be written to escape.
 *
 * WARN: `build-deploy.yml` ignores this one path. Without that filter every commit from
 * here rebuilds the image and redeploys production.
 */

const KEEPALIVE_PATH = ".github/keepalive";

const COMMIT_MESSAGE = "chore(ci): keep the scheduled workflows alive";

const DEFAULT_REPO = "GgumiPooh/chitchat";

const DEFAULT_BRANCH = "main";

const handler = {
  async scheduled(event, env, context) {
    context.waitUntil(touch(env));
  },

  // INFO: There is no HTTP surface on purpose — a public URL that commits on request is one anybody can spend. Use `wrangler dev` and `/__scheduled` to try it by hand.
  fetch() {
    return new Response("scheduled only", { status: 405 });
  },
};

export default handler;

async function touch(env) {
  // INFO: Reported here rather than left to GitHub, which answers a `Bearer undefined` with a bare 401 — the same status a revoked token gets, and the likeliest cause is `wrangler dev` reading no `.dev.vars` rather than anything being wrong with the token.
  if (!env.GITHUB_TOKEN) {
    console.error(
      "[keepalive] no GITHUB_TOKEN — set a secret to deploy, or .dev.vars to run locally",
    );

    return;
  }

  const repo = env.GITHUB_REPO?.trim() || DEFAULT_REPO;
  const branch = env.GITHUB_BRANCH?.trim() || DEFAULT_BRANCH;
  const url = `https://api.github.com/repos/${repo}/contents/${KEEPALIVE_PATH}`;
  const current = await call(env, `${url}?ref=${encodeURIComponent(branch)}`);

  // WARN: 404 is the file having been removed, which is recoverable — the PUT below creates it. Anything else is a repository or a token this run cannot fix by trying harder.
  if (!current.ok && current.status !== 404) {
    console.error(`[keepalive] reading ${KEEPALIVE_PATH} answered ${current.status}`);

    return;
  }

  const sha = current.ok ? (await current.json()).sha : undefined;
  const written = await call(env, url, {
    method: "PUT",
    body: JSON.stringify({
      message: COMMIT_MESSAGE,
      content: toBase64(toContent()),
      branch,
      // INFO: Absent creates the file; present is the optimistic lock that makes a concurrent write fail loudly rather than silently winning.
      ...(sha ? { sha } : {}),
    }),
  });

  if (!written.ok) {
    console.error(
      `[keepalive] writing ${KEEPALIVE_PATH} answered ${written.status}`,
      await written.text().catch(() => ""),
    );

    return;
  }

  console.log(`[keepalive] committed to ${repo}@${branch}`);
}

function call(env, url, init = {}) {
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      // WARN: GitHub rejects an API request with no User-Agent outright, and a Worker sends none of its own.
      "User-Agent": "chitchat-keepalive",
    },
  });
}

function toContent() {
  return `# REQUIREMENTS.md § 12.4. Written by infra/keepalive-worker. Only the commit matters.\n${new Date().toISOString()}\n`;
}

// INFO: `btoa` alone throws above U+00FF, and the line above carries a `§`.
function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}
