# J&H — Implementation Requirements

A private web app used by exactly two people. An iOS PWA with four tabs: Chat, Calendar, Gallery, Settings.

- **App name**: J&H
- **Project folder**: `jandh`
- **Deployment domain**: `jandh.jeheecheon.com`
- **Users**: 2 (fixed, never grows)
- **Repository**: GitHub Private

> **Language note**: This document is written in English because LLM comprehension and output quality are better in English. **All user-facing copy in the product is Korean.** Korean string literals in this document (`오늘`, `새 메시지 3`, …) are the literal UI text to ship — do not translate them into English in code.

## Document Map

| Document                                                | Role                                                                                                                   |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `docs/REQUIREMENTS.md` (this file)                      | **What we build** — feature requirements, architecture decisions, schema, API shapes, implementation order             |
| `docs/DESIGN.md`                                        | **How it looks** — design tokens (single source of truth for hex values), component visual specs, chat screen geometry |
| `AGENTS.md` (repo root; `CLAUDE.md` is a symlink to it) | **How we write it** — coding conventions, component contracts, prohibitions                                            |

Precedence on conflict: visual specs → `DESIGN.md`; code-authoring rules → `AGENTS.md`; everything else → this file.
Implementation is **in progress**. Steps 1 and 2 of § 17. have landed (project setup and base components; Google OAuth, sessions, and the `users` / `sessions` tables). Step 2 is code-complete but still needs the Google Cloud client and the real-device iOS PWA check (§ 5.4.); step 3 (the remaining schema) is next. `/chat` is a placeholder screen that only proves the session resolves — the real one arrives in step 5.

---

## 0. Settled Technical Decisions

| Item         | Decision                                                       | Rationale                                                                                                        |
| ------------ | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Framework    | Next.js 16.2.12 (App Router) + React 19.2.4                    | All server functionality lives in the single Next app                                                            |
| Hosting      | Vercel (serverless)                                            | Free, `git push` deploys, automatic HTTPS                                                                        |
| Database     | Neon Postgres + Drizzle ORM                                    | Free tier, serverless-friendly                                                                                   |
| Auth         | Google OAuth (allow-listed emails) → our own session           | We never store a password, so no brute-force surface to defend                                                   |
| Session      | Postgres `sessions` table + opaque token in an httpOnly cookie | Per-device revocation, profile changes apply immediately, avoids iOS ITP storage eviction                        |
| Realtime     | SSE + Postgres `LISTEN`/`NOTIFY`                               | WebSockets conflict with the single-Next-app constraint; SSE gets cookie auth and reconnection from the standard |
| Images       | Cloudflare R2 (private bucket + presigned URLs)                | Free egress; a UUID in a URL is obscurity, not access control                                                    |
| Architecture | Feature-Sliced Design, enforced by steiger                     | Inherited from the `everytldr` conventions                                                                       |
| Styling      | Tailwind v4 + semantic tokens (`theme.css`)                    | Dark theme becomes a value swap, not a refactor                                                                  |
| Indexing     | Fully blocked (robots + meta + header, three layers)           | Private app                                                                                                      |

**Reference project**: `~/Projects/everytldr/everytldr.com/frontend`

---

## 1. Project Setup

### 1.1. Initialization

- [x] Create a Next.js 16.2.12 project with `pnpm` (App Router, TypeScript, Turbopack)
- [x] `git init` → connect to a **Private** GitHub repository (`GgumiPooh/jandh`)
- [x] `docker-compose.yml` at the repo root runs local Postgres for development (`pnpm db:up`); production stays on Neon
- [x] Write `.gitignore` and `.env.example` (`.env` must never be committed)

### 1.2. Inherit Verbatim From the Reference Project

- [x] `tsconfig.json` (`@/*` → `./src/*`, `verbatimModuleSyntax`, `strict`)
- [x] `eslint.config.mjs` — perfectionist JSX-prop ordering, `consistent-type-imports`, `curly`, ban on trailing `export { }`, ban on imports that bypass an FSD slice's public API (`no-restricted-imports`)
- [x] `.prettierrc` — `printWidth: 100`, organize-imports plugin, tailwindcss plugin, `tailwindFunctions: ["cn", "cva"]`
- [x] `steiger.config.ts` — FSD recommended config, with `insignificant-slice` downgraded to `warn` for `widgets/**` and `entities/**` (entity consumers are mostly Route Handlers under `app/`, which steiger does not scan)
- [x] `postcss.config.mjs` (`@tailwindcss/postcss`)
- [x] `components.json` (shadcn: `new-york` style, aliases `@/shared/ui` and `@/shared/lib`, lucide icon library)
- [x] The SVGR turbopack rule in `next.config.ts` (`*.svg` → React component)
- [x] The `*.svg` module declaration in `global.d.ts`
- [x] `src/app/fonts` — Pretendard Variable as a local font
- [x] `package.json` scripts — `lint` runs eslint then steiger; `dev` runs the app and steiger `--watch` concurrently

### 1.3. Deliberately Excluded From the Reference Project

- [x] All i18n — `next-intl`, `[locale]` routing, `messages/`, `build-messages.ts`, the `:lang(ko)` block in `theme.css` (merge its Korean values in as the base scale instead), the `Translation` component, and AGENTS.md §4
- [x] `orval` (there is no separate backend to generate a client for — Next _is_ the backend)
- [x] `msw`
- [x] All ads / analytics / RSS / structured-data / sitemap config and lib files
- [x] The `rewrites` backend proxy

### 1.4. Dependencies

- [x] Runtime: `drizzle-orm`, `postgres` (or `pg`), `arctic`, `jose`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `zod`
- [x] UI: `radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css`, `lucide-react`, `sonner`, `vaul`, `next-themes`, `@tanstack/react-query`, `react-error-boundary`, `react-intersection-observer`, **`react-virtuoso`** (virtual scrolling, §8.3)
- [x] **`lodash-es`** (+ `@types/lodash-es`) — required
- [x] **`react-use`** — required
- [x] Dev: `eslint`, `prettier`, `steiger`, `@feature-sliced/steiger-plugin`, `eslint-plugin-perfectionist`, `@svgr/webpack`, `drizzle-kit`, `tsx`, `concurrently`

