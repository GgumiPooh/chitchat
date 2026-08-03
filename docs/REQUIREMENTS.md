# J&H — Implementation Requirements

A private web app used by exactly two people. An iOS PWA with four tabs: Chat, Calendar, Gallery, Settings.

- **App name**: J&H · **Project folder**: `jandh` · **Domain**: `jandh.jeheecheon.com`
- **Users**: 2 (fixed, never grows) · **Repository**: GitHub Private
- **Reference project**: `~/Projects/everytldr/everytldr.com/frontend`

> **Language note**: This document is English because LLM comprehension is better in English. **All user-facing copy in the product is Korean.** Korean string literals here (`오늘`, `새 메시지 3`, …) are the literal UI text to ship — never translate them into English in code.

## Document Map

| Document                                                | Role                                                                                                                   |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `docs/REQUIREMENTS.md` (this file)                      | **What we build** — feature requirements, architecture decisions, schema, API shapes, implementation order             |
| `docs/DESIGN.md`                                        | **How it looks** — design tokens (single source of truth for hex values), component visual specs, chat screen geometry |
| `AGENTS.md` (repo root; `CLAUDE.md` is a symlink to it) | **How we write it** — coding conventions, component contracts, prohibitions                                            |

Precedence on conflict: visual specs → `DESIGN.md`; code-authoring rules → `AGENTS.md`; everything else → this file.

## Reading This Document

Sections marked **✅** are **implemented**; they are kept only as the invariants new code must not break, not as work to do. Sections with `[ ]` checkboxes are **the work that remains** and are the authoritative spec for it. Tick a checkbox in the same change that lands it (`AGENTS.md § 0.3.`).

**Current state** — steps 1–4 of § 17. are done. Step 5 (chat) is partly done: text and system bubbles, cursor pagination, virtualization, optimistic send, copy/delete, and **live delivery over SSE (§ 8.4.)** — `GET /api/chat/stream`, `GET /api/users`, the client subscription, the background-close, and the resume catch-up all landed together with § 8.7.'s render-time name resolution. Open in chat: read receipts (§ 8.8. — `POST /api/chat/read` and the `1` marker), search and jump (§ 8.6.), image and emoticon bubbles (steps 6 and 8). Calendar and Gallery render an empty state until their own step.

---

## 0. Settled Technical Decisions ✅

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

---

## 1. Project Setup ✅

Next.js 16.2.12 + `pnpm` + Turbopack, private repo `GgumiPooh/jandh`, local Postgres via `docker-compose` (`pnpm db:up`) with Neon in production. Config inherited verbatim from the reference project: `tsconfig` (`@/*` → `./src/*`, `verbatimModuleSyntax`, `strict`), `eslint.config.mjs`, `.prettierrc` (`printWidth: 100`), `steiger.config.ts`, `postcss.config.mjs`, `components.json` (shadcn `new-york`, `@/shared/ui`, `@/shared/lib`, lucide), the SVGR turbopack rule, and Pretendard Variable as a local font. `pnpm lint` runs eslint then steiger; `pnpm dev` runs the app and steiger `--watch`.

**Deliberately excluded** — do not reintroduce: all i18n (`next-intl`, `[locale]` routing, `messages/`, the `:lang(ko)` block, `Translation`), `orval` (Next _is_ the backend), `msw`, every ads / analytics / RSS / structured-data / sitemap file, and the `rewrites` backend proxy.

**Available dependencies**: `drizzle-orm`, `postgres`, `arctic`, `jose`, `@aws-sdk/client-s3` + `s3-request-presigner`, `zod`; `radix-ui`, `cva`, `clsx`, `tailwind-merge`, `tw-animate-css`, `lucide-react`, `sonner`, `vaul`, `next-themes`, `@tanstack/react-query`, `react-error-boundary`, `react-intersection-observer`, `react-virtuoso`, `lodash-es`, `react-use`.

---

## 2. FSD Structure ✅

```
app/                     Next routes — kept thin, delegate to src/pages
  (auth)/login/
  (main)/{chat,calendar,gallery,settings}/
  api/{auth,chat,media}/
  robots.ts  manifest.ts  icon.svg  favicon.ico
pages/                   EMPTY SENTINEL — see below. No route files here
proxy.ts                 Next 16's renamed Middleware (§ 5.2.)
src/
  app/       providers / styles(globals.css, theme.css) / fonts
  pages/     login, chat, calendar, gallery, settings
  widgets/   tab-bar, install-guide, chat-room,
             gallery-grid, calendar-month, settings-form
  features/  session, send-message, upload-media, mark-read,
             emoticon-prefs, update-profile, manage-event
  entities/  user, conversation, message, media, event, emoticon
  shared/    db, auth, storage, api, config, lib, theme, ui
```

Rules that constrain where new code goes:

- The session slice is `session`, not `auth` — `features/auth` collides with the `shared/auth` segment name (`fsd/ambiguous-slice-names`)
- The composer and the emoticon picker are **`features/send-message/ui/…`, not widgets**. `widgets/chat-room` owns the chat surface and renders them inside itself, which a sibling widget cannot be (`fsd/forbidden-imports` bans same-layer imports)
- A client module imports from `@/entities/message` with `import type` **only** — its api segment is `server-only`, and a value import through the barrel drags that into the browser bundle. This is why the chat row components and the grouping model live in `widgets/chat-room`
- Root-level `pages/` MUST exist and stay empty (README only). Without it Next treats `src/pages/` as the Pages Router and the build breaks
- Server-only code lives in `shared/` segments and imports `server-only`; entity data fetching lives in each entity's `api` segment; every slice is imported through its `index.ts` (eslint-enforced)

---

## 3. Shared Utilities (`src/shared/lib`) ✅

`nullish.ts` (`Maybe` / `Nullable` / `Optional`), `safely.ts`, `assert.ts`, `class-name.ts` (`cn`), `time.ts` (`A_SECOND` / `A_MINUTE` / `AN_HOUR` / `A_DAY` + Korean-locale date formatters), `dom.ts`, `use-hydrated.ts`, `use-is-coarse-pointer.ts`, `use-is-virtual-keyboard-open.ts` — all re-exported from the barrel.

