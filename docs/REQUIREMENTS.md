# J&H — Implementation Requirements

A private web app for exactly two people. An iOS PWA with four tabs: Chat, Calendar, Gallery, Settings.

- **App name**: J&H · **Folder**: `jandh` · **Domain**: `jandh.jeheecheon.com` · **Users**: 2 (fixed, never grows) · **Repo**: GitHub Private
- **Reference project**: `~/Projects/everytldr/everytldr.com/frontend`

> **Language**: this document is English for LLM comprehension. **All user-facing copy is Korean.** Korean literals here (`오늘`, `새 메시지 3`, …) are the exact UI text — never translate them in code.

| Document                                    | Role                                                                        |
| ------------------------------------------- | --------------------------------------------------------------------------- |
| `docs/REQUIREMENTS.md` (this file)          | **What we build** — features, architecture, schema, API shapes, build order |
| `docs/DESIGN.md`                            | **How it looks** — tokens (sole source of hex values), visual specs         |
| `AGENTS.md` (root; `CLAUDE.md` symlinks it) | **How we write it** — conventions, component contracts, prohibitions        |

Precedence on conflict: visuals → `DESIGN.md`; code-authoring rules → `AGENTS.md`; everything else → this file.

## Reading This Document

- **✅ = implemented.** Those sections are compressed to the **invariants new code must not break**. They are not work to do, and they are not optional: code comments cite these section numbers instead of restating the argument, so a rule here is often its only written copy.
- **`[ ]` = remaining work**, and the authoritative spec for it. Tick the box in the change that lands it (`AGENTS.md § 0.3.`).
- **Never renumber a section** — `src/` comments reference these numbers.

**Current state** — § 17. steps 1–4 done. Step 6 (R2 media pipeline, § 9.) done, and with it photo and video messages: picker, editor, direct upload with progress, retry and cancel, media bubbles, and the fullscreen viewer. Step 5 (chat) otherwise partly done: text and system bubbles, cursor pagination, virtualization, optimistic send, copy/delete, SSE delivery (§ 8.4.), render-time names (§ 8.7.), push (§ 16.1.), read cursor (§ 8.8.). **Open in chat**: the `1` marker and unread divider (§ 8.8.), search and jump (§ 8.6.), emoticon bubbles (step 8). Calendar and Gallery are empty states until their step.

---

## 0. Settled Technical Decisions ✅

| Item          | Decision                                              | Rationale                                                           |
| ------------- | ----------------------------------------------------- | ------------------------------------------------------------------- |
| Framework     | Next.js 16.2.12 (App Router) + React 19.2.4           | All server functionality lives in the single Next app               |
| Hosting       | Vercel (serverless)                                   | Free, `git push` deploys, automatic HTTPS                           |
| Database      | Neon Postgres + Drizzle ORM                           | Free tier, serverless-friendly                                      |
| Auth          | Google OAuth (allow-listed emails) → our own session  | No password stored, so no brute-force surface                       |
| Session       | `sessions` table + opaque token in an httpOnly cookie | Per-device revocation, instant profile changes, survives iOS ITP    |
| Realtime      | SSE + Postgres `LISTEN`/`NOTIFY`                      | WebSockets conflict with one-Next-app; SSE gets cookie auth + retry |
| Notifications | Web Push (VAPID) + a push-only service worker         | Covers the app being closed, which SSE cannot (§ 16.1.)             |
| Images        | Cloudflare R2 (private bucket + presigned URLs)       | Free egress; a UUID in a URL is obscurity, not access control       |
| Architecture  | Feature-Sliced Design, enforced by steiger            | Inherited from `everytldr`                                          |
| Styling       | Tailwind v4 + semantic tokens (`theme.css`)           | Dark theme becomes a value swap, not a refactor                     |
| Indexing      | Fully blocked (robots + meta + header)                | Private app                                                         |

---

## 1. Project Setup ✅

Next 16.2.12 + `pnpm` + Turbopack; local Postgres via `docker-compose` (`pnpm db:up`), Neon in production. Config inherited verbatim from the reference project: `tsconfig` (`@/*` → `./src/*`, `verbatimModuleSyntax`, `strict`), `eslint.config.mjs`, `.prettierrc` (`printWidth: 100`), `steiger.config.ts`, `postcss.config.mjs`, `components.json` (shadcn `new-york`, `@/shared/ui`, `@/shared/lib`, lucide), the SVGR turbopack rule, Pretendard Variable as a local font. `pnpm lint` = eslint + steiger; `pnpm dev` runs the app and steiger `--watch`.

- **Deliberately excluded — do not reintroduce**: all i18n (`next-intl`, `[locale]` routing, `messages/`, `Translation`), `orval` (Next _is_ the backend), `msw`, every ads / analytics / RSS / structured-data / sitemap file, the `rewrites` backend proxy
- **Check `package.json` before adding a dependency** — R2, push, virtualization, query, validation, and image cropping (`react-easy-crop`, § 9.) are already installed. § 13.'s drag-and-drop reordering is the one remaining need with no library present

---

## 2. FSD Structure ✅

```
app/                     Next routes — thin, delegate to src/pages
  (auth)/login/  (main)/{chat,calendar,gallery,settings}/  api/{auth,chat,media}/
  robots.ts  manifest.ts  icon.svg  favicon.ico
pages/                   EMPTY SENTINEL — README only, no route files
proxy.ts                 Next 16's renamed Middleware (§ 5.2.)
src/
  app/       providers / styles(globals.css, theme.css) / fonts
  pages/     login, chat, calendar, gallery, settings
  widgets/   tab-bar, install-guide, chat-room, gallery-grid, calendar-month, settings-form
  features/  session, send-message, chat-stream, push-notifications,
             upload-media, emoticon-prefs, update-profile, manage-event
  entities/  user, message, push-subscription, media, event, emoticon
  shared/    db, auth, push, sound, storage, api, config, lib, theme, ui
```

- The session slice is `session`, not `auth` — `features/auth` collides with the `shared/auth` segment name (`fsd/ambiguous-slice-names`)
- The composer and emoticon picker are **`features/send-message/ui/…`, not widgets**: `widgets/chat-room` renders them, and a widget cannot import a sibling widget (`fsd/forbidden-imports`)
- Client modules import `@/entities/message` with **`import type` only** — its api segment is `server-only` and a value import drags that into the browser bundle. Hence chat row components and the grouping model live in `widgets/chat-room`
- Root `pages/` MUST exist and stay empty, or Next treats `src/pages/` as the Pages Router and the build breaks
- Server-only code lives in `shared/` segments and imports `server-only`; entity fetching lives in each entity's `api` segment; every slice is imported through its `index.ts` (eslint-enforced)

---

## 3. Shared Utilities (`src/shared/lib`) ✅

Read `src/shared/lib/index.ts` for the inventory (nullish types, `safely*`, `assert`, `cn`, duration constants + Korean date formatters, DOM helpers, `useHydrated` / `useIsCoarsePointer` / `useIsVirtualKeyboardOpen`). Reach for it before writing a utility.

- **`cn` uses `extendTailwindMerge`; every custom token scale must be declared there.** An undeclared scale is not merged at all: `cn("px-md", "px-0")` emits both and stylesheet order wins, silently ignoring the call-site override. A new `--text-*` / `--spacing-*` scale in `theme.css` means a matching entry here

