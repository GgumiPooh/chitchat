---
version: alpha
name: jandh
---

# 1. J&H Design System.

Design specification for a private two-person messaging, calendar, and photo app delivered as an iOS PWA.

## 1.1. Purpose.

Define design tokens, primitive UI components, theming behaviour, and authoring rules for J&H. Feature-level compositions (message list, calendar grid, gallery grid, settings rows) live with their owning slice, not in this document — but the chat surface is specified here (§ 6.) because it carries the product's entire visual identity.

Reference UX: KakaoTalk (chat mechanics only — see § 2.2. for what is deliberately not taken).

## 1.2. PRD Scope.

Constraints from `REQUIREMENTS.md` that this system must satisfy.

| Requirement   | Spec                                                                                                                                                                                                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Users         | Exactly two, both known to each other. No onboarding, no discovery, no social proof, no empty-account states.                                                                                                                                                          |
| Language      | Korean only. No `:lang()` overrides — Korean metrics ARE the base scale (§ 4.2.). This document is English for LLM legibility, but **every Korean string in it (`오늘`, `새 메시지 3`, …) is literal UI copy to ship as-is** — never translate it into English in code |
| Layout        | One mobile layout at every viewport. No responsive branching (§ 3.1.).                                                                                                                                                                                                 |
| Pointer       | Touch-primary, but mouse `:hover` / `:active` / `:focus-visible` are mandatory (§ 3.2.).                                                                                                                                                                               |
| Themes        | Light only at v1. Dark ships later — every token MUST be authored so dark is a value swap (§ 5.).                                                                                                                                                                      |
| Chat fidelity | KakaoTalk-equivalent interaction and layout mechanics; original palette (§ 2.).                                                                                                                                                                                        |

## 1.3. Glossary.

| Term          | Definition                                                                                                       |
| ------------- | ---------------------------------------------------------------------------------------------------------------- |
| App shell     | The 576px-max, horizontally centered column that contains every screen and the tab bar (§ 3.3.)                  |
| Bubble        | A single chat message container. `mine` (right-aligned) or `theirs` (left-aligned)                               |
| Group         | Consecutive messages from one sender within the same minute, rendered with shared avatar/name and collapsed gaps |
| Notch corner  | The single reduced-radius corner that replaces a drawn speech tail (§ 6.2.)                                      |
| Pretendard    | Open-source Korean variable typeface; metric-compatible with Inter                                               |
| Hangul / jamo | Korean syllabic blocks / their component letters. Full-square glyphs — denser on the line than Latin             |
| Paper         | The warm off-white canvas family (§ 4.1.). Not `#ffffff`                                                         |

# 2. Design Lineage.

## 2.1. Adopted Patterns.

| Pattern                                                       | Source           | Reason                                                                                                                                                             |
| ------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Right-mine / left-theirs bubble alignment                     | KakaoTalk        | Both users' entire messaging intuition is built on it; deviating costs comprehension for zero gain                                                                 |
| Unread count rendered adjacent to the bubble, not inside it   | KakaoTalk        | The `1` is metadata about delivery, not message content                                                                                                            |
| Timestamp collapse — shown once per minute-group, on the last | KakaoTalk        | A timestamp per line turns the column into a log file                                                                                                              |
| Date divider as a centered pill                               | KakaoTalk        | Reads as a section break without a full-width rule                                                                                                                 |
| Bubble-less rendering for images and stickers                 | KakaoTalk        | A container around an image is redundant chrome                                                                                                                    |
| Warm off-white paper canvas, never pure white                 | Airbnb / Notion  | `#ffffff` under a photo-heavy grid reads clinical; warm paper reads personal — the single highest-leverage choice against a "generic template" feel                |
| Hairline-as-default-elevation, shadows reserved for overlays  | Notion           | Shadow on every card is the most common signal of unconsidered design                                                                                              |
| Single restrained accent, no second hue                       | Airbnb           | Discipline over decoration                                                                                                                                         |
| Notch-corner instead of a drawn speech tail                   | Project-original | A drawn tail requires an SVG or CSS triangle per bubble and breaks under grouping; a reduced corner radius carries the same directional read at zero cost (§ 6.2.) |

## 2.2. Rejected Patterns.

| Pattern                                          | Source      | Reason                                                                                                                                   |
| ------------------------------------------------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Kakao yellow `#fee500` + sky-blue `#b2c7da` chat | KakaoTalk   | Copying the brand palette outright makes the product read as a KakaoTalk clone, not as our app. We take the mechanics, not the identity. |
| Saturated pink / red-heart couple-app palette    | Couple apps | High-chroma pink is the defining marker of the low-effort couple-app genre. Warm neutrals + one muted accent read as considered.         |
| Gradients, glassmorphism, glow                   | —           | Aging trend markers; they date a personal app faster than anything else                                                                  |
| Decorative script or rounded display typefaces   | Couple apps | Hangul in rounded/handwritten faces loses legibility at chat sizes                                                                       |
| Emoji as UI iconography                          | —           | Inconsistent metrics and platform-dependent rendering; lucide only (§ 4.6.)                                                              |
| Full-bleed bottom sheet                          | —           | Inset floating card matches the reference implementation and reads lighter (§ 7.5.)                                                      |
| Responsive breakpoint branching                  | —           | Out of scope by PRD (§ 3.1.)                                                                                                             |

# 3. Layout.

## 3.1. Single Mobile Layout.

One layout at every viewport. Screens MUST NOT branch on width — no `pc:` / `md:` / `lg:` layout variants, no `ResponsiveDialog`-style component swapping. Desktop users see the mobile UI in the centered app shell.

Consequence: the Tailwind breakpoint scale is unused for layout. Breakpoint prefixes are permitted only for non-layout affordances that genuinely differ by input device, and § 3.2. covers those with pointer media queries instead.

## 3.2. Pointer Affordances.

Touch-first geometry, full pointer states.

| Rule                                                                                                                                                                                              | Reason                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Every interactive element defines `:hover`, `:active`, `:focus-visible`, and `:disabled` (§ 7.1.)                                                                                                 | Desktop with only a rest state reads as a broken web page. One exception: the composer field (§ 6.6.)                                                                                                                                                                                |
| Tailwind `hover:` is used directly — it already resolves under `@media (hover: hover)`                                                                                                            | No hover state sticks after a tap on iOS                                                                                                                                                                                                                                             |
| Minimum tap target 44×44 on every control                                                                                                                                                         | WCAG 2.5.5; this is a touch-primary product, so unlike a desktop-first system there is no 36px tier                                                                                                                                                                                  |
| Visual size may be smaller than the tap target — pad the hit area, do not inflate the glyph                                                                                                       | A 44px-wide icon glyph looks clumsy; a 20px glyph in a 44px target does not                                                                                                                                                                                                          |
| `:focus-visible`, never `:focus`                                                                                                                                                                  | No focus ring on mouse click                                                                                                                                                                                                                                                         |
| Long-press actions MUST have a pointer equivalent (right-click or a hover-revealed control)                                                                                                       | Long-press does not exist with a mouse                                                                                                                                                                                                                                               |
| A long-press target suppresses the browser's own hold gestures under `@media (pointer: coarse)` — `select-none` and `-webkit-touch-callout: none`, and `draggable={false}` on any image inside it | Otherwise the hold starts a selection drag or an image drag first, and the sheet opens behind a gesture the page has already lost. A fine pointer keeps all of them, since it opens the sheet from `contextmenu` instead                                                             |
| A hold that fires swallows the `click` its release ends in, and disarms whatever gesture shares the element with it                                                                               | The finger is still down when the sheet opens and still owns the gesture: the release would tap what it is sitting on — the photo behind the sheet, or the tile the hold just selected — and on a bubble the § 6.10. pull would go on tracking behind the sheet and reply on release |
| The OS hold is surrendered on exactly one surface: the § 7.10. viewer                                                                                                                             | Two menus over one photo is not a choice the user can read (`REQUIREMENTS.md § 8.11.`), so the app takes the hold wherever it has something of its own to offer and leaves the full-screen slide, which has nothing competing, to iOS                                                |
| The pointer equivalent may be the `contextmenu` half of the same gesture **or** a control elsewhere on the screen                                                                                 | The gallery's hold-to-select has a header button (§ 7.10.), so taking right-click there would cost the browser's image menu for nothing                                                                                                                                              |

## 3.3. App Shell.

| Property          | Value                                                                                                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Max width         | `576px` — token `--container-app`                                                                                                                                                                            |
| Bar heights       | `--tab-bar-height` and `--app-header-height`, both `56px`. Declared outside `@theme` because a screen may read them back through `calc()` rather than as a utility                                           |
| Narrow max width  | `448px` — token `--container-app-narrow`, `Container size="sm"`. Single-column entry screens (login) only                                                                                                    |
| Alignment         | Horizontally centered, full height                                                                                                                                                                           |
| Shell background  | `canvas` (or `chat-canvas` on the chat screen)                                                                                                                                                               |
| Outside the shell | `backdrop` — one step deeper than `canvas`, so the shell reads as a held device on desktop                                                                                                                   |
| Fixed children    | None. The shell itself is the one `fixed` element (§ 3.4.); the header and the bars float inside it (§ 3.5.). Portalled overlays are outside the shell and anchor themselves to the visual viewport (§ 3.4.) |
| Safe areas        | `env(safe-area-inset-bottom)` on the tab bar, `env(safe-area-inset-top)` on the header                                                                                                                       |
| Viewport height   | `--viewport-height` (§ 3.4.), falling back to `100dvh` before hydration. Never `100vh`                                                                                                                       |

576px, not a tablet 768px: at 768 a 72%-width bubble spans 550px, which forces long lines and breaks the chat rhythm; the four tab-bar items also drift apart to the point of reading as a desktop nav. Screens MUST obtain this width from `Container`, never by hardcoding `max-w-*`.

## 3.4. Visual Viewport.

The shell is sized to the **visual viewport**, not the layout viewport. `VisualViewportSync` mirrors `visualViewport.height` and `visualViewport.offsetTop` onto the root element as `--viewport-height` and `--viewport-top`, plus the leftover strip beneath the visual viewport as `--viewport-bottom`; the `(main)` layout is a single `fixed inset-0` box of that height. The header sits at its top, the composer and tab bar at its bottom, so all three stay pinned to what the user can actually see while the keyboard is up.

| Rule                | Value                                                                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shell               | `fixed`, `top: var(--viewport-top, 0px)`, `height: var(--viewport-height, 100dvh)` — the only element the keyboard moves                                                                    |
| Shell motion        | `height` eases over 200ms `ease-out`; `top` never eases                                                                                                                                     |
| Document scroll     | Forbidden. `html, body` are `h-full overflow-hidden overscroll-none`                                                                                                                        |
| Screen scroll       | Every screen scrolls inside the shell's `#app-scroll` container, or inside its own (chat's virtualizer, login's column)                                                                     |
| `interactiveWidget` | `resizes-content`, kept as a Chromium-side fallback only. WebKit ignores it, so nothing may depend on it                                                                                    |
| Synced offsets      | `height` and `offsetTop` only. Zooming is off (`maximumScale: 1`), so the left/right offsets never leave `0`                                                                                |
| Portalled overlays  | Sheets and modals live outside the shell, so they anchor themselves: `bottom: var(--viewport-bottom, 0px)` (§ 7.5.), `top: calc(var(--viewport-top) + var(--viewport-height) / 2)` (§ 7.4.) |

