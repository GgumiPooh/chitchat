import type { NextConfig } from "next";

const SECURITY_HEADERS = [
  // INFO: REQUIREMENTS.md § 14. Index blocking, layer 3 of 3 — robots.ts and layout metadata are the others.
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Frame-Options", value: "DENY" },
];

export default {
  experimental: {
    viewTransition: true,
  },
  allowedDevOrigins: ["localhost", "192.168.*.*"],
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
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
} satisfies NextConfig;