---

## 4. Design System and Theming ✅

`globals.css` imports tailwind + `tw-animate-css` + `theme.css` and defines `@custom-variant dark`. `theme.css` declares `--color-*: initial` first, which **removes Tailwind's default palette from the build**, structurally preventing raw color utilities; semantic + chat tokens, `--text-*`, `--radius-*`, `--spacing-*`, `--shadow-*` follow. **`DESIGN.md § 4.` is the sole source of hex values — never copy one here.** `.dark { }` is an empty shell; `shared/theme/provider.tsx` is pinned with `forcedTheme="light"` (dark ships by deleting that line). Icons: `lucide-react` first; custom marks are `.svg` via SVGR, re-exported from `shared/ui/index.ts`.

### 4.1. Responsive Policy — One Mobile UI ✅

**Ship exactly one UI: the mobile one.** Never branch layout or swap components on viewport width; desktop shows the same UI centered. The reference's `ResponsiveDialog` / `ResponsiveSelector` / `ResponsiveActionMenu` are **not** ported. Pointer support is still mandatory everywhere: real `click` handlers plus `hover:` / `active:` / `focus-visible:`. `useIsCoarsePointer` is for interaction details only, never layout.

### 4.2. Page Width and Centering ✅

App shell max width **`576px`** (`--container-app`), so the four-item tab bar cannot stretch across a desktop screen. `Container`: `md` (default) = app width, `sm` = `448px`, padding `px-md`. Outside the shell the page uses `backdrop`. `--tab-bar-height` and `--app-header-height` live in `theme.css` outside `@theme`. Screens never restate a viewport height — the `(main)` layout owns the column height, screens are `flex-1` inside it, and full-height screens honour `env(safe-area-inset-*)`.

### 4.3. Visual Viewport and the Keyboard

Landed; full rules in `AGENTS.md § 4.4.` and `DESIGN.md § 3.4.`–`§ 3.5.` What a new screen must respect:

- The shell is the app's **one** `fixed` element, sized to the **visual viewport** (`VisualViewportSync` → `--viewport-height` / `--viewport-top`). A second `fixed` element drifts against the keyboard on WebKit
- The document must never scroll (`html, body` are `h-full overflow-hidden overscroll-none`) — a document taller than the visual viewport lets WebKit pan the header off-screen. Screens scroll inside `#app-scroll` (`APP_SCROLL_ID`) or their own container, and `ScrollMemory` / `ScrollReset` address that container, never `window`
- Header and bars **float over** content: `sticky` header, absolute `BottomOverlay` whose measured height becomes the scroller's `--bottom-inset` padding. Both use the single `glass` utility so they cannot drift apart; every floating strip is `pointer-events-none` at its root, re-enabled only on the visible surface
- **Nothing may depend on `interactiveWidget: "resizes-content"`** (Chromium/Firefox only, ignored by iOS), and `env(safe-area-inset-bottom)` is **not** a keyboard inset — it reports the home indicator and never moves for the keyboard
- [ ] Real-device pass (§ 5.3.) — keyboard-open geometry is reasoned through but unverified on an iPhone

### 4.4. Base Components (`src/shared/ui`) ✅

Read `src/shared/ui/index.ts` for what already exists (buttons, inputs, the overlays below, `Container`, `AppHeader`, `EmptyState`, `Avatar`, `RelativeTime`, scroll helpers, `toast`). Check it before building any primitive.

- New primitives come from shadcn first, then have **every** visual decision rewritten against `DESIGN.md` and are refactored to the `AGENTS.md § 1.` props contract
- `Drawer` and `Dialog` are composition primitives, **never used directly in screen code**. Overlays in `shared/ui` are props-driven (`isOpen`, `header`, `onClose`, `children`; `ActionSheet` takes `items: { label, icon, variant, onSelect }[]`) and compose the primitives internally

---

## 5. Authentication

### 5.1. Google OAuth ✅

`GET /api/auth/login/google` (arctic `state` + PKCE in cookies), `GET /api/auth/callback/google` (code exchange, `id_token` verified with `jose`, `state` and verifier checked, `email_verified === true` required, email lowercased and matched **exactly** against `ALLOWED_EMAILS`), `POST /api/auth/logout`. The Google consent screen stays in "Testing"; redirect URIs are `http://localhost:3000/…` and `https://jandh.jeheecheon.com/…`.

- The `users` lookup key is **`google_sub`, not the email** — Google lets an account change address, and matching on email collides with the existing row's unique `google_sub`
- **Google OAuth only.** No provider abstraction, no `[provider]` segment, no password login

### 5.2. Session ✅

A 32-byte token is stored **hashed** in `sessions.token_hash`; only the raw token goes in the cookie (`httpOnly; Secure; SameSite=Lax; Path=/; Max-Age=180 days`). Sliding renewal updates `last_seen_at` and extends expiry at most once a day per device. The lookup is memoized per request with React `cache()`.

- The proxy re-issues the cookie with a fresh `Max-Age` on every page request — otherwise the row's new expiry is invisible to the browser, which drops the cookie 180 days after login however active the user was
- **Never use localStorage for auth state** — iOS ITP can evict script-written storage after 7 days of non-use; a server-set cookie is exempt
- `proxy.ts` (Next 16 renamed Middleware to Proxy: repo root, exports `proxy`) checks **only whether the cookie exists**; real DB validation happens in Server Components / Route Handlers. Unauthenticated → `/login`; authenticated on `/login` → `/chat`
- A cookie that exists but no longer validates is unwound through `GET /api/auth/session/expire`, which clears it and lands on `/login` — a Server Component cannot write cookies, so redirecting it straight to `/login` bounces off the proxy forever. That route re-checks the session and refuses to clear a valid one, since a cross-site `<img src>` reaches it with the cookie attached

### 5.3. iOS PWA Verification (highest priority)

- [x] Verify **on a real device** that the Google login redirect from a home-screen standalone PWA returns to the app correctly
- [ ] Verify the session cookie survives days of non-use (re-check after several days)
- [x] Verify **what iOS actually hands a file input for a video**. It transcodes HEIC to JPEG for uploads and may do the same for HEVC → H.264; if it does, § 9.'s "store whatever arrives" costs nothing on the desktop either, and the viewer's download fallback never fires

### 5.4. Development Login ✅

`POST /api/auth/login/dev` takes an `email` form field, matches `ALLOWED_EMAILS` as § 5.1. does, and issues the same § 5.2. session. `/login` renders the form under the Google button when enabled.

- Gated on `IS_DEV_LOGIN_ENABLED` (`NODE_ENV === "development"`), which Next inlines at build time — production cannot re-enable it through the environment and the route answers **404** there
- The row is upserted with a synthetic `dev:{email}` subject id; a later Google sign-in relinks that row to the real `google_sub`, so the paths never fork into two users
- The redirect is **303**, not `redirectTo`'s default 307 — a 307 replays the POST against the target page
- Auth Route Handlers redirect through `redirectTo` from `@/shared/api`, which emits a **relative** `Location`. `new URL(path, request.url)` cannot: `next dev` builds `request.url` from the bound `localhost:3000` and takes only the scheme from `X-Forwarded-Proto`, so behind an HTTPS tunnel it emits `https://localhost:3000`, which speaks no TLS. `proxy.ts` is exempt — Next already relativises middleware redirects

