---
version: alpha
name: jandh
---

# 1. J&H Design System.

Design specification for a private two-person messaging, calendar, and photo app delivered as an iOS PWA.

## 1.1. Purpose.

Define design tokens, primitive UI components, theming behaviour, and authoring rules for J&H. Feature-level compositions (message list, calendar grid, library grid, settings rows) live with their owning slice, not in this document — but the chat surface is specified here (§ 6.) because it carries the product's entire visual identity.

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

| Rule                                                                                                                                                                                                               | Reason                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every interactive element defines `:hover`, `:active`, `:focus-visible`, and `:disabled` (§ 7.1.)                                                                                                                  | Desktop with only a rest state reads as a broken web page. Two elements drop `:hover` alone and both are recorded rather than permitted generally: the composer field (§ 6.6.), and the § 7.17. overlay, whose surface is the entire screen — a hover state there fires wherever the pointer already happened to be resting when it appeared, which reads as the overlay reacting to nothing. Neither drops `:active` or `:focus-visible` |
| Tailwind `hover:` is used directly — it already resolves under `@media (hover: hover)`                                                                                                                             | No hover state sticks after a tap on iOS                                                                                                                                                                                                                                                                                                                                                                                                  |
| Minimum tap target 44×44 on every control                                                                                                                                                                          | WCAG 2.5.5; this is a touch-primary product, so unlike a desktop-first system there is no 36px tier                                                                                                                                                                                                                                                                                                                                       |
| **One known exception, and it is recorded rather than permitted generally**: the § 6.5. voice waveform's hit box is 32px around a 24px graph                                                                       | `REQUIREMENTS.md § 9.3.` The `h-14` card has to hold the time as well, so 32px is the most padding available — the graph was not enlarged to reach it. Nothing else may cite this; a control that cannot reach 44 belongs in a taller container                                                                                                                                                                                           |
| Visual size may be smaller than the tap target — pad the hit area, do not inflate the glyph                                                                                                                        | A 44px-wide icon glyph looks clumsy; a 20px glyph in a 44px target does not                                                                                                                                                                                                                                                                                                                                                               |
| `:focus-visible`, never `:focus`                                                                                                                                                                                   | No focus ring on mouse click                                                                                                                                                                                                                                                                                                                                                                                                              |
| Long-press actions MUST have a pointer equivalent (right-click or a hover-revealed control)                                                                                                                        | Long-press does not exist with a mouse                                                                                                                                                                                                                                                                                                                                                                                                    |
| A long-press target suppresses the browser's own hold gestures under `@media (pointer: coarse)` — `select-none` and `-webkit-touch-callout: none`, and `draggable={false}` on any image inside it                  | Otherwise the hold starts a selection drag or an image drag first, and the sheet opens behind a gesture the page has already lost. A fine pointer keeps all of them, since it opens the sheet from `contextmenu` instead                                                                                                                                                                                                                  |
| `Link` (`shared/ui`) carries `-webkit-touch-callout: none` for every app route, and a link whose text is chrome rather than content adds `select-none` — the tab bar (§ 7.3.) does both                            | iOS's hold-to-preview raises a card of a screen the user is one tap from anyway, and it is the same native gesture the row above has to get out of the way. The property inherits, so declaring it on the anchor covers the glyph and label inside it                                                                                                                                                                                     |
| A hold that fires swallows the `click` its release ends in, and disarms whatever gesture shares the element with it                                                                                                | The finger is still down when the sheet opens and still owns the gesture: the release would tap what it is sitting on — the photo behind the sheet, or the tile the hold just selected — and on a bubble the § 6.10. pull would go on tracking behind the sheet and reply on release                                                                                                                                                      |
| The OS hold is surrendered on exactly one surface: the § 7.10. viewer                                                                                                                                              | Two menus over one photo is not a choice the user can read (`REQUIREMENTS.md § 8.11.`), so the app takes the hold wherever it has something of its own to offer and leaves the full-screen slide, which has nothing competing, to iOS                                                                                                                                                                                                     |
| The pointer equivalent may be the `contextmenu` half of the same gesture **or** a control elsewhere on the screen                                                                                                  | The library's hold-to-select has a header button (§ 7.10.), so taking right-click there would cost the browser's image menu for nothing                                                                                                                                                                                                                                                                                                   |
| Dropping files onto the chat room stages them, marked by a full-room overlay: a `2xs`-inset 2px dashed `primary` border over a `scrim/20` wash, with a `glass` pill reading `여기에 놓으면 첨부돼요` centred in it | `REQUIREMENTS.md § 9.2.` The one affordance that exists only with a pointer, so it is additive rather than a branch — a touch platform fires no drag events and simply never sees it. The overlay is `pointer-events-none` and never unmounted, or the cursor entering it reads as a `dragleave` and the drop flickers away                                                                                                               |

## 3.3. App Shell.

| Property          | Value                                                                                                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Max width         | `576px` — token `--container-app`                                                                                                                                                                            |
| Bar heights       | `--tab-bar-height` and `--app-header-height`, both `56px`. Declared outside `@theme` because a screen may read them back through `calc()` rather than as a utility                                           |
| Narrow max width  | `448px` — token `--container-app-narrow`, `Container size="sm"`. Single-column entry screens (login) only                                                                                                    |
| Alignment         | Horizontally centered, full height                                                                                                                                                                           |
| Shell background  | `canvas` (or `chat-canvas` on the chat screen, under an optional § 7.16. wallpaper)                                                                                                                          |
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
| Full-bleed photos   | Never a synced property — a fixed `480px` where the box _is_ the background, `100lvh` top-anchored and clipped where it sits behind a screen (§ 7.16.)                                      |

Why an overlay needs `--viewport-bottom`: it is portalled to `body`, and a `fixed` box resolves its offsets against the layout viewport, which the keyboard does not shrink on WebKit. `bottom: 0` therefore parks the sheet behind the keys the moment a field inside it takes focus — the shell moving is exactly what makes it look like the sheet was pushed out. `--viewport-bottom` is `documentElement.clientHeight - offsetTop - height`, the strip of layout viewport the visual viewport no longer covers. For the same reason vaul's own `repositionInputs` is off: it measures against `window.innerHeight` and stretches the sheet downwards instead of lifting it.

Why the height eases and `top` does not: WebKit reports `visualViewport.height` in a couple of coarse steps while the keyboard slides, so a raw height lands the composer in its new place in one jump — the keyboard glides, the input bar teleports. A 200ms ease turns that step into motion, and it matches the bars' collapse (§ 3.5.) so the two read as one. `top`, by contrast, is correcting a pan the user can already see; easing it would draw out the wrong position instead of hiding it, so it lands the same frame.

Why the document must not scroll: a document taller than the visual viewport is exactly what lets WebKit pan the page to reveal the focused field, and that pan carries the header off the top of the visual viewport. Sizing the shell to the visual viewport leaves nothing to pan.

Why not `interactive-widget=resizes-content` alone: it is Chromium 108+ and Firefox 132+ only. WebKit does not implement it, so on iOS — the platform this app is installed on — it is inert. It stays in the viewport metadata because it costs nothing and keeps Chromium correct even if the script never runs.

Why some things are not sized to the visual viewport after all: everything above follows the keyboard because it is chrome or content, and both have to stay reachable. A full-bleed photo is neither. Sized to the shell it is `object-cover` over a box that loses a third of its height, so every frame of the keyboard sliding re-crops and rescales it — a background visibly zooming behind a screen that is only making room for the keys. All three backgrounds of § 7.16. are covered by this, not the chat wallpaper alone.

Where a viewport unit is used at all it is `lvh`, and it is the **only** one that holds: the visual viewport is what the keyboard shrinks by definition, and `dvh` and the layout viewport (`documentElement.clientHeight`) both shrink under Chromium's `interactive-widget=resizes-content`, which this app sets. The large viewport is the one no keyboard moves on either engine. A synced property was tried for this and removed — it was `clientHeight`, so it was wrong on Chromium, and `lvh` needs no script, no fallback and nothing to keep in step.

What differs between the surfaces is only **which box takes the height**. Where the box _is_ the background it takes a fixed height directly (`480px`) and the photo inside is a plain `inset-0` — a box that stands for nothing but itself needs no viewport unit at all, and a fraction of the viewport made the band a different shape on every phone (§ 7.16.). Where the photo sits behind a screen that must keep following the keyboard, the photo alone is held at `100lvh` and anchored to the top, so the shrinking box in front simply **clips** it and the image does not move. That second case is measuring its own parent's resting height, so it stays a viewport unit; it also needs a clipping ancestor, or a box standing taller than its parent extends `#app-scroll`'s scroll range into a phantom scroll.

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

The clearance is measured rather than summed from `--tab-bar-height`: the bars come and go with the keyboard, and the install banner's copy wraps to two lines on a narrow viewport, so no constant is right.

The **seed** in `theme.css` is a constant all the same — `--tab-bar-height` plus `--bar-float-gap` plus `env(safe-area-inset-bottom)`, which is what the resting bar stack measures to. It is what the server render has to go on, and it MUST NOT be `0px`: chat's composer is anchored to `--bottom-inset` (§ 6.6.), so a zero seed paints the input bar flush with the shell's bottom edge and jumps it up a whole bar's height the frame `BottomOverlay`'s first `ResizeObserver` callback lands. On a cold start — a PWA launching into 채팅 — hydration is far enough behind the first paint for that jump to read as the bar sliding into place. Seeding it right costs nothing: the measurement resolves to the same number and rewrites the property with no visible change.

The clearance is a spacer inside `RouteTransition` and **MUST NOT** be moved back to the scroller's `pb-(--bottom-inset)`. `RouteTransition` is a `min-h-0 flex-1` item — it has to be, or chat's inner message scroller grows to its content instead of filling the shell — so it is clamped to the scroller's height and a taller screen overflows _out_ of it. End padding is only laid out after in-flow content, so it fell inside the clamped box and the overflow ran straight past it: every long screen (이모티콘 관리, 캘린더, 보관함) reported a `scrollHeight` short by the whole inset and stranded its last row under the bars. A sibling the overflow pushes down is what actually grows the scrollable area. It is `shrink-0` for the same reason — a default-shrinking item is squeezed back to nothing by the overflow.

A screen whose background is not `canvas` — chat's `chat-canvas` — MUST extend it under the bars with a negative bottom margin that cancels the spacer. A child's background stops at its own box, so without it the strip behind the bars falls back to the shell's `canvas` and shows as a band of the wrong colour through the translucent bar.

Clearance, not a hard stop: mid-scroll the content genuinely passes under the bars — that is the effect — and the spacer only guarantees that the _last_ row can still be scrolled clear of them.

### 3.5.1. Full-screen overlays.

A screen-owned overlay that must cover the bars — the media viewer (§ 7.10.), the photo editor — renders through `ShellOverlay` into `#app-shell`, the shell column itself. It stays `absolute inset-0`, so `AGENTS.md § 4.4.` still holds; what the portal changes is which box `inset-0` resolves against.

A larger `z-index` is not an alternative. The bars are siblings of the scroller, not of the screen inside it, so an overlay left in the screen's subtree cannot outrank them from there — and being inside the scroller it would also stop at the clearance padding, leaving the tab bar sitting on top of it.

**`ShellOverlay` resolves the shell through `useSyncExternalStore`, and the server snapshot is `null`.** A portal target can only be read in the browser, so the server renders nothing where the overlay stands — and a lazy `useState` reads the DOM on the **hydration** render, which mounts the portal in a position the server left empty and throws `Hydration failed` for the whole route. It surfaced on 보관함, whose drop overlay (`REQUIREMENTS.md § 9.2.`) is up from first paint rather than opened by a tap; every other overlay hid it by opening long after hydration. `useSyncExternalStore` renders the server's answer while hydrating and the real one immediately after, **before paint** — which is why it is not an effect either: an effect mounts the children a frame late, and anything measuring itself on mount would run against a box that does not exist yet.

The surface is a translucent `canvas` over a blur, not a solid fill. This is an imitation of the platform's floating material, deliberately a plain one: no specular edge, no dynamic tint, no refraction. It is defined once as the `glass` utility in `globals.css` — every floating surface (both bars, the install banner, `icon-button-floating`) uses it, so they cannot drift apart.

The blur is **conditional on nothing being captured** (§ 4.7.1.). A captured group is composited on its own, so a `backdrop-filter` inside one has no backdrop left to sample and collapses to a flat fill — which is why the blur was dropped for as long as route changes went through `<ViewTransition>`, and why it came back with the CSS animation that replaced it. `backdrop-filter` MUST NOT be reintroduced on a surface that can be captured, so anything that reinstates a view transition takes the blur out with it.

It is composed from Tailwind's own `backdrop-*` utilities and never from a hand-written `backdrop-filter` declaration — a raw one is dropped from the build, and the surface ships as a thin tint with no blur at all.

# 4. Tokens.

Color tokens live in the `@theme` block of `src/app/styles/theme.css`. Each `--color-{token}` generates `bg-{token}`, `text-{token}`, `border-{token}`, `ring-{token}`. `--color-*: initial` is declared first, removing Tailwind's default palette from the build — raw utilities like `bg-white` do not exist and MUST NOT be reintroduced.

## 4.1. Light Palette.

The system is built on warm neutrals. Every neutral carries a yellow/red bias; there are no cool greys.

### 4.1.1. Surfaces.

| Token             | Hex     | Use                                                                             |
| ----------------- | ------- | ------------------------------------------------------------------------------- |
| `backdrop`        | #E4DED4 | Area outside the app shell (desktop only) — § 3.3.                              |
| `canvas`          | #FBF9F6 | Page floor for calendar / library / settings                                    |
| `chat-canvas`     | #EFEAE2 | Page floor for the chat screen only — one step deeper so bubbles read as raised |
| `chat-scrim`      | #EFEAE2 | The wash over a § 7.16. chat wallpaper, at 45% — same hex, different job        |
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
| `on-scrim`         | #FFFFFF | Text/icon over `scrim` or over a photograph              |

