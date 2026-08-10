<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 0. Project Documentation

## 0.1. Read every document in `docs/`

Before starting any task, read **all** files in the `docs/` directory. They define the product requirements, architecture decisions, and design rules for this project, and they take precedence over assumptions. Re-read them when the task touches an area they cover.

## 0.2. Documentation is English, product copy is Korean

`docs/` and this file are written in English deliberately, for LLM legibility. The product itself ships **Korean-only UI**. Korean string literals that appear inside these documents (`오늘`, `새 메시지 3`, `지희님이 8월 10일 '영화 보기' 일정을 추가했어요`, …) are the exact user-facing copy — reproduce them verbatim in code and never translate them to English. New user-facing strings are authored in Korean.

## 0.3. Keep `docs/` current

When a decision changes or a requirement is completed, update the corresponding document in `docs/` in the same change. Requirement checkboxes in `docs/REQUIREMENTS.md` MUST be ticked as work lands.

## 0.4. Korean particles come from `es-hangul`

A particle that follows an interpolated value MUST be chosen with `josa` from `es-hangul` (`josa("3개", "을/를")`, or `josa.pick` for the particle alone). **Never compute 받침 by hand**, and never bake one form into a sentence two different words reach — `3장을` and `3개를` are the same sentence.

Hand-rolled syllable arithmetic works only while every value ends in a Hangul syllable, and it silently picks the wrong form the moment one does not: a file name (`계약서.hwp`, `IMG_2034`) is the case already in the app, and Korean reads a trailing Latin letter or digit by its pronunciation rather than treating it as vowel-final. `josa` carries those tables; a `%` and a `hasFinalConsonant` helper do not.

# 1. UI Component Conventions

## 1.1. Props type

Every UI component MUST declare a TypeScript `type` alias named `{ComponentName}Props` and use it as the component's parameter type. `{ComponentName}Props` MUST include `className?: string`.

## 1.2. Outer className

Apply the `className` field of `{ComponentName}Props` (§ 1.1.) to the component's outermost rendered element (the root wrapping `<div>` or equivalent tag). Do not forward it to any inner child.

## 1.3. Inner element className

To expose styling for a non-outermost child element, declare an additional optional prop on `{ComponentName}Props` (§ 1.1.) named `{elementName}ClassName: string` (e.g. `labelClassName`, `iconClassName`) and apply it to that specific child.

## 1.4. Children prop

When `{ComponentName}Props` (§ 1.1.) needs `children`, type it via `PropsWithChildren` from `react`; do not declare `children: ReactNode` manually. Import the symbol directly (`import { PropsWithChildren } from "react"`); the namespaced form `React.PropsWithChildren` is forbidden.

# 2. UI Component Sourcing

## 2.1. shadcn precedence

Before authoring a primitive UI component (button, input, dropdown-menu, dialog, popover, etc.) from scratch, check the shadcn/ui registry. If a matching component exists, install it via the shadcn CLI rather than writing a bespoke implementation.

## 2.2. Design conformance

An installed shadcn component is a scaffold, not a finished primitive. Rewrite every visual decision — colors, typography, radii, spacing, borders, elevation, light/dark variants — to satisfy `docs/DESIGN.md`. No registry default may remain in the committed component.

## 2.3. Convention conformance

Installed components are subject to § 1.1.–§ 1.3. Refactor the props type, outer `className` placement, and inner-element `className` props to match before first use.

## 2.4. Overlays are props-driven, not composed

Overlay components exported from `@/shared/ui` (`BottomSheet`, `Modal`, `ActionSheet`) MUST expose a flat props API — `isOpen`, `header`, `onClose`, `children` — and perform the primitive composition internally. Screen code MUST NOT assemble `<Dialog><DialogContent><DialogHeader>…` or `<Drawer><DrawerContent>…` directly. The underlying `Dialog` and `Drawer` primitives exist only to be composed inside `@/shared/ui`.

# 3. TypeScript Type Conventions

## 3.1. Nullish unions

Replace `T | null`, `T | undefined`, and `T | null | undefined` with `Nullable<T>`, `Optional<T>`, and `Maybe<T>` from `@/shared/lib`. Wrap the full non-nullish operand: `Nullable<A | B>`, not `A | Nullable<B>`.

# 4. Responsive Policy

## 4.1. Single mobile UI

This app ships exactly one layout: the mobile one. Do not branch layout or swap components on viewport width. Rendering a `BottomSheet` on narrow screens and a `Modal` on wide screens is forbidden — pick the one the interaction calls for and use it everywhere.

## 4.2. Pointer affordances are still required

Desktop users see the mobile UI but MUST get proper pointer behaviour: mouse `click` handlers (never touch-only handlers), plus `hover:`, `active:`, and `focus-visible:` states on every interactive element. Tailwind's `hover:` already resolves under `@media (hover: hover)`, so it is safe on touch devices. Use `useIsCoarsePointer` only for interaction details, never for layout.

