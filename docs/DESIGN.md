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

| Rule                                                                                                                                                                                              | Reason                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Every interactive element defines `:hover`, `:active`, `:focus-visible`, and `:disabled` (§ 7.1.)                                                                                                 | Desktop with only a rest state reads as a broken web page. One exception: the composer field (§ 6.6.)                                                                                                                    |
| Tailwind `hover:` is used directly — it already resolves under `@media (hover: hover)`                                                                                                            | No hover state sticks after a tap on iOS                                                                                                                                                                                 |
| Minimum tap target 44×44 on every control                                                                                                                                                         | WCAG 2.5.5; this is a touch-primary product, so unlike a desktop-first system there is no 36px tier                                                                                                                      |
| Visual size may be smaller than the tap target — pad the hit area, do not inflate the glyph                                                                                                       | A 44px-wide icon glyph looks clumsy; a 20px glyph in a 44px target does not                                                                                                                                              |
| `:focus-visible`, never `:focus`                                                                                                                                                                  | No focus ring on mouse click                                                                                                                                                                                             |
| Long-press actions MUST have a pointer equivalent (right-click or a hover-revealed control)                                                                                                       | Long-press does not exist with a mouse                                                                                                                                                                                   |
| A long-press target suppresses the browser's own hold gestures under `@media (pointer: coarse)` — `select-none` and `-webkit-touch-callout: none`, and `draggable={false}` on any image inside it | Otherwise the hold starts a selection drag or an image drag first, and the sheet opens behind a gesture the page has already lost. A fine pointer keeps all of them, since it opens the sheet from `contextmenu` instead |

## 3.3. App Shell.

| Property          | Value                                                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Max width         | `576px` — token `--container-app`                                                                                                                                  |
| Bar heights       | `--tab-bar-height` and `--app-header-height`, both `56px`. Declared outside `@theme` because a screen may read them back through `calc()` rather than as a utility |
| Narrow max width  | `448px` — token `--container-app-narrow`, `Container size="sm"`. Single-column entry screens (login) only                                                          |
| Alignment         | Horizontally centered, full height                                                                                                                                 |
| Shell background  | `canvas` (or `chat-canvas` on the chat screen)                                                                                                                     |
| Outside the shell | `backdrop` — one step deeper than `canvas`, so the shell reads as a held device on desktop                                                                         |
| Fixed children    | None. The shell itself is the one `fixed` element (§ 3.4.); the header and the bars float inside it (§ 3.5.)                                                       |
| Safe areas        | `env(safe-area-inset-bottom)` on the tab bar, `env(safe-area-inset-top)` on the header                                                                             |
| Viewport height   | `--viewport-height` (§ 3.4.), falling back to `100dvh` before hydration. Never `100vh`                                                                             |

576px, not a tablet 768px: at 768 a 72%-width bubble spans 550px, which forces long lines and breaks the chat rhythm; the four tab-bar items also drift apart to the point of reading as a desktop nav. Screens MUST obtain this width from `Container`, never by hardcoding `max-w-*`.

## 3.4. Visual Viewport.

The shell is sized to the **visual viewport**, not the layout viewport. `VisualViewportSync` mirrors `visualViewport.height` and `visualViewport.offsetTop` onto the root element as `--viewport-height` and `--viewport-top`; the `(main)` layout is a single `fixed inset-0` box of that height. The header sits at its top, the composer and tab bar at its bottom, so all three stay pinned to what the user can actually see while the keyboard is up.

| Rule                | Value                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Shell               | `fixed`, `top: var(--viewport-top, 0px)`, `height: var(--viewport-height, 100dvh)` — the only element the keyboard moves |
| Document scroll     | Forbidden. `html, body` are `h-full overflow-hidden overscroll-none`                                                     |
| Screen scroll       | Every screen scrolls inside the shell's `#app-scroll` container, or inside its own (chat's virtualizer, login's column)  |
| `interactiveWidget` | `resizes-content`, kept as a Chromium-side fallback only. WebKit ignores it, so nothing may depend on it                 |
| Synced offsets      | `height` and `offsetTop` only. Zooming is off (`maximumScale: 1`), so the left/right offsets never leave `0`             |

Why the document must not scroll: a document taller than the visual viewport is exactly what lets WebKit pan the page to reveal the focused field, and that pan carries the header off the top of the visual viewport. Sizing the shell to the visual viewport leaves nothing to pan.

Why not `interactive-widget=resizes-content` alone: it is Chromium 108+ and Firefox 132+ only. WebKit does not implement it, so on iOS — the platform this app is installed on — it is inert. It stays in the viewport metadata because it costs nothing and keeps Chromium correct even if the script never runs.