Why an overlay needs `--viewport-bottom`: it is portalled to `body`, and a `fixed` box resolves its offsets against the layout viewport, which the keyboard does not shrink on WebKit. `bottom: 0` therefore parks the sheet behind the keys the moment a field inside it takes focus — the shell moving is exactly what makes it look like the sheet was pushed out. `--viewport-bottom` is `documentElement.clientHeight - offsetTop - height`, the strip of layout viewport the visual viewport no longer covers. For the same reason vaul's own `repositionInputs` is off: it measures against `window.innerHeight` and stretches the sheet downwards instead of lifting it.

Why the height eases and `top` does not: WebKit reports `visualViewport.height` in a couple of coarse steps while the keyboard slides, so a raw height lands the composer in its new place in one jump — the keyboard glides, the input bar teleports. A 200ms ease turns that step into motion, and it matches the bars' collapse (§ 3.5.) so the two read as one. `top`, by contrast, is correcting a pan the user can already see; easing it would draw out the wrong position instead of hiding it, so it lands the same frame.

Why the document must not scroll: a document taller than the visual viewport is exactly what lets WebKit pan the page to reveal the focused field, and that pan carries the header off the top of the visual viewport. Sizing the shell to the visual viewport leaves nothing to pan.

Why not `interactive-widget=resizes-content` alone: it is Chromium 108+ and Firefox 132+ only. WebKit does not implement it, so on iOS — the platform this app is installed on — it is inert. It stays in the viewport metadata because it costs nothing and keeps Chromium correct even if the script never runs.

`env(safe-area-inset-bottom)` is **not** a keyboard inset. It reports the home indicator and does not change when the keyboard opens. The Chromium-only `env(keyboard-inset-height)` does, but it requires the VirtualKeyboard API and does not exist in WebKit, which is why the height comes from script.

## 3.5. Floating Bars.

The header and the tab bar do not sit in the column's flow — they float over it, and content passes underneath.

| Rule        | Value                                                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Tab bar     | A pill inset from the shell's bottom edge by `--bar-float-gap` (12) plus `env(safe-area-inset-bottom)`, and by `md` each side   |
| Header      | A transparent strip pinned to the top of the shell. It has no surface — only the controls inside it are visible (§ 7.12.)       |
| Surface     | The `glass` utility (`canvas/75`), 1px `hairline`, `shadow-floating`. Never spelled out at a call site                          |
| Clearance   | `BottomOverlay` measures the bars into `--bottom-inset`, which `RouteTransition` trails as a `shrink-0` spacer below the screen |
| Keyboard    | The overlay collapses its own height to `0` (§ 7.3.); no bar inside it branches on the keyboard itself                          |
| Hit testing | The overlay is `pointer-events-none`; each visible surface re-enables it, so content underneath stays tappable                  |

The clearance is measured rather than summed from `--tab-bar-height`: the bars come and go with the keyboard, and the install banner's copy wraps to two lines on a narrow viewport, so no constant is right. It is `0px` while nothing is up, so the spacer needs no branch.

The clearance is a spacer inside `RouteTransition` and **MUST NOT** be moved back to the scroller's `pb-(--bottom-inset)`. `RouteTransition` is a `min-h-0 flex-1` item — it has to be, or chat's inner message scroller grows to its content instead of filling the shell — so it is clamped to the scroller's height and a taller screen overflows _out_ of it. End padding is only laid out after in-flow content, so it fell inside the clamped box and the overflow ran straight past it: every long screen (이모티콘 관리, 캘린더, 갤러리) reported a `scrollHeight` short by the whole inset and stranded its last row under the bars. A sibling the overflow pushes down is what actually grows the scrollable area. It is `shrink-0` for the same reason — a default-shrinking item is squeezed back to nothing by the overflow.

A screen whose background is not `canvas` — chat's `chat-canvas` — MUST extend it under the bars with a negative bottom margin that cancels the spacer. A child's background stops at its own box, so without it the strip behind the bars falls back to the shell's `canvas` and shows as a band of the wrong colour through the translucent bar.

Clearance, not a hard stop: mid-scroll the content genuinely passes under the bars — that is the effect — and the spacer only guarantees that the _last_ row can still be scrolled clear of them.

### 3.5.1. Full-screen overlays.

A screen-owned overlay that must cover the bars — the media viewer (§ 7.10.), the photo editor — renders through `ShellOverlay` into `#app-shell`, the shell column itself. It stays `absolute inset-0`, so `AGENTS.md § 4.4.` still holds; what the portal changes is which box `inset-0` resolves against.

A larger `z-index` is not an alternative. The bars are siblings of the scroller, not of the screen inside it, so an overlay left in the screen's subtree cannot outrank them from there — and being inside the scroller it would also stop at the clearance padding, leaving the tab bar sitting on top of it.

The surface is a translucent `canvas`, not a solid fill. This is an imitation of the platform's floating material, deliberately a plain one: no specular edge, no dynamic tint, no refraction — and, since § 4.7.1., **no blur**. It is defined once as the `glass` utility in `globals.css` — every floating surface (both bars, the install banner, `icon-button-floating`) uses it, so they cannot drift apart.

The blur is gone because it cannot survive a view-transition capture (§ 4.7.1.), and every arrangement that kept it alive cost the bars something worse than a missing blur. Translucency carries the effect on its own: what makes a bar read as floating is that the content behind it keeps moving and showing through, not that it is smeared. `backdrop-filter` MUST NOT be reintroduced on any surface that can be captured.

# 4. Tokens.

Color tokens live in the `@theme` block of `src/app/styles/theme.css`. Each `--color-{token}` generates `bg-{token}`, `text-{token}`, `border-{token}`, `ring-{token}`. `--color-*: initial` is declared first, removing Tailwind's default palette from the build — raw utilities like `bg-white` do not exist and MUST NOT be reintroduced.

## 4.1. Light Palette.

The system is built on warm neutrals. Every neutral carries a yellow/red bias; there are no cool greys.

### 4.1.1. Surfaces.

| Token             | Hex     | Use                                                                             |
| ----------------- | ------- | ------------------------------------------------------------------------------- |
| `backdrop`        | #E4DED4 | Area outside the app shell (desktop only) — § 3.3.                              |
| `canvas`          | #FBF9F6 | Page floor for calendar / gallery / settings                                    |
| `chat-canvas`     | #EFEAE2 | Page floor for the chat screen only — one step deeper so bubbles read as raised |
| `surface-soft`    | #F4F0E9 | Default raised surface; resting fill for chip-style controls                    |
| `surface-strong`  | #EAE4DA | `:hover` escalation; terminal static fill (skeletons, disabled inputs)          |
| `surface-pressed` | #DFD8CB | `:active` escalation. Ladder ceiling                                            |

### 4.1.2. Lines and Text.

| Token             | Hex     | Use                                          |
| ----------------- | ------- | -------------------------------------------- |
| `hairline`        | #E6E0D6 | Default 1px border                           |
| `hairline-soft`   | #F0EBE3 | Long-scroll dividers, list separators        |
| `hairline-strong` | #CDC5B7 | Input outlines, drag handle                  |
| `ink`             | #1F1B17 | Headings, bubble text, primary text          |
| `body`            | #453E36 | Body copy                                    |
| `meta`            | #7B7266 | Timestamps, secondary labels, inactive tab   |
| `meta-soft`       | #A79D8E | Disabled text, lowest-emphasis labels        |
| `scrim`           | #2A231C | Overlay base; opacity at usage site (§ 4.5.) |

`ink` is `#1F1B17`, not `#1a1a1a`: Hangul stroke density makes a neutral near-black read one shade lighter than Latin, and a cool near-black clashes against warm paper.

### 4.1.3. Accent.

One accent. A muted terracotta rose — warm enough to belong to a personal app, desaturated enough not to read as a couple-app cliché (§ 2.2.).

| Token              | Hex     | Use                                                      |
| ------------------ | ------- | -------------------------------------------------------- |
| `primary`          | #B65C4E | Primary CTA, active tab, links, focus ring, unread count |
| `primary-hover`    | #A45144 | `:hover`                                                 |
| `primary-pressed`  | #8F453A | `:active`                                                |
| `primary-disabled` | #E8CFC9 | Disabled CTA                                             |
| `primary-tint`     | #F7E7E2 | Selected-day fill, highlight flash, low-emphasis accent  |
| `on-primary`       | #FFFFFF | Text/icon on `primary`                                   |

### 4.1.4. Chat.

The signature surface. Bubble fills are the only place two adjacent fills are both near-value; the hairline on `bubble-theirs` is what separates it from `chat-canvas`.

| Token                   | Hex     | Use                                                                               |
| ----------------------- | ------- | --------------------------------------------------------------------------------- |
| `bubble-mine`           | #F6DCD2 | My message fill — a tint of `primary`, not Kakao yellow                           |
| `bubble-mine-pressed`   | #EFCEC1 | `:active` / long-press feedback on my bubble                                      |
| `bubble-theirs`         | #FFFFFF | Their message fill — the one pure white in the system                             |
| `bubble-theirs-pressed` | #F4F1EC | `:active` / long-press feedback on their bubble                                   |
| `bubble-ink`            | #1F1B17 | Text inside any bubble. Both fills are light — never inverts                      |
| `chat-meta`             | #8D8375 | Timestamp and sender name on `chat-canvas`                                        |
| `chat-pill`             | #DED6C9 | Date divider pill fill                                                            |
| `chat-pill-pressed`     | #D2C9B9 | `:hover` / `:active` on a pill that is a link — the § 11.5. system notice alone   |
| `chat-pill-ink`         | #6B6153 | Date divider pill text                                                            |
| `unread`                | #B65C4E | The `1` marker. Same value as `primary`, separate token so it can diverge on dark |
| `search-hit`            | #F9E9C8 | Matched substring background in search results (§ 6.8.)                           |

`bubble-mine` is a tint of the accent rather than a second hue: it keeps the palette at one chromatic family, and it makes "my voice" and "the app's voice" the same colour, which is the point of a two-person app.

### 4.1.5. Semantic.

| Token                    | Hex     | Use                         |
| ------------------------ | ------- | --------------------------- |
| `semantic-success`       | #3F7D52 | Confirmations               |
| `semantic-warning`       | #B67A2E | Warnings                    |
| `semantic-error`         | #C0453C | Errors, destructive actions |
| `semantic-error-hover`   | #A93A32 | `:hover` on destructive     |
| `semantic-error-pressed` | #92312A | `:active` on destructive    |
| `on-semantic-error`      | #FFFFFF | Text on destructive fill    |

`semantic-error` sits close to `primary` in hue. This is intentional — a second, cooler red would fracture the palette. They are separated by chroma and by strict role confinement (§ 8.2.), never by placement side by side.

### 4.1.6. Surface Ladder.

Four tiers, closed. Each tier has one role.

| Tier              | Role                                                                          |
| ----------------- | ----------------------------------------------------------------------------- |
| `canvas`          | Page floor. Resting fill for components sitting directly on the page          |
| `surface-soft`    | Default raised surface. Resting fill for chip-style controls                  |
| `surface-strong`  | `:hover` escalation. Static terminal fill where no further escalation happens |
| `surface-pressed` | `:active` escalation. Ceiling                                                 |

| Rule                                                                      | Reason                                                        |
| ------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Interactive rest fills start at `canvas` or `surface-soft` — never higher | Starting at `surface-strong` leaves no headroom for `:hover`  |
| `surface-pressed` is `:active` only; never a resting fill                 | The ladder has to terminate                                   |
| No fifth tier                                                             | Each new tier recreates the same endpoint problem one step up |
| `chat-canvas` is not part of the ladder                                   | It is a page floor for one screen, not an escalation step     |

### 4.1.7. Event Colours.