**`on-primary` and `on-scrim` are the same white and must never be conflated.** `on-primary` is the foreground of a `primary` fill and inverts to near-black on dark (§ 5.4.); `on-scrim` is the **one colour token that does not change between themes**, because what sits under it is a fixed scrim or the user's own photograph, neither of which follows the theme. While the app was light-only the two were indistinguishable, so viewer chrome, the trimmer, the profile overlay and the cover title all borrowed `on-primary` — and every one of them turned black-on-black the moment dark shipped. The same applies to their companions: a wash over a scrim is `bg-on-scrim/15`, never `bg-canvas/15`.

### 4.1.4. Chat.

The signature surface. Bubble fills are the only place two adjacent fills are both near-value; the hairline on `bubble-theirs` is what separates it from `chat-canvas`.

| Token                   | Hex     | Use                                                                                                  |
| ----------------------- | ------- | ---------------------------------------------------------------------------------------------------- |
| `bubble-mine`           | #F6DCD2 | My message fill — a tint of `primary`, not Kakao yellow                                              |
| `bubble-mine-pressed`   | #EFCEC1 | `:active` / long-press feedback on my bubble                                                         |
| `bubble-theirs`         | #FFFFFF | Their message fill — the one pure white in the system                                                |
| `bubble-theirs-pressed` | #F4F1EC | `:active` / long-press feedback on their bubble                                                      |
| `bubble-ink`            | #1F1B17 | Text inside any bubble. Both fills are light — never inverts                                         |
| `chat-meta`             | #8D8375 | Timestamp and `읽음` on `chat-canvas`. **Not the sender name** — see below                           |
| `chat-sender`           | #6B6153 | Sender name above a `theirs` group                                                                   |
| `chat-pill`             | #DED6C9 | Date divider pill fill                                                                               |
| `chat-pill-pressed`     | #D2C9B9 | `:hover` / `:active` on a pill that is a link — the § 11.5. system notice alone                      |
| `chat-pill-ink`         | #6B6153 | Date divider pill text                                                                               |
| `unread`                | #B65C4E | The tab-bar unread badge (§ 7.3.). Same value as `primary`, separate token so it can diverge on dark |
| `search-hit`            | #F9E9C8 | Matched substring background in search results (§ 6.8.)                                              |

`bubble-mine` is a tint of the accent rather than a second hue: it keeps the palette at one chromatic family, and it makes "my voice" and "the app's voice" the same colour, which is the point of a two-person app.

**`chat-sender` and `chat-meta` were one token, and splitting them is the fix for a real defect.** At `chat-meta` on `chat-canvas` the sender name ran at **3.1:1** — below AA's 4.5:1 for 12px text, and it had been that way since § 6.3. was written. It could not be darkened while the clock shared the token: a name that reads is emphasis the name has earned, and the same value on a timestamp is a clock competing with the message. `chat-sender` clears AA at **5.1:1**; `chat-meta` keeps its tone for the things that genuinely are secondary. **Never point a sender name back at `chat-meta`** — the low contrast is the whole reason the second token exists.

**`--text-chat-name` is the size and `--color-chat-sender` is the colour, and they are deliberately not the same key.** Tailwind resolves `text-*` against both scales, so one name in both is an ambiguous utility.

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

| Token        | Size | Weight | Line-height | Tracking | Use                                           |
| ------------ | ---- | ------ | ----------- | -------- | --------------------------------------------- |
| `display-lg` | 26   | 700    | 1.35        | 0        | Screen title (rare — settings, search)        |
| `display-md` | 20   | 700    | 1.40        | 0        | Section heading, month label                  |
| `display-sm` | 18   | 600    | 1.45        | 0        | Sheet title, card title                       |
| `title-md`   | 16   | 600    | 1.45        | 0        | Header title, settings row label              |
| `title-sm`   | 14   | 600    | 1.45        | 0        | Sub-labels, list-section headers              |
| `body-lg`    | 17   | 400    | 1.65        | 0        | Long-form (event description)                 |
| `body-md`    | 15   | 400    | 1.60        | 0        | Default body                                  |
| `body-sm`    | 13   | 400    | 1.55        | 0        | Secondary copy, helper text                   |
| `chat-body`  | 15   | 400    | 1.45        | 0        | Bubble text — tighter leading than `body-md`  |
| `chat-name`  | 12   | 500    | 1.30        | 0        | Sender nickname above a group                 |
| `chat-time`  | 11   | 400    | 1.20        | 0        | Timestamp beside a bubble                     |
| `chat-badge` | 11   | 600    | 1.00        | 0        | Tab-bar unread badge, § 11.3.'s today numeral |
| `caption`    | 12   | 500    | 1.40        | 0        | Captions, counters, date pill                 |
| `micro`      | 11   | 600    | 1.30        | 0.2      | Badge text                                    |
| `button-md`  | 15   | 600    | 1.25        | 0        | Default button label                          |
| `button-sm`  | 13   | 500    | 1.25        | 0        | Chip / pill label                             |
| `tab-label`  | 10   | 500    | 1.20        | 0        | Bottom tab bar label                          |

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
| `sm`     | 8    | Small controls, library thumbnails     |
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

| Token                    | Value                            | Use                                                                                     |
| ------------------------ | -------------------------------- | --------------------------------------------------------------------------------------- |
| `--duration-press-in`    | 140ms                            | A finger landing — the bloom growing (§ 4.7.2.)                                         |
| `--duration-press-out`   | 520ms                            | A finger leaving — the bloom bouncing back, long enough for both crossings to be seen   |
| `--duration-state`       | 200ms                            | A committed state change — a toggle, a hover fill, the bars' collapse (§ 3.5., § 7.3.)  |
| `--duration-tab-travel`  | 600ms                            | The tab fill crossing the bar, and the icon/label crossfade that lands with it (§ 7.3.) |
| `--duration-route-enter` | 220ms                            | The arriving screen in a route change — the only one there is (§ 4.7.1.)                |
| `ease-press`             | `cubic-bezier(0.2, 0, 0, 1)`     | The press itself — no overshoot going in, or the control feels loose under the finger   |
| `ease-bloom`             | a `linear()` spring              | The release. The only curve in the system that crosses its resting value — twice        |
| `ease-route`             | `cubic-bezier(0.32, 0.72, 0, 1)` | Route motion — a longer tail, so the screen settles rather than stops                   |

There is deliberately **no exit duration**: nothing animates on the way out (§ 4.7.1.), so a token for it would only be something to reach for by mistake. An unresolved `var()` makes the whole `animation` shorthand fall back to `0s`, which is an animation that silently never plays.

### 4.7.1. Route transitions.

Route changes animate through a **plain CSS animation on the arriving screen** — `route-enter-forward` / `route-enter-back` in `globals.css`, applied by `RouteTransition` to the wrapper it puts around the screen inside the shell's scroller. There is no `<ViewTransition>` and no `experimental.viewTransition`; the long argument for why is at the end of this section, and it is a decision to leave alone.

A tab switch is a **24px directional slide** with a fade, over `--duration-route-enter` on `ease-route`. Direction follows the tab bar's own order: tapping a tab to the right of the current one brings the new screen in from the right, a tab to the left brings it in from the left. That order lives in `TAB_ROUTES` (`shared/config`) and both readers take it from there — the bar builds `TABS` from it and `RouteTransition` reads the slide direction from it, through the same `isUnderRoute` prefix rule. Two lists, or two copies of the matching rule, would let the fill land on one tab while the slide came from the other. Direction taken from **history** instead would put 보관함 on a different side depending on where the user came from, which is the one thing a slide must never do.

Only the **arriving** screen moves. There is no exit animation: the outgoing screen is simply gone, because the router has already replaced it by the time anything could animate it. That is the whole reason this is one keyframe set and one duration rather than the sequenced pair a view transition affords.

Navigation that resolves to the **same** tab does not animate — 설정 → 이모티콘 is a hierarchy, not a sideways move — and neither does anything off the bar entirely. It can take its own directional treatment later; widening this one is not how.

보관함's 사진 ⇄ 파일 ⇄ 음성 falls under that rule and is the one case where it is load-bearing rather than incidental. All three segments live under `/archive` (`REQUIREMENTS.md § 10.`), so `tabIndexOf` returns the same index for each and `directionBetween` answers `none` — **no slide, and nothing had to be added to arrange it**. That is the behaviour the segments want: they sit two chips apart on one screen, so sliding the whole screen sideways between them would claim a distance the eye can see is not there, and the direction would be arbitrary now that a third segment (음성) has arrived. If a segment switch is ever given motion, it belongs to the list that changes and not to the screen that contains it.

Three implementation details are load-bearing, and each has already been a bug:

- The wrapper is **keyed**, or React reuses the node and the animation never restarts after the first navigation. The key counts **animated arrivals**, not pathnames: keyed on the path, 이모티콘 팩 A → 팩 B remounts the whole screen — every `useState`, scroll offset and in-flight query thrown away — for an animation that does not even run there.
- `animation-fill-mode` is **`backwards`, never `both`**. A forwards fill leaves the `to` keyframe applied for good, and `translate: 0 0` is not `translate: none`: the wrapper stays a containing block for every `fixed` descendant beneath it, but only on the navigations that happened to animate, so anything positioned against it resolves differently after a tab switch than on a fresh load.
- The scroller carries **`overflow-x: clip`**. `overflow-x: visible` computes to `auto` next to `overflow-y: auto`, so the 24px translate would make `<main>` genuinely pannable sideways for the length of every navigation — `clip` and not `hidden`, for the reason § 6.1. gives.

Under `prefers-reduced-motion: reduce` both animations drop to a `0s` duration, which is an instant swap.

**Why not `<ViewTransition>`.** It was tried, in three arrangements, and every one of them cost the floating bars (§ 3.5.) something worse than a plain slide. The trap is that a view transition paints its snapshots in the **top layer**, which nothing on the page can reach above — not a `z-index`, not a `popover`. A bar left on the live page is painted straight over by the outgoing screen's snapshot. Capturing the bars so they ride the same layer fixes that and breaks two other things: a captured group is composited on its own, so a `backdrop-filter` inside it has no backdrop left to sample and collapses to a flat fill; and the bars' two snapshots are the same picture, composited with the UA's `mix-blend-mode: plus-lighter`, so two copies of a `canvas/75` surface sum past 1 and render as an opaque plate for the length of every navigation. Clipping the screen's snapshot out of the bar strip is not a third option — a captured element stops painting on the live page entirely, so the strip falls through to the shell's flat `canvas` and reads as a solid block.

The canvas background was part of the same knot: whichever of `html` / `body` carries one becomes the **canvas background**, which is drawn into every snapshot as a rectangular plate behind each captured group — invisible behind an opaque screen, glaring behind a bar whose box is mostly transparent padding around a rounded pill.

None of this applies to a CSS animation, because there are no snapshots. The bars are never captured, never composited apart, and never painted over: they sit outside the scroller and simply do not move. `body` keeps its `bg-backdrop`, and `glass` keeps its blur (§ 3.5.) — the blur is viable **because** nothing is captured, and reintroducing a capture takes it away again.

### 4.7.2. Press bloom.

A round control **grows** under the finger — `scale: 1.3` in over `--duration-press-in`, then **bounces** back to rest over `--duration-press-out` on `ease-bloom`. It is one utility, `press-bloom`, and it pins a resting `scale: 1`: from an unset `scale: none` WebKit refuses to interpolate and the control snaps to size instead of growing into it. The pressed scale reads from `--press-scale`, so a control can dial the swell without forking the utility.

The tab bar is the one caller that dials it, to `1.25`. Its bloom sits on the **glyph stack** and not the tab's anchor: the anchor is a quarter of the pill's width, and scaled it would drag its hover fill and focus ring a third of a column past the pill and over the tabs beside it — the active fill it once sprang with now travels behind the items (§ 7.3.) rather than riding it, so there is nothing left on the anchor that is worth swelling. The anchor keeps a plain `transition-colors` on `--duration-state` for that hover fill, which `press-bloom` used to carry for it. The pill is what caps the dial. The stack is 34px inside a 56px pill and grows to 42.5px here, and the chat tab's unread badge — 4px above the icon, and scaled with it — is what runs out first: it touches the pill's top edge at **1.333** and clears it by under 2px at 1.25. Above that the badge leaves the bar on every press. Note also that `scale: 1` makes every bloomed element a stacking context, so siblings paint in DOM order: a swelling control overlaps its later siblings from underneath, which only stays invisible while the swell is small.

The utility owns the control's whole `transition` shorthand, with a per-property timing list — the scale on the long overshoot, colour and opacity on `--duration-state`. `transition-property` is a single declaration, so a caller that adds `transition-colors` beside it silently drops one of the two. A caller that needs a property this list does not carry puts it on a **child** — that is what the tab bar's icon and label do (§ 7.3.). That is also why the bloom must be applied unconditionally rather than on a state branch: the send disc (§ 6.6.) flips `canSend` in the same click that sends, and a class removed there takes the resting `scale: 1` with it while the release is still running.

30% and not less **for the round controls**, over durations that are long for touch feedback. The bloom is carried by a 20px glyph and a 44px circle: 6% is a single pixel of travel and 110ms is over before the eye finds it — enough to measure, not enough to see. Both numbers are sized to the smallest thing wearing them, which is exactly why a wide control has to dial the scale down rather than take the default: the same 30% that is barely legible on a 44px circle is disfiguring on an 87px anchor.

The release is a **spring**, not an ease. `ease-bloom` is a `linear()` easing that crosses its resting value twice — the control shoots past its resting size to roughly 5% under it, comes back about 1% over, and settles. A `cubic-bezier` cannot express that: its output crosses the resting value at most once, so the most it can do is settle from one side. The spring is what turns the release from a transform ending into something with weight.

It stays a `transition`, not a keyframe animation, and that is the constraint the curve has to live inside. The press is driven by state — `:active`, `[data-pressed]` — and there is no CSS event for "released", so an animation would have nothing to fire on. `linear()` is what lets a transition carry a multi-crossing curve at all. Its stops are generated, not tuned by hand: nudging one produces a kink rather than a softer bounce, so the list is replaced whole or not at all.

