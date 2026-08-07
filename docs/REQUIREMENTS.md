# J&H — Implementation Requirements

A private web app for exactly two people. An iOS PWA with four tabs: Chat, Calendar, Library (`보관함`, routed at `/gallery`), Settings.

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

- **✅ on a heading = that section is finished.** Its bullets are **invariants new code must not break**, not work to do. They are compressed on purpose: the argument that produced each rule is gone, the rule is not. Code comments cite these section numbers instead of restating them (`AGENTS.md § 7.2.`), so a line here is often its **only** written copy — deleting one deletes the reason a comment exists.
- **`[ ] = remaining work`, and this file is the authoritative spec for it.** Open items keep their full detail deliberately; do not compress them, and do not infer the design from the surrounding invariants. Tick the box in the change that lands it (`AGENTS.md § 0.3.`), then fold it into that section's invariant list on the next pass.
- A section with open work leads with **Landed:** (finished, no boxes) and then lists its `[ ]` items. A section marked ✅ has no boxes at all.
- **Never renumber a section, and never delete one** — `src/` comments reference these numbers.

### Remaining Work Index

Every open item in this document, so an agent can read one table and then only the section it needs. Nothing else is outstanding.

| Area                         | Open                                                                                                | §              |
| ---------------------------- | --------------------------------------------------------------------------------------------------- | -------------- |
| **Chat — unread marks**      | The `1` marker beside a bubble, and the unread divider. Cursor is written; only the drawing is left | § 8.8., § 8.1. |
| **Chat — scroll polish**     | Sticky date indicator, tab-return scroll restore, scroll-to-bottom marking read                     | § 8.3., § 8.1. |
| **Chat — link previews**     | Four polish/hardening items on an otherwise finished feature                                        | § 8.9.         |
| **Library**                  | Jump-to-message link — the § 8.6.1. machinery it waited on is built                                 | § 10.          |
| **Calendar**                 | "Jump to today" control                                                                             | § 11.3.        |
| **Settings**                 | Device list + revocation, app info. Theme row stays hidden                                          | § 12., § 16.1. |
| **Overlays**                 | A focus trap shared by the profile screen and the § 7.10. viewer                                    | § 12.3.        |
| **Media**                    | Blurhash placeholder; re-PUT window; orphaned avatar and background objects                         | § 9., § 12.    |
| **Emoticons**                | Preload enabled packs' images                                                                       | § 13.6.        |
| **Security**                 | Session check audit, login rate limit, error-detail leaks                                           | § 14.          |
| **Deployment**               | Vercel project, domain, env vars, steiger in build, Neon branches, Skew Protection                  | § 15.          |
| **Real-device verification** | iOS PWA keyboard geometry, cookie survival across days, the audio session across a recording        | § 4.3., § 5.3. |
| **Undecided — ask first**    | Emoticon grid density (#3), pinch-zoom bounds (#6), dark palette (#7)                               | § 18.          |
| **Later**                    | Dark theme, offline caching, backup/export                                                          | § 16.          |

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
- **Check `package.json` before adding a dependency.** R2, push, virtualization (`@tanstack/react-virtual`), text measurement (`@chenglou/pretext`), query, validation, image cropping (`react-advanced-cropper` — it replaced `react-easy-crop`, whose crop box cannot be resized), client storage (`synced-storage`), drag-and-drop (`@dnd-kit`), browser-side media conversion (`mediabunny`, § 12.1.) and Korean particle selection (`es-hangul`, `AGENTS.md § 0.4.`) are installed. **There is no remaining unmet dependency**; a new one needs the user's approval first
- **`es-hangul` is named in `experimental.optimizePackageImports`** and has to stay there. It ships no `sideEffects: false`, so a bare `import { josa }` drags its romanisation and standard-pronunciation tables into the bundle behind one function
- **`mediabunny` is the one MPL-2.0 dependency**, where everything else here is MIT or Apache. Weak copyleft at file scope, so it constrains modifying the library itself and nothing about using it — recorded so the next licence audit does not have to rediscover it

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
  features/  session, send-message, chat-stream, search-messages, push-notifications,
             upload-media, author-emoticon, emoticon-prefs, update-profile, manage-event,
             set-background, view-profile
  entities/  user, message, push-subscription, media, event, emoticon
  shared/    db, auth, push, sound, storage, share, api, config, lib, theme, ui
```

**Placement rules that are not obvious from the tree** — each exists because moving the code breaks a steiger rule or drags `server-only` into the browser bundle:

- The session slice is `session`, not `auth` — `features/auth` collides with the `shared/auth` segment name (`fsd/ambiguous-slice-names`)
- The composer and emoticon picker are **`features/send-message/ui/…`, not widgets**: `widgets/chat-room` renders them, and a widget cannot import a sibling widget (`fsd/forbidden-imports`)
- Same-layer cross-imports go through the **`@x` gate**, never a barrel: `features/author-emoticon` → `@x/author-emoticon`, `features/upload-media` → `@x/send-message`, `@x/update-profile` and `@x/set-background`, `features/update-profile` → `@x/typing-indicator`, `@x/set-background` and `@x/view-profile`, `features/chat-stream` → `@x/view-profile`, `entities/emoticon/@x/message`
- **`features/view-profile` owns the § 12.3. overlay and the provider that opens it**, and it is a feature rather than a widget precisely so `widgets/chat-room` can reach the hook — a widget may not import a sibling widget
- **`uploadDraft` lives in `features/upload-media`, not `send-message`** — chat and the gallery both put an attachment in R2, and the slice named for uploading owns the one implementation
- **`shared/share`** owns handing stored objects to the OS: the gallery's 저장 (§ 10.) and a message's 공유 (§ 8.11.) are one route with two labels, and the callers are a widget and a widget's sibling. The segment is `share`, not `media` (`entities/media` claims that name). Its dialog lives there too — the hook toasts, so `shared/ui` importing it would close a cycle
- **`useLongPress` and `GESTURE_SLOP` live in `shared/lib`** — chat bubbles and gallery tiles both arm the gesture
- **`MediaViewer`, `MediaCell` and `Avatar` live in `shared/ui`** — `widgets/chat-room` and `widgets/gallery-grid` both render them and neither may import the other. `Avatar` could not move to `entities/user` regardless: that barrel exports a `server-only` api segment
- Client modules import `@/entities/message` with **`import type` only** — a value import drags `server-only` into the browser bundle. Hence chat row components and the grouping model live in `widgets/chat-room`
- Root `pages/` MUST exist and stay empty, or Next treats `src/pages/` as the Pages Router and the build breaks
- Server-only code lives in `shared/` segments and imports `server-only`; entity fetching lives in each entity's `api` segment; every slice is imported through its `index.ts` (eslint-enforced)

---

## 3. Shared Utilities (`src/shared/lib`) ✅

Read `src/shared/lib/index.ts` for the inventory (nullish types, `safely*`, `mapPooled`, `assert`, `cn`, duration constants + Korean date formatters, text layout, DOM helpers, `useHydrated` / `useIsCoarsePointer` / `useIsVirtualKeyboardOpen`). Reach for it before writing a utility.

- **`safely*` and `mapPooled` sit under `lib/run/`.** `fsd/shared-lib-grouping` errors past 15 modules at the top level, so a new utility joins a group or makes one. `sound.ts` moved to `audio/` (beside `session.ts` and `voice-playback.ts`) when § 9.3. pushed the top level past the limit; the barrel's export names did not change, so no caller did
- **`cn` uses `extendTailwindMerge`; every custom token scale must be declared there.** An undeclared scale is not merged at all — `cn("px-md", "px-0")` emits both and stylesheet order wins, silently ignoring the call-site override. A new `--text-*` / `--spacing-*` scale in `theme.css` means a matching entry here

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
- Header and bars **float over** content: `sticky` header, absolute `BottomOverlay` whose measured height becomes the `--bottom-inset` spacer `RouteTransition` trails below the screen (never the scroller's end padding — `DESIGN.md § 3.5.`). Both use the single `glass` utility; every floating strip is `pointer-events-none` at its root, re-enabled only on the visible surface
- **Nothing may depend on `interactiveWidget: "resizes-content"`** (Chromium/Firefox only, ignored by iOS), and `env(safe-area-inset-bottom)` is **not** a keyboard inset — it reports the home indicator and never moves for the keyboard

- [ ] Real-device pass (§ 5.3.) — keyboard-open geometry is reasoned through but unverified on an iPhone

### 4.4. Base Components (`src/shared/ui`) ✅

Read `src/shared/ui/index.ts` for what exists (buttons, inputs, the overlays below, `Container`, `AppHeader`, `EmptyState`, `Avatar`, `RelativeTime`, scroll helpers, `toast`). Check it before building any primitive.

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
- [x] Verify **what iOS actually hands a file input for a video** — it transcodes HEIC to JPEG, so § 9.'s "store whatever arrives" costs nothing and the viewer's download fallback never fires
- [ ] Verify the session cookie survives days of non-use (re-check after several days)
- [ ] Verify the **audio session survives a recording**, on the one sequence that can fail: play a voice message, record one, then play another. § 13.6.'s resting category is a page-**wide** switch that capture moves to `play-and-record` and moves back, while WebKit fixes an `<audio>` element's own category at its first playback — so the third step is where a player minted before the switch would mint a Now Playing entry or stop the user's music instead of ducking it. Neither of the first two steps shows anything on its own, and a session that never plays a voice message never mints that element at all

### 5.4. Development Login ✅

`POST /api/auth/login/dev` takes an `email` form field, matches `ALLOWED_EMAILS` as § 5.1. does, and issues the same § 5.2. session. `/login` renders the form under the Google button when enabled.

- Gated on `IS_DEV_LOGIN_ENABLED` (`NODE_ENV === "development"`), which Next inlines at build time — production cannot re-enable it through the environment and the route answers **404** there
- The row is upserted with a synthetic `dev:{email}` subject id; a later Google sign-in relinks that row to the real `google_sub`, so the paths never fork into two users
- The redirect is **303**, not `redirectTo`'s default 307 — a 307 replays the POST against the target page
- Auth Route Handlers redirect through `redirectTo` from `@/shared/api`, which emits a **relative** `Location`. `new URL(path, request.url)` cannot: `next dev` builds `request.url` from the bound `localhost:3000` and takes only the scheme from `X-Forwarded-Proto`, so behind an HTTPS tunnel it emits `https://localhost:3000`, which speaks no TLS. `proxy.ts` is exempt — Next already relativises middleware redirects

---

## 6. Database Schema (Drizzle) ✅

Schema, migrations, and triggers have landed. **Columns are not listed here — read `src/shared/db/schema/*.ts`** (`users`, `sessions`, `messages`, `message_media`, `media`, `events`, `emoticons`, `push-subscriptions`), one file per table. Never copy a column list into this document. The invariants below are what the schema cannot state on its own.

**Shape**

- There is **no `accounts` table** (one provider, § 5.1.), **no `conversation_members` table**, and **no `conversations` table**
- **Two participants, permanently.** `ALLOWED_EMAILS` gates the only row-creating path, so membership and identity are the same set. A third participant needs `conversation_members` back **and** a rewrite of § 8.8. (unread becomes a count of readers, not a boolean, reaching into the `1` marker and unread divider in `DESIGN.md § 7.`). A non-participant `users` row — a test or retired account — breaks `GET /api/users` the same way; keep such rows out of this database
- **The one conversation is implicit — no row, no id.** Every `messages` query is already conversation-wide. A second conversation needs a `conversations` table, a CHECK, an `ensureConversation` on the login path, an FK on every row, **and** the members rewrite above — not one of them alone
- **There is nothing to seed.** A `users` row exists only after that person's first login. The extension, trigram index, and triggers live in hand-written (`--custom`) migrations, since drizzle-kit cannot infer them
- Two connection strings: `DATABASE_URL` (pooled, normal queries) and `DATABASE_URL_UNPOOLED` (**required** for `LISTEN` and migrations)

**Messages**

- `messages` is **append-only** — marking messages read must never UPDATE it
- A CHECK pins which columns each `messages.type` may fill (a `text` row carries no `emoticon_item_id` or event; a `system` row carries no text). The CHECK cannot reach `message_media`, so "a non-`media` message must not acquire media children" is a `BEFORE INSERT OR UPDATE` **trigger** there. The reverse (a `media` message with zero media rows) is deliberately **not** enforced — it would need a `DEFERRABLE` constraint trigger, and § 8.5. writes both in one transaction
- **One bubble is one `messages` row regardless of attachment count**: 3 photos = 1 message row + 3 `message_media` rows, which is why there is no `messages.media_id`. `sort_order` preserves the sender's order. `media_id` **must not** cascade, and carries its own index
- The `media` enum value was `image` until `0008_media_message_type`. It is `media` because one bubble may carry photos **and** videos, discriminated by `media.mime` — renamed with `ALTER TYPE … RENAME VALUE`, never a drop-and-recreate, which fails on existing rows and breaks the trigger function whose `DECLARE` names the type
- `messages.event_id` is `ON DELETE SET NULL`; § 11.5. composes its sentence from the `event_title` / `event_starts_at` snapshot, because a delete notice outlives its `events` row. Only the **user name** is resolved at render time (§ 8.7.)
- `messages.reply_to_id` is a **self-FK**, `ON DELETE SET NULL`, and carries **no snapshot of what it points at** (§ 8.10. gives the reason it is the opposite call from the line above). It is orthogonal to `type`, so it stays out of the payload CASE and takes a CHECK of its own for the one rule it needs (no system parent). It has **no index** — the only lookup is parent-by-id, which is the primary key
- `users.last_read_at` has **no default**, so every insert names one; a `defaultNow()` would silently mark everything sent before that person's first login as read (§ 8.8. reads unread as `created_at > last_read_at`). The one insert site, `upsertGoogleUser`, passes the epoch
- `users` carries **three** nullable `media` references — `avatar_media_id`, `profile_background_media_id` (§ 12.1.) and `chat_background_media_id` (§ 12.2.) — all `ON DELETE SET NULL`, all declared through `AnyPgColumn` to break the `users` ⇄ `media` type cycle. Two of them are published and one is not, and that asymmetry is enforced in three separate places: `toParticipant`, `listUsers`' projection, and `canReadMedia`. **`0019` is a migrate-first migration** (rule 2 below), and more than most: `getSessionContext` selects `users` whole, so code deployed ahead of it fails **every request that resolves a session** on `42703`

**Media**

- **Never store an R2 URL in any table** — presigned URLs expire in minutes (§ 9.); store ids and mint per request
- **`media.filename` is what makes a row a file attachment** (§ 9.1.), and it is written by the server from the stored mime alone. **`0020` is a migrate-first migration** (rule 2 below): Drizzle's `select()` names every column, so a build that knows `filename` cannot read `media` at all until it exists (`42703`) — and every chat page with an attachment goes through that read. Every reader that draws a box — the gallery query, the § 8.3. estimate, the viewer — branches on it before trusting `width`/`height`, which a file stores as `0`
- **A gallery delete is two columns on `media`, not a `deleted_at`** (§ 10.). `gallery_hidden_at` takes a photo out of the grid and is read **only** by the gallery query, so the bubble that carries it goes on rendering; `gallery_added_at` marks one uploaded straight into the gallery. A row with no `message_media` child at all is **deleted outright**, rows and R2 objects together — nothing was rendering it, and the non-cascading FK above is what makes "has a child" the safe test
- **`media.created_at` is `timestamptz(3)`, and no other timestamp in the schema is.** It is half of the § 10. keyset cursor, and that cursor reaches the client as an ISO string from a JS `Date`, which has no sub-millisecond digits. At Postgres' default microsecond precision the cursor is a _truncated copy_ of the row it names: every sibling sharing that transaction timestamp compares greater, fails `(created_at, id) < (cursor)`, and is skipped from every later page — silently, and precisely for the multi-photo send the pair cursor exists to protect. `0015` narrows the column. **Never widen it back**, and never put a keyset cursor on a microsecond column without carrying full precision through the API

**Events**

- `events.ends_at` is NOT NULL — the create form defaults it rather than admitting an open-ended event, which would need its own branch in every month-grid calculation. `color` is nullable
- **Recurrence is yearly-only** (anniversaries): never introduce RRULE or a general recurrence engine — project `yearly` rows onto the requested year on read. The relationship start date, 100-day marks, and yearly anniversaries are **not rows** (§ 11.2.)

**Emoticons**

- `emoticon_items.width` / `height` are **required**, because the virtualizer reserves the box before the asset loads (§ 8.3.). An animated file is measured from its first frame (§ 13.2.)
- `emoticon_packs.thumbnail_item_id` points **into `emoticon_items`**, which points back — a deliberate cycle, added by a separate `ALTER TABLE` with `ON DELETE SET NULL` so removing the item a pack uses as its icon cannot remove the pack. Emoticon assets are **not `media` rows** and `emoticon_items` holds R2 keys directly (§ 13.3.)

**Indexes and triggers**

- `media(created_at DESC, id DESC)`, `message_media(media_id)`, `events(starts_at)`, `sessions(token_hash)`, plus `pg_trgm` + a GIN trigram index on `messages.text` (§ 8.6.). `messages` needs no paging index of its own — its primary key **is** the § 8.2. cursor. The `media` index needs the `id` tiebreaker because `created_at` is the **transaction** timestamp, so a multi-image send's rows compare equal — **paginate on the pair, never on `created_at` alone**
- `AFTER INSERT` on `messages` fires `pg_notify('new_message', { id })`; `AFTER INSERT` **and** `AFTER UPDATE` on `users` fire `pg_notify('user_changed', '')`. Payloads are minimal because `NOTIFY` caps at 8000 bytes and § 8.4. refetches rather than trusting a payload. Two user triggers because a `WHEN` clause cannot reference `OLD` on an INSERT, so `WHEN (OLD.* IS DISTINCT FROM NEW.*)` rides the UPDATE trigger alone. That guard plus § 8.8.'s `WHERE last_read_at < $new` keeps the channel quiet under the app's highest-frequency write — **both halves are load-bearing**; dropping either puts a `GET /api/users` on every throttle tick

- **`typing` (§ 8.12.) has no trigger and no table.** It is the one channel published by application code, because there is no row whose write could fire it — which is the point: the app's highest-frequency signal costs no WAL at all. Flipping § 12.'s switch does write `users` and so does raise one `user_changed`, but that is a rare deliberate action and the refetch it causes is the same one a rename causes

**Migration ordering — three rules, and they disagree with each other on purpose**

1. **Default: ship code first, migrate second.** Reversed, a first login against the previous build inserts without the new column, hits `23502`, and the OAuth catch flattens it into the generic `?error=failed` copy — nothing in the UI names the column
2. **A new column the new code reads runs the other way: migrate first, ship second.** Drizzle's `select()` names every column, so a build that knows `reply_to_id` cannot read `messages` at all until it exists (`42703`). A nullable column the previous build neither reads nor writes is invisible to it
3. **Dropping a `NOT NULL` column has no safe order** — code-first leaves the new build inserting without it (`23502`), migrate-first leaves the previous build inserting a column that is gone (`42703`). The safe shape is a split: relax the column, migrate, ship code that stops writing it, migrate again to drop it. `0007_drop_conversations` deliberately skips the split — with two users and a hand-run migrate the window costs a retried send, never data

`pnpm db:migrate` is **manual and decoupled from the deploy**.

---

## 7. Layout, Tab Bar, PWA ✅

The `(main)` layout is the app shell (max `576px`, centered) holding a per-screen header, the content, and the tab bar. Four tabs — `채팅` / `캘린더` / `보관함` / `설정` — icon + label, one active fill that travels between tabs (`DESIGN.md § 7.3.`), hover/active styling, `env(safe-area-inset-bottom)` honoured.

- **`보관함`'s route is `/gallery`, and the two are deliberately allowed to differ.** The label changed when the tab grew a 파일 segment (§ 10.) and 갤러리 stopped describing it; the route did not, because `GALLERY_ROUTE`, `widgets/gallery-grid`, `GET /api/gallery` and every § 10. citation in this document name it, and none of that is a string the user ever sees. `/settings/emoticons` = `이모티콘 관리` is the same arrangement. **Do not rename the route to match the label** — the churn buys nothing and invalidates the section numbers `src/` comments cite

- The layout is the **only** place a screen's session is resolved (`requireUserOrRedirect`, `AGENTS.md § 6.4.`); a page re-reads it only when it needs the row, and `cache()` makes that free
- The header is per-screen, not layout-owned, because it carries screen-specific actions — screens render `AppHeader` themselves
- `ScrollMemory` preserves each route's position across tab switches in **module scope**, not `sessionStorage`: a tab switch is a client navigation, a reload is meant to start at the top. Its timing quirks are load-bearing and documented at the source. **Chat is exempt** — its scroll belongs to the virtualizer (§ 8.3.)
- The Chat tab's unread badge is live (§ 8.8.): seeded by the layout's server render, incremented by the shell's SSE stream, replaced by `GET /api/chat/unread` on resume

**PWA**

- `app/manifest.ts`: name `J&H`, `display: "standalone"`, `theme_color`, `background_color`, icons 180/192/512 + maskable, generated by `pnpm icons` from a **path-only** wordmark (an SVG `<text>` icon renders in whatever font the machine has) and committed under `public/icons`. iOS reads `apple-touch-icon` from the markup, so the root layout's `metadata.icons.apple` is what "Add to Home Screen" uses
- **The launch screen is markup-driven on iOS.** WebKit honours only `apple-touch-startup-image`, and only when the image matches the launch surface exactly — so `shared/config/pwa.ts` holds the device table (`device-width`/`device-height` do **not** swap with orientation on iOS, so one row yields the portrait and landscape pair) and both `pnpm icons` and `metadata.appleWebApp.startupImage` derive from it. A device with no matching row falls back to the manifest `background_color`, which is the same `canvas`
- **The launch screen only paints in standalone**, so the root layout MUST declare `metadata.appleWebApp.capable` — and, because Next emits only the unprefixed `mobile-web-app-capable`, `metadata.other` carries the legacy `apple-mobile-web-app-capable` for iOS below 15.4. iOS caches this markup when the icon is added, so changing it means deleting and re-adding the home-screen icon
- `widgets/install-guide` is a dismissible "Add to Home Screen" banner, shown only in an iOS **browser tab** (iPadOS 13+ reports a Macintosh UA, so the check needs `maxTouchPoints`). Its dismissal flag is in `localStorage` — § 5.2. bans that for auth state only — and every access goes through `safelyRun` / `safelyGet`, since blocked storage throws and this renders in the `(main)` layout, failing hydration on all four tabs
- **Offline support is out of scope.** `public/sw.js` is **push-only** (§ 16.1.): `push` and `notificationclick`, nothing else. It MUST NOT register a `fetch` handler or cache anything
- `/icons/*`, `robots.txt`, the manifest, and `/sw.js` MUST stay out of the proxy matcher: a redirect to `/login` breaks the install prompt, and the browser fetches a worker without following redirects, so a gated `/sw.js` fails registration outright
- Anything needing a **secure context** is unavailable at `http://<lan-ip>:3000` — service workers, push, and `crypto.randomUUID` (which is why browser code mints ids through `randomId()` in `shared/lib/random.ts`). Test those over `pnpm dev:tunnel`

**Haptics** (`DESIGN.md § 7.15.`) — iOS has no Vibration API and iOS 26.5 removed the scripted-trigger workaround, so `HapticTap` is an invisible native `input[switch]` laid under the finger: **an element, never a function call.**

- It rides a `haptic` prop on `Button` / `IconButton` / `Chip` / `Switch` / `SettingsRow` / `Link`, and is composed by hand for raw buttons (composer send, day cell, emoticon grid, list rows, staged-attachment removal, `ActionSheet`)
- It fires on a **committed change of state or a selection among peers** — never on dismissing a surface or going back, and it **cannot** fire on a drag threshold such as swipe-to-reply (§ 8.10.), because no scripted trigger exists on 26.5+
- A release that travelled `GESTURE_SLOP` is a drag, not a tap: the overlay refuses it, so neither the control nor the Taptic engine hears it (`DESIGN.md § 7.15.2.`)
- On a target that **tiles a scroller** (the month grid, the emoticon grid, a `SettingsRow`, the full-width name of an 이모티콘 관리 row) it needs `keepsScroll`, which moves the tap to a `<label>` — the switch keeps a drag of its own and would otherwise leave the surface unscrollable. That mode is **opt-in**: inside an `<a>` the anchor eats the label's activation and the tick vanishes (`DESIGN.md § 7.15.1.`)

---

## 8. Chat Tab (KakaoTalk-style)

> **Only layout and interaction rules come from KakaoTalk**, never its colors or shapes (Kakao yellow, sky-blue background, drawn tails). `DESIGN.md § 2.2.` and `§ 6.` are the sole source of every visual spec below.

### 8.1. UI

**Landed:** notch-corner bubbles (mine right, theirs left), avatar + nickname on the first message of a group, one timestamp per same-minute group on its last message, date divider pills (`오늘`, `어제`, `2026년 8월 3일 월요일`), the auto-growing composer with `+` and emoticon toggle (the send button appears beside the toggle once there is something to send, rather than replacing it), long-press / right-click → `ActionSheet`, link previews and tappable links (§ 8.9.), the scroll-to-bottom button appearing ~200px from the newest message with an incoming count (`새 메시지 3`), and media messages in full.

- A hardware keyboard sends on Enter and breaks the line on Shift+Enter; on a coarse pointer Enter stays a newline, since the iOS keyboard has no send key (`useIsCoarsePointer`)
- Tapping send keeps the keyboard open: the button cancels `pointerdown` so the tap never blurs the field, and `submit` refocuses inside the click gesture
- `DELETE /api/messages/{id}` soft-deletes, scoped to the sender, and answers **404** for someone else's message and for one that never existed alike, so the endpoint cannot probe ids (§ 14.)
- The tab bar and install banner leave while the keyboard is up. `useIsVirtualKeyboardOpen` requires both a drop below the tallest height seen at the current width **and** an editable `activeElement` — height alone misreads a collapsing address bar, focus alone survives Android's back button. They leave by **collapsing `BottomOverlay`, not unmounting**, and the shell eases its height over the same 200ms, so `--bottom-inset` carries the composer up on one timeline

**Media messages** (photos **and** videos in one bubble; `media.mime` is the discriminator):

- Rendered **without a bubble**; tapping opens the fullscreen viewer at that index and swipes through the rest of the same bubble with **native scroll snapping**, not a gesture handler
- Attachments sent together are **one bubble** (§ 6.) — branch on array length alone: 1 keeps its own `media.width` / `height` ratio, 2+ use a fixed square-cell grid whose height follows from the cell layout
- A video tile shows its poster, a play glyph, and its running time from `media.duration_ms`
- The `+` opens a `BottomSheet` with `사진/영상` → album and `파일` → everything else (§ 9.1.), on two inputs rather than one — an album input that accepts everything costs iOS its photo picker entirely and opens Files. A `카메라` row was dropped: `capture` and `multiple` cannot be combined, and iOS already offers the camera inside the picker. On desktop the same attachments arrive by dropping them on the room (§ 9.2.)
- Picked attachments stage in a tray with a per-item remove control and an edit control on every photo and video tile — a photo crops and filters, a video trims. **A file tile carries neither** (§ 9.1.): it shows its name in the same 64px square and has nothing to edit. The trimmer is § 12.1.'s, with **no `maxDurationMs`**: an attachment has no length cap, so both handles move and trimming is an edit rather than a requirement
- **`useAttachmentEditing` owns both editors and the id rule**, for chat and the gallery alike. A trimmed clip is re-read into a full draft (its poster, dimensions and duration all belong to the new file) but **keeps the old draft's id**, since `useMediaSelection.replace` matches on it and a fresh id would append a second tile instead of replacing the one being edited. That is a fact about `replace`, not about either screen, and it lived in two copies until they could drift
- **The trimmer stays mounted until the re-read lands, and a send is held for as long as it does.** `toMediaDraft` on a trimmed clip is a full decode bounded only by `DECODE_TIMEOUT`; dismissed first, the tray shows the untrimmed tile and an upload started in that window ships the original, with the late `replace` addressing a draft `takeAll` has already removed
- **The trimmer reads the duration off the element, not only off the draft.** `toVideoDraft` reports `null` for a fragmented MP4 and some `.mov`, and a free-range trim that fell back to a literal cut every such clip down to that literal — data loss with no message. 완료 is held until the element has resolved one
- Decoding is serial, so the tray opens on a **placeholder tile** rather than staying empty until the last file lands — a § 9.1. file stages immediately, since there is nothing to decode
- `heic`/`heif` stay on the allow-list — iOS hands the original over when it declines to transcode, and the thumbnail is produced by decoding it in an `<img>`, so an engine without HEIC support rejects the pick instead of storing something it could never render
- Sending shows real upload progress per bubble; a failure offers **재전송 / 취소**, and a retry re-uploads only what had not landed. Progress commits only when the **whole-percent** figure changes — `upload.onprogress` fires per network chunk and every commit re-renders the virtualized list
- Attachments upload through § 13.4.'s bounded pool. The **byte budget**, not the concurrency count, governs here. `mediaIds` is assembled **by index**, so pick order survives however the uploads interleaved. A failure **stops the queue**: nothing further launches, in-flight tasks settle, then the error is rethrown — so the retry is left exactly the remainder. A slot the retry skips is weighed as zero, or its bytes would be reserved for an upload that never runs
- **A media bubble arms the same hold every other bubble does** (§ 8.11.), and suppresses iOS's own callout. Two menus over one photo is not a choice the user can read; the app's sheet wins the hold and carries 공유, and the OS keeps the § 7.10. viewer

Remaining:

- [ ] Unread marker — a `1` beside my message, in the `unread` token (DESIGN § 4.1.4.)
- [ ] Pinch zoom in the viewer — § 18. #6, still open and meant to be tuned on a real device
- [ ] Tapping the scroll-to-bottom button scrolls smoothly to the bottom **and marks messages read**
- [x] The same button returns the user to the newest messages after a search jump (§ 8.6.1.)

### 8.2. Message Loading ✅

Cursor-based infinite scroll: `GET /api/messages?before={id}&limit=30` (`WHERE id < :before ORDER BY id DESC`), plus `after={id}` and `around={id}`, whose callers are § 8.4. and § 8.6.1.

- **No OFFSET pagination, ever** — incoming messages shift page boundaries, producing duplicates and gaps
- `newestKnownId` is tracked alongside `oldestLoadedId` and only ever moves forward, so a delete cannot walk it back and make § 8.4.'s catch-up refetch what was already seen

### 8.3. Virtual Scrolling (Windowing)

Offscreen message nodes **must not stay in the DOM** — after years of history, thousands of infinite-scrolled nodes destroy scroll performance in iOS Safari. `@tanstack/react-virtual`: `anchorTo: "end"`, `getItemKey` on the row key, `measureElement` for variable heights, `scrollMargin` for the loading header, `scrollToIndex({ align: "center" })` for jumps. Migrated off `react-virtuoso`, whose `firstItemIndex` model cost a long tail of traps (an unguarded rAF recursion that made `GET /chat` a **500** among them) and which did not measure in a background tab at all.

**Structural constraints**

- **`flex-direction: column-reverse` is not available here.** It anchors a list from the bottom only because the browser lays items out in normal flow; every row here is `position: absolute`. Buying it back means abandoning absolute positioning and inverting every `item.start`. `transform: scaleY(-1)` is no escape either — a transform flips painting, not input, so the gesture ends up reversed

**Anchoring**

- **The prepend anchor is the row key, and it must be stable.** `getItemKey` returns `ChatRow.key`; an index-based key cannot work, since every existing row takes a new index the moment a page lands in front of it
- **The room re-anchors the prepend itself, and never on `rows[0]`.** At the top of the list index 0 is a **date divider**; a page of older messages from the same day leaves that divider at index 0 with the same key and offset, so the correction computes as "nothing moved", the whole page lands as drift, and the room walks backwards through history a page at a time. `insertOlder` records the first **non-date** row and an effect restores it. The target is **absolute, never a delta**, so it cannot double-apply on top of a correction the virtualizer did make
- **The anchor is written only while a page is actually pending.** The settle watcher listens for every scroll that goes still, not only the ones a prepend is waiting on, so an unguarded `insertOlder` records a fresh anchor each time the reader stops — and the next unrelated `rows` change (a live arrival, a send, a delete) restores them to wherever they last paused. The guard is the pending page's own length
- **`anchorTo: "end"` holds the end; it does not go there.** At mount every row is still `ESTIMATED_ROW_HEIGHT`, so one `scrollToEnd()` lands on an end the first measurement moves. The room re-parks on the scroller's own maximum each render until a real gesture (`wheel` / `touchstart` / `keydown`) takes over — never gated on the at-bottom flag, which the edge sync has already read as false from the pre-park position
- **That park is a layout effect, never a passive one.** Passive runs after paint, so the room's first frame would be the top of the loaded window rather than the newest message. It also has to precede the two passive effects that read the scroller back: from a pre-park `scrollTop` of `0` the § 6.7. pill flashes on every open and `requestAdjacentPages` fetches a page of history nobody asked for. React runs every layout effect before any passive one, which is the whole ordering
- **Nothing the virtualizer measures knows about the trailing spacer.** `ListFooter` is `--chat-bottom-gap` of the scroll range and is not a measured row, so `scrollToIndex`-based ends land that far short and park the newest message behind the composer. Following the live edge uses the scroller's own `scrollHeight`, keyed on the **last row's key** changing so a page of older history does not trip it
- **A pin made against an estimate has to be renewed once the row is measured.** The follow above and the post-send pin both run before the new row has ever been in the DOM, so both resolve against `estimateRowHeight`; whatever the row then measures — a § 8.9. card resolving on the link that was just sent, a photo's real box, a bubble that wrapped one line further — grows the list _below_ the fold, and the message the user sent finishes under the composer. That is what "sending does not scroll down" was. A `ResizeObserver` on the rows' own box re-pins, **thresholded on the growth itself** exactly as § 8.12.'s slot is: `scrollHeight` already counts the growth, so being within it of the end afterwards is the condition of having been at the end before, and a § 8.3. page of older history landing thousands of pixels from the end cannot satisfy it

**Measurement**

- **Rows are measured by the `ResizeObserver`, never by the `ref`.** `measureElement` is a ref callback running inside React's commit; measuring there applies a scroll correction and asks for a synchronous re-render, which React cannot do mid-commit (`flushSync was called from inside a lifecycle method`) — so the correction lands a frame before the rows that move with it. The `measureElement` option therefore returns the **cached** size when handed no `ResizeObserverEntry`, reducing the ref to registering the element
- **Wrapping is counted by `@chenglou/pretext`, not arithmetic.** `countTextLines` breaks the string the way the browser will. `ceil(totalWidth / maxWidth)` is right for Hangul, CJK and spaced Latin, but a run that cannot break — **a URL above all** — is pushed down whole, so the line before it ends early. Reverts to the arithmetic on the server, where there is no canvas
- **Line heights are measured off the page, never mirrored from `theme.css`.** The stylesheet says `15px` at `1.45`; Chrome lays that out at 21.75 and Safari at 21 — WebKit floors a fractional line-height. `measureLineHeight` renders four lines in the class and divides; **not `getComputedStyle`**, which reports the computed line-height rather than the one layout used
- **The estimate is rounded**, because `measureElement` stores `Math.round(borderBoxSize)`. A row estimated _perfectly_ at 41.75 measures 42 and corrects the scroll by 0.25 — once per row, always the same direction, a visible creep over a screenful
- **`estimateSize` is per row and must stay close, because a wrong estimate _moves the list_.** Every row first measured above the fold corrects the scroll by its own estimate error, and WebKit drops that correction mid-gesture — one flat guess makes reading back through history drift and snap back when the finger stops. `estimateRowHeight` resolves an attachment (`toMediaBoxHeight`) and an emoticon (`toEmoticonBox`) **exactly**, by sharing the arithmetic the bubble is drawn at; only text is approximated. `VOICE_CARD_HEIGHT` sits beside `FILE_CARD_HEIGHT` for the same reason (§ 9.3.) — a waveform has no intrinsic height for an estimate to derive one from — and `toMediaBoxHeight` tests `voice` **first**, since a voice bubble is one clip and the cell count never enters into it
- **`getItemKey` must be one stable function, and it must index defensively.** `virtual-core` memoizes the entire measurement pass on its identity, so a fresh closure per render re-runs `estimateSize` for every unmounted row — and that is now a text layout. It reads this render's rows through a **ref written during render** (an effect-written one is a commit behind), and it answers the index when the row is missing: `indexFromElement` returns `-1` for an element with no `data-index` and the library hands that straight back, where `rows[-1].key` would throw out of the render phase
- **Anything the estimate reads from the DOM is read on mount, never during render.** The scroller's width goes through state kept current by a `ResizeObserver`; `warmLineHeights` takes its probes in a layout effect. Until both land the estimate uses literals, which is also what keeps server and first client render agreeing at hydration

**Timing**

- **A page of older history is fetched during the scroll but inserted only once the scroller is still.** WebKit hands the scroll offset to the compositor for the length of a gesture, so a correction landing mid-flick is deferred to a scroll that has moved on — a blank frame, a jump into the past, then a snap back. `loadOlder` holds its page and `useSettledCommit` inserts it after `SETTLE_DELAY` of no `scroll` and no finger down. The loading header stays up across the wait, and a window replacement (§ 8.6.1.) **discards** the held page rather than splicing live-edge history into a jumped window
- **A § 8.9. link card is resolved a page ahead of the viewport, never on the bubble that needs it.** `useLinkPreviewPrefetch` asks the moment a message is in the loaded window, so the bubble is its final height the first time it is measured. A card arriving later grows the row while the reader is looking at it, and no scroll compensation can hide that
- **The default re-measure compensation is wrong for this list**, and `shouldAdjustScrollPositionOnItemSizeChange` replaces it. The library declines to compensate a row re-measured while the scroll direction is `backward` — but reading back through history is exactly that. A row **entirely** above the fold is compensated whichever way the finger moved; a row still spanning it grew below the anchor and must not be
- **Paging must never be driven from a render-scoped effect.** Both loads commit messages, which renders, which would ask again — one page per render rather than one per landed page, and the room pages itself to the start of history with the main thread pinned. Flags refresh every render (`readScrollEdges`); paging runs on `scroll` and on the load finishing (`requestAdjacentPages`)
- **The box for a media message is reserved before the asset loads** — an aspect-ratio box from `media.width` / `height` for a single attachment, the cell layout for a grid. Without it every arriving image triggers a re-measure cascade

Remaining:

- [ ] Date dividers are list items (done), but the **sticky top indicator is a separate overlay** computed from the visible range — not built
- [ ] Restore scroll position when returning to the tab — `takeSnapshot` on the way out, `initialMeasurementsCache` and `initialOffset` on the way back in. `ScrollMemory` cannot do it: it remembers a `scrollTop`, and here that number means nothing until the rows are measured
- [x] Native `Ctrl+F` cannot find offscreen messages — in-app search (§ 8.6.) is the deliberate replacement, and it has landed

### 8.4. Realtime (SSE) ✅

`GET /api/chat/stream` holds one unpooled connection on both channels, replays from `Last-Event-ID`, heartbeats; the client holds a single `EventSource`, closes it on background, catches up on every return.

**`GET /api/chat/stream`** — `text/event-stream`, `runtime = "nodejs"`, `maxDuration = 300`

- The connection comes from the **direct (unpooled)** string via `listenToChannels` (`shared/db`) and is released in a `finally`. A transaction-mode pooler hands the connection to another client between transactions, silently dropping the `LISTEN`
- **One endpoint, one `EventSource`, three channels.** `LISTEN user_changed` and `LISTEN typing` (§ 8.12.) ride the same connection; they are told apart by the SSE `event:` field (`message`, `user`, `typing`)
- `LISTEN` is registered **before** the replay query. Reversed, a message committing between the two is missed by both
- **`id > cursor` alone loses messages**: `bigserial` ids are handed out at INSERT but become visible at COMMIT, so they can commit out of order. Replay starts at `cursor - SSE_REPLAY_MARGIN` and lets id-deduplication drop the overlap
- `id:` goes on **message events only** — it is the reconnect cursor, a `messages` bigserial with no counterpart on `user`, `build` or `ping`
- **A replayed row is `event: backfill`, a live one is `event: message`.** Same payload, same `id:`, same client-side deduplication — the split exists because § 13.6.'s emoticon sound must tell them apart. Every reconnect replays, so without it a resume plays the sounds of messages already seen
- Notifications resolve **one at a time behind a promise chain** — each costs a `getMessage` query, and interleaving emits rows out of id order
- `event: ping` at `SSE_HEARTBEAT_INTERVAL`. A **named event, not a `:ping` comment**: a comment keeps proxies awake but `EventSource` never surfaces it, and the client's resume path must observe the heartbeat to tell a live socket from a frozen one
- Replay is capped at `SSE_REPLAY_LIMIT`; what falls past the cap is the client catch-up's problem, so a truncated replay costs extra requests rather than a hole

**`GET /api/users`** — the whole participant set, **no cursor**. Callers: first render, a `user` event, the resume catch-up

- `listUsers` projects an explicit column set and `toParticipant` resolves the name before the response is built, so **`email` and `google_sub` never leave the server**. Never `SELECT *` here
- A "changed since" cursor is **rejected**: this is a small mutable set, not an append-only log — a rename produces no new row so an id cursor never fires, and an `updated_at` cursor still misses a deletion

**Client**

- **The state belongs to the `(main)` shell; the socket does not.** `ChatStreamProvider` owns the participant set, the unread count and the typing set, because the calendar, the profile screen and the tab bar all read them. The `EventSource` is mounted by `ChatStreamConnection` on the chat screen alone (§ 8.4.2.); screens attach to the delivered events with `useChatStreamListener`
- The provider delivers the message and moves the counters (tab-bar badge, `navigator.setAppBadge`). It **alerts nobody** — § 16.1.'s OS notification is the app's one alerting channel. A message that is mine moves nothing at all, since the stream echoes my own send back (§ 8.5.)
- `EventSource` auto-reconnects only for drops it notices. A fatal error (a 401, or a body that is not `text/event-stream`) leaves `readyState === CLOSED` permanently, so `onerror` reopens by hand after `SSE_RETRY_DELAY` and the open path treats a `CLOSED` source as no source. Guarding on "a source object exists" instead kills live delivery for the life of the page after one expired session. Handlers are read through a ref, so a new handler identity cannot rebuild the connection every render
- The stream closes when the tab backgrounds, so Neon compute can autosuspend. **A backgrounding is not the only close** — § 8.4.1. drops it for idleness and § 8.4.2. drops it on leaving 채팅, which between them are what reach a window that never backgrounds at all
- **Resume is the normal sync path, not an error path.** The stream is closed on purpose, and an iOS home-screen PWA restores the frozen page rather than navigating, so the Server Component render does not re-run
  - The catch-up hangs off **`onopen` _and_ the resume events**, and is plain `fetch` either way — never gated on the socket. Hanging it off `onopen` **alone** was the iOS PWA bug: the screen stays stale as long as the reconnect takes, forever if it never lands
  - **Resume observes `visibilitychange`, `pageshow`, `focus`; background observes `visibilitychange` and `pagehide`.** iOS is inconsistent about which a standalone-PWA app-switch produces and one resume commonly fires several, so the catch-up is coalesced inside `SSE_SYNC_COALESCE_WINDOW`
  - **A restored iOS page keeps a dead socket at `readyState === OPEN`** — the system tears the connection down while frozen and never tells the object, so it emits no `error`. The zombie is detected by **silence**: every `message` / `user` / `ping` is timestamped, and a resume finding nothing newer than `SSE_STALE_AFTER` closes the source before reopening. Do not replace this with a "was the page hidden" flag — the freeze can arrive without a hide event
  - It pages `fetch(/api/messages?after=…)` until a short page, plus `fetch(/api/users)`, from a **local** copy of `newestKnownId` advanced only by what the loop itself fetched. Read from the ref each round, a live event landing mid-loop would carry it past a page the fetch has not covered
  - `after=0` is a **valid** cursor, not an absent one: a client whose window is still empty catches up from the start. Falling back to the cursorless newest page strands everything behind it unreachably
- **Received messages are deduplicated by id** and merged by sorting, never appending
- Multi-device needs no extra mechanism: `user_changed` is a conversation-wide broadcast, so "my other device" and "the other person's phone" are both just another subscriber

### 8.4.1. Idle close (절전 모드) ✅

§ 8.4. drops the stream when the app goes away. This drops it when the app is _there_ and nobody is using it, and says so on screen (`DESIGN.md § 7.17.`).

**The gap it closes.** `visibilitychange` never fires for a desktop PWA window sitting behind another app's window — occlusion is not `hidden`, and only a minimise, a tab switch or a close is. Such a window therefore held a stream open indefinitely: an unpooled Neon connection that keeps the compute from autosuspending, plus a `maxDuration = 300` Vercel invocation relaying itself forever. Measured on both dashboards; it was the dominant line on each.

- **Two countdowns, one timer.** `SSE_IDLE_TIMEOUT` (a minute) while the window has focus, `SSE_BLUR_IDLE_TIMEOUT` (30 seconds) once it does not. The blur figure is deliberately **not zero**: a file picker, a share sheet and the emoticon uploader all blur the window in the middle of a task the user is still doing
- **`pointerdown` and `keydown` reset it, nothing else.** `mousemove` and `scroll` would hand the countdown to a cursor crossing the window and to momentum the user is not driving — which is most of what this exists to catch
- **The deadline is re-derived from the clock inside the timer, never trusted to it.** A frozen PWA runs no timers, so one armed before the freeze comes due the instant the page is restored — and would put the overlay in front of a user who has just this moment come back. Same wall-clock idiom as § 8.4.'s zombie-socket check, for the same reason
- **Backgrounding disarms the countdown rather than letting it expire.** A backgrounded app has already dropped its stream and costs nothing, so a dormancy on top would put the overlay in front of every app switch longer than a minute and save exactly nothing. Dormancy is a state only a _visible_ window can enter
- **Visibility is re-checked where the countdown expires, not only where it is disarmed.** A tab opened in the background — cmd-click, `target=_blank`, a restored session tab — starts `hidden` and fires **no** `visibilitychange` until it is first looked at, so the disarm above never runs for it. Without the second check that tab sleeps unseen and the first thing it ever shows is the overlay
- **A task in flight defers the countdown.** A recording, a playing clip, or an open `Dialog` / `Drawer` re-arms instead of sleeping, through `isBusy` (`shared/lib`). Three separate reasons, one gate:
  - **Recording is hands-off and outlasts the allowance.** `MAX_VOICE_DURATION` is two minutes against a one-minute countdown, and a recording produces no `pointerdown` and no `keydown` — so the overlay would land on top of a clip still being recorded and take 정지 with it
  - **Playback is read off the elements, not registered by hand.** Every `<video>` and `<audio>` in the app answers `isBusy` without being wired to it, and a new one cannot forget to
  - **An open sheet outranks the overlay and would strand it.** `Dialog` and `Drawer` portal to `body` at `z-50`, a later stacking context than anything `ShellOverlay` puts inside the shell — so a dormancy raised underneath one leaves the sheet fully live over an app that believes it is asleep, and the user's first click only dismisses the sheet
- **Dormancy outranks every reopen path.** The `SSE_RETRY_DELAY` retry, the resume events and the visibility handler all route through the same `open()`, which returns early while dormant. A dormant client also skips the catch-up entirely — it is several requests, and running them for a screen nobody has come back to is the cost this state exists to avoid
- **Only a press or a keystroke leaves it.** Returning focus does not, or the overlay would be dismissed by the very app-switch that is meant to reveal it. A key counts because focus is usually still in the composer when the overlay arrives — without it the typing that follows goes into a field the user can no longer see and nothing reconnects. Either way it runs the ordinary § 8.4. resume, so the catch-up is lossless and the screen does not jump
- **The blur floor is a floor, not a reset.** Reading is not an interaction here, so a window already idle past the blur allowance would sleep on the very tick it loses focus. The blur pushes out a `sleepNotBefore` deadline instead, and the countdown is the later of that and the ordinary allowance
- **`NEXT_PUBLIC_SSE_IDLE_SLEEP` turns the whole thing off, and defaults to on.** Absent, blank or anything but `false` / `0` / `off` leaves it enabled — a cost control that has to be remembered in each new environment is one that will be missing from the environment that needs it. It is `NEXT_PUBLIC_` because the decision is the client's, and read as a literal member access since Next inlines these at build time
- **Push is what makes this safe.** § 16.1.'s OS notification is the app's one alerting channel and owes nothing to the stream, and `sw.js` writes the app badge from the server's own count — so a dormant client still alerts, and still badges, exactly as an open one does

**Neon bills this only if the gaps outlast its autosuspend delay.** Compute suspends after a configured idle stretch; a client that wakes more often than that keeps it up regardless of how diligently the stream is closed. The Vercel saving is unconditional, the Neon one is not — the console's autosuspend setting is half of this change and lives outside the repository.

### 8.4.2. The socket is scoped to 채팅 ✅

The stream is open only while the conversation is on screen. Leaving the tab closes it; returning opens it and catches up through the ordinary § 8.4. resume.

**Why it moved down.** § 8.4.1. closes an idle window, but a window parked on 캘린더 is not idle — the user is using the app, and the stream was held for a screen showing nothing it feeds. Scoping is what removes that case, and it removes it without waiting out a countdown.

- **The provider stays in the shell; only the socket moves.** `participants` is read by the calendar and § 12.3.'s profile screen, and the badge is drawn by the tab bar — all three outlive the chat screen, so `ChatStreamProvider` has to as well. It hands its handlers down through a context of its own, and `ChatStreamConnection` is the one component that consumes them
- **A second mount would open a second stream.** The connection component is mounted by the chat screen and by nothing else; two of them means two unpooled Neon connections for one client
- **The handlers object is lazy initial state, not a ref.** It has to be stable _and_ readable during render, and React Compiler rejects a ref read there
- **The three losses, and what covers them:**
  - **The in-app tab-bar badge** is the only one with real weight, and `sw.js` now covers it: every § 16.1. push posts the server's `unreadCount` to open windows, which the provider applies. It **replaces** rather than increments — a client that has been off 채팅 missed every arrival and has nothing to add to — and it is ignored while the reader is in the conversation, where § 8.8.'s cursor is about to clear it anyway. The worker still shows its banner unconditionally; informing the page is additive, and standing the notification down is the shape that lost the subscription
  - **A nickname or avatar change** no longer reaches an open calendar the instant it happens. It is picked up on the next chat visit or the next load, and § 5.'s token is resolved against `users` on every request, so nothing is stale for long
  - **The § 15.1. build signal** now arrives on the chat tab rather than any tab. The check also runs on every backgrounding, which is what usually collects it first

### 8.5. Sending ✅

The client generates `client_msg_id` (uuid) and renders optimistically; `POST /api/messages` uses `ON CONFLICT (client_msg_id) DO NOTHING` so a retry cannot duplicate a row; a retry affordance shows on failure.

- The re-read after a conflict is scoped to `sender_id` and `deleted_at IS NULL` and answers **409** when it misses. `client_msg_id` is unique table-wide rather than per sender, so matching on it alone would return the _other_ user's row and swap the optimistic bubble for a stranger's message
- The SSE echo is matched by `client_msg_id` and replaces the optimistic entry. The echo routinely beats the POST response, so the pending bubble retires on whichever arrives first
- **Every send goes through one delivery queue**, not one chain per call. `messages.id` is assigned by the POST, so a caption sent alongside attachments would otherwise be POSTed while the uploads were still running and land _above_ the photos everywhere but the sender's optimistic render

### 8.6. Message Search ✅

**Why substring matching**: Postgres FTS has no Korean morphological dictionary and `'simple'` only splits on whitespace — Korean attaches particles (조사) to nouns, so `저녁` fails to match the stored `저녁을`. Korean-aware parsers (`mecab-ko`, `pg_bigm`) cannot be installed on Neon. **`pg_trgm` + `ILIKE`** is language-neutral and matches substrings, so the particle problem cannot occur.

- `GET /api/messages/search?q=&before=` — `type = 'text' AND deleted_at IS NULL AND text ILIKE '%' || $q || '%'`
- **Order by recency, not relevance** (`ORDER BY id DESC`) — chat search is "where was that thing we talked about", so BM25-style ranking gets in the way. This is also why no search engine is warranted
- Normalize the query — `lower()`, trim, escape `%` and `_`. **The escape is load-bearing, not hygiene**: unescaped, a query of `%` matches every message in the conversation and one of `_` matches every message of any length, so the two characters most likely to be typed by accident are the two that answer with everything
- Cursor-paginate results (same mechanism as § 8.2.). **The counter beside the field is a `count()` asked for on the cursorless page alone** — the keyset cursor cannot say what is behind it, and a total that grew as the user stepped would read as the conversation gaining matches while they searched it
- **The row carries a window around the first hit, not the message.** `toSearchExcerpt` slices `SEARCH_EXCERPT_MAX_LENGTH` around the match, because the result row clamps to two lines (`DESIGN.md § 6.8.`) — a hit 1,500 characters into a message would otherwise be cut away by the clamp and the row would highlight nothing, which reads as a result that does not contain the query
- **The scan runs on submit, never while the user types.** One call is an `ILIKE` over the whole conversation, plus a `count()` that cannot be `LIMIT`ed, plus a window replacement for the first hit — and a Korean field commits jamo by jamo, so even a debounced handler pays all of it for `ㅈ`, `저` and `점` on the way to `저녁`. The trigger is the keyboard's own search key, which is what iOS draws for a field with `enterKeyHint="search"` inside a `<form>`; a pointer gets the disc beside it (`AGENTS.md § 4.2.`)
- **Asking again for the string already on screen steps to the next hit** rather than re-running the scan — the find-in-page gesture, and the answer is already in hand
- **The submitted string commits with its page, never ahead of it.** Written before the fetch, a scan that then fails leaves the previous query's results, total and active index standing under a `submitted` naming the new one: the bubbles mark one string while the arrows step another, `loadMore` pages the new query onto the old list, and the step-instead-of-scan shortcut above makes the failed query unreachable
- **A scan that matched nothing opens the result list.** It is the only surface that can report the outcome — the counter goes blank, no bubble is marked and nothing scrolls, so without it a search that found nothing is indistinguishable from one that never ran
- **The results describe the submitted string, not the field's.** They are tracked apart, or a half-typed word would light matches in the bubbles for a query nobody has asked for yet. Every fetch still carries a generation and only the newest may write, since submitting twice in quick succession is one keypress away
- Queries of ≤2 characters cannot use the trigram index and fall back to a sequential scan — acceptable at our scale (tens of thousands of rows)
- **The chat header becomes the search bar in place** — field plus 취소, over a conversation that stays visible behind it, as KakaoTalk's own in-room search does. It is built on `AppHeader` itself rather than on a copy of its geometry: the two strips swap in place, so a second definition of the sticky root, the safe-area padding or the row height would let them drift and the swap would start jumping
- **The composer's whole stack (reply bar, attachment tray, emoticon panel) is withheld while a search is open**, and the § 8.6.1. navigation bar stands in the composer's own position, inside the wrapper `useComposerClearance` measures — anywhere else and the history would clear a composer that is not on screen
- **Withheld means hidden, never unmounted.** The draft is `MessageComposer`'s own state and never leaves it, so unmounting discards a typed-but-unsent message silently, and takes its `useUnsentWork` hold with it — § 15.1. would then be free to reload the tab over the draft. `display: none` is what keeps the wrapper's measured height right without touching the state inside it
- **What the hidden stack drives has to stop with it.** A staged emoticon and an open emoticon panel are § 8.12.'s two sustained typing sources and both are `ChatRoom` state that outlives the hiding, so the signal is cut for the length of the search — left connected it re-POSTs every `TYPING_PING_INTERVAL` and the other participant reads 입력 중 from a composer that is not on screen, which is exactly the parked-draft failure § 8.12. exists to have removed

#### 8.6.1. Jumping From a Result to the Message (the hard part) ✅

**The jump itself landed with § 8.10.1.** — replying needed the same machinery first. Tapping a result loads context via `GET /api/messages?around={id}&limit=30`, reinitializes the **window's** edges (not `newestKnownId`), moves with `scrollToIndex({ align: "center" })`, and flashes a highlight behind the target.

**Every window replacement carries a generation, and a pager that resolves against a superseded one commits nothing.** `loadAround` and `returnToLive` swap the window whole; `loadOlder` and `loadNewer` were started against the one before it. Without the counter a `loadNewer` in flight when the user taps 최신 (or sends, which also returns to live) lands afterwards and writes `hasNewerRef = true` back while the `hasNewer` **state** stays `false` — the room then drops every SSE arrival silently, no pill offers a way back, and each `endReached` refetches the same page forever. `discardPendingOlder` covers only a page already _held_; a fetch still in flight needs the generation. The lock is released solely by the load that still owns it, or a superseded pager hands it back mid-replacement. And `loadAround` **preempts** rather than declining: declining returned the same `false` as an unreachable message, answering `원본 메시지를 찾지 못했어요` for a parent one page away.

- **A jump that is superseded is not a jump that failed.** `loadAround` answers `ok` / `missing` / `superseded`, and only `missing` raises 원본 메시지를 찾지 못했어요 — pressing the arrows twice in a row leaves the first fetch resolving against a window the second has already replaced, and reported as a failure it apologises for a jump the user is watching land
- **The flash is a property of the jump, never of whether a search is open.** A quote jump taken while searching lands on a parent that need not contain the query, so keying the suppression on the search being open leaves that jump marked by nothing at all — the caller says which kind of jump it is
- **A jump takes the scroll.** § 8.3.'s open re-parks the room on the newest message after every render until a real gesture (`wheel` / `touchstart` / `keydown`) claims it, and a programmatic jump is not one — so `jumpToMessage` sets that flag itself, or the park runs on the very next commit and drags the reader straight back to the live edge. Search is what made this reachable: open, type, jump, on a screen nobody has scrolled at all. The § 8.10.1. quote jump had the same hole and only ever escaped it because the reader had usually scrolled to find the quote first
- **A send from a jumped-away window returns to live _and pins_.** Returning alone was half the behaviour and read as the send having gone nowhere: `returnToLive` replaces the window whole rather than appending, so § 8.3.'s follow — keyed on the last row's key changing across a list that still holds the previous tail — sees no append to follow, and the open park was claimed by a real gesture long before any jump was made. The newest page then lands at whatever offset the jumped window happened to leave behind. The pin waits a frame, as the jump's own `scrollToIndex` does, because the virtualizer takes the replaced window only on the render that follows the commit
- **The search names a target and the room owns the move.** The result list, the arrows and the field are a feature slice; what crosses into `ChatRoom` is one `{ token, id }`. The token is what makes re-picking the row the room is already parked on a fresh instruction — keyed on the id alone that is no change at all, and the tap reads as having done nothing
- Previous / next navigation between results, as in KakaoTalk. **`∧` is the older hit and `∨` the newer one**, because the conversation runs oldest to newest down the screen — the arrow points the way the room is about to move, not the way the newest-first result list is ordered. Stepping past the loaded end pages first and then moves. Returning to the newest messages reuses the § 8.1. button, which § 8.10.1. has already taught to restore the window before it scrolls
- **The newest hit is taken as soon as a page lands**, so the counter reads `1/12` beside a field that has only just stopped moving — this is what KakaoTalk does while the query is still being typed, and it is why the arrows have a position to step from without the user picking one
- Highlight the matched substring **client-side by splitting the string** — do not use `ts_headline`. Split by case-folded `indexOf`, never a regex: the query is whatever the user typed, so a `.` or a `(` in it would otherwise be a pattern rather than the character they meant. `splitTextByQuery` is in `shared/lib` because the result row and the bubble both paint from it
- **The bubble carries the mark, and the § 8.10.1. flash is withheld while a search is open.** The flash is for a jump with nothing else to point at; a search knows the characters that were asked for, so `search-hit` inside the bubble says which words matched and stays up across the next arrow press (`DESIGN.md § 6.8.`). Only the written text is marked — a URL is one run the reader recognises by its shape, and a mark cut through it breaks that for a match nobody was looking for there
- **The § 6.7. pill counts nothing while the window is parked away from the live edge.** `messages` is then a slice of history, and every row in it outranking `seenId` was being counted as an arrival — stepping from an older hit to a newer one replaces the window with a page of them and the pill announced `새 메시지 30` for last month's messages. `seenId` must not be rewritten from such a window either, or it walks backwards and everything between there and the live edge counts as unseen on the way back
- Media and emoticon messages are excluded from search — they carry no text, so this is `type = 'text'` at the query rather than a filter over the result
- **The result list is a surface of its own, opened from the navigation bar.** KakaoTalk has no list inside the room — it keeps one in its global search instead, which this app cannot have, since § 6. makes the one conversation implicit and there is nothing to search across. So the two KakaoTalk surfaces collapse into one here, and `DESIGN.md § 6.8.`'s result row lives in the room
- Empty states for "no query yet" and "no results". **Both are reachable or they are not implemented** — the list is the only place either can appear, so a nothing-found scan has to open it rather than leaving the reader in front of an unchanged conversation

### 8.7. Display Names and Profiles

**Landed** in full; the avatar image arrived with § 12.

- The name shown in chat is **the nickname each user set for themselves in Settings** (`users.nickname`, § 12.); the Google account name is only the first-login default. There is **no** feature for naming the other person (KakaoTalk's per-contact rename)
- **Never copy the name or avatar onto the message row.** The sender resolves against the participant set at render time, so a rename **retroactively changes every past message**, including § 11.5. system sentences. That is intended
- A nickname or avatar change reaches every other **open** screen over `user_changed` (§ 8.4.). A fresh load is already correct, because § 5.'s opaque token is resolved against `users` on every request and carries no stale copy unlike a JWT
- Empty-nickname fallback is the email local part, applied in `toParticipant` (§ 8.4.); no-avatar fallback is an initial-letter avatar (DESIGN § 7.7.)
- The chat avatar reads `GET /api/media/{avatarMediaId}`, resolved from the participant set at render time like the name beside it (§ 12.)

### 8.8. Read / Unread

**Landed:** the cursor lives in `users.last_read_at` (no per-message `read_at`, no members table), `countUnreadMessages` joins `users` on the requesting id so the badge stays one round trip, and `POST /api/chat/read` writes the cursor while the chat screen is mounted (`ChatRoom` declares this with `setIsReading`). `읽음` shows on the newest of my messages the other participant has read, beside its timestamp — nothing marks an unread one, since silence is the resting state and the newest already implies every message under it.

- Throttled on the **leading** edge at `READ_CURSOR_THROTTLE`, because every UPDATE that lands fires `user_changed` at the other device. Three posts are **unthrottled and none is optional**: **entering** (a throttled entry parks the cursor behind a message already on screen), **leaving**, and **backgrounding** (the app going away is not a `ChatRoom` unmount, and is the likeliest way to end a session). A cursor parked a throttle window behind turns the last message read into a push notification
- The UPDATE **must** carry `WHERE last_read_at < $new`. The same person can have two devices open, and a late stale request would move the cursor backwards — the unread divider jumps back into read history and the other side's `1` markers reappear after clearing. The guard is also what makes a no-op UPDATE silent
- The client sends **no timestamp**; the server stamps `now()`, so a skewed device clock cannot push the cursor into the future
- `GET /api/chat/unread` — the count for the tab-bar badge and the § 16.1. push payload. The shell's running total is optimistic and blind to what landed while the stream was closed, so a resume **replaces** it rather than adding to it
- Clearing the sender's `1` markers needs no new plumbing: the write touches `users`, so the § 6. trigger fires `user_changed`

- [ ] A message is unread when `message.created_at > otherUser.last_read_at` — a **boolean**, correct only for two participants (§ 6.). The cursor is written; the `1` marker beside a bubble and the unread divider are still to draw (`DESIGN.md § 7.`)

### 8.9. Link Previews

A text message containing a link renders a card above its text — thumbnail, title, and the site it came from (`DESIGN.md § 6.9.`). The link stays in the bubble as a tappable anchor. **Landed** in full; four polish/hardening items are open at the end.

- **One card per bubble, from the first URL in the text.** A message pasted out of a share sheet routinely carries several, and a stack of cards buries the sentence
- `GET /api/link-preview?url=` answers `{ preview }`, where `null` is the normal case rather than an error. **Signed-in only** — the handler makes an outbound request to a caller-chosen URL
- **Cached in `link_previews`, keyed by the URL as it appears in the message, minus the fragment** (`withoutFragment` on both sides, or the client spends a round trip per anchor against a single row). The row hangs off no message. `LINK_PREVIEW_TTL` for a resolved card, `LINK_PREVIEW_FAILURE_TTL` for a failure, which **is cached too** — without that row a link to a downed host costs a full timeout every time the bubble scrolls back into view (§ 8.3.)
- **Only a scrape that _threw_ is `failed`; everything the scraper read and could make nothing of is `empty`** — a page with no tags, a PDF, a 404, or a host the guard refused. Those are permanent answers, and filing them under the retry window means an outbound request per link per hour forever. `undefined` (threw) and `null` (read it, nothing there) are kept apart from `fetchMetadata` all the way to `statusOf`
- **Only a `failed` refetch falls back to the row it could not replace.** A page that has dropped its tags is written as `empty`; served from the old row, a card would outlive the page that published it
- **Every hop of the redirect chain is re-checked against `vetHost`** (§ 14.). `fetch` follows redirects on its own, which is exactly wrong here: a link on a public host that `302`s to `http://169.254.169.254/` is an attacker-chosen request from inside the deployment. The host is resolved with `node:dns` and **every** address it answers must be public. IPv6 is expanded to hextets rather than matched as text — a prefix test on the written form passes half of `::ffff:7f00:1`, `0:0:0:0:0:0:0:1` and friends
- **One `AbortSignal` bounds the whole resolution, not each hop — and the oEmbed attempt is one of those hops.** Armed inside the loop, four slow redirects cost four timeouts, the platform's function limit ends the request first, and nothing is cached, so the next scroll pays it again. `fetchMetadata` arms the signal once and hands it to both calls
- **Every quantifier before the `=` in the attribute regex is bounded.** `[\w:-]*\s*=` backtracks quadratically across a `<meta>` tag whose word characters never reach one, and the input is up to `MAX_LINK_PREVIEW_BYTES` of whatever the linked host chose to send
- The body is **read in chunks and stopped at `</head>`**, with `MAX_LINK_PREVIEW_BYTES` as the ceiling — not `response.text()`, because a `Content-Length` is a claim and a stream that never ends would be buffered until the process ran out of memory. Only `text/html` is read at all. **The ceiling is a megabyte, and that is not slack**: YouTube's watch page puts its Open Graph tags around 670KB in
- **Open Graph first, Twitter's tags second, `<title>` last**, scanned with regex rather than a parser — five tags do not justify a DOM, and nothing read is re-emitted as markup. A page declaring a non-UTF-8 charset is **decoded again in the encoding it declares**, or a Korean EUC-KR page puts mojibake in the card
- **YouTube tries its own oEmbed endpoint first, then falls back to the watch page.** oEmbed **answers 401 for a video whose uploader disabled embedding**, which is not a reason to give up — that video's watch page publishes Open Graph tags like any other. The 401 is swallowed rather than propagated, or the link caches as a failure
- **A YouTube URL's card is completed from its video id.** `findYouTubeVideoId` reads `/watch?v=`, `youtu.be/`, `/shorts/`, `/embed/`, `/live/`; the card is `video` and its thumbnail is `hqdefault.jpg` — the one variant every video has. The id-derived thumbnail **replaces** a ytimg one rather than filling an empty slot: a watch page always publishes `og:image` as `maxresdefault.jpg`, which 404s for an SD video, so a fallback that only fires on a missing image never fires. `/embed/videoseries?list=…` is excluded — `videoseries` passes the id shape and would force a card pointed at a video that does not exist
- **The thumbnail is rendered straight from the publisher's origin**, the one image in the app that is not an R2 object behind `/api/media`. `referrerPolicy="no-referrer"`, and a host that refuses hides the tile rather than leaving a broken frame
- The client holds the answer with `staleTime: Infinity` — it is already cached server-side for days

Remaining:

- [ ] A card is **not** shown while the scrape is in flight, so a bubble that turns out to have one grows once after it lands. Reserving the box instead would be a placeholder that usually collapses again, which is the worse jolt (§ 8.3.) — revisit if the cache hit rate ever makes the wait rare enough to bet on
- [x] **The vetted address is what gets dialled, never the hostname again.** Checking the name and handing that same name to `fetch` resolves it a second time, and the two answers need not agree: a record with a zero TTL can answer a public address to the check and `169.254.169.254` to the connection, which is DNS rebinding and walks straight past a guard that only ever sees the first answer. `vetHost` returns the address and the request goes out on an undici `Agent({ connect: { lookup } })` pinned to it — **not** a rewritten URL, which would have put the IP in front of TLS and broken SNI and certificate validation. The dispatcher is per-request and destroyed with the response, since a pool keyed to one pinned address cannot be shared
- [ ] A signed `og:image` URL (GitHub mints one that expires in five minutes) is stale long before the row is. The tile hides itself when the host refuses it, so the card degrades to text rather than breaking — a real fix is the proxy below, or a shorter TTL for a URL that carries an expiry
- [ ] Proxying the thumbnail through the app, which would keep the two users' IPs off the publisher's server. Not worth a route while this is a two-person app

### 8.10. Replying to a Message ✅

One nullable self-FK, `messages.reply_to_id`, and the rest is reuse.

- **The quote is joined at read time, never snapshotted onto the reply.** This is § 8.7.'s argument one level out: a nickname change reaches every quote, an edited emoticon (§ 13.4.) shows its correction inside the quote, and a soft-deleted parent turns every quote of it into `삭제된 메시지예요` with no backfill. The § 11.5. counter-case does not apply — a system notice outlives its `events` row, whereas an append-only `messages` row outlives nothing
- `ReplyPreview` carries **one level and no more.** It has no `replyTo` of its own; nesting `ChatMessage` would grow a long chain's payload with it
- `text` is sliced to `REPLY_PREVIEW_MAX_LENGTH` **on the server** — the quote clamps to one line
- `listReplyPreviews` deliberately **does not filter `deleted_at`** — the row is what `isDeleted` is read off, and filtering it renders a deleted parent as no quote at all. One query for the page, keyed by the **parent** id
- **`reply_to_id` is orthogonal to `type`**, so the § 6. payload CHECK is untouched and a reply may be text, attachments or an emoticon. A **separate** CHECK refuses a system parent (`DESIGN.md § 6.5.`)
- **`ON DELETE SET NULL`, never cascade.** Rows are only soft-deleted so this fires for nothing the app does, but a cascade would mean a hard delete silently took every reply with it
- `POST /api/messages` **checks the parent** before inserting, beside the `mediaIds` and `emoticonItemId` checks: an id with no row, or a system parent, would surface as a 500 rather than a 400. A soft-deleted parent is refused there rather than at the database, since the row is still present. The check is `isQuotable`, a three-column read, and deliberately **not** `getReplyPreview`: the preview costs a `messages` select plus the `listMessageMedia` join and the create path resolves it again to echo the row back, so validating through it made every reply pay four round trips for two
- **One submit, one quote.** Emoticon-then-attachments-then-text is up to three bubbles (§ 13.6., § 18. #10) and a pick of twenty photos is three more; the quote goes on the **first** bubble alone
- `답장` is the **first** action-sheet item, on either participant's messages
- **A pointer gets a hover button** beside the bubble on its outer side, positioned **out of flow** — in flow its appearance would shove the bubble sideways under the cursor aiming at it. `hover:` already resolves under `@media (hover: hover)`, so a touch device never reveals it
- **Touch pulls the row sideways**, as in Instagram. It engages only after 8px and only when the gesture leads horizontally, so the § 8.3. scroll keeps every ambiguous drag; once engaged it captures the pointer, which is why the hold disarms on movement and why the release suppresses the `click` it would otherwise end in — a pull that started on a photo must not also open the viewer
- A staged quote is **unsent work** (§ 15.1.), like a staged emoticon
- Deleting a message also retires the quotes of it **in the deleter's own window** — every other client's next fetch already resolves `isDeleted` from the row

#### 8.10.1. Jumping to the Quoted Message ✅

Tapping a quote runs the machinery § 8.6.1. will reuse unchanged:

- `GET /api/messages?around={id}` replaces the window; a target already in it skips the fetch, which is the common case
- `hasOlder` and `hasNewer` are both set **optimistically** after a jump — `around` splits its limit over two directions, so neither half's length says whether more exists. One wasted fetch per direction is the cost
- **`newestKnownId` does not move with the window.** It is the § 8.4. catch-up cursor and answers "what has this client been told about", which a jump into the past does not change. The window's own edges are tracked separately
- **A window parked around a jump target refuses SSE insertions** — there is a gap between it and the newest message, so appending an arrival would draw it directly under history it does not follow. The cursor still advances, which is what stops `returnToLive` from refetching that ground
- **`returnToLive` refetches the newest page rather than paging down to it** — the gap can be years wide. The § 6.7. pill is the control, visible while the window is away even when the scroller is at its own bottom
- **A send from a jumped-away window returns to the live edge first** — the bubble has to land somewhere the sender can see it
- The scroll waits a frame after the window commits. The virtualizer only takes the replaced rows on the next render, so scrolling inside the same call stack resolves the index against the previous window's measurements
- On arrival the row flashes `primary-tint` for `MESSAGE_FLASH_DURATION`. The flash is on the **row**, not the bubble's fill, so a media or emoticon message highlights the same way a text one does

- Search (§ 8.6.) reuses all of the above unchanged, and landing it added exactly one thing: the jump now claims the scroll, which the quote jump had always needed too (§ 8.6.1.)

### 8.11. Sharing a Message ✅

`공유` hands a message to the OS share sheet, and it is the same route § 10.'s 저장 takes — `shared/share` is one implementation with two labels (§ 2.).

- **Attachments go as files, a text message goes as its text.** An emoticon message offers no 공유 at all: it is a pack item both participants already have (§ 13.)
- **The action sheet is the touch half, a second hover button beside 답장 is the pointer half** (`AGENTS.md § 4.2.`). 복사 appears **only on a message that has text** — on an attachment bubble it copied an empty string
- **The media bubble takes the hold back from the OS.** `LONG_PRESS_TARGET_CLASS` plus `draggable={false}` on every tile suppresses the callout, and 공유 inside the sheet is the deliberate route to the photo library that replaces it
- **The viewer takes a 공유 control of its own**, beside 원본 저장 — a fine pointer has no OS callout over the photo to hold, and 원본 저장 lands in Files rather than a sheet. Hidden on a draft, absent on an avatar (§ 12.)
- **On iOS 원본 저장 is withheld and the remaining control is relabelled `저장/공유`**, by the same rule § 10.'s bar follows. The download lands in Files there, which is not where a user who tapped 저장 over a photo will look, and the hold this surface deliberately leaves to the OS is already the native route to 사진에 저장. Being the only control on screen, it takes the download glyph and the `save` route, not `share` — the sheet is identical either way, but the wait and the re-tap dialog are worded for whichever was asked for
- **The viewer dismisses on `Escape` and on a tap on the scrim.** It composes no `Dialog`, so what `Modal` inherits from Radix is written out — including the key being ignored while any overlay is open above it, or a confirmation dismissed with `Escape` would take the viewer with it. A control on a slide is not scrim. The photo is not scrim either — but its `<img>` box is not the photo, since `object-contain` letterboxes inside it, so the tap is tested against the **painted rectangle** (`DESIGN.md § 7.10.`)
- **The § 7.10. viewer is where the OS hold survives.** It suppresses none of the native gestures, so a photo opened full-screen still offers 사진에 저장 and everything else iOS puts in that menu. **This is the one file that must never gain a long-press target class**
- **A hold that fires swallows the `click` its release ends in, and cancels the § 8.10. pull.** Without the first, holding a photo opens the viewer underneath the sheet the hold just opened; without the second, the same finger goes on pulling the row behind the sheet. Only the pointer that armed the timer may clear the flag — a second finger landing while the sheet is up is not a new gesture
- **Deleting an attachment bubble is confirmed wherever it was reached from**, the sheet included: one row is every photo in it (§ 6.), which is the one thing neither the sheet nor the viewer shows. A text bubble's 삭제 stays immediate
- **The `share` route is not pointer-gated the way `save` is.** § 10. branches away from the share sheet on a fine pointer because a desktop sheet offers mail and AirDrop where 저장 meant a file on disk — but that sheet is exactly what a bubble's 공유 names, so this route takes it wherever there is one. Only its absence falls back, to the § 10. download for files and to the clipboard for text. Every fallback says which one it took: the 저장 wording and the 공유 wording are separate strings throughout. **This is the route, not the control** — the § 10. bar and the viewer decide by pointer which control they show at all, and both reach this route through `share`

### 8.12. Typing Indicator ✅

`입력 중` rides the § 8.4. stream as a third channel. Nothing is written, nothing is replayed, and the receiver's own timer is what takes it back down.

**`POST /api/chat/typing`** (start, resent) and **`DELETE`** (stop) — no body either way, 204 either way

- **A third channel on the one connection**, not a stream of its own. `LISTEN typing` joins `new_message` and `user_changed` on the socket § 8.4. already holds; a second `EventSource` would double the unpooled connections and need every § 8.4. resume rule written twice
- **No table, no column, no trigger.** The signal is published straight to `pg_notify` by the route. Stored instead, the app's highest-frequency write by far would churn WAL and hold Neon's compute awake — defeating exactly what § 8.4.'s background close exists to allow
- **The payload is the whole event** (`{ userId }`), unlike `new_message`'s id-and-refetch: there is no row to read back, and a uuid is nowhere near `NOTIFY`'s 8000-byte cap
- **It publishes on the pooled client** (`notifyChannel`). `AGENTS.md § 6.3.` — `LISTEN` is session state a pooler hands away, a notification is delivered at `COMMIT`
- **The payload carries no expiry.** A deadline computed by the sender is on the sender's clock; the receiver stamps `Date.now() + TYPING_TIMEOUT` on arrival, so two devices that disagree cannot hold the indicator up past the typing
- `event: typing` carries **no `id:`** — the reconnect cursor is a `messages` bigserial with no counterpart here, the same reason `user`, `build` and `ping` carry none. It is also written straight out rather than queued behind § 8.4.'s notification chain, which exists to keep row reads in id order and would deliver this after it expired
- **Never replayed and never caught up on.** A reconnect arrives knowing nothing, deliberately: a signal that meant "right now" ten seconds ago is not news. This is also why entering the chat tab can never show a stale indicator — there is nothing to read

**Client**

- **The ping repeats every `TYPING_PING_INTERVAL` while composing**, leading edge first so the indicator appears on the first keystroke. Not one request per keystroke, and not one request total — the repeat is what keeps the receiver's expiry from firing. **The floor outlives the composing state**: a held backspace flickers the draft false and true, and a leading edge armed fresh on each rise is a burst at exactly the rate the interval exists to cap
- **The payload schema has one definition** (`typingEventSchema`, `shared/config`) shared by publisher, stream and client. Written out per side it drifts, and the client's copy fails **closed** — `safeParse` stops matching and the indicator silently never appears again, raising nothing anywhere
- **`TYPING_TIMEOUT` at the receiver is what _guarantees_ it clears.** A sender who backgrounds, loses signal or is killed sends nothing at all, so silence has to be sufficient on its own and nothing may be built on a stop arriving
- **`DELETE /api/chat/typing` is an optimization on top of that, and only that.** Composing ends the moment the field is emptied or the message is sent, and waiting out `TYPING_IDLE_AFTER + TYPING_TIMEOUT` there reads as broken — the indicator sits under a message that has already arrived. The request is `keepalive`, since sending is the most common way to finish and a navigation immediately after would otherwise cancel it in flight
- **The ping floor paces repeats only, and a stop releases it.** The floor exists so a flickering draft cannot burst requests at the receiver, but it is throttling a signal that side already holds — once a stop has taken that signal away, the next start is news. Left standing across the retraction it swallows the restart for up to a full interval, and someone who clears the field and immediately types again reads as not typing while they type
- **A stop only ever brings the deadline forward**: the receiver deletes the entry rather than shortening it, and the sender emits one only if it has actually pinged since the last stop. Two requests can commit out of order, and a stop that lost to a ping still in flight would otherwise be undone by it
- **The sweep re-runs on resume.** A frozen page runs no timers, so a restored iOS PWA holds deadlines that are long past — re-evaluated on the § 8.4. resume rather than trusted, the same way the socket is
- **Typing is a stream of edits; staging is a state. They are not folded into one flag.** The emoticon panel being open and an emoticon being staged are true or false right now, so they arm the loop directly. An edit — writing **or deleting**, since the user is at the keyboard either way — is a pulse with no end event, so it holds the signal for `TYPING_IDLE_AFTER` and then lapses. Composing is `staging || edited within the window`
- **Never "the field is non-empty".** A draft is a thing that sits there: type a line, put the phone down, and an emptiness-keyed signal broadcasts 입력 중 at the other person for as long as the tab stays open — which is what shipped first and was wrong
- **Emptying the field is not an edit that extends anything — it ends the broadcast.** Deleting mid-word is an edit; deleting the _last_ character is the user saying they are done, and counted as an edit it renews 입력 중 at precisely the moment it should stop
- **Sending ends it too**, and needs saying because `submit` clears the field without going through the change handler — nothing else would ever retract the signal, and 입력 중 would sit under the message that had just arrived
- **Returning to a visible tab is not an edit.** The resume path re-arms the loop only if composing is still true by the same test, or a page restored an hour later would announce 입력 중 for the draft it is still holding
- **A hidden tab never pings.** A draft left in the field keeps the boolean true after the user walks away, and a background tab still runs the interval at the platform's once-a-minute floor — which reads as `입력 중` blinking on for eight seconds every minute, from someone who left. It observes the same four events § 8.4. does, for the same reason: iOS produces an inconsistent subset of them on a PWA app-switch, and trusting `visibilitychange` alone leaves the interval armed on the switches that fire only `pagehide`
- **The set lives in `ChatStreamProvider`**, beside the participants and the unread count, because that is where the stream is. My own signal is dropped on arrival — the channel is a conversation-wide broadcast, so my ping and my other device's both come back to me
- **The typist is resolved against the participant set**, and there is only ever one — § 1. puts exactly two people in the room, so the first id is the only id
- **The indicator is the last thing in the conversation, not an overlay floating over it.** It is the list's own content, immediately under the newest bubble, so it scrolls with the messages and reads as the bubble that is about to arrive
- **Its slot animates open and shut** between `0` and `--typing-indicator-height`, on a real `height` transition — never a `0fr`→`1fr` grid track, for the reason § 13.6.'s emoticon strip carries. Mounted outright the row appeared and vanished in a single frame and the end of the list lurched under anyone following it; opened over 200ms it pushes the conversation up instead
- **`--typing-indicator-height` is derived from the bubble, not from the avatar.** One line of `chat-body` plus the bubble's own `py-xs` and its hairline is about 40px against the `chat` avatar's 36 (`DESIGN.md § 7.7.`), so a slot sized to the avatar clipped the row by that difference for as long as it was up — which is what the indicator looking cropped actually was. The token takes the `max()` of the two, so it stays right if the type scale ever moves under it
- **The row fades in once the slot has finished opening**, on a 200ms delay matching the transition. The strip clips, so a row drawn _during_ the growth is a horizontal cut travelling down through the avatar and the bubble; held at zero for those 200ms the reader sees the conversation pushed up by an empty gap and the row appears in a slot that is already its own size. Nothing fades out — the row unmounts with the typist and the gap closes behind it
- **A reader at the bottom is held there for every frame of that transition**, by a `ResizeObserver` on the slot — the job `useComposerClearance` already does for the composer's own growth, and the reason the growth is safe at all. **The threshold is the slot's own height**, which is what makes it self-limiting: being within it of the bottom is exactly the condition of having been at the bottom before this frame grew. A fixed epsilon loses the follow on the first frame; a loose one yanks a reader who had deliberately scrolled up
- **The slot sits above the trailing spacer, never inside it.** That spacer is by definition the strip the composer covers (`useComposerClearance` measures exactly `container.bottom − composer.top`), so anything placed in it is behind the bar
- **It is not a virtualized row either.** `ListFooter` already holds this position: content the scroller lays out itself and the virtualizer never measures (§ 8.3.)
- **An empty room has no scroller**, and that is exactly when this matters most: the other participant composing the conversation's first message. It is positioned there where that message will land

**The switch** (§ 12.) — `users.typing_indicator_enabled`, default `true`

- **Migrate before shipping** (§ 6. rule 2), and this column more than most: `getSessionContext` selects `users` by explicit column list, so code deployed ahead of `0018` fails **every request that resolves a session** — the `(main)` layout, every Route Handler, login — on `42703`, not merely the chat tab
- **A column on `users`, not a prefs table.** `user_emoticon_prefs` exists because it is per-pack; one boolean is read for free by the Settings screen's own Server Component render
- **It rides `PATCH /api/users/me`** rather than an endpoint of its own — it is a column its owner may write, which is what that route is, and the § 12. client is reached through `@x/typing-indicator` rather than copied
- **Enforced in `POST /api/chat/typing`, and nowhere else.** Filtered where the indicator renders, the signal has already left the sender's device, and the setting means "do not broadcast that I am typing". The client deliberately does **not** cache the preference to skip the request: it would be fixed at whatever the page was rendered with, and § 8.4. restores a frozen PWA without re-running that render — so a device that had been open across the change would broadcast against the switch, or fall silent behind one reading 켜짐. The route cannot go stale, and the request it discards is one POST per interval from a user who is actively typing
- **It never reaches `toParticipant`**, and must not. Shipping it would tell the other participant that this person turned the indicator off, which is precisely what turning it off withholds
- **Not reciprocal.** Turning it off changes what this account sends and nothing about what it receives; read-receipt-style trading buys nothing between two people
- **Rate limiting is still open** (§ 14.), and this is now the endpoint most exposed to it — one authenticated POST costs a session lookup, a `pg_notify`, and a frame on every open stream

---

## 9. Media Storage (R2)

**Landed** apart from the blurhash placeholder and two accepted-risk items.

- `POST /api/media/upload-url` issues a **pair** of presigned PUTs — the object and its `{key}_thumb` sibling — and `POST /api/media` registers the result. The upload goes **client → R2 directly**, which gets a full-resolution iPhone photo past Vercel's 4.5MB request body limit and makes `XMLHttpRequest`'s `upload.onprogress` a real byte count
- **The key is built server-side from the uploader's id** (`{scope}/{userId}/{uuid}`, `toScopePrefix`) and never read off the request — a signature the browser could aim is a signature that overwrites any object in the bucket. `POST /api/media` re-checks the prefix and matches the **scope** as well as the id. `MEDIA_UPLOAD_SCOPES` is `chat`, `avatar` (§ 12.) and `background` (§ 12.1.), deliberately **not** `emoticon`, or a § 13.3. object could be claimed as a `media` row and would then be a gallery row
- **`POST /api/media` is the only place § 14.'s type and size limits actually hold — for the thumbnail as much as for the original.** Verified against the live bucket: **R2 enforces neither the signed `Content-Type` nor any size on a presigned PUT.** So the server `HeadObject`s both keys, reads back what R2 really holds, and refuses to write a `media` row for anything outside the allow-list. Nothing in the app addresses R2 by key, only by `media.id`, so an unregistered object is unreachable
- Caps: **50MB per photo, 500MB per video** (`shared/config/media.ts`). The video ceiling is an upload-**reliability** limit, not a storage one — a presigned PUT is one request with no resume, so raising it means adopting multipart upload, not a bigger number
- `GET /api/media/{id}?variant=thumb|original` validates the session and `302`s to a presigned GET. `variant` defaults to `thumb`; only the fullscreen viewer asks for `original`. Same-origin, so a bare `<img src>` carries the session cookie. `Cache-Control: private, max-age` is **shorter than the signature's expiry**, or the browser replays a cached redirect to a URL R2 has stopped honouring. Both windows stay at minutes here, unlike § 13.3.'s: a `media` URL carries no version, so the bytes behind it are only immutable by convention
- **Never rely on a UUID in the URL as access control** — every read revalidates the session **and then checks the object itself**: readable when the caller owns it, when it hangs off a message that has not been deleted, or when somebody is wearing it as an avatar (§ 12.) or a profile cover (§ 12.1.). A **chat wallpaper is not in that list** (§ 12.2.) — the owner check is all of its authorization. An unreadable id answers **404 rather than 403**, so the response cannot confirm it exists
- **Saving the original is a `Content-Disposition` on the presigned GET**, requested with `?download=1`. An `<a download>` is not enough: the route answers a 302 and the spec makes the browser drop the attribute once the navigation resolves cross-origin, which in a standalone PWA replaces the app with a bare asset view and no way back
- Thumbnails are rendered in the browser at pick time (long edge 720, JPEG) and uploaded beside the original. For a video the same slot holds the **poster frame**, extracted by seeking a decoded `<video>` onto a canvas — which on iOS requires `muted` + `playsInline` + an actual `play()`, since WebKit will not decode a frame for a video that has never played. The seek is guarded on **both** sides: a container whose `duration` is `NaN` at `loadedmetadata` throws when assigned to `currentTime`, and seeking to the position the video already holds fires no `seeked` at all — either way the promise never settles, and decoding is serial, so one such file silently swallows the rest of the pick. A timeout backs both guards
- R2 credentials live only in server env. `shared/storage` is `server-only`; `toMediaUrl` lives in `shared/config` rather than `entities/media`, because a client value-import from that barrel drags `server-only` into the browser bundle
- Read path for chat: the `message_media` rows for a whole page arrive in **one** query, ordered by `sort_order`, and only when the page actually holds an attachment
- Deleting media also deletes the R2 objects — the gallery's delete does it for a photo no message carries (§ 10.)
- **R2 bucket configuration is a deploy step, not code** (§ 15.): private with public access fully disabled, and a CORS policy allowing `PUT` **and `GET`** from the app origin — without `PUT` every upload fails preflight, without `GET` the § 10. share route cannot read the bytes it hands to the share sheet. `AllowedHeaders` needs **`Content-Type` only**, and no upload may add a second header without this line changing first: the live policy names headers one by one. That is not hypothetical — § 13.3. once sent a `Cache-Control` on the emoticon PUT and every emoticon upload failed until the header moved to the download side

Remaining:

- [ ] Use `media.blurhash` as the pre-load placeholder for grid and bubble images. Box reservation (§ 8.3.) is done and works without it, so this is polish
- [ ] An upload that is registered and then re-PUT before its URL expires would swap the bytes under a validated row. Harmless with two trusted users, and the fix — invalidating the ticket at registration — is only worth it if this ever stops being a two-person app

### 9.1. File Attachments ✅

Any file, not only what the app can draw. The composer's `+` offers `파일` beside `사진/영상`, and the same object goes to R2 the way a photo does — what differs is that nothing renders it, which is exactly what the rules below protect.

- **`media.filename` is the discriminator, and the server sets it.** A row with a filename is a file attachment; a row without one is a photo or a video. `registerMedia` decides that from the mime R2 actually stored (`isFileMime` = shaped like a mime **and** outside the § 9. media allow-list) and never from the client's claim — letting the client set it would file a JPEG out of the gallery, or claim a `.zip` was a photo and put an undrawable row in the grid
- **A type the app cannot render is a file, rather than a refusal.** That is what makes the two lists one list: `image/svg+xml` and a `.mkv` arrive as downloadable cards instead of as broken tiles, and no second allow-list has to be kept in step with the first. `MIME_PATTERN` is a shape check, not a policy — the compensating control is the disposition below
- **One PUT, not the § 9. pair.** There is no frame to render a thumbnail from, so `POST /api/media/upload-url` signs no `_thumb` URL and `registerMedia` requires no `_thumb` object. Both HEADs still go out together, because deciding first would put the two round trips in series on the send path
- **`GET /api/media/{id}` serves a file as `Content-Disposition: attachment` whatever the query asks for**, under its stored name in RFC 5987 form (`filename*=UTF-8''…`, which is what carries a Korean document title). It is also forced to the `original` variant, since there is no thumb object to answer a default `?variant=thumb` with. Nothing in the app opens one inline, so this is the only way the URL is ever used — and it is why an arbitrary stored type is not a rendering risk
- **`width`/`height` are stored as `0` and the name is sanitized at registration** — `toSafeFilename` strips control characters and path segments, so nothing a drop carries can be built into that header. It truncates **by code point**: a `slice` counts UTF-16 units and would cut a trailing emoji inside its surrogate pair, and the lone surrogate left behind makes the header encoder throw on every later attempt to save that file. The encoder is not `encodeURIComponent` alone either — that leaves `'` unescaped, which is the delimiter `UTF-8''…` is built from
- **A file never reaches the 사진 grid, the viewer, or a background — but it does reach 보관함, under its own segment.** The kind test is `isOfKind` (§ 10.), which is `filename IS NOT NULL` for 파일 and, for 사진, `filename IS NULL` narrowed by the § 9.3. voice clause; `registerMedia` still refuses a file under the `avatar` and `background` scopes and still refuses `addToGallery`; the § 8.10. quote drops its thumbnail id and shows `파일` from `toMediaKind`. Until the 파일 segment existed the exclusion was total, and a sent file could not be found again anywhere — that is what § 10. fixed
- **§ 8.11.'s 공유 is withheld on a chat bubble, and that is the whole of its scope — 보관함's 파일 segment does offer it.** The original reason was that `useMediaShare` was written for photos: it named every `File` from the mime, which for a file attachment has no extension and produced `{uuid}.bin`, and it worded each step in 사진 and 장. **That was a fact about the code path, never about files**, so § 10. fixed the path rather than inheriting the exclusion — `collectShareFiles` takes an id→name map and every counted sentence takes its counter. What is left on the bubble is a different and durable argument: the card's own tap already downloads it, so a second route to the same bytes in the hold sheet is a row that does nothing new. In 보관함 a selection of several is the thing being handed over and no tap has downloaded any of them
- **A shared file MUST be named from `media.filename`.** R2 keys carry no name, and the server's own `Content-Disposition` cannot be read back in the browser: the header is not CORS-safelisted and the response has already redirected cross-origin (§ 9.). Reaching it would mean adding `ExposeHeaders` to the bucket policy, which is a deploy step (§ 15.) — passing the names the client already holds is the cheaper and more direct answer
- **A file's 저장 is the download route on every platform, iOS included.** § 10.'s `isIos()` branch exists because the share sheet is the only way to the **photo library**, and a document has no business there: on iOS a downloaded file lands in Files, which is exactly where it belongs. So `savesToPhotoLibrary` is false for the 파일 segment, and with it go both the merged `저장/공유` row and the `MAX_GALLERY_SHARE_FILES` selection cap iOS otherwise imposes. **Do not reuse § 10.'s platform branch for files**
- **Tapping a file card saves it, and says so** (`파일을 저장하고 있어요`). `downloadMedia` clicks a detached anchor and resolves whatever the navigation then does, so a 404, a blocked popup or an iOS standalone context that swallows it would otherwise leave a tap with no feedback at all — the same reason § 10.'s 저장 toasts, since the control that started it is gone by the time anything happens
- **What kind a pick is gets resolved one way, through `toStoredMime`.** An empty `File.type` is routine, and reading it raw in the composer's media-only gate meant the same typeless JPEG staged as a file card in the room and was refused outright in the gallery — the two screens have to agree on what a file _is_ before they can differ on whether they take it
- **`POST /api/media` puts no length bound on `filename` at all**, neither `.max()` nor a code-point refine. Registration runs _after_ the bytes are in R2, so every rejection at that schema orphans an object no row can name and no retry can rescue — the same 400 comes back forever. The truncation above is already the harmless answer to an over-long name, so bounding it at the schema only converts a truncation into an orphan. **This generalizes**: a validation that can only be reached post-upload should sanitize, not refuse
- **A typeless pick is resolved from its own name before the fallback is taken.** Routing it straight to `FALLBACK_FILE_MIME` made both screens agree on the wrong answer: `application/octet-stream` fails the media gate exactly as `""` does, so calling `toStoredMime` in front of that gate changed nothing at all and the divergence above went on shipping. `toMediaMimeFromName` reads the extension against the **reverse of `MIME_EXTENSIONS`** — one table, so the name a type is stored under and the type a name implies cannot drift — and answers the § 9. allow-list or nothing, since guessing a type the app cannot draw would push a file attachment onto the media path instead. `File.type` still wins whenever the browser reported one: it read the bytes, where an extension is only a claim. The resolved type is what the draft carries into the signed PUT, or a name-resolved photo would be uploaded under an empty `Content-Type` and refused at registration with the bytes already in R2
- **A bubble is files or photos, never both, and `ownsAllMedia` is where that holds.** § 6. gives one `messages` row one layout and the two are drawn at different heights, while five readers — the grid, the § 8.3. estimate, `toMediaKind`, the quote and 공유 — take the whole bubble from `media[0]`. `toBubbles` splits a pick into **consecutive runs** by kind before chunking each by `MAX_MEDIA_PER_MESSAGE` (so a pick of photo, file, photo keeps the order it was made in), but that runs in the browser and a stale client does not — so `POST /api/messages` refuses a mixed `mediaIds` set outright
- **`POST /api/media` accepts a zero `width`/`height` only from a file.** The schema had to widen to admit the one kind with no box to measure, so `registerMedia` re-establishes positivity for everything else: `toMediaBoxHeight` divides by `width` for a single attachment, and one stored zero resolves the virtualized list's total size to `NaN` and stops it laying out entirely
- **A zero-byte pick is refused at the pick** (`빈 파일은 보낼 수 없어요`), because `POST /api/media/upload-url` takes a `positive` size — staged, it produced a bubble whose 재전송 reproduced the identical 400 forever. Media never reached that: a zero-byte image or video fails to decode and is already refused with `파일을 읽지 못했어요`
- **A file's mime is bounded in length as well as in shape.** The file branch admits anything matching the mime pattern, and that pattern constrains no length — so an unbounded client string was signed into the PUT's `Content-Type`, stored on the row, and echoed by every download. `isFileMime` caps it at 255, which is where every other user-controlled string on this path already was
- **`filename` is bounded server-side by code point, never by `.max()`.** `toSafeFilename` truncates by code point on purpose (a `slice` cuts inside a surrogate pair and the lone surrogate makes `toDisposition` throw), so a name of emoji sits well under the cap and at twice it in UTF-16 units — a zod `.max()` rejected exactly those names with a 400 **after** the object had landed in R2, orphaning it on every retry
- **The size ceiling refuses an unrecognised type as its own branch, never by returning `0`.** The registration test is `size <= ceiling`, and a zero-byte object passes `0 <= 0` — reachable, because a presigned PUT enforces neither the signed type nor any size (§ 9.)
- **`POST /api/media/upload-url` mirrors the scope rule rather than leaving it to registration.** A ticket is live for `UPLOAD_URL_EXPIRY`, so refusing a file only at registration means a 500MB archive already sitting in `background/` with no row able to name it
- Cap: **500MB**, the same upload-reliability ceiling § 9. sets for a video and for the same reason — one presigned PUT with no resume

### 9.2. Drag and Drop ✅

Dropping photos, videos and files anywhere over the chat room stages them in the composer's tray, exactly as a pick does. **The Gallery tab takes the same drop** (§ 10.), into the same staging tray its picker fills.

- **Desktop-only by nature, never by a branch.** Touch platforms fire no drag events, so this needs no pointer or user-agent test to stay off there — `AGENTS.md § 4.2.`'s one sanctioned UA branch stays the only one
- **A drag is armed off `dataTransfer.types`, never `files`** — the file list is empty on `dragover` for security, so a guard reading it would never arm, and this is also what keeps a dragged text selection from lighting the overlay up
- **`dragover` must `preventDefault` on every event**, not only the first: the default action is what the browser reads as "this target does not take drops"
- **Enter/leave is counted, not flagged** — `dragenter` fires again for every child the cursor crosses, so a boolean flickers off over every bubble the pointer passes
- **A window-level `preventDefault` swallows drops that miss.** Unguarded, the browser navigates to the file, which in a standalone PWA replaces the app with a bare asset view and no way back. It is `FileDropGuard`, **mounted once on the `(main)` shell rather than inside the drop targets** — the hazard is app-global while only two of the five screens under the shell take a drop, so a guard living in the hook left 캘린더, 설정 and the emoticon screens navigable straight out of the app
- **The guard also has to _say_ it is refusing** — `dropEffect = "none"` beside the `preventDefault`. Cancelling `dragover` is what makes an element a valid drop target, so the guard alone had every screen in the app advertising the copy cursor for a file it then discarded in silence. **It sets that only on a drag nothing else claimed**, tested through `defaultPrevented`: `useFileDrop` runs first (React dispatches from the root, which is below `window` in the bubble path) and sets `copy`, and overwriting that with `none` would not merely restore the wrong cursor — a target whose effect is `none` is delivered no `drop` event at all, so the chat room and the gallery would stop taking files entirely
- **The overlay is `pointer-events-none` and never unmounted.** An overlay that takes pointer events appears under the cursor mid-drag, the target below reads that as `dragleave`, and the whole thing flickers at frame rate while the drop never lands
- **A dropped folder is discarded through `webkitGetAsEntry`** — it arrives as a `File` with no type and no bytes, which no size check can tell from a real empty file
- Drops are refused for the length of a § 8.6. search, where the composer and its tray are put away and nothing could send what was staged
- **In the gallery they are refused for the length of a selection** for the same class of reason: the selection bar deletes, and a drop that uploaded into the grid behind it would recreate exactly the window § 10. closes by withholding selection while an upload is in flight
- **They are refused under an editor or the viewer on both screens.** React bubbles a drop through the _component_ tree, not the DOM one, so `MediaEditor`, `VideoTrimmer` and the § 7.10. viewer all deliver one to the target they are rendered inside however they are portalled — and the staging sheet is suppressed for exactly the duration of the two editors, so the drop staged an attachment into a tray the user could not see. Every refusal reason is passed by the caller, since only the screen knows what is covering its tray
- **The gallery's overlay is portalled into the shell box; the room's is not.** The gallery screen _is_ the shell scroller's content, so an `absolute inset-0` overlay left inside it spans every month ever loaded and centres its label far below the fold — `ShellOverlay` is the one box sized to what the user can see, and going `fixed` to reach it is what `AGENTS.md § 4.4.` rules out
- The overlay says what the drop lands in, in the screen's own words: `여기에 놓으면 첨부돼요` in the room, `여기에 놓으면 추가돼요` in the gallery. **The label is a required prop with no default** — defaulting it to either string would make the shared overlay partial to its first caller, and the next drop surface would inherit the wrong copy with nothing failing. Non-media dropped on the gallery is refused by the same `useMediaSelection` guard the picker goes through (`사진과 동영상만 올릴 수 있어요`), since a § 9.1. file has no tile the grid can draw

### 9.3. Voice Messages ✅

A recording made in the composer, sent as its own bubble and played inline. It rides § 9.'s pipeline unchanged — what is new is a column, a discriminator, and a microphone.

**Why almost nothing in the transport had to change**

- **An audio mime was already a § 9.1. file mime.** `isFileMime` is "shaped like a mime **and** outside the § 9. media allow-list", and `audio/mp4` is exactly that — so `POST /api/media/upload-url` already signed the single thumbnail-less PUT, already refused every scope but `chat`, and `registerMedia` already admitted a zero `width`/`height`. **The audio allow-list is deliberately not added to `ALLOWED_MEDIA_MIMES`**: doing so would make `isFileMime` false for `audio/mp4` and an attached `.m4a` would stop being a file attachment
- **The one genuinely new problem is telling a recording from an attached audio file**, and mime cannot: both are `audio/mp4`. That is what the discriminator below exists for, and it is why "just check `mime LIKE 'audio/%'`" is wrong

**The discriminator**

- **`media.waveform_peaks` is what makes a row a voice message** — peaks present, recording; peaks absent, not. It is the payload and the flag at once, which is the § 9.1. pattern (`filename` does the same job) applied a second time rather than a new idea
- **An explicit `media.kind` enum was weighed and rejected.** It is the more honest model and it is what a third or fourth kind would eventually want, but it costs a `NOT NULL` column backfilled across every existing row, leaves `filename` as a second source of truth for the same question, and rewrites the § 10. predicate that a parallel change was already restructuring. The derived column costs one nullable column, **no backfill at all** (every existing row is correctly "not a voice message"), and one clause in § 10. If a fourth kind arrives, revisit this — the argument is about the cost of the second kind, not a claim that derivation scales
- **The client supplies it, and that is the one place a discriminator is not server-decided.** It has to be: the server never sees the bytes (§ 9.), so it cannot extract a waveform. What `registerMedia` enforces instead is that peaks may ride **only** a mime this app records into, **only** in the recorder's exact shape (`isWaveformPeaks` — the fixed count, integers in range), and **only** under the `chat` scope with no `addToGallery`. Peaks that fail any part of that are a **refusal**, never a silent downgrade to a file — stored as a file, the object renders as a download card in the bubble the sender recorded a voice message into
- **The consequence of a forged claim is bounded**, which is why client provenance is acceptable here where it was not for `filename`: the worst case is an attached `.m4a` rendered as a player instead of a card. Both are legitimate renderings of an audio file and both are outside the gallery, so nothing is exposed that was not already

**Storage**

- **Peaks are `smallint[]`, integers `0`–`VOICE_PEAK_SCALE`, always `VOICE_WAVEFORM_PEAKS` of them.** A float array doubles the row's width for precision no 2px bar can show. `toVoiceTrack` is the **one** place the scale is crossed into the `0`–`1` everything above the wire works in, and it answers `null` rather than `{ peaks: [] }` for a non-voice row — every reader tests that value for truthiness, so an empty track draws a photo bubble as a voice card
- **The peaks are extracted in the browser, while recording.** The server has no bytes to analyse and decoding server-side would mean buffering the upload through the app, which § 9. exists to avoid. An `AnalyserNode` sampled every `VOICE_SAMPLE_INTERVAL` yields RMS amplitudes, resampled at the end by **maximum per bucket, never mean** — speech is mostly silence between syllables and a mean flattens a sentence into a uniform band
- **`duration_ms` is wall-clock, measured by the recorder.** `MediaRecorder` writes no duration into a WebM at all and the MP4 yields one only after a decode — and the player draws its progress against this figure, so a null reads as a waveform that never moves. `registerMedia` **keeps** it for a voice row where it nulls it for a file; that asymmetry is the whole point and it was a real bug first
- **`width`/`height` are `0`, as § 9.1. stores them for a file.** Both kinds are drawn at a fixed height, so there is no ratio to reserve — `hasNoBox` is the single test both take

**Recording**

- **The container is negotiated at runtime through `MediaRecorder.isTypeSupported`, never hardcoded.** No type is both recordable and playable everywhere: WebKit records only MP4/AAC and **cannot play WebM at all**, while Firefox records only WebM/Opus. **MP4 leads the candidate list even though Opus is the better codec** — what matters is the receiving device, and a recording the other participant's phone refuses is worse than a larger one. A Firefox-recorded WebM is the accepted gap
- **The codecs parameter is stripped before the mime is stored.** `MediaRecorder` reports `audio/webm;codecs=opus`, and `MIME_PATTERN` refuses a `;` — unstripped, the PUT succeeds and registration then rejects the object _after_ the bytes are in the bucket
- **`MAX_VOICE_DURATION` is 2 minutes**, and the ceiling is legibility rather than bytes: the peak count is fixed, so a longer clip buys nothing but a coarser bar, and past this length a recording is a file rather than a turn in a conversation. Reaching it **stops** the recording and keeps what was said — losing two minutes to a limit nobody was watching is the failure this avoids. Under `MIN_VOICE_DURATION` it is dropped silently, since a press released immediately is a mis-tap and a toast would scold the user for a gesture they had already abandoned
- **A recording's `duration_ms` is required, not merely nullable, and registration refuses a voice row without one.** It is wall-clock from the browser and nothing on the server can recompute it, while the player draws its progress against it — at `0` the bubble reads `0:00` under a waveform that never fills however long the clip runs
- **`MAX_VOICE_SIZE` is enforced at registration only.** The ticket cannot narrow it — a recording and an attached `.m4a` are indistinguishable before the peaks arrive, so `upload-url` measures against the § 9.1. file ceiling and registration applies the real one
- **The microphone is refused for three different reasons and says which**, off `DOMException.name`: `마이크 권한이 필요해요`, `이 기기에서는 녹음할 수 없어요`, `녹음하지 못했어요`. One shared string leaves the user whose permission is off with nothing to act on
- **`start` runs inside a user gesture**, and the recorder bar starts the microphone from its own mount for that reason — from a **layout** effect, never a passive one. React schedules passive effects onto a task of their own that runs after paint, which is off the discrete event's call stack; Chromium and Gecko survive on the transient-activation window but WebKit gates `getUserMedia` on the stack itself and refuses the first recording on iOS as `NotAllowedError` without ever asking
- **The `AudioContext` is minted before the `await`, inside that same gesture.** WebKit starts one constructed off a gesture stack `suspended`, and a suspended graph renders nothing through the analyser — every sample reads as silence, the live meter never leaves its floor, and `toWaveformPeaks` stores 56 zeroes under audible speech
- **A refusal that never reaches `requesting` is reported by return value, not by state.** An engine with no `MediaRecorder` refuses before the state ever changes, and the bar closes itself off a state change — so without it the strip stands in the composer over a clock that will never move
- **The sample interval is cleared by whichever control ends the recording**, not left to `onstop`. That event is a queued task, and the 50ms tick can fire inside the gap: it re-raises the cap toast and calls `stop()` on a recorder already `inactive`, which throws `InvalidStateError` out of the interval
- **A pick abandoned while the permission prompt is still up is answered after the prompt, not before it.** 취소, 완료 and the bar's unmount all land in a window where there is no recorder to stop and no stream to release, so neither can undo anything — the request is marked abandoned instead and the stream is stopped the moment it arrives. Without it a permission granted after the bar closed opened the microphone with no UI left to close it, left the session in `play-and-record`, and left `start`'s own in-flight guard refusing every later attempt until a reload. 완료 is the same hazard read the other way: it means "finish", and without the flag a permission granted afterwards **starts** the microphone
- **Capture moves the page's audio session to `play-and-record` and returns it through `declareRestingAudioSession`**, never by naming a category of its own (§ 13.6.). The resting category is written down in exactly one place, so revisiting it cannot leave capture behind. § 5.3. carries the real-device check this needs

**Sending**

- **The `+` sheet carries a `음성` row; the composer's control row is untouched.** `DESIGN.md § 6.6.` fixes that row at attach, field, emoticon toggle and send, and a fourth 44px target in it is what makes the round buttons oval on an engine without `field-sizing-content`. The row is last in the sheet, because the two above it open a picker and this one opens a microphone
- **A recording is sent outright rather than staged into the tray.** `useMediaSelection` holds one list that `toBubbles` splits by kind, so a staged recording would sit beside photos competing for a § 6. row it cannot share — and 완료 already reads as the commitment a tray exists to defer
- **It goes through `sendMedia`, not a path of its own** — that is where the § 9. upload, the per-bubble progress, the § 8.5. retry and the one delivery queue live, and a second copy of any of them would drift
- **`toBubbles` splits on three kinds, not two.** A recording carries no filename, so the old `filename !== null` split grouped it with the photos either side of it — one bubble whose first cell decides the layout for all of them. `ownsAllMedia` holds the same rule at the server, where a voice set is additionally capped at **one**: there is no layout for two
- **The optimistic bubble plays from a local blob URL**, handed to the cell's `originalUrl` — the one draft that supplies one, since a photo's preview is a thumbnail and has no full-size object until it registers. **A pending voice bubble is therefore dimmed but not inert**, which is the opposite of every other attachment and was wrong in the first cut: the player was gated on `isPending`, so the wiring that supplies the blob was dead code. Only a missing source disables the control, and the label says `음성 메시지, 전송 중이에요` because dimming reaches no screen reader. Retiring that bubble must `stopVoice()` **before** revoking, and only when `isVoiceActive` says the shared player is parked on that source: unconditional, it cuts off an older voice note the reader is listening to; reversed, `stopVoice`'s own `load()` runs against a freed blob

**Where a voice message is not**

- **It never reaches the library** (§ 10.). `isOfKind`'s 사진 branch excludes it explicitly, because a recording shares `filename IS NULL` with a photo and would otherwise tile the grid with a broken image over a viewer that opens on nothing. 파일 excludes it for free. **A 음성 segment is a later change** — `isNotNull(media.waveformPeaks)` added to that predicate, which is precisely the cheapness the derived discriminator was chosen for. An attached `.m4a` and a recording belong on **different** shelves for the same reason Telegram separates Music from Voice: one is a document to keep, the other is a turn in a conversation
- **`toMediaKind` answers `voice` before anything else**, and off the first item alone — a voice bubble is always one clip. Its § 8.10. quote and § 16.1. push body read `음성`
- **It carries no § 8.10. quote thumbnail and no § 8.11. 공유**, and both tests are `filename` **and** `voice` rather than `filename` alone. A recording has no `_thumb` object, so the quote's `<img>` would be pointed at the audio itself — which the id route now serves as the original — over a `QUOTE_THUMBNAIL` the § 8.3. estimate had already reserved. 공유 is withheld for the reason § 9.1. gives for a file: `extensionForMime` answers `bin` for `audio/mp4`, so the sheet would be handed `{uuid}.bin` under a dialog worded 사진. The client's optimistic quote and `listReplyPreviews` answer this **the same way**, or the tile appears and disappears under the reader when the echo lands
- **It never survives a search.** The composer's whole stack is hidden and `inert` while one is open (§ 8.6.), and the recorder is **closed** rather than hidden with it — hidden, the microphone runs on with 취소 and 완료 both unreachable, and `MAX_VOICE_DURATION` then sends a recording the user walked away from two minutes earlier
- **It never survives leaving the room.** The shared element outlives every bubble addressing it, so `ChatRoom` stops it on unmount — unlike § 13.6.'s two-second ping a recording runs for minutes, and no screen outside the room draws a transport that could pause it

**Migration**

- **`0021` is a migrate-first migration** (§ 6. rule 2), and for the § 9.1. reason exactly: Drizzle's `select()` names every column, so a build that knows `waveform_peaks` cannot read `media` at all until it exists (`42703`) — and every chat page with an attachment, the whole gallery tab, and every `canReadMedia` goes through that read. Run `pnpm db:migrate` **before** deploying. A nullable column the previous build neither reads nor writes is invisible to it, so the reverse order is the only unsafe one

---

## 10. Library Tab (`보관함`)

**Landed** apart from the jump-to-message link, which waits on § 8.6.1.

The tab is `보관함` with two segments, `사진` and `파일`; the route is `/gallery` and stays that way (§ 7.).

**Why 보관함 is a top-level tab, where KakaoTalk puts the same thing in a chat room's drawer.** Kakao has hundreds of rooms, so "everything we exchanged" is only answerable _per room_ — the drawer is subordinate to a room because it has to be. **This app has exactly one conversation, permanently (§ 6.), so "this room's drawer" and "the app's library" are the same set of rows.** Given that, a tab is strictly better than a drawer: it is one tap from anywhere instead of two from inside the room, and it does not compete with the chat header's own controls. The constraint that forced Kakao's placement does not exist here, and a second conversation is ruled out at the schema level — if that ever changes, this tab is one of the things that has to move, alongside the § 6. rewrite.

**Segments, not a second tab.** 파일 shares the query, the cursor, the month sections, the selection and the delete with 사진; only the row and the save route differ. A fifth tab would also break the four-column bar `DESIGN.md § 7.3.` is dimensioned for.

- **`kind` is a union (`LibraryKind = "photo" | "file"`), never an `isFile` boolean.** 음성 is the third member this is waiting for, and a boolean would have to be unpicked from the predicate, the API, the fetch, the hook and the URL alike rather than gaining one literal. It is **derived from `mime` and `filename`, never stored** — no column, no migration
- **Membership and kind are two predicates.** `isInLibrary()` is "not hidden **and** (carried by a visible message **or** uploaded straight here)"; `isOfKind(kind)` is the `filename` test, plus the § 9.3. clause that keeps a recording off the 사진 shelf. They were one function until 파일 got a segment, and the split is what lets `removeGalleryMedia` reach every segment with one 삭제 while each listing stays on its own shelf
- Images **and videos** sent in Chat **appear under 사진 automatically** — `media` is the single source, nothing is copied. **A § 9.1. file attachment appears under 파일** by the same rule; it is excluded from the 사진 grid alone (`filename IS NULL`), because it has no `_thumb` object and a tile of one is a broken image the viewer would open on nothing
- Reverse-chronological 3-column grid with month section headers (`DESIGN.md § 7.10.`), the month resolved through `toDayKey` so a photo sent at 00:30 KST falls under the month it was taken in. **파일 is the same month sections as a one-column list of `FileCard` rows** — `toGallerySections` takes `GalleryMedia` and needed no change at all
- **`FileCard` is one component in `shared/ui`, rendered by the bubble and by 보관함 alike** (`DESIGN.md § 6.5.`). Copied, the row a file is drawn as would drift between the two places it appears
- **The 파일 list has no hold and no sweep.** The grid's sweep fills a _range in grid order_ across three columns; in one column that range is the two taps it saves, and owning `touchmove` to buy them is not a trade. A checkbox states the selection instead
- **Tapping a file downloads it.** § 9.1. serves one as `Content-Disposition: attachment` whatever the query asks for, so there is no inline view and `MediaViewer` is not mounted on this segment at all
- **파일's selection bar keeps all three rows, and 공유 is a real one.** 저장 is `downloadMedia` directly rather than `useMediaShare`'s save, and 공유 goes to the sheet with `names` so each `File` carries its stored filename (§ 9.1.). Every counted sentence on this segment is in `개`, which is why the counter is a parameter of `toShareCapMessage`, `useMediaShare` and `MediaShareDialog` rather than a literal — and why the particles are chosen by `josa` (`3장을` but `3개를`, `3장이` but `3개가`) rather than written into the sentence — `AGENTS.md § 0.4.`
- Cursor-based infinite scroll on the `(created_at, id)` **pair** (§ 6.), **shared by both segments** — same page size, same `::timestamptz` cast, same sentinel rule. Both halves are required together; a half cursor is a `400`. The timestamp is bound as an **ISO string with an explicit `::timestamptz`** — a bare template parameter carries no column to take its type from, so postgres.js refuses a `Date`, and without the cast Postgres resolves the row-constructor parameter to `text`, where `2026-08-06T…` sorts after `2026-08-1…`. It is exact **only because the column is `timestamptz(3)`**
- **A page arriving that deduplication empties still advances paging.** The sentinel effect keys off the load _finishing_, not the row count changing — keyed off the count, a fully duplicate page leaves the list identical and nothing ever asks again
- Tapping opens the fullscreen viewer, which swipes across the **whole loaded gallery** rather than the month it was opened in. It is the § 8.1. viewer, moved to `shared/ui` (§ 2.)
- **The viewer loads only the current slide and its two neighbours.** Every slide requesting its original on mount is bounded inside a chat bubble by `MAX_MEDIA_PER_MESSAGE` but by nothing here — opening one photo after three pages of scrolling started 180 requests. Slides outside the window render an empty box at the stored ratio, so the snap track never resizes
- **Multi-select is entered from the header control _or_ by holding a tile**, which picks that tile. A tap still opens the viewer, since the hold swallows the `click` it ends in (§ 8.11.). The hold is **touch-only**: `contextmenu` is left alone, because the header control is already this gesture's pointer equivalent (`DESIGN.md § 3.2.`). It is withheld while an upload is in flight. `MAX_GALLERY_SELECTION` caps a selection, said in the UI rather than reported as a rejected request
- **The hold arms a sweep: keep dragging and the whole range from the held tile to the one under the finger takes the hold's action**, in grid order, row by row. It is a **range, not a trail** — a trail leaves a diagonal drag full of holes, and the range is what lets pulling the finger back release what it left behind. Every range is applied to the selection **as it stood when the hold fired**, never to the last range. Holding an _already_ selected tile sweeps deselection. The drag scrolls the grid while the finger rests within `EDGE_ZONE` of the scroller's edge, and re-tests what is under the finger on every frame the grid moved — a parked finger sends no move event, and there the tiles are what travels. It is **touch events, not pointer events**: only a non-passive `touchmove` can `preventDefault` the scroll, and `touch-action` cannot stand in, since the finger is already down when the sweep arms. Four consequences of owning the gesture that far down:
  - **The listeners are attached inside the hold, never from an effect.** An effect runs a frame later, and a finger lifting inside that window is a `touchend` nothing is listening for — leaving a document-wide `preventDefault` swallowing every later scroll, with a live anchor selecting behind it
  - **The sweeping finger is tracked by `Touch.identifier`**, adopted on the first move as the touch nearest where the hold fired — not `touches[0]`, which is a thumb that has been resting on the grid since before it. Only that finger's `touchend` ends the sweep, or, before the first move, a release within `GESTURE_SLOP` of the anchor
  - **The tile under the finger is found with `elementsFromPoint`.** The selection bar floats over most of the bottom edge zone and takes pointer events, so the single topmost element there is the bar and the range would stop growing exactly where the auto-scroll is feeding it
  - **The cap truncates from the anchor outwards.** A sweep running _up_ the grid is ordered away from the finger, so keeping the first `MAX_GALLERY_SELECTION` would strip the held tile and light up a distant block instead. The cap toast carries a fixed `id`, because a sweep held past the cap reaches it again on every tile
- **Saving the selection takes one of two routes, chosen by platform — and the platform that branches is iOS, not touch.** (**사진 only.** A 파일 selection always downloads, `savesToPhotoLibrary` is false for it, and none of the rest of this bullet applies there — § 9.1.) On iOS it is `navigator.share({ files })`, because the OS share sheet is the **only** way a web page reaches the iOS photo library: a `Content-Disposition: attachment` download lands in Files, where nobody who tapped 저장 over a photo will look. Everywhere else it is one top-level navigation per file, staggered by `GALLERY_DOWNLOAD_STAGGER`, because navigations started in one tick collapse into one. **Android is on the download side deliberately**: its share sheet has no OS-provided "save to gallery" action at all, only whichever apps are installed, while a download lands in `Download/` and MediaStore indexes it straight into the gallery — so there the sheet is the unreliable route and the download is the good one. The branch is `isIos()` **and** `navigator.canShare`, not either alone. It cannot be a pointer check: an iPad with a trackpad reports a fine pointer and still cannot get a download into Photos, and an Android phone reports a coarse one and does not need the sheet. It cannot be feature detection either — nothing exposes "will this download be findable", so this is the one sanctioned user-agent branch (`AGENTS.md § 4.2.`). (§ 8.11.'s 공유 shares the machinery but not this branch: it names the share sheet outright, so it uses one wherever there is one)
- **The share route buffers the originals first, so it is bounded twice**: `MAX_GALLERY_SHARE_FILES` on the count and `MAX_GALLERY_SHARE_BYTES` on the total, read from each response's `Content-Length` **before** the body is buffered — otherwise one 500MB video is in memory before the ceiling is noticed. That header is an early exit and never the ceiling itself: a chunked response, a proxy that drops it, or an engine that does not expose it cross-origin all report `0`, and a total summed from those alone stops guarding exactly when it matters, so the running total is held to `blob.size` and re-checked after each body lands. Either bound, or any failed fetch, falls back to the download route rather than opening a sheet holding part of the selection, which would read as a successful save of all of it. This needs R2's CORS to allow GET as well as PUT (§ 15.)
- **The bar carries 공유 beside 저장 everywhere but iOS, where the two collapse into one row.** They are separate controls because they reach separate places: the download to disk or to the gallery, the sheet to whatever the OS offers. On iOS both would take the identical route, so only one row is rendered — and it is **저장's**, relabelled `저장/공유` and keeping the download glyph, because the sheet is what the tap arrives through and not what it was for. It calls the `save` route, so the buffering wait and the re-tap dialog are worded for 저장 (`DESIGN.md § 7.10.`)
- **On iOS the selection itself is capped at `MAX_GALLERY_SHARE_FILES`, not `MAX_GALLERY_SELECTION`.** The sheet is the only route out there and cannot be handed more than twenty files, so the cap moves onto the gesture that fills the selection rather than the tap that spends it: the sweep stops at twenty and says why through the cap toast it already carries. **The cost is that 삭제 is capped with it** on that platform, since one selection feeds both. Everywhere else the selection keeps `MAX_GALLERY_SELECTION` and 삭제 keeps its reach — which is why **공유 is guarded at the tap**: it renders where a selection can be ten times what a sheet accepts, and letting it through would fall back to two hundred downloads, which is not what 공유 was asked for. It refuses **before** clearing the selection, or the refusal would also cost the user the sweep they just made
- **A share refused for a spent user activation asks for one more tap.** iOS spends the tap's transient activation on the first `await`, and buffering the selection is many. The files are already in hand, so the dialog offers `사진에 저장` and calls `share` straight out of that click with nothing awaited before it
- **A pick is staged before it is uploaded**, and on desktop that pick can equally be a drop anywhere over the grid (§ 9.2.) — both land in the same tray, so the `대화에도 보내기` / `보관함에만 추가` choice is reached the same way whichever route filled it. The picker used to hand its files straight to the upload, which left no way to correct a bad frame or drop one item of forty. It now stages into `useMediaSelection` — the same hook the composer's tray uses (§ 8.1.) — so both screens edit an attachment the same way, and the `대화에도 보내기` / `보관함에만 추가` choice sits under the tray rather than in front of it
  - **`useGalleryUpload` therefore takes drafts, not files.** Validation and decoding have already happened by the time it runs; reading the files again there would decode every one a second time and throw the edit away
  - **The staging sheet closes while either editor is up** (§ 13.4.'s rule, and the same trap): `MediaEditor` and `VideoTrimmer` portal into the app shell while the sheet portals into `body`, so no z-index inside the shell can lift them over it and the sheet has to get out of the way instead
  - **The tray is emptied with `takeAll`, never read from state.** It hands the previews over without revoking them, and the upload revokes each as it settles — left to the hook's unmount cleanup, the blob would be killed mid-upload
- Direct upload from the gallery, with an option not to post it to the conversation (`대화에도 보내기` / `보관함에만 추가`). Files upload through § 13.4.'s bounded pool, which answers in **pick order**, not completion order. Uploads always carry `gallery_added_at` — the user filed the photo here, so it must be in the grid whether or not the POST succeeds, and must survive that message later being deleted. A post longer than `MAX_MEDIA_PER_MESSAGE` splits into consecutive bubbles in order (§ 18. #10.)
- **Selection is unavailable while an upload is in flight**, and "in flight" runs until the `postMessage` settles, not until the last byte lands. `addToGallery` puts a row in the grid before it has a `message_media` child, which is exactly what the delete path reads as "nothing renders this, remove it outright" — deleting there would pull the row out from under the send. The screen closes that window; the server cannot, because the two states are indistinguishable to it
- **A second pick while the first batch is running is ordinary**, so the progress counter is written **relatively, never absolutely**. It is claimed before decoding rather than after — reading forty photos' real dimensions takes seconds, and an absolute write would let the first batch finishing zero the counter under the second and flip the screen to its empty state mid-upload
- **Read authorization admits a gallery-only object.** `canReadMedia` would otherwise refuse the other participant a photo that hangs off no message; the gallery is shared
- **The viewer carries 배경으로 설정** (§ 12.1.), here and in a chat bubble's viewer alike. It is hidden on a video, which has no still frame to wear, and on a draft, which has no stored object for the server-side copy to read. The sheet is mounted **outside** the viewer's own conditional, so dismissing the viewer over it cannot unmount it mid-write

**Routing and the API**

- **Two routes, one tab.** `/gallery` is 사진 and `/gallery/files` is 파일. Nested under `GALLERY_ROUTE`, so `isUnderRoute`'s prefix rule keeps the tab bar's fill on 보관함 and `RouteTransition` resolves both to the same tab index — which makes `directionBetween` return `none`, so **a segment switch does not slide** (`DESIGN.md § 4.7.1.`). That is the correct outcome and it needed no code: a segment is not a sideways move between tabs
- **The segments are two `Chip`s wrapping `Link`s, not an underlined segmented control** (`DESIGN.md § 7.10.`). Links, so the back button walks between them and each is announced as navigation; chips, for the reason `DESIGN.md § 7.3.` gives about two travelling indicators one strip apart. They are withheld in selection mode, as the header's own controls are — a segment tap there is a navigation that would drop the selection with nothing having said so
- **One endpoint, not two.** `GET /api/gallery` takes `kind`, defaulting to `photo`; an unknown value is a **400** rather than a silent fallback, so a client asking for a shelf this build has never heard of is not handed photos instead. `DELETE /api/gallery` is unchanged and reaches both segments

- [ ] A link that jumps to where the image was sent in the conversation. **The machinery it was waiting on is built** (§ 8.6.1.) — what is left is finding the message a `media` row hangs off, and reaching the chat tab with a target the room will take

---

## 11. Calendar Tab

### 11.1. D-day Header ✅

- The relationship start date comes from the **`RELATIONSHIP_START_DATE` env var** (ISO `YYYY-MM-DD`); it is **not stored in the database**
- Following the Korean convention, **the start date itself is day 1** (`countDays(start, today) + 1`)
- Computed in a Server Component and passed down, so a skewed client clock or timezone cannot give each user a different number. `todayKey` ships with it for the same reason — the grid's "today" cell must not be the device's opinion either
- Recomputed on tab focus, in case the app was left open across midnight. It is a refetch of `GET /api/calendar/summary`, **never a client-side recount**, or the bullet above would be undone on the first focus

### 11.2. Derived Anniversaries ✅

- **Derived from `RELATIONSHIP_START_DATE`** — no database rows, no user input: every 100 days (100 / 200 / 300 …) and yearly anniversaries
- Marked in the month grid distinctly from ordinary events — a `primary` diamond (DESIGN § 7.9.), which is why `primary` is kept out of the event colour set (DESIGN § 4.1.7.)
- **Days remaining until the next anniversary** shows beneath the D-day header, hidden past a one-year horizon
- The derivation lives in **`shared/lib/date/calendar.ts`, not `entities/event`** — the grid derives markers for every month it is swiped to, and a value import from that barrel would drag `server-only` into the browser bundle. Yearly anniversaries are built by **calendar-field arithmetic, never by adding 365 days**, so a leap year cannot walk them a day early

### 11.3. Month View

**Landed:** event markers in day cells (capped at three dots), swipe left/right to change month with the header's chevrons as the pointer equivalent, tapping a day opens that day's list in a `BottomSheet`, timezone pinned to `Asia/Seoul` on both server and client.

- The swipe requires horizontal **intent** (|Δx| > |Δy|), or a diagonal drag would change month while the user was scrolling the shell
- **A drag over the grid never selects a day.** A finger that scrolls the shell or swipes the month from inside a cell still releases into a `click` on it, so the grid's own `onClickCapture` swallows the tap once the pointer has moved past `GESTURE_SLOP`
- The grid is **always six rows** — a height that changed with the month would reflow the screen under the thumb on every swipe
- The month's fetch asks for the **grid's** range, not the month's, so the adjacent-month days in the first and last rows carry their markers too
- **Selecting a day moves the month with it.** The upcoming card reaches a year ahead and the grid's edge rows reach into neighbouring months, while the day sheet can only see the range currently loaded — without it the sheet opens on `이 날은 일정이 없어요` for a day the card just said had an event
- Month fetches are **request-id guarded** — two quick swipes leave two in flight, and the slower one landing last would leave the grid showing the wrong month's dots with nothing left to re-trigger the fetch
- Opening an event's actions **closes the day sheet first.** Both are modal `Drawer`s portalled to `body` and neither is declared nested, so leaving both up means two focus traps — and dismissing the top one can leave the one underneath inert

- [ ] A "jump to today" control — the D-day band and the upcoming card both navigate, so this has no room yet; it belongs beside the month label

### 11.4. Event CRUD ✅

- Create / edit / delete — title, description, start and end time, all-day flag, color, recurrence (`none` | `yearly`). Create and edit are **one form**; the fields are identical
- Both users can **view and edit every event**; there are no permission tiers. No write path is scoped to `created_by`, so a missing row is the only 404. Authorship shows via `events.created_by` — the avatar, in the day sheet's row
- The form works in **wall-clock fields** (`<input type="date">` / `type="time"`, which iOS renders as its own wheel picker) and converts once, at submit. `TIME_ZONE_OFFSET` is a literal `+09:00` and is sound **only** because Korea observes no daylight saving
- **An edit seeds from the occurrence's anchor, never its projection.** A `yearly` event edited while looking at a later year would otherwise be saved into that year and stop recurring from where it started
- `PATCH` sends only what changed. The ordering check runs against the stored row when a patch moves one end alone, since the body schema can only compare two ends it was given both of
- **The patch schema is built on an undefaulted shape.** `zod`'s `.partial()` makes a key optional but does **not** strip its `.default()`, so a schema shared with the create path would resolve `PATCH {"title":…}` into a body carrying every default and the UPDATE would wipe description, colour, recurrence and scope. Defaults belong to `eventBodySchema` alone
- **The form's date and time fields are clearable**, so `toInstant` is nullable rather than throwing. `isDraftSubmittable` runs during render, where a `RangeError` out of `toISOString` is a blank screen rather than a disabled button

### 11.5. Sharing Features ✅

Include only what pays off for exactly two users. Invitations, RSVP, permissions, and external calendar sync are **not adopted** — with two mutually trusting users they are pure complexity.

- **Event `scope`** — `shared` (ours) or `mine` (my personal schedule), defaulting to `shared`. `mine` events are still **visible** to the other user, **title included** (§ 18. #9) — this is a distinction, not a privacy control; the point is to communicate "I'm busy that day". They are told apart in the month grid by marker **shape** (filled dot for `shared`, ring dot for `mine`), not colour, which is already spent on the event's own hue
- **A `type = 'system'` message posts to Chat when an event changes** — e.g. `지희님이 8월 10일 '영화 보기' 일정을 추가했어요`
  - **Do not bake the name into the stored text.** Store `sender_id`, `system_action`, and the `event_title` / `event_starts_at` snapshot, then **compose the sentence at render time from `users.nickname`** (§ 8.7.). The event snapshot is deliberate, not a violation: a delete notice must still say which event it was, and its `events` row is gone. Only the _user_ name must never be copied
  - Post on create, time change, and delete. **Do not post** when only the title or description changed
  - This rides the existing SSE pipeline — the `AFTER INSERT` trigger on `messages` (§ 6.) publishes it, and the event routes publish nothing themselves
  - It also raises the § 16.1. **push** banner through the same `notifyMessageRecipients` the chat send uses. `features/notify-chat` exists so there is literally one fan-out: § 16.1. permits exactly one alerting channel, and a second copy written beside the event routes is how that stops being true. The banner's body is the notice **without** its actor, since the banner's title is already the sender
  - Rendered as a centered pill with no bubble (same treatment as the date divider — DESIGN § 6.4., § 6.5.); tapping navigates to the event's **day** (`?day=`). The day, not the event id, is deliberately the whole destination: a delete notice outlives its `events` row, so half of these notices have no id to carry
  - The `day` parameter is **shape- and value-checked** before it reaches a date helper (`isDayKey`). `?day=` or `?day=2026-13-45` otherwise arrives as an Invalid Date, and `Intl.DateTimeFormat.format` throws on one — a 500 on a URL anybody can type
- **Upcoming-events card** directly under the D-day header, summarizing the next one or two events; hidden entirely when there are none
- **A dot on the Calendar tab-bar icon when there is an event today** (a single dot, not a count). Resolved by the shell's server render, not over the stream — `user_changed` carries `users` rows, and this changes at most once a day
- **Empty state** for a day with no events (DESIGN § 7.6.)

### 11.6. Notifications ✅

Landed as § 16.1. Calendar changes reach the user as § 11.5. chat system messages on the same pipeline; **there is no calendar-specific notification and no scheduler.**

---

## 12. Settings Tab

**Landed:** the profile editor (nickname + avatar + cover), the tap-to-enlarge avatar, the 입력 중 표시 switch (§ 8.12.), the two backgrounds (§ 12.1., § 12.2.), the profile screen (§ 12.3.) and 로그아웃. The device list and app info remain.

The screen opens on a **half-viewport cover header** (`DESIGN.md § 7.16.`) rather than the old padded avatar block — the § 12.1. background is drawn behind the avatar and the name, and tapping the avatar opens § 12.3.

**Profile** — `PATCH /api/users/me`, reached from a 프로필 row or § 12.3.'s 프로필 편집; `features/update-profile` owns the sheet and reuses § 9.'s picker, editor and upload through `@x/update-profile`.

- The nickname set here is exactly what appears as the sender name in chat and inside system sentences (§ 8.7.), initialized from the Google account name at first login. `MAX_NICKNAME_LENGTH` bounds it, and the body is trimmed **before** the length check — twenty spaces would otherwise pass and § 8.7. would fall back to the email local part for a name the user believes they set
- Saving needs no explicit broadcast — the UPDATE lands on `users`, so the § 6. trigger fires `user_changed`. The Settings screen itself is a Server Component, so it takes the new row from a `router.refresh()`
- **An avatar is a `media` row on the § 9. pipeline, under the `avatar/` key scope.** Such a row reaches neither the gallery (no `message_media` child, no `gallery_added_at`) nor the § 10. delete path
- **`ownsAllMedia` takes the scope, and each pipeline's objects stay inside it.** Ownership alone fails in both directions: an `avatar/` object attached to a message acquires a `message_media` child under the row the next profile change deletes, which fails on that non-cascading key (§ 6.) and leaves its owner permanently unable to change their photo; a `chat/` object worn as an avatar puts that same delete in front of a photo a bubble still renders. `POST /api/messages` passes `chat`, `PATCH /api/users/me` passes `avatar`
- **`addToGallery` is refused outside the `chat` scope**, not ignored — an avatar filed into the grid is deleted outright by § 10.'s removal, whereupon `users.avatar_media_id`'s `ON DELETE SET NULL` silently strips the wearer's photo
- **The crop is not optional and it is square.** The editor opens on the pick with `fixedAspectRatio={1}` and the ratio chips gone; backing out of it is backing out of the pick. A circle (`DESIGN.md § 7.7.`) crops anything else anyway, and squareness is what lets the full-screen view reserve its box without a round trip
- **`canReadMedia` admits an object somebody is wearing.** Without it the other participant 404s on the avatar that names every bubble in front of them. The check is **last**, after the message join, so it costs nothing on the common path — and an avatar the owner has since replaced falls through it, which is what makes the swap real
- **The write reads the photo it replaces in the same statement**, through a `users` self-join whose alias Postgres resolves against the pre-update snapshot. A separate `SELECT` first cannot promise it: two devices saving different photos would both read the same row, and the loser would be reported by neither — orphaning its objects permanently, since `canReadMedia` admits only a **currently worn** avatar
- **The patch body must carry at least one key.** Both are optional, so `{}` parses, and the empty `.set()` behind it makes drizzle throw `No values to set` — a 500 for what is a malformed request
- **A replaced photo's row is deleted at once and its objects on the § 13.4. delay.** The other participant is holding the 302 the old id resolved to, cached for `MEDIA_CACHE_MAX_AGE` (§ 9.), so deleting the object with the row is a broken image rather than a stale one. `discardScopedMedia` is narrowed to the caller's own prefix **for the scope it is given**, not merely their own rows: a crafted `PATCH` can aim any of the three media columns at any object its sender owns, and a chat photo reached that way would be deleted out from under the bubble carrying it. It runs in `after`, never inline: the profile write has already committed and `user_changed` has already fired, so a transient failure in cleanup answering 500 would leave the sheet open on `프로필을 저장하지 못했어요` for a save that landed — and the retry uploads a second avatar
- **The `background/` discards are collected across both columns and filtered against what is still worn.** § 12.1. and § 12.2. share one scope, so one photo may sit in both — and changing only the cover would otherwise delete the object the wallpaper is still drawn from

**Avatar enlargement** — tapping an avatar opens the photo full screen in the § 7.10. viewer. A single square cell with **no save control**: a profile photo is the person, not an attachment they shared. `Avatar` owns both halves behind `mediaId` and `canEnlarge`, and lives in `shared/ui` (§ 2.).

- **`canEnlarge` is off by default and stays off in the calendar day sheet** — that avatar sits inside the row button that opens the event (§ 11.4.), where a nested `button` is invalid markup and swallows the tap the row exists for
- **The button takes over sizing when it wraps the circle**, which keeps `className` meaning one thing either way. Left on the circle, a caller's `size-*` would size the wrapper while the circle kept its own — and the day sheet passes exactly that
- **The enlargement moved one level in when § 12.3. landed.** An avatar in chat or on the Settings cover now opens the **profile screen**, and it is that screen's own avatar that enlarges. `Avatar` carries both affordances and `onClick` wins over `canEnlarge`, because one avatar can only mean one thing per screen

### 12.1. Profile Background ✅

`users.profile_background_media_id` — the cover behind the § 12.3. profile screen and the Settings header. **Published**: it is projected by `toParticipant` and the other participant sees it.

- **A column on `users`, not a table.** § 8.12.'s argument, unchanged: one nullable reference per user is read for free by the Server Component that already selects the row. `ON DELETE SET NULL`, like the avatar beside it
- **Its objects live in their own `background/` scope**, which is added to `MEDIA_UPLOAD_SCOPES` and to `StorageScope`. `ownsAllMedia` is what enforces it at the `PATCH`, exactly as `avatar` is enforced — the two arguments are the same one (§ 12.)
- **`canReadMedia` admits an object worn as a profile cover**, beside the avatar clause and for the same reason: without it the other participant 404s on the photo the profile screen is drawn from. **The chat wallpaper is deliberately not in that clause** (§ 12.2.)
- **배경으로 설정 copies rather than points.** A photo already in the gallery or a chat bubble reaches `POST /api/media/copy`, which `canReadMedia`-checks the source and then duplicates **both** R2 objects into `background/{userId}/{uuid}` with a server-side `CopyObject` — the bytes never leave the bucket. Pointing the column at the source row would have been free and is wrong twice over: § 12.'s replacement cleanup would stand in front of a `chat/` object a bubble still renders, and § 10.'s gallery delete would silently strip the background through `ON DELETE SET NULL`. The copy is registered through `registerMedia`, which re-`HeadObject`s both keys — § 14. is a claim about a key, and the copy is a different key
- **The route fixes the scope itself and does not read one off the body.** `chat` would mint a row § 10.'s gallery immediately owns; `avatar` would put a second copy behind the next profile save's cleanup
- **The source must be an image, checked on the server.** The viewer withholds the control on a video, but that is a client decision and the route is reachable without it — a video worn as a cover is drawn into an `<img>` in front of the other participant, having first duplicated up to `MAX_VIDEO_SIZE`. It answers **415**
- **A missing source and an unreadable one both answer 404**, per § 9. — the response must not confirm an id exists. **A failed registration is its own status (422) and must not be folded into that 404**: the copy has already put two objects in the bucket, and reporting it as a source that does not exist leaves them attributable to nothing
- **배경으로 설정 is one hook, not two copies.** The chat room and the gallery both mount the § 7.10. viewer and neither may import the other (§ 2.), so `useSetBackground` returns the handler and the sheet as a pair. The sheet is handed back **separately** because it has to be mounted outside the viewer's own conditional — inside it, dismissing the viewer unmounts the sheet mid-write and orphans the copy
- **The sheet cannot gate a second tap with state.** `ActionSheet` fires `onSelect` and closes in the same tick, so by the first `await` the sheet is already closed and any `isBusy` it holds gates nothing — while the viewer underneath is still up, still offering the control. The guard is a **ref**, and without it a slow connection turns an impatient second tap into a second orphaned `background/` object. The wait is reported by `toast.promise`, which is the only surface left on screen
- Edited in the **프로필 편집** sheet beside the avatar, with a free-form crop: the cover is drawn `object-cover` against the visual viewport, so a fixed ratio would crop it twice. The sheet's preview box is a letterbox and promises no framing — the cover is worn at two different geometries (`DESIGN.md § 7.16.`) and no single preview can stand for both
  **A profile cover may be a video** — the chat wallpaper may not (§ 12.2.), and that asymmetry is the whole of the decision. A profile is opened and closed, so the decode is bounded; the wallpaper sits behind § 8.3.'s virtualized list for as long as the tab is open.

- **Capped at `MAX_BACKGROUND_VIDEO_DURATION` (30s) and `MAX_BACKGROUND_VIDEO_SIZE` (20MB)**, and the size cap has nothing to do with `MAX_VIDEO_SIZE`. That one bounds an upload's reliability; this one bounds a **download** — a cover is fetched in full every time either participant opens that profile. `maxSizeForScope` is what applies it at registration, where § 14. actually holds
- **The length cap is enforced by trimming, never by refusal.** A longer pick opens `VideoTrimmer` rather than being rejected, so the cap never costs a re-pick
- **Every video pick opens the trimmer, cap or no cap.** Inside the window there is nothing to enforce, so it opens free-range and a clip needing no cut is finished by tapping 완료 — the cap is handed over only when the clip actually exceeds it, or when the container reports no duration at all, which is the one case that would otherwise walk past the ceiling
- **Trimming is `mediabunny`, in the browser** (the first dependency added since § 1. was written). It copies the encoded samples across whenever the source codec fits the output container, so an iPhone clip is re-muxed rather than re-encoded. Input formats are named **one by one** (`MP4`, `QTFF`, `WEBM` — exactly `ALLOWED_VIDEO_MIMES`) rather than `ALL_FORMATS`, because the library tree-shakes to whatever that list names
- **The audio track is discarded, and that is a compatibility decision as much as a size one.** A background plays `muted`, so the track could never be heard — and dropping it means the whole operation needs only WebCodecs' **video** interfaces, which Safari has had since **16.4**. The audio interfaces landed in Safari **26**, so keeping a track nobody can hear would have raised the app's floor by ten major versions
- **A `<video>` must mount with its source, never receive one afterwards.** A browser judges autoplay once, when the element loads its source, and it is not re-judged when `src` changes — so an element rendered while its object URL is still being minted in an effect sits on frame 0 forever, which is the black frame it starts on. Every preview here holds its player back until the URL exists. `PreloadVideo` also starts playback by hand at `loadeddata`, because React assigns `muted` as a property rather than an attribute and the element can be unmuted at the moment autoplay is judged
- **A `<video>` with no decoded frame paints black, not nothing**, so every one the app draws _as content_ goes through `PreloadVideo` — `PreloadImage`'s contract for the element that cannot use it. **The § 7.10. viewer is the one deliberate exception**: it renders a bare `<video controls>`, because there the element is a player rather than a surface — it keeps the platform's own controls, and an unplayable container already has its 이 기기에서는 재생할 수 없는 형식이에요 fallback with 원본 저장 beside it. Four rules the wrapper carries, each of them a bug it shipped without:
  - **A `poster` suppresses the skeleton rather than sitting under it.** The element paints a poster as soon as _that_ image loads, independently of the video data, so an opaque skeleton on top hides the very frame this feature keeps a poster for
  - **`hasSkeleton` is off for a full-bleed surface**, exactly as `PreloadImage` requires. `Skeleton` is an opaque `surface-strong`, so over a cover it is a pulsing light plate the size of the screen
  - **`loadeddata` reveals a poster-less element; `loadedmetadata` only starts a bounded deadline.** `HAVE_METADATA` is _zero decoded frames_, so revealing there reveals the black this wrapper exists to prevent — but waiting for `loadeddata` outright is a hang, because an engine honouring `preload="metadata"` stops at `HAVE_METADATA` and sends nothing further, and neither does WebKit once it has refused autoplay (iOS then falls back to `preload`, so **`autoPlay` does not guarantee `loadeddata` either** and cannot be the discriminator). `FIRST_FRAME_GRACE` is the ceiling: prefer a real frame, never wait past it. With a poster none of this applies — the element is already revealed and there is something painted the whole time
  - **WebKit's own start-playback button is suppressed** (`no-start-playback-button`). Where autoplay is refused, WebKit paints a large play glyph over the element — a control the app never rendered, which hides the poster a refusal is supposed to leave, and which on the Settings cover is not even pressable, since the § 7.16. gradient spans the same band. The rule needs `!important`: it is a UA shadow pseudo-element and WebKit's own declaration otherwise wins on iOS
  - **The caller reserves the frame's box, and a preview over a dark surface has to.** `PreloadFrame` is sized by whatever is inside it, and a `<video>` with no frame has no intrinsic size — so a caller passing only `max-h-full max-w-full` renders the skeleton and the failure glyph at 0×0. On `VideoTrimmer`'s `bg-scrim` overlay that was the whole bug: a clip that never decoded left a black screen with no preview, no error and 완료 disabled forever, reachable from 프로필 편집 on every video pick. The trimmer reserves the box from the draft's own dimensions, falling back to 16 / 9 for a container `toVideoDraft` could not measure
  - **An unplayable container is named, not merely glyphed.** The trimmer answers `onError` with the § 7.10. viewer's sentence — 이 기기에서는 재생할 수 없는 형식이에요 — because the glyph says a load ended and only the sentence says the pick is unusable and 취소 is the way out
  - **The failure glyph's `bg-surface-strong` sits on the same element as `placeholderClassName`**, never on a child of it, or a full-bleed caller's `bg-scrim` stops overriding it and a failed cover becomes the half-viewport light plate `hasSkeleton={false}` was added to prevent — with the `text-on-primary` name on top of it
- **The two wrappers are one shell, not two copies.** Each rule above was a prop the copy dropped, so they now share `useLoadStatus` (status, the reset when `src` changes, the § 13.3. retry) and `PreloadFrame` (the reserved box, the skeleton, the failure glyph) in `preload-media.tsx`. Each file keeps only what its element does — the `<img>`'s cached-status read-back and retry URL, the `<video>`'s reveal events and hand-started playback. **A prop added to one is added to the shell**, not copied across
- **The poster is the `_thumb` sibling § 9. already stores, and it is load-bearing rather than decorative.** iOS refuses muted autoplay outright in Low Power Mode, and nothing in the page can detect that state — without the poster the cover would be a black rectangle for those users instead of a still frame
- **`Participant` carries `isProfileBackgroundVideo` beside the id.** A `media` id says nothing about its kind, and the renderer has to choose between `<img>` and `<video>` before it fetches anything. `listUsers` resolves it with a **`leftJoin`** — an inner one would drop every user who has set no cover, which is most of them
- **The kind is checked server-side on every write path**, not only where the control is drawn. `POST /api/media/copy` takes the **slot** (not the scope, which both backgrounds share) and permits a video only for `profile`; `PATCH /api/users/me` separately refuses a video for `chat_background_media_id`, because that column is writable with any `background/` object its owner holds — including one copied a moment earlier for the profile
- **A copy checks the caps against the source row before copying anything.** `registerMedia` re-checks the size of what landed but cannot see a duration, and a copy is the one path where the bytes never pass through a client that could measure one

- **The sheet's slot identity must not be the picker's open flag.** `MediaPickerSheet` is an `ActionSheet`, which fires `onSelect` and closes itself in the same tick while the OS file dialog opens asynchronously — a slot stored in the open flag is already `null` when the file arrives, and **every pick lands in whichever slot the fallthrough names**. Shipped that way, choosing a new profile photo silently replaced the cover instead, uncropped

### 12.2. Chat Background ✅

`users.chat_background_media_id` — the wallpaper behind the conversation. **Private**: drawn on its owner's screen alone.

- **It must stay out of `toParticipant`**, exactly as `typing_indicator_enabled` does (§ 8.12.), and out of `canReadMedia`'s worn-on-a-profile clause. The owner check is the whole of its authorization, and the copy 배경으로 설정 makes is owned by whoever set it — so a wallpaper taken from the other participant's photo is still only readable by the person wearing it
- **A Settings row of its own, not a slot in 프로필 편집.** The sheet is named for what the other participant sees; a private wallpaper inside it would say it is public
- **Per account, like the 입력 중 switch and unlike the push toggle** — it is a `users` column, so it follows the person rather than the browser
- **The wash over the photo is a fixed token (`chat-scrim`), not a slider.** Every meta colour in the room — `chat-meta`, the date pill, `읽음` — was chosen for contrast against `chat-canvas` (`DESIGN.md § 4.1.`), and a photo underneath them is an arbitrary colour. A user-chosen opacity has a setting at which the timestamps are unreadable
- **The backdrop is the room's first child and every sibling after it is absolutely positioned too**, which is what orders them: both are in the positioned-descendant paint order, so DOM order decides and no `z-index` is involved. One here would have to outrank the composer
- **It is `pointer-events-none` throughout** — it sits under the § 8.3. scroller and under the § 8.11. hold on every bubble, and a photo in the wallpaper must not compete with the photos in the conversation
- **The asset is preloaded from the chat screen's server render** (`react-dom`'s `preload`, `as: "image"`, `fetchPriority: "high"`), not requested by the `<img>` on mount. It covers the whole screen behind the first bubble the reader sees, so a request that waits for hydration paints the flat `chat-canvas` first and swaps the photo in underneath a conversation already being read. It asks for `variant=original`: § 9.'s 720px thumbnail is visibly soft at full-bleed
- **Only the wallpaper is preloaded.** The profile cover (§ 12.1.) is behind a tap that may never happen, and `/api/media/{id}`'s 302 is cached for `MEDIA_CACHE_MAX_AGE` anyway — a preload starts a request early within one page load, it does not keep anything warm across sessions

### 12.3. Profile Screen ✅

Tapping an avatar opens a full-screen profile, KakaoTalk-style: the § 12.1. cover, the avatar, the name, and one action.

- **A `ShellOverlay`, not a route.** It has to cover the tab bar, which a screen under `(main)` cannot — and `absolute`, never `fixed` (`AGENTS.md § 4.4.`)
- **`ProfileViewerProvider` lives in the shell**, for `ChatStreamProvider`'s reason and one of its own: an avatar is rendered by `widgets/chat-room`, by the Settings cover and by the calendar day sheet, and a widget may not import a sibling widget (§ 2.) — so an overlay mounted beside any one of them would need a copy per screen, with two able to be open at once
- **`Avatar` does not reach the provider and must not.** It is `shared/ui`, below every layer the provider reads from, so the tap is wired by whoever renders the avatar — and the calendar day sheet deliberately wires none (§ 12.)
- **The person is resolved live against the participant set**, so a rename or a new cover reaches a profile that is already open (§ 8.7.). A `userId` the set does not hold closes the screen rather than drawing an empty one
- **The base is `scrim` and the text is `on-primary` whether or not a cover is set.** A colour that followed the photo would have to be sampled from it. The cover sits under a **two-stop** gradient — the top darkens the strip the close control is in, the bottom darkens the name, and the middle is left alone rather than dimming what the user came to look at
- **`Escape` is guarded on nothing being open above it.** The avatar's own § 7.10. viewer composes no `Dialog`, so it marks itself with `data-media-viewer` and this screen tests for that alongside `OPEN_DIALOG_SELECTOR`
- **`role="dialog"` and `aria-modal` are written by hand**, because nothing here composes a Radix primitive. The opaque fill hides the screen underneath from the eye and from the pointer, and without these it was still announced as live content with no boundary
- Own profile → **프로필 편집**, opening the one § 12. editor. The other participant's → **대화하기**

- [ ] A focus trap. This screen and the § 7.10. viewer are the app's two hand-rolled overlays and neither has one, so `Tab` walks into the composer behind them. It wants **one** owner shared by both rather than a second copy of the same logic

**Other rows**

- Entry point to the emoticon management screen (§ 13.5.) — authoring, pack order, and per-pack hiding
- **알림** — the push toggle (§ 16.1.), **per device** rather than per account, so it reflects this browser's subscription rather than a stored preference. Three inert states carry their own copy: permission denied (only the browser's site settings can undo it), unsupported (iOS Safari tab — install to the home screen first), and in flight
- **입력 중 표시** — the § 8.12. switch, on by default. **Per account**, unlike the row above it: it governs what this user broadcasts, which is not a property of whichever browser they happen to be typing in. The toggle moves optimistically and is put back on a failed write, since a switch reading 꺼짐 over a preference the server never took would sit in front of a ping that is still going out
- **No camera-permission toggle.** Taking a photo goes through `<input type="file" capture>`, which hands the shot to iOS's own camera app — the web page never touches the camera, so no site permission is created

Remaining:

- [ ] An upload that lands and is then followed by a failed `PATCH` leaves one registered object nothing points at — and § 12.1.'s copy has the same window. It is unreachable and costs bucket space alone, which is the trade § 9. already takes on a re-PUT; a discard endpoint like § 13.3.'s is what would close it
- [ ] List of logged-in devices, with per-session revocation
- [x] Log out
- [ ] The theme setting stays **hidden until the dark theme ships**
- [ ] App info / version

---

## 13. Emoticons

**Emoticons are authored inside the app.** There is no asset drop, no `scripts/seed-emoticons.ts`, and nothing to supply by hand — a user creates a pack from the Settings tab, adds items to it, and both users can send them. This reverses the earlier "supplied manually, registered by an admin script" premise, which assumed § 9. did not exist yet.

### 13.1. Ownership and Scope ✅

- **A pack belongs to the conversation, not to its creator.** Either user may create, rename, add to, and delete any pack; `emoticon_packs.created_by` is a record, never a permission check. An ownership tier here would be the only one in the app
- **Order and visibility are per-user and pack-level**, carried by `user_emoticon_prefs` (`enabled`, `sort_order`, keyed on `(user_id, pack_id)`)
- **Item order is not per-user.** `emoticon_items.sort_order` is **shared** — a per-user item table would make the same pack look different to each user with no surface saying so. **No screen reorders items** (§ 13.4.); only packs are reorderable (§ 13.5.)
- **`PUT /api/emoticons/packs/{id}/items` takes the whole ordered list** and renumbers it in one statement, because `sort_order` is positional and a row per UPDATE would leave the pack half-renumbered if the connection dropped. **The route has no caller since the item drag was removed** — it is kept because the ordering it writes is still the one every picker reads. The list must be exactly the pack's current items; a stale one is answered `409`. The renumbering `CASE` carries an `ELSE` of the row's own `sort_order`, because the completeness check is a separate statement and a row inserted between the two would otherwise renumber to NULL. Like § 13.5., it raises no `user_changed`
- A user with no `user_emoticon_prefs` row for a pack sees it **enabled**, ordered after every pack they have expressed an opinion about. The row is written lazily on the first reorder or hide, so creating a pack does not fan out a row per user

### 13.2. Item Composition ✅

One item is **one required image plus one optional sound**, two independent objects in R2.

| Slot  | Column      | Required | Notes                                                                                      |
| ----- | ----------- | -------- | ------------------------------------------------------------------------------------------ |
| Image | `r2_key`    | yes      | PNG, WebP, GIF or APNG. Everything renders this one object — an animated file simply plays |
| Audio | `audio_key` | no       | Played on tap only (§ 13.6.). An item may carry audio whether or not its image animates    |

- **There is no separate animated slot.** A still and an animation were two columns, two uploads and a render-time swap that bought nothing an animated file does not already do; migration `0013` promotes the animated object into `r2_key`. Do not reintroduce a `hasAnimation` branch
- `emoticon_items.width` / `height` are **read from the decoded image in the browser** and stored, exactly as § 9. does for chat media — `features/upload-media` is reused, not reimplemented. NOT NULL, because the chat row reserves the box before the asset loads (§ 8.3.). An animated file is measured from its decoded first frame
- **`updated_at` is exposed as `Emoticon.version` and rides on every asset URL.** Editing an item (§ 13.4.) swaps the object behind an unchanged item id, and the asset route answers a cached redirect — without the version the browser keeps serving the image the edit replaced. A screen holding only a pack summary carries the thumbnail item's version on the summary itself (`EmoticonPackSummary.thumbnailVersion`): an unversioned URL is not merely stale, it names an object the edit's cleanup will remove
- **A pack's thumbnail is one of its own items**, not a separate upload: `emoticon_packs.thumbnail_item_id`, nullable FK, **`ON DELETE SET NULL`, never cascade** — deleting the item a pack uses as its tab icon must not delete the pack. Null means the picker tab falls back to the pack's first item. The FK is **circular**, so it is added as a separate `ALTER TABLE` after both tables exist

### 13.3. Asset Storage ✅

Emoticon objects ride § 9.'s presigned-PUT pipeline — client → R2 directly, key built server-side — but they are **not `media` rows**, and `emoticon_items` stores R2 keys directly. Three reasons, the first load-bearing:

1. `media` is the gallery's single source (§ 10.). An emoticon registered there would appear in the gallery, and filtering it back out would mean the gallery's one source has an exception in it
2. `registerMedia` requires a `_thumb` sibling of `THUMBNAIL_MIME` (JPEG). An emoticon is transparent art rendered without a bubble (`DESIGN.md § 6.5.`), so a JPEG derivative would show an opaque box
3. `media.width` / `height` are NOT NULL and an audio object has neither

- What is **not** duplicated is § 14.'s enforcement: registration `HeadObject`s every key it is about to write and refuses anything outside the allow-list, by the same shared helper. R2 enforces neither the signed `Content-Type` nor any size (§ 9.)
- Key scope is `emoticon/{userId}/{uuid}`. The uploader's id stays in the key even though the pack is shared, because the key is the ownership proof at registration
- **Read authorization is a plain session check**, not `canReadMedia`: packs are conversation-wide. This is the one place a bare session is sufficient, and it is sufficient _because_ the pack is shared
- **The asset redirect is cached for days, not minutes, and that is the difference from § 9.** The URL carries `v` (§ 13.2.), so it addresses one immutable version of one item — an edit produces a different URL rather than different bytes behind the same one. The presigned GET is signed for `EMOTICON_URL_EXPIRY` (7 days, SigV4's ceiling) and the 302 is cached for `EMOTICON_CACHE_MAX_AGE` (6 days), still under the signature as § 9. requires. The old 5-minute pair meant a **freshly uploaded emoticon fetched over the network on every mount** — R2 answers no `Cache-Control` of its own, so the browser fell back to a heuristic lifetime of a tenth of the object's age
- **The bytes get their `Cache-Control` from the presigned GET, not from the object** (`EMOTICON_ASSET_CACHE_CONTROL`, a year, `immutable`, signed in as `response-cache-control`). Storing it on the object instead is what **broke every emoticon upload**: `Cache-Control` is not a CORS-safelisted request header, so the PUT carrying it needed the bucket's `AllowedHeaders` to name it (§ 9.) and failed preflight. It is **not** signed on the PUT either way — `cache-control` is in SigV4's always-unsignable set
- **`DELETE /api/emoticons/upload-url` takes back objects that landed for a submit that never produced an item** (§ 13.4.). It deletes only keys under the caller's own `emoticon/{userId}/` prefix, and only keys **no `emoticon_items` row references**, so a failed retry cannot delete the assets of an item an earlier submit registered

### 13.4. Authoring

**Landed** in full.

- **Create a pack from a title alone.** No thumbnail, no items required — an empty pack is a valid intermediate state, because the thumbnail can only be chosen from items that do not exist yet
- **Add an item from one image**, still or animated (§ 13.2.); the sound is optional and added in the same form. An item carries **no title**: nothing renders one, so the field only asked for a string that was never read back
- The image is picked through `features/upload-media`'s `MediaPickerSheet` (촬영 / 고르기) and may then be cropped and filtered in its `MediaEditor` — both reused, not reimplemented. A **free-form crop** (`자유`) is the default alongside the fixed ratios
- **A cropped emoticon is re-encoded as PNG, not JPEG.** `applyEdit` outputs JPEG for chat, which flattens alpha onto an opaque background — invisible in a bubble, glaring on the bubble-less emoticon of `DESIGN.md § 6.5.` The output type is a parameter; chat keeps JPEG
- **A file that may animate never enters the editor.** A canvas crop decodes one frame and re-encodes a still. `image/webp`, `image/gif` and APNG are uploaded byte for byte and the 편집 control is not offered for them; everything else is re-encoded to PNG at `EMOTICON_MAX_EDGE`
- **An APNG is detected by sniffing, not by its type.** A `File`'s type comes from the OS extension map, which answers `image/png` for every `.png` — no picker ever produces `image/apng`, so a MIME test alone flattens every APNG on the still path. A picked PNG is scanned for the `acTL` chunk (which the format requires before the first `IDAT`). The stored object stays `image/png`, since that is what the presigned PUT was signed with and what § 14. therefore checks
- The picker is restricted to images — `MediaPickerSheet` takes its `accept` from the caller
- Everything uploads on **final submit, not on pick**, so abandoning the form leaves nothing in the bucket. A submit that fails after some slots have landed gives those objects back through § 13.3.'s discard endpoint; the slots are awaited with **`allSettled`, not `all`**, precisely so every key that reached R2 is known to the failure path
- **The editor opens over the authoring sheet, not under it.** `MediaEditor` portals into the app shell (`ShellOverlay`) while the sheet portals into `body`, so no z-index inside the shell can lift it — the sheet closes for as long as the editor is up
- **Set a pack's thumbnail by choosing one of its items**, from the pack's own detail screen
- **Items are not reorderable.** Long-press-and-drag was implemented and removed: with no room for a grip handle in a 4-column square the cell had to carry the drag listeners itself, so the gesture sat on top of the tap that opens the item's actions. The grid renders in the server's `sort_order`
- **Edit an item after it is uploaded**, from the same sheet that authored it: replace the image, add a sound, remove a sound. `PATCH /api/emoticons/items/{id}` takes only the slots that changed — an absent `audioKey` keeps the sound, an explicit `null` removes it — and a replaced image must arrive with its new measurements, since § 8.3. reserves the bubble's box from them. The objects the edit detaches are deleted from R2 **immediately**: a deferred delete cannot survive § 13.3.'s multi-day cache. `deleteObjectsAfterCacheWindow` still exists and is still right for § 12.'s replaced avatars, whose redirect stays on § 9.'s five-minute window. What replaces it is on the read side — `PreloadImage` retries a failed load once against a cache-busted URL
- **The sound row auditions what the submit would save**, through the § 13.6. shared player: a newly picked file off its object URL, a kept one off its R2 asset URL. Authoring and editing both get it, since a sound that has been on an item for weeks is the one nobody remembers. Closing the sheet **stops the player before it revokes** the draft's object URLs, or an audition still running is left sourcing a dead blob
- **An item already sent in chat may still be edited**, unlike deleting one. The message references the _item_, not the object, so no foreign key is in the way, and the corrected image showing up in history is the point. The `updated_at` bump is what makes it visible past the cached asset redirect
- **Adding a pile of images at once**, one item per image. The pack screen's `+` opens a sheet offering 하나씩 추가 (the authoring sheet above) and 여러 장 한 번에 추가, which opens the picker with `multiple`. Several files go straight to registration with neither editor nor sound; a single file picked there still opens the authoring sheet
  - Files upload through a **bounded pool** (`mapPooled`), `UPLOAD_CONCURRENCY` wide **and** under a `MAX_UPLOAD_INFLIGHT_BYTES` ceiling. **Both halves are load-bearing and this is where that argument lives**, since § 9. and § 10. share the pool: a bare concurrency count cannot tell twenty 8MB emoticons from nine 500MB videos, and firing the latter four abreast is the timeout the original one-at-a-time loop existed to avoid. The byte budget always admits **one** task even when it alone exceeds the budget, or an upload larger than the ceiling would wait forever
  - **Registration is not pooled** — `POST` runs strictly in pick order behind the uploads, because `emoticon_items.sort_order` is assigned from `max(sort_order) + 1` at insert and racing the POSTs would shuffle the pack against the order the user picked in
  - The progress line counts what is **left** (`n개를 더 올리는 중이에요`), decremented per settled file, because it sits beside a grid that is already filling in and a fixed total would contradict the rows next to it
- **The `+` is disabled for as long as a pile is landing**, and it is the only route into the bulk path. Two batches would each run their own in-order registration chain and interleave two picks in one `sort_order` sequence, and `setAddingCount(files.length)` is an absolute write the overlap would corrupt. § 10.'s gallery deliberately does the opposite — its grid is ordered by capture date, so an interleave there is invisible
- **A failed bulk add names the files it dropped**, in a `Modal` (`추가하지 못한 이모티콘`) rather than a count-only toast. A pile fails per file and for different reasons — `지원하지 않는 형식이에요`, `8MB를 넘어요`, `파일을 읽지 못했어요`, `업로드하지 못했어요`, `등록하지 못했어요` — and a bare count leaves the user re-picking twenty images to find the three that did not land. The list scrolls at a fixed height. **The read and the upload need separate `try` blocks** to be told apart: under one block the uploaded key is only ever assigned by the call that would have thrown, so a timed-out PUT reports the user's perfectly good file as `파일을 읽지 못했어요`

### 13.5. Management (Settings) ✅

- A settings row (§ 12.) opens the emoticon management screen: **one flat list of packs**, matching KakaoTalk's 이모티콘 관리
- **A pack is `이모티콘 그룹` in the UI and an item is `이모티콘`.** Both were called `이모티콘`, which made "이모티콘에 이모티콘을 추가한다" the only way to describe authoring. Screen titles, the create sheet, the picker's empty state and the pack's delete button all follow this split; `pack` / `item` stay as they are in code
- The screen creates, **renames** and deletes packs; the pack's own screen creates and deletes items
- **Rename and delete hang off a gear icon on the row**, opening an `ActionSheet` — delete used to sit in the pack screen's header one thumb-width from 이모티콘 추가. The row also carries a chevron, since nothing else said the name was a link
- **Long-press then drag to reorder**, vertical axis only, writing `user_emoticon_prefs.sort_order`
- **Hide** per pack, writing `user_emoticon_prefs.enabled` — hidden from that user's picker only, never deleted, the other user unaffected. Hiding **writes the whole list's current order first**: `sort_order` is positional and a user who has never reordered has no rows at all, so writing the hidden pack's row alone would sort it against every other pack's fallback and silently reshuffle the list
- The management screen **owns the order**; the list component holds none of its own. Two copies meant a persisted drag could be rolled back by the next rename
- Reordering and hiding are **per-user by definition**, so neither broadcasts over `user_changed` — that channel carries `users` changes, and this writes a different table
- Drag-and-drop uses **`@dnd-kit`** (`core` + `sortable` + `modifiers`). Its `TouchSensor` `activationConstraint` (`delay` / `tolerance`) is what makes long-press-to-drag the activation gesture rather than a plain drag, which on a scrolling list would fight the scroller

### 13.6. Picker and Bubble

**Landed** apart from image preloading.

**Picking and staging**

- The composer's emoticon toggle opens a panel whose bottom tabs are the **enabled packs in the user's order**, each showing its `thumbnail_item_id` item
- Selecting an emoticon **stages it as a preview** above the composer, KakaoTalk-style, rather than sending on the tap. The preview autoplays an animated item with its sound, replays both on tap, and survives the panel closing
- **Tapping the same item twice sends it outright**, skipping the preview. The first tap of the pair still stages and still sounds. It is counted off `click` and an `A_SECOND / 3` window rather than `dblclick`, which never arrives on touch: `HapticTap` takes the tap on its own overlay and replays it as a scripted `control.click()`, which starts no double-click sequence
- **The staged emoticon and staged attachments are mutually exclusive.** § 6. gives each bubble one payload, so a composer holding both would promise a send that has no row to land in
- **Emoticon and text are two messages, in that order**, when sent together. Nothing is added to the schema — `useSendMessage` delivers on one promise chain, so `messages.id` is assigned in queue order. Allowing `text` on an `emoticon` row was rejected: it would relax the § 6. CHECK for a combination `media` rows still could not express
- A **최근 사용** section, ahead of the first pack. It records at the **send, not the pick** — 최근 "사용" is what was actually sent. Recording at the pick also broke the double tap: `remember` moves the id to the front, the list re-sorts between the two taps, and the cell the second tap was aimed at has already been replaced by its neighbour
- **`POST /api/messages` checks the item exists** before inserting, like `mediaIds`. `messages.emoticon_item_id` is a foreign key, and a picker whose list predates the other participant deleting an item would otherwise send its way into a `500` instead of a `400`
- **The panel reopens on the tab it was last left on**, per device, via `synced-storage`'s `useStorageState`; it falls back to 최근 사용 when the remembered pack has since been deleted or hidden. The 최근 사용 list uses the same hook

**Panel geometry and animation**

- **The panel is half the shell tall**, measured against `--viewport-height` rather than `vh` (`DESIGN.md § 3.4.`). A fixed `256px` was one and a half rows of a 4-column grid
- **It opens and closes over 200ms, animating the `height` of the clipping strip** rather than mounting. The history follows because `--chat-bottom-gap` is measured from the composer's box every frame — one animation drives both, with no second scroll animation to keep in step. The strip is `justify-end`, so the panel rises from behind the composer. It stays mounted after its first open and is `inert` while closed, since a zero-height clip still holds tab stops
- **Not a `0fr`→`1fr` grid track.** Mid-transition Chrome sizes such a track's container taller than the track it resolved, and that difference is a gap that opens and shuts between the bottom-anchored panel and the composer. The height is `--emoticon-panel-height`, which the panel itself is drawn at, so the two cannot drift apart
- **The panel is promoted to its own layer** (`will-change: transform`) so the growing clip is a compositor crop; unpromoted, every frame repaints a grid of animated images against a moving clip rect
- **The staged preview is centered above the composer and floats over the history rather than pushing it** — positioned out of the composer's flow, so the strip `--chat-bottom-gap` reserves does not grow. Centered rather than aligned to the send side: against the right edge it read as a stray bubble already in the conversation. Glass with a shadow (§ 6.6.) precisely because it sits over them; the attachment tray keeps pushing, because a row of photos is not one floating object. It rides at the **top of the stack**, so staging from an open panel puts it above the panel. **That lift is clamped at the floating header** — below about `604px` of `--viewport-height` the unclamped position is off the top of the screen entirely and staging looks like nothing happened. **Only the card takes taps**, never the full-width row that centers it: floating over the history means the band on either side of a 96px card would otherwise be a strip of history that cannot be touched

**Scroll pinning around the panel** — two cases beyond the per-frame `--chat-bottom-gap` follow, both of them WebKit handing the scroll offset to the compositor:

- **The pin is repeated once the strip's `transitionend` fires**, whichever way the panel was closed — the one moment the strip's height is final and nothing else is moving. Filtered on `propertyName === "height"` and on the strip being the event's own target, since the panel's transitions bubble through it
- **The post-send follow is a pin, not an animation.** `behavior: "smooth"` there was the case `transitionend` could not answer for: WebKit runs a smooth scroll against the content size it started with, so one still in flight 200ms later goes on steering toward the offset the _open_ panel implied and lands the history back where the panel had pushed it — overwriting every pin made underneath, the `transitionend` one included. It bought nothing either. A send at the live edge only has to cover the row it just added, one a § 8.6.1. jump replaced the window for animates over history the sender never asked to see, and every other follow in the room — an arrival, a re-measure, the clearance loop — is already instant. The § 6.7. pill keeps its animation, which is a journey the user asked for

**Panel navigation**

- **Sending does not close the panel** — KakaoTalk leaves it up and sending several in a row is the ordinary case. The composer therefore skips its post-send `focus()` while the panel is open, because that focus would raise the keyboard the panel may never share the screen with. The staged preview still clears
- **Tapping the history closes the panel; scrolling it does not.** The toggle and the field still close it too. **This reverses an earlier decision in part** — the panel used to survive both. What overturned it is the plain report: with the panel filling half the shell, touching the conversation reads as leaving the panel, and having it stay up reads as stuck. What survives of the old decision is its actual objection, which was never about the tap: dismissing runs the whole collapse — strip, clearance and re-pin — underneath a finger, and a finger that was only reaching for the history must not pay that. **So the two gestures are told apart rather than traded off**
- **The press is armed on `pointerdown` and settled on `pointerup`.** A gesture that travelled past `GESTURE_SLOP`, or that moved the scroller by any amount at all, was a scroll and closes nothing; only a press that did neither is a tap. `pointercancel` disarms, since that is how a touch that becomes a scroll usually ends — the scroll test then covers the engines that send a `pointerup` anyway. A finger laid on a coasting scroller arrests it and moves the offset a few pixels, which is why the offset is compared exactly rather than within a tolerance: stopping a scroll is not a tap either
- **There is no `wheel` listener, and the `scroll` event cannot be the signal.** A wheel _is_ the scroll, so it dismisses nothing. And opening the panel scrolls the history itself — the strip's growth re-pins it every frame — so a `scroll` listener would close the panel on the frame it opened
- **The listeners are on the room, not on the scroller**, and mounted only while the panel is on screen. An empty room renders no scroller at all, and that is the room where the panel covers the most nothing — bound to the scroller the rule simply would not hold there. The composer's own subtree is excluded by hand, since the panel is inside it and every tap on a cell reaches the room too
- **Swiping the grid left or right moves to the next or previous tab**, over the same order the tabs show. The larger axis of the drag wins, so a mostly-vertical flick still scrolls the grid; the ends do not wrap; and the `click` the browser fires on whatever the drag started on is swallowed, or a swipe begun on a cell would also stage that emoticon. The incoming pack slides in from the side it came from — for a tab tap too, whose direction is the index it moved by
- **The tab strip scrolls the selected tab back into view**, by hand rather than with `scrollIntoView`, which walks _every_ scrollable ancestor: the clipping strip is `overflow: hidden`, and mid-collapse that counts as one, so a partially clipped panel would be scrolled inside its own clip and never come back. A small margin past the revealed tab leaves a sliver of its neighbour visible
- **The strip is also dragged by hand**, which needs `keepsScroll` on each tab's `HapticTarget` (`DESIGN.md § 7.15.1.`). The tabs tile the strip, so a finger reaching for it lands on an overlay and not on the scroller — and a native switch keeps a drag of its own before the scroller is ever consulted, which left the strip reachable only by tapping a tab or swiping the grid. Unlike the grid cells the tabs pass **no `overlayClassName`**: the axis an overlay must leave to the browser is the one its own scroller runs on, and here that is the horizontal one
- **The panel is never on screen with the keyboard.** Reaching for the field closes it (`onFieldFocus`), and the render is additionally gated on `useIsVirtualKeyboardOpen` — **derived rather than an effect**, because Android reopens the keyboard on an already-focused field and fires no `focus` for the picker to hear
- **The toggle puts the keyboard away itself.** That gate means a press made while the field is focused only sets a flag the panel may not act on, and iOS lowers the keyboard for a blur alone — a tap on a `<button>` is not one — so the press read as doing nothing. The composer blurs the field before it reports the toggle. The toggle is also inverted against **what is on screen** rather than the flag behind it: while the keyboard suppresses the panel the flag can already be `true`, and inverting that closes a panel the user is asking to open

**Bubble and sound**

- The bubble renders **the image alone** — no bubble, no border, no background, max 140×140 (`DESIGN.md § 6.5.`). The box is reserved from the stored `width`/`height` before the asset loads (§ 8.3.)
- **An animated item plays because the browser plays it.** With one image slot nothing observes visibility and nothing swaps sources — the virtualizer already unmounts the row when it leaves the window
- **A sound emoticon sounds at KakaoTalk's four moments, and at no other**: selecting it in the picker, sending it, receiving it live while the room is on screen, and tapping a bubble. Everything else — scrolling past a bubble, the reconnect replay, the catch-up fetch, a page load into existing history — is **silent**, because the sound announces the emoticon _arriving_, not being on screen
- **The live arrival is told apart on the wire**, not guessed from timestamps: § 8.4. emits a replay as `event: backfill`. Deduplication is the second guard — a message the window already holds is not an arrival however it was delivered
- **My own emoticon sounds at the send, not at the echo.** A sound arriving on the round trip lands a beat late and can land twice; playing it inside the send gesture is also the only version iOS permits
- **One shared `Audio` element plays every sound**, minted once in `shared/lib`. A per-bubble `<audio>` cannot be started by an arrival — iOS refuses to start audio outside a user gesture, and a freshly mounted element has never been in one — whereas a single element unlocked by the room's first gesture of any kind (`useSoundUnlock`) plays for the rest of the session. It also makes two emoticons in a row cut over rather than overlap
- **The shared player declares `navigator.audioSession.type = "transient"`** before it is minted. Left at `auto` an `<audio>` element resolves to the `playback` category, and `playback` is what put the app on the iPhone lock screen and Control Center as Now Playing — with transport controls for a two-second emoticon sound — and took the session away from whatever the user was listening to. `transient` is the category for a notification ping: no Now Playing entry, and other audio ducks and recovers instead of stopping. Set before `new Audio()`, since WebKit fixes the category from the element's first playback. Safari 16.4+ and implemented nowhere else, so it is read off a widened `Navigator` and skipped where it is absent
- **`navigator.audioSession.type` is a property of the _page_, not of an element.** So "the emoticon ping is `transient` and voice is `playback`" is not an arrangement that can be expressed — there is one category and everything the app plays shares it. § 9.3.'s voice messages are minutes rather than the two seconds this rule was written for, and `playback` (a lock-screen Now Playing entry and background playback) was weighed for them and **rejected**: the session being page-wide would put every emoticon ping on the lock screen — the exact regression this bullet removed — and `playback` stops the user's music where `transient` only ducks it. The price paid is that voice playback has no lock-screen transport and no guaranteed background playback
- **The resting category is written down in exactly one place**, `RESTING_TYPE` in `shared/lib/audio/session.ts`, and it is not exported. Anything that moves the session for the length of an operation — § 9.3.'s capture is the only one, to `play-and-record` — comes back through `declareRestingAudioSession()` and never by naming a category of its own, or revisiting this decision silently leaves one caller behind
- **Voice uses a second `Audio` element**, beside this one. Sharing it, `playSound` overwriting `src` would cut a voice message off mid-sentence when an emoticon arrived, and `stopSound`'s `removeAttribute("src")` would take the track away outright. The **session** is still shared, so the `transient` decision above governs both. That element needs no `useSoundUnlock` twin: playback only ever starts from a tap on the play control, which is already the gesture iOS wants to see
- A tap also **restarts the animation**. A GIF or animated WebP has no seek API and re-assigning the same `src` is ignored by the cache, so the `<img>` is keyed by a replay token and remounted

- [ ] Preload the enabled packs' images so the panel does not stutter on first open

---

## 14. Security and Index Blocking

**Landed:** `app/robots.ts` (`Disallow: /` for every agent), root layout `robots: { index: false, follow: false, nocache: true }`, `X-Robots-Tag: noindex, nofollow, noarchive` on every path, and `Strict-Transport-Security` / `X-Content-Type-Options` / `Referrer-Policy: no-referrer` / `X-Frame-Options: DENY`. **Do not generate a sitemap.** Proxy-matcher exclusions are listed in § 7.

- Upload MIME/extension allow-list and a size cap, enforced at registration against **both** objects of the § 9. pair. **§ 9.1. widens the type rule deliberately and only for a file attachment**: anything shaped like a mime is stored, and the compensating control is that such a row is served only as a `Content-Disposition: attachment` download, from R2's own origin, with the name sanitized into the header. The `_thumb` sibling is checked as strictly as the original (`image/jpeg`, `MAX_THUMBNAIL_SIZE`): it is what every chat cell, grid tile and video poster loads, so leaving it unchecked is the same hole by another name
- `POST /api/messages` verifies that every `mediaId` is a registered object **owned by the sender and uploaded under the `chat` scope**. `message_media.media_id` is a foreign key, so an unregistered id would surface as a 500 rather than a 400; nothing else stopped one user hanging the other's objects off their own bubble; and the scope half is what keeps an avatar out of a message (§ 12.)

Remaining:

- [ ] Every API route validates the session (401 when unauthenticated)
- [ ] Rate-limit the login callback endpoint
- [ ] Rate-limit `POST /api/media/copy` (§ 12.1.), or cap the unworn `background/` objects one user may hold. It is the cheapest expensive endpoint in the app: one authenticated POST runs two server-side R2 `CopyObject`s over a full-resolution original, and it needs no upload and no follow-up `PATCH` to do it. The rows it mints are invisible to § 10.'s gallery (`galleryAddedAt` null, no `message_media`) and unreachable through `canReadMedia` once nothing wears them, so nothing surfaces them for deletion — § 12.'s accepted one-object orphan window is behind a _failed upload_, and this reaches the same state deliberately and at volume. § 14.'s size caps do not apply, because a copy uploads no bytes to check
- [ ] Error responses must not leak internal details

---

## 15. Deployment

**Landed:** `maxDuration = 300` on the SSE route segment (§ 8.4.), and the **R2 bucket setup** — private with public access disabled, plus a CORS policy allowing `PUT` and `GET` from the app origin. Without `PUT` every § 9. upload fails preflight; without `GET` the § 10. share route cannot buffer an original; no code change can fix either. `AllowedHeaders` is `Content-Type` only, so no upload may send a second header without this policy changing first (§ 9.).

- [ ] Connect the Vercel project to the private GitHub repository
- [ ] Custom domain `jandh.jeheecheon.com` + DNS CNAME + automatic HTTPS
- [ ] Environment variables — `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ALLOWED_EMAILS`, `RELATIONSHIP_START_DATE` (ISO `YYYY-MM-DD`), `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `APP_URL`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
- [ ] Include `lint:steiger` in `pnpm build` so architecture violations fail the deploy
- [ ] Separate dev and production databases using Neon branches

### 15.1. Refreshing a client across a deploy

An installed iOS PWA is not reloaded when the user reopens it — the system restores the suspended process, so a phone last opened before a deploy keeps running the old bundle indefinitely. This is **not a caching problem**: `sw.js` registers no `fetch` handler and caches nothing (§ 16.1.), so there is no stale cache to invalidate, only a stale process to replace.

**Landed:**

- The server identifies its deployment with `BUILD_ID` — `VERCEL_DEPLOYMENT_ID`, falling back to `VERCEL_GIT_COMMIT_SHA`, then to `development`
- `/api/chat/stream` emits `event: build` once per connection, ahead of the replay, carrying no `id:`
- The client compares each `build` against the **first one it saw**, never against a value baked into the bundle: a browser bundle cannot read a non-`NEXT_PUBLIC_` variable, so the two sides would always disagree
- The stream already reconnects on every iOS resume (§ 8.4.), so the signal arrives exactly when a suspended client wakes. No poll, no second connection
- A detected deploy reloads immediately **unless** the screen holds unsent work — composer text, staged attachments, a staged emoticon, a send in flight, or a bulk emoticon add still landing. Those register through `useUnsentWork`, and the reload retries every `APP_REFRESH_RETRY_DELAY` and on every backgrounding until they clear
- **A bulk add counts even though nothing on screen would be lost.** The uploads are a plain promise chain, so routing away leaves them running — but a document reload kills them mid-pile, and unlike a draft there is no staged state to resume from. Because the batch outlives the screen, the hold is taken by `addEmoticonsFromFiles` itself through `holdUnsentWork` and released in a `finally`: `useUnsentWork` drops its probe at unmount, so a screen-scoped guard would expire at exactly the moment it was written to cover
- **A _failed_ send is not unsent work.** It stays in the pending list until the user retries or cancels, and never resolves on its own — counting it pins a user who sent a photo on a dead connection to a stale bundle indefinitely. Only `sending` holds the reload
- Settings carries a manual `강제 새로고침` row on **development builds only**, since `BUILD_ID` is constant locally

- [ ] Enable Vercel **Skew Protection** — it keeps a superseded deployment's chunks reachable, so a client that has not refreshed yet fails softly instead of 404-ing on a missing chunk

---

## 16. Later (not implemented now)

- [ ] Dark theme — fill in the `.dark` block in `theme.css`, remove `forcedTheme`, reveal the Settings toggle
- [ ] Offline caching (the caching role of a service worker — separate from push)
- [ ] Data backup / export

### 16.1. Push Notifications

**Landed** apart from the device list. This reverses the "no service worker" decision in § 7.

- **Every push produces a banner. No exceptions.** `userVisibleOnly` is a promise the platform audits: WebKit revokes the subscription after **three** pushes whose worker showed nothing, and Chrome substitutes its own "site updated in the background" banner before doing the same. The symptom is not an error anywhere — it is the Settings toggle found empty on the next launch, push dead until the user re-subscribes, and a fresh `push_subscriptions` row each time they do. `sw.js` therefore **MUST** call `showNotification` on every `push` event, and **MUST NOT** test window visibility to decide whether to
- **One alerting channel, not two.** The obvious way to keep the banner from duplicating an on-screen message is to give the app its own in-app notice and let the worker stand down while a window is visible. That is the shape that lost the subscription, and **no variant of it is safe** — closing the banner from inside the push event reads to the platform as never having shown one. So the in-app channel is gone instead: no toast, no chime, no `shared/sound` alert. SSE (§ 8.4.) delivers the message and moves the badge; alerting is the OS notification's job alone. **A message that arrives while the recipient is looking at the conversation still raises a banner** — that is the cost of keeping push alive
- A consequence worth stating: with push off, unsupported, or blocked, an open app **alerts nothing at all**. The message still arrives and the badge still moves. The Settings toggle is the only alerting switch in the app
- **Sent at INSERT time, from the request that inserted.** `POST /api/messages` dispatches inside `after()`, so the fan-out never sits between the sender and their 201. This is why push costs Neon's autosuspend **nothing** — the compute is already awake. Nothing polls, nothing is scheduled, no process is resident
- **Only event-driven notifications are in scope.** "New message arrived" is the **only** trigger. Per-event reminders, a morning digest and minute-granularity cron are **excluded** — the objection is operational, not cost: polling keeps the Neon compute awake 24/7, defeating exactly what § 8.4.'s background close exists to allow. It would also grow deployment targets from one to two plus a shared secret, fail silently if the cron stopped, and need its own duplicate-send state. Calendar awareness rides the § 11.5. system messages instead
- **iOS.** Web Push works from 16.4 but **only for a home-screen PWA**, never a Safari tab. No UA sniffing is needed — iOS exposes `PushManager` only in the installed case. Deleting the app from the home screen destroys the subscription without telling the server, which is why `PushSync` re-saves on every launch
- `push_subscriptions` is keyed on the **installation**: `endpoint` is unique table-wide and the upsert moves `user_id`, so two accounts sharing one browser cannot leave the row pushing to the previous account. `ON DELETE cascade` from `users`, plus a `user_id` index for the fan-out
- Env: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. The public key is `NEXT_PUBLIC_` because the browser needs it to subscribe; `ensureEnv` cannot reach it in the client bundle, so a missing key surfaces as the disabled Settings toggle rather than a throw (`AGENTS.md § 6.2.`)
- A `404` or `410` from the push service is **final** — delete the row rather than retrying. `sendPush` never throws; a dead device must not fail the send that triggered it
- The permission prompt MUST fire inside a user gesture, so `subscribeToPush` awaits nothing before `Notification.requestPermission()`
- The banner carries the sender's name **resolved at send time**. This does not violate § 8.7.: a notification is a point-in-time artifact and the worker holds no session to re-resolve one
- One conversation (§ 6.), so every banner collapses onto one `tag` with `renotify`. The tag lives in `sw.js` **alone** — a worker is served raw from `public/` and cannot import `@/shared/config`, so a mirrored constant would be a second source of truth nothing checks. This is why the page closes notifications **unfiltered** rather than by tag
- `navigator.setAppBadge` carries the recipient's unread count (§ 8.8.), set from both the worker and the shell (`shared/badge`). Absent outside installed PWAs, so every call is optional. The shell **must** rewrite it on resume rather than leaving it to a count change — the worker moves the badge while the page is frozen, and a resume into a count that is already `0` renders no effect
- A subscription the server failed to store reports the toggle as **off**
- **The launch sync and the toggle write the same status, and the later write is not the newer intent.** `serviceWorker.register()` can take seconds, so a toggle can grant permission, subscribe and store the row while the launch sync is still resolving against a permission that was `default` when it sampled it. The hook settles this **by request id** — only the newest claim may write — because the losing order is silent: a stored subscription with the switch showing off and no failure to report
- A refused or dismissed permission prompt **resolves** (`blocked` / `off`) instead of throwing, so turning the toggle on and landing anywhere but `on` raises the `알림을 켜지 못했어요` toast. The toast states only the failure; the recovery step (`브라우저 설정에서 이 사이트의 알림을 허용해 주세요`) belongs to the row description for `blocked` and MUST NOT be duplicated into the toast

- [ ] A device list in Settings (`user_agent` and `last_success_at` are stored for it and nothing reads them yet) — step 10 of § 17.

---

## 17. Implementation Order

1. ✅ Project setup + FSD scaffolding + design tokens + base components (§ 1.–§ 4.)
2. ✅ Auth + session (§ 5.) — highest-risk area, so it went first. **The real-device cookie check (§ 5.3.) is still open**
3. ✅ Database schema + migrations (§ 6.)
4. ✅ Layout + tab bar + PWA manifest (§ 7.)
5. **Chat tab (§ 8.) — in progress.** Text and media bubbles, paging, virtualization, optimistic send, SSE, read cursor, replies, the jump machinery, the typing indicator (§ 8.12.) and search (§ 8.6.) all landed. **Open: the `1` marker and unread divider (§ 8.8.)**
6. ✅ R2 media pipeline + sending photos and videos in chat (§ 9.)
7. ✅ Library tab (§ 10.), both segments — open: the jump-to-message link, now unblocked by § 8.6.1.
8. ✅ Emoticons (§ 13.) — open: the picker's image preloading
9. ✅ Calendar tab (§ 11.) — open: the "jump to today" control (§ 11.3.)
10. **Settings tab (§ 12.) — in progress.** Profile editor, tap-to-enlarge avatar, the 입력 중 표시 switch (§ 8.12.), 로그아웃, both backgrounds (§ 12.1., § 12.2.) and the profile screen (§ 12.3.) landed. **Open: the device list and app info**
11. Security hardening + deployment (§ 14., § 15.)

---

## 18. Undecided — Ask, Do Not Guess

Deliberately left open. When work reaches the feature, **confirm with the user**, then update this document.

**Still open**

| #   | Item                                                    | Needed by            | Notes                                                                                                                                                                              |
| --- | ------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3   | Emoticon picker dimensions — panel height, grid density | Emoticons (§ 13.6.)  | #2 decided the assets are user-authored, so the grid must hold **arbitrary** aspect ratios rather than a known set — a fixed square cell with the image `object-contain` inside it |
| 6   | Viewer **pinch-zoom** bounds                            | Viewer (`shared/ui`) | Must be tuned on a real device. The swipe half is settled — native scroll snapping, no threshold. DESIGN § 9.                                                                      |
| 7   | Dark palette hex values                                 | Dark theme (§ 16.)   | Hand-tune; never arithmetically invert. DESIGN § 5.4.                                                                                                                              |

**Decided — kept for the record, do not reopen without asking**

| #   | Question                                              | Decision                                                                                                                                                      |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A chat message when its image is deleted from gallery | **Neither hidden nor placeholdered.** The chat is the record and the gallery a view of it, so a delete is gallery-scoped (§ 10., § 6.). No `media.deleted_at` |
| 2   | How emoticon assets are sourced and packs composed    | **Authored in the app** (§ 13.). Aspect ratios are therefore arbitrary, which is what #3 must absorb                                                          |
| 4   | Calendar event color set                              | **A closed set of six** — `clay` / `honey` / `olive` / `teal` / `blue` / `plum` (DESIGN § 4.1.7.). Three are cool deliberately; `primary` is excluded         |
| 5   | Motion duration / easing token scale                  | **Five durations and three curves** (DESIGN § 4.7.). The 1.5s search flash and Vaul's own sheet timing sit outside the scale                                  |
| 8   | Whether to adopt push notifications                   | **Adopted**, new-message only (§ 16.1.). **Time-based notifications remain out of scope**                                                                     |
| 9   | Whether a `scope = 'mine'` event shows its title      | **The title is shown.** Hiding it would make `scope` a privacy control, which § 11.5. says it is not. The ring dot is the whole distinction                   |
| 10  | Maximum images per message                            | **Selection is unlimited; a send splits into consecutive bubbles of 9.** No `+N` overflow cell, no hidden attachment. Caps are per file (§ 9.)                |