`env(safe-area-inset-bottom)` is **not** a keyboard inset. It reports the home indicator and does not change when the keyboard opens. The Chromium-only `env(keyboard-inset-height)` does, but it requires the VirtualKeyboard API and does not exist in WebKit, which is why the height comes from script.

## 3.5. Floating Bars.

The header and the tab bar do not sit in the column's flow — they float over it, and content passes underneath.

| Rule        | Value                                                                                                                         |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Tab bar     | A pill inset from the shell's bottom edge by `--bar-float-gap` (12) plus `env(safe-area-inset-bottom)`, and by `md` each side |
| Header      | A transparent strip pinned to the top of the shell. It has no surface — only the controls inside it are visible (§ 7.12.)     |
| Surface     | The `glass` utility (`canvas/75` + `backdrop-blur-lg`), 1px `hairline`, `shadow-floating`. Never spelled out at a call site   |
| Clearance   | `BottomOverlay` measures the bars into `--bottom-inset`, which the shell's scroller takes as bottom padding                   |
| Hit testing | The overlay is `pointer-events-none`; each visible surface re-enables it, so content underneath stays tappable                |

The clearance is measured rather than summed from `--tab-bar-height`: the bars come and go with the keyboard, and the install banner's copy wraps to two lines on a narrow viewport, so no constant is right. It is `0px` while nothing is up, so the scroller's padding needs no branch.

The clearance is the scroller's own padding, so a screen whose background is not `canvas` — chat's `chat-canvas` — MUST extend it under the bars with `pb-(--bottom-inset)` and a matching negative bottom margin. A child's background stops at its parent's content box, so without it the strip behind the bars falls back to the shell's `canvas` and the blur has nothing to blur.

Padding, not a hard stop: mid-scroll the content genuinely passes under the bars — that is the effect — and the padding only guarantees that the _last_ row can still be scrolled clear of them.

### 3.5.1. Full-screen overlays.

A screen-owned overlay that must cover the bars — the media viewer (§ 7.10.), the photo editor — renders through `ShellOverlay` into `#app-shell`, the shell column itself. It stays `absolute inset-0`, so `AGENTS.md § 4.4.` still holds; what the portal changes is which box `inset-0` resolves against.

A larger `z-index` is not an alternative. The bars are siblings of the scroller, not of the screen inside it, so an overlay left in the screen's subtree cannot outrank them from there — and being inside the scroller it would also stop at the clearance padding, leaving the tab bar sitting on top of it.

The surface is a translucent `canvas` over a blur, not a solid fill. This is an imitation of the platform's floating material, deliberately a plain one: no specular edge, no dynamic tint, no refraction. It is defined once as the `glass` utility in `globals.css` — every floating surface (both bars, the install banner, `icon-button-floating`) uses it, so they cannot drift apart.

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
| `:active`         | `scale-[0.96]`                                                                                    |
| Tap target        | 44 high including padding                                                                         |

The count variant recolours to `primary` rather than adding a separate badge element: a badge on a floating pill stacks two elevated shapes in the busiest corner of the screen.

## 6.8. Search.

| Element         | Rule                                                                                                                             |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Result row      | `canvas` fill on `surface-soft` list, sender name (`title-sm`), matched line (`body-sm`, 2-line clamp), date (`caption`, `meta`) |
| Match highlight | `search-hit` background, `ink` text, `rounded-xs`, computed client-side by string split                                          |
| Jump target     | On arrival the bubble flashes `primary-tint` behind its fill for 1.5s, then fades over 300ms                                     |
| Return control  | The § 6.7. scroll-to-bottom pill — same component, no search-specific variant                                                    |
| Empty state     | § 7.6.                                                                                                                           |

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

`icon-button` uses `ring-2 ring-primary` with no offset — the circle bounding box is the visual edge.

`icon-button-floating` is the only variant that sits over scrolling content (§ 3.5.), so it is the only one carrying a surface, a hairline, and `shadow-floating`. It is a translucent `canvas` with a blur behind it rather than a solid fill: solid reads as a detached chip, and the blur is what makes it read as floating above the content instead of punched out of it. This is a suggestion of the platform's material, not a reproduction of it — no specular edge, no dynamic tint.

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
| `:active` | `scale-[0.96]` on the icon-label stack                                                                      |
| Badge     | `unread` fill, `on-primary` `micro`, min 18×18, `rounded-full`, anchored to the icon's top-right; `99+` cap |