- **`cn` is built with `extendTailwindMerge`, and every custom token scale has to be declared there.** An undeclared one is not merged badly, it is not merged at all: `cn("px-md", "px-0")` emits both classes and stylesheet order decides, silently ignoring the call-site override. Adding a new `--text-*` / `--spacing-*` scale to `theme.css` means adding it here too

---

## 4. Design System and Theming ✅

`globals.css` imports tailwind + `tw-animate-css` + `theme.css` and defines `@custom-variant dark`. `theme.css` declares `--color-*: initial` first, which **removes Tailwind's default palette from the build** and structurally prevents raw color utilities; semantic tokens, the chat-only tokens, `--text-*`, `--radius-*`, `--spacing-*`, `--shadow-*` follow. **`DESIGN.md § 4.` is the single source of truth for hex values and each token's role — never duplicate a value into this file.** The `.dark { }` block exists as an empty shell, and `shared/theme/provider.tsx` is pinned light via `forcedTheme="light"` (dark ships by deleting that one line). Icons: `lucide-react` first; custom marks are `.svg` through SVGR, re-exported from `shared/ui/index.ts`.

### 4.1. Responsive Policy — One Mobile UI ✅

**Build exactly one UI: the mobile one.** Never branch layout or swap components on viewport width; desktop shows the same UI centered in a narrow column. The reference's `ResponsiveDialog` / `ResponsiveSelector` / `ResponsiveActionMenu` are **not** ported. Pointer support is nevertheless mandatory on every interactive element: real `click` handlers plus `hover:`, `active:`, and `focus-visible:` states. `useIsCoarsePointer` is for interaction details only, never layout.

### 4.2. Page Width and Centering ✅

App shell max width is **`576px`**, held in the `--container-app` token, so the four-item tab bar cannot stretch across a desktop screen. `Container` sizes: `md` (default) = app width, `sm` = `448px`, horizontal padding `px-md`. Outside the shell the page uses `backdrop`, a tone darker than `canvas`, so the shell reads as a held device. `--tab-bar-height` and `--app-header-height` live in `theme.css` outside `@theme`. Full-height screens honour `env(safe-area-inset-*)` and never restate a viewport height — the `(main)` layout owns the column height and screens are `flex-1` inside it.

### 4.3. Visual Viewport and the Keyboard

Landed. The full rules live in `AGENTS.md § 4.4.` and `DESIGN.md § 3.4.`–`§ 3.5.`; what a new screen must respect:

- The shell is the app's **one** `fixed` element, sized to the **visual viewport** (`VisualViewportSync` → `--viewport-height` / `--viewport-top`). Do not add a second `fixed` element — it would drift against the keyboard on WebKit
- The document must never scroll (`html, body` are `h-full overflow-hidden overscroll-none`); a document taller than the visual viewport is what lets WebKit pan the header off-screen. Screens scroll inside `#app-scroll` (`APP_SCROLL_ID`) or their own container, and `ScrollMemory` / `ScrollReset` address that container, never `window`
- The header and bars **float over** the content — `sticky` header, absolute `BottomOverlay`, whose measured height becomes the scroller's `--bottom-inset` bottom padding. They share the single `glass` utility in `globals.css` so they cannot drift apart, and every floating strip is `pointer-events-none` at its root, re-enabling it only on the visible surface
- **Nothing may depend on `interactiveWidget: "resizes-content"`** (Chromium/Firefox only, ignored by all of iOS), and `env(safe-area-inset-bottom)` is not a keyboard inset — it reports the home indicator and does not move when the keyboard opens
- [ ] Real-device pass (§ 5.3.) — the keyboard-open geometry is reasoned through but unverified on an iPhone

### 4.4. Base Components (`src/shared/ui`) ✅

Shipped: `Button`, `IconButton`, `Input`, `Textarea`, `Drawer` (vaul), `Dialog` (radix), `BottomSheet`, `Modal`, `ActionSheet`, `Badge`, `Chip`, `Skeleton`, `Container`, `ScrollableRow`, `ScrollReset`, `ScrollMemory`, `AppHeader`, `EmptyState`, `Toaster` / `toast`, `RelativeTime`, `Avatar` — all re-exported from the barrel.

- New primitives come from shadcn first, then have **every** visual decision rewritten against `DESIGN.md` and are refactored to the `AGENTS.md § 1.` props contract
- `Drawer` and `Dialog` are composition primitives and are **never used directly in screen code**. Every overlay in `shared/ui` is finished and props-driven (`isOpen`, `header`, `onClose`, `children`; `ActionSheet` takes `items: { label, icon, variant, onSelect }[]`), composing the primitives internally

---

## 5. Authentication

### 5.1. Google OAuth ✅

`GET /api/auth/login/google` (arctic `state` + PKCE in cookies), `GET /api/auth/callback/google` (code exchange, `id_token` verified with `jose`, `state` and verifier checked, `email_verified === true` required, email lowercased and matched **exactly** against `ALLOWED_EMAILS`), `POST /api/auth/logout`. Google Cloud consent screen stays in "Testing"; redirect URIs are `http://localhost:3000/…` and `https://jandh.jeheecheon.com/…`.

- The `users` lookup key is **`google_sub`, not the email** — Google lets an account change address, and matching on email would collide with the existing row's unique `google_sub`
- **Google OAuth only.** No provider abstraction, no `[provider]` dynamic segment, no password login

### 5.2. Session ✅

A 32-byte random token is stored **hashed** in `sessions.token_hash`; only the raw token goes in the cookie (`httpOnly; Secure; SameSite=Lax; Path=/; Max-Age=180 days`). Sliding renewal updates `last_seen_at` and extends expiry at most once a day per device, and the proxy re-issues the cookie with a fresh `Max-Age` on every page request — without that the row's new expiry is invisible to the browser, which drops the cookie 180 days after login however active the user was. The lookup is memoized per request with React `cache()`.

