import type { NextConfig } from "next";

const SECURITY_HEADERS = [
  // INFO: REQUIREMENTS.md § 14. Index blocking, layer 3 of 3 — robots.ts and layout metadata are the others.
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Frame-Options", value: "DENY" },
];

// INFO: The origin jandh-emoticons is deployed to, proxied in as a multi-zone. Set per environment; the default is that repo's dev server, so a local `pnpm dev` in both needs no configuration.
// WARN: REQUIREMENTS.md § 13.7. The trailing slash is stripped rather than merely forbidden, because a value that carries one rewrites to `//emoticons/:path*` — which the zone answers, so nothing reports it, and the far origin then sees every request at a path that reads as protocol-relative wherever it is resolved against a base rather than matched.
// WARN: `NEXT_PUBLIC_`, and read again in `shared/config/emoticon.ts` — § 13.8.1.'s suggester is called at that origin from the browser, which cannot see a server-only variable. One variable rather than two, since two holding the same origin is a pair that drifts; this file cannot import the other copy, because it is loaded before the path aliases exist.
const EMOTICONS_ORIGIN = (
  process.env.NEXT_PUBLIC_EMOTICONS_ORIGIN ?? "http://localhost:3001"
).replace(/\/+$/, "");

// WARN: REQUIREMENTS.md § 16. What `push-registration.ts` hangs on the worker's script URL, and the only thing that makes a deploy reach an installed client — `sw.js` is a static file whose bytes never move, so the browser's byte-for-byte check finds nothing to install and the precache stays frozen at the build it first installed under.
// WARN: It rides the URL rather than an `importScripts`ed manifest because WebKit alone skips imported scripts in that check, so a changed import updates nothing on the one platform this app is installed on.
// INFO: `Date.now()` is the last resort and costs only a redundant reinstall; every target above it supplies something stable per build, and `Dockerfile` passes `BUILD_SHA` for exactly that.
const SERVICE_WORKER_VERSION =
  [process.env.VERCEL_DEPLOYMENT_ID, process.env.VERCEL_GIT_COMMIT_SHA, process.env.BUILD_SHA]
    .map((value) => value?.trim())
    .find(Boolean) ?? `${Date.now()}`;

const SERVICE_WORKER_HEADERS = [
  { key: "Content-Type", value: "application/javascript; charset=utf-8" },
  { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
  { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
];

export default {
  // INFO: Only the container image wants a self-hosted server; Vercel and Netlify build through their own adapters, which a standalone output would cut out from under them.
  output: process.env.NEXT_OUTPUT_STANDALONE === "true" ? "standalone" : undefined,
  // INFO: `*.ts.net` is the Tailscale funnel `pnpm dev:tunnel` opens — the host is `<machine>.<tailnet>.ts.net`, which is minted per tailnet rather than configured here.
  allowedDevOrigins: ["localhost", "192.168.*.*", "*.ts.net"],
  // INFO: Inlined into the bundle at build time. The `NEXT_PUBLIC_` prefix has no effect here and is deliberately absent — it means something only for values that come from the environment.
  env: { SERVICE_WORKER_VERSION },
  // WARN: No `cacheComponents`. It was on and was reversed — REQUIREMENTS.md § 1.1. has the whole account, and the short version is that it is project-wide, that `fetch`'s own `next.revalidate` never needed it, and that it costs the § 12.2. wallpaper its place in the first paint.
  experimental: {
    // WARN: `es-hangul` declares no `sideEffects: false`, so a bare `import { josa }` pulls its romanisation and standard-pronunciation tables into the bundle with it. Only the modules actually used survive this.
    // INFO: `lucide-react` and `lodash-es` are on Next's own default list and do not need naming here.
    optimizePackageImports: ["es-hangul"],
  },
  turbopack: {
    rules: {
      "*.svg": {
        loaders: [
          {
            loader: "@svgr/webpack",
            options: {
              svgoConfig: {
                plugins: [
                  {
                    name: "preset-default",
                    params: {
                      overrides: {
                        removeViewBox: false,
                        removeUnknownsAndDefaults: { keepRoleAttr: true },
                      },
                    },
                  },
                  "prefixIds",
                ],
              },
            },
          },
        ],
        as: "*.js",
      },
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      // WARN: REQUIREMENTS.md § 16.1. A cached worker is a worker that never updates — the browser keeps serving the old script and the push handler silently stays on the previous build.
      { source: "/sw.js", headers: SERVICE_WORKER_HEADERS },
    ];
  },
  // INFO: jandh-emoticons is served from this origin under `/emoticons`, so its URL 임포트 screen is same-origin with this app rather than a subdomain an installed iOS PWA would hand to Safari View Controller.
  // WARN: One prefix covers pages, route handlers and `_next` assets alike, because that repo sets `basePath: "/emoticons"`. Nothing here may narrow the match to page paths — the assets would then 404 against this app's own `_next`.
  // WARN: `:path*` matches zero segments, so this one rule also serves a bare `/emoticons`. Next's own multi-zones guide pairs its wildcard with a second constant rule only because it writes `:path+`, which does not.
  async rewrites() {
    return [{ source: "/emoticons/:path*", destination: `${EMOTICONS_ORIGIN}/emoticons/:path*` }];
  },
} satisfies NextConfig;