The bar is hidden while the on-screen keyboard is up: the shell shrinks to the visual viewport (§ 3.4.), so a bar left in flow would sit between the composer and the keys and eat 56px of an already short column. The install banner (§ 7.13.) goes with it, for the same reason.

The bar floats inside the shell (§ 3.5.), so it is neither `fixed` nor width-re-applying: the shell is already a `fixed` box of the visual viewport's height, and the bar is an absolute child of its column.

The active item is the one filled surface in the system's navigation: on a pill this narrow there is no room for an indicator bar underneath, and colour alone is too weak a signal against a translucent, blurred backdrop that changes with whatever scrolls behind it.

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

| Rule                                                                    | Reason                                               |
| ----------------------------------------------------------------------- | ---------------------------------------------------- |
| Drag handle at top: 48×6, `rounded-full`, `hairline-strong`             | The dismissal affordance                             |
| No close `X` alongside the handle                                       | Two redundant dismiss controls on the same edge      |
| Centered `title-md` `ink` header; optional `body-sm` `meta` description | Matches the reference implementation                 |
| A sheet whose rows already say what it is may hide the header           | A title over `사진/영상`/`카메라` only restates them |
| Body scrolls internally past `70dvh`; max height `90dvh - 12px`         | Sheet must never push past the viewport              |
| Focus ring inside the sheet is `ring-2 ring-primary ring-inset`         | `overflow-hidden` would crop an outward offset ring  |
| Never swapped for a `Modal` at any width                                | § 3.1.                                               |

`ActionSheet` is a bottom sheet whose body is a list of full-width `surface-soft` rows, `rounded-md`, `button-md` centered label with optional leading icon, following the chip ladder for states. Destructive rows use `semantic-error` text.

## 7.6. Empty State.

`surface-soft` card, `rounded-md`, 1px `hairline-soft`, padding `2xl`, centered. 24px `meta-soft` lucide glyph, `body-md` `meta` line, optional `button-secondary`. No illustrations — a two-person app has no room for mascot art, and stock illustration is the clearest tell of a template build.

## 7.7. Avatar.

`rounded-full`, `surface-strong` fallback fill with the nickname's first character in `title-sm` `meta`. Sizes: 36 (chat), 44 (settings row), 72 (profile edit). 1px `hairline` inset ring at every size so light photos do not bleed into `canvas`.

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

3-column grid, `2xs` (4px) gutters, square `object-cover` cells, `rounded-sm`. Month section header is `title-sm` `meta`, sticky under the app header with a `canvas` backdrop — its offset is `--app-header-inset`, not zero, because the header floats over the content (§ 7.12.). Viewer is full-bleed on `scrim` at 90% opacity with no chrome except a close `icon-button`, the position counter, and the save control.

| Element         | Rule                                                                                                                                                                              |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header controls | `icon-button-floating` only (§ 7.12.) — 사진 추가 and 선택, replaced by a single 취소 in selection mode. The count moves into the title (`2장 선택`)                              |
| Selected tile   | The image **scales to 90%** inside its cell; the cell itself does not move. A dim would read as the photograph being wrong, where the inset reads as the tile having been picked  |
| Selection mark  | 20px circle, top-right inset 4. Selected is a `primary` fill with an `on-primary` check; unselected is a `scrim/25` disc with a `canvas/80` hairline, so it reads on any photo    |
| Selection bar   | The floating surface of § 3.5. — `glass`, `rounded-full`, `hairline`, `shadow-floating` — over the tab bar, holding 저장 and 삭제 as equal `ghost` rows                           |
| Selected count  | Leads the selection bar as `button-md` `meta`, **not only the header title**: the title fades once content scrolls under it (§ 7.12.), which would take the running total with it |
| Video tile      | The play glyph and running-time chip of § 6.5., unchanged from the chat cell                                                                                                      |

Selection mode is entered from a control, never by long-press: a tap has to keep opening the viewer, and the long-press gesture is already spent on emoticon reordering (§ 13.5.) where the grid is not also a link.

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
| Clearance | Measured into `--bottom-inset` with the tab bar, so its two-line wrap widens the scroller's padding by itself  |

It is hidden while the keyboard is up, like the tab bar (§ 7.3.).

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
| Motion                  | Only the search flash (§ 6.8.), tab `scale-[0.96]`, and the emoticon panel's 200ms expand and pack slide (`REQUIREMENTS.md § 13.6.`) are specified; a shared duration/easing scale is needed before animation work                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Image viewer pinch-zoom | Bounds unspecified. Swiping between attachments is settled — native scroll snapping, which needs no threshold                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