- **Never use localStorage for auth state** — iOS ITP can evict script-written storage after 7 days of non-use; a server-set cookie is exempt
- `proxy.ts` (Next 16 renamed Middleware to Proxy: file at the repo root, exporting `proxy`) checks **only whether the cookie exists**. Real DB validation happens in Server Components / Route Handlers. Unauthenticated → `/login`; authenticated on `/login` → `/chat`
- A cookie that exists but no longer validates is unwound through `GET /api/auth/session/expire`, which clears it and lands on `/login`. A Server Component cannot write cookies, so redirecting it straight to `/login` bounces off the proxy forever. That route re-checks the session and refuses to clear a valid one — a cross-site `<img src>` reaches it with the cookie attached

### 5.3. iOS PWA Verification (highest priority)

- [ ] Verify **on a real device** that the Google login redirect from a home-screen standalone PWA returns to the app correctly
- [ ] Verify the session cookie survives across days of non-use (re-check after several days)

---

## 6. Database Schema (Drizzle) ✅

The schema, migrations, triggers, and seed have landed. What follows is the contract new code is written against.

**Tables**

- `users` — `id`, `email` (unique), `google_sub` (unique), `nickname`, `avatar_media_id`, `last_read_at`, `created_at`. There is no `accounts` table (one provider) and **no `conversation_members` table**
- `sessions` — `id`, `user_id`, `token_hash` (unique), `device_label`, `created_at`, `last_seen_at`, `expires_at`
- `conversations` — the single conversation (`id`, `created_at`)
- `messages` — `id` (bigserial; the ordering and cursor key), `conversation_id`, `sender_id`, `type` (`text` | `image` | `emoticon` | `system`), `text`, `emoticon_item_id`, `event_id`, `system_action` (`event_created` | `event_rescheduled` | `event_deleted`), `event_title`, `event_starts_at`, `client_msg_id` (uuid, unique), `created_at`, `deleted_at`
- `message_media` — `message_id` (FK → `messages.id`, `ON DELETE CASCADE`), `media_id` (FK → `media.id`), `sort_order` (smallint), PK (`message_id`, `sort_order`)
- `media` — `id` (uuid), `owner_id`, `r2_key` (unique), `mime`, `size`, `width`, `height`, `blurhash`, `taken_at`, `created_at`
- `events` — `id`, `title`, `description`, `starts_at`, `ends_at`, `all_day`, `color`, `recurrence` (`none` | `yearly`), `scope` (`shared` | `mine`), `created_by`, `created_at`, `updated_at`
- `emoticon_packs` — `id`, `name`, `thumbnail_key`, `created_at`
- `emoticon_items` — `id`, `pack_id`, `r2_key`, `width`, `height` (**required** — the virtualizer must reserve the box before the asset loads, § 8.3.), `sort_order`
- `user_emoticon_prefs` — `user_id`, `pack_id`, `enabled`, `sort_order`, PK (`user_id`, `pack_id`)

**Invariants that new code must not break**

- **Two participants, permanently.** `ALLOWED_EMAILS` gates the only row-creating path, so membership and identity are the same set — that is why the members join is gone. A third participant would need `conversation_members` back **and** a rewrite of § 8.8. (unread becomes a count of readers, not a boolean, which reaches into the `1` marker and the unread divider in `DESIGN.md § 7.`). A `users` row that is not a participant (a test or retired account) breaks `GET /api/users` (§ 8.4.) the same way — keep such rows out of this database
- `users.last_read_at` has **no default**, so every insert names a value. § 8.8. reads unread as `created_at > last_read_at`, and a `defaultNow()` would silently mark everything sent before that person's first login as read. The one insert site (`upsertGoogleUser`) passes the epoch
- `conversations.id` is pinned by a CHECK to the fixed `CONVERSATION_ID` constant in `shared/config`, so nothing is queried to address it and no insert can open a second conversation. `ensureConversation` runs at login as well as in the seed, so a deployment that skipped the seed does not fail every message insert on its FK
- `messages` is **append-only** — marking messages read must never UPDATE it
- A CHECK pins which columns each `messages.type` may fill (a `text` row carries no `emoticon_item_id` or event; a `system` row carries no text). The CHECK cannot reach `message_media`, so "a non-`image` message must not acquire media children" is a `BEFORE INSERT OR UPDATE` **trigger** on `message_media`. The reverse (an `image` message with zero media rows) is deliberately **not** enforced — it would need a `DEFERRABLE` constraint trigger, and the § 8.5. send path writes both in one transaction
- **Never store an R2 URL in any table.** Presigned URLs expire in minutes (§ 9.); store ids and mint the URL per request
- **One bubble is one `messages` row regardless of image count** — 3 photos at once is 1 message row + 3 `message_media` rows, which is why there is no `messages.media_id`. `sort_order` preserves the sender's order. `media_id` does not cascade (§ 18. #1 decides what a gallery delete does) and carries its own index, since the PK does not support lookups by media
- `messages.event_id` is `ON DELETE SET NULL`; the `event_title` / `event_starts_at` snapshot is what § 11.5. composes its sentence from, because a delete notice outlives its `events` row. Only the **user name** is resolved at render time (§ 8.7.)
- `events.ends_at` is NOT NULL — the create form defaults it rather than admitting an open-ended event, which would need its own branch in every month-grid calculation. `color` is nullable until § 18. #4. **Recurrence is yearly-only** (anniversaries); do not introduce RRULE or any general recurrence engine — project `yearly` rows onto the requested year on read. The relationship start date, 100-day marks, and yearly anniversaries are **not rows** here (§ 11.2.)
- Indexes: `messages(conversation_id, id DESC)`, `media(created_at DESC, id DESC)`, `message_media(media_id)`, `events(starts_at)`, `sessions(token_hash)`, plus `pg_trgm` + a GIN trigram index on `messages.text` (§ 8.6.). The `media` index needs the `id` tiebreaker because `created_at` is the **transaction** timestamp, so a multi-image send's rows compare equal and a keyset page would skip or repeat them — **paginate on the pair, never on `created_at` alone**
- Triggers: `AFTER INSERT` on `messages` fires `pg_notify('new_message', { id, conversationId })`; `AFTER INSERT` **and** `AFTER UPDATE` on `users` fire `pg_notify('user_changed', '')`. Payloads are minimal on purpose — `NOTIFY` caps at 8000 bytes and § 8.4. refetches rather than trusting a payload. Two user triggers, not one, because a `WHEN` clause cannot reference `OLD` on an INSERT, so `WHEN (OLD.* IS DISTINCT FROM NEW.*)` rides the UPDATE trigger alone. That guard plus § 8.8.'s `WHERE last_read_at < $new` is what keeps the channel quiet under the app's highest-frequency write — **both halves are load-bearing**; dropping either puts a `GET /api/users` on every throttle tick
- Two connection strings: `DATABASE_URL` (pooled, normal queries) and `DATABASE_URL_UNPOOLED` (**required** for `LISTEN` and for migrations)
- Participants are never seeded — a `users` row exists only after that person's first login. The extension, trigram index, and triggers live in hand-written (`--custom`) migrations, since drizzle-kit cannot infer them
- **`pnpm db:migrate` is manual and decoupled from the deploy: ship the code first, migrate second.** In the other order a first login against the previous build inserts without the new column, hits `23502`, and the OAuth catch flattens it into the generic `?error=failed` copy — nothing in the UI says which column