It fires off four selectors and all four are needed. `:active` is the mouse. `.group:active` is a wrapper the pointer lands on directly. The `[data-pressed]` pair — the element's own and the descendant form — is the only one that fires **under a finger**, and it needs both because `HapticTap` marks its own parent: which of the two matches depends on whether the bloom sits on that parent or on a child of it. Every caller today is the second, the tab bar included since its bloom moved to the glyph stack; the self form stays for the first. It is the finger case because: wherever `HapticTap` is mounted, the tap lands on a native switch (§ 7.15.), and WebKit resolves that press inside the native control rather than propagating `:active` up to the wrapper — and on a control that cancels `pointerdown` to hold focus (the send button), cancelling the event suppresses `:active` outright. `HapticTap` therefore sets `data-pressed` on its own parent from `pointerdown` and clears it on up, cancel, leave, and unmount. Without that last one the tab bar strands a bloomed tab: it drops `haptic` off the tab it has just switched to, which unmounts the overlay mid-press. The unmount path has to read the parent captured on `pointerdown`, not a ref: React detaches refs before a passive cleanup runs, and `useIsCoarsePointer` reports `false` on the first render, so the overlay is not even in the tree when a mount effect would try to find it.

It grows rather than shrinks on purpose. A control that recedes reads as being pushed away, which is a button pretending to be a physical key; the platform's own glass controls swell toward the finger instead, as if the material were answering the touch. There is no perspective, no rotation, and no shadow change — those are the parts of that language that read as a 3D toy on a flat interface. Scale and the existing fill change carry it.

Where it applies: the tab bar's glyph stack (§ 7.3.), every `icon-button` (§ 7.1.), and the composer's send disc (§ 6.6.). A circle 44px across sits entirely under the finger, so its fill change is invisible at the moment it matters and the scale is the only feedback the user can actually see. Rectangular buttons and chips (§ 7.1.) keep the fill change alone — they are wide enough that their edges stay in view.

# 5. Theming.

## 5.1. State Model.

Three states — `system`, `light`, `dark` — and **`system` is the default**. A theme setting that ignores the phone's own until it is touched is a setting the user has to find in order to get what they already asked the OS for. `ThemeProvider` wraps `next-themes` with `attribute="class"` and `enableSystem`; `ThemeSettingsRow` (§ 12.) is the segmented control. The choice is **per device**, like the 알림 row and unlike 입력 중 표시 — `next-themes` keeps it in `localStorage`, so it describes this browser rather than the account.

`next-themes` injects a blocking inline script that writes the class before first paint, which is what keeps a dark launch from flashing the light canvas. That script is also why `<html>` carries `suppressHydrationWarning`; removing either reintroduces the flash.

## 5.2. CSS Mechanism.

`@custom-variant dark (&:where(.dark, .dark *))` in `globals.css`. Dark values rebind the **same** custom property names inside `.dark` — there is no `bg-canvas-dark` utility, `bg-canvas` swaps automatically. The `.dark` block in `theme.css` carries the full palette; no `dark:` utility appears anywhere in `src/`, and none should.

## 5.3. Dark Readiness Rules.

These are binding now, even though no dark value exists yet.

| Rule                                                                                       | Reason                                                                     |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Never hardcode a hex or a raw Tailwind colour utility — always a semantic token            | Every such site becomes a manual `dark:` override later                    |
| Never assume a token is light or dark (e.g. `text-ink` over `bg-canvas`, not `text-black`) | Pairs stay valid across themes only if expressed as token pairs            |
| `bubble-ink` is a single token shared by both bubble fills                                 | On dark, both fills darken together; a per-fill text colour would fork     |
| Shadows are authored as `rgb(ink / α)`-derived values                                      | Dark drops shadows entirely (they read as smudge) — see § 5.4. for how     |
| No light tint may be reused directly on a dark canvas                                      | Tints are re-derived, not inverted                                         |
| A foreground over `scrim` or a photo takes `on-scrim`, never `on-primary` (§ 4.1.3.)       | The surface under it does not follow the theme, so the foreground must not |

## 5.4. Dark Palette.

Hand-tuned, never arithmetically inverted. **No neutral is `#000000`** — every one keeps the warm bias, which is what makes this the same product with the lights off. `scrim` in particular stays off black: it is used at an opacity over content, and a pure black scrim on a warm dark canvas reads as a hole rather than a dimming.

| Group    | What moved, and why                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Surfaces | The § 4.1.6. ladder still ascends, it just ascends towards light. `chat-canvas` stays one step deeper than `canvas` — the direction reverses, the relationship does not. `backdrop` alone goes the other way: it is what the shell is an object _on_                                                                                                                                                                  |
| Accent   | `primary` lifts to `#D2795F` and **`on-primary` inverts to dark**. The light value fails AA as a link on a dark canvas, and lifting it far enough to pass then fails white text on its own fill. One of the two had to move, and the fill is the smaller surface                                                                                                                                                      |
| Chat     | `bubble-ink` inverts **once, for both fills**, as § 5.3. requires. `bubble-theirs` has no dark counterpart to "the one pure white" — what carries over is that it is the neutral fill and `bubble-mine` the chromatic one. **`chat-sender` is now lighter than `chat-meta`**, where light made it darker: the split exists so the sender name clears AA (§ 4.1.4.), and on this floor that means moving the other way |
| Tints    | `primary-tint` and `search-hit` are re-derived against the dark canvas, never the light tints reused. A light tint on a dark floor is a bright plate, not a low-emphasis accent                                                                                                                                                                                                                                       |
| Shadows  | Dropped entirely — see below. Elevation is carried by the surface ladder alone: a shadow derived from `ink` is a light smear on a dark floor, and one derived from black is invisible on it                                                                                                                                                                                                                           |

**Shadows cannot be dropped the way every colour is swapped, and the obvious attempt fails silently.** Tailwind v4 **inlines** a `@theme` shadow into the utility it generates — `.shadow-raised` emits `--tw-shadow: 0 1px 2px #1f1b170a`, not `var(--shadow-raised)` — where a colour emits `var(--color-*)`. Rebinding `--shadow-raised` inside `.dark` therefore changes nothing at all and the light shadow keeps painting, with no error anywhere. The removal is a utility override instead, `.dark .shadow-raised, .dark .shadow-floating { --tw-shadow: 0 0 #0000 }`, using the value `shadow-none` itself compiles to. **Any new `--shadow-*` token needs its own line there**; the `.dark` block will not do it.

Every foreground/background pair in use clears **WCAG AA** — the tightest are `on-primary` on `primary` at 5.55:1 and `error` on `canvas` at 5.56:1, and `chat-sender` on `chat-canvas` reaches 9.87:1 against the 4.5 floor § 4.1.4. was written for.

**One platform limit, deliberately unfixed:** `app/manifest.ts` carries a single `background_color` / `theme_color` with no media variant, so the PWA launch splash is light even for a dark install. `themeColor` in `app/layout.tsx` _is_ media-matched and covers the iOS status bar and Android chrome.

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

## 6.2.1. Withdrawn Bubble.

A message its sender deleted keeps its place in the timeline and reads `삭제된 메시지예요` (`REQUIREMENTS.md § 8.13.`). Both participants see it, the deleter included.

| Property   | Value                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| Shape      | The § 6.2. bubble, unchanged — same fill, same side, same notch. The timeline still has to read as a conversation         |
| Typography | `chat-body` at `bubble-ink/55`, italic, `select-none`. It is a note _about_ a message rather than one, so it gives up ink |
| Contents   | The line and nothing else — no quote, no attachment, no emoticon, no link card. The server sends none of them             |
| Beside it  | The § 6.3. timestamp only. Never 읽음 (it says nothing that could have been read) and never 수정됨                        |
| Gestures   | None. No action sheet, no reply pull, no hover controls — there is nothing left to reply to, copy, share, edit or delete  |
| Reachable  | A quote of it still jumps here, and the § 6.8. flash still lands — the tombstone is where the message was                 |

The copy is `해요체`, matching the § 6.10. quote's. KakaoTalk's `삭제된 메시지입니다` would be the one `합쇼체` string in the app.

## 6.3. Grouping.

A group is consecutive messages from one sender within the same clock minute.

| Element     | Rule                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Avatar      | `theirs` only, 36×36 `rounded-full`, rendered on the first bubble of the group; subsequent bubbles indent by the avatar width + `xs`                                                                                                                                                                                                                                                        |
| Sender name | `theirs` only, `chat-name` in **`chat-sender`** (§ 4.1.4. — never `chat-meta`), above the first bubble                                                                                                                                                                                                                                                                                      |
| Timestamp   | `chat-time` in `chat-meta`, on the **last** bubble of the group, on the outer side (left of `mine`, right of `theirs`), bottom-aligned, in a **fixed 56px slot** — it is in flow beside the bubble, so its width is width the text does not get to wrap in, and a slot that sized itself to `오후 12:34` or `오전 9:05` would move the wrap point with the clock (`REQUIREMENTS.md § 8.3.`) |
| 읽음        | `mine` only, `chat-time` in `chat-meta`, directly above the timestamp — on the **newest** message the other participant has read, and on that one alone. Nothing marks an unread message (`REQUIREMENTS.md § 8.8.`)                                                                                                                                                                         |
| 수정됨      | `chat-time` in `chat-meta`, **above 읽음**, on any message whose sender has corrected it (`REQUIREMENTS.md § 8.13.`). Either sender's, unlike the two rules above it                                                                                                                                                                                                                        |

`mine` groups render no avatar and no name — in a two-person conversation, right-alignment is unambiguous identity.

The three rows above share **one** `flex-col` in the fixed 56px slot, bottom-aligned, and a bubble may carry any combination of them — the column appears for `수정됨` alone on a bubble that is neither its group's last nor the read mark. Keeping them in one stack is what lets `estimateRowHeight` price the lot as `n × chat-time` without measuring a string it cannot see.

## 6.4. Date Divider.

Centered `chat-pill` pill, `caption` in `chat-pill-ink`, padding `4px 12px`, `rounded-full`. Copy: `오늘`, `어제`, then `2026년 8월 3일 월요일`.

**The divider is a list row and nothing else — there is no floating day indicator.** One shipped: the same pill as an overlay under the § 7.12. header, naming the day of the topmost visible row while the list moved. It was removed because it reads as a label stuck to the screen rather than to the conversation, and it stands over the top of the message column, which is the § 6.10. swipe target and the § 8.11. hold target alike. Which day the reader is in is what the dividers themselves say, and scrolling past one is how the reader gets there. Do not reintroduce it.

## 6.5. Non-Text Messages.

| Type       | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Media      | No bubble. `rounded-md`, 220px wide, `object-cover`, 1px `hairline` inset ring. One attachment keeps its own aspect ratio; two or more take a square-cell grid (2 and 4 in two columns, everything else in three) at the same width, so bubbles of one and of nine align in the column. A video tile carries a play glyph and its running time. While uploading, the bubble dims to 60% (below) and a `primary` progress bar fills its bottom edge. Timestamp and 읽음 keep their § 6.3. positions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| File       | No bubble. `REQUIREMENTS.md § 9.1.`'s attachment for anything the app cannot draw: a **fixed 56px (`h-14`)** card at the same 220px width, `rounded-md` on `surface-soft` with a 1px `hairline` border, holding a 32px `primary-tint` glyph tile, the file name in `body-sm` truncated to one line, and its size in `caption`/`meta` beneath. The height is fixed rather than derived from the name precisely so § 8.3.'s estimate is exact for a bubble whose text it cannot measure. Several in one bubble stack with a `2xs` gap. A tap **saves** — there is no inline view to open — and a card whose upload has not registered yet is inert. Uploading dims and fills exactly as Media does. **This is `FileCard` in `shared/ui`, and 보관함's 파일 list (§ 7.10.1.) renders the same component** — a widget cannot import a sibling widget (`REQUIREMENTS.md § 2.`), and copied, the two rows would drift apart on the next change to either                                                                                                                                         |
| Voice      | No bubble — `VoicePlayer` draws its own fill, because `isMine` is the only input that chooses it and nothing above the row knows what shape a voice row wants. A **fixed 56px (`h-14`)** card at the same 220px width, `rounded-bubble`, `bubble-mine` / `bubble-theirs` over 1px `hairline`; the group's first bubble gets its notch corner from the row, passed down as `className`. Inside: a 36px `primary` disc in a 44 target (play/pause, press bloom on the disc per § 4.7.2.), then a column holding the waveform with the time above it. The height is fixed for the File row's reason — a waveform has no intrinsic height, so `REQUIREMENTS.md § 8.3.`'s estimate has nothing to derive one from. Uploading dims to 60% as Media does, with no progress bar — but **stays playable**, unlike every other attachment: `REQUIREMENTS.md § 9.3.` hands the recorder's local blob to the cell's `originalUrl`, so this is the one kind that has a source before it has an object. Do not "restore consistency" by inerting it; the dimming is the whole of what pending means here |
| Emoticon   | No bubble, no border, no background. Max 140×140, box reserved from the item's stored `width`/`height` (§ 6.1.). One image slot, animated or not (`REQUIREMENTS.md § 13.2.`), so an animated file simply plays; a tap remounts it to restart it and is the only thing that plays its audio (`REQUIREMENTS.md § 13.6.`). Timestamp and 읽음 keep their § 6.3. positions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| System     | Calendar-change notice (`REQUIREMENTS.md § 11.5.`). Centered `chat-pill` pill, `caption` in `chat-pill-ink`, padding `4px 12px`, `rounded-full` — the § 6.4. date-divider treatment, so system notices read as timeline furniture rather than as someone speaking. No avatar, no timestamp, no 읽음. Tappable, `:hover` `bg-surface-strong`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Failed     | `semantic-error` retry affordance to the outer side of the bubble, with a `meta` cancel beneath it; bubble itself renders at 60% opacity                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Optimistic | Bubble at 60% opacity until the server echo arrives; no spinner                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

## 6.6. Composer.

