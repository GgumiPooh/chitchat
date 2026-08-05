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

**Current state** — § 17. steps 1–4 done. Step 6 (R2 media pipeline, § 9.) done, and with it photo and video messages: picker, editor, direct upload with progress, retry and cancel, media bubbles, and the fullscreen viewer. Step 5 (chat) otherwise partly done: text and system bubbles, cursor pagination, virtualization, optimistic send, copy/delete, SSE delivery (§ 8.4.), render-time names (§ 8.7.), push (§ 16.1.), read cursor (§ 8.8.). Step 8 (emoticons, § 13.) is done and was respecified along the way — packs and items are authored in the app rather than seeded, so there is no asset drop and no seed script; an item is one image slot (§ 13.2.), editable after upload, and a pile of images can be added as one item each (§ 13.4.). Replying (§ 8.9.) landed after that and brought § 8.6.1.'s jump machinery with it, since a quote needs the same "go to that message" path a search result does. **Open in chat**: the `1` marker and unread divider (§ 8.8.), and search itself (§ 8.6.). Step 7 (Gallery, § 10.) is done — the month-sectioned grid, keyset paging, the viewer, multi-select with save and delete, and adding photos; only the jump-to-message link is open, since it rides § 8.6.1. Step 9 (calendar, § 11.) is done: the D-day band and derived anniversaries, the month grid with scope- and colour-coded markers, event CRUD in one form, the chat system notice with its tap-through, the upcoming card, and the tab-bar dot — leaving only a "jump to today" control. It needed no migration (`events` landed with § 6. in `0001`) and no new dependency.

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
- **Check `package.json` before adding a dependency** — R2, push, virtualization, query, validation, image cropping (`react-advanced-cropper`, § 9. — it replaced `react-easy-crop`, whose crop box cannot be resized, so no free-form crop was expressible), client storage (`synced-storage`), and drag-and-drop reordering (`@dnd-kit`, § 13.5.) are all installed. **There is no remaining unmet dependency**; a new one needs the user's approval before it is added

---

## 2. FSD Structure ✅

```
app/                     Next routes — thin, delegate to src/pages
  (auth)/login/  (main)/{chat,calendar,gallery,settings}/  api/{auth,chat,media,emoticons}/
  robots.ts  manifest.ts  icon.svg  favicon.ico
pages/                   EMPTY SENTINEL — README only, no route files
proxy.ts                 Next 16's renamed Middleware (§ 5.2.)
src/
  app/       providers / styles(globals.css, theme.css) / fonts
  pages/     login, chat, calendar, gallery, settings, emoticon-settings, emoticon-pack
  widgets/   tab-bar, install-guide, chat-room, gallery-grid, calendar-month, settings-form
  features/  session, send-message, chat-stream, push-notifications,
             upload-media, author-emoticon, emoticon-prefs, update-profile, manage-event
  entities/  user, message, push-subscription, media, event, emoticon
  shared/    db, auth, push, sound, storage, api, config, lib, theme, ui
```