---

## 6. Database Schema (Drizzle) ✅

Schema, migrations, and triggers have landed. This is the contract new code is written against.

**Columns are not listed here — read `src/shared/db/schema/*.ts`** (`users`, `sessions`, `messages`, `message_media`, `media`, `events`, `emoticons`, `push-subscriptions`), one file per table. Never copy a column list into this document; the invariants below are what the schema cannot state on its own.

**Invariants new code must not break**

- There is **no `accounts` table** (one provider, § 5.1.), **no `conversation_members` table**, and **no `conversations` table**
- **Two participants, permanently.** `ALLOWED_EMAILS` gates the only row-creating path, so membership and identity are the same set — hence no members join. A third participant needs `conversation_members` back **and** a rewrite of § 8.8. (unread becomes a count of readers, not a boolean, reaching into the `1` marker and unread divider in `DESIGN.md § 7.`). A non-participant `users` row (a test or retired account) breaks `GET /api/users` the same way — keep such rows out of this database
- `users.last_read_at` has **no default**, so every insert names one; a `defaultNow()` would silently mark everything sent before that person's first login as read (§ 8.8. reads unread as `created_at > last_read_at`). The one insert site, `upsertGoogleUser`, passes the epoch
- **The one conversation is implicit — there is no row and no id for it.** Every `messages` query is already conversation-wide, so a singleton table would only have been a constant, a CHECK pinning it, an `ensureConversation` on the login path, and an FK column repeating that constant on every row. A second conversation needs all of it back **and** the `conversation_members` rewrite above — not one of the two alone
- `messages` is **append-only** — marking messages read must never UPDATE it
- A CHECK pins which columns each `messages.type` may fill (a `text` row carries no `emoticon_item_id` or event; a `system` row carries no text). The CHECK cannot reach `message_media`, so "a non-`media` message must not acquire media children" is a `BEFORE INSERT OR UPDATE` **trigger** there. The reverse (a `media` message with zero media rows) is deliberately **not** enforced — it would need a `DEFERRABLE` constraint trigger, and § 8.5. writes both in one transaction
- **Never store an R2 URL in any table** — presigned URLs expire in minutes (§ 9.); store ids and mint per request
- The `media` enum value was `image` until `0008_media_message_type`. It is `media` because one bubble may carry photos **and** videos, discriminated by `media.mime` — renamed with `ALTER TYPE … RENAME VALUE`, never a drop-and-recreate, which would fail on existing rows and break the trigger function whose `DECLARE` names the type
- **One bubble is one `messages` row regardless of attachment count**: 3 photos = 1 message row + 3 `message_media` rows, which is why there is no `messages.media_id`. `sort_order` preserves the sender's order. `media_id` does not cascade (§ 18. #1 decides what a gallery delete does) and carries its own index, since the PK cannot serve lookups by media
- `messages.event_id` is `ON DELETE SET NULL`; § 11.5. composes its sentence from the `event_title` / `event_starts_at` snapshot, because a delete notice outlives its `events` row. Only the **user name** is resolved at render time (§ 8.7.)
- `events.ends_at` is NOT NULL — the create form defaults it rather than admitting an open-ended event, which would need its own branch in every month-grid calculation. `color` is nullable until § 18. #4. **Recurrence is yearly-only** (anniversaries): never introduce RRULE or a general recurrence engine — project `yearly` rows onto the requested year on read. The relationship start date, 100-day marks, and yearly anniversaries are **not rows** (§ 11.2.)
- Indexes: `media(created_at DESC, id DESC)`, `message_media(media_id)`, `events(starts_at)`, `sessions(token_hash)`, plus `pg_trgm` + a GIN trigram index on `messages.text` (§ 8.6.). `messages` needs no paging index of its own — its primary key **is** the § 8.2. cursor. The `media` index needs the `id` tiebreaker because `created_at` is the **transaction** timestamp, so a multi-image send's rows compare equal and a keyset page skips or repeats them — **paginate on the pair, never on `created_at` alone**
- Triggers: `AFTER INSERT` on `messages` fires `pg_notify('new_message', { id })`; `AFTER INSERT` **and** `AFTER UPDATE` on `users` fire `pg_notify('user_changed', '')`. Payloads are minimal because `NOTIFY` caps at 8000 bytes and § 8.4. refetches rather than trusting a payload. Two user triggers because a `WHEN` clause cannot reference `OLD` on an INSERT, so `WHEN (OLD.* IS DISTINCT FROM NEW.*)` rides the UPDATE trigger alone. That guard plus § 8.8.'s `WHERE last_read_at < $new` keeps the channel quiet under the app's highest-frequency write — **both halves are load-bearing**; dropping either puts a `GET /api/users` on every throttle tick
- `emoticon_items.width` / `height` are **required**, because the virtualizer reserves the box before the asset loads (§ 8.3.)
- Two connection strings: `DATABASE_URL` (pooled, normal queries) and `DATABASE_URL_UNPOOLED` (**required** for `LISTEN` and migrations)
- **There is nothing to seed.** A `users` row exists only after that person's first login, and no other table has a bootstrap row — `scripts/seed.ts` existed for the conversation singleton alone and went with it. The extension, trigram index, and triggers live in hand-written (`--custom`) migrations, since drizzle-kit cannot infer them
- **`pnpm db:migrate` is manual and decoupled from the deploy: ship code first, migrate second.** Reversed, a first login against the previous build inserts without the new column, hits `23502`, and the OAuth catch flattens it into the generic `?error=failed` copy — nothing in the UI names the column
- **That order covers additive migrations only.** Dropping a `NOT NULL` column has no safe order on its own: code-first leaves the new build inserting without it (`23502`), migrate-first leaves the previous build inserting a column that is gone (`42703`). The safe shape is a split — relax the column, migrate, ship the code that stops writing it, migrate again to drop it. `0007_drop_conversations` deliberately skips the split: with two users and a hand-run migrate, the window costs a retried send, never data

---

## 7. Layout, Tab Bar, PWA ✅

The `(main)` layout is the app shell (max `576px`, centered) holding a per-screen header, the content, and the tab bar. Four tabs — `채팅` / `캘린더` / `갤러리` / `설정` — icon + label, colour-only active state, hover/active styling, `env(safe-area-inset-bottom)` honoured.