| Property        | Value                                                                                                                                                                                                                                                                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Container       | The tab bar's pill (§ 7.3.): `glass`, 1px `hairline`, `shadow-floating`, radius `--tab-bar-height / 2`, `2xs` inner padding. Anchored to `--bottom-inset`, so it floats directly above the bar stack (§ 3.5.)                                                                                                                                                                  |
| Padding         | `md` each side, `xs` below, matching the tab bar's inset. The tab bar below it already owns `env(safe-area-inset-bottom)`                                                                                                                                                                                                                                                      |
| Row             | One row, bottom-aligned: attach, field, right control. The field grows upward and the controls stay level with its last line                                                                                                                                                                                                                                                   |
| Field           | No shape of its own — the pill is the surface. No fill, no border, square (radius 0), padding `8px 4px`, `body-md`, placeholder `메시지 입력`, auto-grow to 5 lines then scroll internally                                                                                                                                                                                     |
| Field focus     | No ring. The caret is the focus signal — the one § 3.2. exception, see below                                                                                                                                                                                                                                                                                                   |
| Left control    | `+` (attach) — 20px glyph in a 44×44 target                                                                                                                                                                                                                                                                                                                                    |
| Right controls  | Emoticon toggle (20px / 44×44) and send, both always present. Send sits **beside** the toggle rather than replacing it, because an emoticon can be staged alongside a typed line (`REQUIREMENTS.md § 13.6.`)                                                                                                                                                                   |
| Send button     | `primary` fill, `on-primary` glyph, 36×36 visual in a 44×44 target, `rounded-full`. Disabled with a `primary-disabled` fill while there is nothing to send — never unmounted, see below                                                                                                                                                                                        |
| Keyboard        | The shell is sized to the visual viewport (§ 3.4.), which carries the composer up. Never `100vh` math                                                                                                                                                                                                                                                                          |
| Sending         | The send button cancels `pointerdown` and refocuses the field, so sending never closes the keyboard — except while the emoticon panel is up, which the refocus would replace with the keyboard (`REQUIREMENTS.md § 13.6.`)                                                                                                                                                     |
| Staged emoticon | Right-aligned at the **top of the composer stack** — above the pill, and above the emoticon panel while that is open — on the side its own bubble will land on (§ 6.2.), where the media tray stays left-aligned because a tray is a row rather than one object. Out of the stack's flow, so it floats over the history instead of moving it (`REQUIREMENTS.md § 13.6.`)       |
| Emoticon panel  | Above the pill, cleared from the history by `xs` — the composer's own top padding, so the gap does not change when the panel opens. It expands and collapses over 200ms and the history rides along with it (`REQUIREMENTS.md § 13.6.`)                                                                                                                                        |
| Stack clearance | **Every row that can top the stack clears the history by that same `xs`** — the reply bar (§ 6.10.), the media tray, the emoticon panel, the § 6.6.1. recorder bar. They are alternatives for one position, so a gap only one of them carries reads as the other two being jammed into the bubble above. Each renders nothing when empty, so the resting composer is unchanged |

The field is drawn as nothing at all — no fill, no border, no radius, no focus ring — because the pill already _is_ the field: it is the composer's only surface, it is the full width of the tap area, and a second rounded shape nested inside it reads as a box drawn inside a box. This is the single exception to § 3.2.'s `:focus-visible` rule, and it is allowed only here: a focused text field renders a blinking caret, which is a stronger and more conventional focus signal than a ring, and the field is the composer's default focus target anyway. No other control may drop its focus ring on this argument.

The send button is disabled rather than unmounted while there is nothing to send. WebKit leaves a control newly inserted into the composer row unpainted until something forces the layer to invalidate: typing does, because the caret blinks, but staging an emoticon touches nothing inside the pill, so the button and the shifted emoticon toggle both stayed invisible until the pointer happened to hover them. Keeping the button mounted removes the insertion and the reflow that moves the toggle, leaving only a fill change on an element that is already on screen.

The composer is static rather than `fixed` because the virtualized list above it (§ 6.1.) has to be a bounded flex child, and a `fixed` composer would leave that box unbounded. Being inside the shell column, it also inherits the max width and centering instead of re-applying them.

## 6.6.1. Voice Recorder Bar.

The strip that stands in the composer stack while a voice message is being recorded (`REQUIREMENTS.md § 9.3.`).

| Property  | Value                                                                                                                                                                       |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Position  | Tops the composer stack, clearing the history by the same `xs` every other row in that position uses (§ 6.6.). It replaces nothing — the composer stays where it is         |
| Container | `rounded-full`, `glass`, 1px `hairline`, `shadow-floating` — the composer pill's own surface, since it stands directly above it                                             |
| Indicator | A 2px `semantic-error` dot, pulsing. The one place that token is not an error: it is the recording colour every OS draws, and the pulse is what makes a stalled mic legible |
| Clock     | `chat-time` in `meta`, `tabular-nums`, elapsed only — the cap is announced by the toast that ends the recording, not by a countdown running the whole time                  |
| Level     | `VOICE_LEVEL_WINDOW` bars of `primary/70`, `gap-px`, in a 24px box, each rising from a floor so a silent mic still reads as present rather than broken                      |
| Controls  | 취소 as an `IconButton`, then the composer's own 36px `primary` send disc in a 44 target — the control that finishes a recording is the control that sends everything else  |
| A11y      | The clock and meter are `aria-hidden`; one `aria-live="polite"` region carries the state, since a meter updating 20×/second would talk over everything                      |

**Waveform playback (§ 6.5.).** Time reads elapsed / total (`0:07 / 0:42`), and total alone before playback starts — an extension of § 2.1.'s decision to take chat mechanics from KakaoTalk, with the practical gain that the length is knowable before committing to listen. The waveform is drawn from the stored peaks and fills with `primary` as it plays: **two copies of the same bar row, the upper one clipped by `clip-path`**, never a per-frame repaint of forty bars inside a virtualized row. A silent sample still gets `MIN_PEAK` height, since bars that vanish read as a recording that cut out. The graph is `role="slider"` with `aria-valuetext` from `formatDuration`; the pointer affordance is a tap, and the keyboard steps 5% of the total per arrow key, there being no x-coordinate to read from a keypress. Seeking is **tap only, never drag** — a drag would fight the § 6.10. swipe-to-reply. Korean copy: `음성 메시지` (group), `음성 메시지, 전송 중이에요` (group, while the send is in flight), `재생` / `일시정지`, `재생 위치`. The pending variant is not decoration: the 60% dimming below says "not sent yet" to everyone except a screen reader, and this bubble is playable while it uploads, so the fact has to be carried in the label too.

**The level meter is a window, not the waveform.** It shows the last `VOICE_LEVEL_WINDOW` moments so a two-minute recording draws the same box as a two-second one, and it is deliberately far fewer bars than `VOICE_WAVEFORM_PEAKS`: this says the microphone is hearing something, where the stored waveform describes the finished clip.

**There is no 완료-then-review step.** Stopping sends (`REQUIREMENTS.md § 9.3.`), so the disc is a send button and is drawn as one.

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

## 6.7.1. Typing Indicator.

`입력 중` while the other person is composing (`REQUIREMENTS.md § 8.12.`).

| Property  | Value                                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------ |
| Geometry  | The incoming bubble of § 6.2. exactly — `rounded-bubble`, the `rounded-tl-xs` notch, `bubble-theirs` over 1px `hairline` |
| Position  | The last item in the conversation, in a slot above the trailing spacer that opens to `--typing-indicator-height`         |
| Content   | The typist's `chat`-size avatar (§ 7.7.), then three 6px `meta` dots bouncing on a staggered 150ms offset                |
| Alignment | `items-end` — the circle sits on the bubble's baseline, exactly as it does on an incoming row (§ 6.3.)                   |
| Padding   | `px-md py-xs` on the row, `px-sm py-xs` inside the bubble — the text bubble's own padding (§ 6.2.)                       |
| Bubble    | Exactly one line of `chat-body` — `--text-chat-body` × its own line-height — never the height of three 6px dots          |
| Lifecycle | The slot's height animates `0` ⇄ open over 200ms `ease-out`; the row mounts and unmounts inside it                       |
| Reveal    | The row fades in over 150ms **after** the slot has opened — a 200ms delay. Nothing fades out                             |
| Height    | `--typing-indicator-height` is `max(avatar, bubble)` + the row's `py-xs`. The **bubble** is the taller of the two        |
| A11y      | `aria-live="polite"` around a visually hidden `{이름}님이 입력 중이에요`; avatar and dots are `aria-hidden`              |
| Spacing   | The § 2.3. scale (`px-md`, `gap-2xs`), never Tailwind's raw numeric one                                                  |

**It is a message, not a badge.** It sits where the bubble it announces will sit, in the same column and wearing the same shape, so the arrival replaces it rather than displacing it. Floated over the composer it was a status light bolted to the chrome; here the conversation simply has one more thing at the end of it.

**The bubble is a message's height, not its contents' height.** Dots left to themselves collapse the box into a lozenge visibly shorter than every bubble around it, which reads as a different kind of object. The dot row is therefore given exactly one line of `chat-body`, from the same two tokens the text it stands in for would use — so the bubble is the size of the message that is coming.

**The row is not drawn while the slot is still short of its height.** The strip clips, so a row drawn mid-transition is a horizontal cut travelling down through the avatar and the bubble. The fade is therefore held until the growth is over: the conversation is pushed up by an empty gap, and the row arrives into a slot that is already its own size. That is one of the two ways this row was cropped — the other is the token below, and both shipped.

**The row's padding and `--typing-indicator-height` are one measurement.** The token is `max()` of the two things that can be tallest — the `chat` avatar at `36px`, and one line of `chat-body` inside the bubble's own `py-xs` and hairline — plus the row's own `py-xs` twice. Changed on one side only, the slot crops the row it is holding, which is exactly how the avatar-only version shipped a permanent ~4px crop.

**The slot animates rather than appearing.** The row is real list content, so mounting it outright resized the scroller in a single frame and the end of the list lurched under anyone following it. Opening the height over 200ms pushes the conversation up instead, and the reader at the bottom is carried with it frame by frame (`REQUIREMENTS.md § 8.12.`). It closes the same way, which is why nothing is reserved while nobody is typing.

**The avatar, and no written name.** The photo carries the identity in the column that already means "them", so a name beside it would be a wider box appearing and disappearing every few seconds to say what the circle said. The name is still spoken: it is in the live region, where there is no photo to carry it.

**`canEnlarge` stays off.** This circle stands in for a bubble that does not exist yet; enlarging it would offer a photo the row is not really showing.

**Polite, never assertive.** The signal changes several times a minute, and an assertive live region would interrupt a screen reader mid-message to announce it.

**The sentence arrives with the row.** A live region announces a _mutation_ of its own contents, so text that is always present and merely styled away — or toggled with `aria-hidden` — is announced exactly never. Mounting the whole row solves it here: the region and its string enter together, which is the mutation.

## 6.8. Search.

| Element         | Rule                                                                                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Search bar      | Replaces § 7.12.'s header in place, same height and inset — the § 6.6. pill holding a 16px `meta-soft` glyph, the field, a clear button, and the submit disc, with a plain `취소` label beside it |
| Navigation bar  | Stands in the composer's position and wears its pill exactly (§ 6.6.): 목록 at the left, `{n}/{total}` centered in `caption` `meta` `tabular-nums`, `∧` and `∨` at the right                      |
| Result list     | A full overlay in `surface-soft`, inset below the search bar rather than running under it                                                                                                         |
| Result row      | `canvas` fill on `surface-soft` list, sender name (`title-sm`), matched line (`body-sm`, 2-line clamp), date (`caption`, `meta`)                                                                  |
| Active row      | 1px `primary` border — the row the room is parked on, so the list says where `∧∨` will step from                                                                                                  |
| Match highlight | `search-hit` background, `ink` text, `rounded-xs`, computed client-side by string split                                                                                                           |
| Match in bubble | The same mark, painted inside every visible bubble the query occurs in; a URL run is left alone                                                                                                   |
| Jump target     | The marked words and the centered row, nothing more. § 6.10.'s `primary-tint` row flash belongs to the **quote** jump, which has no substring to mark                                             |
| Return control  | The § 6.7. scroll-to-bottom pill — same component, no search-specific variant                                                                                                                     |
| Empty state     | § 7.6. — `대화 내용을 검색해 보세요` before a query, `검색 결과가 없어요` after one                                                                                                               |
| Loading         | § 7.8. — skeleton rows for the first page, a `LoaderCircle` at the list's end for the next                                                                                                        |

**The bar takes the header's place rather than covering it**, so opening a search moves nothing on the screen behind it and the conversation goes on scrolling under the same strip it always does.

**The pill is the composer's shape and the disc is the composer's send button**, in the same corner, at the same 36 inside a 44 row — a field with the action it feeds parked at its right end is already this app's one arrangement for that. It is `primary` while there is something to ask for and `primary-disabled` otherwise, and it swaps its glyph for a spinner while the scan is out. On a phone it is the redundant half: the keyboard's own search key is what the thumb reaches (`REQUIREMENTS.md § 8.6.`). The pill's height is fixed rather than sized to its contents, or the clear button appearing on the first keystroke would grow it under the finger.

**This is the one overlay the floating header must not be transparent over.** § 7.12.'s rule is written for content that is meant to pass beneath the controls, and the conversation has a fade mask to dissolve it. A result row has neither: sliding under the field it would put message text behind `취소`. So the list is inset to `--app-header-inset` and the strip behind the bar is the list's own `surface-soft`.

**The composer's whole stack leaves while a search is open**, not just the field — a reply bar or an attachment tray left standing would be composing a message the screen offers no way to send. The navigation bar takes the vacated position, which is also the box `--chat-bottom-gap` is measured from (§ 6.6.).

**`∧` is the older hit, `∨` the newer one.** The conversation runs oldest to newest down the screen, so the arrow points the way the room is about to move — not the way the newest-first list is ordered.

**The list and the arrows are two readings of one result set, not two features.** The arrows walk the hits in order; the list is for picking the one whose date you recognise, which is the faster route once a common word matches a dozen times.

**Which is why the list must hand the reader back.** It covers the navigation bar completely, so without `목록 닫기` the only ways out are picking a result or 취소 — and 취소 takes the query and the parked position with it. A reader who opened the list to look and then wanted the arrows would have to search again.

**A search jump is marked in the words, not behind the row.** § 6.10.'s flash exists because a quote jump has nothing else to point at — it says "here" and stops. A search knows which characters were asked for, so it lights those, in the colour the result row already used, and the mark stays up while the reader steps through the rest. Washing a full-width row in `primary-tint` on top of that puts a block of colour behind text that is being read, once per arrow press.

## 6.9. Link Preview Card.

A text message carrying a link renders a card above its bubble and **outside** it (`REQUIREMENTS.md § 8.9.`). Outside, so the card reads as an attachment to the message rather than as part of the sentence — the same treatment § 6.5. gives a photo, which is also something the sender pointed at rather than something they wrote.