### 1.5. Convention Documents

- [x] `AGENTS.md` written at the repo root — inherits the reference `AGENTS.md` with the changes below already applied
  - [x] §0 Read every file in `docs/` before working; update them in the same change _(new section)_
  - [x] §1 UI component contract: a `{ComponentName}Props` type alias is mandatory and must include `className?: string`; `className` goes on the outermost element only; inner elements get `{elementName}ClassName`; `children` is typed via `PropsWithChildren` imported directly
  - [x] §2 shadcn first → rewrite every visual decision to satisfy `docs/DESIGN.md` → refactor to the §1 contract; §2.4 forbids composing overlays at the call site
  - [x] §3 Nullish unions use `Nullable<T>` / `Optional<T>` / `Maybe<T>`
  - [x] §4 Responsive policy — single mobile UI, mandatory pointer affordances, app shell width _(replaces the reference's i18n section)_
  - [x] §5 Semantic tokens only + dark-theme readiness rules
  - [x] §6 Server code — `import "server-only"`, `ensureEnv` over bare `process.env`, `getDb()` for the pooled connection, `requireUserOrRedirect()` for the session in Server Components (a Route Handler returns its own 401; the App Router does not honour a thrown `Response`)
  - [x] §7 No comments that restate the code; comment only what the code cannot express
  - [x] §8 No bare duration literals → `A_SECOND` / `A_MINUTE` / `AN_HOUR` / `A_DAY`, with explicit conversion for seconds-based APIs
- [x] `CLAUDE.md` → symlink to `AGENTS.md`
- [x] `docs/DESIGN.md` written (KakaoTalk-derived chat UI rules, single mobile layout)
- [x] Every project document lives in `docs/` (AGENTS.md §0)

---

## 2. FSD Structure

- [x] Layer layout
  ```
  app/                     Next routes — kept thin, delegate to src/pages
    (auth)/login/
    (main)/{chat,calendar,gallery,settings}/
    api/{auth,chat,media}/
    robots.ts  manifest.ts  icon.svg  favicon.ico
  pages/                   EMPTY SENTINEL — see below. No route files here
  proxy.ts                 Next 16's renamed Middleware (§5.2)
  src/
    app/       providers / styles(globals.css, theme.css) / fonts
    pages/     login, chat, calendar, gallery, settings
    widgets/   tab-bar, chat-room, message-composer, emoticon-picker,
               gallery-grid, calendar-month, settings-form
    features/  session, send-message, upload-media, mark-read,
               emoticon-prefs, update-profile, manage-event
    entities/  user, message, media, event, emoticon
    shared/    db, auth, storage, api, config, lib, theme, ui
  ```
  The session feature slice is `session`, not `auth` — a `features/auth` slice collides with the `shared/auth` segment name (`fsd/ambiguous-slice-names`)
- [x] A root-level `pages/` directory MUST exist and stay empty (it holds only a README). Without it Next.js treats the FSD `src/pages/` layer as the Pages Router and breaks the build
- [x] Server-only code (Drizzle schema, session logic, R2 client) lives in `shared/` segments and imports `server-only`
- [x] Data-fetching functions live in each entity's `api` segment
- [x] Every slice is imported only through its `index.ts` public API (enforced by eslint)
- [x] `pnpm lint:steiger` passes

---

## 3. Shared Utilities (`src/shared/lib`)

- [x] `nullish.ts` — `Maybe<T>`, `Nullable<T>`, `Optional<T>` (port verbatim from the reference)
- [x] `safely.ts` — `safelyGet`, `safelyGetAsync`, `safelyRun`, `safelyRunAsync` (port verbatim)
- [x] `assert.ts` — `assert`, `AssertionError`, `ensure` (port verbatim)
- [x] `class-name.ts` — `cn`, built with `extendTailwindMerge` so custom `text-*` tokens merge correctly
- [x] `time.ts` — `A_SECOND` / `A_MINUTE` / `AN_HOUR` / `A_DAY` plus date formatters (i18n removed; locale hardcoded to Korean)
- [x] `dom.ts` — `isBrowser`, `isEditableElement`
- [x] `use-hydrated.ts`, `use-is-coarse-pointer.ts`
- [x] Re-export everything from the barrel `index.ts`

---

## 4. Design System and Theming

- [x] `src/app/styles/globals.css` — `@import "tailwindcss"` + `tw-animate-css` + `./theme.css`, plus `@custom-variant dark (&:where(.dark, .dark *))`
- [x] `src/app/styles/theme.css` — semantic tokens in the `@theme` block
  - [x] Declare `--color-*: initial` first to **remove Tailwind's default palette from the build**, structurally preventing raw color utilities
  - [x] Base tokens: `backdrop`, `canvas`, `surface-soft`, `surface-strong`, `surface-pressed`, `hairline*`, `ink`, `body`, `meta`, `meta-soft`, `primary*` (incl. `primary-tint`), `semantic-*`, `scrim`
  - [x] Chat-only tokens: `chat-canvas`, `bubble-mine`, `bubble-mine-pressed`, `bubble-theirs`, `bubble-theirs-pressed`, `bubble-ink`, `chat-meta`, `chat-pill`, `chat-pill-ink`, `unread`, `search-hit`
  - [x] **`docs/DESIGN.md` §4 is the single source of truth for the exact hex values and each token's role.** Do not duplicate values into this file
  - [x] `--text-*` type scale, `--radius-*`, `--spacing-*`, `--shadow-*`
- [x] Create the `.dark { }` block as an **empty shell** — structure only, no values yet
- [x] `src/shared/theme/provider.tsx` — wraps `next-themes`, exports `Theme = "light" | "dark" | "system"` and a `useTheme` hook
  - [x] Currently pinned to light via `forcedTheme="light"` (adding dark means deleting this one line)
- [x] Icons: `lucide-react` first; custom marks are `.svg` files imported through SVGR and re-exported from `shared/ui/index.ts` as `export { default as X } from "./x.svg"`

### 4.1. Responsive Policy — One Mobile UI

- [x] **Build exactly one UI: the mobile one.** Never branch layout or swap components on viewport width
- [x] Desktop shows the **same mobile UI**, centered in a narrow column
- [x] The "render a `BottomSheet` on narrow screens and a `Modal` on wide screens" technique is **not used** — do not port the reference's `ResponsiveDialog` / `ResponsiveSelector` / `ResponsiveActionMenu`
- [x] However, **pointer support is mandatory**
  - [x] Mouse `click` must work (never rely on touch-only handlers)
  - [x] Provide hover styling — Tailwind v4's `hover:` already resolves under `@media (hover: hover)`, so hover states will not stick after a tap on touch devices
  - [x] Also define `active:` and `focus-visible:` states
  - [x] Use `useIsCoarsePointer` only where an interaction detail genuinely differs — never for layout

### 4.2. Page Width and Centering

- [x] Port the reference `Container`, but **do not reuse its max widths** (everytldr targets desktop: `max-w-6xl` / `max-w-4xl`)
- [x] App shell max width: **`576px` (`max-w-xl`)** — narrower than a tablet's portrait width. The purpose is to stop the four-item bottom tab bar from stretching across a desktop screen
  - [x] Define it as a token (`--container-app`) so it can be tuned in one place
- [x] `Container` sizes — `md` (default) = app max width; `sm` = `448px` (`max-w-md`); horizontal padding `px-md`
- [ ] **The bottom tab bar must also be constrained to the same max width and centered.** It is `fixed`, so this needs explicit handling — without it, the bar spans the full desktop viewport
- [x] The area outside the app shell uses a tone darker than `canvas` (`backdrop`) so the shell reads as a held device
- [ ] Full-height screens such as Chat use `100dvh` (never `100vh`) and honour `env(safe-area-inset-*)`

### 4.3. Base Components (`src/shared/ui`)

Install via shadcn, then rewrite every visual decision against `docs/DESIGN.md` and refactor to the AGENTS.md §1 contract.

- [x] `Button`, `IconButton`, `Input`, `Textarea`
- [x] `Drawer` (vaul), `Dialog` (radix) — composition primitives. **Never used directly in screen code**
- [x] `BottomSheet` — **props-driven, not composed**, exactly like the reference implementation
  ```ts
  type BottomSheetProps = PropsWithChildren<{
    className?: string;
    isOpen: boolean;
    header: { className?: string; title: string; description?: string };
    onClose: () => void;
  }>;
  ```
  - [x] Internally composes `Drawer` / `DrawerContent` / `DrawerTitle` / `DrawerDescription`, includes the grab handle, and calls `onClose` from `onOpenChange` only when closing
- [x] `Modal` — props-driven in the same way
  ```ts
  type ModalProps = PropsWithChildren<{
    className?: string;
    hideCloseButton?: boolean;
    isOpen: boolean;
    position?: "center" | "top";
    size?: "sm" | "md";
    header: { className?: string; title: string; description?: string };
    onClose: () => void;
  }>;
  ```
  - [x] Redefine `size` to values that fit inside the app shell (the reference's `w-120` / `w-140` / `w-160` are desktop widths and cannot be reused)
- [x] `ActionSheet` — for message long-press actions. Also props-driven: `items: { label, icon, variant, onSelect }[]`
- [x] `Badge`, `Chip`, `Skeleton`, `Container`, `ScrollableRow`, `ScrollReset`
- [x] `Toaster` / `toast` (sonner)
- [x] `RelativeTime`
- [x] `Avatar` (new — for profile images)
- [x] Re-export everything from the barrel `index.ts`

> **Principle**: every overlay component in `shared/ui` is a finished component that takes props. Screen code never repeats `<Dialog><DialogContent><DialogHeader>…` assembly.

---

## 5. Authentication

### 5.1. Google OAuth

- [ ] Create a Google Cloud project and OAuth client (consent screen in "Testing" mode)
- [ ] Register redirect URIs: `http://localhost:3000/api/auth/callback/google` and `https://jandh.jeheecheon.com/api/auth/callback/google`
- [x] `GET /api/auth/login/google` — generate `state` + PKCE with `arctic`, store them in cookies, redirect to Google
- [x] `GET /api/auth/callback/google` — exchange the code, then verify the `id_token` signature with `jose`
  - [x] Verify `state` and the PKCE verifier
  - [x] Require `email_verified === true`
  - [x] Normalize the email (lowercase) and require an **exact match** against `ALLOWED_EMAILS`; reject otherwise
  - [x] Create the `users` row on first login; match it thereafter — the lookup key is `google_sub`, not the email, because Google lets an account change address and matching on email would collide with the existing row's unique `google_sub`
- [x] `POST /api/auth/logout` — delete the current session row and expire the cookie

### 5.2. Session

- [x] Generate a 32-byte random token → store **its hash** in `sessions.token_hash`; only the raw token goes into the cookie
- [x] Cookie: `httpOnly; Secure; SameSite=Lax; Path=/; Max-Age=180 days`
- [x] **Never use localStorage for auth state** — iOS ITP can evict script-written storage after 7 days of non-use, which a server-set cookie is not subject to
- [x] Sliding renewal — update `last_seen_at` and extend expiry, at most once a day per device
- [x] The proxy re-issues the cookie with a fresh `Max-Age` on every page request. Without it the row's new expiry is invisible to the browser, which drops the cookie 180 days after login however active the user was
- [x] Cache the session lookup per request (React `cache()`) to avoid duplicate queries
- [x] `proxy.ts` checks **only whether the cookie exists** and redirects; the real DB validation happens in Server Components / Route Handlers
  - Next.js 16 renamed Middleware to **Proxy**: the file is `proxy.ts` at the repo root (beside `app/`), exporting `proxy` (or a default). Behaviour is unchanged
- [x] Unauthenticated → redirect to `/login`; authenticated user hitting `/login` → redirect to `/chat`
- [x] A cookie that exists but no longer validates is unwound through `GET /api/auth/session/expire`, which clears it and lands on `/login`. A Server Component cannot write cookies, so redirecting it straight to `/login` would bounce off the proxy forever. The route re-checks the session first and refuses to clear a valid one — a cross-site `<img src>` reaches it with the cookie attached

### 5.3. Scope

- [x] **Google OAuth only.** Do not build a provider abstraction layer — routes are the fixed `/api/auth/login/google` and `/api/auth/callback/google`, with no `[provider]` dynamic segment
- [x] Password login is **not implemented** (smaller attack surface)

### 5.4. iOS PWA Verification (highest priority)

- [ ] Verify **on a real device** that the Google login redirect from a home-screen standalone PWA returns to the app correctly
- [ ] Verify the session cookie survives across days of non-use (re-check after several days)

---

## 6. Database Schema (Drizzle)

- [x] `users` — `id`, `email` (unique), `nickname`, `avatar_media_id`, `created_at`
- [x] Store `google_sub` (unique) directly on `users` — there is no `accounts` table, because there is exactly one provider
- [x] `sessions` — `id`, `user_id`, `token_hash` (unique), `device_label`, `created_at`, `last_seen_at`, `expires_at`
- [ ] `conversations` — the single conversation (`id`, `created_at`)
- [ ] `conversation_members` — `conversation_id`, `user_id`, `last_read_at`
- [ ] `messages` — `id` (bigserial; the ordering and cursor key), `conversation_id`, `sender_id`, `type` (`text` | `image` | `emoticon` | `system`), `text`, `emoticon_item_id`, `event_id` (the event a `system` message refers to), `client_msg_id` (uuid, unique), `created_at`, `deleted_at`
  - [ ] `system` is for calendar-change notices (§11.5); its `sender_id` is the user who made the change
  - [ ] **Append-only** — marking messages read must never UPDATE this table
  - [ ] A CHECK constraint pins which columns each `type` may fill — without it a `type = 'text'` row can silently acquire `message_media` children
  - [ ] **Never store an R2 URL in this table.** Presigned URLs expire in minutes (§9); only ids are stored and the URL is minted per request
- [ ] `message_media` — `message_id` (FK → `messages.id`, `ON DELETE CASCADE`), `media_id` (FK → `media.id`), `sort_order` (smallint), primary key (`message_id`, `sort_order`)
  - [ ] **One bubble is one `messages` row regardless of image count** — sending 3 photos at once produces 1 message row and 3 `message_media` rows. This is why there is no `messages.media_id` column
  - [ ] The alternative — one row per image tied together by a `group_id` — is **rejected**: the §8.2 cursor page (`LIMIT 30`) would cut a group in half, and the boundary-repair logic would spread into §8.2, §8.3, and §8.6.1
  - [ ] A `uuid[]` array column is also rejected — Postgres cannot put a foreign key on array elements, and §18 #1 (media deletion) is still open
  - [ ] `sort_order` preserves the order the sender picked; without it the grid rearranges itself between queries
  - [ ] Read path: fetch the `message_media` rows for a whole page of messages in one query, ordered by `sort_order`
- [ ] `media` — `id` (uuid), `owner_id`, `r2_key`, `mime`, `size`, `width`, `height`, `blurhash`, `taken_at`, `created_at`
- [ ] `events` — calendar entries: `id`, `title`, `description`, `starts_at`, `ends_at`, `all_day`, `color`, `recurrence` (`none` | `yearly`), `scope` (`shared` | `mine`), `created_by`, `created_at`, `updated_at`
  - [ ] Recurrence supports **yearly only** (anniversaries). Do not introduce a general recurrence rule engine such as RRULE (§11). On read, project `recurrence = 'yearly'` rows onto the requested year
  - [ ] The relationship start date, 100-day marks, and yearly anniversaries are **not rows in this table** — they are derived from `RELATIONSHIP_START_DATE` (§11.2)
- [ ] `emoticon_packs` — `id`, `name`, `thumbnail_key`, `created_at`
- [ ] `emoticon_items` — `id`, `pack_id`, `r2_key`, `width`, `height`, `sort_order`
  - [ ] `width` / `height` are required — the virtualized message list must reserve the box before the asset loads (§8.3)
- [ ] `user_emoticon_prefs` — `user_id`, `pack_id`, `enabled`, `sort_order`, unique(`user_id`, `pack_id`)
- [ ] Indexes: `messages(conversation_id, id DESC)`, `media(created_at DESC)`, `events(starts_at)`, `sessions(token_hash)`
- [ ] `pg_trgm` extension + a GIN trigram index on `messages.text` (§8.6)
- [ ] Emit `pg_notify('new_message', payload)` — either from a trigger or from the application right after INSERT
- [x] Two connection strings — `DATABASE_URL` (pooled, for normal queries) and `DATABASE_URL_DIRECT` (unpooled, required for `LISTEN` and for migrations)
- [ ] `drizzle-kit` migration pipeline + initial seed (one conversation, two members)

---

## 7. Layout, Tab Bar, PWA

- [ ] `(main)` layout — inside the app shell (max `576px`, centered): a per-screen top header, the content, and the bottom tab bar
- [ ] Four bottom tabs: **Chat / Calendar / Gallery / Settings**
  - [ ] Active-tab highlight, icon + label
  - [ ] Unread badge on the Chat tab
  - [ ] Honour `env(safe-area-inset-bottom)` (home-indicator area)
  - [ ] Even though it is `fixed`, keep the app max width and centering (§4.2)
  - [ ] Provide mouse hover / active styling
- [ ] Preserve scroll position across tab switches
- [ ] `app/manifest.ts` — name `J&H`, `display: "standalone"`, `theme_color`, `background_color`, icon set (180 / 192 / 512, plus maskable)
- [ ] `viewport` — `viewport-fit=cover`, `user-scalable=no`, `interactiveWidget` configured
- [ ] "Add to Home Screen" guidance for iOS, shown only when not yet installed
- [ ] Offline support is **out of scope** — no service worker. If push notifications are adopted, a **push-only service worker** becomes necessary (§16.1, §18 #8); even then, do not add caching

---

## 8. Chat Tab (KakaoTalk-style)

### 8.1. UI

> **Only layout and interaction rules are taken from KakaoTalk.** Its colors and shapes (Kakao yellow, the sky-blue chat background, drawn bubble tails) are **not** taken — see `docs/DESIGN.md` §2.2 and §6 for the reasoning and the replacements. DESIGN.md §6 is the single source of truth for every visual spec referenced below.

- [ ] Bubbles — mine right-aligned, theirs left-aligned, with a **notch corner** (a reduced radius on the corner nearest the sender) instead of a drawn tail (DESIGN §6.2)
- [ ] Their messages show avatar + nickname, on the first message of a group only
- [ ] Timestamp shown once per same-minute group, on the last message of that group
- [ ] Date divider pill (`오늘`, `어제`, `2026년 8월 3일 월요일`)
- [ ] Unread marker — a `1` beside my message, in the `unread` token (DESIGN §4.1.4)
- [ ] Composer — auto-growing textarea, `+` (attach image) on the left, emoticon toggle / send button on the right
- [ ] Image messages render without a bubble; tapping opens a fullscreen viewer (pinch zoom, horizontal swipe)
  - [ ] Multiple images sent together render as **one bubble** (§6, `message_media`) — the client branches on the array length alone: 1 image keeps its own `media.width` / `height` aspect ratio, 2+ use a fixed square-cell grid
  - [ ] The grid makes §8.3 box reservation **more** accurate, not less: the height follows from the cell layout and is independent of the individual images' dimensions
  - [ ] Tapping any image opens the viewer at that index, swiping through the rest of the same bubble
- [ ] Emoticon messages render as the image alone, without a bubble
- [ ] Long-press (touch) or right-click / hover-revealed control (mouse) → `ActionSheet` (copy / delete)
- [ ] **Scroll-to-bottom floating button** (as in KakaoTalk)
  - [ ] Appears once scrolled roughly 200px away from the newest message; fades out on arrival
  - [ ] While scrolled away, incoming messages show a **count** on the button (`새 메시지 3`)
  - [ ] Tapping scrolls smoothly to the bottom and marks messages read
  - [ ] The same component also returns the user to the newest messages after a search jump (§8.6.1)
- [ ] iOS keyboard handling — track the composer position with the `visualViewport` API

### 8.2. Message Loading

- [ ] Cursor-based infinite scroll — `GET /api/messages?before={id}&limit=30`, i.e. `WHERE id < :before ORDER BY id DESC`
- [ ] **No OFFSET pagination** — incoming messages shift page boundaries, producing duplicates and gaps
- [ ] The client keeps two cursors: `oldestLoadedId` (scrolling into the past) and `newestKnownId` (gap recovery)
- [ ] Gap recovery: `GET /api/messages?after={id}`
- [ ] Jump: `GET /api/messages?around={id}` (§8.6.1)

### 8.3. Virtual Scrolling (Windowing)

Offscreen message nodes **must not stay in the DOM**. After a few years of history, thousands of nodes accumulated by infinite scroll will destroy scroll performance in iOS Safari.

- [ ] **Use `react-virtuoso`** — it provides every API this chat needs out of the box
  | Requirement                                       | Virtuoso API                         |
  | ------------------------------------------------- | ------------------------------------ |
  | Infinite scroll upward                            | `startReached`                       |
  | No scroll jump when prepending                    | decrement `firstItemIndex`           |
  | Stick to the bottom                               | `followOutput="smooth"`              |
  | Condition for showing the scroll-to-bottom button | `atBottomStateChange`                |
  | Jump to a search result                           | `scrollToIndex({ align: "center" })` |
  | Automatic variable-height measurement             | built in                             |
- [ ] **Do not use `flex-direction: column-reverse`** — the virtualizer owns scroll anchoring and the two cannot coexist. Bottom-stickiness is `followOutput`'s job; prepend stability is `firstItemIndex`'s job
- [ ] **Reserve the box for image messages before the asset loads** — render an aspect-ratio box from `media.width` / `height` first. Without this, every image load triggers a re-measure cascade and the scroll position jolts (the dimension columns already exist in the schema, §6)
- [ ] Date dividers are list items, but the **sticky top indicator is a separate overlay** computed from the visible range
- [ ] Restore scroll position when returning to the tab (`restoreStateFrom`)
- [ ] The browser's native `Ctrl+F` cannot find offscreen messages — in-app search (§8.6) is the deliberate replacement
- [ ] Tune the overscan so fast scrolling does not expose blank regions

### 8.4. Realtime (SSE)

- [ ] `GET /api/chat/stream` — `text/event-stream`
  - [ ] Acquire a connection from the **direct (unpooled)** connection string and hold it while issuing `LISTEN new_message`; never release it back to the pool before the stream ends. A transaction-mode pooler hands the underlying connection to another client between transactions, which silently drops the `LISTEN`
  - [ ] Use the request's `Last-Event-ID` header as a cursor — replay everything accumulated while disconnected, then switch to live streaming
  - [ ] Populate the `id:` field on every event (it becomes the reconnect cursor)
  - [ ] Send periodic heartbeat comments (`:ping`) to prevent proxy timeouts
  - [ ] Release the connection in a `finally` block when the stream ends
- [ ] Client subscribes with `EventSource` and relies on its automatic reconnection
- [ ] On `visibilitychange` → visible: explicitly catch up with `fetch(?after=newestKnownId)`, and reconnect if `readyState === CLOSED`
- [ ] **Deduplicate received messages by id** — SSE replay and the catch-up fetch will overlap
- [ ] Close the stream when the tab goes to the background (so Neon compute can autosuspend)

### 8.5. Sending

- [ ] The client generates `client_msg_id` (uuid) and renders optimistically at once
- [ ] `POST /api/messages` → `ON CONFLICT (client_msg_id) DO NOTHING` prevents duplicate rows on retry
- [ ] Match the message echoed back over SSE to the optimistic entry by `client_msg_id` and replace it
- [ ] Show a retry affordance when sending fails

### 8.6. Message Search (KakaoTalk-style)

**Why this approach**: Postgres's built-in full-text search (`tsvector`) has no Korean morphological dictionary, and the `'simple'` config only splits on whitespace. Korean attaches grammatical particles (조사) directly to nouns, so a search for `저녁` ("dinner") fails to match the stored token `저녁을` ("dinner" + object particle). Korean-aware parser extensions such as `mecab-ko` or `pg_bigm` (the Postgres counterpart to MySQL's `FULLTEXT ... WITH PARSER ngram`) cannot be installed on managed Postgres like Neon. We therefore use **`pg_trgm` + `ILIKE` substring matching** — it is language-neutral, and because it matches substrings, the particle problem cannot occur at all.

- [ ] `CREATE EXTENSION IF NOT EXISTS pg_trgm`
- [ ] `CREATE INDEX messages_text_trgm_idx ON messages USING gin (text gin_trgm_ops)`
  - [ ] Queries of 2 characters or fewer cannot use a trigram index and fall back to a sequential scan — acceptable at our scale (tens of thousands of rows, tens of milliseconds)
- [ ] `GET /api/messages/search?q=&before=` — `type = 'text' AND deleted_at IS NULL AND text ILIKE '%' || $q || '%'`
- [ ] **Order by recency, not relevance** (`ORDER BY id DESC`) — chat search is "where was that thing we talked about", so BM25-style ranking actively gets in the way. This is also why no dedicated search engine is warranted
- [ ] Normalize the query — `lower()`, trim, and escape `%` and `_`
- [ ] Cursor-paginate the result list (same mechanism as §8.2)

#### 8.6.1. Jumping From a Result to the Message (the hard part)

- [ ] Tapping a search result navigates to the chat screen and **scrolls to that message**
- [ ] Load context around the target `id` — `GET /api/messages?around={id}&limit=30` (or two calls using the existing `before` / `after`)
- [ ] **Reinitialize the infinite-scroll state around the jump point** — set fresh `oldestLoadedId` / `newestKnownId` so the user can keep scrolling both upward and downward from there
- [ ] Move with Virtuoso's `scrollToIndex({ align: "center" })` and reset `firstItemIndex` accordingly (§8.3)
- [ ] On arrival, **flash a highlight** behind the target bubble (fades out after roughly 1.5s)
- [ ] Returning to the newest messages reuses the scroll-to-bottom button from §8.1
- [ ] Previous / next navigation between search results, as in KakaoTalk
- [ ] Highlight the matched substring **client-side by splitting the string** (do not use `ts_headline`)
- [ ] Image and emoticon messages are excluded from search
- [ ] Empty states for "no query yet" and "no results"

### 8.7. Display Names and Profiles

- [ ] The name shown in chat is **the nickname each user set for themselves in Settings** (`users.nickname`, §12)
  - [ ] The Google account name is used only as the initial default at first login, never afterwards
  - [ ] There is **no** feature for naming the other person (KakaoTalk's per-contact rename) — each user names themselves
- [ ] **Never copy the name or avatar onto the message row.** Join on `sender_id` and resolve at render time
  - [ ] Changing a nickname therefore **retroactively changes the displayed name on all past messages.** This is the intended behaviour
  - [ ] The same applies to system messages (§11.5) — baking the name into the stored text would leave stale names in old records after a rename
- [ ] A nickname change is reflected immediately on the other user's open screens (session-based, no re-login needed, §5)
- [ ] Fallback when the nickname is empty or unset — use the email local part
- [ ] Fallback when no avatar is set — initial-letter avatar from the nickname (DESIGN §7.7)

### 8.8. Read / Unread

- [ ] Cursor approach via `conversation_members.last_read_at` (no per-message `read_at` column)
- [ ] A message is unread when `message.created_at > otherMember.last_read_at`
- [ ] While the chat tab is visible, update `last_read_at` via `POST /api/chat/read` (throttled)
- [ ] Broadcast the update over SSE so the sender's `1` markers all clear at once
- [ ] An unread-count endpoint for the tab bar badge

---

## 9. Image Storage (R2)

- [ ] Create the R2 bucket as **private**, with public access fully disabled
- [ ] `POST /api/media/upload-url` — validate the session, then issue a presigned **PUT** URL so the client uploads **directly to R2**
  - [ ] This avoids Vercel's 4.5MB request-body limit, which full-resolution iPhone photos exceed
  - [ ] After the upload completes, register metadata with `POST /api/media`
- [ ] `GET /api/media/{id}?variant=thumb|original` — validate the session, generate a presigned **GET** URL (5–10 minutes), and `302` redirect to it
  - [ ] `variant` defaults to `thumb`. The gallery grid and chat thumbnails use `thumb`; only the fullscreen viewer uses `original`
  - [ ] Because the route is same-origin, `<img>` requests carry the session cookie automatically, so this authenticates correctly
  - [ ] Set `Cache-Control: private, max-age` shorter than the signature's expiry
- [ ] **Never rely on a UUID in the URL as access control** — every read goes through session validation
- [ ] Thumbnails — the client resizes at upload time and uploads both objects (`{key}` and `{key}_thumb`)
- [ ] Use `media.blurhash` as the **pre-load placeholder** for grid and bubble images, together with box reservation (§8.3)
- [ ] R2 credentials live only in server env; they must never reach the client bundle
- [ ] Deleting an image also deletes the R2 objects

---

## 10. Gallery Tab

- [ ] Images sent in the Chat tab **appear here automatically** — the `media` table is the single source, with no copying
- [ ] Reverse-chronological grid (3 columns) with month section headers
- [ ] Cursor-based infinite scroll
- [ ] Tapping opens the fullscreen viewer (pinch zoom, swipe between images, download)
- [ ] A link that jumps to where the image was sent in the conversation
- [ ] Direct upload from the gallery, with an option not to post it to the conversation
- [ ] Deletion (the interaction with chat messages is still undecided — §18 #1)

---

## 11. Calendar Tab

### 11.1. D-day Header

- [ ] The relationship start date is injected via the **`RELATIONSHIP_START_DATE` environment variable** (ISO `YYYY-MM-DD`). It is **not stored in the database**
- [ ] Show the elapsed day count at the very top of the Calendar tab. Following the Korean convention, **the start date itself is day 1**
- [ ] Compute it in a Server Component and pass it down, so a skewed client clock or timezone cannot produce a different number for each user
- [ ] Recompute on tab focus, in case the app was left open across midnight

### 11.2. Derived Anniversaries

- [ ] **Derive them from `RELATIONSHIP_START_DATE`** — no database rows, no user input
  - [ ] Every 100 days (100 / 200 / 300 …)
  - [ ] Yearly anniversaries (1 year, 2 years …)
- [ ] Mark them in the month grid distinctly from ordinary events
- [ ] Show **days remaining until the next anniversary** beneath the D-day header

### 11.3. Month View

- [ ] Event markers in day cells
- [ ] Swipe left/right to change month; a "jump to today" control
- [ ] Tapping a day opens that day's event list in a `BottomSheet`
- [ ] Timezone pinned to `Asia/Seoul` on both server and client

### 11.4. Event CRUD

- [ ] Create / edit / delete — title, description, start and end time, all-day flag, color, recurrence (`none` | `yearly`)
- [ ] Both users can **view and edit every event**; there are no permission tiers
- [ ] Show authorship via `events.created_by` (avatar or color)

### 11.5. Sharing Features

Include only what genuinely pays off for exactly two users. General-purpose calendar features — invitations, RSVP, permissions, external calendar sync — are **not adopted**: with two mutually trusting users they are pure complexity.

- [ ] **Event `scope`** — `shared` (ours) or `mine` (my personal schedule)
  - [ ] Defaults to `shared`
  - [ ] `mine` events are still **visible** to the other user — this is a distinction, not a privacy control. The point is to communicate "I'm busy that day"
  - [ ] Distinguish them in the month grid by marker shape (filled dot for `shared`, ring dot for `mine`)
- [ ] **Post a system message to the Chat tab when an event changes**
  - [ ] Adds `messages.type = 'system'` — e.g. `지희님이 8월 10일 '영화 보기' 일정을 추가했어요`
  - [ ] **Do not bake the name into the stored text.** Store only `sender_id` and the action kind, and **compose the sentence at render time from `users.nickname`**, so renaming updates past system messages too (§8.7)
  - [ ] Post on create, time change, and delete. Do not post when only the title or description changed
  - [ ] This rides the existing SSE pipeline, so it costs **no additional infrastructure** — both users see the change immediately even with no notifications configured
  - [ ] Render as a centered pill with no bubble (same treatment as the date divider — DESIGN §6.4, §6.5)
  - [ ] Tapping it navigates to the event
- [ ] **Upcoming-events card** — directly under the D-day header, summarizing the next one or two events. Hidden entirely when there are none
- [ ] **A dot on the Calendar tab-bar icon when there is an event today** (a single dot, not a count badge)
- [ ] **Empty state** for a day with no events (DESIGN §7.6)

### 11.6. Notifications

- [ ] **Undecided (§18 #8)** — feasibility and constraints are documented in §16.1. Do not start work before the user decides

---

## 12. Settings Tab

- [ ] Profile — change nickname, upload/change profile image (via R2)
  - [ ] The nickname set here is exactly what appears as the sender name in chat and inside system-message sentences (§8.7)
  - [ ] Initialized from the Google account name at first login, then owned by the user
- [ ] Entry point to the emoticon settings screen
- [ ] List of logged-in devices, with per-session revocation
- [ ] Log out
- [ ] The theme setting is **hidden until the dark theme ships**
- [ ] App info / version

---

## 13. Emoticons

- [ ] Emoticon assets are plain image files, **supplied manually** and uploaded to R2
- [ ] An admin script to register packs and items (`scripts/seed-emoticons.ts`)
- [ ] Per-pack **enable / disable** toggle in Settings
- [ ] **Reorder packs** in Settings (drag and drop)
- [ ] The chat emoticon picker shows only enabled packs, in the configured order, as bottom tabs
- [ ] Selecting an emoticon sends it immediately (a `type: "emoticon"` message)
- [ ] A "recently used" section
- [ ] Preload / cache emoticon images so the picker does not stutter when opened

---

## 14. Security and Index Blocking

- [x] `app/robots.ts` — `Disallow: /` for every user agent. `robots.txt`, `/icons/*`, and the manifest MUST stay out of the proxy matcher, or a crawler gets a redirect to `/login` instead
- [x] Root layout metadata — `robots: { index: false, follow: false, nocache: true }`
- [x] `next.config.ts` headers — `X-Robots-Tag: noindex, nofollow, noarchive` on every path
- [x] **Do not generate a sitemap**
- [x] Security headers — `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`
- [ ] Every API route validates the session (401 when unauthenticated)
- [ ] Upload MIME/extension allow-list and a size cap
- [ ] Rate-limit the login callback endpoint
- [ ] Error responses must not leak internal details

---

## 15. Deployment

- [ ] Connect the Vercel project to the private GitHub repository
- [ ] Custom domain `jandh.jeheecheon.com` + DNS CNAME + automatic HTTPS
- [ ] Environment variables
  - `DATABASE_URL`, `DATABASE_URL_DIRECT`
  - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
  - `ALLOWED_EMAILS`
  - `RELATIONSHIP_START_DATE` (ISO `YYYY-MM-DD`, §11.1)
  - `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`
  - `APP_URL`
- [ ] Configure `maxDuration` for the SSE stream function
- [ ] Include `lint:steiger` in `pnpm build` so architecture violations fail the deploy
- [ ] Separate dev and production databases using Neon branches

---

## 16. Later (not implemented now)

- [ ] Dark theme — fill in the `.dark` block in `theme.css`, remove `forcedTheme`, reveal the toggle in Settings
- [ ] Offline caching (the caching role of a service worker — separate from push)
- [ ] Data backup / export

### 16.1. Push Notifications — Research Findings

**Conclusion: feasible.** Two constraints apply, and one of them reverses an existing decision (§7, "no service worker"). Whether to proceed is §18 #8.

**Constraint 1 — a service worker is mandatory**

- iOS supports Web Push from **16.4 onward**, but **only for PWAs added to the home screen**. It does not work in a Safari tab
- Displaying a notification requires the service worker's `showNotification`, so a service worker must be introduced
- However it can be scoped to a **push-only service worker** — offline caching does not have to come with it, and caching is the main source of hard-to-debug behaviour, so keep them separate
- The permission prompt must be triggered **inside a user gesture** (a button tap). Automatic requests are rejected
- Deleting the app from the home screen destroys the subscription, so re-subscription handling is needed

**Constraint 2 — only event-driven notifications are in scope**

Serverless has no process that wakes up at a specific time, so **any notification requiring a scheduler is excluded**.

| Notification kind                  | Feasibility                                       | Verdict                                                                              |
| ---------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------ |
| New message arrived                | Sent at message INSERT time — no scheduler needed | **Candidate**                                                                        |
| Reminder N minutes before an event | Requires a minute-granularity polling cron job    | **Excluded** — see below                                                             |
| Morning digest of today's events   | Requires a once-daily cron                        | **Excluded** — same infrastructure reasoning; the DB load itself would be negligible |

**Why minute-granularity cron is excluded** (the reason is operational, not cost — Cloudflare Workers Cron Triggers are free):

- **It defeats Neon's autosuspend.** Polling every 5 minutes is close to the autosuspend idle window, so it effectively keeps the compute awake 24/7. §8.4 closes the SSE stream when the tab backgrounds _specifically_ to let autosuspend happen, and a cron would nullify that design. The query count itself (288/day) is negligible — the **wake pattern** is the problem
- Deployment targets grow from one to two (Vercel + Cloudflare), plus a shared secret for worker→API calls
- If the cron silently stops, nothing errors — notifications just stop arriving, so it goes unnoticed indefinitely
- Duplicate-send suppression needs its own state tracking

So even if push is adopted, only **"new message arrived"** is implemented. Awareness of calendar changes is handled by the **chat system messages** in §11.5, which work over SSE with no cron; with new-message push enabled, those system messages are themselves delivered as push, which covers event-change notification in practice.

**What adoption would additionally require**

- A `push_subscriptions` table — `id`, `user_id`, `endpoint` (unique), `p256dh`, `auth`, `user_agent`, `created_at`, `last_success_at`
- A VAPID key pair → env `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`
- The `web-push` library
- Automatic subscription cleanup when a send fails with 410 Gone
- A notification on/off toggle in Settings
- Optional: home-screen icon badging via `navigator.setAppBadge`

---

## 17. Implementation Order

1. Project setup + FSD scaffolding + design tokens + base components (§1–§4)
2. **Auth + session + real-device iOS PWA verification** (§5) — highest-risk area, so it goes first
3. Database schema + migrations (§6)
4. Layout + tab bar + PWA manifest (§7)
5. Chat tab — static UI → message CRUD → infinite scroll → SSE → read receipts → search and jump (§8)
6. R2 media pipeline + sending images in chat (§9)
7. Gallery tab (§10)
8. Emoticons (§13)
9. Calendar tab (§11)
10. Settings tab (§12)
11. Security headers + index blocking + deployment (§14, §15)

---

## 18. Undecided — Ask, Do Not Guess

The following are **deliberately left open**. When work reaches the relevant feature, confirm with the user and then update this document.

| #   | Item                                                                                                                              | Needed by                       | Notes                                                                                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | What happens to the chat message when an image is deleted from the gallery — delete it too, or keep a "deleted photo" placeholder | Gallery tab (§10)               | Affects the schema (whether `media.deleted_at` is needed)                                                                                                                      |
| 2   | How emoticon image assets are sourced, and how packs are composed                                                                 | Emoticons (§13)                 | The picker grid cannot be designed until the assets' aspect ratios are known                                                                                                   |
| 3   | Emoticon picker dimensions — panel height, pack tab bar, grid density                                                             | Emoticons (§13)                 | DESIGN.md §9                                                                                                                                                                   |
| 4   | Calendar event color set (6–7 warm tints that do not clash with the accent)                                                       | Calendar (§11)                  | DESIGN.md §9                                                                                                                                                                   |
| 5   | Motion duration / easing token scale                                                                                              | When animation work starts      | Currently only the 1.5s search flash and the tab `scale-[0.96]` are specified. DESIGN.md §9                                                                                    |
| 6   | Image viewer gesture parameters — pinch zoom bounds, swipe threshold                                                              | Gallery / viewer                | Must be tuned on a real device. DESIGN.md §9                                                                                                                                   |
| 7   | Dark palette hex values                                                                                                           | When the dark theme ships (§16) | Hand-tune; never arithmetically invert. DESIGN.md §5.4                                                                                                                         |
| 8   | **Whether to adopt push notifications (new-message only)**                                                                        | After the calendar              | Research complete, §16.1. Adopting it reverses the "no service worker" decision in §7. **Time-based notifications are confirmed out of scope because they require a cron job** |
| 9   | Whether a `scope = 'mine'` event shows its **title** to the other user, or only "busy"                                            | Calendar (§11.5)                | Currently specified as showing the title                                                                                                                                       |
| 10  | Maximum images per message, and the grid layout beyond that count                                                                 | Chat images (§8.1) / R2 (§9)    | KakaoTalk caps a single send at 30. Determines the `+N` overflow treatment on the grid and the upload concurrency limit. DESIGN.md §9                                          |