A closed set of six, and the only place in the app where colour is user-chosen. Each is a 4px dot in a day cell (§ 7.9.) and a swatch in the event form.

| Token         | Hex     | Name in the UI |
| ------------- | ------- | -------------- |
| `event-clay`  | #C97B5A | `클레이`       |
| `event-honey` | #CFA03F | `머스타드`     |
| `event-olive` | #7E8B4F | `올리브`       |
| `event-teal`  | #4F8A7B | `틸`           |
| `event-blue`  | #5B7297 | `인디고`       |
| `event-plum`  | #8A6296 | `플럼`         |

| Rule                                                              | Reason                                                                                                                                                                       |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `primary` is **not** in the set                                   | The milestone diamond (§ 7.9.) is `primary`, and an event dot in the same colour would read as a derived anniversary                                                         |
| Three of the six are cool, against § 8.1.'s warm bias             | The set is not a palette, it is a legend — six hues at 4px have to be told apart at a glance, and a warm-only run collapses into one orange smear. Chroma stays muted for it |
| A colour is never the only carrier of meaning                     | `scope` is dot **shape** (§ 7.9.), authorship is an avatar. Colour is the user's own label and means nothing to the app                                                      |
| `null` renders `meta-soft`                                        | An event created without picking a colour is the common case, not an error state                                                                                             |
| Set membership is validated server-side, never trusted off a body | `events.color` is a free `text` column; the closed set lives in `shared/config`                                                                                              |

## 4.2. Typography.

### 4.2.1. Font Family.

```
'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont,
system-ui, 'Apple SD Gothic Neo', sans-serif
```

| Decision                | Reason                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------- |
| Single family, no serif | Korean serif (myungjo) carries an old-print register; serif/sans contrast does not read on Hangul blocks |
| Pretendard              | Inter-metric-compatible; the modern Korean product canon (Toss, 당근); SIL OFL                           |
| No mono                 | Nothing in this app is tabular. A mono timestamp in a chat column reads as a log file                    |
| `font-display: swap`    | FOUT is acceptable; FOIT blocks the first paint of a chat screen                                         |

### 4.2.2. Hierarchy.

Korean is the only language, so these values ARE the Korean-tuned scale — there is no `:lang()` override layer. Each `--text-{token}` bundles size, line-height, letter-spacing, and weight into one utility.

| Token        | Size | Weight | Line-height | Tracking | Use                                          |
| ------------ | ---- | ------ | ----------- | -------- | -------------------------------------------- |
| `display-lg` | 26   | 700    | 1.35        | 0        | Screen title (rare — settings, search)       |
| `display-md` | 20   | 700    | 1.40        | 0        | Section heading, month label                 |
| `display-sm` | 18   | 600    | 1.45        | 0        | Sheet title, card title                      |
| `title-md`   | 16   | 600    | 1.45        | 0        | Header title, settings row label             |
| `title-sm`   | 14   | 600    | 1.45        | 0        | Sub-labels, list-section headers             |
| `body-lg`    | 17   | 400    | 1.65        | 0        | Long-form (event description)                |
| `body-md`    | 15   | 400    | 1.60        | 0        | Default body                                 |
| `body-sm`    | 13   | 400    | 1.55        | 0        | Secondary copy, helper text                  |
| `chat-body`  | 15   | 400    | 1.45        | 0        | Bubble text — tighter leading than `body-md` |
| `chat-name`  | 12   | 500    | 1.30        | 0        | Sender nickname above a group                |
| `chat-time`  | 11   | 400    | 1.20        | 0        | Timestamp beside a bubble                    |
| `chat-badge` | 11   | 600    | 1.00        | 0        | Unread `1` marker                            |
| `caption`    | 12   | 500    | 1.40        | 0        | Captions, counters, date pill                |
| `micro`      | 11   | 600    | 1.30        | 0.2      | Badge text                                   |
| `button-md`  | 15   | 600    | 1.25        | 0        | Default button label                         |
| `button-sm`  | 13   | 500    | 1.25        | 0        | Chip / pill label                            |
| `tab-label`  | 10   | 500    | 1.20        | 0        | Bottom tab bar label                         |

### 4.2.3. Rules.

| Rule                                   | Reason                                                                                                                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Never negative letter-spacing          | Hangul jamo collide visually at negative tracking. `micro` is the only positive-tracking token, and it carries Latin/numerals only                                                                      |
| Weight ladder is 400 / 500 / 600 / 700 | 300 is too thin for Hangul at chat sizes; 800+ renders as filled squares                                                                                                                                |
| `chat-body` leading is 1.45, not 1.60  | Bubbles are short-line containers; body leading inflates their height and destroys the density chat depends on                                                                                          |
| No text below 10px                     | `tab-label` is the floor                                                                                                                                                                                |
| `word-break: keep-all` app-wide        | Korean defaults to breaking between syllables, so a narrow column wraps mid-word; `keep-all` wraps at spaces. `overflow-wrap: break-word` rides along so a long URL still breaks instead of overflowing |

## 4.3. Spacing.

Base unit 4px. `2xs=4 xs=8 sm=12 md=16 lg=24 xl=32 2xl=48`.

There is no `section=64` tier: this is a mobile app with no marketing sections. Screen gutter is `md` (16px).

## 4.4. Radius.

| Token    | px   | Use                                    |
| -------- | ---- | -------------------------------------- |
| `xs`     | 4    | Badge, notch corner (§ 6.2.)           |
| `sm`     | 8    | Small controls, gallery thumbnails     |
| `md`     | 12   | Buttons, inputs, image messages, cards |
| `lg`     | 16   | Modals, containers                     |
| `xl`     | 20   | Bottom sheet                           |
| `bubble` | 18   | Chat bubbles only                      |
| `full`   | 9999 | Avatars, pills, icon buttons           |

`bubble` is its own token, not `lg`: 18px against a 15px/1.45 text block is the ratio that reads as a bubble rather than a card, and it must not drift when container radius is retuned.

## 4.5. Elevation.

Hairline is the default elevation. Shadows are confined to surfaces that float above the page.

| Token             | Value                                                             | Use                                  |
| ----------------- | ----------------------------------------------------------------- | ------------------------------------ |
| —                 | `border border-hairline`                                          | Default. Cards, bubbles, list rows   |
| `shadow-raised`   | `0 1px 2px rgb(31 27 23 / .04), 0 2px 8px rgb(31 27 23 / .05)`    | Floating action button, tab-bar lift |
| `shadow-floating` | `0 4px 12px rgb(31 27 23 / .06), 0 16px 32px rgb(31 27 23 / .12)` | Bottom sheet, modal                  |

Scrim: `bg-scrim/45`. Shadow colour is derived from `ink`, not black — a neutral-black shadow on warm paper reads grey and dirty.

Bubbles carry **no shadow**. `bubble-theirs` is separated from `chat-canvas` by a 1px `hairline`; `bubble-mine` is separated by its own fill. Adding shadow to a dense column of bubbles is the single fastest way to make a chat UI look amateur.

## 4.6. Iconography.

| Property       | Value                                                                          |
| -------------- | ------------------------------------------------------------------------------ |
| Library        | `lucide-react` only. Custom marks are `.svg` files imported through SVGR       |
| Stroke width   | `1.75` everywhere (lucide default is 2 — slightly heavy against Pretendard)    |
| Size           | `20` in tab bar and composer, `18` inline, `16` in dense rows                  |
| Colour         | `meta` at rest, `ink` when emphasized, `primary` only when active-state (§ 8.) |
| Emoji as icons | Forbidden (§ 2.2.)                                                             |

## 4.7. Motion.

Five durations and three curves. Nothing in the app times itself; every animated property reads one of these.

| Token                    | Value                            | Use                                                                                    |
| ------------------------ | -------------------------------- | -------------------------------------------------------------------------------------- |
| `--duration-press-in`    | 140ms                            | A finger landing — the bloom growing (§ 4.7.2.)                                        |
| `--duration-press-out`   | 520ms                            | A finger leaving — the bloom bouncing back, long enough for both crossings to be seen  |
| `--duration-state`       | 200ms                            | A committed state change — the tab fill, a toggle, the bars' collapse (§ 3.5., § 7.3.) |
| `--duration-route-exit`  | 140ms                            | The outgoing screen in a route change (§ 4.7.1.)                                       |
| `--duration-route-enter` | 220ms                            | The incoming screen, delayed by the exit so the two never overlap (§ 4.7.1.)           |
| `ease-press`             | `cubic-bezier(0.2, 0, 0, 1)`     | The press itself — no overshoot going in, or the control feels loose under the finger  |
| `ease-bloom`             | a `linear()` spring              | The release. The only curve in the system that crosses its resting value — twice       |
| `ease-route`             | `cubic-bezier(0.32, 0.72, 0, 1)` | Route motion — a longer tail, so the screen settles rather than stops                  |

Exits are shorter than enters on purpose: content that is leaving should not compete for attention, and content that is arriving needs long enough to be read as arriving.

### 4.7.1. Route transitions.

Route changes animate through React's `<ViewTransition>`, which `next.config.ts` enables with `experimental.viewTransition`. The flag alone animates nothing: only an element inside a `<ViewTransition>` boundary is ever snapshotted.

The boundary wraps the shell's scroller and nothing else, keyed on `update` — a route change mutates the scroller's contents, which is what `update` names, and the floating bars (§ 3.5.) stay off the transition entirely so they hold still while the screen behind them changes.

A tab switch is a **24px directional slide**, along the tab bar's own order: tapping a tab to the right of the current one brings the new screen in from the right, and a tab to the left brings it in from the left. The direction is the bar's, not the app's history — the tab bar is the only thing that knows the order, so it tags each `Link` with a `tab-forward` / `tab-back` transition type and the shell's boundary maps those to the two animations. Direction taken from history instead would put 갤러리 on a different side depending on where the user came from, which is the one thing a slide must never do.

An untyped update does **not** animate, and the boundary must never carry a catch-all. `update` names any transition-scoped mutation beneath it, and a `router.refresh()` — what saving a profile or logging out issues — is one: with a fallback animation in place, a same-route data refresh replays the full route transition on the whole screen. Deeper navigation (설정 → 이모티콘) is therefore instant today. It is a hierarchy and can take its own directional treatment later, by tagging those links with their own transition type rather than by widening the default.

The **slides** are sequenced — the incoming screen's `route-slide` is delayed by the full exit duration, so it starts moving only once the outgoing one has finished. The **fades** are not: `route-fade` runs on both screens over the exit duration, with no delay on the incoming one.

That split is load-bearing, and delaying both fades was a real bug. A screen at zero opacity is not a blank screen, it is a **hole**: `:root` is deliberately uncaptured (below), so nothing is painted behind the transition layer except the shell itself, and for the length of the gap the shell's flat `canvas` showed straight through — across the whole screen, and most visibly behind the translucent bars, which read as filling with white and emptying again. Overlapping the fades keeps total coverage at 1 throughout: the two snapshots carry the UA's `mix-blend-mode: plus-lighter`, so complementary opacities sum rather than dip. What the original rule was guarding against — two screens visibly crossing over each other, which is what makes a slide read as cheap — is avoided by sequencing the slides, not the fades. Only one screen is ever in motion.

**Two things are captured, and no more.** `:root` takes `view-transition-name: none` so the shell's own surface never rides the transition; `<main>` and `BottomOverlay` each carry a name. They become two groups, and groups stack in the paint order of the elements they came from — the overlay follows the scroller in the shell, so its group draws above.