It is a sibling of the bubble inside the § 6.1. message column, never a floating box of its own: the column already carries the sender's side and the 72% cap, so the card takes both without re-deriving either.

A message with an attachment or an emoticon never renders one — a bubble-less message (§ 6.5.) carries no text for a link to be in.

| Property   | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Geometry   | § 6.5.'s 220px attachment width, so a link card and a photo line up in the column. `rounded-md`, 1px `hairline`, `canvas` fill, `2xs` above the bubble                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Thumbnail  | 16:9, `object-cover`, a § 7.8. skeleton while it loads. Omitted entirely when the page published no image — but once the box is reserved it **stays**: a host that refuses to serve the image gets the placeholder glyph inside it rather than the tile collapsing and taking 124px out of an already-measured row (`REQUIREMENTS.md § 8.3.`). It is the one image in the app not served from R2, so it is the one `PreloadImage` with `canRetry` off — § 13.3.'s cache-busted second attempt would re-ask a host that already refused, on a URL this app does not own |
| Video mark | A 40px `scrim/60` disc with an `on-primary` play glyph, centered on the thumbnail. `og:type: video` only                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Title      | `title-sm` in `ink`, 2-line clamp                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Body       | `body-sm` in `body`, 2-line clamp. Omitted when the page published no description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Site line  | `caption` in `meta`, 1-line clamp — the site name, or the channel for a video                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `:hover`   | `bg-surface-soft`; `:active` `bg-surface-pressed`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Absent     | Nothing is rendered while the scrape is in flight, and nothing at all for a page that describes itself with nothing                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

The card keeps `canvas` on both sides of the conversation rather than tinting with the sender's bubble: it is quoted material, and the one thing in the column that did not come from the sender.

Links in the text itself are underlined (`underline-offset-2`) and take `primary` on `:hover`, `primary-pressed` on `:active`. The URL stays in the bubble as the sender typed it — the card is an addition to the message, never a rewrite of it.

Neither the card nor a link in the text is a dead spot for the row's own gestures: both pull to reply (§ 6.10.) and both hold to the action sheet, exactly as the bubble beside them does. A tap still follows the link — each gesture swallows only the release it actually consumed. Two things make that work, and both are load-bearing: the pull and the hold sit on an **ancestor** of the anchor, since the click capture that eats the release only reaches a target it is above; and both anchors are `draggable={false}`, or WebKit's native link drag takes the finger before the pull has measured its first move.

## 6.10. Reply Quote.

The message a reply points at, in one line (`REQUIREMENTS.md § 8.10.`).

| Property     | Value                                                                                                                                                                                  |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shape        | `rounded-sm`, 2px `primary` left bar, padding `4px 8px`, `xs` gap between thumbnail and text                                                                                           |
| Lines        | Sender name (`chat-name` in `chat-meta`) over the summary (`body-sm` in `meta`). **Both `truncate`, always one line each**                                                             |
| Summary copy | The text itself; `사진` / `동영상` for attachments, `이모티콘` for an emoticon, `삭제된 메시지예요` for a parent that has been deleted                                                 |
| Thumbnail    | The bubble's **first** attachment only, 32×32 `rounded-xs` with a 1px `hairline` inset ring. Box fixed, never derived from the image (§ 6.1.)                                          |
| In a bubble  | Inside the text bubble at its top, `2xs` above the text, fill `chat-canvas` — recessed against both bubble fills, which `surface-soft` is not                                          |
| Standalone   | Media and emoticon messages have no bubble (§ 6.5.), so the quote is a `bubble-theirs` card above them, capped at the 220px attachment width                                           |
| Tap          | Jumps to the original. `:hover` `bg-surface-strong`, `:active` `bg-surface-pressed`. A withdrawn parent is tappable too — § 6.2.1. keeps its place, so the jump lands on the tombstone |
| Staged       | Above the composer stack, in flow, in the § 6.6. pill treatment (`glass`, `hairline`, `shadow-floating`) with a 36px `X` to cancel                                                     |

The staged quote pushes the history up, where the staged emoticon of § 6.6. floats over it. The emoticon is one object standing where its own bubble will land; this is a bar, like the media tray, and a bar that floated would hide the messages the user is quoting from.

| Reply affordance | Rule                                                                                                                                                                                                                                                                                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Touch            | **Pull the row sideways** — toward the middle of the screen, so the pull always leaves the edge the row is aligned to. Engages at 8px, fires on release past 56px, damped to a 72px stop past that. Holding the bubble opens the § 7.5. action sheet with `답장` first, on an attachment as much as on a text bubble (`REQUIREMENTS.md § 8.11.`)            |
| Pull indicator   | A 32px `CornerUpLeft` in the gap the pull opens, on the edge the row moves **away** from — `surface-soft` on `meta` until the threshold, `primary` on `on-primary` past it, so the release is never a guess                                                                                                                                                 |
| Pointer          | A 32px `CornerUpLeft` button on the bubble's **outer** side, `opacity-0` until the row is hovered or one of the buttons is focused. `공유` is a second 32px button beside it where the message has something to share (`REQUIREMENTS.md § 8.11.`); `답장` stays the one nearer the bubble on either side, so the reach for it does not move with the sender |
| Position         | Out of the row's flow (`absolute`, vertically centered). In flow its appearance on hover would shove the bubble sideways under the cursor                                                                                                                                                                                                                   |
| Highlight        | A jump target flashes `primary-tint` on the **row**, not the bubble fill — media and emoticon messages have no fill and must highlight too                                                                                                                                                                                                                  |

## 6.10.1. Edit Bar.

The bar that says the composer is correcting a message rather than composing one (`REQUIREMENTS.md § 8.13.`).

| Property | Value                                                                                                                                                           |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shape    | The § 6.10. staged-quote treatment exactly — `rounded-lg`, `glass`, `hairline`, `shadow-raised`, `2xs` gap, 32px `X` to cancel                                  |
| Contents | A 16px `Pencil` in `meta-soft`, then `메시지 수정` in `chat-name` / `meta`. It names the mode and nothing else — the text being corrected is in the field below |
| Position | Where the staged quote stands, and **never beside it**. A correction composes no new message, so there is nothing for a quote to be the header of               |
| Composer | `+` and the emoticon toggle are withheld for the length of the mode; an edit is text-only. The send disc keeps its shape and reads `수정 완료`                  |

Everything already staged — the quote, the tray, the emoticon — is hidden rather than cleared, and returns when the edit is cancelled. Entering a mode must not cost the user work they had done before it.

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
| Active    | icon and label `primary` over a single `primary-tint` `rounded-full` fill that travels to the item          |
| `:hover`  | icon and label `ink` on a `surface-soft` fill (inactive items only)                                         |
| `:active` | The press bloom on the tab's glyph stack, dialled to `--press-scale: 1.25` (§ 4.7.2.)                       |
| Badge     | `unread` fill, `on-primary` `micro`, min 18×18, `rounded-full`, anchored to the icon's top-right; `99+` cap |

The bar leaves while the on-screen keyboard is up: the shell shrinks to the visual viewport (§ 3.4.), so a bar left in flow would sit between the composer and the keys and eat 56px of an already short column. The install banner (§ 7.13.) goes with it, for the same reason.

It leaves by collapsing `BottomOverlay`'s height to `0` over 200ms `ease-out`, not by unmounting, and comes back on a 200ms delay — the shell's own height ease (§ 3.4.) has to land first, or the bar rises against a bottom edge that is still halfway up the screen and appears in mid-air: `--bottom-inset` is measured off that box, so the collapse carries the clearance — and with it the composer — down on one timeline. Unmounting stepped the inset the instant the keyboard was detected while the shell was still easing to its new height, and the composer visibly moved twice. Both bars are therefore keyboard-agnostic; the decision lives in `BottomOverlay` alone. The collapsing box is not clipped: the bars slide down past the shell's bottom edge, which is where the keyboard already is.

The 200ms delay is counted from the shell's height ease starting, which means `useIsVirtualKeyboardOpen` MUST NOT report the keyboard gone before the visual viewport has grown back. Detection is therefore asymmetric: **opening** takes a focused editable element _and_ a height drop past 160px, **closing** takes the height alone. Blur is not a closing signal — `focusout` lands the frame the field is blurred while WebKit only reports the restored height once the keys have finished sliding, so an AND across both signals dropped the flag roughly 250ms early. The delay then expired before the shell had started growing, the bars rose against an edge still halfway up the screen, and `--bottom-inset` yanked the composer and the history up by the bar's height before the shell brought them back down — the flinch this asymmetry exists to remove. Closing on the viewport alone also keeps Android's back button correct, which hides the keyboard without blurring the field.

The bar floats inside the shell (§ 3.5.), so it is neither `fixed` nor width-re-applying: the shell is already a `fixed` box of the visual viewport's height, and the bar is an absolute child of its column.

Re-tapping the tab the user is already on carries no transition type, so it does not animate — it still navigates, and a type would slide the screen out and the identical screen back in.

There is **one fill**, not one per tab, and a switch **travels** it. It is a single absolutely-positioned surface in a track behind the items, moved by the `translate` property over `--duration-tab-travel` on `ease-route` — the same curve the arriving screen slides on (§ 4.7.1.), so the fill and the screen read as one gesture rather than two. Its width is `100% / TABS.length` and its travel is a multiple of **its own** box, so it tracks four `flex-1` columns without measuring anything: `left`/`width` would animate layout every frame, and there is no pixel geometry to read until layout has run anyway. Under `prefers-reduced-motion: reduce` the travel drops to `0s`, which is the instant swap the per-tab fill used to be.

**Why the travel has a duration of its own, and why it is the longest committed state change in the app.** It ran on `--duration-state` (200ms) with everything else, and at that length it was the one state change users reported not seeing. The reason is distance, not speed: a toggle's knob crosses its own width and the bars collapse by their own height, while this crosses up to three quarters of the bar — the same duration therefore buys it several times the velocity, and the eye reads it as already-arrived rather than as having moved. The value was dialled in by eye, upward: 320ms still read as a jump, 450ms as a short one, and it settled at **600ms** — nearly three times `--duration-route-enter` (220ms). That ratio is the reason a length like this is affordable at all, and it is the thing to preserve if the number is ever revisited: the fill is _confirmation_ of a switch the arriving screen has already completed, so it sits off the critical path entirely and is free to take time in a way nothing the user is waiting on could. It is unambiguously the last thing on screen to settle, which is the correct order for the two.

Two consequences of a travel this long are deliberate rather than overlooked. Tapping a second tab mid-travel **retargets** the fill from wherever it currently is — `transition` re-eases from the running value, so it never snaps back or queues, and quick switching stays continuous rather than stuttering. And the fill is still moving for roughly two-thirds of a second after the screen has settled, so it must never be something the user has to wait for before the next tap does anything: nothing about a tab's behaviour is gated on the travel finishing, and nothing may become so. Raising `--duration-state` instead is the wrong lever twice over — it would slow every toggle and hover fill in the app, and the bars' collapse is paired to the shell's own 200ms height ease (§ 3.4.), which is not a coincidence to break.

The list is lifted over the fill with an explicit `z-10`, and DOM order is **not** enough. `Link` adds `relative` only when `haptic` is on, and `haptic` is off on the tab the user is already standing on (nothing to confirm) — so the one tab the fill is parked under is the one non-positioned anchor in the bar, painted before the fill rather than after it. Its `focus-visible` ring is an inset `box-shadow` on that anchor, and an opaque `primary-tint` over it leaves the current tab with no focus indicator at all while every other tab keeps one. Lifting the whole list, rather than the anchors, is what keeps that from depending on a prop about haptics.

The icon and label cross over that same `--duration-tab-travel` rather than swapping, and the two **MUST** stay on one token. Snapped, the tapped tab turns `primary` on bare glass while the fill is still travelling toward it, and the tab being left keeps a fill it has already lost the colour of; left on `--duration-state` while the fill moved to its own duration, the pair would land before the fill is halfway across and reintroduce the same fault — a gap that widens every further time the travel is slowed, which is why the two share one token rather than two numbers that happen to match.

The travelling fill is why the tab is the one caller whose press bloom carries **no fill of its own** (§ 4.7.2.). The fill can no longer live inside the anchor whose press it would answer, and forwarding the press to a sibling buys almost nothing: `haptic` is off on the active tab, so under a finger there is no `[data-pressed]` on it to forward, and on a switch the attribute is cleared before `aria-current` arrives. The travel is what answers a tab switch; the bloom on the glyph stack still answers the touch.

The fill moves on the tap, not on the commit. Every tab screen is dynamic (`REQUIREMENTS.md § 8.`), so none of them prefetches to anything usable and the router holds the click for a server round trip — long enough that a bar driven by `usePathname` alone reads as a dropped tap. The tapped `href` is held as pending state and **discarded** — not merely masked — the render the pathname lands, so the fill sets off and the label colour turns immediately while the outgoing screen stays up. A value left in state would match again the next time the user arrives back on the route it was tapped from, and a swipe-back would send the fill back to the tab they had just left. This is presentation only: `aria-current` moves with it, but nothing else acts on the pending value, and a navigation that never commits returns the fill to the real route.

The active item is the one filled surface in the system's navigation: on a pill this narrow there is no room for an indicator bar underneath, and colour alone is too weak a signal against a translucent backdrop that changes with whatever scrolls behind it.

The glyphs stay outlined in both states: lucide ships no filled counterpart for `MessageCircle`, `CalendarDays`, `Archive`, or `Settings`, and faking one with `fill-current` turns them into solid blobs. If a filled set is ever adopted it MUST cover all four — a single filled tab reads as a rendering bug.

Labels: `채팅` / `캘린더` / `보관함` / `설정`.

The third tab was `갤러리` on `Images` until it grew a 파일 segment (`REQUIREMENTS.md § 10.`), and a tab holding documents cannot be called a gallery. `Archive` is the glyph because it is the one in lucide's outlined set that reads as "things put away" rather than as one medium — `Images` would have kept naming half the contents, and `Folder` reads as a filesystem the app does not have. **The prefix is `/archive`, and it caught up with the label one segment later**: it stayed `/gallery` while it was a leaf, on the same reasoning that keeps `이모티콘 관리` at `/settings/emoticons`, and that reasoning broke the moment the shelves nested under it — `/gallery/files` reads as a claim that files are a kind of gallery (`REQUIREMENTS.md § 7.`). The tab's own tap goes to `/archive/gallery` rather than the prefix, so the fill travels without spending a redirect first.

