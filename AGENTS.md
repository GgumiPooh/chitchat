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

**Every route under `app/api/emoticons/` exists twice — here and in jandh-emoticons — and both copies MUST be changed in the same piece of work.** All seven: `packs`, `packs/{id}`, `packs/{id}/items`, `items/{id}`, `prefs`, `upload-url` and `items/{id}/asset`. For the first six the browser reaches whichever copy `NEXT_PUBLIC_EMOTICON_API_REMOTE` names, so a one-sided edit is not a change that half works — it works until a variable moves, then silently stops. `items/{id}/asset` is the exception to the _switch_ and not to this rule: each app always serves its own, so a one-sided edit there simply leaves the other app's screens rendering the old behaviour forever. Read `REQUIREMENTS.md § 13.7.1.` before touching any of them.

## 4.3. App shell width

All screen content, including the bottom tab bar, is constrained to the app shell max width and horizontally centered. Use `Container` from `@/shared/ui`; do not hardcode `max-w-*` values in screens.

## 4.4. Nothing else is `fixed`

The `(main)` shell is the one `fixed` element in the app, and it is sized to the visual viewport (`DESIGN.md § 3.4.`). The floating header and tab bar are positioned inside it — `sticky` for the header, an absolute `BottomOverlay` for the bars (`DESIGN.md § 3.5.`). Do not reintroduce a `fixed` bar: it would have to re-apply the shell width and would drift against the keyboard on WebKit. The document itself never scrolls; screens scroll inside `#app-scroll` (`APP_SCROLL_ID`) or inside their own container.

# 5. Styling

## 5.1. Semantic tokens only

Use only the semantic color tokens defined in `src/app/styles/theme.css` (`canvas`, `surface-soft`, `ink`, `body`, `meta`, `hairline`, `primary`, `bubble-mine`, …). Raw Tailwind palette utilities (`bg-white`, `text-gray-500`, `border-zinc-200`) are forbidden — `--color-*: initial` removes them from the build, and reintroducing them breaks the dark theme that is added later.

## 5.2. Dark theme readiness

The `.dark` block in `theme.css` is intentionally unpopulated. Never hardcode a light-mode value that would need a `dark:` override later; express it as a token instead.

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