The layering is the whole reason the bars are named. The transition layer is the **top layer**: no `z-index` on the page reaches above it, and neither does the top layer's other tenant — a `popover` bar is painted over by the screen's snapshot just the same. A bar that stays on the live page therefore cannot stay visible. The only way over the sliding screen is to ride the same layer.

Clipping the screen's snapshot out of the bar strip is not an alternative, and the reason is worth keeping: **a captured element stops painting on the live page entirely.** Cut the snapshot away and nothing takes its place — the strip falls through to the shell's `canvas`, and a translucent bar over a flat fill of its own colour reads as a solid white block for the length of every navigation. There is no arrangement in which the strip shows live screen content while the screen is captured.

The cost is `backdrop-filter`, and it is why `glass` no longer carries one (§ 3.5.). A captured group is composited on its own, so a `backdrop-filter` inside one has no backdrop left to sample and collapses to a flat fill. Plain alpha has no such problem: it composites against whatever the group is drawn over, so a captured `canvas/75` bar still shows the sliding screen through it, exactly as it does at rest. Translucency survives capture; blur does not.

The bars are captured but they never **cross-fade**, and that is a correctness rule rather than a taste one. A group's two snapshots are composited with `mix-blend-mode: plus-lighter`, which sums them — and the bars' old and new snapshots are the same picture, since `pendingTab` (§ 7.3.) moves the fill before the capture. Two copies of a `canvas/75` surface add to 1.5, clamp, and render as a flat opaque plate for the length of the navigation: the bar and the transparent nav padding around it fill in solid and empty again when it ends. A complementary fade hides this by keeping the sum at 1, which is what the screen's two snapshots do — but that fade lives in the class-gated rules, so an engine without `view-transition-class` never runs it and gets the plate. `::view-transition-old(bars)` is therefore pinned to `opacity: 0` and the new one to `1`, with no animation on either. One snapshot has nothing to add itself to.

This is the third arrangement tried, and the two it replaces are both traps worth naming. Leaving the bars unnamed and uncaptured kept the blur alive but let the snapshot paint straight across them. Clipping the snapshot instead kept the bars visible but emptied the strip behind them. Both were attempts to keep a live blurring surface above an animating snapshot, which the API does not permit.

**Neither `html` nor `body` may carry a background.** Whichever of them does becomes the **canvas background**, and the canvas background is drawn into view-transition snapshots — so it lands as a rectangular plate of that colour behind every captured group. On the screen that is invisible, since the screen is opaque anyway. On the bars it is the whole bug: their box is mostly transparent padding around a rounded pill, so the plate shows up as a solid rectangle filling in behind the bar for the length of every navigation and emptying again when it ends. It was `canvas` — the lightest colour in the palette — which is why it read as white.

The letterbox on a wide viewport (§ 3.3.) is painted by the shell element instead, which is neither captured nor the canvas, so it is unaffected. The login screen paints its own full-height `canvas` for the same reason.

An earlier revision put `canvas` on `html` deliberately, to keep iOS's safe-area strips beside the notch from darkening mid-navigation — a view transition paints only inside the snapshot containing block, and those strips fall outside it, so what shows there is whatever the canvas carries. That fix is what created this one. With no canvas background at all the strips take the browser's own default for the length of the animation; if that reads badly, the answer is a solution that does not go through the canvas, not putting a colour back.

Under `prefers-reduced-motion: reduce` every view transition drops to a `0s` duration, which is the browser's own instant swap.

### 4.7.2. Press bloom.

A round control **grows** under the finger — `scale: 1.3` in over `--duration-press-in`, then **bounces** back to rest over `--duration-press-out` on `ease-bloom`. It is one utility, `press-bloom`, and it pins a resting `scale: 1`: from an unset `scale: none` WebKit refuses to interpolate and the control snaps to size instead of growing into it. The pressed scale reads from `--press-scale`, so a control can dial the swell without forking the utility; nothing overrides it today.

The utility owns the control's whole `transition` shorthand, with a per-property timing list — the scale on the long overshoot, colour and opacity on `--duration-state`. `transition-property` is a single declaration, so a caller that adds `transition-colors` beside it silently drops one of the two. That is also why the bloom must be applied unconditionally rather than on a state branch: the send disc (§ 6.6.) flips `canSend` in the same click that sends, and a class removed there takes the resting `scale: 1` with it while the release is still running.

30% and not less, over durations that are long for touch feedback. The bloom is carried by a 20px glyph and a 44px circle: 6% is a single pixel of travel and 110ms is over before the eye finds it — enough to measure, not enough to see. Both numbers are sized to the smallest thing wearing them, not to what would be tasteful on a full-width button.

The release is a **spring**, not an ease. `ease-bloom` is a `linear()` easing that crosses its resting value twice — the control shoots past its resting size to roughly 5% under it, comes back about 1% over, and settles. A `cubic-bezier` cannot express that: its output crosses the resting value at most once, so the most it can do is settle from one side. The spring is what turns the release from a transform ending into something with weight.

It stays a `transition`, not a keyframe animation, and that is the constraint the curve has to live inside. The press is driven by state — `:active`, `[data-pressed]` — and there is no CSS event for "released", so an animation would have nothing to fire on. `linear()` is what lets a transition carry a multi-crossing curve at all. Its stops are generated, not tuned by hand: nudging one produces a kink rather than a softer bounce, so the list is replaced whole or not at all.

It fires off three selectors and all three are needed. `:active` is the mouse. `.group:active` is a wrapper the pointer lands on directly. `.group[data-pressed]` is the only one that fires **under a finger**: wherever `HapticTap` is mounted, the tap lands on a native switch (§ 7.15.), and WebKit resolves that press inside the native control rather than propagating `:active` up to the wrapper — and on a control that cancels `pointerdown` to hold focus (the send button), cancelling the event suppresses `:active` outright. `HapticTap` therefore sets `data-pressed` on its own parent from `pointerdown` and clears it on up, cancel, leave, and unmount. Without that last one the tab bar strands a bloomed tab: it drops `haptic` off the tab it has just switched to, which unmounts the overlay mid-press. The unmount path has to read the parent captured on `pointerdown`, not a ref: React detaches refs before a passive cleanup runs, and `useIsCoarsePointer` reports `false` on the first render, so the overlay is not even in the tree when a mount effect would try to find it.

It grows rather than shrinks on purpose. A control that recedes reads as being pushed away, which is a button pretending to be a physical key; the platform's own glass controls swell toward the finger instead, as if the material were answering the touch. There is no perspective, no rotation, and no shadow change — those are the parts of that language that read as a 3D toy on a flat interface. Scale and the existing fill change carry it.

Where it applies: the tab bar's icon-label stack (§ 7.3.), every `icon-button` (§ 7.1.), and the composer's send disc (§ 6.6.). A circle 44px across sits entirely under the finger, so its fill change is invisible at the moment it matters and the scale is the only feedback the user can actually see. Rectangular buttons and chips (§ 7.1.) keep the fill change alone — they are wide enough that their edges stay in view.

# 5. Theming.

## 5.1. State Model.

v1 ships light only. `ThemeProvider` wraps `next-themes` with `forcedTheme="light"`; the settings toggle is not rendered. Enabling dark later is: populate the `.dark` block, delete `forcedTheme`, render the toggle.

## 5.2. CSS Mechanism.

`@custom-variant dark (&:where(.dark, .dark *))` in `globals.css`. Dark values rebind the **same** custom property names inside `.dark` — there is no `bg-canvas-dark` utility, `bg-canvas` swaps automatically. The `.dark` block exists in `theme.css` today with no declarations.

## 5.3. Dark Readiness Rules.

These are binding now, even though no dark value exists yet.

| Rule                                                                                       | Reason                                                                     |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Never hardcode a hex or a raw Tailwind colour utility — always a semantic token            | Every such site becomes a manual `dark:` override later                    |
| Never assume a token is light or dark (e.g. `text-ink` over `bg-canvas`, not `text-black`) | Pairs stay valid across themes only if expressed as token pairs            |
| `bubble-ink` is a single token shared by both bubble fills                                 | On dark, both fills darken together; a per-fill text colour would fork     |
| Shadows are authored as `rgb(ink / α)`-derived values                                      | Dark drops shadows entirely (they read as smudge); one token set to `none` |
| No light tint may be reused directly on a dark canvas                                      | Tints are re-derived, not inverted                                         |

## 5.4. Deferred.

Dark hex values, the settings toggle, and the pre-paint `.dark` class injection from cookie are out of v1 scope. When implemented, dark MUST be hand-tuned, not arithmetically inverted, and `canvas-dark` MUST retain the warm bias (never `#000000`).

# 6. Chat Surface.

The chat screen is the product. It is specified here rather than in the feature slice because its geometry defines the app's identity.

## 6.1. Column.

| Property        | Value                                                                                                                                                                                              |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Background      | `chat-canvas`                                                                                                                                                                                      |
| Rendering       | **Virtualized** — offscreen messages are not in the DOM (`REQUIREMENTS.md § 8.3.`)                                                                                                                 |
| Scroll          | Owned by the virtualizer. **`flex-direction: column-reverse` is forbidden here** — it fights the virtualizer's scroll anchoring. Bottom-stickiness and prepend stability are the virtualizer's job |
| Horizontal pad  | `md` (16px)                                                                                                                                                                                        |
| Gap in-group    | `2xs` (4px)                                                                                                                                                                                        |
| Gap cross-group | `sm` (12px)                                                                                                                                                                                        |
| Gap around date | `md` (16px) above and below the divider pill                                                                                                                                                       |

Virtualization constrains the visual spec in two places, and both are binding:

| Constraint                                                                                         | Reason                                                                                        |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Message spacing is authored as **padding inside the row**, never as `gap` on the list container    | The virtualizer positions rows absolutely; a container `gap` does not exist for it to measure |
| Media and emoticon rows MUST reserve their box from stored `width`/`height` before the asset loads | A row that changes height after paint forces a re-measure and visibly jolts the scroll        |

## 6.2. Bubble.

| Property      | Value                                                                                          |
| ------------- | ---------------------------------------------------------------------------------------------- |
| Max width     | `72%` of the shell                                                                             |
| Padding       | `8px 12px` (`py-xs px-sm`)                                                                     |
| Radius        | `bubble` (18px) on three corners                                                               |
| Notch corner  | `xs` (4px) on the corner nearest the sender — top-right for `mine`, top-left for `theirs`      |
| Notch scope   | Applied to the **first bubble of a group only**; subsequent bubbles are fully `bubble`-rounded |
| Typography    | `chat-body`, colour `bubble-ink`                                                               |
| Fill          | `bubble-mine` / `bubble-theirs`                                                                |
| Border        | `bubble-theirs` only: 1px `hairline`. `bubble-mine` has none                                   |
| Shadow        | None (§ 4.5.)                                                                                  |
| Text wrapping | `whitespace-pre-wrap`, `break-words`, `overflow-wrap: anywhere`                                |

The notch corner replaces a drawn tail (§ 2.1.). It carries direction, survives grouping without extra geometry, and cannot misalign against the bubble edge the way an absolutely-positioned triangle does.

## 6.3. Grouping.

A group is consecutive messages from one sender within the same clock minute.

| Element     | Rule                                                                                                                                   |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Avatar      | `theirs` only, 36×36 `rounded-full`, rendered on the first bubble of the group; subsequent bubbles indent by the avatar width + `xs`   |
| Sender name | `theirs` only, `chat-name` in `chat-meta`, above the first bubble                                                                      |
| Timestamp   | `chat-time` in `chat-meta`, on the **last** bubble of the group, on the outer side (left of `mine`, right of `theirs`), bottom-aligned |
| Unread `1`  | `mine` only, `chat-badge` in `unread`, directly above the timestamp                                                                    |