## 7.4. Modal.

`canvas` surface, `rounded-lg`, `shadow-floating`, scrim `bg-scrim/45`. Props-driven (`isOpen` / `header` / `onClose`), never composed at the call site.

| Size | Width                     | Use                          |
| ---- | ------------------------- | ---------------------------- |
| `sm` | `min(360px, 100% - 32px)` | Confirmations, short choices |
| `md` | `min(440px, 100% - 32px)` | Forms with helper copy       |

No size beyond `md`: the shell is 576px, so anything larger is a screen, not a modal. Header is `display-sm` `ink`, optional description `body-sm` `meta`.

## 7.5. Bottom Sheet.

The default overlay for anything originating from a bottom-anchored or list interaction. Bottom-anchored **floating card**, inset `sm` (12px) from the screen edges, `rounded-xl`, `canvas` fill, 1px `hairline`, `shadow-floating`, `overflow-hidden`.

| Rule                                                                                                    | Reason                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drag handle at top: 48×6, `rounded-full`, `hairline-strong`                                             | The dismissal affordance                                                                                                                                                                                                                                                                                                                        |
| No close `X` alongside the handle                                                                       | Two redundant dismiss controls on the same edge                                                                                                                                                                                                                                                                                                 |
| Centered `title-md` `ink` header; optional `body-sm` `meta` description                                 | Matches the reference implementation                                                                                                                                                                                                                                                                                                            |
| A sheet whose rows already say what it is may hide the header                                           | A title over `사진/영상` only restates it                                                                                                                                                                                                                                                                                                       |
| Body scrolls internally past `70dvh`; max height `90% - 12px` of `--viewport-height`                    | Sheet must never push past the visual viewport (§ 3.4.)                                                                                                                                                                                                                                                                                         |
| Bottom edge sits at `--viewport-bottom`, not `0`                                                        | The keyboard would otherwise cover it (§ 3.4.)                                                                                                                                                                                                                                                                                                  |
| Focus ring inside the sheet is `ring-2 ring-primary ring-inset`                                         | `overflow-hidden` would crop an outward offset ring                                                                                                                                                                                                                                                                                             |
| Closing restores focus to whatever opened the sheet — **except after a row that declares `keepsFocus`** | The sheet unmounts at the end of its exit animation, so the restore lands well after the action ran and would blur anything it focused on purpose (`REQUIREMENTS.md § 8.13.`'s 수정, the one row in the app that asks). Every other row, and every dismissal, still restores — nine sheets share this component and only one action moves focus |
| Never swapped for a `Modal` at any width                                                                | § 3.1.                                                                                                                                                                                                                                                                                                                                          |

`ActionSheet` is a bottom sheet whose body is a list of full-width `surface-soft` rows, `rounded-md`, `button-md` centered label with optional leading icon, following the chip ladder for states. Destructive rows use `semantic-error` text.

## 7.6. Empty State.

`surface-soft` card, `rounded-md`, 1px `hairline-soft`, padding `2xl`, centered. 24px `meta-soft` lucide glyph, `body-md` `meta` line, optional `button-secondary`. No illustrations — a two-person app has no room for mascot art, and stock illustration is the clearest tell of a template build.

## 7.7. Avatar.

`rounded-full`, `surface-strong` fallback fill with the nickname's first character in `title-sm` `meta`. Sizes: 36 (chat), 44 (settings row), 72 (profile edit). 1px `hairline` inset ring at every size so light photos do not bleed into `canvas`.

The photo is stored **square** (`REQUIREMENTS.md § 12.`), because the circle crops anything else and the § 7.10. viewer would then show a framing the circle never did.

Where it is enlargeable, the avatar is a button: `opacity-80` on hover, `opacity-70` on active, `focus-visible` ring on the circle itself rather than on the image inside it. Tapping opens the § 7.10. viewer on that one photo, with the save control hidden — a profile photo is the person, not an attachment they shared. It is **not** enlargeable inside another interactive element (the § 7.9. day sheet's authorship avatar), where a nested button would swallow the tap.

## 7.8. Skeleton.

`surface-strong` blocks at the final content's radius, pulsing to `surface-soft` over 1.5s. Used for the initial message page, library grid, and calendar month. Never for optimistic messages — those render at 60% opacity (§ 6.5.).

Every remote image also carries one while it loads: `PreloadImage` (`@/shared/ui`) fills its own box with the skeleton and fades the asset in over 200ms once it paints. Screens MUST NOT render a bare `<img>` for an R2-backed asset — the skeleton is what stands in for the reserved box of § 6.1. instead of a blank rectangle, and the fade is what keeps a cached image from flashing. An asset that never arrives ends on a static `surface-strong` box with a `meta-soft` `ImageOff` glyph: a skeleton that pulses forever reads as a hung screen.

**A skeleton stands in for a shape; a spinner stands in for a wait.** Use a skeleton only where the placeholder can take the geometry of the thing arriving — a bubble, a tile, a month cell. Where there is no shape to borrow, or where the wait has no bound the user can see, use a `LoaderCircle` at `size-4` in `meta-soft`, `animate-spin`. § 8.3.'s upward paging is the second case twice over: its indicator lives in a 40px header that no message could fill, and it outlasts its own fetch, because the page is held until the scroller goes still. The one place neither belongs is an optimistic message — that dims to 60% and shows nothing (§ 6.5.).

**And it takes the geometry of the screen it is actually on, which means a `loading.tsx` shared by routes of different shapes has to be split.** 보관함 had one at `/archive` covering all three shelves, drawing 파일's 56px rows on every one of them; opening 사진 filled the screen with tall bars that were then replaced wholesale by a 3-column grid, which is a worse wait than a blank screen — the eye settles on a layout and then has it taken away. Each shelf now has its own fallback (`LibraryFallback`, keyed by `LibraryKind`): the grid's square `2xs` cells for 사진, 56px `rounded-md` rows for 파일, 56px `rounded-bubble` rows for 음성, each under a placeholder for the § 7.10. month header every shelf opens on. The header and the § 7.10. chips are drawn in all three — `loading` replaces the whole page subtree, and a fallback of bare rows takes the segment control off screen for exactly the moment the user is looking at it.

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
| 오늘 chip        | `chip`, `2xs` left of the next-month chevron; rendered only while the grid is off today's month                                                                          |
| Weekday header   | `caption` `meta`; Sunday `semantic-error`, Saturday `primary`                                                                                                            |
| Day cell         | Square, `body-md`; current month `ink`, adjacent months `meta-soft`                                                                                                      |
| Today            | `chat-badge`-weight numeral in `primary`, no fill                                                                                                                        |
| Selected         | `primary` fill, `on-primary` numeral, `rounded-full`                                                                                                                     |
| Event marker     | Up to 3 dots (4px, `rounded-full`) below the numeral, in the event's colour                                                                                              |
| Marker by scope  | `shared` events use a filled dot; `mine` events use a 1px ring dot of the same colour. Shape, not colour, carries scope — colour is already spent on the event's own hue |
| Milestone marker | Derived anniversaries (100일, 주년) render a 4px `primary` diamond, distinct from every event dot                                                                        |
| Event colours    | Drawn from the tint family only; never raw hues                                                                                                                          |

The day sheet leads with that day's milestones, above its events: the diamond again, the label in `title-sm` `ink`, `기념일` in `caption` `meta`. They take the upcoming card's static treatment — 1px `hairline` on `canvas`, no hover or active state — where an event row is `surface-soft` and tappable, because a derived anniversary opens nothing.

## 7.10. Library (`보관함`).

The tab carries two segments, `사진` and `파일` (`REQUIREMENTS.md § 10.`), drawn as a row of two `Chip`s under the header and above the content, at `2xs` gutters with `sm` of space below them. The selected one takes `Chip`'s own selected state (`primary-tint` fill, `primary` label); each wraps a `Link`, so the pair is navigation rather than a control, and the unselected one carries `haptic` while the selected one does not — it confirms nothing.

**Chips and not an underlined segmented control.** The tab bar sits one strip below with a fill that travels between items over `--duration-tab-travel` (§ 7.3.), and a second travelling indicator directly above it puts two moving marks in the same glance, neither of which is the thing the user just tapped. Chips change colour in place and leave the travel unambiguous. They also take a third segment (음성) by growing the row, where a divided line has to be re-measured and eventually wraps or truncates.

The chips are withheld in selection mode, in the same swap that replaces the header's controls with 취소.

Everything below this paragraph describes the **사진** segment, which is what this section covered before 파일 existed; the 파일 and 음성 segments are § 7.10.1. and § 7.10.2.

3-column grid, `2xs` (4px) gutters, square `object-cover` cells, `rounded-sm`. Month section header is `title-sm` `meta` and **scrolls with the grid**. Viewer is full-bleed on `scrim` at 90% opacity with no chrome except a close `icon-button`, the position counter, and the save pair — `공유` then `원본 저장`, collapsing on iOS to `저장/공유` alone, by the same rule the § 7.10. selection bar follows (`REQUIREMENTS.md § 8.11.`); slides carry vertical padding only, since a side gutter reads as a frame around a photo the viewer exists to show whole.

`대화에서 보기` (`REQUIREMENTS.md § 10.`) is the one control **below** the track: a `rounded-full` outline pill, 1px `canvas/25`, `button-sm` `on-primary` with a 16px message glyph, min-height 44, cleared of the bottom safe area. It is not in the header row because that row is already at its width — four controls, a counter and a close on a mobile shell — and because it is a sentence rather than a glyph. It is a row of its own rather than an overlay so it never covers the photograph, and it keeps its box (`invisible`) on a slide with no message, for the reason the header's controls do: a control that unmounts mid-swipe resizes the track and moves the photo under a travelling finger. A chat bubble's viewer never renders it — the reader is already on the message it would travel to.

It dismisses on `Escape` and on a tap anywhere on the scrim, like every other overlay — written out rather than inherited, since the viewer composes no `Dialog` (§ 3.5.1.). The photo itself is not scrim: holding it is how the OS menu is reached. **The `<img>` box is not the photo**, though — `object-contain` letterboxes inside it, so the tap is tested against the painted rectangle and a portrait photo's side gutters dismiss like the scrim they look like. A `<video>` is excluded whole, controls and gaps between them alike.

The viewer takes one more control wherever there is something to remove: a `semantic-error` trash beside the save. **It is the label that says how far one tap reaches, and the two viewers reach differently.** Opened from a chat bubble the user sent it is `메시지 삭제`, because it removes the whole bubble (`REQUIREMENTS.md § 6.`) and not the slide on screen; opened from 보관함 it is `보관함에서 삭제`, which takes the library row alone and leaves the bubble carrying the photo. Both are **confirmed**, in the § 7.4. modal that names the consequence — the control sits beside a per-slide save, so the reach is not readable from where it is, and a trash in the same 44px slot standing for two different consequences is exactly the case a label has to answer. The action sheet's 삭제 on an attachment bubble routes through the chat confirmation (`REQUIREMENTS.md § 8.11.`); only a text bubble's is immediate.

The label is therefore carried **with** the handler rather than beside it — `MediaViewer` takes one `deletion` prop holding both, so a caller cannot wire up a delete and leave the trash unlabelled over whichever reach it happens to have.

보관함's is **withheld while an upload is in flight**, for the reason the 선택 control is disabled there (`REQUIREMENTS.md § 10.`): a row whose `postMessage` has not settled would be deleted out from under the send. Its confirmation names one slide rather than a count — `이 사진을 삭제할까요?`, or `이 동영상을` on a video, since a single named slide is where the shelf's own 장 counter would be visibly wrong. **That noun then carries into every sentence under the heading**, or the modal contradicts itself one line down: the description reads `대화에 보낸 동영상은 말풍선에 그대로 남아요` and a failed delete says `동영상을 삭제하지 못했어요`. A counted selection stays 사진 throughout, which is the same latitude 장 already takes. Confirming closes the viewer with it: the slide it was showing is gone, and the track was opened on a snapshot that still holds it.

The viewer is also the one surface that suppresses **none** of the OS's own hold gestures (§ 3.2.): a slide is the whole screen with nothing of the app's competing for the hold, so holding a photo here is how a user reaches iOS's 사진에 저장.

The month header was `sticky` under the app header and is deliberately not any more. The app header is transparent (§ 7.12.), so a pinned opaque band left tiles rendering above it and read as a strip cutting through the grid rather than as a label. Covering the header zone in `canvas` would have fixed that by making the library the one screen whose header is not transparent; letting the label scroll costs a way to tell which month is on screen mid-scroll, and that was the cheaper loss.

| Element         | Rule                                                                                                                                                                                                       |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header controls | `icon-button-floating` only (§ 7.12.) — 사진 추가 and 선택, replaced by a single 취소 in selection mode. The count moves into the title (`2장 선택`)                                                       |
| Selected tile   | The image **scales to 90%** inside its cell; the cell itself does not move. A dim would read as the photograph being wrong, where the inset reads as the tile having been picked                           |
| Selection mark  | 20px circle, top-right inset 4. Selected is a `primary` fill with an `on-primary` check; unselected is a `scrim/25` disc with a `canvas/80` hairline, so it reads on any photo                             |
| Selection bar   | The floating surface of § 3.5. — `glass`, `rounded-full`, `hairline`, `shadow-floating` — over the tab bar, holding 저장, 공유 and 삭제 as equal `ghost` rows; on iOS the first two merge into `저장/공유` |
| Selected count  | Leads the selection bar as `button-md` `meta`, **not only the header title**: the title fades once content scrolls under it (§ 7.12.), which would take the running total with it                          |
| Video tile      | The play glyph and running-time chip of § 6.5., unchanged from the chat cell                                                                                                                               |

Selection mode is entered from the header control, or by **holding a tile**, which enters it with that tile picked. A tap still opens the viewer, because a hold that fires swallows the `click` its release ends in (§ 3.2.). The hold is touch-only: right-click keeps the browser's image menu, since the header control is already this gesture's pointer equivalent.

The hold does not end there — **keep the finger down and drag, and everything from the held tile to the one under the finger takes the same action the hold took** (`REQUIREMENTS.md § 10.`). It fills in grid order, row by row, so the marks land in reading order rather than along the line the finger drew, and dragging back up releases the rows it retreats over. Reaching the top or bottom edge scrolls the grid under the finger, faster the further into the edge zone it goes, so picking a month's worth is one gesture rather than fifty taps. In selection mode the hold is live on every tile, so a sweep starting on a picked one clears instead of picks.

The 삭제 row is a `semantic-error` **label**, not a filled red button (§ 7.5.) — the bar is a surface of equals. The filled `destructive` button appears one step later, in the confirmation, which is where the consequence is actually stated.

공유 sits between 저장 and 삭제, and on iOS the two merge rather than one being dropped (`REQUIREMENTS.md § 10.`): three rows everywhere else, two there, where 저장 keeps its own download glyph and takes the label `저장/공유`. The label is a pair because the sheet behind it is, reaching the photo library and Messages from one tap — but the glyph stays the download's, since saving is what the tap was for. The branch is the platform's capability, not the viewport's width and not the pointer's kind, so § 4.1.'s single mobile UI is intact: an Android phone and a desktop see the same three rows.

Three rows plus the running count is the widest this bar gets, and the shell is mobile-width on every platform (§ 3.4.). Labels stay two characters each for that reason; a longer one belongs in the sheet the row opens, not on the row — `저장/공유` is the exception and it is affordable only because it is the row that has no 공유 beside it.

The share cap is said at the tap, not on the bar. On iOS the selection can never reach it (`REQUIREMENTS.md § 10.` holds it to `MAX_ARCHIVE_SHARE_FILES` and the sweep's own cap toast says so); everywhere else 공유 answers an over-cap press with an error toast and keeps the selection, since the sweep it refuses cost the user real work.

### 7.10.1. The 파일 segment.

A **list**, not a grid: the same month sections as above, each holding one column of `FileCard` rows (§ 6.5.) at `2xs` gutters. A file has nothing to look at — its row is a name and a byte count — and three of those abreast in a 576px shell truncates every one of them.

`FileCard` is one component in `shared/ui`, drawn identically here and inside a chat bubble (§ 6.5.). Its 56px height, `FileText` glyph on a `primary-tint` square, `body-sm` `ink` name and `caption` `meta` size are that component's, stated once there.

| Element        | Rule                                                                                                                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Selected row   | `primary` border and a 1px `primary` ring on the card. Not the grid's 90% inset — a row has no photograph to shrink, and there is nothing an inset would read as                                                                           |
| Selection mark | The 20px circle of the grid, at the row's trailing edge. Unselected is `border-hairline-strong` on `canvas`, **not** the grid's `scrim/25` disc — that one exists to read over a photograph, and over `surface-soft` it only looks smudged |
| Selection bar  | § 7.10.'s bar, with 저장 / 공유 / 삭제 as three rows on **every** platform, and the count in `개` rather than `장`                                                                                                                         |
| Tap            | Downloads. `REQUIREMENTS.md § 9.1.` serves a file as an attachment whatever is asked for, so there is no viewer to open and none is mounted                                                                                                |
| Audio row      | A file whose mime is `audio/*` carries an extra leading control — see below. Every other file row is exactly the one above                                                                                                                 |
| Empty state    | § 7.6., on `Files`, reading `아직 주고받은 파일이 없어요`                                                                                                                                                                                  |

There is **no hold and no sweep here.** The grid's sweep fills a range in _grid order_ across three columns, which is what makes one drag worth fifty taps; in one column that range is the two taps it saves, and owning `touchmove` to buy them is not a trade. The checkbox is also the more honest control in a list, where a row is already a horizontal band with a trailing slot.

The header **does** carry 파일 추가, on `FilePlus`. It used to say here that it did not, on the argument that a file filed with no bubble to sit in is a document nobody was handed — that argument was really about `registerMedia` refusing `addToGallery` for a file, which it no longer does, and the shelf that refusal was missing now exists (`REQUIREMENTS.md § 9.1.`). The control opens the composer's own `MediaPickerSheet` with its 파일 row, so both rows of that sheet are reachable and a photo picked here lands on 사진 with a toast saying so.

**The audio row.** A `audio/*` attachment is played where it sits, and it is still a file on this shelf — the row is the ordinary card with a transport in front of it.

| Element      | Rule                                                                                                                                                                                                                                                           |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Play control | § 6.6.'s 36px `primary` disc inside a 44 target, with the filled `Play` / `Pause` glyph `VoicePlayer` uses. **A sibling before the card, never inside it** — `FileCard` is a `<button>`, so nesting would be invalid markup and would cost one of the two taps |
| Card tap     | Unchanged: still 저장. The two controls are peers and neither swallows the other, which is § 7.10.2.'s arrangement for the selection mark                                                                                                                      |
| Progress     | A 2px `primary` rule along the card's **bottom edge**, scaled from the left. Inside the card because the row is a fixed 56 the § 8.3. estimate depends on; a bar beside it would change a bubble's measured height                                             |
| Meta line    | The size is replaced by `0:07 / 1:24` while this row is the active track, and only then. An untouched row still says how big the file is, which is what a 저장 tap is judged on                                                                                |
| No waveform  | Deliberate, and the reason the row stays on this shelf at all (`REQUIREMENTS.md § 9.1.`). Peaks cost a full decode, which § 9.3. can afford only because a recording is capped at two minutes                                                                  |

Progress is absent until the first tap, because nothing knows the clip's length before the element has loaded its metadata — there is no stored `duration_ms` on a file.

iOS is **not** branched on this segment. 저장 is a download everywhere, so the merged `저장/공유` row of § 7.10. never appears and the selection keeps its full cap (`REQUIREMENTS.md § 9.1.`).

### 7.10.2. The 음성 segment.

The 파일 list again — same month sections, one column, `2xs` gutters — with `VoicePlayer` (§ 6.5.) as the row. That component is drawn identically here and in a chat bubble, so its 56px height, 220px width, disc, waveform and clock are stated there and not repeated.

| Element        | Rule                                                                                                                                                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fill           | `bubble-theirs` on **every** row. § 6.2.'s two colours answer "who said this" inside a thread; a month section does not ask, and alternating fills down a list read as a conversation replayed out of order                      |
| Selection mark | § 7.10.1.'s circle, in a 44 target **beside** the player rather than wrapped around it. The player owns a play control and a seek slider of its own, and a row that swallowed their taps would leave both looking live and inert |
| Selection bar  | § 7.10.'s bar with **two** rows, 저장 / 삭제. 공유 is absent, not disabled — `REQUIREMENTS.md § 9.3.` gives the reason, and a control that is never available on a screen does not belong on it                                  |
| Tap            | Plays, and one clip at a time across the whole page — the shared element of `REQUIREMENTS.md § 13.6.` is what guarantees that, at no cost here                                                                                   |
| Empty state    | § 7.6., on `AudioLines`, reading `아직 주고받은 음성이 없어요`                                                                                                                                                                   |

The header carries 녹음, on `Mic` — **not** a file picker. An audio file has no waveform, so picking one here would file it on 파일 and leave this screen unchanged; recording is the only way to put a row on this shelf (`REQUIREMENTS.md § 9.3.`). The tap mounts `VoiceRecorderBar` (§ 6.6.1.) through `ShellOverlay`, standing above the tab bar at `--bottom-inset`, and mounting is what opens the microphone — so it must remain a plain click handler. A finished recording stages into the tray rather than sending, because the two 갈래 have still to be chosen between; `MediaTray`'s voice tile is a `Mic` glyph over the clock, in the same 64px square, with no edit control.

A drop is accepted here as on the other two shelves, and **nothing dropped can ever appear on this one** — only a recording carries peaks. The item lands on 파일 or 사진 and a toast says which (`REQUIREMENTS.md § 10.`).

**Leaving the screen stops playback**, exactly as leaving the room does (`REQUIREMENTS.md § 9.3.`). A clip runs for minutes and no other screen draws a transport, so a row left playing behind a tab switch cannot be reached to pause.

## 7.11. Settings Row.

Full-width, min-height 56, `canvas` fill, 1px `hairline-soft` bottom border, padding `md`. Leading 18px `meta` icon, `title-md` `ink` label, trailing value in `body-sm` `meta` plus a 16px chevron. `:hover` `surface-soft`, `:active` `surface-strong`. Destructive rows (로그아웃, 세션 폐기) use `semantic-error` label with no icon colour change.

## 7.12. App Header.

Every screen renders its own header rather than inheriting one from the layout, because the trailing slot is screen-specific (chat search, month navigation).

| Property    | Value                                                                                                                                                                                                           |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Container   | Transparent — **no fill, no border, no shadow**. `sticky` top with `env(safe-area-inset-top)` as top padding                                                                                                    |
| Height      | `--app-header-height` (56), below the safe-area padding. `--app-header-inset` is the two together                                                                                                               |
| Flow        | Cancels its own height with a negative bottom margin, so content starts at the top of the shell and passes under it                                                                                             |
| Title       | Optional. `title-md` `ink`, left-aligned on the 16px screen gutter (§ 4.3.), truncates on overflow. Fades out (200ms) once the shell's scroller has moved off the top                                           |
| Padding     | `sm` (12) on the row, `2xs` (4) on the title                                                                                                                                                                    |
| Slots       | Leading and trailing, rendered only when present — an empty slot MUST NOT reserve width. A titleless header with a leading slot gives that slot the row, and grows no spacer of its own (§ 6.8.'s search field) |
| Controls    | `icon-button-floating` (§ 7.1.) — the header itself is invisible, so each control carries its own surface                                                                                                       |
| Hit testing | The strip is `pointer-events-none`; its children re-enable it, so content underneath stays tappable                                                                                                             |

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
| Gate the overlay on nothing the tap itself settles synchronously                      | The tick is a default action, so an overlay unmounted during the click it is answering never toggles and goes silent (§ 7.15.3.)                                |
| A gesture threshold, a drag, a route change — none of these can tick                  | They are scripted triggers, which iOS 26.5 removed                                                                                                              |
| A release that travelled `GESTURE_SLOP` is a drag: no activation, no tick             | The overlay owns the whole tap, so it is the only place that can tell the two apart (§ 7.15.2.)                                                                 |

It renders on a coarse pointer only (`AGENTS.md § 4.2.`): a mouse gains nothing, and the overlay would swallow the ⌘-click the covered element still owes the pointer.

Every rule in that table about the **wrapper** — `relative`, `group`, the overlay as a sibling, gating the tick and not the wrapper — is held by `HapticTarget`, and screens compose that rather than reassembling it. Six copies of the contract had already drifted apart on where `className` goes before it was extracted, which is the argument for the component: `Button` routed it to the wrapper while `Chip`, `IconButton` and `SettingsRow` routed it to the control, so a positioned caller could not ask for `haptic` at all. `HapticTarget` is the outermost element, so `className` is its (`AGENTS.md § 1.2.`) and a primitive that takes `haptic` exposes a second prop — `buttonClassName`, `chipClassName`, `rowClassName` — for the control's own box.

The two remaining hand-rolled wrappers are `<li>` rows (the day sheet, the upcoming card). They are list items before they are haptic wrappers, and a polymorphic `as` on `HapticTarget` would cost more than the duplication it removes.

Where it fires is a product decision, not a technical one: **a committed change of state, and a selection among peers.** Saving, sending, deleting, toggling, switching tab or pack, picking a chip or a swatch, opening a sheet, stepping the calendar to the next month, discarding a staged attachment. Never dismissing a surface, cancelling out of one, or going back — a tick that fires on everything stops meaning anything.

Three boundaries that are easy to read the wrong way:

- The month stepper is **in**. It commits the same change the month swipe does, and the swipe itself is a drag threshold that can never tick — so without it the gesture the chevrons exist to replace (`§ 4.1.`) is the only way to turn the month silently.
- Removing a staged emoticon or photo is **in**, despite reading as a cancel. What it cancels is content already committed to the outgoing message, not a surface the user opened — the same act as deleting, which ticks.
- The search bar's 취소 is **in**, and it is the one dismissal that is. It does not only close the strip: it discards the query, the submitted term and the parked position with it (`REQUIREMENTS.md § 8.6.1.`), which is the same act as removing a staged attachment. The result list's 목록 닫기 beside it is **out** and is the boundary — that one hands the reader back to the arrows and destroys nothing.

### 7.15.1. `keepsScroll`, and why it is opt-in rather than the default.

A switch is thrown by sliding it, so WebKit tracks a drag on the control and claims that gesture before the scroller is consulted. Where the overlay has space around it nobody notices. Where the targets **tile** a surface — the day cells of the month grid, the cells of the emoticon grid, the pack tabs under it, a `SettingsRow` or the name of a 이모티콘 관리 row, both of which fill the row they sit in, a 다가오는 일정 row, and the rows of a sheet (`ActionSheet`, the day's events), which are the whole surface a finger has to pull to dismiss it — the overlay is what every scrolling finger lands on: the emoticon panel would not scroll at all, the month grid, the settings list, the pack list and the upcoming list turned a drag into a tap, and the sheets could not be dragged shut from their own rows.

The pack tabs are the one host where the scroller is **horizontal**, and they are the reason this is stated as "tiles a scroller" rather than "tiles a list": a 44px target with a `2xs` gap either side leaves a finger nowhere else to land, whichever way the surface moves. They also pass no `overlayClassName` beside `keepsScroll`, where every other host repeats the control's `touch-pan-y` — the axis the overlay must leave to the browser is the axis its own scroller runs on.

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

### 7.15.3. `isTicking` cannot be gated on a selection that lands synchronously.

The tick is the overlay's **default action**, and a default action runs after the click has finished dispatching. So the overlay has to still be in the document at that moment — not merely at the moment it was tapped.

That is a live distinction wherever the tap is what turns the gate off. `Link` survives it because the route change is a round trip: the anchor is still standing when the switch toggles, and `haptic={!isActive}` on the tab bar (§ 7.3.) drops the overlay a render later. The emoticon pack tabs are the opposite case — `useStorageState` writes and broadcasts inside the handler, React flushes a discrete update before returning from it, and `isTicking={!isActive}` therefore tore the just-selected tab's `<label>` out of the tree mid-click. A detached label has no labelled control to find, so nothing toggled: the previously active tab could not tick because it had no overlay, and the newly active one could not tick because it no longer had one. **Every pack tap was silent** — on the one strip whose tick is most of its feedback, since the fill it moves sits under the finger.

**Only `keepsScroll` is actually fragile here, and that was measured rather than reasoned.** The search bar puts a tick on four controls that each unmount their own overlay inside the click — 돋보기 and 취소 flip the header ternary, ✕ 지우기 is rendered behind a non-empty query, and a result row closes the list. On device, the first three tick perfectly and only the result row is silent. The difference is the overlay's shape: a bare `<input switch>` toggles _itself_, and WebKit still ticks it after it has been detached, whereas a `keepsScroll` `<label>` has to find its control through `htmlFor` and a detached one finds nothing. So the rule is narrower than "the overlay must survive the dispatch" — it is **a `keepsScroll` overlay must survive the dispatch**. `useMessageSearch.select` therefore defers its state change into the next task.

**A microtask is not enough, and reaching for one first is the obvious mistake.** A microtask checkpoint runs whenever the script stack empties, and during dispatch the stack empties after **every listener** — so `queueMicrotask` lands between the listener and the activation behaviour rather than after it, and the overlay is gone exactly as before. The deferral has to be a task (`setTimeout` with no delay argument, per `AGENTS.md § 8.1.`).

So the pack tabs tick unconditionally, re-taps on the open pack included. That reads as the narrower rule of § 7.15. rather than a break from it: a finger that lands on a tab and lifts has selected that pack, whether or not the panel had to change. Where a state gate is genuinely wanted (`Chip`, the colour swatches, the composer's send disc), it is safe exactly when the state does not settle in the same tick as the tap.

## 7.16. Backgrounds — the profile cover, the chat wallpaper, and the Settings header.

Two chosen photos, drawn in three places — **the cover is one person's and the wallpaper is the room's** (`REQUIREMENTS.md § 12.2.`), so either participant sets the wallpaper and both see it change. `REQUIREMENTS.md § 12.1.`–`§ 12.3.` own what they are and who may see them; this section owns how they look.

**The Settings header** is a cover band of a **fixed 480px** (`h-120`) — no longer `--viewport-height`, and no longer a fraction of any viewport either. Two things must not reach it, and a fixed height is what settles both: the keyboard, because the band is a background (§ 3.4.), and the device, because a cover is a composition and half a viewport is a different composition on every phone.

The band arrived at that value through two earlier ones, and the record of both is worth keeping. `--viewport-height` was first and lost a third of its height to the § 12.1. editor sheet. `50lvh` replaced it and fixed the keyboard: `lvh` is the only unit no keyboard moves on either engine, since the visual viewport is what the keyboard shrinks by definition while `dvh` and the layout viewport both shrink under Chromium's `interactive-widget=resizes-content`, which this app sets. What `50lvh` could not fix is that it is still a fraction. A 667px phone got a 333px band and an 844px phone got 422px, so the avatar-and-name composition designed at one size was never seen at it — and `lvh` counts the browser chrome the shell is sized around, so in a browser tab the band was over half of what is visible even though it is exact in the installed PWA that § 16.1. targets. 480px is measured once and worn everywhere. The photo is `object-cover`, the avatar and the name sit at the bottom of the band, and the band runs **full-bleed from the top of the screen**: it deliberately does not clear the floating 설정 header, because its own top scrim is what keeps that title legible over a photo.

**The profile screen** (`REQUIREMENTS.md § 12.3.`) is the same composition at full height, in a `ShellOverlay` over the tab bar.

**A profile cover may be a looping video** (`REQUIREMENTS.md § 12.1.`); a chat wallpaper never is. `BackgroundMedia` owns that branch so no screen picks the element itself, and the video is `autoPlay loop muted playsInline` — `muted` and `playsInline` are both required for iOS to permit the autoplay at all. Its `poster` is the stored `_thumb`, which is what the cover degrades to in Low Power Mode rather than a black rectangle. The two-stop gradient sits over either kind unchanged.

Both put the cover under a **two-stop** gradient — `from-scrim/55…60 via-transparent to-scrim/80…85`. One flat wash would dim the middle of the photo, which is the part the user chose it for; the two stops darken only the strip the controls are in and the strip the name is on. The base under a missing cover differs between the two on purpose: the profile screen falls back to `scrim`, because its text is `on-primary` either way and a colour that followed the photo would have to be sampled from it; the Settings band falls back to `surface-soft` with `ink` text, because half a screen of near-black on a settings list reads as a broken image rather than as a profile nobody has decorated yet.

**The chat wallpaper** is the room's backdrop under a **fixed** `chat-scrim/45` wash. That wash is not decoration and it is not adjustable. Every meta colour in the room — `chat-meta`, the date pill, `읽음` (§ 4.1., § 6.) — was chosen for contrast against `chat-canvas`, and a photograph underneath them is an arbitrary colour; the wash is what puts them back on the surface they were designed against. A brightness slider would have a setting at which the timestamps are unreadable, which is why `chat-scrim` is a token the dark theme moves rather than a value the user does. **Sharing the wallpaper (`REQUIREMENTS.md § 12.2.`) makes that stricter rather than looser**: a slider would now be one person choosing how legible the other person's timestamps are.

The token's hex is `chat-canvas`'s own, and that is the point rather than an oversight: the wash is a partial application of the surface the room would otherwise have had. It is a separate token because the dark theme has to be able to move the two independently — a dark room wants a deeper floor **and** a lighter wash, or a photo behind it disappears.

**No full-bleed photo follows the keyboard** (§ 3.4.), and all three here are one rule. Sized to the box it sits in, each is `object-cover` over something that loses a third of its height the moment a field takes focus, so the photo re-crops and rescales on every frame of the 200ms the shell eases — a background visibly zooming while the screen is only making room for the keys.

**Where the box itself is the background, the box takes the stable height.** The Settings band is the whole cover, so it is `480px` outright and the photo inside it is a plain `inset-0` — no custom property, no clipping, nothing to keep in step. Stabilising only the photo and leaving the band on `--viewport-height` was tried and is not a fix: the picture stops rescaling and the band goes on collapsing around it, which to look at is the same thing.

**Where the box is a screen the photo merely sits behind** — the chat room, the profile screen — the box must keep following the keyboard, because its content has to stay reachable. There the photo alone is held at `100lvh`, anchored to the top, and **clipped** by the shrinking box in front of it. What those two actually want is the box's own resting height rather than the viewport's; they are equal because the shell fills the viewport, and `lvh` is the expression of it that no keyboard can move.

Where each one is reachable differs, and none of them are exempt:

| Surface        | The keyboard that shrinks it                                                                   |
| -------------- | ---------------------------------------------------------------------------------------------- |
| Chat wallpaper | The composer, which is always on screen — the unobstructed case, and the one that was reported |
| Profile screen | The § 12.1. editor sheet, opened from the screen itself                                        |
| Settings band  | The same sheet, opened from `ProfileSettingsRow`                                               |

The latter two are behind a sheet and its scrim, which is why they read as less urgent — but the sheet is capped at 90% of the _visual_ viewport, so a strip of re-cropping photo shows above it either way. Neither screen has an inline field, so the sheet is the only path; that bounds the exposure and does not remove it.

Two mechanics that are not optional, and both belong to the clipped case alone. The **wash or gradient stays on the visible box**, never on the photo: it answers for the contrast of what is on screen, not for the strip the keyboard has covered. And the photo needs a **clipping ancestor** — a box standing taller than its parent extends `#app-scroll`'s scroll range into a phantom scroll on the chat screen, and paints past the shell on the profile screen. Both take a wrapper for it rather than putting `overflow-hidden` on the screen's own box, which would silently clip anything later rendered to escape it.

**Do not try to replace the wash with a text-shadow on the meta lines.** It was tried twice, in both directions, and both shipped something worse than the problem:

- A **dark** shadow (from `scrim`) under `chat-sender` and `chat-meta`, which are dark ink. A shadow only separates text from a background it contrasts with, so this blurred the glyphs' own edges on a light photo and vanished along with the text on a dark one.
- A **light** halo (from `chat-canvas`), which is the correct direction and still failed. These lines are 11–12px. A blur radius wide enough to separate them from a photo is wider than the glyph is tall, so it fills the counters and reads as fog — the name and the clock came out visibly smeared, which is worse than low contrast because it looks like a rendering fault.

The general rule this leaves: **a halo is a tool for large text.** At meta size the only thing that separates text from an arbitrary photo is putting a known surface behind it — either across the screen, which is the wash, or locally, which is an opaque chip like the date divider's `chat-pill`. The chip is the escape hatch if the wash ever has to come down further; it is heavier and it has not been needed.

The date divider needs none of this: its `chat-pill` fill is already that opaque chip, so it reads over any photo at any wash.

**Open, and it is the wash's real limit: `chat-scrim/45` does not restore the meta colours over a _dark_ wallpaper.** A partial wash cannot put a known surface behind anything — it only moves the photo part of the way toward one, and 45% of a light `chat-scrim` over a near-black photo composites to roughly `rgb(108,105,102)`. Against that, `chat-sender` (#6b6153) falls to ~1.1:1 and `chat-meta` (#8d8375) to ~1.5:1, both at 11–12px, both far under the 4.5:1 § 4.1. holds them to — so a dark photo undoes the very split that lifted `chat-sender` out of `chat-meta`. The claim above that the wash "puts them back on the surface they were designed against" holds for a light photo and is an overstatement for a dark one. Bubbles and the date pill are opaque and unaffected, which is why a bright test wallpaper hides this completely.

Neither way out is free, and the choice is a product one rather than a bug fix:

- **Raise the wash** until the composite clears AA against the darkest admissible photo. That is most of the way to opaque, and it dims the wallpaper into a tint — which is the feature's whole point spent.
- **Take the chip escape hatch** above and put an opaque `chat-pill` behind the sender name and the timestamp, as the date divider already does. Contrast stops depending on the photo entirely; the cost is a chip on every bubble's meta line, which is visual weight the room was designed without.

Until one is picked, the wash stays at 45% and this is a known gap, not a decision.

## 7.17. 절전 모드 Overlay.

Shown while the app is dormant (`REQUIREMENTS.md § 8.4.1.`), and dismissed by pressing it anywhere — the press is also what reopens the request gate.

| Property         | Value                                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Position         | `absolute inset-0` through `ShellOverlay` (§ 3.5.1.), so it covers the floating header and the tab bar                      |
| Surface          | `bg-canvas/45` over `backdrop-blur-md` — **not** the `glass` of § 3.5.1.                                                    |
| Content          | 32px `meta` moon glyph, `display-sm` `ink` `절전 모드`, `body-sm` `meta` reason, `caption` `meta` dismissal hint            |
| Element          | A real `<button>` filling the overlay, not a click handler on a backdrop                                                    |
| `:active`        | `bg-canvas/60` — the surface thickens under the press that dismisses it                                                     |
| `:focus-visible` | `ring-2 ring-primary ring-inset` — inset, since the button is flush with the shell and an outset ring has nothing to sit on |
| `:hover`         | **None** — the one exception recorded in § 3.2.                                                                             |
| Focus            | `autoFocus` on mount                                                                                                        |
| A11y             | **No `aria-label`** — the accessible name is the visible copy itself; the glyph is `aria-hidden`                            |

**It is a button, not a backdrop with an `onClick`.** While it is up it is the screen's only control, so it has to take focus and answer `Enter` / `Space` — which a `<div>` would need `role`, `tabIndex` and a hand-written key handler to imitate, and would still not be in the tab order the way § 3.2. expects.

**Focus is taken, not merely offered.** It is usually still in the composer when the overlay arrives, and a user who keeps typing would be filling a field they can no longer see. `autoFocus` moves it here; `REQUIREMENTS.md § 8.4.1.` also makes any keystroke wake the stream, so the two together mean no key is ever swallowed by the screen behind.

**No `aria-label`.** A label on the button would override the whole accessible name computation and reduce it to that one string — the reason and the hint below would then never be announced, which is the opposite of what a screen that has covered itself owes a screen-reader user. The visible copy _is_ the name.

**It does not wear `glass`, and that is the one place § 3.5.1. is not followed.** That utility exists for floating chrome sitting _on_ content — the bars, the install banner, the floating icon buttons — where hiding what is underneath is the point. This covers the content instead, and at `canvas/75` the screen behind is gone rather than merely paused, which reads as a page that failed to load. `canvas/45` over a lighter blur keeps the conversation legible underneath, so the state is obviously temporary. It is spelled out at the call site precisely because it must not drift into the shared utility every bar reads.

**Nothing behind it is made `inert`.** The content underneath stays focusable, which a modal would not allow — but this is not a modal: it is a state the app is in, any keystroke leaves it, and taking focus on mount already puts the one control first in line. A trap here would have to be released on wake and would fight the composer for focus on the way back.

**No `:hover`.** The surface is the entire screen, so a hover state would fire wherever the pointer already happened to be resting when the overlay appeared — it would read as the overlay reacting to nothing.

**The reason is written out, not implied by the glyph alone.** A screen that has covered itself with no explanation reads as a fault; `한동안 쓰지 않아 서버 연결을 잠시 끊었어요.` says the app chose this, and the `caption` line below says how to leave.

**It says 서버 연결, not 실시간 연결.** The earlier copy was accurate only while this lived on 채팅. Dormancy now shuts the request gate for the whole app (`REQUIREMENTS.md § 8.4.1.`), and on 캘린더 or 보관함 — which never held a stream — naming the socket would describe something that screen never had.

**It appears on all four tabs.** An earlier revision scoped it to 채팅, on the reasoning that the socket is scoped there (`REQUIREMENTS.md § 8.4.2.`) and the other screens had no connection to report. That stopped being the whole story when dormancy took over the request gate: a dormant 보관함 refuses every request it makes, so a screen without the overlay would silently fail to load anything with nothing on it to explain why or to tap. The objection that killed the earlier revision — covering a calendar the user is actively reading — is answered by the countdown rather than by scope: `pointerdown` and `keydown` reset it, so the overlay only reaches a screen genuinely untouched for `SSE_IDLE_TIMEOUT`.

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