**One exception, and it is a platform capability rather than a pointer or a viewport:** where an OS cannot perform an action at all, the control offering it may be withheld or merged, through `useIsIos` from `@/shared/lib` — never through `useIsCoarsePointer`, and never through a width. `REQUIREMENTS.md § 10.`'s 저장 is the only instance: a download cannot reach the iOS photo library, so iOS merges 저장 into the share sheet's row while Android and desktop keep both controls. Rendering a different control set is otherwise still forbidden, and this exception does not extend to layout, sizing, or component choice. `useIsIos` reads the user agent because no feature detects "will this download be findable"; do not add a second UA branch without a comparable argument in `docs/`.

## 4.2.1. `/emoticons/*` is another app

jandh-emoticons is served from this origin under `/emoticons`, through a rewrite in `next.config.ts` (`REQUIREMENTS.md § 13.7.`). It is same-origin but a **separate repository and a separate deployment**, so nothing in this app's route tree answers those paths.

Cross that boundary with a document navigation — `window.location`, or an `<a href>` — never `<Link>` or `router.push`. The client router would ask for an RSC payload that does not exist. Do not narrow the rewrite or the `proxy.ts` matcher exclusions without reading § 13.7. first; both are load-bearing in ways that fail as 404s on assets rather than as errors.

**`fetch` calls may skip the rewrite; nothing else may.** A `fetch` can leave the origin because it can be given credentials and a preflight, and a navigation cannot. Sharing `jeheecheon.com` makes the two same-**site**, which settles the cookie and nothing else — SOP compares scheme, host and port, so anything moved off the rewrite needs CORS in the other repository before it works at all.

Two things use that permission and there is no third. `EMOTICON_KEYWORDS_URL` (`REQUIREMENTS.md § 13.8.1.`) is absolute unconditionally. The emoticon API — packs, items, prefs, upload URLs — follows `NEXT_PUBLIC_EMOTICON_API_REMOTE` (`§ 13.7.1.`), which is **off by default**, is ignored unless `NEXT_PUBLIC_EMOTICONS_ORIGIN` is set too, and leaves those constants as the relative paths they have always been.

`request` adds `credentials: "include"` when the URL is absolute, and never otherwise. Do **not** make it unconditional: credentials mode applies to the whole fetch, so a same-origin request that 302s off-origin becomes a credentialed CORS request at the destination — and `/api/media/{id}` redirects into R2, which cannot answer `Access-Control-Allow-Credentials`. That takes 보관함's 공유 down, on a path with no emoticons in it.

`toEmoticonAssetUrl` is the one that must never follow the switch, and it is written out separately so it cannot: an `<img>` / `<audio>` / `new Image()` load is not a `fetch`, and jandh-emoticons answers that route without CORS on purpose.

**Every route under `app/api/emoticons/` exists twice — here and in jandh-emoticons — and both copies MUST be changed in the same piece of work.** All eight: `packs`, `packs/{id}`, `packs/{id}/items`, `items`, `items/{id}`, `prefs`, `upload-url` and `items/{id}/asset`. For the first seven the browser reaches whichever copy `NEXT_PUBLIC_EMOTICON_API_REMOTE` names, so a one-sided edit is not a change that half works — it works until a variable moves, then silently stops. `items/{id}/asset` is the exception to the _switch_ and not to this rule: each app always serves its own, so a one-sided edit there simply leaves the other app's screens rendering the old behaviour forever. Read `REQUIREMENTS.md § 13.7.1.` before touching any of them.

**`src/shared/config/emoticon.ts` is mirrored on the same terms, and it fails more quietly than a route does.** A route copy cannot answer without the constants it is written against, so `RELEVANCE`'s three numbers, `toKeywordRelevance`, `splitKeywordQuery`, `MAX_KEYWORD_QUERY_LENGTH`, `EMOTICON_SEARCH_CANDIDATE_LIMIT`, `EMOTICON_SEARCH_PAGE_SIZE` and `MAX_EMOTICON_ID_LOOKUP` are declared in both repositories, beside `normalizeKeywords` and `MIN_KEYWORD_LENGTH`. Move them together. A drifted route is at least a shape somebody can diff; `6/4/3` against `6/4/2` is two deployments that both answer and rank differently depending on where the switch happens to point.

## 4.3. App shell width

All screen content, including the bottom tab bar, is constrained to the app shell max width and horizontally centered. Use `Container` from `@/shared/ui`; do not hardcode `max-w-*` values in screens.

## 4.4. The document is the scroller, and `fixed` is rationed