`mine` groups render no avatar and no name — in a two-person conversation, right-alignment is unambiguous identity.

## 6.4. Date Divider.

Centered `chat-pill` pill, `caption` in `chat-pill-ink`, padding `4px 12px`, `rounded-full`. Copy: `오늘`, `어제`, then `2026년 8월 3일 월요일`.

## 6.5. Non-Text Messages.

| Type       | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Media      | No bubble. `rounded-md`, 220px wide, `object-cover`, 1px `hairline` inset ring. One attachment keeps its own aspect ratio; two or more take a square-cell grid (2 and 4 in two columns, everything else in three) at the same width, so bubbles of one and of nine align in the column. A video tile carries a play glyph and its running time. While uploading, the bubble dims to 60% (below) and a `primary` progress bar fills its bottom edge. Timestamp and unread marker keep their § 6.3. positions |
| Emoticon   | No bubble, no border, no background. Max 140×140, box reserved from the item's stored `width`/`height` (§ 6.1.). One image slot, animated or not (`REQUIREMENTS.md § 13.2.`), so an animated file simply plays; a tap remounts it to restart it and is the only thing that plays its audio (`REQUIREMENTS.md § 13.6.`). Timestamp and unread marker keep their § 6.3. positions                                                                                                                             |
| System     | Calendar-change notice (`REQUIREMENTS.md § 11.5.`). Centered `chat-pill` pill, `caption` in `chat-pill-ink`, padding `4px 12px`, `rounded-full` — the § 6.4. date-divider treatment, so system notices read as timeline furniture rather than as someone speaking. No avatar, no timestamp, no unread marker. Tappable, `:hover` `bg-surface-strong`                                                                                                                                                        |
| Failed     | `semantic-error` retry affordance to the outer side of the bubble, with a `meta` cancel beneath it; bubble itself renders at 60% opacity                                                                                                                                                                                                                                                                                                                                                                    |
| Optimistic | Bubble at 60% opacity until the server echo arrives; no spinner                                                                                                                                                                                                                                                                                                                                                                                                                                             |

## 6.6. Composer.

| Property        | Value                                                                                                                                                                                                                                                                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Container       | The tab bar's pill (§ 7.3.): `glass`, 1px `hairline`, `shadow-floating`, radius `--tab-bar-height / 2`, `2xs` inner padding. Anchored to `--bottom-inset`, so it floats directly above the bar stack (§ 3.5.)                                                                                                                                                            |
| Padding         | `md` each side, `xs` below, matching the tab bar's inset. The tab bar below it already owns `env(safe-area-inset-bottom)`                                                                                                                                                                                                                                                |
| Row             | One row, bottom-aligned: attach, field, right control. The field grows upward and the controls stay level with its last line                                                                                                                                                                                                                                             |
| Field           | No shape of its own — the pill is the surface. No fill, no border, square (radius 0), padding `8px 4px`, `body-md`, placeholder `메시지 입력`, auto-grow to 5 lines then scroll internally                                                                                                                                                                               |
| Field focus     | No ring. The caret is the focus signal — the one § 3.2. exception, see below                                                                                                                                                                                                                                                                                             |
| Left control    | `+` (attach) — 20px glyph in a 44×44 target                                                                                                                                                                                                                                                                                                                              |
| Right controls  | Emoticon toggle (20px / 44×44) and send, both always present. Send sits **beside** the toggle rather than replacing it, because an emoticon can be staged alongside a typed line (`REQUIREMENTS.md § 13.6.`)                                                                                                                                                             |
| Send button     | `primary` fill, `on-primary` glyph, 36×36 visual in a 44×44 target, `rounded-full`. Disabled with a `primary-disabled` fill while there is nothing to send — never unmounted, see below                                                                                                                                                                                  |
| Keyboard        | The shell is sized to the visual viewport (§ 3.4.), which carries the composer up. Never `100vh` math                                                                                                                                                                                                                                                                    |
| Sending         | The send button cancels `pointerdown` and refocuses the field, so sending never closes the keyboard — except while the emoticon panel is up, which the refocus would replace with the keyboard (`REQUIREMENTS.md § 13.6.`)                                                                                                                                               |
| Staged emoticon | Right-aligned at the **top of the composer stack** — above the pill, and above the emoticon panel while that is open — on the side its own bubble will land on (§ 6.2.), where the media tray stays left-aligned because a tray is a row rather than one object. Out of the stack's flow, so it floats over the history instead of moving it (`REQUIREMENTS.md § 13.6.`) |
| Emoticon panel  | Above the pill, cleared from the history by `xs` — the composer's own top padding, so the gap does not change when the panel opens. It expands and collapses over 200ms and the history rides along with it (`REQUIREMENTS.md § 13.6.`)                                                                                                                                  |

The field is drawn as nothing at all — no fill, no border, no radius, no focus ring — because the pill already _is_ the field: it is the composer's only surface, it is the full width of the tap area, and a second rounded shape nested inside it reads as a box drawn inside a box. This is the single exception to § 3.2.'s `:focus-visible` rule, and it is allowed only here: a focused text field renders a blinking caret, which is a stronger and more conventional focus signal than a ring, and the field is the composer's default focus target anyway. No other control may drop its focus ring on this argument.

The send button is disabled rather than unmounted while there is nothing to send. WebKit leaves a control newly inserted into the composer row unpainted until something forces the layer to invalidate: typing does, because the caret blinks, but staging an emoticon touches nothing inside the pill, so the button and the shifted emoticon toggle both stayed invisible until the pointer happened to hover them. Keeping the button mounted removes the insertion and the reflow that moves the toggle, leaving only a fill change on an element that is already on screen.

The composer is static rather than `fixed` because the virtualized list above it (§ 6.1.) has to be a bounded flex child, and a `fixed` composer would leave that box unbounded. Being inside the shell column, it also inherits the max width and centering instead of re-applying them.

## 6.7. Scroll-to-Bottom Pill.

Shown whenever the viewport is away from the newest message — after scrolling up through history, and after a search jump (§ 6.8.). One component serves both.

| Property          | Value                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| Geometry          | `rounded-full`, `canvas` fill, 1px `hairline`, `shadow-raised`, padding `8px 14px`, min-height 40 |
| Position          | Bottom-center of the message column, `md` (16px) above the composer                               |
| Rest content      | 16px chevron-down glyph in `meta`, alone                                                          |
| With new messages | `primary` fill, `on-primary` chevron and `button-sm` count label — `새 메시지 3`                  |
| Threshold         | Appears past ~200px from the bottom; hides on arrival                                             |
| Transition        | Fade + `translate-y-1` over 150ms, both directions                                                |
| `:hover`          | `bg-surface-soft` (rest) / `bg-primary-hover` (new-message)                                       |
| `:active`         | The press bloom (§ 4.7.2.) — it is a floating round control, like the bars' own buttons           |
| Tap target        | 44 high including padding                                                                         |

The count variant recolours to `primary` rather than adding a separate badge element: a badge on a floating pill stacks two elevated shapes in the busiest corner of the screen.

## 6.8. Search.

| Element         | Rule                                                                                                                             |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Result row      | `canvas` fill on `surface-soft` list, sender name (`title-sm`), matched line (`body-sm`, 2-line clamp), date (`caption`, `meta`) |
| Match highlight | `search-hit` background, `ink` text, `rounded-xs`, computed client-side by string split                                          |
| Jump target     | On arrival the **row** flashes `primary-tint` for 1.5s, then fades over 300ms — see § 6.10.                                      |
| Return control  | The § 6.7. scroll-to-bottom pill — same component, no search-specific variant                                                    |
| Empty state     | § 7.6.                                                                                                                           |

## 6.9. Link Preview Card.

A text message carrying a link renders a card above its text, **inside** the bubble (`REQUIREMENTS.md § 8.9.`). Inside, because the card is part of what was said — a separate floating card beside the bubble would read as a second message, and it would have to re-derive the bubble's alignment and max width to sit under it.

| Property   | Value                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------- |
| Geometry   | Full bubble width inside its padding, `rounded-md`, 1px `hairline`, `canvas` fill, `2xs` above the text             |
| Thumbnail  | 16:9, `object-cover`, `surface-strong` while it loads. Omitted entirely when the page published no image            |
| Video mark | A 40px `scrim/60` disc with an `on-primary` play glyph, centered on the thumbnail. `og:type: video` only            |
| Title      | `title-sm` in `ink`, 2-line clamp                                                                                   |
| Body       | `body-sm` in `body`, 2-line clamp. Omitted when the page published no description                                   |
| Site line  | `caption` in `meta`, 1-line clamp — the site name, or the channel for a video                                       |
| `:hover`   | `bg-surface-soft`; `:active` `bg-surface-pressed`                                                                   |
| Absent     | Nothing is rendered while the scrape is in flight, and nothing at all for a page that describes itself with nothing |

The card keeps `canvas` on both sides of the conversation rather than tinting with the bubble: it is quoted material, and the one thing in a `bubble-mine` bubble that did not come from the sender.

Links in the text itself are underlined (`underline-offset-2`) and take `primary` on `:hover`, `primary-pressed` on `:active`. The URL stays in the bubble as the sender typed it — the card is an addition to the message, never a rewrite of it.

## 6.10. Reply Quote.

The message a reply points at, in one line (`REQUIREMENTS.md § 8.10.`).

| Property     | Value                                                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shape        | `rounded-sm`, 2px `primary` left bar, padding `4px 8px`, `xs` gap between thumbnail and text                                                      |
| Lines        | Sender name (`chat-name` in `chat-meta`) over the summary (`body-sm` in `meta`). **Both `truncate`, always one line each**                        |
| Summary copy | The text itself; `사진` / `동영상` for attachments, `이모티콘` for an emoticon, `삭제된 메시지예요` for a parent that has been deleted            |
| Thumbnail    | The bubble's **first** attachment only, 32×32 `rounded-xs` with a 1px `hairline` inset ring. Box fixed, never derived from the image (§ 6.1.)     |
| In a bubble  | Inside the text bubble at its top, `2xs` above the text, fill `chat-canvas` — recessed against both bubble fills, which `surface-soft` is not     |
| Standalone   | Media and emoticon messages have no bubble (§ 6.5.), so the quote is a `bubble-theirs` card above them, capped at the 220px attachment width      |
| Tap          | Jumps to the original. `:hover` `bg-surface-strong`, `:active` `bg-surface-pressed`. A deleted parent is not tappable — there is nothing to reach |
| Staged       | Above the composer stack, in flow, in the § 6.6. pill treatment (`glass`, `hairline`, `shadow-floating`) with a 36px `X` to cancel                |

The staged quote pushes the history up, where the staged emoticon of § 6.6. floats over it. The emoticon is one object standing where its own bubble will land; this is a bar, like the media tray, and a bar that floated would hide the messages the user is quoting from.