- The session slice is `session`, not `auth` — `features/auth` collides with the `shared/auth` segment name (`fsd/ambiguous-slice-names`)
- The composer and emoticon picker are **`features/send-message/ui/…`, not widgets**: `widgets/chat-room` renders them, and a widget cannot import a sibling widget (`fsd/forbidden-imports`)
- `features/author-emoticon` reaches `features/upload-media` through **`@x/author-emoticon`**, never its barrel — two slices on the same layer, so the cross-import needs the FSD gate (`fsd/forbidden-imports`). `entities/emoticon/@x/message` is the same arrangement one layer down, and `features/upload-media/@x/send-message` is the third
- **`uploadDraft` lives in `features/upload-media`, not in `send-message`.** Chat and the gallery (§ 10.) both put an attachment in R2, and the slice named for uploading is where the one implementation belongs; `send-message` reaches it through the `@x` gate above
- **`MediaViewer` and `MediaCell` live in `shared/ui`.** `widgets/chat-room` and `widgets/gallery-grid` both render the fullscreen viewer, and a widget cannot import a sibling widget — so the shared layer is the only place the two can meet
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
- **One bubble is one `messages` row regardless of attachment count**: 3 photos = 1 message row + 3 `message_media` rows, which is why there is no `messages.media_id`. `sort_order` preserves the sender's order. `media_id` **must not** cascade, and carries its own index, since the PK cannot serve lookups by media
- **A gallery delete is two columns on `media`, not a `deleted_at`** (§ 10., § 18. #1.). `gallery_hidden_at` takes a photo out of the grid and is read **only** by the gallery query, so the bubble that carries it goes on rendering; `gallery_added_at` marks one uploaded straight into the gallery. A row with no `message_media` child at all is not hidden but **deleted outright**, rows and R2 objects together — nothing was rendering it, and the non-cascading FK above is what makes "has a child" the safe test for that. § 13.4.'s cache window does not apply: an edit leaves the row in place while swapping the object behind it, whereas here the row a browser would ask for is gone, so the request 404s instead of replaying a redirect to a missing key
- `messages.event_id` is `ON DELETE SET NULL`; § 11.5. composes its sentence from the `event_title` / `event_starts_at` snapshot, because a delete notice outlives its `events` row. Only the **user name** is resolved at render time (§ 8.7.)
- `messages.reply_to_id` is a **self-FK**, `ON DELETE SET NULL`, and carries **no snapshot of what it points at** — § 8.9. gives the reason it is the opposite call from the line above. It is orthogonal to `type`, so it stays out of the payload CASE and takes a CHECK of its own for the one rule it needs (no system parent). It has **no index**: the only lookup is parent-by-id, which is the primary key
- `events.ends_at` is NOT NULL — the create form defaults it rather than admitting an open-ended event, which would need its own branch in every month-grid calculation. `color` is nullable until § 18. #4. **Recurrence is yearly-only** (anniversaries): never introduce RRULE or a general recurrence engine — project `yearly` rows onto the requested year on read. The relationship start date, 100-day marks, and yearly anniversaries are **not rows** (§ 11.2.)
- Indexes: `media(created_at DESC, id DESC)`, `message_media(media_id)`, `events(starts_at)`, `sessions(token_hash)`, plus `pg_trgm` + a GIN trigram index on `messages.text` (§ 8.6.). `messages` needs no paging index of its own — its primary key **is** the § 8.2. cursor. The `media` index needs the `id` tiebreaker because `created_at` is the **transaction** timestamp, so a multi-image send's rows compare equal and a keyset page skips or repeats them — **paginate on the pair, never on `created_at` alone**
- **`media.created_at` is `timestamptz(3)`, and no other timestamp in the schema is.** It is half of the § 10. keyset cursor, and that cursor reaches the client as an ISO string produced from a JS `Date`, which has no sub-millisecond digits. At Postgres' default microsecond precision the cursor is therefore a _truncated copy_ of the row it names: every sibling sharing that transaction timestamp compares **greater** than it, fails `(created_at, id) < (cursor)` on the first component, and is skipped from every later page — silently, and precisely for the multi-photo send the pair cursor exists to protect. `0015` narrows the column so the stored value is exactly what the wire can express. **Never widen it back**, and never put a keyset cursor on a microsecond column without carrying full precision through the API
- Triggers: `AFTER INSERT` on `messages` fires `pg_notify('new_message', { id })`; `AFTER INSERT` **and** `AFTER UPDATE` on `users` fire `pg_notify('user_changed', '')`. Payloads are minimal because `NOTIFY` caps at 8000 bytes and § 8.4. refetches rather than trusting a payload. Two user triggers because a `WHEN` clause cannot reference `OLD` on an INSERT, so `WHEN (OLD.* IS DISTINCT FROM NEW.*)` rides the UPDATE trigger alone. That guard plus § 8.8.'s `WHERE last_read_at < $new` keeps the channel quiet under the app's highest-frequency write — **both halves are load-bearing**; dropping either puts a `GET /api/users` on every throttle tick
- `emoticon_items.width` / `height` are **required**, because the virtualizer reserves the box before the asset loads (§ 8.3.). They describe the item's one image, animated or not — an animated file is measured from its first frame (§ 13.2.)
- `emoticon_packs.thumbnail_item_id` points **into `emoticon_items`**, which points back at `emoticon_packs` — a deliberate cycle, added by a separate `ALTER TABLE` and `ON DELETE SET NULL` so removing the item a pack uses as its icon cannot remove the pack (§ 13.2.). Emoticon assets are **not `media` rows** and `emoticon_items` holds R2 keys directly; § 13.3. gives the three reasons, and the gallery one is the load-bearing one
- Two connection strings: `DATABASE_URL` (pooled, normal queries) and `DATABASE_URL_UNPOOLED` (**required** for `LISTEN` and migrations)
- **There is nothing to seed.** A `users` row exists only after that person's first login, and no other table has a bootstrap row — `scripts/seed.ts` existed for the conversation singleton alone and went with it. The extension, trigram index, and triggers live in hand-written (`--custom`) migrations, since drizzle-kit cannot infer them
- **`pnpm db:migrate` is manual and decoupled from the deploy: ship code first, migrate second.** Reversed, a first login against the previous build inserts without the new column, hits `23502`, and the OAuth catch flattens it into the generic `?error=failed` copy — nothing in the UI names the column
- **A new column the new code reads is the exception, and runs the other way round.** Drizzle's `select()` names every column, so a build that knows `reply_to_id` (§ 8.9.) cannot read `messages` at all until the column exists — `42703` on the first fetch. A nullable column the previous build neither reads nor writes is invisible to it, so **migrate first, ship second** there
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

Landed: notch-corner bubbles (mine right, theirs left), avatar + nickname on the first message of a group, one timestamp per same-minute group on its last message, date divider pills (`오늘`, `어제`, `2026년 8월 3일 월요일`), the auto-growing composer with `+` and emoticon toggle (the send button appears beside the toggle once there is something to send, rather than replacing it), long-press / right-click → `ActionSheet` (copy / delete), and the scroll-to-bottom button appearing ~200px from the newest message with an incoming count (`새 메시지 3`).

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
  - [x] Picked attachments stage in a tray above the composer, each with its own remove control and, for photos, an editor (crop + filter, `react-advanced-cropper`). Decoding is serial, so a large pick takes seconds — the tray opens on a placeholder tile rather than staying empty until the last file lands
  - [x] `heic`/`heif` stay on the allow-list because iOS hands the original over when it declines to transcode, and its thumbnail is produced by decoding it in an `<img>` — so an engine without HEIC support rejects the pick outright instead of storing something it could never render
  - [x] Sending shows real upload progress per bubble; a failure offers **재전송 / 취소**, and a retry re-uploads only the attachments that had not landed. Progress is committed only when the whole-percent figure changes — `upload.onprogress` fires per network chunk, and every commit re-renders the virtualized list
- [ ] Unread marker — a `1` beside my message, in the `unread` token (DESIGN § 4.1.4.)
- [x] Emoticon messages render as the image alone, without a bubble (§ 13.6.)
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
- `id:` goes on **message events only** — it is the reconnect cursor, a `messages` bigserial with no counterpart on `user` or `ping`. Omitting it leaves the client's last-event-ID buffer untouched, which is correct since those events are not replayable
- **A replayed row is `event: backfill`, a live one is `event: message`.** Same payload, same `id:`, same deduplication on the client — the split exists because a replay is not an arrival, and § 13.6.'s emoticon sound is the one thing that must tell them apart. Every reconnect replays, so without it a resume plays the sounds of messages the user has already seen
- Notifications resolve **one at a time behind a promise chain** — each costs a `getMessage` query, and interleaving emits rows out of id order
- `event: ping` at `SSE_HEARTBEAT_INTERVAL` keeps proxies from timing out. It is a **named event, not a `:ping` comment**: a comment keeps proxies awake but `EventSource` never surfaces it, and the client's resume path must observe the heartbeat to tell a live socket from a frozen one
- Replay is capped at `SSE_REPLAY_LIMIT`; what falls past the cap is the client catch-up's problem, not replay's, so a truncated replay costs extra requests rather than a hole. Same for a notification lost while `postgres.js` silently reconnects its `LISTEN` socket — `maxDuration` ends the invocation every five minutes and the reconnect runs the catch-up again

**`GET /api/users`** — the whole participant set, **no cursor**. Callers: first render, a `user` event, the resume catch-up

- `listUsers` projects an explicit column set and `toParticipant` resolves the name before the response is built, so **`email` and `google_sub` never leave the server**. Never `SELECT *` here: the payload reaches the browser verbatim and `google_sub` is the identity key § 5.1. matches on. `email` is read only for § 8.7.'s empty-nickname fallback
- A "changed since" cursor is **rejected**: this is a small mutable set, not an append-only log — a rename produces no new row so an id cursor never fires, and an `updated_at` cursor still misses a deletion. Two rows are cheaper to refetch whole

**Client**

- **The subscription belongs to the `(main)` shell, not the chat screen.** `ChatStreamProvider` owns the one `EventSource`, the participant set, and the unread count; screens attach with `useChatStreamListener`. Scoped to the chat screen the stream would drop on every tab switch and the other tabs would never badge. This does not weaken the autosuspend argument — what closes the stream is the app backgrounding, unchanged
- The provider delivers the message and moves the counters — the tab-bar badge and `navigator.setAppBadge`. It **alerts nobody**: the OS notification of § 16.1. is the app's one alerting channel, whether or not a window is open. A message that is mine moves nothing at all — the stream echoes my own send back (§ 8.5.)
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

**The jump itself landed with § 8.9.1.** — replying needed the same machinery first. What is left here is the search half: the result list, and navigating between results.

- [x] Tapping a result navigates to chat and **scrolls to that message**, loading context via `GET /api/messages?around={id}&limit=30`
- [x] **Reinitialize the infinite-scroll state around the jump point** so the user can keep scrolling both ways from there. It is the **window's** edges that are reset, not `newestKnownId` — § 8.9.1. gives the reason the two had to be split
- [x] Move with `scrollToIndex({ align: "center" })` and reset `firstItemIndex` accordingly (§ 8.3.)
- [x] On arrival, **flash a highlight** behind the target bubble (fades after ~1.5s)
- [ ] Previous / next navigation between results, as in KakaoTalk; returning to the newest messages reuses the § 8.1. button, which § 8.9.1. has already taught to restore the window before it scrolls
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

- [x] **`읽음` on the newest of my messages the other participant has read**, beside its timestamp. Nothing marks an unread one — silence is the resting state, and a per-bubble label would repeat one fact per row when the newest already implies every message under it. It costs no request: `users.last_read_at` is already on `Participant` and the § 8.4. stream already refreshes it

Landed: the cursor lives in `users.last_read_at` (no per-message `read_at`, no members table), `countUnreadMessages` joins `users` on the requesting id so the badge stays one round trip, and `POST /api/chat/read` writes the cursor while the chat screen is mounted (`ChatRoom` declares this with `setIsReading`).

- Throttled on the **leading** edge at `READ_CURSOR_THROTTLE`, because every UPDATE that lands fires `user_changed` at the other device. Three posts are **unthrottled and none is optional**: **entering** (a throttled entry parks the cursor behind a message already on screen), **leaving**, and **backgrounding** (the app going away is not a `ChatRoom` unmount, and is the likeliest way to end a session). A cursor parked a throttle window behind turns the last message read into a push notification
- The UPDATE **must** carry `WHERE last_read_at < $new`. The same person can have two devices open, and a late stale request would move the cursor backwards — the unread divider jumps back into read history and the other side's `1` markers reappear after clearing. The guard is also what makes a no-op UPDATE silent
- The client sends **no timestamp**; the server stamps `now()`, so a skewed device clock cannot push the cursor into the future and hide messages it never showed
- `GET /api/chat/unread` — the count for the tab-bar badge and the § 16.1. push payload. The shell's running total is optimistic and blind to what landed while the stream was closed, so a resume **replaces** it rather than adding to it
- Clearing the sender's `1` markers needs no new plumbing: the write touches `users`, so the § 6. trigger fires `user_changed` and § 8.4. delivers it
- [ ] A message is unread when `message.created_at > otherUser.last_read_at` — a **boolean**, correct only for two participants (§ 6.). The cursor is written; the `1` marker beside a bubble and the unread divider are still to draw (`DESIGN.md § 7.`)

### 8.9. Replying to a Message ✅

One nullable self-FK, `messages.reply_to_id`, and the rest is the reuse of mechanisms that were already here. Contract:

- **The quote is joined at read time, never snapshotted onto the reply.** This is § 8.7.'s argument one level out: a nickname change reaches every quote, an edited emoticon (§ 13.4.) shows its correction inside the quote, and a soft-deleted parent turns every quote of it into `삭제된 메시지예요` with no backfill. The § 11.5. counter-case does not apply — a system notice outlives its `events` row, whereas an append-only `messages` row outlives nothing
- `ReplyPreview` carries **one level and no more.** It has no `replyTo` of its own; a quote shows the message it points at, not that message's own quote, and nesting `ChatMessage` would grow a long chain's payload with it
- `text` is sliced to `REPLY_PREVIEW_MAX_LENGTH` **on the server**. The quote clamps to one line, so a reply to a 2000-character message would otherwise carry all of it to render 40 characters
- `listReplyPreviews` deliberately **does not filter `deleted_at`** — the row is what `isDeleted` is read off, and filtering it renders a deleted parent as no quote at all rather than as the sentence above. It is one query for the page, keyed by the **parent** id, for the same reasons `listMessageEmoticons` is
- **`reply_to_id` is orthogonal to `type`**, so the § 6. payload CHECK is untouched and a reply may be text, attachments or an emoticon. A **separate** CHECK refuses a system parent, because a notice is timeline furniture rather than someone speaking (`DESIGN.md § 6.5.`)
- **`ON DELETE set null`, never cascade.** Rows are only ever soft-deleted so this fires for nothing the app does, but a cascade would mean a hard delete silently took every reply to it as well
- `POST /api/messages` **checks the parent** before inserting, beside the `mediaIds` and `emoticonItemId` checks and for the same reason: an id with no row, or a system parent, would surface as a 500 rather than the 400 every other bad body gets. A soft-deleted parent is refused there rather than at the database — the row is still present, so nothing else stops a stale client quoting it
- **One submit, one quote.** Emoticon-then-attachments-then-text is up to three bubbles (§ 13.6., § 18. #10) and a pick of twenty photos is three more; the quote goes on the **first** bubble alone, since repeating it says the same sentence three times in a row
- **The migration runs before the deploy, reversing § 6.'s order.** That rule addresses a `NOT NULL` addition; here Drizzle's `select()` names every column, so new code reading a table without `reply_to_id` fails at `42703` on the first fetch, while the previous build neither reads nor writes it
- [x] `답장` is the **first** action-sheet item, on either participant's messages — replying is the most-reached-for action there, unlike copy
- [x] **A pointer gets a hover button** beside the bubble on its outer side (`AGENTS.md § 4.2.`). It is positioned out of flow: in flow it would only exist while hovered, and its appearance would shove the bubble sideways under the cursor aiming at it. `hover:` already resolves under `@media (hover: hover)`, so a touch device never reveals it and never has to — holding the bubble opens the same sheet
- [x] A staged quote is **unsent work** (§ 15.1.), like a staged emoticon
- [x] Deleting a message also retires the quotes of it **in the deleter's own window**. Every other client's next fetch already resolves `isDeleted` from the row; only the window that removed it would go on showing text it just deleted

#### 8.9.1. Jumping to the Quoted Message ✅

Tapping a quote runs § 8.6.1.'s machinery, which landed here rather than with search:

- [x] `GET /api/messages?around={id}` replaces the window; a target already in it skips the fetch, which is the common case since a quote usually points a few rows up
- [x] `hasOlder` and `hasNewer` are both set **optimistically** after a jump. `around` splits its limit over two directions, so neither half's length says whether more exists — one wasted fetch per direction is the cost, and the first short page corrects it
- [x] **`newestKnownId` does not move with the window.** It is the § 8.4. catch-up cursor and answers "what has this client been told about", which a jump into the past does not change. The window's own edges are tracked separately
- [x] **A window parked around a jump target refuses SSE insertions.** There is a gap between it and the newest message, so appending an arrival would draw it directly under history it does not follow. The cursor still advances, which is what stops `returnToLive` from refetching that ground
- [x] **`returnToLive` refetches the newest page rather than paging down to it** — the gap can be years wide and nothing in between was going to be read on the way. The § 6.7. pill is the control, and it is visible while the window is away even when the scroller is at its own bottom
- [x] **A send from a jumped-away window returns to the live edge first.** The bubble has to land somewhere the sender can see it, and that is the only place it does
- [x] The scroll waits a frame after the window commits. Virtuoso resolves an index against rows it has not been handed yet, so scrolling inside the same call stack lands on whatever the previous window held there — and the index passed is the **plain data index**, since `firstItemIndex` only offsets what `itemContent` and `computeItemKey` are handed
- [x] On arrival the row flashes `primary-tint` for `MESSAGE_FLASH_DURATION`. The flash is on the **row**, not the bubble's fill, so a media or emoticon message — which has no fill — highlights the same way a text one does
- [ ] Search (§ 8.6.) reuses all of the above unchanged when it lands; only the result list and its query are left

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
- [x] Deleting media also deletes the R2 objects — the gallery's delete does it for a photo no message carries (§ 10., § 18. #1.)
- [ ] An upload that is registered and then re-PUT before its URL expires would swap the bytes under a validated row. Harmless with two trusted users, and the fix — invalidating the ticket at registration — is only worth it if this ever stops being a two-person app
- [ ] **R2 bucket configuration is a deploy step, not code** (§ 15.): the bucket must be private with public access fully disabled, and its CORS policy must allow `PUT` from the app origin, or every upload fails preflight

---

## 10. Gallery Tab

Landed apart from the jump-to-message link, which waits on § 8.6.1.'s machinery. Contract:

- [x] Images **and videos** sent in Chat **appear here automatically** — `media` is the single source, nothing is copied. A row is in the gallery when it is not hidden (§ 18. #1.) **and** either a message that is still visible carries it, or it was uploaded straight here. That second marker is `media.gallery_added_at`, and it is needed because the `message_media` join is the only other thing that says a row is a photo rather than an upload whose send never landed
- [x] Reverse-chronological 3-column grid with month section headers (`DESIGN.md § 7.10.`), the month resolved through `toDayKey` so a photo sent at 00:30 KST falls under the month it was taken in
- [x] Cursor-based infinite scroll, paginated on the `(created_at, id)` **pair** (§ 6.) — a `created_at` cursor alone splits a multi-photo send, whose rows all carry the transaction timestamp. Both halves are required together; a half cursor is a `400` rather than a silent single-column page. The timestamp is bound as an **ISO string with an explicit `::timestamptz`**: a bare template parameter carries no column to take its type from, so postgres.js refuses a `Date`, and without the cast Postgres resolves the row-constructor parameter to `text`, where `2026-08-06T…` sorts after `2026-08-1…`. It is exact **only because the column is `timestamptz(3)`** (§ 6.)
- [x] **A page arriving that deduplication empties still advances paging.** The grid's sentinel effect keys off the load _finishing_, not off the row count changing — keyed off the count, a fully duplicate page leaves the list identical, the sentinel stays on screen, and nothing ever asks again
- [x] Tapping opens the fullscreen viewer, which swipes across the **whole loaded gallery** rather than the month it was opened in. It is the § 8.1. viewer, moved to `shared/ui` — the chat room and the gallery are sibling widgets and neither may import the other (§ 2.). Pinch zoom is still § 18. #6
- [x] **The viewer loads only the current slide and its two neighbours.** Every slide used to request its original on mount, which `MAX_MEDIA_PER_MESSAGE` bounded inside a chat bubble but nothing bounds here — opening one photo after three pages of scrolling started 180 requests for objects of up to `MAX_IMAGE_SIZE`, plus a range request per video. Slides outside the window render an empty box at the stored ratio, so the snap track never resizes as they come and go
- [x] **Explicit multi-select**, entered from a header control rather than by long-press: a tap has to keep opening the viewer, and an accidental long-press on a grid this dense is easy. `MAX_GALLERY_SELECTION` caps a selection, said in the UI rather than reported as a rejected request
- [x] **Saving the selection is one navigation per file**, staggered by `GALLERY_DOWNLOAD_STAGGER`. What saves a file is the `Content-Disposition` signed into the presigned GET (§ 9.), so `fetch`ing the bytes instead would need R2's CORS policy to allow GET as well as PUT (§ 15.) and would hold a 500MB video in memory. Navigations started in one tick collapse into one, hence the gap
- [x] Direct upload from the gallery, with an option not to post it to the conversation (`대화에도 보내기` / `갤러리에만 추가`). Files upload **one at a time** for § 13.4.'s reason, and always carry `gallery_added_at` — the user filed the photo here, so it must be in the grid whether or not the POST that follows succeeds, and it must survive that message later being deleted. A post longer than `MAX_MEDIA_PER_MESSAGE` splits into consecutive bubbles in order (§ 18. #10.)
- [x] **Selection is unavailable while an upload is in flight**, and "in flight" runs until the `postMessage` settles, not until the last byte lands. `addToGallery` puts a row in the grid before it has a `message_media` child, which is exactly what the delete path reads as "nothing renders this, remove it outright" — deleting there would pull the row out from under the send and lose the whole chunk to a foreign-key failure. The screen closes that window; the server cannot, because the two states are indistinguishable to it
- [x] **A second pick while the first batch is running is ordinary**, so the progress counter is written relatively, never absolutely. It is claimed before decoding rather than after — reading forty photos' real dimensions (§ 9.) takes seconds, and an absolute write would also let the first batch finishing zero the counter under the second and flip the screen to its empty state mid-upload
- [x] Deletion — § 18. #1., decided
- [x] **Read authorization admits a gallery-only object.** `canReadMedia` would otherwise refuse the other participant a photo that hangs off no message; the gallery is shared, so they are looking at the same grid
- [ ] A link that jumps to where the image was sent in the conversation — it needs § 8.6.1.'s reinitialize-around-a-message machinery, which is not built

---

## 11. Calendar Tab

### 11.1. D-day Header

- [x] The relationship start date comes from the **`RELATIONSHIP_START_DATE` env var** (ISO `YYYY-MM-DD`); it is **not stored in the database**
- [x] Show the elapsed day count at the very top of the tab. Following the Korean convention, **the start date itself is day 1** (`countDays(start, today) + 1`)
- [x] Compute it in a Server Component and pass it down, so a skewed client clock or timezone cannot give each user a different number. `todayKey` ships with it for the same reason — the grid's "today" cell must not be the device's opinion either
- [x] Recompute on tab focus, in case the app was left open across midnight. It is a refetch of `GET /api/calendar/summary`, never a client-side recount, or the bullet above would be undone on the first focus

### 11.2. Derived Anniversaries

- [x] **Derive from `RELATIONSHIP_START_DATE`** — no database rows, no user input: every 100 days (100 / 200 / 300 …) and yearly anniversaries
- [x] Mark them in the month grid distinctly from ordinary events — a `primary` diamond (DESIGN § 7.9.), which is why `primary` is kept out of the event colour set (DESIGN § 4.1.7.)
- [x] Show **days remaining until the next anniversary** beneath the D-day header, hidden past a one-year horizon
- [x] The derivation lives in **`shared/lib/date/calendar.ts`, not `entities/event`** — the grid derives markers for every month it is swiped to, and a value import from that barrel would drag `server-only` into the browser bundle (the § 9. `toMediaUrl` argument). Yearly anniversaries are built by calendar-field arithmetic, never by adding 365 days, so a leap year cannot walk them a day early

### 11.3. Month View

- [x] Event markers in day cells, capped at three dots
- [x] Swipe left/right to change month; the header's chevrons are the pointer equivalent (§ 4.1.). The swipe requires horizontal **intent** (|Δx| > |Δy|), or a diagonal drag would change month while the user was scrolling the shell
- [x] Tapping a day opens that day's event list in a `BottomSheet`
- [x] Timezone pinned to `Asia/Seoul` on both server and client
- [x] The grid is **always six rows**. A height that changed with the month would reflow the screen under the thumb on every swipe
- [x] The month's fetch asks for the **grid's** range, not the month's, so the adjacent-month days in the first and last rows carry their markers too
- [x] **Selecting a day moves the month with it.** The upcoming card reaches a year ahead and the grid's edge rows reach into the neighbouring months, while the day sheet can only see the range currently loaded — without it the sheet opens on `이 날은 일정이 없어요` for a day the card just said had an event
- [x] Month fetches are **request-id guarded.** Two quick swipes leave two in flight, and the slower one landing last would leave the grid showing the wrong month's dots with nothing left to re-trigger the fetch
- [x] Opening an event's actions **closes the day sheet first.** Both are modal `Drawer`s portalled to `body` and neither is declared nested, so leaving both up means two focus traps — and dismissing the top one can leave the one underneath inert
- [ ] A "jump to today" control — the D-day band and the upcoming card both navigate, so this has no room yet; it belongs beside the month label

### 11.4. Event CRUD

- [x] Create / edit / delete — title, description, start and end time, all-day flag, color, recurrence (`none` | `yearly`). Create and edit are **one form**; the fields are identical
- [x] Both users can **view and edit every event**; there are no permission tiers. No write path is scoped to `created_by`, so a missing row is the only 404
- [x] Show authorship via `events.created_by` — the avatar, in the day sheet's row
- [x] The form works in **wall-clock fields** (`<input type="date">` / `type="time"`, which iOS renders as its own wheel picker) and converts once, at submit. `TIME_ZONE_OFFSET` is a literal `+09:00` and is sound **only** because Korea observes no daylight saving
- [x] **An edit seeds from the occurrence's anchor, never its projection.** A `yearly` event edited while looking at a later year would otherwise be saved into that year and stop recurring from where it started
- [x] `PATCH` sends only what changed. The ordering check runs against the stored row when a patch moves one end alone, since the body schema can only compare two ends it was given both of
- [x] **The patch schema is built on an undefaulted shape.** `zod`'s `.partial()` makes a key optional but does **not** strip its `.default()`, so a schema shared with the create path would resolve `PATCH {"title":…}` into a body carrying every default and the UPDATE would wipe description, colour, recurrence and scope. Defaults belong to `eventBodySchema` alone
- [x] **The form's date and time fields are clearable**, so `toInstant` is nullable rather than throwing. `isDraftSubmittable` runs during render, where a `RangeError` out of `toISOString` is a blank screen rather than a disabled button

### 11.5. Sharing Features

Include only what pays off for exactly two users. Invitations, RSVP, permissions, and external calendar sync are **not adopted** — with two mutually trusting users they are pure complexity.

- [x] **Event `scope`** — `shared` (ours) or `mine` (my personal schedule), defaulting to `shared`
  - [x] `mine` events are still **visible** to the other user, **title included** (§ 18. #9) — this is a distinction, not a privacy control. The point is to communicate "I'm busy that day"
  - [x] Distinguish them in the month grid by marker shape (filled dot for `shared`, ring dot for `mine`). Shape, not colour — colour is already spent on the event's own hue
- [x] **Post a `type = 'system'` message to Chat when an event changes** — e.g. `지희님이 8월 10일 '영화 보기' 일정을 추가했어요`
  - [x] **Do not bake the name into the stored text.** Store `sender_id`, `system_action`, and the `event_title` / `event_starts_at` snapshot, then **compose the sentence at render time from `users.nickname`** so a rename updates past system messages too (§ 8.7.). The event snapshot is deliberate, not a violation: a delete notice must still say which event it was, and its `events` row is gone. Only the _user_ name must never be copied
  - [x] Post on create, time change, and delete. **Do not post** when only the title or description changed
  - [x] This rides the existing SSE pipeline, so it costs no additional infrastructure — the `AFTER INSERT` trigger on `messages` (§ 6.) is what publishes it, and the event routes publish nothing themselves
  - [x] It also raises the § 16.1. **push** banner, through the same `notifyMessageRecipients` the chat send uses. `features/notify-chat` exists so there is literally one fan-out: § 16.1. permits exactly one alerting channel, and a second copy written beside the event routes is how that stops being true. The banner's body is the notice **without** its actor, since the banner's title is already the sender
  - [x] Render as a centered pill with no bubble (same treatment as the date divider — DESIGN § 6.4., § 6.5.); tapping navigates to the event's **day** (`?day=`), which opens that day's sheet with the event in it. The day, not the event id, is deliberately the whole destination: a delete notice outlives its `events` row (§ 6.), so half of these notices have no id to carry and the calendar would need this route anyway
  - [x] The `day` parameter is **shape- and value-checked** before it reaches a date helper (`isDayKey`). `?day=` or `?day=2026-13-45` otherwise arrives as an Invalid Date, and `Intl.DateTimeFormat.format` throws on one — a 500 on a URL anybody can type
- [x] **Upcoming-events card** directly under the D-day header, summarizing the next one or two events; hidden entirely when there are none
- [x] **A dot on the Calendar tab-bar icon when there is an event today** (a single dot, not a count). Resolved by the shell's server render, not over the stream — `user_changed` (§ 8.4.) carries `users` rows, and this changes at most once a day
- [x] **Empty state** for a day with no events (DESIGN § 7.6.)

### 11.6. Notifications ✅

Landed as § 16.1. Calendar changes reach the user as § 11.5. chat system messages on the same pipeline; **there is no calendar-specific notification and no scheduler.**

---

## 12. Settings Tab

- [ ] Profile — change nickname, upload/change profile image (via R2)
  - [ ] The nickname set here is exactly what appears as the sender name in chat and inside system sentences (§ 8.7.), initialized from the Google account name at first login and owned by the user thereafter
  - [ ] Saving needs no explicit broadcast — the UPDATE lands on `users`, so the § 6. trigger fires `user_changed` and every open screen refetches (§ 8.4.)
- [x] Entry point to the emoticon management screen (§ 13.5.) — authoring, pack order, and per-pack hiding
- **No camera-permission toggle.** Taking a photo goes through `<input type="file" capture>`, which hands the shot to iOS's own camera app — the web page never touches the camera, so no site permission is created. A toggle would have no state to read and nothing to switch off
- [x] **알림** — the push toggle (§ 16.1.), **per device** rather than per account, so it reflects this browser's subscription rather than a stored preference. Three inert states carry their own copy: permission denied (only the browser's site settings can undo it), unsupported (iOS Safari tab — install to the home screen first), and in flight
- [ ] List of logged-in devices, with per-session revocation
- [ ] Log out
- [ ] The theme setting stays **hidden until the dark theme ships**
- [ ] App info / version

---

## 13. Emoticons

**Emoticons are authored inside the app.** There is no asset drop, no `scripts/seed-emoticons.ts`, and nothing to supply by hand — a user creates a pack from the Settings tab, adds items to it, and both users can send them. This reverses the earlier "supplied manually, registered by an admin script" premise, which assumed § 9. did not exist yet; it does, so the same presigned-PUT pipeline carries emoticon art.

### 13.1. Ownership and Scope

- **A pack belongs to the conversation, not to its creator.** Either user may create, rename, add to, and delete any pack; `emoticon_packs.created_by` is a record, never a permission check. This follows § 6.'s two-participant premise — an ownership tier here would be the only one in the app
- **Order and visibility are per-user and pack-level.** `user_emoticon_prefs` already carries exactly that (`enabled`, `sort_order`, keyed on `(user_id, pack_id)`); nothing is added
- **Item order is not per-user.** `emoticon_items.sort_order` is **shared** — items keep the order they were added in and both participants' pickers follow it. A per-user item table was considered and rejected: it would make the same pack look different to each user with no surface saying so, and the pack itself is already conversation-owned. **No screen reorders items**: the drag gesture was removed from the pack's grid (§ 13.4.), where it competed with the tap that opens an item's actions; only packs are reorderable (§ 13.5.)
- **`PUT /api/emoticons/packs/{id}/items` takes the whole ordered list**, because `sort_order` is positional, and renumbers it in one statement. **The route has no caller since the item drag was removed** — it is kept because the ordering it writes is still the one every picker reads — a row per UPDATE would leave the pack half-renumbered if the connection dropped between two of them. The list must be exactly the pack's current items; a stale one (the other participant added or deleted an item meanwhile) is answered `409` rather than partially applied — and the renumbering `CASE` carries an `ELSE` of the row's own `sort_order`, because the completeness check is a separate statement and a row inserted between the two would otherwise renumber to NULL and surface as a `500`. Like § 13.5., it raises no `user_changed` event — the other user picks the order up on their next load
- A user with no `user_emoticon_prefs` row for a pack sees it **enabled**, ordered after every pack they have expressed an opinion about. The row is written lazily on the first reorder or hide, so creating a pack does not fan out a row per user

### 13.2. Item Composition

One item is **one required image plus one optional sound**, two independent objects in R2.

| Slot  | Column      | Required | Notes                                                                                      |
| ----- | ----------- | -------- | ------------------------------------------------------------------------------------------ |
| Image | `r2_key`    | yes      | PNG, WebP, GIF or APNG. Everything renders this one object — an animated file simply plays |
| Audio | `audio_key` | no       | Played on tap only (§ 13.6.). An item may carry audio whether or not its image animates    |

- **There is no separate animated slot.** A still and an animation used to be two columns, two uploads and a swap at render time; the swap bought nothing an animated file does not already do by itself, and it made every screen branch on `hasAnimation` and every authoring form ask for two files to express one picture. Migration `0013` promotes the animated object into `r2_key` for the items that had one

- `emoticon_items.width` / `height` are **read from the decoded image in the browser** and stored, exactly as § 9. does for chat media — `features/upload-media` is reused rather than reimplemented. They are NOT NULL because the chat row reserves the box before the asset loads (§ 8.3.). An animated file is measured from its decoded first frame, which is the box every later frame shares
- **`updated_at` is exposed as `Emoticon.version` and rides on every asset URL.** Editing an item (§ 13.4.) swaps the object behind an unchanged item id, and the asset route answers a cached redirect (§ 9.) — without the version the browser keeps serving the image the edit replaced. A screen that holds only a pack summary carries the thumbnail item's version on the summary itself (`EmoticonPackSummary.thumbnailVersion`, read from the same row by a second join): an unversioned URL is not merely stale, it is a URL whose cached redirect names an object the edit's cleanup will remove
- **A pack's thumbnail is one of its own items**, not a separate upload: `emoticon_packs.thumbnail_item_id` is a nullable FK to `emoticon_items` with `ON DELETE SET NULL`. This replaces the old `thumbnail_key`, which required an asset that existed nowhere else and could not be chosen until after the pack was created anyway. Null means the picker tab falls back to the pack's first item
- The FK is **circular** (`packs` → `items` → `packs`), so it is added as a separate `ALTER TABLE` after both tables exist. `ON DELETE SET NULL`, never cascade: deleting the item a pack happens to use as its tab icon must not delete the pack

### 13.3. Asset Storage

Emoticon objects ride § 9.'s presigned-PUT pipeline — client → R2 directly, key built server-side — but they are **not `media` rows**, and `emoticon_items` stores R2 keys directly.

- `media` is documented as the gallery's single source (§ 10.). An emoticon registered there would appear in the gallery, and filtering it back out would mean the gallery's one source has an exception in it
- `registerMedia` requires a `_thumb` sibling of `THUMBNAIL_MIME` (JPEG). An emoticon is transparent art rendered without a bubble or background (`DESIGN.md § 6.5.`), so a JPEG derivative would show an opaque box; and it is small enough that a thumbnail buys nothing
- `media.width` / `height` are NOT NULL and an audio object has neither
- What is **not** duplicated is the § 14. enforcement itself: registration `HeadObject`s every key it is about to write and refuses anything outside the allow-list, for the same reason and by the same shared helper. R2 enforces neither the signed `Content-Type` nor any size (§ 9.)
- Key scope is `emoticon/{userId}/{uuid}` — `buildStorageKey` already declares the scope. The uploader's id stays in the key even though the pack is shared, because the key is the ownership proof at registration (§ 9.)
- **Read authorization is a plain session check**, not `canReadMedia`: packs are conversation-wide, so any signed-in participant may read any emoticon asset. This is the one place a bare session is sufficient, and it is sufficient _because_ the pack is shared — the § 9. argument against it applies to objects nobody has posted
- **`DELETE /api/emoticons/upload-url` takes back objects that landed for a submit that never produced an item** (§ 13.4.). Nothing in the app addresses R2 by key, so an object no row references is unreachable and would otherwise sit in the bucket forever. It deletes only keys under the caller's own `emoticon/{userId}/` prefix — the same ownership proof registration uses — and only keys **no `emoticon_items` row references**, so a failed retry cannot delete the assets of the item an earlier submit registered

### 13.4. Authoring

- [x] **Create a pack from a title alone.** No thumbnail, no items required — an empty pack is a valid intermediate state, because the thumbnail can only be chosen from items that do not exist yet
- [x] **Add an item from one image.** Still or animated, one slot (§ 13.2.); the sound is optional and added in the same form. An item carries **no title**: nothing renders one — the bubble is the bare image (§ 13.6.) and the picker grid is 4 squares — so the field only asked for a string that was never read back
- [x] The image is picked through `features/upload-media`'s `MediaPickerSheet` (촬영 / 고르기) and may then be cropped and filtered in its `MediaEditor`. Both are reused, not reimplemented
- [x] **A cropped emoticon is re-encoded as PNG, not JPEG.** `applyEdit` outputs JPEG for chat, which flattens alpha onto an opaque background — invisible in a bubble, glaring on the bubble-less emoticon of `DESIGN.md § 6.5.` The output type becomes a parameter; chat keeps JPEG
- [x] **A file that may animate never enters the editor.** A canvas crop decodes one frame and re-encodes a still, silently turning an animation into a picture. `image/webp`, `image/gif` and APNG are therefore uploaded byte for byte and the 편집 control is not offered for them; everything else is re-encoded to PNG at `EMOTICON_MAX_EDGE`
- [x] **An APNG is detected by sniffing, not by its type.** A `File`'s type comes from the OS extension map, which answers `image/png` for every `.png` however it was encoded — so no picker ever produces `image/apng` and a MIME test alone flattens every APNG on the still path. A picked PNG is scanned for the `acTL` chunk (which the format requires before the first `IDAT`) and treated as `image/apng` from then on. The stored object stays `image/png`, since that is what the presigned PUT was signed with and what § 14. therefore checks — `image/apng` is a client-side classification, never a stored type
- [x] The picker is restricted to images — `MediaPickerSheet` takes its `accept` from the caller instead of hardcoding `image/*,video/*`
- [x] Everything uploads on final submit, not on pick, so abandoning the form leaves nothing in the bucket. A submit that **fails after some slots have landed** — a rejected sibling upload, or a `422` from registration — gives those objects back through § 13.3.'s discard endpoint; the slots are awaited with `allSettled` rather than `all` precisely so every key that reached R2 is known to the failure path
- [x] **The editor opens over the authoring sheet, not under it.** `MediaEditor` portals into the app shell (`ShellOverlay`) while the sheet portals into `body`, so no z-index inside the shell can lift it — the sheet closes for as long as the editor is up
- [x] **A free-form crop** (`자유`, the default) alongside the fixed ratios. `react-easy-crop` has no resizable crop box, so this is what `react-advanced-cropper` replaced it for
- [x] **Set a pack's thumbnail by choosing one of its items**, from the pack's own detail screen
- [x] **Items are not reorderable.** Long-press-and-drag on the grid was implemented and then removed: with no room for a grip handle in a 4-column square the cell had to carry the drag listeners itself, so the gesture sat on top of the tap that opens the item's actions. The grid renders in the server's `sort_order` (§ 13.1.); `useSortableSensors` now serves § 13.5. alone
- [x] **Edit an item after it is uploaded**, from the same sheet that authored it: replace the image, add a sound, remove a sound. `PATCH /api/emoticons/items/{id}` takes only the slots that changed — an absent `audioKey` keeps the sound the item has, an explicit `null` removes it — and a replaced image must arrive with its new measurements, since § 8.3. reserves the bubble's box from them. The objects the edit detaches are deleted from R2 by the same § 9. cleanup a delete uses, but **only once the cache window has passed** (`deleteObjectsAfterCacheWindow`): the other participant is still holding the pre-edit `version` and its cached redirect, so deleting immediately turns their emoticon into a broken image rather than a stale one for up to `MEDIA_CACHE_MAX_AGE`. Deleting an item is unaffected — the row that rendered it is gone too. The timer is in-process, so a restart inside the window leaves the object unreachable in the bucket; that is accepted over a durable queue for a two-person app
- [x] **An item already sent in chat may still be edited**, unlike deleting one (§ 13.6.). The message references the _item_, not the object, so no foreign key is in the way, and the corrected image showing up in the history is the point of editing it. The `updated_at` bump is what makes the change visible past the cached asset redirect (§ 13.2.)
- [x] **Adding a pile of images at once**, one item per image. The pack screen's `+` opens a sheet offering 하나씩 추가 — the authoring sheet of the bullets above, unchanged — and 여러 장 한 번에 추가, which opens the picker with `multiple`. Several files go straight to registration with neither editor nor sound (a single file picked there still opens the authoring sheet) — both are single-item decisions, and a sound can be added afterwards by editing the item. Files are uploaded **one at a time**, not in parallel, because twenty simultaneous presigned PUTs on a phone network are twenty ways to time out; the grid fills in as each lands, and a per-file failure is counted and reported rather than aborting the rest. The progress line counts what is **left** (`n개를 더 올리는 중이에요`), decremented per settled file, because it sits beside a grid that is already filling in and a fixed total would contradict the rows next to it

### 13.5. Management (Settings)

- [x] A settings row (§ 12.) opens the emoticon management screen: **one flat list of packs**, matching KakaoTalk's 이모티콘 관리
- [x] **A pack is `이모티콘 그룹` in the UI and an item is `이모티콘`.** Both were called `이모티콘`, which made "이모티콘에 이모티콘을 추가한다" the only way to describe authoring. The screen titles, the create sheet, the picker's empty state and the pack's delete button all follow this split; `pack` / `item` stay as they are in code
- [x] The screen creates, **renames** and deletes packs, and the pack's own screen creates and deletes items — copy that promised only reordering and hiding under-described it
- [x] **Rename and delete hang off a gear icon on the row**, opening an `ActionSheet`. Delete used to sit in the pack screen's header one thumb-width from 이모티콘 추가, which is the wrong neighbour for it; the row also carries a chevron, since nothing else said the name was a link to the pack's own screen
- [x] **Long-press then drag to reorder**, vertical axis only, writing `user_emoticon_prefs.sort_order`
- [x] **Hide** per pack, writing `user_emoticon_prefs.enabled`. A hidden pack is hidden from the picker (§ 13.6.) for that user only — it is never deleted and the other user is unaffected. Hiding **writes the whole list's current order first**: `sort_order` is positional and a user who has never reordered has no rows at all, so writing the hidden pack's row alone would sort it against every other pack's fallback and silently reshuffle the list on the first hide
- [x] The management screen **owns the order**; the list component holds none of its own. Both are per-user state that a rename, a create or a delete on the same screen also touches, and two copies of it meant a persisted drag could be rolled back by the next rename
- [x] Reordering and hiding are **per-user by definition**, so neither broadcasts over `user_changed` (§ 8.4.) — that channel carries `users` changes, and this writes a different table. A second device of the same user refreshes on its next load
- [x] Drag-and-drop uses **`@dnd-kit`** (`core` + `sortable` + `modifiers`), the one dependency § 1. records as still missing. Its `TouchSensor` `activationConstraint` (`delay` / `tolerance`) is what makes long-press-to-drag the activation gesture rather than a plain drag, which on a scrolling list would fight the scroller

### 13.6. Picker and Bubble

- [x] The composer's emoticon toggle opens a panel whose bottom tabs are the **enabled packs in the user's order**, each tab showing its `thumbnail_item_id` item
- [x] Selecting an emoticon **stages it as a preview** above the composer, KakaoTalk-style, rather than sending on the tap. The preview autoplays an animated item with its sound and replays both on tap, and it survives the panel closing — tapping the field to type a line keeps it staged
- [x] **The staged emoticon and staged attachments are mutually exclusive.** Picking photos clears the emoticon and staging an emoticon clears the tray — § 6. gives each bubble one payload, so a composer holding both would promise a send that has no row to land in
- [x] **Emoticon and text are two messages, in that order**, when both are sent together: the emoticon bubble, then the text. Nothing is added to the schema for it — `useSendMessage` delivers on one promise chain, so `messages.id` is assigned in the order the bubbles were queued (the same guarantee attachments-then-caption already relies on). Allowing `text` on an `emoticon` row was considered and rejected: it would relax the § 6. CHECK for a combination `media` rows still could not express
- [x] A **recently used** section, ahead of the first pack
- [x] **`POST /api/messages` checks the item exists** before it inserts, like `mediaIds` before it. `messages.emoticon_item_id` is a foreign key, and a picker whose list predates the other participant deleting an item (§ 13.4.) would otherwise send its way into a `500` instead of the `400` every other bad body gets
- [x] **The panel reopens on the tab it was last left on**, per device, so the pack a user actually sends from is one tap away instead of behind 최근 사용 every time. Stored with `synced-storage`'s `useStorageState` (`localStorage`, synced across hook instances and tabs; `SyncedStorageProvider` sits in `GlobalProvider`), and it falls back to 최근 사용 when the remembered pack has since been deleted or hidden (§ 13.1.). The 최근 사용 list itself uses the same hook
- [x] **A tap outside the panel closes it**, on `pointerdown` so the gesture that starts a scroll of the history also dismisses it. The composer's own wrapper is the exception — the toggle lives in it, and closing there would fight the toggle's own handler
- [x] **Sending does not close the panel.** KakaoTalk leaves it up, and sending several emoticons in a row is the ordinary case; the composer therefore skips its post-send `focus()` while the panel is open, because that focus is what would raise the keyboard the panel may never share the screen with. The staged preview still clears, so the panel comes back empty and ready
- [x] **Swiping the grid left or right moves to the next or previous tab**, over the same order the tabs show (최근 사용 first). The larger axis of the drag wins, so a mostly-vertical flick still scrolls the grid; the ends do not wrap; and the `click` the browser fires on whatever the drag started on is swallowed, or a swipe begun on a cell would also stage that emoticon. The incoming pack slides in from the side it came from — for a tab tap too, whose direction is the index it moved by
- [x] **The panel is half the shell tall**, measured against `--viewport-height` rather than `vh` (`DESIGN.md § 3.4.`). A fixed `256px` was one and a half rows of a 4-column grid, which made every pack a scroll
- [x] **The staged preview sits at the right edge**, where the emoticon's own bubble will land (`DESIGN.md § 6.2.`), and **floats over the history rather than pushing it**: it is positioned out of the composer's flow, so the strip `--chat-bottom-gap` reserves does not grow and the messages stay exactly where they were. It is glass with a shadow (§ 6.6.) precisely because it is meant to sit over them, and the tray keeps pushing because a row of photos is not one floating object. It rides at the top of the stack, so staging from an open panel puts it **above** the panel rather than over the grid the user is still browsing — further from the send button than KakaoTalk's, which can sit against the bar only because KakaoTalk's panel is below the composer instead of above it. **That lift is clamped at the floating header.** The panel is half the shell, so on a short viewport the unclamped position is behind the header, and below about `604px` of `--viewport-height` it is off the top of the screen entirely — staging an emoticon then looks like nothing happened. Where the clamp binds the preview overlaps the panel's top rows instead, which is the one case where something has to give
- [x] **The panel opens and closes over 200ms**, the `height` of the clipping strip rather than a mount. The history follows it, because `--chat-bottom-gap` is measured from the composer's box every frame the strip grows — one animation drives both, with no second scroll animation to keep in step. The strip is `justify-end`, so the panel is revealed rising from behind the composer rather than unrolling downward. The panel stays mounted after its first open (a collapse needs something left to animate) and is `inert` while closed, since a zero-height clip still holds tab stops. **Not a `0fr`→`1fr` grid track**, which is what this was and what made the panel look like it split apart from its middle: mid-transition Chrome sizes such a track's container taller than the track it resolved (row `265px` inside a `311px` container, measured), and that difference is a gap that opens and shuts between the bottom-anchored panel and the composer. The height is `--emoticon-panel-height`, which the panel itself is drawn at, so the two cannot drift apart
- [x] **The panel is never on screen with the keyboard.** Reaching for the field closes it (`onFieldFocus`), and the render is additionally gated on `useIsVirtualKeyboardOpen` — derived rather than an effect, because Android reopens the keyboard on an already-focused field and fires no `focus` for the picker to hear
- [x] The bubble renders **the image alone** — no bubble, no border, no background, max 140×140 (`DESIGN.md § 6.5.`). The box is reserved from the stored `width`/`height` before the asset loads (§ 8.3.)
- [x] **An animated item plays because the browser plays it.** With one image slot (§ 13.2.) nothing observes visibility and nothing swaps sources — the virtualizer already unmounts the row when it leaves the window, which is what used to be worth observing
- [x] **A sound emoticon sounds at KakaoTalk's four moments, and at no other.** Selecting it in the picker, sending it, receiving it live while the room is on screen, and tapping a bubble. Everything else — scrolling past a bubble, the reconnect replay, the catch-up fetch, a page load into existing history — is silent, because the sound announces the emoticon arriving, not the emoticon being on screen
- [x] **The live arrival is told apart on the wire**, not guessed at from timestamps: § 8.4.'s replay is emitted as `event: backfill` rather than `event: message`, carrying the same rows and the same `id:` cursor. The client acts on the difference — a replayed row is deduplicated into the loaded window exactly as before, but it never sounds. Deduplication is the second guard: a message the window already holds is not an arrival however it was delivered
- [x] **My own emoticon sounds at the send, not at the echo.** The stream echoes my message back (§ 8.5.), and a sound arriving on the round trip lands a beat late and can land twice; playing it inside the send gesture is also the only version iOS permits without exception
- [x] **One shared `Audio` element plays every sound**, minted once in `shared/lib`. A per-bubble `<audio>` cannot be started by an arrival — iOS refuses to start audio outside a user gesture, and a freshly mounted element has never been in one — whereas a single element unlocked by the room's first gesture of any kind (`useSoundUnlock`) plays for the rest of the session. It also makes two emoticons in a row cut over rather than overlap
- [x] A tap also restarts the animation, so an item that scrolled past mid-loop can be replayed deliberately. A GIF or animated WebP has no seek API and re-assigning the same `src` is ignored by the cache, so the `<img>` is keyed by a replay token and remounted
- [ ] Preload the enabled packs' images so the panel does not stutter on first open

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
- [x] A detected deploy reloads immediately **unless** the screen holds unsent work — composer text, staged attachments, a staged emoticon (§ 13.6.), or a send in flight. Those register through `useUnsentWork`, and the reload retries every `APP_REFRESH_RETRY_DELAY` and on every backgrounding until they clear
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

- **Every push produces a banner. No exceptions.** `userVisibleOnly` is a promise the platform audits, not a hint: WebKit revokes the subscription after **three** pushes whose worker showed nothing, and Chrome substitutes its own "site updated in the background" banner before doing the same. The symptom is not an error anywhere — it is the Settings toggle found empty on the next launch (`getSubscription()` now returns `null`), push dead until the user re-subscribes, and a fresh `push_subscriptions` row each time they do. `sw.js` therefore **MUST** call `showNotification` on every `push` event, and **MUST NOT** test window visibility to decide whether to
- **One alerting channel, not two.** The obvious way to keep the banner from duplicating an on-screen message is to give the app its own in-app notice and let the worker stand down while a window is visible. That is the shape that lost the subscription, and no variant of it is safe — closing the banner from inside the push event reads to the platform as never having shown one. So the in-app channel is gone instead: no toast, no chime, no `shared/sound`. SSE (§ 8.4.) delivers the message and moves the badge; alerting is the OS notification's job alone, app open or not. **A message that arrives while the recipient is looking at the conversation still raises a banner** — that is the cost of keeping push alive, and it is cheaper than push dying every third message
- A consequence worth stating: with push off, unsupported, or blocked, an open app **alerts nothing at all**. The message still arrives and the badge still moves; nothing chimes and nothing pops. The Settings toggle is therefore the only alerting switch in the app
- **Sent at INSERT time, from the request that inserted.** `POST /api/messages` dispatches inside `after()`, so the fan-out never sits between the sender and their 201. This is why push costs Neon's autosuspend **nothing**: the compute is already awake because the message was just written. Nothing polls, nothing is scheduled, no process is resident
- **Only event-driven notifications are in scope**, because serverless has no process that wakes at a given time: "new message arrived" is the **only** trigger. Per-event reminders and a morning digest are **excluded**, as is minute-granularity cron — the objection is operational, not cost: polling keeps the Neon compute awake 24/7, defeating exactly what § 8.4.'s background close exists to allow. It would also grow deployment targets from one to two plus a shared secret, fail silently if the cron stopped, and need its own duplicate-send state. Calendar awareness rides the § 11.5. system messages instead
- **iOS.** Web Push works from 16.4 but **only for a home-screen PWA**, never a Safari tab. No UA sniffing is needed — iOS exposes `PushManager` only in the installed case, so the support check falls through to `unsupported` on its own. Deleting the app from the home screen destroys the subscription without telling the server, which is why `PushSync` re-saves on every launch
- `push_subscriptions` is keyed on the **installation**: `endpoint` is unique table-wide and the upsert moves `user_id`, so two accounts sharing one browser cannot leave the row pushing to the previous account. `ON DELETE cascade` from `users`, plus a `user_id` index for the send-path fan-out
- Env: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. The public key is `NEXT_PUBLIC_` because the browser needs it to subscribe; `ensureEnv` cannot reach it in the client bundle, so a missing key surfaces as the disabled Settings toggle rather than a throw (`AGENTS.md § 6.2.`)
- A `404` or `410` from the push service is **final** — delete the row rather than retrying. `sendPush` never throws; a dead device must not fail the send that triggered it
- The permission prompt MUST fire inside a user gesture, so `subscribeToPush` awaits nothing before `Notification.requestPermission()`
- The banner carries the sender's name resolved at send time. This does **not** violate § 8.7.: a notification is a point-in-time artifact and the worker holds no session to re-resolve one
- One conversation (§ 6.), so every banner collapses onto one `tag` with `renotify` — the newest message replaces the previous banner instead of stacking. The tag lives in `sw.js` alone: a worker is served raw from `public/` and cannot import `@/shared/config`, so a mirrored constant would be a second source of truth nothing checks. This is why the page closes notifications **unfiltered** rather than by tag
- `navigator.setAppBadge` carries the recipient's unread count (§ 8.8.), set from both the worker and the shell (`shared/badge`). Absent outside installed PWAs, so every call is optional. The shell **must** rewrite it on resume rather than leaving it to a count change — the worker moves the badge while the page is frozen, and a resume into a count that is already `0` renders no effect
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
5. **Chat tab (§ 8.) — in progress.** Static UI → message CRUD → infinite scroll → SSE ✅, read cursor ✅, replies and the jump they needed (§ 8.9., § 8.9.1.) ✅; the `1` marker and unread divider (§ 8.8.) and search (§ 8.6.) remain
6. ✅ R2 media pipeline + sending photos and videos in chat (§ 9.)
7. ✅ **Gallery tab (§ 10.)** — grid, paging, viewer, multi-select with save and delete, and adding photos all landed; only the jump-to-message link is open, and it waits on § 8.6.1.
8. ✅ **Emoticons (§ 13.)** — authored in the app, not seeded. Schema and migration, the asset pipeline, the authoring screens, the management list, the picker and the bubble all landed; only the picker's still-preloading is open
9. ✅ **Calendar tab (§ 11.)** — the D-day band, derived anniversaries, the month grid, event CRUD, `scope`, the chat system notice and its tap-through, the upcoming card, and the tab-bar dot all landed. Open: the "jump to today" control (§ 11.3.)
10. Settings tab (§ 12.)
11. Security hardening + deployment (§ 14., § 15.)

---

## 18. Undecided — Ask, Do Not Guess

Deliberately left open. When work reaches the feature, **confirm with the user**, then update this document.

| #      | Item                                                                                       | Needed by             | Notes                                                                                                                                                                                                                                                                                       |
| ------ | ------------------------------------------------------------------------------------------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~1~~  | ~~What happens to a chat message when its image is deleted from the gallery~~              | —                     | **Decided: neither.** The chat is the record and the gallery is a view of it, so a delete is gallery-scoped — see § 10. and the two columns in § 6. No `media.deleted_at`, and no placeholder bubble                                                                                        |
| ~~2~~  | ~~How emoticon assets are sourced and how packs are composed~~                             | —                     | **Decided: authored in the app** (§ 13.). A user creates a pack from a title and adds items from one image — still or animated — plus an optional sound. Aspect ratios are therefore arbitrary, which is what #3 must now absorb                                                            |
| 3      | Emoticon picker dimensions — panel height, pack tab bar, grid density                      | Emoticons (§ 13.6.)   | DESIGN § 9. #2 is now decided, and it decided the assets are user-authored, so the grid must hold **arbitrary** aspect ratios rather than a known set — a fixed square cell with the still `object-contain` inside it                                                                       |
| ~~4~~  | ~~Calendar event color set (6–7 warm tints that do not clash with the accent)~~            | —                     | **Decided: a closed set of six** — `clay` / `honey` / `olive` / `teal` / `blue` / `plum` (DESIGN § 4.1.7.). Three are cool, deliberately: six hues at 4px must be told apart, and a warm-only run collapses into one smear. `primary` is excluded, since the milestone diamond is `primary` |
| 5      | Motion duration / easing token scale                                                       | When animation starts | Only the 1.5s search flash and the tab `scale-[0.96]` are specified. DESIGN § 9.                                                                                                                                                                                                            |
| 6      | Viewer **pinch-zoom** bounds                                                               | Viewer (`shared/ui`)  | Must be tuned on a real device. The swipe half is settled — native scroll snapping, no threshold. DESIGN § 9.                                                                                                                                                                               |
| 7      | Dark palette hex values                                                                    | Dark theme (§ 16.)    | Hand-tune; never arithmetically invert. DESIGN § 5.4.                                                                                                                                                                                                                                       |
| ~~8~~  | ~~**Whether to adopt push notifications (new-message only)**~~                             | —                     | **Decided: adopted.** Landed as § 16.1. **Time-based notifications remain out of scope**                                                                                                                                                                                                    |
| ~~9~~  | ~~Whether a `scope = 'mine'` event shows its **title** to the other user, or only "busy"~~ | —                     | **Decided: the title is shown.** Hiding it would have made `scope` a privacy control, which § 11.5. explicitly says it is not. The ring dot is the whole distinction                                                                                                                        |
| ~~10~~ | ~~**Maximum images per message, and the grid layout beyond that count**~~                  | —                     | **Decided: selection is unlimited; a send splits into consecutive bubbles of 9.** So there is no `+N` overflow cell and no attachment is ever hidden behind one. Caps are per file — 50MB photo, 500MB video (§ 9.)                                                                         |
