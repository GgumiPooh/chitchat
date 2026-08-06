import type { NextConfig } from "next";

const SECURITY_HEADERS = [
  // INFO: REQUIREMENTS.md § 14. Index blocking, layer 3 of 3 — robots.ts and layout metadata are the others.
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Frame-Options", value: "DENY" },
];

const SERVICE_WORKER_HEADERS = [
  { key: "Content-Type", value: "application/javascript; charset=utf-8" },
  { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
  { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
];

export default {
  allowedDevOrigins: ["localhost", "192.168.*.*", "jandh-dev.jeheecheon.com"],
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
} satisfies NextConfig;