| Reply affordance | Rule                                                                                                                                                                                                                                                                                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Touch            | **Pull the row sideways** — toward the middle of the screen, so the pull always leaves the edge the row is aligned to. Engages at 8px, fires on release past 56px, damped to a 72px stop past that. Holding the bubble opens the § 7.5. action sheet with `답장` first, on an attachment as much as on a text bubble (`REQUIREMENTS.md § 8.11.`)            |
| Pull indicator   | A 32px `CornerUpLeft` in the gap the pull opens, on the edge the row moves **away** from — `surface-soft` on `meta` until the threshold, `primary` on `on-primary` past it, so the release is never a guess                                                                                                                                                 |
| Pointer          | A 32px `CornerUpLeft` button on the bubble's **outer** side, `opacity-0` until the row is hovered or one of the buttons is focused. `공유` is a second 32px button beside it where the message has something to share (`REQUIREMENTS.md § 8.11.`); `답장` stays the one nearer the bubble on either side, so the reach for it does not move with the sender |
| Position         | Out of the row's flow (`absolute`, vertically centered). In flow its appearance on hover would shove the bubble sideways under the cursor                                                                                                                                                                                                                   |
| Highlight        | A jump target flashes `primary-tint` on the **row**, not the bubble fill — media and emoticon messages have no fill and must highlight too                                                                                                                                                                                                                  |

# 7. Components.

Components are compositions of Tailwind utilities. No component stylesheets, no inline hex or px (§ 8.).

## 7.1. Buttons.

| Variant                | Rest fill        | Text                | Radius | Padding | Visual height | Border                |
| ---------------------- | ---------------- | ------------------- | ------ | ------- | ------------- | --------------------- |
| `button-primary`       | `primary`        | `on-primary`        | `md`   | 12×16   | 48            | none                  |
| `button-secondary`     | `canvas`         | `ink`               | `md`   | 12×16   | 48            | 1px `hairline-strong` |
| `button-ghost`         | transparent      | `ink`               | `md`   | 12×16   | 48            | none                  |
| `button-destructive`   | `semantic-error` | `on-semantic-error` | `md`   | 12×16   | 48            | none                  |
| `chip`                 | `surface-soft`   | `body`              | `full` | 8×14    | 36            | none                  |
| `chip-selected`        | `primary-tint`   | `primary`           | `full` | 8×14    | 36            | none                  |
| `icon-button`          | transparent      | `meta`              | `full` | —       | 44×44 target  | none                  |
| `icon-button-floating` | `glass` (§ 3.5.) | `ink`               | `full` | —       | 44×44 target  | 1px `hairline`        |

State matrix. `:focus-visible` is `ring-2 ring-primary ring-offset-2 ring-offset-canvas` for every variant unless noted.

| Variant                | `:hover`                                             | `:active`                   | `:disabled`                                 |
| ---------------------- | ---------------------------------------------------- | --------------------------- | ------------------------------------------- |
| `button-primary`       | `bg-primary-hover`                                   | `bg-primary-pressed`        | `bg-primary-disabled`, `cursor-not-allowed` |
| `button-secondary`     | `bg-surface-soft`                                    | `bg-surface-strong`         | `opacity-50`, `cursor-not-allowed`          |
| `button-ghost`         | `bg-surface-soft`                                    | `bg-surface-strong`         | `opacity-50`, `cursor-not-allowed`          |
| `button-destructive`   | `bg-semantic-error-hover`                            | `bg-semantic-error-pressed` | `opacity-50`, `cursor-not-allowed`          |
| `chip`                 | `bg-surface-strong`                                  | `bg-surface-pressed`        | `opacity-50`, `cursor-not-allowed`          |
| `chip-selected`        | unchanged — selection is a state, not a hover target | `bg-primary-tint/80`        | n/a                                         |
| `icon-button`          | `bg-surface-soft`, `text-ink`                        | `bg-surface-strong`         | `opacity-40`, `cursor-not-allowed`          |
| `icon-button-floating` | `bg-canvas` (opacity closes)                         | `bg-surface-soft`           | `opacity-40`, `cursor-not-allowed`          |

`icon-button` and `icon-button-floating` additionally take the press bloom (§ 4.7.2.) on `:active`. The composer's send disc (§ 6.6.) is not an `icon-button` — it is a 36 disc inside a 44 target — but it carries the same bloom, applied to the disc so the swell reads against the pill around it.

`icon-button` uses `ring-2 ring-primary` with no offset — the circle bounding box is the visual edge.

`icon-button-floating` is the only variant that sits over scrolling content (§ 3.5.), so it is the only one carrying a surface, a hairline, and `shadow-floating`. It is a translucent `canvas` rather than a solid fill: solid reads as a detached chip, and seeing the content keep moving through it is what makes it read as floating above that content instead of punched out of it. This is a suggestion of the platform's material, not a reproduction of it — no specular edge, no dynamic tint.

48px button height (not 44) because the shell is narrow and buttons are full-width: at 44 they read cramped against 16px gutters.

## 7.2. Inputs.

| Property         | Value                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| Rest             | `canvas` fill, 1px `hairline-strong`, `rounded-md`, padding 12×14, `body-md`, min-height 48           |
| Placeholder      | `meta-soft`                                                                                           |
| `:hover`         | `border-ink/20`                                                                                       |
| `:focus-visible` | `border-primary`, `ring-2 ring-primary/20`                                                            |
| `aria-invalid`   | `border-semantic-error`, `ring-2 ring-semantic-error/20`; message below in `body-sm` `semantic-error` |
| `:disabled`      | `surface-strong` fill, `meta-soft` text, `cursor-not-allowed`                                         |

Error state is triggered by `aria-invalid="true"`, never by a class alone.

## 7.3. Tab Bar.

| Property  | Value                                                                                                       |
| --------- | ----------------------------------------------------------------------------------------------------------- |
| Container | A floating pill over the content (§ 3.5.), `glass`, 1px `hairline`, `rounded-full`                          |
| Height    | `--tab-bar-height` (56) for the pill, plus `2xs` inner padding around the items                             |
| Item      | 4 equal columns, each a full-height 44+ tap target, vertical icon-over-label                                |
| Icon      | 20px, `1.75` stroke                                                                                         |
| Label     | `tab-label`, 2px below the icon                                                                             |
| Rest      | icon and label `meta`                                                                                       |
| Active    | icon and label `primary` on a `primary-tint` `rounded-full` fill spanning the item                          |
| `:hover`  | icon and label `ink` on a `surface-soft` fill (inactive items only)                                         |
| `:active` | The press bloom on the icon-label stack (§ 4.7.2.)                                                          |
| Badge     | `unread` fill, `on-primary` `micro`, min 18×18, `rounded-full`, anchored to the icon's top-right; `99+` cap |

The bar leaves while the on-screen keyboard is up: the shell shrinks to the visual viewport (§ 3.4.), so a bar left in flow would sit between the composer and the keys and eat 56px of an already short column. The install banner (§ 7.13.) goes with it, for the same reason.

It leaves by collapsing `BottomOverlay`'s height to `0` over 200ms `ease-out`, not by unmounting, and comes back on a 200ms delay — the shell's own height ease (§ 3.4.) has to land first, or the bar rises against a bottom edge that is still halfway up the screen and appears in mid-air: `--bottom-inset` is measured off that box, so the collapse carries the clearance — and with it the composer — down on one timeline. Unmounting stepped the inset the instant the keyboard was detected while the shell was still easing to its new height, and the composer visibly moved twice. Both bars are therefore keyboard-agnostic; the decision lives in `BottomOverlay` alone. The collapsing box is not clipped: the bars slide down past the shell's bottom edge, which is where the keyboard already is.

The 200ms delay is counted from the shell's height ease starting, which means `useIsVirtualKeyboardOpen` MUST NOT report the keyboard gone before the visual viewport has grown back. Detection is therefore asymmetric: **opening** takes a focused editable element _and_ a height drop past 160px, **closing** takes the height alone. Blur is not a closing signal — `focusout` lands the frame the field is blurred while WebKit only reports the restored height once the keys have finished sliding, so an AND across both signals dropped the flag roughly 250ms early. The delay then expired before the shell had started growing, the bars rose against an edge still halfway up the screen, and `--bottom-inset` yanked the composer and the history up by the bar's height before the shell brought them back down — the flinch this asymmetry exists to remove. Closing on the viewport alone also keeps Android's back button correct, which hides the keyboard without blurring the field.

The bar floats inside the shell (§ 3.5.), so it is neither `fixed` nor width-re-applying: the shell is already a `fixed` box of the visual viewport's height, and the bar is an absolute child of its column.

Re-tapping the tab the user is already on carries no transition type, so it does not animate — it still navigates, and a type would slide the screen out and the identical screen back in.

The fill moves on the tap, not on the commit. Every tab screen is dynamic (`REQUIREMENTS.md § 8.`), so none of them prefetches to anything usable and the router holds the click for a server round trip — long enough that a bar driven by `usePathname` alone reads as a dropped tap. The tapped `href` is held as pending state and **discarded** — not merely masked — the render the pathname lands, so the fill and the label colour move immediately while the outgoing screen stays up. A value left in state would match again the next time the user arrives back on the route it was tapped from, and a swipe-back would refill the tab they had just left. This is presentation only: `aria-current` moves with it, but nothing else acts on the pending value, and a navigation that never commits returns the fill to the real route.

The active item is the one filled surface in the system's navigation: on a pill this narrow there is no room for an indicator bar underneath, and colour alone is too weak a signal against a translucent backdrop that changes with whatever scrolls behind it.

The glyphs stay outlined in both states: lucide ships no filled counterpart for `MessageCircle`, `CalendarDays`, `Images`, or `Settings`, and faking one with `fill-current` turns them into solid blobs. If a filled set is ever adopted it MUST cover all four — a single filled tab reads as a rendering bug.

Labels: `채팅` / `캘린더` / `갤러리` / `설정`.

## 7.4. Modal.

`canvas` surface, `rounded-lg`, `shadow-floating`, scrim `bg-scrim/45`. Props-driven (`isOpen` / `header` / `onClose`), never composed at the call site.

| Size | Width                     | Use                          |
| ---- | ------------------------- | ---------------------------- |
| `sm` | `min(360px, 100% - 32px)` | Confirmations, short choices |
| `md` | `min(440px, 100% - 32px)` | Forms with helper copy       |

No size beyond `md`: the shell is 576px, so anything larger is a screen, not a modal. Header is `display-sm` `ink`, optional description `body-sm` `meta`.

## 7.5. Bottom Sheet.

The default overlay for anything originating from a bottom-anchored or list interaction. Bottom-anchored **floating card**, inset `sm` (12px) from the screen edges, `rounded-xl`, `canvas` fill, 1px `hairline`, `shadow-floating`, `overflow-hidden`.

| Rule                                                                                 | Reason                                                  |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| Drag handle at top: 48×6, `rounded-full`, `hairline-strong`                          | The dismissal affordance                                |
| No close `X` alongside the handle                                                    | Two redundant dismiss controls on the same edge         |
| Centered `title-md` `ink` header; optional `body-sm` `meta` description              | Matches the reference implementation                    |
| A sheet whose rows already say what it is may hide the header                        | A title over `사진/영상` only restates it               |
| Body scrolls internally past `70dvh`; max height `90% - 12px` of `--viewport-height` | Sheet must never push past the visual viewport (§ 3.4.) |
| Bottom edge sits at `--viewport-bottom`, not `0`                                     | The keyboard would otherwise cover it (§ 3.4.)          |
| Focus ring inside the sheet is `ring-2 ring-primary ring-inset`                      | `overflow-hidden` would crop an outward offset ring     |
| Never swapped for a `Modal` at any width                                             | § 3.1.                                                  |

`ActionSheet` is a bottom sheet whose body is a list of full-width `surface-soft` rows, `rounded-md`, `button-md` centered label with optional leading icon, following the chip ladder for states. Destructive rows use `semantic-error` text.

## 7.6. Empty State.

`surface-soft` card, `rounded-md`, 1px `hairline-soft`, padding `2xl`, centered. 24px `meta-soft` lucide glyph, `body-md` `meta` line, optional `button-secondary`. No illustrations — a two-person app has no room for mascot art, and stock illustration is the clearest tell of a template build.

