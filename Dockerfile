# syntax=docker/dockerfile:1

# INFO: Next 16 declares engines.node >= 20.9; 22 is the current LTS line.
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NEXT_TELEMETRY_DISABLED=1
# INFO: The pnpm version is pinned by package.json's `packageManager` field, which corepack reads.
RUN corepack enable

FROM base AS deps
WORKDIR /app
# WARN: pnpm-workspace.yaml is part of the install contract, not decoration — it carries `ignoredBuiltDependencies`, and pnpm resolves differently without it.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
	pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# WARN: `NEXT_PUBLIC_*` is inlined into the browser bundle at build time, so these are build args and can never be supplied by the runtime .env. A missing one here ships as `undefined` to the client with nothing at boot to report it.
ARG NEXT_PUBLIC_EMOTICONS_ORIGIN
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ARG NEXT_PUBLIC_SSE_IDLE_SLEEP
ARG NEXT_PUBLIC_EMOTICON_API_REMOTE
ENV NEXT_PUBLIC_EMOTICONS_ORIGIN=$NEXT_PUBLIC_EMOTICONS_ORIGIN
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV NEXT_PUBLIC_SSE_IDLE_SLEEP=$NEXT_PUBLIC_SSE_IDLE_SLEEP
ENV NEXT_PUBLIC_EMOTICON_API_REMOTE=$NEXT_PUBLIC_EMOTICON_API_REMOTE

# INFO: next.config.ts leaves `output` unset without this, so Vercel and Netlify keep building through their own adapters from the same source.
ENV NEXT_OUTPUT_STANDALONE=true

# INFO: `pnpm build` is lint:steiger + next build, so an architecture violation fails the image rather than the deploy (REQUIREMENTS.md § 15.).
RUN pnpm build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# WARN: The standalone server binds localhost by default, which is unreachable from the Docker network Caddy proxies over.
ENV HOSTNAME=0.0.0.0

# WARN: REQUIREMENTS.md § 15.1. `BUILD_ID` reads the two Vercel variables and falls back to the constant "development" — which never changes, so the deploy-skew signal silently stops firing. Injected per image so it moves exactly when a build does.
ARG BUILD_SHA=development
ENV VERCEL_GIT_COMMIT_SHA=$BUILD_SHA

RUN addgroup -g 1001 -S nodejs \
	&& adduser -S nextjs -u 1001 -G nodejs

# INFO: The standalone bundle carries its own minimal server.js and only the traced subset of node_modules.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# WARN: `output: "standalone"` copies neither of these two; server.js serves them only once they are placed here by hand.
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