**The document scrolls, and chat does not** (`DESIGN.md § 3.3.`, `§ 3.4.`). The `(main)` column is in flow at `min-h-dvh` and screens grow it, which is what lets iOS Safari collapse its bottom toolbar: Safari only does that for the root scroller, never for a nested one. Do not reintroduce `overflow: hidden` on `html`/`body`, and do not give the layout's `<main>` slot a scroller of its own — it is a plain flow container with no id, precisely so nothing can look it up and scroll it, and everything that reads a scroll position on those screens reads `window`.

**Chat is the exception, and the keyboard is the whole of the reason.** `ChatScreen` is a `fixed` box at `--viewport-top` of `--viewport-height` with its own `overflow-y-auto` inside it. A scrollable document is exactly what lets WebKit pan the page to reveal a focused field, and that pan is performed on the compositor and reported to script afterwards — so every `fixed` box has to chase `offsetTop` a frame or more late, which the composer shows as a wobble under the finger through a momentum scroll. A viewport-sized screen leaves the document nothing to pan. Chat pays Safari's toolbar for it, and does not get it back: do not move the room onto the document scroller to reclaim those 100px, and do not make anything inside the room `fixed` — the screen bounding it already _is_ the visible area, so `absolute` is both correct and stationary.

**Four elements are `fixed`, and all four earn it.** `AppHeader` and `BottomOverlay` hold the bars on screen and therefore re-apply the shell width through `Container` — unavoidable once the document moves under them. The header carries `--viewport-top` as a term (through `--header-lift`), because a field on a non-chat screen can still take focus and WebKit pans the visible viewport down inside the layout one to reveal it; `BottomOverlay` does not, and does not need to — it collapses to zero height for the whole time a keyboard is up (`DESIGN.md § 7.3.`). `ChatScreen` is the paragraph above. `ShellOverlay`'s layer is the fourth: `#app-shell` (`APP_SHELL_ID`) is an in-flow column that grows with the screen, so the `absolute inset-0` every full-screen overlay is written as would span every month 보관함 ever loaded rather than the screen. The layer re-establishes that box against the visual viewport, once, so no overlay has to go `fixed` on its own.

**A fifth one needs the same argument.** "It should stay on screen" is not enough; say what breaks without it, and prefer `sticky` inside the flow, or a `ShellOverlay` if the thing to escape is the column's height.

