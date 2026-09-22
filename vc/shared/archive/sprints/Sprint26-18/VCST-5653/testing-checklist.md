# Testing checklist — VCST-5653 · [UI-Kit] Focus indicators (WCAG 1.4.11 / 2.4.7)

Run 2026-09-10 · Path **FULL** · Flow `feature-test` · Sprint26-18 · Verdict **PASS WITH NOTES**
Build: `vc-theme-b2b-vue-2.58.0-pr-2468-8e45-8e45ee74` on vcst-qa (vc-frontend PR **#2468 — OPEN, not merged**)
Model: `reports/ba/test-models/VCST-5653-2026-09-10.md` (21 scenarios) · Oracles BL-A11Y-001/-003, BL-UI-003/-004, BL-WL-002, ECL-15.1

**The ticket carries no acceptance criteria** ("1. No requirements."), so every condition below is a
gap-AC reconstructed at `1d` from the PR body + WCAG 1.4.11 / 2.4.7 + the BL-A11Y invariants. The PR
description is `{SPEC}`; the derived preset matrix is the contrast oracle. **With Artifact A skipped
(UI-kit rule), this file is the run's only durable record** — a verdict that lives only in a chat relay
is not evidence, and a blank row reads as a clean one.

**Phases were serialized on purpose:** Phase 2 changes the store's theme preset — shared mutable config —
so nothing else may observe the storefront inside that window. Ring measured live under Red:
`#3b82f6` (accent-500) light, `#4ccce6` (accent-600) dark, `outline-offset 2px`, `-2px` at inset sites.
Lanes: P1 `playwright-chrome` · P2 `playwright-edge` · P3 Chrome DevTools · discovery `playwright-firefox`.

**`3-exec` gate, closed inline:** `td:validate` green (DV-021…024 ✓, exit 0, re-run directly — the gate
sheet's own invocation returned `exit null`). All 14 reconstructed conditions map to an item; **5653.14
(is the Admin SPA in scope?) resolves OUT OF SCOPE by the diff** — all 44 changed files are
`client-app/**` + `storybook-styles/**` + `package.json`, so BL-UI-007 is not in this verdict.
**`data_surface: false`**, no `test-data-engineer` dispatch: no `@td()` alias or seeded entity is named,
the env already supplies every surface, and the one divergence the fixtures lack (a non-selectable pickup
point) is named at 1.7 with a fallback. Credentials `USER_EMAIL` / `USER_PASSWORD` from `process.env`
after importing `config.js` — `USER_PASSWORD_VCST` exists but is **empty**.

## Phase 1 — Red preset, light + dark. No config changes.

| # | Condition | Verdict | Measured |
|---|---|---|---|
| 1.1 | Real `Tab` from the top of `/` rings every stop in DOM order, light | **PASS** | 35 consecutive stops, all `2px solid rgb(59,130,246) off 2px`, `:focus-visible` true |
| 1.2 | Same traversal, dark — ring resolves `accent-600` | **PASS** | 13 stops, all `2px solid rgb(76,204,230)`; differs from 1.1 and equals dark `accent-600` |
| 1.3 | Mouse click on a non-editable control draws **no** ring | **PASS** | Theme toggle + a modal trigger: `outline-style: none`, `:focus` true, `:focus-visible` **false**. Repeated in dark |
| 1.4 | Editable input rings on click; readonly does not | **PASS** (deviation) | Editable rings on `.vc-input__container`. **Readonly also rings** — but `:focus-visible` is granted by Chromium, not PR CSS, and the control is a keyboard-operable combobox. The AC was stricter than the browser |
| 1.5 | VcButton / VcChip / **VcNavButton** still ring — all three deleted their local rules and now depend only on the global `preflight.scss` rule | **PASS (3/3)** | Button ✓ Chip ✓. NavButton verified both modes on the one PDP with ≥5 images: Tab-reachable, `rgb(59,130,246)` light / `rgb(76,204,230)` dark. `image-gallery.vue` binds them as Swiper `prevEl`/`nextEl` with `:loop="images.length > THUMBS_PER_VIEW"` (=4), so ≤4 images ⇒ native `disabled`. xAPI scan of 3000/4549 products: `{0:1, 1:355, 2:2641, 4:2, 5:1}` — **one** qualifies. `FIX-1.5-navbutton-pdp-*` |
| 1.6 | Checkbox / radio ring on the indicator via `input:focus-visible + &` | **PASS** | `span.vc-checkbox__indicator` 20×20 and `span.vc-radio-button__indicator` 16×16, both `2px solid rgb(59,130,246) off 2px` |
| 1.7 | Radio `no-indicator` (checkout pickup list) — is a non-selectable row focusable, and does anything ring? | **BLOCKED — data** | All 50 BOPIS pick points are `selectable: true`; zero carry `vc-radio-button--no-indicator`. The variant has no surface in this env's data, so the WCAG 2.4.7 claim is **unverified, not cleared**. Storybook fallback not executed |
| 1.8 | Inset sites not clipped (menu-item, VcScrollbar, carousel button) | **PASS (3/3)** | Menu-item inside a `UL.vc-scrollbar`, and the carousel button (48×208): both `2px solid rgb(59,130,246)` at `off -2px`, inside the bounds |
| 1.9 | Focus displaces no neighbour (BL-UI-003) | **PASS** | Six neighbour/ancestor rects byte-identical to 2 dp with focus on vs off; `scrollWidth` 1905 ≤ `innerWidth` 1920. Every unfocused element `outline-style: none` — no call site substituted a `border`/`box-shadow` |
| 1.10 | Modal mouse-opened, Escape-closed → focus returns to trigger; does it ring? | **PASS** (both facts) | `.vc-modal` has `role=dialog`, `aria-modal=true`, `aria-labelledby`. Mouse-open → focus inside, `outline-style: none` (correct). Escape → closes, focus returns to the exact trigger **and rings** |
| 1.11 | CyberSource on `/cart`: rings on Tab **and recolours on a mid-step theme toggle** | **PASS** | Focused `#cardNumber-container` = `2px solid rgb(59,130,246)`; toggled mid-step, iframes survived without remount, re-focus = `2px solid rgb(76,204,230)`. **`readCssVar` holds** |
| 1.12 | Datatrans secure fields — does the SDK's `.focused` class also ring on mouse? | **NOT_APPLICABLE — this store** | Datatrans here is hosted-**redirect**, not secure-fields: `/cart` renders no card form; `/checkout/payment` shows the redirect notice. No wrapper of ours exists to ring. Every stop on that page rings correctly |
| 1.13 | Skyflow: correct ring colour at mount, and the `#1b789b` fallback is not what renders | **PASS** | Decoded the v2.7.9 element config: all four fields carry `box-shadow: 0 0 0 2px #4ccce6` (dark) / `#3b82f6` (light). `#1b789b` occurs **0 times** in the 5,923-char payload |
| 1.14 | Sales-rep `layout-block` — does a **mouse** grab also ring? (scenario #21) | **PASS — #21 REFUTED** | Surface is `/company/dashboard`, not `/account/dashboard`. As the rep fixture: keyboard grab rings `solid 2px rgb(59,130,246)` + halo, announces "grabbed. Position 1 of 6", and **the ring persists across `ArrowRight`** (the no-flicker property). Mouse: click → `:focus-visible` false, no ring; mid-drag → `aria-pressed="false"`, `outline dashed 1px rgb(229,33,33)`, **no 2px ring**. `aria-pressed` is written only by `useKeyboardSort`'s Space/Enter branch; the pointer path runs through Sortable. `FIX-1.14-*` |

## Phase 2 — Coffee window (operator-approved; Admin SPA click-through only, never a REST store PUT)

| # | Condition | Verdict | Measured vs derived |
|---|---|---|---|
| 2.0 | Record the current preset verbatim before touching anything | **PASS** | `red`, screenshotted with the option list; link lists untouched |
| 2.1 | Coffee light — header-top, footer-top, mobile-menu | **FAIL** | **2.97 · 2.97 · 2.97**, ring `#447d9c` on `#3d2b24` — reproduces the derived 2.97 exactly |
| 2.2 | Coffee light — body, header-bottom, footer-bottom, card | **PASS** | 4.32 · 4.51 · 3.90 · 4.51 — all as derived |
| 2.3 | Coffee dark — all 7 surfaces (regression guard on "dark already passes") | **PASS** | 4.53–5.19, ring `#588aa3` — all as derived |
| 2.4 | Mobile menu at ≤500px, where it is actually reachable | **FAIL** | 400×900, hamburger open, Tab ×5 to "Home": **2.97** light / 4.67 dark |
| 2.5 | Preset restored and the storefront verified rendering | **PASS** | Restored to `red`, verified from **two independent sources** (Admin field + storefront resolving `--color-primary-500: #e52121`); renders, 0 console errors. Window ≈18 min |

## Phase 3 — Storybook isolation + axe

Preset via `?globals=themePreset:<coffee|red>;darkMode:<light|dark>`. The preset applies by **async
dynamic import**, so a capture taken too early silently audits the *previous* preset — every check polled
until the token resolved before asserting.

| # | Condition | Verdict | Measured |
|---|---|---|---|
| 3.1 | Sampled UI-kit sweep, both gated presets × both modes | **PASS 20/20** | 5 components × 4 combos; identical values per preset/mode confirm one shared token. Coffee `#447d9c`/`#588aa3`, Red `#3b82f6`/`#4ccce6` |
| 3.2 | Storybook vs app — no divergence | **PASS** | The preflight-silently-deletes-the-focus-rule failure this PR fixed does not reproduce |
| 3.3 | axe-core on 3 representative surfaces, gated presets | **PASS** | 0 violations, 6/6 runs; only an expected `bypass` incomplete on an isolated component |
| 3.4 | **Negative control** on purple-pink must still report violations | **PASS — harness validated** | 1 `color-contrast`, impact **serious**. So 3.3's zero is a real clean pass, not a harness that never ran |
| 3.5 | `prefers-reduced-motion: reduce` suppresses the bundled VcButton pressed transition | **PASS by DERIVATION** | DevTools MCP has no reduced-motion axis. Closed from the deployed CSS: the whole `.vc-button` transition **and** the `:active` `75ms` sit inside `@media (prefers-reduced-motion: no-preference)`, so under `reduce` none is declared. **Behavioural confirmation still owed** to a Playwright lane with `--reduced-motion=reduce` |

## Phase 4 — from the `3x` discovery lane (net-new; none of these came from the ACs or the PR)

| # | Condition | Verdict | Measured |
|---|---|---|---|
| 4.1 | `VcSlider` price-facet histogram columns — is the focus indicator usable? | **FAIL** | Focused `button.vc-slider__button` = `2px solid rgba(0,0,0,0)` on a 2×36px box. Compensating ring on `.vc-slider__col-line` = **2 × 3.5 px** for `"Column with 1 items"` vs 2 × 35 px for a 10-item bucket (`height: 10%` vs `100%`). 13 focusable stops on a default `printer` search. **Handles and number inputs unaffected** — they ring correctly. Empty-bucket end inferred from the height formula, not observed (this data's minimum is 1) → **VCST-5947** |
| 4.2 | Do those columns expose a role and accessible name? | **REFUTED — not a defect** | Real `<button>`s with `aria-label="Column with N items, range from X to Y"`, resolving from the a11y tree under `group "Range slider from 20 to 7519"`. The original "empty subtree" was measured with the accordion **collapsed**, giving every button a `[0,0,0,0]` rect |
| 4.3 | The skip-link bar is tab stop #1 on every page and is in no matrix | **PASS ×3** (new surface) | Ring vs `--color-primary-50`: Coffee light **4.02**, Coffee dark **4.47**, Red light **3.30**. All pass; Red light by only 0.30 — the thinnest margin anywhere, on a surface no gate covers |
| 4.4 | Does the focused column's tooltip stay inside its card? | **FAIL** | Tooltip renders x 214–324 / y 175–202 while the card's left edge is x 252 and "PRICE" sits at ~265,171 — it escapes the card **and** covers the heading. Two buckets. Compounded by 4.1: it is currently the only perceptible focus affordance → **VCST-5947** |
| 4.5 | Skip-link reveal is `:focus`-gated while the ring is `:focus-visible`-gated — can a mouse user get a revealed bar with no indicator? | **PASS — hypothesis disproven** | `ul.skip-to-links` is `top:-40px; opacity:0; pointer-events:none` unfocused, so the predicted state cannot arise. Keyboard-reveal-then-click collapsed the bar, both links reported `:focus` false, and the next Tab landed on the first footer link |

**Two lanes disagreed once, and the deeper check won.** Phase 1 filed "VcSelect opens its listbox on
keyboard focus alone" as P4; Phase 2 chased it — the trigger *is* an `input` and sets `aria-expanded` on
focus (standard ARIA combobox), and all 21 closed `.vc-popover__content` nodes have
`offsetParent === null`, so they are not in the tab order. **Not filed.**

**A PR benefit found while closing 1.5:** the deployed bundle carries
`.vc-product-image__carousel-btn:focus-visible{opacity:1; outline:…; outline-offset:calc(-1 * …)}`,
absent at tag `2.57.0`. Without it those buttons would be focusable at `opacity: 0` — a keyboard stop
that renders nothing. This PR closed that latent hazard.

## Derived, not executed — recorded so the omission is visible

- **Tenant `color_vc_focus_ring` override** (scen. 17): an org override is accepted with **no contrast
  validation**, so a tenant can reintroduce the 1.63:1 bug this ticket fixed. Reachable only by
  provisioning an org preset override; derived from `BL-WL-002`, not executed.
- **Ungated preset failures** (derived): black-gold light footer-top **1.99**, footer-bottom **2.20**,
  mobile-menu **2.30**; purple-pink light footer-top **2.87**. Informational — `VC-UI-001` makes Coffee
  and Red the only gated presets, so these are known-unsupported, not bugs.
- **Removed public custom properties** (`--outline-color`, `--focus-color`,
  `--vc-radio-button-focus-color`, `--focus-ring`): confirmed absent from both the PR head and the
  deployed bundle. A fork overriding one silently gets nothing — a **declared** breaking change, so the
  finding is a missing changelog / release note, not a product defect.

## Regression scope

**No cross-suite sweep runs in this pipeline** (`5r`/C2 removed 2026-09-10, both paths) — this run
carries **no release recommendation**; the Feature Release Gate is `not-assessed`.
**Artifact A and the C1 case run were SKIPPED per the standing UI-kit rule**, so this run adds **no
durable regression coverage**; the route back in is `/qa-test-lifecycle`. The 11 IDs allocated for it
(`A11Y-FR-001..011`) were never written to any suite, so the block is free. `C1: skipped — no authored cases`.

Step 2a disposed **62 rows across 13 suites**: **62 KEEP, 0 REPAIR, 0 RE-BASE** — no row asserts a ring on
click and none names a removed token, so nothing was made wrong; several became newly load-bearing.
The literal invocation behind the 26-hit figure (a verifier could not reproduce it without this):

```
npm run tc:scope -- --domain cross-cutting,branding \
  --oracle BL-A11Y-001 --oracle BL-A11Y-003 --oracle BL-UI-001 \
  --observable "focus indicator" --observable "focus ring" --observable "outline" \
  --observable "keyboard" --observable "tab order" --observable "contrast"
```

⇒ 18 suites, 447 rows, **26 at risk**, 9 WILL_RUN / 17 NOT_EXECUTING. `066-seo.csv` NOT SCANNED (legacy
11-column header; hand-triaged as no-risk). Superseded by a corpus-wide grep, because the `--domain` axis
under-selects a token-layer change that has no domain: **13 suites / 62 rows**, adding b2b, bopis,
configurable-products, customer-reviews, loyalty, sales-rep, search, notifications.
Suites contributing zero cases, named rather than left silent: 041, 045, 048, 048c, 057, 005, 006, 009,
036, 070, 072, 083c, 088, 097.

## Flow gaps

The gaps this run found in the UI-kit testing flow itself are filed in
**`docs/repo-findings-backlog.md` as B-32…B-37** — no drift guard for the ring (B-32, the one to act on
first), `tc:scope` under-selecting a token-layer change (B-33), focus indicators having no executing
protection while `critical-ui-scope.md` has been all-`GAP` since 2026-07-25 (B-34), four UI-kit call
sites unexercisable on this env's data (B-35), reduced motion not emulable on the visual lane (B-36),
and no design-system domain map (B-37).

Two did **not** go there, because that file excludes them: the `088` row-147 citation drift
(`:focus-visible` ring citing BL-UI-006 where BL-A11Y-001 governs) belongs to `/qa-review-tests --fix`,
and the `playwright-firefox` click timeout was an un-restarted MCP server, resolved mid-run by the
operator rather than a repo defect.