- The layout is the **only** place a screen's session is resolved (`requireUserOrRedirect`, `AGENTS.md § 6.4.`); a page re-reads it only when it needs the row, and `cache()` makes that free
- The header is per-screen, not layout-owned, because it carries screen-specific actions — screens render `AppHeader` themselves
- `ScrollMemory` preserves each route's position across tab switches in **module scope**, not `sessionStorage`: a tab switch is a client navigation, a reload is meant to start at the top. Its timing quirks are load-bearing and documented at the source. **Chat is exempt** — its scroll belongs to the virtualizer (§ 8.3.)
- `app/manifest.ts`: name `J&H`, `display: "standalone"`, `theme_color`, `background_color`, icons 180/192/512 + maskable, generated by `pnpm icons` from a **path-only** wordmark (an SVG `<text>` icon renders in whatever font the machine has) and committed under `public/icons`. iOS reads `apple-touch-icon` from the markup, so the root layout's `metadata.icons.apple` is what "Add to Home Screen" uses
- `widgets/install-guide` is a dismissible "Add to Home Screen" banner above the tab bar, shown only in an iOS **browser tab** (iPadOS 13+ reports a Macintosh UA, so the check needs `maxTouchPoints`). Its dismissal flag is in `localStorage` — § 5.2. bans that for auth state only — and every access goes through `safelyRun` / `safelyGet`, since blocked storage throws and this renders in the `(main)` layout, failing hydration on all four tabs
- **Offline support is out of scope.** `public/sw.js` is **push-only** (§ 16.1.): `push` and `notificationclick`, nothing else. It MUST NOT register a `fetch` handler or cache anything — that is what makes a worker serve last week's build
- `/icons/*`, `robots.txt`, the manifest, and `/sw.js` MUST stay out of the proxy matcher: a redirect to `/login` breaks the install prompt, and the browser fetches a worker without following redirects, so a gated `/sw.js` fails registration outright
- The Chat tab's unread badge is live (§ 8.8.): seeded by the layout's server render, incremented by the shell's SSE stream, replaced by `GET /api/chat/unread` on resume

---

## 8. Chat Tab (KakaoTalk-style)

> **Only layout and interaction rules come from KakaoTalk**, never its colors or shapes (Kakao yellow, sky-blue background, drawn tails). `DESIGN.md § 2.2.` and `§ 6.` are the sole source of every visual spec below.

### 8.1. UI

Landed: notch-corner bubbles (mine right, theirs left), avatar + nickname on the first message of a group, one timestamp per same-minute group on its last message, date divider pills (`오늘`, `어제`, `2026년 8월 3일 월요일`), the auto-growing composer with `+` and emoticon toggle (both **disabled** until steps 6 and 8; the send button replaces the toggle once the field is non-empty), long-press / right-click → `ActionSheet` (copy / delete), and the scroll-to-bottom button appearing ~200px from the newest message with an incoming count (`새 메시지 3`).

- A hardware keyboard sends on Enter and breaks the line on Shift+Enter; on a coarse pointer Enter stays a newline, since the iOS keyboard has no send key (`useIsCoarsePointer`)
- Tapping send keeps the keyboard open: the button cancels `pointerdown` so the tap never blurs the field, and `submit` refocuses inside the click gesture
- `DELETE /api/messages/{id}` soft-deletes, scoped to the sender, and answers **404** for someone else's message and for one that never existed alike, so the endpoint cannot probe ids (§ 14.)
- The tab bar and install banner hide while the keyboard is up — the shell shrinks to what the keyboard leaves and neither is worth 56px of it. `useIsVirtualKeyboardOpen` requires both a drop below the tallest height seen at the current width **and** an editable `activeElement`: height alone misreads a collapsing address bar, focus alone survives Android's back button

Remaining:

Landed for media (photos **and** videos — the message type is `media`, and `media.mime` is the discriminator, so one bubble may carry both):

- [x] Media messages render **without a bubble**; tapping opens a fullscreen viewer
  - [x] Attachments sent together are **one bubble** (§ 6.) — branch on array length alone: 1 keeps its own `media.width` / `height` aspect ratio, 2+ use a fixed square-cell grid whose height follows from the cell layout rather than from the images
  - [x] Tapping any tile opens the viewer at that index and swipes through the rest of the same bubble. The swipe is **native scroll snapping**, not a gesture handler — it needs none of the parameters § 18. #6 leaves open
  - [x] A video tile shows its poster, a play glyph, and its running time from `media.duration_ms`
  - [x] The composer's `+` opens a `BottomSheet` (`사진/영상` → album, `카메라` → capture). `capture` and `multiple` cannot be combined, which is why those are two rows and two inputs. The `카메라` row is shown only on a coarse pointer — a desktop browser ignores `capture` and opens the same file dialog as the row above it
  - [x] Picked attachments stage in a tray above the composer, each with its own remove control and, for photos, an editor (crop + filter, `react-easy-crop`). Decoding is serial, so a large pick takes seconds — the tray opens on a placeholder tile rather than staying empty until the last file lands
  - [x] `heic`/`heif` stay on the allow-list because iOS hands the original over when it declines to transcode, and its thumbnail is produced by decoding it in an `<img>` — so an engine without HEIC support rejects the pick outright instead of storing something it could never render
  - [x] Sending shows real upload progress per bubble; a failure offers **재전송 / 취소**, and a retry re-uploads only the attachments that had not landed. Progress is committed only when the whole-percent figure changes — `upload.onprogress` fires per network chunk, and every commit re-renders the virtualized list
- [ ] Unread marker — a `1` beside my message, in the `unread` token (DESIGN § 4.1.4.)
- [ ] Emoticon messages render as the image alone, without a bubble
- [ ] Pinch zoom in the viewer — § 18. #6, still open and meant to be tuned on a real device
- [ ] Tapping the scroll-to-bottom button scrolls smoothly to the bottom **and marks messages read**
- [ ] The same button returns the user to the newest messages after a search jump (§ 8.6.1.)

### 8.2. Message Loading ✅

Cursor-based infinite scroll: `GET /api/messages?before={id}&limit=30` (`WHERE id < :before ORDER BY id DESC`), plus `after={id}` and `around={id}`, whose callers are § 8.4. and § 8.6.1.

- **No OFFSET pagination, ever** — incoming messages shift page boundaries, producing duplicates and gaps
- `newestKnownId` is tracked alongside `oldestLoadedId` and only ever moves forward, so a delete cannot walk it back and make § 8.4.'s catch-up refetch what was already seen

### 8.3. Virtual Scrolling (Windowing)

Offscreen message nodes **must not stay in the DOM** — after years of history, thousands of infinite-scrolled nodes destroy scroll performance in iOS Safari. `react-virtuoso` is in place: `startReached` for upward loading, `firstItemIndex` decrement for jump-free prepends, `followOutput="smooth"`, `atBottomStateChange` for the scroll-to-bottom button, `scrollToIndex({ align: "center" })` for search jumps, automatic variable-height measurement, tuned overscan.

- **Never use `flex-direction: column-reverse`** — the virtualizer owns scroll anchoring and the two cannot coexist
- **Two traps, each rendering an empty list with no error**: `initialTopMostItemIndex` MUST be a constant (a live `rows.length - 1` re-runs initial positioning on every prepend); and the scroller is inline `height: 100%`, so its parent needs a **definite** height — a `flex-1` column is not one, the list must sit in an `absolute inset-0` box inside it
- That constant latches at the first render that **has rows**, not the first render: an empty room renders the empty state and mounts no list, so `useState(() => rows.length - 1)` is `0` — and when § 8.4.'s catch-up fills the room, the list mounts at the _oldest_ arriving message with the newest below the fold
- [x] **The box for a media message is reserved before the asset loads** — an aspect-ratio box from `media.width` / `height` for a single attachment, and the cell layout itself for a grid. Without it every image that arrives triggers a re-measure cascade and the scroll jolts
- [ ] Date dividers are list items (done), but the **sticky top indicator is a separate overlay** computed from the visible range — not built
- [ ] Restore scroll position when returning to the tab (`restoreStateFrom`)
- [ ] Native `Ctrl+F` cannot find offscreen messages — in-app search (§ 8.6.) is the deliberate replacement