An overlay portalled through `ShellOverlay` inherits `pointer-events: none` from that layer, because a bar-shaped one (`REQUIREMENTS.md § 10.`'s selection bar) has to leave the grid behind it tappable. A child that covers the screen re-enables it on its own root.

**That layer also owns the z-index, and a child's cannot substitute for it.** `position: fixed` establishes a stacking context whatever its own z-index is, so every `z-` inside `ShellOverlay` is resolved against its siblings there and nowhere else. Left at `z-auto` the whole layer painted beneath the `z-30` bars, and a `z-50` on the overlay itself changed nothing — the media viewer and 절전 모드 both sat behind the header and the tab bar. It carries `z-40`: above the bars, below the `z-50` the `body`-level sheets are portalled at. Raise the layer if something has to go higher, never a child.

# 5. Styling

## 5.1. Semantic tokens only

Use only the semantic color tokens defined in `src/app/styles/theme.css` (`canvas`, `surface-soft`, `ink`, `body`, `meta`, `hairline`, `primary`, `bubble-mine`, …). Raw Tailwind palette utilities (`bg-white`, `text-gray-500`, `border-zinc-200`) are forbidden — `--color-*: initial` removes them from the build, and reintroducing them breaks the dark theme that is added later.

## 5.2. Dark theme readiness

The `.dark` block in `theme.css` rebinds the same token names against the dark canvas, and **a new token needs its entry there in the same change** — a colour stated once is a light value sitting on a dark floor. Never hardcode a light-mode value that would need a `dark:` override later; express it as a token instead.

A dark value is **re-derived against that canvas, never the light one reused** (`DESIGN.md § 5.4.`). One token departs from that and says so: `message-flash` is `primary`'s own channels at a fixed alpha, so its dark entry swaps the channels and keeps the alpha. **Do not express a theme-following token with `color-mix(… var(--color-primary) …)`** — Tailwind rewrites the `var()` into an `@supports` pair and inlines the resolved **light** value as the fallback, inside the `.dark` block too. Write the channels out per theme.

## 5.3. A colour taken from an image comes from its stored hash

**Never sample a stored photo by drawing it to a canvas and reading the pixels back.** Every drawn object carries `media.blurhash` (`REQUIREMENTS.md § 9.`), and a blurhash's DC term **is** the image's average colour — so the answer is string arithmetic on a value the screen is already holding, available before a single byte of the photo has arrived.

A canvas read costs three things the hash does not, and all three were shipped and then removed (`REQUIREMENTS.md § 12.2.`). `/api/media/{id}` answers a 302 into R2, so the pixels are cross-origin and `getImageData` throws unless the request was made in CORS mode — and a CORS request is cached separately from the plain one every `<img>` and `preload` makes, so the photo is downloaded **twice**; the redirect answers that check differently cold and warm, so the read fails on a refresh and works after a route change; and a bucket policy that does not name the origin (`REQUIREMENTS.md § 15.`) turns a missing colour into a **failed image load**, because the element itself errors. It also publishes nothing until the full-size photo has decoded, so whatever wears the colour visibly changes under the reader.

Decode the DC term by hand rather than calling the package's `decode` at 1×1 — that renders the top-left **corner**, where every basis function evaluates to `1` and the AC terms are summed into the answer.

Composite the result in CSS and not in script: `color-mix(in srgb, var(--color-token) N%, {average})` re-resolves when the theme moves (§ 5.2.), where numbers resolved at the moment of the read are baked against whichever theme was up then, with nothing to recompute on.

# 6. Server Code

## 6.1. server-only

Any module that touches the database, session secrets, or R2 credentials MUST `import "server-only"` at the top.

## 6.2. Required environment variables

Read a required environment variable with `ensureEnv("NAME")` from `@/shared/config`, never `process.env.NAME` directly. It treats a blank value as missing, so a half-filled `.env` fails at the first call instead of surfacing much later as an opaque error from a third party. Optional variables with a real default (`APP_URL`) stay as plain `process.env` reads with `??`.

## 6.3. Database access

Obtain the connection with `getDb()` from `@/shared/db` — it is the pooled client and it is lazy, so a missing `DATABASE_URL` cannot fail the build. `LISTEN` (`REQUIREMENTS.md § 8.4.`) and migrations need `DATABASE_URL_UNPOOLED` and MUST NOT use it.

**`NOTIFY` is the exception and belongs on the pooled client**, through `notifyChannel`. What a transaction-mode pooler breaks is session state, and `LISTEN` is exactly that — the connection is handed to another caller between transactions and the subscription silently goes with it. A notification owns no session: it is queued by the statement and delivered at `COMMIT`, which the pooler performs. § 6.'s triggers have always published this way, from inside ordinary pooled writes. Giving `NOTIFY` an unpooled connection of its own would open and tear down a connection per publish, which `REQUIREMENTS.md § 8.12.` does several times a minute per typist.

## 6.4. Session in Server Components

A Server Component that requires a signed-in user calls `requireUserOrRedirect()` from `@/shared/auth`. Never redirect an unauthenticated Server Component straight to `/login` — the proxy only checks that the cookie exists, so a cookie whose session no longer validates would bounce between the two forever (`REQUIREMENTS.md § 5.2.`).

A Route Handler instead branches on `getCurrentUser()` and returns its own 401. Do not `throw` a `Response` to signal it: the App Router has no Remix-style thrown-response convention, so it surfaces as a 500.

# 7. Comments

## 7.1. No comments that restate the code

Do not write a comment a reader could infer from the code itself. Naming and structure carry _what_ the code does; a comment that paraphrases the next line is noise that goes stale.

## 7.2. What a comment is for

Comment only what the code cannot express: the reason a non-obvious decision was made, a constraint imposed from outside (a spec section, a platform bug, a wire format), or a consequence that is invisible at the call site. Prefer citing the governing document (`DESIGN.md § 7.1.`, `REQUIREMENTS.md § 8.3.`) over restating its content.

## 7.3. Comment format

Every comment that survives § 7.1. MUST be tagged: `// {TYPE}: content`. `TYPE` is exactly one of:

| Type   | Use                                                                      |
| ------ | ------------------------------------------------------------------------ |
| `TODO` | Work deliberately left undone, and what unblocks it                      |
| `INFO` | The rationale or external constraint behind the code as written          |
| `WARN` | A trap — something that breaks if the code is changed in the obvious way |

This applies to explanatory comments; JSDoc blocks (`/** … */`) documenting an exported symbol's contract are not comments in this sense and take no tag.

## 7.4. One line per comment

A comment MUST occupy exactly one line. Never wrap it across lines, and never stack several lines into one block — it exceeds `printWidth` and that is fine, since Prettier does not reflow comments. If a comment cannot fit on one line, it is saying too much: cite the governing document section (§ 7.2.) instead of reproducing its argument.

# 8. Duration Literals

## 8.1. Shared constants precedence

Do not write bare numeric duration literals in application code. Use the duration constants exported from `@/shared/lib`, such as `A_SECOND`, `A_MINUTE`, `AN_HOUR`, and `A_DAY`.

## 8.2. Unit conversion

The constants in § 8.1. are millisecond values. When an API expects seconds, convert explicitly at the call site, e.g. `A_DAY / A_SECOND`. Do not pass a millisecond constant to a seconds-based API.