---

## 7. Layout, Tab Bar, PWA ✅

The `(main)` layout is the app shell (max `576px`, centered) holding a per-screen top header, the content, and the bottom tab bar. Four tabs — `채팅` / `캘린더` / `갤러리` / `설정` — with icon + label, colour-only active state, hover/active styling, and `env(safe-area-inset-bottom)` honoured.

- The layout is the **only** place a screen's session is resolved (`requireUserOrRedirect`, `AGENTS.md § 6.4.`); a page re-reads it only when it needs the row, and `cache()` makes that free
- The header is per-screen, not layout-owned, because it carries screen-specific actions — screens render `AppHeader` themselves
- `ScrollMemory` preserves each route's position across tab switches, keeping it in **module scope** rather than `sessionStorage` — a tab switch is a client navigation, a reload is meant to start at the top. Its timing quirks are load-bearing and documented at the source. **Chat is exempt**: its scroll belongs to the virtualizer (`restoreStateFrom`, § 8.3.)
- `app/manifest.ts`: name `J&H`, `display: "standalone"`, `theme_color`, `background_color`, icons 180/192/512 + maskable, generated by `pnpm icons` from a **path-only** wordmark (an SVG `<text>` icon renders in whatever font the machine has) and committed under `public/icons`. That path is excluded from the proxy matcher — a redirect to `/login` while fetching an icon breaks the install prompt. iOS reads `apple-touch-icon` from the markup, so the root layout's `metadata.icons.apple` is what "Add to Home Screen" actually uses
- `widgets/install-guide` is a dismissible "Add to Home Screen" banner above the tab bar, shown only in an iOS **browser tab** (iPadOS 13+ reports a Macintosh UA, so the check needs `maxTouchPoints`). Its dismissal flag is in `localStorage` — § 5.2. bans that for auth state only — and every access goes through `safelyRun` / `safelyGet`, since blocked storage throws and the banner renders in the `(main)` layout, which would fail hydration on all four tabs
- **Offline support is out of scope — no service worker.** If push is adopted, a **push-only** service worker becomes necessary (§ 16.1., § 18. #8); even then, do not add caching
- [ ] The Chat tab's unread badge resolves once per full page load, and a PWA resume is not one. Making it live is § 8.8., which needs SSE

---

## 8. Chat Tab (KakaoTalk-style)

> **Only layout and interaction rules are taken from KakaoTalk.** Its colors and shapes (Kakao yellow, the sky-blue background, drawn bubble tails) are **not** — see `DESIGN.md § 2.2.` and `§ 6.`, which is the single source of truth for every visual spec below.

### 8.1. UI

Landed: notch-corner bubbles (mine right, theirs left), avatar + nickname on the first message of their group, one timestamp per same-minute group on its last message, date divider pills (`오늘`, `어제`, `2026년 8월 3일 월요일`), the auto-growing composer with `+` and emoticon toggle (both **disabled** until steps 6 and 8; the send button replaces the toggle once the field is non-empty), long-press / right-click → `ActionSheet` (copy / delete), and the scroll-to-bottom button appearing ~200px from the newest message with an incoming count (`새 메시지 3`).

- A hardware keyboard sends on Enter and breaks the line on Shift+Enter; on a coarse pointer Enter stays a newline — the iOS keyboard has no send key (`useIsCoarsePointer`)
- Tapping send keeps the keyboard open: the button cancels `pointerdown` so the tap never blurs the field, and `submit` refocuses inside the click gesture
- `DELETE /api/messages/{id}` soft-deletes, scoped to the sender, and answers **404** for someone else's message and for one that never existed alike, so the endpoint cannot probe ids (§ 14.)
- The tab bar and install banner stay hidden while the keyboard is up — the shell shrinks to what the keyboard leaves and neither is worth 56px of it. `useIsVirtualKeyboardOpen` detects that from a drop below the tallest height seen at the current width **and** an editable `activeElement`: height alone misreads a collapsing address bar, focus alone survives Android's back button

Remaining:

- [ ] Unread marker — a `1` beside my message, in the `unread` token (DESIGN § 4.1.4.)
- [ ] Image messages render **without a bubble**; tapping opens a fullscreen viewer (pinch zoom, horizontal swipe)
  - [ ] Multiple images sent together are **one bubble** (§ 6.) — branch on array length alone: 1 image keeps its own `media.width` / `height` aspect ratio, 2+ use a fixed square-cell grid
  - [ ] The grid makes § 8.3. box reservation **more** accurate, not less: the height follows from the cell layout, independent of the individual images' dimensions
  - [ ] Tapping any image opens the viewer at that index, swiping through the rest of the same bubble
- [ ] Emoticon messages render as the image alone, without a bubble
- [ ] Tapping the scroll-to-bottom button scrolls smoothly to the bottom **and marks messages read**
- [ ] The same button also returns the user to the newest messages after a search jump (§ 8.6.1.)

### 8.2. Message Loading

Landed: cursor-based infinite scroll, `GET /api/messages?before={id}&limit=30` (`WHERE id < :before ORDER BY id DESC`), plus the `after={id}` and `around={id}` endpoints, whose callers are § 8.4. and § 8.6.1.

- **No OFFSET pagination, ever** — incoming messages shift page boundaries, producing duplicates and gaps
- [x] `newestKnownId` is tracked alongside the live `oldestLoadedId` and only ever moves forward, so a delete cannot walk it back and make § 8.4.'s catch-up refetch what was already seen

### 8.3. Virtual Scrolling (Windowing)

Offscreen message nodes **must not stay in the DOM**. After a few years of history, thousands of infinite-scrolled nodes will destroy scroll performance in iOS Safari. `react-virtuoso` is in place: `startReached` for upward loading, `firstItemIndex` decrement for jump-free prepends, `followOutput="smooth"` for bottom-stickiness, `atBottomStateChange` for the scroll-to-bottom button, `scrollToIndex({ align: "center" })` for search jumps, automatic variable-height measurement, and tuned overscan.

- **Do not use `flex-direction: column-reverse`** — the virtualizer owns scroll anchoring and the two cannot coexist
- **Two traps, both of which render an empty list with no error**: `initialTopMostItemIndex` MUST be a constant (a live `rows.length - 1` re-runs initial positioning on every prepend); and the scroller is `height: 100%` inline, so its parent needs a **definite** height — a `flex-1` column is not one, the list must sit in an `absolute inset-0` box inside it
- That constant is latched at the first render that **has rows**, not the first render. An empty room renders the § 6. empty state and mounts no list at all, so a value fixed with `useState(() => rows.length - 1)` is `0` — and when § 8.4.'s catch-up later fills the room, the list mounts at the _oldest_ arriving message with the newest below the fold
- [ ] **Reserve the box for image messages before the asset loads** — render an aspect-ratio box from `media.width` / `height` first. Without it every image load triggers a re-measure cascade and the scroll jolts
- [ ] Date dividers are list items (done), but the **sticky top indicator is a separate overlay** computed from the visible range — not built yet
- [ ] Restore scroll position when returning to the tab (`restoreStateFrom`)
- [ ] The browser's native `Ctrl+F` cannot find offscreen messages — in-app search (§ 8.6.) is the deliberate replacement

### 8.4. Realtime (SSE) ✅

Landed in full. `GET /api/chat/stream` holds one unpooled connection on both channels, replays from `Last-Event-ID`, and heartbeats; the client subscribes with a single `EventSource`, closes it on background, and catches up on every return. What follows is the contract new code must not break.

- `GET /api/chat/stream` — `text/event-stream`, `runtime = "nodejs"`, `maxDuration = 300`
  - The connection comes from the **direct (unpooled)** string via `listenToChannels` (`shared/db`) and is released in a `finally` block. A transaction-mode pooler hands the connection to another client between transactions, silently dropping the `LISTEN`
  - **One endpoint, one `EventSource`, two channels.** `LISTEN user_changed` rides the connection the stream already holds — it is not a second stream. The two are told apart by the SSE `event:` field, `event: message` and `event: user`
  - `LISTEN` is registered **before** the replay query runs. In the other order a message committing between the two is missed by both — the query cannot see it yet and nothing is listening for it
  - **`id > cursor` alone loses messages.** `bigserial` ids are handed out at INSERT but become visible at COMMIT, so they can commit out of order: if the transaction holding id 10 is still open when id 11 commits and streams, a client that advances to 11 never asks for 10 again. Replay therefore starts at `cursor - SSE_REPLAY_MARGIN` and lets id-deduplication drop the overlap
  - `id:` is populated on **`message` events only** — it is the reconnect cursor. **Never put an `id:` on a `user` event**: the cursor is a `messages` bigserial and a user has no counterpart, so a uuid there would hand the next reconnect a garbage replay bound. Omitting the field leaves the client's last-event-ID buffer untouched, which is exactly right — `user` events are not replayable and a reconnect refetches the whole set
  - Notifications are resolved **one at a time behind a promise chain**. Each costs a `getMessage` query, and letting them interleave emits rows out of id order
  - `:ping` comments at `SSE_HEARTBEAT_INTERVAL` keep proxies from timing the connection out
  - Replay is capped at `SSE_REPLAY_LIMIT`, and what falls past that cap is **not** the replay's problem to solve — the client's on-connect catch-up below pages from its own cursor, so a truncated replay costs a few extra requests rather than a hole. The same is true of a notification lost while `postgres.js` silently reconnects its `LISTEN` socket: `maxDuration` ends the invocation every five minutes, and the reconnect that follows runs the catch-up again
- `GET /api/users` — the whole participant set, **no cursor**. Serves three callers: first render, a `user` SSE event, and the resume catch-up
  - `listUsers` projects an explicit column set and `toParticipant` resolves the name before the response is built, so **`email` and `google_sub` never leave the server**. Never `SELECT *`: this payload reaches the browser verbatim and `google_sub` is the identity key § 5.1. matches on. `email` is read only because § 8.7.'s empty-nickname fallback is its local part, and applying that fallback server-side is what lets the address stay behind
  - A "changed since" cursor is **rejected**: unlike `messages` this is a small mutable set, not an append-only log — a rename produces no new row so an id cursor never fires, and an `updated_at` cursor would still miss a deletion. Two rows are cheaper to refetch whole
- The client subscribes with `EventSource` and relies on its automatic reconnection **for transport drops only**. A fatal error — a 401, or any body that is not `text/event-stream` — leaves `readyState === CLOSED` permanently, so `onerror` reopens by hand after `SSE_RETRY_DELAY` and the open path treats a `CLOSED` source as no source. Guarding on "a source object exists" instead would kill live delivery for the life of the page after one expired session. Handlers are read through a ref, so a new handler identity cannot tear the connection down and rebuild it on every render
- The stream is closed when the tab backgrounds, so Neon compute can autosuspend
- **Resume is the normal sync path, not an error path.** Because the stream is closed on purpose, every return to the app has missed events — and an iOS home-screen PWA restores the frozen page rather than navigating, so the Server Component render does not re-run and cannot cover this
  - The catch-up therefore hangs off **`onopen`, not `visibilitychange`** — every connect is a resume. A fresh `EventSource` sends no `Last-Event-ID` and so replays nothing, which leaves two gaps that only this closes: the one between the Server Component render and the moment the socket actually opens (bundle download plus hydration, seconds on mobile), and the one a reconnect leaves behind on a page that never received a live event to buffer an id from
  - It is `fetch(/api/messages?after=…)` paged until a short page, plus `fetch(/api/users)`
  - The cursor it pages from is a **local** copy of `newestKnownId`, advanced only by what the loop itself fetched. Read from the ref each round, a live event landing mid-loop would carry it past a page the fetch has not covered yet — and nothing asks for that range again
  - `after=0` is a **valid** cursor, not an absent one: a client whose window is still empty catches up from the start of the conversation. Falling back to the cursorless newest page instead strands everything behind it, unreachably — `hasOlder` is `false` on a short first page, so upward paging refuses to fetch it
- **Received messages are deduplicated by id**, and merged by sorting rather than appending — SSE replay and the catch-up fetch overlap by design, and an out-of-order commit can arrive behind a message the replay already delivered
- Multi-device needs no extra mechanism: `user_changed` is a conversation-wide broadcast, so "my other device" and "the other person's phone" are both just another subscriber, and a client receiving the echo of its own change refetches idempotently

### 8.5. Sending

Landed: the client generates `client_msg_id` (uuid) and renders optimistically; `POST /api/messages` uses `ON CONFLICT (client_msg_id) DO NOTHING` so a retry cannot duplicate a row; a retry affordance shows on failure.

- The re-read after a conflict is scoped to `sender_id` and `deleted_at IS NULL` and answers **409** when it misses. `client_msg_id` is unique table-wide rather than per sender, so matching on it alone would return the _other_ user's row and the client would swap its optimistic bubble for a stranger's message
- The message echoed back over SSE is matched to the optimistic entry by `client_msg_id` and replaces it. The echo routinely beats the response to the POST that created the row, so the pending bubble is retired on whichever arrives first

### 8.6. Message Search

**Why substring matching**: Postgres full-text search has no Korean morphological dictionary, and `'simple'` only splits on whitespace — Korean attaches particles (조사) to nouns, so `저녁` fails to match the stored `저녁을`. Korean-aware parsers (`mecab-ko`, `pg_bigm`) cannot be installed on Neon. **`pg_trgm` + `ILIKE`** is language-neutral and matches substrings, so the particle problem cannot occur.

- [ ] `GET /api/messages/search?q=&before=` — `type = 'text' AND deleted_at IS NULL AND text ILIKE '%' || $q || '%'`
- [ ] **Order by recency, not relevance** (`ORDER BY id DESC`) — chat search is "where was that thing we talked about", so BM25-style ranking gets in the way. This is also why no search engine is warranted
- [ ] Normalize the query — `lower()`, trim, escape `%` and `_`
- [ ] Cursor-paginate results (same mechanism as § 8.2.)
- [ ] Queries of ≤2 characters cannot use the trigram index and fall back to a sequential scan — acceptable at our scale (tens of thousands of rows)
- [ ] The header search button already exists in the chat screen; it is UI only until this lands

#### 8.6.1. Jumping From a Result to the Message (the hard part)

- [ ] Tapping a result navigates to chat and **scrolls to that message**, loading context via `GET /api/messages?around={id}&limit=30`
- [ ] **Reinitialize the infinite-scroll state around the jump point** — fresh `oldestLoadedId` / `newestKnownId` so the user can keep scrolling both ways from there
- [ ] Move with `scrollToIndex({ align: "center" })` and reset `firstItemIndex` accordingly (§ 8.3.)
- [ ] On arrival, **flash a highlight** behind the target bubble (fades after ~1.5s)
- [ ] Previous / next navigation between results, as in KakaoTalk; returning to the newest messages reuses the § 8.1. button
- [ ] Highlight the matched substring **client-side by splitting the string** — do not use `ts_headline`
- [ ] Image and emoticon messages are excluded from search
- [ ] Empty states for "no query yet" and "no results"

### 8.7. Display Names and Profiles

Landed, apart from the avatar image itself, which needs the § 9. media route (step 6).

- The name shown in chat is **the nickname each user set for themselves in Settings** (`users.nickname`, § 12.). The Google account name is only the first-login default. There is **no** feature for naming the other person (KakaoTalk's per-contact rename)
- **Never copy the name or avatar onto the message row.** The sender is resolved against the participant set at render time, so a rename **retroactively changes every past message** — including § 11.5. system sentences. That is the intended behaviour
- A nickname or avatar change reaches every other **open** screen over the `user_changed` channel (§ 8.4.) — the other person's devices and this person's second device alike. A _fresh load_ is already correct because § 5.'s opaque token is resolved against `users` on every request and carries no stale copy, unlike a JWT with baked-in claims; it just cannot push to an open screen, which is why § 8.4. exists. Answering the event is a single `GET /api/users` — had the name been denormalized, it would have been a backfill
- Fallback when the nickname is empty is the email local part, applied in `toParticipant` (§ 8.4.); fallback when no avatar is set is an initial-letter avatar (DESIGN § 7.7.)
- [ ] Point the chat avatar at `GET /api/media/{avatarMediaId}` once the R2 pipeline lands (step 6)

### 8.8. Read / Unread

Landed: the cursor lives in `users.last_read_at` (no per-message `read_at`, no members table), and `countUnreadMessages` joins `users` on the requesting id so the badge stays one round trip.

- [ ] A message is unread when `message.created_at > otherUser.last_read_at`. This is a **boolean**, correct only for two participants (§ 6.)
- [ ] While the chat tab is visible, update the cursor via `POST /api/chat/read` (throttled)
  - [ ] The UPDATE **must** carry `WHERE last_read_at < $new`. The same person can have the tab open on two devices, and a late stale request would otherwise move the cursor backwards — the unread divider jumps back into read history and the other side's `1` markers reappear after clearing
- [ ] The broadcast that clears the sender's `1` markers needs no new plumbing: the write touches `users`, so the § 6. trigger fires `user_changed` and § 8.4. delivers it
- [ ] An unread-count endpoint for the tab bar badge

---

## 9. Image Storage (R2)

- [ ] Create the R2 bucket as **private**, public access fully disabled
- [ ] `POST /api/media/upload-url` — validate the session, then issue a presigned **PUT** URL so the client uploads **directly to R2**, avoiding Vercel's 4.5MB body limit that full-resolution iPhone photos exceed. After the upload, register metadata with `POST /api/media`
- [ ] `GET /api/media/{id}?variant=thumb|original` — validate the session, generate a presigned **GET** URL (5–10 minutes), `302` to it
  - [ ] `variant` defaults to `thumb`; the gallery grid and chat thumbnails use `thumb`, only the fullscreen viewer uses `original`
  - [ ] Because the route is same-origin, `<img>` requests carry the session cookie automatically
  - [ ] Set `Cache-Control: private, max-age` shorter than the signature's expiry
- [ ] **Never rely on a UUID in the URL as access control** — every read validates the session
- [ ] Thumbnails: the client resizes at upload time and uploads both objects (`{key}` and `{key}_thumb`)
- [ ] Use `media.blurhash` as the pre-load placeholder for grid and bubble images, with box reservation (§ 8.3.)
- [ ] R2 credentials live only in server env and must never reach the client bundle
- [ ] Deleting an image also deletes the R2 objects
- [ ] Read path for chat: fetch the `message_media` rows for a whole page of messages in **one** query, ordered by `sort_order`

---

## 10. Gallery Tab

- [ ] Images sent in Chat **appear here automatically** — `media` is the single source, nothing is copied
- [ ] Reverse-chronological 3-column grid with month section headers
- [ ] Cursor-based infinite scroll, paginated on the `(created_at, id)` pair (§ 6.)
- [ ] Tapping opens the fullscreen viewer (pinch zoom, swipe between images, download)
- [ ] A link that jumps to where the image was sent in the conversation
- [ ] Direct upload from the gallery, with an option not to post it to the conversation
- [ ] Deletion — its interaction with chat messages is undecided (§ 18. #1)

---

## 11. Calendar Tab

### 11.1. D-day Header

- [ ] The relationship start date comes from the **`RELATIONSHIP_START_DATE` env var** (ISO `YYYY-MM-DD`); it is **not stored in the database**
- [ ] Show the elapsed day count at the very top of the tab. Following the Korean convention, **the start date itself is day 1**
- [ ] Compute it in a Server Component and pass it down, so a skewed client clock or timezone cannot give each user a different number
- [ ] Recompute on tab focus, in case the app was left open across midnight

### 11.2. Derived Anniversaries

- [ ] **Derive from `RELATIONSHIP_START_DATE`** — no database rows, no user input: every 100 days (100 / 200 / 300 …) and yearly anniversaries
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

Include only what pays off for exactly two users. Invitations, RSVP, permissions, and external calendar sync are **not adopted** — with two mutually trusting users they are pure complexity.

- [ ] **Event `scope`** — `shared` (ours) or `mine` (my personal schedule), defaulting to `shared`
  - [ ] `mine` events are still **visible** to the other user — this is a distinction, not a privacy control. The point is to communicate "I'm busy that day"
  - [ ] Distinguish them in the month grid by marker shape (filled dot for `shared`, ring dot for `mine`)
- [ ] **Post a `type = 'system'` message to Chat when an event changes** — e.g. `지희님이 8월 10일 '영화 보기' 일정을 추가했어요`
  - [ ] **Do not bake the name into the stored text.** Store `sender_id`, `system_action`, and the `event_title` / `event_starts_at` snapshot, then **compose the sentence at render time from `users.nickname`** so a rename updates past system messages too (§ 8.7.). The event snapshot is deliberate and not a violation: a delete notice must still say which event it was, and its `events` row is gone. Only the _user_ name must never be copied
  - [ ] Post on create, time change, and delete. **Do not post** when only the title or description changed
  - [ ] This rides the existing SSE pipeline, so it costs no additional infrastructure
  - [ ] Render as a centered pill with no bubble (same treatment as the date divider — DESIGN § 6.4., § 6.5.); tapping navigates to the event
- [ ] **Upcoming-events card** directly under the D-day header, summarizing the next one or two events; hidden entirely when there are none
- [ ] **A dot on the Calendar tab-bar icon when there is an event today** (a single dot, not a count)
- [ ] **Empty state** for a day with no events (DESIGN § 7.6.)

### 11.6. Notifications

- [ ] **Undecided (§ 18. #8)** — feasibility is documented in § 16.1. Do not start work before the user decides

---

## 12. Settings Tab

- [ ] Profile — change nickname, upload/change profile image (via R2)
  - [ ] The nickname set here is exactly what appears as the sender name in chat and inside system sentences (§ 8.7.), initialized from the Google account name at first login and owned by the user thereafter
  - [ ] Saving needs no explicit broadcast — the UPDATE lands on `users`, so the § 6. trigger fires `user_changed` and every open screen refetches (§ 8.4.)
- [ ] Entry point to the emoticon settings screen
- [ ] List of logged-in devices, with per-session revocation
- [ ] Log out
- [ ] The theme setting stays **hidden until the dark theme ships**
- [ ] App info / version

---

## 13. Emoticons

- [ ] Emoticon assets are plain image files, **supplied manually** and uploaded to R2
- [ ] An admin script registers packs and items (`scripts/seed-emoticons.ts`)
- [ ] Per-pack **enable / disable** toggle in Settings, plus **drag-and-drop reordering**
- [ ] The chat picker shows only enabled packs, in the configured order, as bottom tabs
- [ ] Selecting an emoticon sends it immediately (a `type: "emoticon"` message)
- [ ] A "recently used" section
- [ ] Preload / cache emoticon images so the picker does not stutter when opened

---

## 14. Security and Index Blocking

Landed: `app/robots.ts` (`Disallow: /` for every agent), root layout `robots: { index: false, follow: false, nocache: true }`, `X-Robots-Tag: noindex, nofollow, noarchive` on every path, and `Strict-Transport-Security` / `X-Content-Type-Options` / `Referrer-Policy: no-referrer` / `X-Frame-Options: DENY`. **Do not generate a sitemap.** `robots.txt`, `/icons/*`, and the manifest MUST stay out of the proxy matcher, or a crawler gets a redirect to `/login`.

- [ ] Every API route validates the session (401 when unauthenticated)
- [ ] Upload MIME/extension allow-list and a size cap
- [ ] Rate-limit the login callback endpoint
- [ ] Error responses must not leak internal details

---

## 15. Deployment

- [ ] Connect the Vercel project to the private GitHub repository
- [ ] Custom domain `jandh.jeheecheon.com` + DNS CNAME + automatic HTTPS
- [ ] Environment variables — `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ALLOWED_EMAILS`, `RELATIONSHIP_START_DATE` (ISO `YYYY-MM-DD`), `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `APP_URL`
- [x] `maxDuration` for the SSE stream function — `300`, set on the route segment (§ 8.4.)
- [ ] Include `lint:steiger` in `pnpm build` so architecture violations fail the deploy
- [ ] Separate dev and production databases using Neon branches

---

## 16. Later (not implemented now)

- [ ] Dark theme — fill in the `.dark` block in `theme.css`, remove `forcedTheme`, reveal the Settings toggle
- [ ] Offline caching (the caching role of a service worker — separate from push)
- [ ] Data backup / export

### 16.1. Push Notifications — Research Findings

**Conclusion: feasible.** Adoption is § 18. #8; it reverses the "no service worker" decision in § 7.

**Constraint 1 — a service worker is mandatory.** iOS supports Web Push from 16.4, but **only for home-screen PWAs**, never a Safari tab. Displaying a notification needs the service worker's `showNotification`. Keep it **push-only** — caching is the main source of hard-to-debug behaviour and must stay separate. The permission prompt must fire **inside a user gesture**. Deleting the app from the home screen destroys the subscription, so re-subscription handling is needed.

**Constraint 2 — only event-driven notifications are in scope.** Serverless has no process that wakes at a given time, so anything needing a scheduler is excluded: "new message arrived" (sent at INSERT time) is the **only candidate**; per-event reminders and a morning digest are **excluded**.

Why minute-granularity cron is excluded — the reason is operational, not cost (Cloudflare Cron Triggers are free): **it defeats Neon's autosuspend**, since polling every 5 minutes keeps the compute awake 24/7 and § 8.4. closes the SSE stream on background _specifically_ to allow autosuspend. The query count (288/day) is negligible; the **wake pattern** is the problem. It also grows deployment targets from one to two plus a shared secret, fails silently if the cron stops, and needs its own duplicate-send state.

Calendar awareness is therefore handled by the § 11.5. chat system messages, which work over SSE with no cron — and with new-message push enabled, those system messages are themselves delivered as push.

**What adoption would additionally require**: a `push_subscriptions` table (`id`, `user_id`, `endpoint` unique, `p256dh`, `auth`, `user_agent`, `created_at`, `last_success_at`), a VAPID key pair (`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`), the `web-push` library, automatic cleanup on 410 Gone, a Settings toggle, and optionally `navigator.setAppBadge`.

---

## 17. Implementation Order

1. ✅ Project setup + FSD scaffolding + design tokens + base components (§ 1.–§ 4.)
2. ✅ Auth + session (§ 5.) — highest-risk area, so it went first. **The real-device iOS PWA check (§ 5.3.) is still open**
3. ✅ Database schema + migrations (§ 6.)
4. ✅ Layout + tab bar + PWA manifest (§ 7.)
5. **Chat tab (§ 8.) — in progress.** Static UI → message CRUD → infinite scroll → SSE ✅; read receipts (§ 8.8.) and search and jump (§ 8.6.) remain
6. R2 media pipeline + sending images in chat (§ 9.)
7. Gallery tab (§ 10.)
8. Emoticons (§ 13.)
9. Calendar tab (§ 11.)
10. Settings tab (§ 12.)
11. Security hardening + deployment (§ 14., § 15.)

---

## 18. Undecided — Ask, Do Not Guess

Deliberately left open. When work reaches the feature, **confirm with the user**, then update this document.

| #   | Item                                                                                                                          | Needed by             | Notes                                                                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1   | What happens to the chat message when an image is deleted from the gallery — delete it, or keep a "deleted photo" placeholder | Gallery (§ 10.)       | Affects the schema (whether `media.deleted_at` is needed)                                                                       |
| 2   | How emoticon assets are sourced and how packs are composed                                                                    | Emoticons (§ 13.)     | The picker grid cannot be designed until the aspect ratios are known                                                            |
| 3   | Emoticon picker dimensions — panel height, pack tab bar, grid density                                                         | Emoticons (§ 13.)     | DESIGN § 9.                                                                                                                     |
| 4   | Calendar event color set (6–7 warm tints that do not clash with the accent)                                                   | Calendar (§ 11.)      | DESIGN § 9.                                                                                                                     |
| 5   | Motion duration / easing token scale                                                                                          | When animation starts | Only the 1.5s search flash and the tab `scale-[0.96]` are specified. DESIGN § 9.                                                |
| 6   | Image viewer gesture parameters — pinch zoom bounds, swipe threshold                                                          | Gallery / viewer      | Must be tuned on a real device. DESIGN § 9.                                                                                     |
| 7   | Dark palette hex values                                                                                                       | Dark theme (§ 16.)    | Hand-tune; never arithmetically invert. DESIGN § 5.4.                                                                           |
| 8   | **Whether to adopt push notifications (new-message only)**                                                                    | After the calendar    | Research complete (§ 16.1.). Reverses the "no service worker" decision. **Time-based notifications are confirmed out of scope** |
| 9   | Whether a `scope = 'mine'` event shows its **title** to the other user, or only "busy"                                        | Calendar (§ 11.5.)    | Currently specified as showing the title                                                                                        |
| 10  | Maximum images per message, and the grid layout beyond that count                                                             | Chat images (§ 8.1.)  | KakaoTalk caps a send at 30. Determines the `+N` overflow treatment and upload concurrency. DESIGN § 9.                         |