## 7.7. Avatar.

`rounded-full`, `surface-strong` fallback fill with the nickname's first character in `title-sm` `meta`. Sizes: 36 (chat), 44 (settings row), 72 (profile edit). 1px `hairline` inset ring at every size so light photos do not bleed into `canvas`.

The photo is stored **square** (`REQUIREMENTS.md § 12.`), because the circle crops anything else and the § 7.10. viewer would then show a framing the circle never did.

Where it is enlargeable, the avatar is a button: `opacity-80` on hover, `opacity-70` on active, `focus-visible` ring on the circle itself rather than on the image inside it. Tapping opens the § 7.10. viewer on that one photo, with the save control hidden — a profile photo is the person, not an attachment they shared. It is **not** enlargeable inside another interactive element (the § 7.9. day sheet's authorship avatar), where a nested button would swallow the tap.

## 7.8. Skeleton.

`surface-strong` blocks at the final content's radius, pulsing to `surface-soft` over 1.5s. Used for the initial message page, gallery grid, and calendar month. Never for optimistic messages — those render at 60% opacity (§ 6.5.).

Every remote image also carries one while it loads: `PreloadImage` (`@/shared/ui`) fills its own box with the skeleton and fades the asset in over 200ms once it paints. Screens MUST NOT render a bare `<img>` for an R2-backed asset — the skeleton is what stands in for the reserved box of § 6.1. instead of a blank rectangle, and the fade is what keeps a cached image from flashing. An asset that never arrives ends on a static `surface-strong` box with a `meta-soft` `ImageOff` glyph: a skeleton that pulses forever reads as a hung screen.

## 7.9. Calendar.

The calendar screen opens with a D-day header, then the month grid.

| Element        | Rule                                                                                                                                                                                                 |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-day header   | Full-width band on `surface-soft`, `rounded-lg`, padding `lg`, `md` bottom margin. Day count in `display-lg` `primary` with the unit in `title-md` `meta`; label line in `body-sm` `meta` beneath    |
| Next milestone | `caption` `meta` line inside the same band — e.g. `500일까지 12일`. Hidden if none within a year                                                                                                     |
| Upcoming card  | `canvas` fill, 1px `hairline`, `rounded-md`, padding `md`. Up to two entries: `title-sm` `ink` title, `caption` `meta` relative date. Hidden entirely when empty — never renders an empty-state here |

The D-day band is the only place `display-lg` appears in the app. It is the screen's single focal point, so nothing else on the calendar competes at that size.

| Element          | Rule                                                                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Month label      | `display-md` `ink`, centered, chevron `icon-button` either side                                                                                                          |
| Weekday header   | `caption` `meta`; Sunday `semantic-error`, Saturday `primary`                                                                                                            |
| Day cell         | Square, `body-md`; current month `ink`, adjacent months `meta-soft`                                                                                                      |
| Today            | `chat-badge`-weight numeral in `primary`, no fill                                                                                                                        |
| Selected         | `primary` fill, `on-primary` numeral, `rounded-full`                                                                                                                     |
| Event marker     | Up to 3 dots (4px, `rounded-full`) below the numeral, in the event's colour                                                                                              |
| Marker by scope  | `shared` events use a filled dot; `mine` events use a 1px ring dot of the same colour. Shape, not colour, carries scope — colour is already spent on the event's own hue |
| Milestone marker | Derived anniversaries (100일, 주년) render a 4px `primary` diamond, distinct from every event dot                                                                        |
| Event colours    | Drawn from the tint family only; never raw hues                                                                                                                          |

## 7.10. Gallery.

3-column grid, `2xs` (4px) gutters, square `object-cover` cells, `rounded-sm`. Month section header is `title-sm` `meta` and **scrolls with the grid**. Viewer is full-bleed on `scrim` at 90% opacity with no chrome except a close `icon-button`, the position counter, and the save pair — `공유` then `원본 저장` (`REQUIREMENTS.md § 8.11.`); slides carry vertical padding only, since a side gutter reads as a frame around a photo the viewer exists to show whole.

It dismisses on `Escape` and on a tap anywhere on the scrim, like every other overlay — written out rather than inherited, since the viewer composes no `Dialog` (§ 3.5.1.). The photo itself is not scrim: holding it is how the OS menu is reached. **The `<img>` box is not the photo**, though — `object-contain` letterboxes inside it, so the tap is tested against the painted rectangle and a portrait photo's side gutters dismiss like the scrim they look like. A `<video>` is excluded whole, controls and gaps between them alike.

Opened from a chat bubble the user sent, the viewer takes one more control: a `semantic-error` trash beside the save, labelled `메시지 삭제` because it removes the whole bubble (`REQUIREMENTS.md § 6.`) and not the slide on screen. It is **confirmed**, in the § 7.4. modal that names the consequence — the control sits beside a per-slide 원본 저장, so the reach of one tap is not readable from where it is. The action sheet's 삭제 on an attachment bubble routes through that same confirmation (`REQUIREMENTS.md § 8.11.`); only a text bubble's is immediate.

The viewer is also the one surface that suppresses **none** of the OS's own hold gestures (§ 3.2.): a slide is the whole screen with nothing of the app's competing for the hold, so holding a photo here is how a user reaches iOS's 사진에 저장.

The month header was `sticky` under the app header and is deliberately not any more. The app header is transparent (§ 7.12.), so a pinned opaque band left tiles rendering above it and read as a strip cutting through the grid rather than as a label. Covering the header zone in `canvas` would have fixed that by making the gallery the one screen whose header is not transparent; letting the label scroll costs a way to tell which month is on screen mid-scroll, and that was the cheaper loss.

| Element         | Rule                                                                                                                                                                              |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header controls | `icon-button-floating` only (§ 7.12.) — 사진 추가 and 선택, replaced by a single 취소 in selection mode. The count moves into the title (`2장 선택`)                              |
| Selected tile   | The image **scales to 90%** inside its cell; the cell itself does not move. A dim would read as the photograph being wrong, where the inset reads as the tile having been picked  |
| Selection mark  | 20px circle, top-right inset 4. Selected is a `primary` fill with an `on-primary` check; unselected is a `scrim/25` disc with a `canvas/80` hairline, so it reads on any photo    |
| Selection bar   | The floating surface of § 3.5. — `glass`, `rounded-full`, `hairline`, `shadow-floating` — over the tab bar, holding 저장 and 삭제 as equal `ghost` rows                           |
| Selected count  | Leads the selection bar as `button-md` `meta`, **not only the header title**: the title fades once content scrolls under it (§ 7.12.), which would take the running total with it |
| Video tile      | The play glyph and running-time chip of § 6.5., unchanged from the chat cell                                                                                                      |

Selection mode is entered from the header control, or by **holding a tile**, which enters it with that tile picked. A tap still opens the viewer, because a hold that fires swallows the `click` its release ends in (§ 3.2.). The hold is touch-only: right-click keeps the browser's image menu, since the header control is already this gesture's pointer equivalent.

The hold does not end there — **keep the finger down and drag, and everything from the held tile to the one under the finger takes the same action the hold took** (`REQUIREMENTS.md § 10.`). It fills in grid order, row by row, so the marks land in reading order rather than along the line the finger drew, and dragging back up releases the rows it retreats over. Reaching the top or bottom edge scrolls the grid under the finger, faster the further into the edge zone it goes, so picking a month's worth is one gesture rather than fifty taps. In selection mode the hold is live on every tile, so a sweep starting on a picked one clears instead of picks.

The 삭제 row is a `semantic-error` **label**, not a filled red button (§ 7.5.) — the bar is a surface of equals. The filled `destructive` button appears one step later, in the confirmation, which is where the consequence is actually stated.

## 7.11. Settings Row.

Full-width, min-height 56, `canvas` fill, 1px `hairline-soft` bottom border, padding `md`. Leading 18px `meta` icon, `title-md` `ink` label, trailing value in `body-sm` `meta` plus a 16px chevron. `:hover` `surface-soft`, `:active` `surface-strong`. Destructive rows (로그아웃, 세션 폐기) use `semantic-error` label with no icon colour change.

## 7.12. App Header.

Every screen renders its own header rather than inheriting one from the layout, because the trailing slot is screen-specific (chat search, month navigation).

| Property    | Value                                                                                                                                                                 |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Container   | Transparent — **no fill, no border, no shadow**. `sticky` top with `env(safe-area-inset-top)` as top padding                                                          |
| Height      | `--app-header-height` (56), below the safe-area padding. `--app-header-inset` is the two together                                                                     |
| Flow        | Cancels its own height with a negative bottom margin, so content starts at the top of the shell and passes under it                                                   |
| Title       | Optional. `title-md` `ink`, left-aligned on the 16px screen gutter (§ 4.3.), truncates on overflow. Fades out (200ms) once the shell's scroller has moved off the top |
| Padding     | `sm` (12) on the row, `2xs` (4) on the title                                                                                                                          |
| Slots       | Leading and trailing, rendered only when present — an empty slot MUST NOT reserve width                                                                               |
| Controls    | `icon-button-floating` (§ 7.1.) — the header itself is invisible, so each control carries its own surface                                                             |
| Hit testing | The strip is `pointer-events-none`; its children re-enable it, so content underneath stays tappable                                                                   |

`sticky`, not `fixed`: the header sits inside the shell's scroller, so it stays pinned to the top of the visual viewport without a positioning context of its own (§ 3.4.).

The header has no surface because it is not a region — it is a place to put controls. A filled bar would draw a line across the top of a screen whose content is meant to run to the edge, and would need a scroll-aware fill to look right once content passes beneath it. Transparent needs neither.

A screen whose content starts at the top offsets it by `--app-header-inset` itself. Chat does not: its messages are meant to run under the controls.

The title fades on scroll because it is the one part of the header with no surface behind it — the controls are `icon-button-floating` and stay legible over anything, while a bare title collides with the text scrolling under it. Screens that scroll inside their own container (chat's virtualizer) never move the shell's scroller, so their title does not fade — and does not need to.

The padding split follows from an `icon-button` already padding its 20px glyph by 12 inside a 44 target (§ 7.1.): `sm` on the row puts a bare title on the 16px gutter, and the button's own padding puts its glyph there too.

## 7.13. Install Banner.

iOS "add to home screen" guidance (`REQUIREMENTS.md § 7.`). Shown only in an iOS browser tab, dismissible, and never shown again once dismissed or once the app is installed.

| Property  | Value                                                                                                          |
| --------- | -------------------------------------------------------------------------------------------------------------- |
| Position  | Inside `BottomOverlay`, directly above the floating tab bar (§ 3.5.), `md` side gutters and an `xs` bottom gap |
| Container | The floating surface of § 3.5. — `glass`, 1px `hairline`, `rounded-lg`, `shadow-floating`                      |
| Content   | 18px `meta` share glyph, `body-sm` `body` copy, trailing `icon-button` dismiss                                 |
| Clearance | Measured into `--bottom-inset` with the tab bar, so its two-line wrap widens the spacer by itself              |

It leaves while the keyboard is up, like the tab bar and on the same collapse (§ 7.3.).

It is a banner rather than a `BottomSheet`: the guidance is optional and repeatable, and a modal interruption on arrival is the wrong weight for it.

## 7.14. Switch.

The settings-row control (`§ 7.11.`). 48×28 track, 24px thumb, `radius-full`.

| State     | Track                       | Thumb    |
| --------- | --------------------------- | -------- |
| Off       | `hairline-strong`           | `canvas` |
| Off hover | `meta-soft`                 | `canvas` |
| On        | `primary`                   | `canvas` |
| On hover  | `primary-hover`             | `canvas` |
| Disabled  | resting fill at 50% opacity | —        |

The thumb reads as raised through a 1px `hairline-strong` border, not a shadow — a switch is a resting control and `§ 8.2.` bans shadows on those. Focus is the standard 2px `primary` ring offset against `canvas` (`§ 3.2.`).

## 7.15. Haptics.

iOS exposes no Vibration API. The only way a web page reaches the Taptic engine is WebKit's native switch control (`<input type="checkbox" switch>`), which ticks when it toggles — and since iOS 26.5 it ticks **only for a real finger landing on it**, never for a scripted `click()`. `HapticTap` is therefore an invisible switch stretched over the control it decorates, not a function anything calls.

Consequences, all of them non-obvious:

| Rule                                                                                  | Reason                                                                                                                                                          |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Never mount `HapticTap` inside a `<button>`                                           | WebKit ends the tap in the native control; no click reaches JS at all, and the button stops firing                                                              |
| Beside a `<button>`, wrap both in a `relative` box and pass `forwardsTap`             | The overlay replays the tap on its sibling control, which is the only path left                                                                                 |
| Inside an `<a>`, mount it as the last child with no `forwardsTap`                     | The click still bubbles to the anchor, where `NextLink`'s own handler takes it                                                                                  |
| `haptic` on a `Link` is for internal routes only                                      | The anchor's native activation never runs, so an external href or modified click would go nowhere                                                               |
| Hide it with `opacity` alone — never `appearance-none`, never `display: none`         | A restyled control is no longer native and stops ticking; a hidden one cannot be tapped                                                                         |
| Put `group` on the wrapper and `group-active:` beside every `active:` on the control  | The tap lands on the overlay, so `:active` matches the wrapper and never the control (`§ 3.2.`)                                                                 |
| For motion, read `group-data-[pressed]:` and not `group-active:`                      | WebKit resolves the press inside the native switch; the overlay sets the attribute itself (§ 4.7.2.)                                                            |
| Repeat the control's `touch-action` on the overlay                                    | `touch-action` applies to the element a gesture starts on, and that is now the overlay                                                                          |
| Over a cell that **tiles** a scroller, pass `keepsScroll` — but never inside an `<a>` | The switch keeps a drag of its own, so the overlay has to become a `<label>`, and an anchor eats a label's activation (§ 7.15.1.)                               |
| The `group` wrapper follows the `haptic` prop alone — gate only the overlay on state  | A wrapper that comes and goes with `isSelected` or `disabled` swaps the element type at that position, so React remounts the control and drops the user's focus |
| A gesture threshold, a drag, a route change — none of these can tick                  | They are scripted triggers, which iOS 26.5 removed                                                                                                              |
| A release that travelled `GESTURE_SLOP` is a drag: no activation, no tick             | The overlay owns the whole tap, so it is the only place that can tell the two apart (§ 7.15.2.)                                                                 |

It renders on a coarse pointer only (`AGENTS.md § 4.2.`): a mouse gains nothing, and the overlay would swallow the ⌘-click the covered element still owes the pointer.

Where it fires is a product decision, not a technical one: **a committed change of state, and a selection among peers.** Saving, sending, deleting, toggling, switching tab or pack, picking a chip or a swatch, opening a sheet, stepping the calendar to the next month, discarding a staged attachment. Never dismissing a surface, cancelling out of one, or going back — a tick that fires on everything stops meaning anything.

Two boundaries that are easy to read the wrong way:

- The month stepper is **in**. It commits the same change the month swipe does, and the swipe itself is a drag threshold that can never tick — so without it the gesture the chevrons exist to replace (`§ 4.1.`) is the only way to turn the month silently.
- Removing a staged emoticon or photo is **in**, despite reading as a cancel. What it cancels is content already committed to the outgoing message, not a surface the user opened — the same act as deleting, which ticks.

### 7.15.1. `keepsScroll`, and why it is opt-in rather than the default.

A switch is thrown by sliding it, so WebKit tracks a drag on the control and claims that gesture before the scroller is consulted. Where the overlay has space around it nobody notices. Where the targets **tile** a surface — the day cells of the month grid, the cells of the emoticon grid, a `SettingsRow` or the name of a 이모티콘 관리 row, both of which fill the row they sit in, a 다가오는 일정 row, and the rows of a sheet (`ActionSheet`, the day's events), which are the whole surface a finger has to pull to dismiss it — the overlay is what every scrolling finger lands on: the emoticon panel would not scroll at all, the month grid, the settings list, the pack list and the upcoming list turned a drag into a tap, and the sheets could not be dragged shut from their own rows.

Two things that look like they should fix that and do not, both measured on device:

- **`touch-action: pan-y` on the overlay.** The control has already taken the gesture by the time the scroller is asked.
- **Cancelling the overlay's `pointerdown`.** The tick survives the cancel, exactly as it does under `keepsFocus` — so the drag WebKit keeps is not that event's default action, and there is nothing left on it to refuse.

`keepsScroll` is what works: the overlay becomes a `<label>` and the switch shrinks to a pixel beside it. A label keeps no gesture, so the drag stays with the surface, and its activation still toggles the switch. **26.5 accepts a real finger on a label** even though it rejects a scripted `label.click()` — a different code path, which is why the published workarounds all report the technique as dead.

It is still **opt-in, and must stay that way.** Promoted to the default it silently kills the tick on `Link`, where the overlay is mounted inside the `<a>` rather than beside it: the anchor's own activation takes the click, the label's never runs, and the switch is never toggled. The tab bar is the visible casualty. So the rule is by host, not by taste — `keepsScroll` for a cell that tiles a scroller, the switch itself everywhere else, and never inside an anchor.

Driving the scroll from JS on `pointermove`, momentum included, is what would be left if the label ever stopped working. It is not worth a tick.

### 7.15.2. A drag is not a tap, and `HapticTap` is where that is decided.

A finger that travels and then lifts has not tapped anything. The platform mostly agrees — once a scroll starts, WebKit sends `pointercancel` and no `click` follows — but the overlay is exactly the case where it does not: the switch claims the gesture before the scroller is consulted (§ 7.15.1.), so the page never scrolls, nothing is cancelled, and the release arrives as an ordinary click on whatever the finger began on.

So the overlay measures its own gesture. `pointerdown` records the origin, `pointermove` raises a flag once the finger has travelled `GESTURE_SLOP` — the same distance the reply pull, the month swipe and the long press all disarm at (`shared/lib/gesture.ts`), so a drag cannot mean one thing to one gesture and another to the next — and the `click` that follows a raised flag is spent rather than delivered:

- `preventDefault()` **silences the tick.** The overlay's default action is the toggle and the toggle is the only thing that ticks, so refusing it is the only way to stay quiet. A drag was never a committed change of state, which is the bar the tick answers to (§ 7.15.).
- `stopPropagation()` **stops the navigation** for the one host whose click travels to an ancestor rather than a sibling. Inside an `<a>` nothing else stands between the drag and the route change; beside a `<button>` the forward is simply not made.

This is **not** opt-in, and unlike `keepsScroll` it has no host it can break: it changes no markup, only which releases count. The surfaces that already do this for themselves — the month grid's `onClickCapture`, the long press's — keep doing it, and agreeing twice costs nothing.

One thing it does give up: **sliding a `Switch` no longer toggles it.** The visible track is Radix's `<button>`, which only ever flipped because the overlay forwarded the click the slide ended in — so past 8px that slide now does nothing. Tapping is unaffected, and a finger crossing a row on its way down the list no longer flips the toggle it passes over, which is the trade this is worth.

# 8. Rules.

## 8.1. Do.

- Reference colours only through Tailwind token utilities (`bg-canvas`, `text-ink`) or `var(--color-*)`.
- Start every interactive component's resting fill at `canvas` or `surface-soft` (§ 4.1.6.).
- Define all four states (`:hover`, `:active`, `:disabled`, `:focus-visible`) on every interactive variant (§ 3.2.) — the composer field is the only element exempt from the focus ring (§ 6.6.).
- Give every control a ≥44×44 tap target; pad the hit area rather than enlarging the glyph (§ 3.2.).
- Use `Container` for width; obtain the shell width from `--container-app` (§ 3.3.).
- Use 1px `hairline` as the default elevation; reserve shadows for floating surfaces (§ 4.5.).
- Use `100dvh` and `env(safe-area-inset-*)` for any full-height or edge-anchored surface (§ 3.3.).
- Trigger input error styling through `aria-invalid="true"` (§ 7.2.).
- Use `lucide-react` at `1.75` stroke for all iconography (§ 4.6.).
- Keep hex literals out of TSX entirely; the only permitted literals are inside CSS filter functions, and each MUST carry a comment marking the waiver.

## 8.2. Don't.

- No raw Tailwind palette utilities (`bg-white`, `text-gray-500`, `border-zinc-200`) — they are removed from the build by `--color-*: initial` and MUST NOT be reintroduced (§ 4.).
- No pure `#ffffff` as a page background; `canvas` is warm paper. The only white in the system is `bubble-theirs` (§ 4.1.1.).
- No second accent hue. `semantic-error` is not an accent — it is confined to error and destructive roles (§ 4.1.5.).
- No `primary` on non-interactive decoration, and no `primary` fill behind the active tab item (§ 7.3.).
- No shadow on bubbles, list rows, or any resting surface (§ 4.5.).
- No gradients, glass blur, or glow (§ 2.2.).
- No Kakao yellow, Kakao sky-blue, or saturated pink anywhere (§ 2.2.).
- No emoji used as interface iconography (§ 4.6.).
- No serif, no rounded display faces, no negative letter-spacing (§ 4.2.).
- No viewport-width layout branching, and never swap `BottomSheet` for `Modal` by width (§ 3.1.).
- No composed overlays at the call site — `Dialog` and `Drawer` primitives are used only inside `@/shared/ui` (`AGENTS.md § 2.4.`).
- No `100vh` (§ 3.3.).
- No fifth surface tier, and no `surface-strong` / `surface-pressed` as a resting fill (§ 4.1.6.).
- No stock illustrations or mascot art in empty states (§ 7.6.).
- No `:focus` rings on mouse click — `:focus-visible` only (§ 3.2.).
- No hardcoded `max-w-*` in screen code (§ 3.3.).

# 9. Known Gaps.

| Gap                     | Recommendation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dark palette            | Deferred (§ 5.4.). Hand-tune; keep the warm bias; drop shadows to `none`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ~~Event colour set~~    | **Closed** — see § 4.1.7.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Emoticon picker chrome  | Panel height is `--emoticon-panel-height` (`theme.css`), `min(352px, 50% of --viewport-height)` — proportional so a short device keeps a readable message column, capped so a tall one does not hand the panel half the screen, never `vh` (§ 3.4.), and the cap in `px` rather than `rem`: an enlarged default font size scales `rem` and not the viewport, which let the cap win the `min()` and overrun the shell. Pack tab-bar geometry and grid density still unspecified. Assets are now user-authored (`REQUIREMENTS.md § 13.`), so the grid must hold arbitrary aspect ratios — a fixed square cell with the still `object-contain` inside it, rather than a ratio taken from the art |
| ~~Motion~~              | **Closed** — see § 4.7. Five durations and three curves; route transitions are § 4.7.1., the press is § 4.7.2. Still unstyled against it: the search flash (§ 6.8.) and the bottom sheet's own enter/exit, which Vaul times internally                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Image viewer pinch-zoom | Bounds unspecified. Swiping between attachments is settled — native scroll snapping, which needs no threshold                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