### 8.4. Realtime (SSE) ✅

`GET /api/chat/stream` holds one unpooled connection on both channels, replays from `Last-Event-ID`, heartbeats; the client holds a single `EventSource`, closes it on background, catches up on every return. Contract:

**`GET /api/chat/stream`** — `text/event-stream`, `runtime = "nodejs"`, `maxDuration = 300`

- The connection comes from the **direct (unpooled)** string via `listenToChannels` (`shared/db`) and is released in a `finally`. A transaction-mode pooler hands the connection to another client between transactions, silently dropping the `LISTEN`
- **One endpoint, one `EventSource`, two channels.** `LISTEN user_changed` rides the connection the stream already holds; the two are told apart by the SSE `event:` field (`message`, `user`)
- `LISTEN` is registered **before** the replay query. Reversed, a message committing between the two is missed by both
- **`id > cursor` alone loses messages**: `bigserial` ids are handed out at INSERT but become visible at COMMIT, so they can commit out of order. Replay starts at `cursor - SSE_REPLAY_MARGIN` and lets id-deduplication drop the overlap
- `id:` goes on **`message` events only** — it is the reconnect cursor, a `messages` bigserial with no counterpart on `user` or `ping`. Omitting it leaves the client's last-event-ID buffer untouched, which is correct since those events are not replayable
- Notifications resolve **one at a time behind a promise chain** — each costs a `getMessage` query, and interleaving emits rows out of id order
- `event: ping` at `SSE_HEARTBEAT_INTERVAL` keeps proxies from timing out. It is a **named event, not a `:ping` comment**: a comment keeps proxies awake but `EventSource` never surfaces it, and the client's resume path must observe the heartbeat to tell a live socket from a frozen one
- Replay is capped at `SSE_REPLAY_LIMIT`; what falls past the cap is the client catch-up's problem, not replay's, so a truncated replay costs extra requests rather than a hole. Same for a notification lost while `postgres.js` silently reconnects its `LISTEN` socket — `maxDuration` ends the invocation every five minutes and the reconnect runs the catch-up again

**`GET /api/users`** — the whole participant set, **no cursor**. Callers: first render, a `user` event, the resume catch-up

- `listUsers` projects an explicit column set and `toParticipant` resolves the name before the response is built, so **`email` and `google_sub` never leave the server**. Never `SELECT *` here: the payload reaches the browser verbatim and `google_sub` is the identity key § 5.1. matches on. `email` is read only for § 8.7.'s empty-nickname fallback
- A "changed since" cursor is **rejected**: this is a small mutable set, not an append-only log — a rename produces no new row so an id cursor never fires, and an `updated_at` cursor still misses a deletion. Two rows are cheaper to refetch whole

**Client**

- **The subscription belongs to the `(main)` shell, not the chat screen.** `ChatStreamProvider` owns the one `EventSource`, the participant set, and the unread count; screens attach with `useChatStreamListener`. Scoped to the chat screen the stream would drop on every tab switch and the other tabs would neither chime nor badge. This does not weaken the autosuspend argument — what closes the stream is the app backgrounding, unchanged
- The provider is the single place a new message becomes perceptible: the chime (`shared/sound`), the in-app notice on a non-chat tab (`DESIGN.md § 7.14.`), the tab-bar badge, `navigator.setAppBadge`. A message that is mine is none of those — the stream echoes my own send back (§ 8.5.)
- `EventSource` auto-reconnects only for drops it notices. A fatal error (a 401, or a body that is not `text/event-stream`) leaves `readyState === CLOSED` permanently, so `onerror` reopens by hand after `SSE_RETRY_DELAY` and the open path treats a `CLOSED` source as no source. Guarding on "a source object exists" instead kills live delivery for the life of the page after one expired session. Handlers are read through a ref, so a new handler identity cannot rebuild the connection every render
- The stream closes when the tab backgrounds, so Neon compute can autosuspend
- **Resume is the normal sync path, not an error path.** The stream is closed on purpose, so every return has missed events — and an iOS home-screen PWA restores the frozen page rather than navigating, so the Server Component render does not re-run
  - The catch-up hangs off **`onopen` _and_ the resume events**, and is plain `fetch` either way — never gated on the socket. `onopen` covers every connect (a fresh `EventSource` sends no `Last-Event-ID`, leaving two gaps only this closes: between the server render and the socket opening, and the one a reconnect leaves on a page that never buffered an event id). Hanging it off `onopen` **alone** was the iOS PWA bug — the screen stays stale as long as the reconnect takes, forever if it never lands
  - **Resume observes `visibilitychange`, `pageshow`, `focus`; background observes `visibilitychange` and `pagehide`.** iOS is inconsistent about which a standalone-PWA app-switch produces and one resume commonly fires several, so the catch-up is coalesced inside `SSE_SYNC_COALESCE_WINDOW`
  - **A restored iOS page keeps a dead socket at `readyState === OPEN`** — the system tears the connection down while frozen and never tells the object, so it emits no `error`. The zombie is detected by **silence**: every `message` / `user` / `ping` is timestamped, and a resume finding nothing newer than `SSE_STALE_AFTER` closes the source before reopening. Do not replace this with a "was the page hidden" flag — the freeze can arrive without a hide event
  - It is `fetch(/api/messages?after=…)` paged until a short page, plus `fetch(/api/users)`
  - It pages from a **local** copy of `newestKnownId`, advanced only by what the loop itself fetched. Read from the ref each round, a live event landing mid-loop would carry it past a page the fetch has not covered — and nothing asks for that range again
  - `after=0` is a **valid** cursor, not an absent one: a client whose window is still empty catches up from the start. Falling back to the cursorless newest page strands everything behind it unreachably, since `hasOlder` is `false` on a short first page
- **Received messages are deduplicated by id** and merged by sorting, never appending — replay and catch-up overlap by design, and an out-of-order commit can arrive behind a message replay already delivered
- Multi-device needs no extra mechanism: `user_changed` is a conversation-wide broadcast, so "my other device" and "the other person's phone" are both just another subscriber, and a client receiving the echo of its own change refetches idempotently

### 8.5. Sending ✅

The client generates `client_msg_id` (uuid) and renders optimistically; `POST /api/messages` uses `ON CONFLICT (client_msg_id) DO NOTHING` so a retry cannot duplicate a row; a retry affordance shows on failure.

- The re-read after a conflict is scoped to `sender_id` and `deleted_at IS NULL` and answers **409** when it misses. `client_msg_id` is unique table-wide rather than per sender, so matching on it alone would return the _other_ user's row and swap the optimistic bubble for a stranger's message
- The SSE echo is matched to the optimistic entry by `client_msg_id` and replaces it. The echo routinely beats the POST response, so the pending bubble retires on whichever arrives first
- **Every send goes through one delivery queue**, not one chain per call. `messages.id` is assigned by the POST, so a caption sent alongside attachments would otherwise be POSTed while the uploads were still running and land _above_ the photos on every other client and every reload — the reverse of the order it was optimistically rendered in

### 8.6. Message Search

**Why substring matching**: Postgres FTS has no Korean morphological dictionary and `'simple'` only splits on whitespace — Korean attaches particles (조사) to nouns, so `저녁` fails to match the stored `저녁을`. Korean-aware parsers (`mecab-ko`, `pg_bigm`) cannot be installed on Neon. **`pg_trgm` + `ILIKE`** is language-neutral and matches substrings, so the particle problem cannot occur.

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
- [ ] Media and emoticon messages are excluded from search
- [ ] Empty states for "no query yet" and "no results"

### 8.7. Display Names and Profiles

Landed apart from the avatar image, which needs the profile editor of § 12. (step 10) — the § 9. media route it reads through now exists.

- The name shown in chat is **the nickname each user set for themselves in Settings** (`users.nickname`, § 12.); the Google account name is only the first-login default. There is **no** feature for naming the other person (KakaoTalk's per-contact rename)
- **Never copy the name or avatar onto the message row.** The sender resolves against the participant set at render time, so a rename **retroactively changes every past message**, including § 11.5. system sentences. That is intended
- A nickname or avatar change reaches every other **open** screen over `user_changed` (§ 8.4.). A _fresh load_ is already correct, because § 5.'s opaque token is resolved against `users` on every request and carries no stale copy unlike a JWT; it just cannot push to an open screen. Answering the event is one `GET /api/users` — denormalized, it would have been a backfill
- Empty-nickname fallback is the email local part, applied in `toParticipant` (§ 8.4.); no-avatar fallback is an initial-letter avatar (DESIGN § 7.7.)
- [ ] Point the chat avatar at `GET /api/media/{avatarMediaId}` once the R2 pipeline lands (step 6)

### 8.8. Read / Unread

Landed: the cursor lives in `users.last_read_at` (no per-message `read_at`, no members table), `countUnreadMessages` joins `users` on the requesting id so the badge stays one round trip, and `POST /api/chat/read` writes the cursor while the chat screen is mounted (`ChatRoom` declares this with `setIsReading`).

- Throttled on the **leading** edge at `READ_CURSOR_THROTTLE`, because every UPDATE that lands fires `user_changed` at the other device. Three posts are **unthrottled and none is optional**: **entering** (a throttled entry parks the cursor behind a message already on screen), **leaving**, and **backgrounding** (the app going away is not a `ChatRoom` unmount, and is the likeliest way to end a session). A cursor parked a throttle window behind turns the last message read into a push notification
- The UPDATE **must** carry `WHERE last_read_at < $new`. The same person can have two devices open, and a late stale request would move the cursor backwards — the unread divider jumps back into read history and the other side's `1` markers reappear after clearing. The guard is also what makes a no-op UPDATE silent
- The client sends **no timestamp**; the server stamps `now()`, so a skewed device clock cannot push the cursor into the future and hide messages it never showed
- `GET /api/chat/unread` — the count for the tab-bar badge and the § 16.1. push payload. The shell's running total is optimistic and blind to what landed while the stream was closed, so a resume **replaces** it rather than adding to it
- Clearing the sender's `1` markers needs no new plumbing: the write touches `users`, so the § 6. trigger fires `user_changed` and § 8.4. delivers it
- [ ] A message is unread when `message.created_at > otherUser.last_read_at` — a **boolean**, correct only for two participants (§ 6.). The cursor is written; the `1` marker beside a bubble and the unread divider are still to draw (`DESIGN.md § 7.`)

---

## 9. Media Storage (R2)

Landed apart from the blurhash placeholder and the delete path. Contract:

- [x] `POST /api/media/upload-url` issues a **pair** of presigned PUTs — the object and its `{key}_thumb` sibling — and `POST /api/media` registers the result. The upload goes **client → R2 directly**, which is what gets a full-resolution iPhone photo past Vercel's 4.5MB request body limit, and what makes `XMLHttpRequest`'s `upload.onprogress` a real byte count rather than a fiction
- [x] **The key is built server-side from the uploader's id** (`chat/{userId}/{uuid}`) and never read off the request. A signature the browser could aim is a signature that overwrites any object in the bucket. `POST /api/media` re-checks the prefix before it will claim an object
- [x] **`POST /api/media` is the only place § 14.'s type and size limits actually hold — for the thumbnail as much as for the original.** Verified against the live bucket: **R2 enforces neither the signed `Content-Type` nor any size on a presigned PUT** — a mismatched `Content-Type` is accepted and stored. So the server `HeadObject`s both keys, reads back what R2 really holds, and refuses to write a `media` row for anything outside the allow-list. Nothing in the app addresses R2 by key, only by `media.id`, so an unregistered object is unreachable
- [x] Caps: **50MB per photo, 500MB per video** (`shared/config/media.ts`). The video ceiling is an upload-reliability limit, not a storage one — a presigned PUT is one request with no resume, so raising it means adopting multipart upload, not a bigger number
- [x] `GET /api/media/{id}?variant=thumb|original` validates the session and `302`s to a presigned GET. `variant` defaults to `thumb`; only the fullscreen viewer asks for `original`. Same-origin, so a bare `<img src>` carries the session cookie with no fetch wrapper. `Cache-Control: private, max-age` is **shorter than the signature's expiry**, or the browser replays a cached redirect to a URL R2 has stopped honouring
- [x] **Never rely on a UUID in the URL as access control** — every read revalidates the session **and then checks the object itself**: readable when the caller owns it, or when it hangs off a message that has not been deleted. A session alone was enough while chat was the only scope, but `buildStorageKey` already declares `avatar` and `emoticon`, and an unposted object of either would have been reachable by id. An unreadable id answers 404 rather than 403, so the response cannot confirm it exists
- [x] **Saving the original is a `Content-Disposition` on the presigned GET**, requested with `?download=1`. An `<a download>` is not enough: the route answers a 302 and the spec makes the browser drop the attribute once the navigation resolves cross-origin, which in a standalone PWA replaces the app with a bare asset view and no way back
- [x] Thumbnails are rendered in the browser at pick time (long edge 720, JPEG) and uploaded beside the original. For a video the same slot holds the **poster frame**, extracted by seeking a decoded `<video>` onto a canvas — which on iOS requires `muted` + `playsInline` + an actual `play()`, since WebKit will not decode a frame for a video that has never played. The seek is guarded on both sides: a container whose `duration` is not known at `loadedmetadata` is `NaN`, and assigning that to `currentTime` throws inside the event handler, while seeking to the position the video already holds fires no `seeked` at all — either way the promise would never settle, and decoding is serial, so one such file silently swallows the rest of the pick. A timeout backs both guards
- [x] R2 credentials live only in server env. `shared/storage` is `server-only`; `toMediaUrl` deliberately lives in `shared/config` instead of `entities/media`, because a client value-import from that barrel drags `server-only` into the browser bundle
- [x] Read path for chat: the `message_media` rows for a whole page arrive in **one** query, ordered by `sort_order`, and only when the page actually holds an attachment
- [ ] Use `media.blurhash` as the pre-load placeholder for grid and bubble images. Box reservation (§ 8.3.) is done and works without it, so this is polish
- [ ] Deleting media also deletes the R2 objects (`deleteObjects` exists and is unused; the interaction with chat is § 18. #1)
- [ ] An upload that is registered and then re-PUT before its URL expires would swap the bytes under a validated row. Harmless with two trusted users, and the fix — invalidating the ticket at registration — is only worth it if this ever stops being a two-person app
- [ ] **R2 bucket configuration is a deploy step, not code** (§ 15.): the bucket must be private with public access fully disabled, and its CORS policy must allow `PUT` from the app origin, or every upload fails preflight

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
  - [ ] **Do not bake the name into the stored text.** Store `sender_id`, `system_action`, and the `event_title` / `event_starts_at` snapshot, then **compose the sentence at render time from `users.nickname`** so a rename updates past system messages too (§ 8.7.). The event snapshot is deliberate, not a violation: a delete notice must still say which event it was, and its `events` row is gone. Only the _user_ name must never be copied
  - [ ] Post on create, time change, and delete. **Do not post** when only the title or description changed
  - [ ] This rides the existing SSE pipeline, so it costs no additional infrastructure
  - [ ] Render as a centered pill with no bubble (same treatment as the date divider — DESIGN § 6.4., § 6.5.); tapping navigates to the event
- [ ] **Upcoming-events card** directly under the D-day header, summarizing the next one or two events; hidden entirely when there are none
- [ ] **A dot on the Calendar tab-bar icon when there is an event today** (a single dot, not a count)
- [ ] **Empty state** for a day with no events (DESIGN § 7.6.)

### 11.6. Notifications ✅

Landed as § 16.1. Calendar changes reach the user as § 11.5. chat system messages on the same pipeline; **there is no calendar-specific notification and no scheduler.**

---

## 12. Settings Tab

- [ ] Profile — change nickname, upload/change profile image (via R2)
  - [ ] The nickname set here is exactly what appears as the sender name in chat and inside system sentences (§ 8.7.), initialized from the Google account name at first login and owned by the user thereafter
  - [ ] Saving needs no explicit broadcast — the UPDATE lands on `users`, so the § 6. trigger fires `user_changed` and every open screen refetches (§ 8.4.)
- [ ] Entry point to the emoticon settings screen
- **No camera-permission toggle.** Taking a photo goes through `<input type="file" capture>`, which hands the shot to iOS's own camera app — the web page never touches the camera, so no site permission is created. A toggle would have no state to read and nothing to switch off
- [x] **알림** — the push toggle (§ 16.1.), **per device** rather than per account, so it reflects this browser's subscription rather than a stored preference. Three inert states carry their own copy: permission denied (only the browser's site settings can undo it), unsupported (iOS Safari tab — install to the home screen first), and in flight
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

Landed: `app/robots.ts` (`Disallow: /` for every agent), root layout `robots: { index: false, follow: false, nocache: true }`, `X-Robots-Tag: noindex, nofollow, noarchive` on every path, and `Strict-Transport-Security` / `X-Content-Type-Options` / `Referrer-Policy: no-referrer` / `X-Frame-Options: DENY`. **Do not generate a sitemap.** Proxy-matcher exclusions are listed in § 7.

- [ ] Every API route validates the session (401 when unauthenticated)
- [x] Upload MIME/extension allow-list and a size cap — enforced at registration against **both** objects of the § 9. pair. The `_thumb` sibling is checked as strictly as the original (`image/jpeg`, `MAX_THUMBNAIL_SIZE`): it is what every chat cell, grid tile and video poster loads, so leaving it unchecked is the same hole by another name
- [x] `POST /api/messages` verifies that every `mediaId` is a registered object **owned by the sender** before attaching it. `message_media.media_id` is a foreign key, so an unregistered id would surface as a 500 rather than a 400, and nothing else stopped one user hanging the other's objects off their own bubble
- [ ] Rate-limit the login callback endpoint
- [ ] Error responses must not leak internal details

---

## 15. Deployment

- [ ] Connect the Vercel project to the private GitHub repository
- [ ] Custom domain `jandh.jeheecheon.com` + DNS CNAME + automatic HTTPS
- [ ] Environment variables — `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ALLOWED_EMAILS`, `RELATIONSHIP_START_DATE` (ISO `YYYY-MM-DD`), `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `APP_URL`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
- [x] `maxDuration` for the SSE stream function — `300`, on the route segment (§ 8.4.)
- [ ] Include `lint:steiger` in `pnpm build` so architecture violations fail the deploy
- [ ] Separate dev and production databases using Neon branches
- [ ] **R2 bucket setup**: private with public access disabled, plus a CORS policy allowing `PUT` from the app origin — without it every § 9. upload fails preflight and no code change can fix it

### 15.1. Refreshing a client across a deploy

An installed iOS PWA is not reloaded when the user reopens it — the system restores the suspended process, so a phone that was last opened before a deploy keeps running the old bundle indefinitely. This is not a caching problem: `sw.js` registers no `fetch` handler and caches nothing (§ 16.1.), so there is no stale cache to invalidate, only a stale process to replace.

- [x] The server identifies its deployment with `BUILD_ID` — `VERCEL_DEPLOYMENT_ID`, falling back to `VERCEL_GIT_COMMIT_SHA`, then to `development`
- [x] `/api/chat/stream` emits `event: build` once per connection, ahead of the replay. It carries no `id:`, for the same reason `user` does not — the reconnect cursor is a `messages` bigserial
- [x] The client compares each `build` against the first one it saw. It never compares against a value baked into the bundle: a browser bundle cannot read a non-`NEXT_PUBLIC_` variable, so the two sides would always disagree
- [x] The stream already reconnects on every iOS resume (§ 8.4.), so the signal arrives at exactly the moment a suspended client wakes up. No poll and no second connection
- [x] A detected deploy reloads immediately **unless** the screen holds unsent work — composer text, staged attachments, or a send in flight. Those register through `useUnsentWork`, and the reload retries every `APP_REFRESH_RETRY_DELAY` and on every backgrounding until they clear
- [x] **A _failed_ send is not unsent work.** It stays in the pending list until the user retries or cancels it, and it never resolves on its own — counting it pins a user who sent a photo on a dead connection to a stale bundle indefinitely. Only `sending` holds the reload
- [x] Settings carries a manual `강제 새로고침` row on development builds only. `BUILD_ID` is constant locally, so nothing else can exercise the reload path there
- [ ] Enable Vercel **Skew Protection** — it keeps a superseded deployment's chunks reachable, so a client that has not refreshed yet fails softly instead of 404-ing on a missing chunk

---

## 16. Later (not implemented now)

- [ ] Dark theme — fill in the `.dark` block in `theme.css`, remove `forcedTheme`, reveal the Settings toggle
- [ ] Offline caching (the caching role of a service worker — separate from push)
- [ ] Data backup / export

### 16.1. Push Notifications ✅

Landed (§ 18. #8); it reverses the "no service worker" decision in § 7. Contract:

- **Two channels, never both.** App open is SSE's job (§ 8.4.) — the shell chimes, raises the in-app notice, moves the badge. Backgrounded or closed is Web Push's job. They are made mutually exclusive **in the worker**: `sw.js` calls `clients.matchAll` and shows nothing if any window reports `visibilityState === "visible"`. Do **not** widen that test to "a window exists" — a suppressed notification is only permitted while a visible one is on screen, and every push must otherwise produce a banner (`userVisibleOnly`)
- **Sent at INSERT time, from the request that inserted.** `POST /api/messages` dispatches inside `after()`, so the fan-out never sits between the sender and their 201. This is why push costs Neon's autosuspend **nothing**: the compute is already awake because the message was just written. Nothing polls, nothing is scheduled, no process is resident
- **Only event-driven notifications are in scope**, because serverless has no process that wakes at a given time: "new message arrived" is the **only** trigger. Per-event reminders and a morning digest are **excluded**, as is minute-granularity cron — the objection is operational, not cost: polling keeps the Neon compute awake 24/7, defeating exactly what § 8.4.'s background close exists to allow. It would also grow deployment targets from one to two plus a shared secret, fail silently if the cron stopped, and need its own duplicate-send state. Calendar awareness rides the § 11.5. system messages instead
- **iOS.** Web Push works from 16.4 but **only for a home-screen PWA**, never a Safari tab. No UA sniffing is needed — iOS exposes `PushManager` only in the installed case, so the support check falls through to `unsupported` on its own. Deleting the app from the home screen destroys the subscription without telling the server, which is why `PushSync` re-saves on every launch
- `push_subscriptions` is keyed on the **installation**: `endpoint` is unique table-wide and the upsert moves `user_id`, so two accounts sharing one browser cannot leave the row pushing to the previous account. `ON DELETE cascade` from `users`, plus a `user_id` index for the send-path fan-out
- Env: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. The public key is `NEXT_PUBLIC_` because the browser needs it to subscribe; `ensureEnv` cannot reach it in the client bundle, so a missing key surfaces as the disabled Settings toggle rather than a throw (`AGENTS.md § 6.2.`)
- A `404` or `410` from the push service is **final** — delete the row rather than retrying. `sendPush` never throws; a dead device must not fail the send that triggered it
- The permission prompt MUST fire inside a user gesture, so `subscribeToPush` awaits nothing before `Notification.requestPermission()`
- The banner carries the sender's name resolved at send time. This does **not** violate § 8.7.: a notification is a point-in-time artifact and the worker holds no session to re-resolve one
- One conversation (§ 6.), so every banner collapses onto one `tag` with `renotify` — the newest message replaces the previous banner instead of stacking. The tag lives in `sw.js` alone: a worker is served raw from `public/` and cannot import `@/shared/config`, so a mirrored constant would be a second source of truth nothing checks
- `navigator.setAppBadge` carries the recipient's unread count (§ 8.8.), set from both the worker and the shell (`shared/badge`). Absent outside installed PWAs, so every call is optional. The shell **must** rewrite it on resume rather than leaving it to a count change — the worker moves the badge while the page is frozen, and a resume into a count that is already `0` renders no effect
- The chime's `AudioContext` is unlocked from **every** pointer gesture, not just the first: iOS interrupts the context on backgrounding and never resumes it, so a one-shot unlock leaves the app permanently silent after the first app-switch
- A subscription the server failed to store reports the toggle as **off**. It delivers nothing, and turning it back on re-saves the same subscription
- **The launch sync and the toggle write the same status, and the later write is not the newer intent.** `serviceWorker.register()` can take seconds on a first visit, so a toggle can grant permission, subscribe and store the row while the launch sync is still resolving against a permission that was `default` when it sampled it. The hook settles this by request id — only the newest claim may write — because the losing order is silent: a stored subscription with the switch showing **off** and no failure to report
- A refused or dismissed permission prompt **resolves** (`blocked` / `off`) instead of throwing, so turning the toggle on and landing anywhere but `on` raises the `알림을 켜지 못했어요` toast — otherwise the switch snaps back with no explanation. The toast states only the failure; the recovery step (`브라우저 설정에서 이 사이트의 알림을 허용해 주세요`) belongs to the row description for `blocked` and MUST NOT be duplicated into the toast
- [ ] A device list in Settings (`user_agent` and `last_success_at` are stored for it and nothing reads them yet) — step 10 of § 17.

---

## 17. Implementation Order

1. ✅ Project setup + FSD scaffolding + design tokens + base components (§ 1.–§ 4.)
2. ✅ Auth + session (§ 5.) — highest-risk area, so it went first. **The real-device iOS PWA check (§ 5.3.) is still open**
3. ✅ Database schema + migrations (§ 6.)
4. ✅ Layout + tab bar + PWA manifest (§ 7.)
5. **Chat tab (§ 8.) — in progress.** Static UI → message CRUD → infinite scroll → SSE ✅, read cursor ✅; the `1` marker and unread divider (§ 8.8.) and search and jump (§ 8.6.) remain
6. ✅ R2 media pipeline + sending photos and videos in chat (§ 9.)
7. Gallery tab (§ 10.)
8. Emoticons (§ 13.)
9. Calendar tab (§ 11.)
10. Settings tab (§ 12.)
11. Security hardening + deployment (§ 14., § 15.)

---

## 18. Undecided — Ask, Do Not Guess

Deliberately left open. When work reaches the feature, **confirm with the user**, then update this document.

| #      | Item                                                                                                          | Needed by             | Notes                                                                                                                                                                                                               |
| ------ | ------------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1      | What happens to a chat message when its image is deleted from the gallery — delete it, or leave a placeholder | Gallery (§ 10.)       | Affects the schema (whether `media.deleted_at` is needed)                                                                                                                                                           |
| 2      | How emoticon assets are sourced and how packs are composed                                                    | Emoticons (§ 13.)     | The picker grid cannot be designed until the aspect ratios are known                                                                                                                                                |
| 3      | Emoticon picker dimensions — panel height, pack tab bar, grid density                                         | Emoticons (§ 13.)     | DESIGN § 9.                                                                                                                                                                                                         |
| 4      | Calendar event color set (6–7 warm tints that do not clash with the accent)                                   | Calendar (§ 11.)      | DESIGN § 9.                                                                                                                                                                                                         |
| 5      | Motion duration / easing token scale                                                                          | When animation starts | Only the 1.5s search flash and the tab `scale-[0.96]` are specified. DESIGN § 9.                                                                                                                                    |
| 6      | Viewer **pinch-zoom** bounds                                                                                  | Gallery / viewer      | Must be tuned on a real device. The swipe half is settled — native scroll snapping, no threshold. DESIGN § 9.                                                                                                       |
| 7      | Dark palette hex values                                                                                       | Dark theme (§ 16.)    | Hand-tune; never arithmetically invert. DESIGN § 5.4.                                                                                                                                                               |
| ~~8~~  | ~~**Whether to adopt push notifications (new-message only)**~~                                                | —                     | **Decided: adopted.** Landed as § 16.1. **Time-based notifications remain out of scope**                                                                                                                            |
| 9      | Whether a `scope = 'mine'` event shows its **title** to the other user, or only "busy"                        | Calendar (§ 11.5.)    | Currently specified as showing the title                                                                                                                                                                            |
| ~~10~~ | ~~**Maximum images per message, and the grid layout beyond that count**~~                                     | —                     | **Decided: selection is unlimited; a send splits into consecutive bubbles of 9.** So there is no `+N` overflow cell and no attachment is ever hidden behind one. Caps are per file — 50MB photo, 500MB video (§ 9.) |
