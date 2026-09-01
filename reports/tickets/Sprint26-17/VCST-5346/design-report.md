# VCST-5346 — [Missions][Frontend] Missions & Challenges — `/qa-design` audit

**Check type:** design-system + BL-UI invariants + UX heuristics + `vs. DESIGN` · **Env:** vcst-qa storefront @ Theme `2.57.0-pr-2396-5924-59243682`, store `B2B-store` (USD/en-US verified via `td:reconcile:store`), active preset **Red** (`--color-primary-500 #e52121`) · **Lane:** playwright-chrome (see Caveats) · **Date:** 2026-08-28

**Summary.** Layout fundamentals are sound — spacing on-grid, alignment drift 0 px, no horizontal overflow at any viewport, zero shift on modal-open and paginate, full German localisation. The defects cluster in three places: the **mobile SKU modal** (every product name truncates to `AGENT-TEST…`), the **shared focus indicator** (1.63:1 where 3:1 is required — and the design system's own token is what produces it), and **four surfaces the design specifies that do not exist in code** (order-modal banner + "Redeem products" CTA, the "Catalog" link, the whole AC-1 notification set, the registration preview). **Verdict: PARTIAL** — 2 High, 1 AMBIGUOUS-escalate, 7 Medium, 4 Low new findings; design axis RAN.

## Design-system consistency

| Category | Verdict | Evidence (computed / measured) |
|---|---|---|
| Semantic colour tokens | **FAIL** `WCAG 1.4.1` | dark: `--color-primary-500` == `--color-danger-500` == `#d34247` (identical); light `#e52121` vs `#de3131` = **1.00:1** apart. In-progress bar vs near-expiry badge indistinguishable |
| Token usage (no literals) | PASS | badge/bar backgrounds resolve to `--color-{danger,warning,success}-500`; rendered `rgb(222,49,49)` / `(252,158,0)` / `(62,132,91)` |
| Text contrast — light | PASS `WCAG 1.4.3` | 16/16 probes ≥ required; thinnest `vc-pagination__page` 4.59:1, `mission-card__note` 4.74:1 |
| Text contrast — dark | **FAIL** `WCAG 1.4.3` | `vc-pagination__page` **4.37:1** (needs 4.5) — `#0a0a0a` on `#d34247` |
| Non-text / icon contrast | PASS `WCAG 1.4.11` | 95 evaluated, 2 disabled-exempt, 0 real; 1 flagged (1.15:1) adjudicated **decorative** — `.vc-container__bg` watermark |
| Focus indicator | **FAIL** `WCAG 1.4.11 / 2.4.11` · `PROPOSED-BL-UI-009` | ring `#e52121 @ 30%` → `rgb(247,188,188)` = **1.63:1** vs white. Real-Tab confirmed on `vc-input__container` + `vc-button`. **Matches the design token exactly** — see N3 |
| Spacing grid `BL-UI-002` | PASS (missions) | 359 + 166 elements vs the 39-value derived `SPACING_GRID`. Only off-grid = `vc-chip__content` 7.008 px — shared VcChip, pre-existing |
| Alignment `BL-UI-005` | PASS | grid-row centre drift **0 px**, height drift **0 px** @1280/768/de; modal row centre 0; footer buttons 0/0 |
| Overflow `BL-UI-004` | PASS page / **FAIL** mobile modal | document never scrolls (1280/1024/768/375). SKU modal @375 truncates all product names — N1 |
| Touch targets `BL-UI-006` | **FAIL** (1 element) + WARN tier | Below-AA: `missions-banner__link` **86.9×18** (N7) — genuine FAIL. Stepper 32×32 and qty input 56×30 are **≥24 AA, in the AA→AAA WARN tier**, and 32 is a declared `UI_KIT_BUTTON_SIZES_PX` value — see N2 |
| Image aspect `PROPOSED-BL-UI-010` | N/A | all 12 banner + 3 product images use `object-fit` → correctly exempt |
| Alert semantics `WCAG 4.1.3` | N/A | 0 alert-like elements in any state reached |
| CLS `BL-UI-001` | **FAIL** | **0.2195** over 2 shifts (≥0.1 fail). Attributed sources are shared chrome (`mega-menu__nav`, `account-navigation-item`, `vc-widget`), **not** mission cards |
| State shift `BL-UI-003` | PASS | modal open Δtop/left/h = **0/0/0**, scrollY 0→0; paginate Δ0 |
| Occlusion `PROPOSED-BL-UI-007` | env-only | QA env badge (68×22, `z-index 21`) covers the 20×20 dark-mode toggle — `elementFromPoint` @1024, Playwright interception + x-overlap @1280. Non-production affordance |

## Design spec diff (`vs. DESIGN`)

**Source read:** feature project `e3742011-…` "E-commerce missions feature" (type `PROJECT_TYPE_PROJECT`, owner Andrey) — artboard `Missions Screens Overview.dc.html` (8 frames) plus its embedded design system `_ds/virto-commerce-frontend-design-system-518d0b90-…/{brand-palette,colors_and_type}.css`. **unresolved: 0 for the values below; expectations were relayed from the artboard source by hand, NOT via `extractDesignSpec`** — so parity coverage is partial, not exhaustive, and the axis is **WARN** on that basis. Every geometry verdict below was additionally cross-checked against **vc-frontend source at PR #2396** (`client-app/modules/loyalty/`), so the axis is spec + live + source rather than spec + live. Frame legend: F1 desktop section · F2 order-value modal · F3 SKU modal · F4/F5/F8 notification popups · F6 registration preview · F7 mobile carousel.

| Axis | Item | Spec | Live | Verdict |
|---|---|---|---|---|
| TOKEN | `--color-danger-500` (light) | `#de3131` | `rgb(222,49,49)` | **CONFIRMED** |
| TOKEN | `--color-warning-500` | `#fc9e00` | `rgb(252,158,0)` | **CONFIRMED** |
| TOKEN | `--color-success-500` | `#3e845b` | `rgb(62,132,91)` | **CONFIRMED** |
| TOKEN | `--color-primary-500` | `#f99e24`, declared **recolorable per brand/theme** | `#e52121` (Red preset) | **UNSPEC by contract** — a recolor is sanctioned, not drift |
| TOKEN | dark-mode values | no dark artboards exist | `#d34247` | **UNSPEC** — the WCAG 1.4.1 collision stands on the invariant, not the spec |
| TOKEN | focus ring | `--focus-color: rgb(from var(--color-primary-500) r g b / 0.3)` | `#e52121 @ 30%` → 1.63:1 | **CONFIRMED** → **AMBIGUOUS**, see N3 |
| GEOM | order-modal banner (F2) | `height:170px` + image | `imgs: []` — no banner; `order-mission-modal.vue` template contains no `VcImage` | **MISSING** (source-confirmed) |
| GEOM | order-modal footer (F2) | `Close` h44 **+ "Redeem products"** primary CTA h44 `flex:1` | 2 Close controls; the `#actions` slot declares a single `VcButton` = Close | **MISSING** (source-confirmed) |
| GEOM | card banner (F1, F7) | `height:150px` | **144** — `mission-card.vue` declares `@apply … h-36` | **DRIFT** 6 px (source-confirmed) — but 150 is off the design system's own Tailwind scale (`h-36`=144, next step 152); recommend the spec adopt 144 |
| GEOM | mobile pattern (F7) | 1 card + **3 dots** (active 18×6 `primary-500`, 6×6 `neutral-300`) + "1 / 3" | `display:grid` 1 col, `scroll-snap:none`, numbered `vc-pagination` | **DRIFT** (pattern) + **MISSING** (dots / swipe affordance) |
| GEOM | days-left severity (F1 card 2, F3 header) | **8 days → `warning-500`**, declared twice | `useMissionCard.ts`: `const DATE_DANGER_DAYS = 10` — *"Below this many days left the date indicator turns red"* ⇒ 8 d renders **danger** | **DRIFT — CONFIRMED on both sides from source.** No fixture needed; see N10 for the ladder |
| GEOM | "Catalog ›" link in "Redeem your points" (F1) | link, `primary-400` | panel has **zero interactive descendants**, while `en.json` ships `redeem_banner.catalog: "Catalog"` | **MISSING** (source-confirmed) — the string and the design both exist, the markup does not |
| GEOM | SKU-modal `Cart subtotal` (F3) | `$726.00`, formatted | bare `0` | **DRIFT** — confirms F5 against the spec |
| GEOM | SKU-modal `Targets met` (F3) | `1 of 4`, derived from the **modal's own** stepper quantities | seeds from backend progress | **DRIFT** — anchors F8 |
| GEOM | order-value card footer (F1) | `$3,500 spent` — spent only; the target lives in F2's "Mission target" panel | card shows spent only (`presentOrderValue` passes `{ sum }` alone) | **CONFIRMED** — and the modal *does* render the target via `value_requirement` + a percent bar, so **F9 is withdrawn** |
| GEOM | stepper button (F3) | `width:32px;height:32px` | 32×32 | **CONFIRMED** → N2 |
| GEOM | card action button (F1) | 40×40 | **44×44** | **DRIFT** +4 px — the implementation *exceeds* the design and improves BL-UI-006 |
| GEOM | product thumb (F3) / modal close (F2,F3) / state dot (F1) | 64×64 / 34×34 / 9×9 | 72×72 / 68×68 / 10×10 | **DRIFT** — all larger than spec; cosmetic, no action |
| GEOM | progress track (F1) | `height:8px` | 8 | **CONFIRMED** |
| GEOM | AC-1 notification set (F4, F5, F8) | "New missions available" + `View missions`; "Congratulations!" + `+4,500` + per-mission breakdown + `Redeem products`/`Got it`; mobile bottom sheet | no surface of any kind | **MISSING** — the whole feature, precisely specified. Confirms F6 |
| GEOM | registration preview (F6) | welcome-mission teaser, banner 130 px | absent; and no AC on the ticket either | **MISSING** — design-declared, never specified |
| ICON / STROKE | — | artboard icons are inline SVG at `stroke-width` 1.7–2.6, no `vector-effect`, no stepped ladder | — | **SKIPPED** — no stroke scale to diff |

## Sized controls (token / aspect equality, not thresholds)

| Control | Rendered | Aspect | Verdict |
|---|---|---|---|
| Stepper − / + | 32×32 (n=3 each) | square ✓ | PASS desktop · **WARN mobile** (AA→AAA tier; equals spec + UI-kit size) |
| Qty input | 56×30 (n=3) | — | PASS AA · WARN mobile |
| Progress track / fill | 219×8 / 0–219×8 | — | PASS (height uniform 8, equals spec) |
| State badge dot | 10×10 (n=12) | square ✓ | PASS (spec 9 — 1 px) |
| Card banner + image | 301×144 (n=12, identical) | — | PASS internally · DRIFT vs spec 150 |
| Modal close × | 68×68 | square ✓ | PASS |
| Card action / icon | 44×44 / 20×20 (n=12) | square ✓ | PASS |
| Product image | 72×72 (n=3) | square ✓ | PASS |

## State-stress matrix

Default (signed-in) **PASS** 1280/768/375 · Completed 100 % **PASS** (`success #3e845b`, bar `success-500`) · Near-expiry 5 d **PASS** render (`danger #de3131`; threshold unverifiable) · Zero-target renders `1 of 0 orders` (**F4**) · Qty 0 / disabled Add-to-cart **PASS** (validation working, not a defect) · Dark theme **FAIL** (token collision + pagination 4.37:1; no FOUC; reached by keyboard, pointer blocked by the QA badge) · de-DE **PASS** (all strings localised, `16.630` separator, row heights 363 uniform — **F12 does not reproduce**) · Anonymous deep link **404**, no sign-in route (**F2**) · Pagination page 2 **PASS** layout (Δ0) but URL unchanged (N9) · Empty **SKIPPED** (audit account holds 13 missions) · Loading / skeleton **SKIPPED** (no network-throttling tool in this lane).

## New findings

N1, N10, N13, N14 came from **visual review**, not from any measurement snippet.

| # | Sev | Finding |
|---|---|---|
| N1 | **High** | SKU modal @375: the item row stays a 3-col `flex-wrap:nowrap` (72 px img + **95 px** info + 128 px stepper), so **all three product names truncate to `AGENT-TEST…`** — a mobile user cannot tell which product each stepper controls. `BL-UI-004`, Nielsen #6. Sighted users get strictly less than AT (the full name stays in the DOM). The design specifies **no** mobile SKU modal (F3 is 660 px desktop-only), so this is **UNSPEC** — a design gap as well as a live defect |
| N3 | **High / AMBIGUOUS — escalate** | Focus ring **1.63:1** vs white (needs 3:1), real-Tab confirmed on shared `vc-button` + `vc-input`. **The implementation matches the design system exactly** (`--focus-color` = primary-500 @ 30 %; 30 % of `#e52121` over white = `rgb(247.2,188.4,188.4)`, measured `rgb(247,188,188)` — an exact match). A ≤40 % alpha ring cannot reach 3:1 on white for any mid-luminance hue, so the **token contract is the defect** — fix in `preflight.scss` / `_colors.scss`, not in missions. Per skill precedence, a spec conflicting with WCAG is AMBIGUOUS → design-system owner, not a component bug |
| N2 | ~~High~~ **WARN — do not file as a failure** | Stepper 32×32 / input 56×30 with **1 px** separation @375. Downgraded on three independent grounds: ≥24 px passes `WCAG 2.5.8` **AA** (44 is 2.5.5 **AAA**); BL-UI-006 puts AA→AAA in its **WARN** tier and says to cross-check `UI_KIT_BUTTON_SIZES_PX`, where **32 is a declared size**; and design F3 declares 32×32. Filing it High is the exact false positive BL-UI-006 was written to prevent (13 of 36 failures in REG-2026-07-24-2121). **Oracle feedback:** BL-UI-006's flat "≥8 px gap" clause has no exception for a *segmented* control, so it fails the design's own bordered stepper group, while WCAG 2.5.8's spacing test (32 px centres) passes it → route to `/qa-review-oracles` |
| N4 | Med-High | `--color-primary-500` == `--color-danger-500` (`#d34247`) in dark; **1.00:1** apart in light. The root cause is structural: the palette contract lets a brand recolor primary to red while danger is declared **static** red, so a red-primary tenant collapses "in progress" and "expiring" with no guard. `WCAG 1.4.1`. Design-system level, like N3 |
| N5 | Medium | CLS **0.2195** on `/account/missions`; the attributed sources are shared chrome, not mission cards — scope before filing |
| N6 | Medium | "Redeem your points" panel (463×98) has zero interactive descendants, no role, `cursor:auto`. Now **spec-anchored**: F1 declares a "Catalog ›" link. Fold into **F3** |
| N7 | Medium | `missions-banner__link` ("Points history") **86.9×18** — the one genuine **below-AA** touch target, at 375/768/1280. `WCAG 2.5.8`, `BL-UI-006` |
| N8 | Medium | Dark-mode `vc-pagination__page--active` **4.37:1** (needs 4.5). `WCAG 1.4.3` |
| N9 | Medium | Paginating does not change the URL — page 2 is not linkable, not refresh-safe, and Back does not undo it |
| N10 | **Medium — source-proven** | The date ladder collapses three design states into two. `resolveDateSeverity` returns `success` **only** when `status === Completed`, `danger` when `daysLeft < 10`, and `warning` for everything else — so a mission with 30 or 180 days left is amber, and the design's F6 `success-500` at "30 days left" is **unreachable by construction**. Design declares danger @4 d, warning @8 d, success @30 d; code gives danger <10 d, warning ≥10 d. Both the threshold and the missing third state are one fix |
| N11 | Low-Med | "In stock" badge renders a bare number (`584`) with no **visible** label; the accessible name exists only for AT |
| N12 | Low | German sidebar lowercases German nouns — "Aufgaben & **h**erausforderungen" (the H1 correctly reads "Herausforderungen"); also "Gutscheine & aktionen", "Gespeicherte kreditkarten" |
| N13 | Low | Balance-banner label wraps to 3 lines @375 ("VIRTO / REWARDS / BALANCE") while competing with the link for width |
| N14 | Low | `.missions-banner--dark` renders **white** in dark mode — the brightest element on the page; the modifier name inverts against its appearance |

**Out-of-scope / incidental:** **O1 Medium** — language selector: every option's flag `alt` is "English (United States)", so AT hears "English (United States) Deutsch" (`WCAG 1.1.1 / 4.1.2`). **O2 Low** — QA env badge occludes the dark-mode toggle (env-only; it blocked this audit's own theme switch). **O3 Low** — sidebar labels wrap to 2 lines ≤1024 px; `word-break:normal` and no clipping, so the apparent mid-word break is **unconfirmed**.

**Already-filed — scope changes only:** **F2** severity arguably understated (a campaign's natural entry is an email link to a logged-out user, and the 404 offers no sign-in route). **F3** now spec-anchored — F1 declares the missing "Catalog ›" link (fold N6 in). **F5** confirmed against F3's formatted `$726.00` subtotal. **F6 (AC-1)** confirmed **MISSING** against three fully-specified frames (F4/F5/F8) — this strengthens the PO route; the registration preview (F6-the-frame) is a *fourth* design-declared surface with no AC at all. **F8** anchored: F3 derives `Targets met` from the modal's own quantities. **F9 — WITHDRAWN, do not file.** The card showing spend without a target matches design F1, and `presentOrderValue` passes `{ sum }` alone by design. The modal *does* render the target: `requirementLabel` → `order_modal.value_requirement` with `targetMoneyValue.formattedAmount`, beside a percent bar. The only residual is cosmetic — the design's right-hand cell reads `$3,500 of $5,000` where code puts the target in the left cell — information-equivalent, not a defect. **F10** splits: the generic accessible name ("Open mission" ×12) is **CONFIRMED**; "modal background not hidden from AT" is **REFUTED** — the app root carries `aria-hidden` *and* `inert`, Escape closes, focus returns to the trigger. **F12** does not reproduce on de-DE.

## UX heuristic scorecard (Nielsen, 0–4; +1 on revenue-critical)

**6 Recognition over recall — 3** mobile product names unreadable (N1). **9 Error recovery — 3** anonymous deep link dead-ends at 404 (F2). **1 Visibility of status — 2** amber for all live missions (N10), bare `0` subtotal (F5), unlabelled stock number (N11). **2 Match real world — 2** the red progress bar reads as failure (N4). **3 User control — 2** pagination absent from URL/history (N9). **4 Consistency — 2** `--missions-banner--dark` inverts (N14); card↔modal progress disagreement (F8). **7 Flexibility — 1** keyboard-first modal focus lands on a product link, so the first Enter leaves the mission. **5, 8, 10 — 0–1** nothing worth filing.

## Caveats — measurement validity

1. **Design axis: spec values were read from the artboard by hand, not via `extractDesignSpec`.** `DesignSync` is not in the sub-agent tool registry, so the source was read in the parent session and the extractor was never run against it. Every value above is quoted from the named frame, but **parity coverage is partial, not exhaustive** — an extractor run may surface expectations this table does not contain. That is why the axis is WARN rather than clean.
2. **Lane deviation.** Ran on `playwright-chrome`, not the assigned Chrome DevTools MCP, because only the Playwright lane has `--secrets` NAME substitution, which keeps the account password redacted. Worth reconciling in `.claude/rules/agents.md`.
3. **Three defects in `measure-layout.ts` distorted first-pass results** — all corrected before any finding above was recorded: (i) `contrastAuditSnippet` resolves a fully transparent `html` background to **black**, manufacturing 13 phantom 1.06:1 failures on text that is actually 19.8:1; (ii) neither contrast snippet parses `color(srgb …)`, which vc-frontend emits widely — **8 of 14** probes were silently skipped, including every muted grey; (iii) the spacing audit counts a resolved `margin:auto` as off-grid. Fix upstream.
4. **Two selectors were mis-scoped** and their first results discarded: alignment across all 12 card footers (not a horizontal group), and a `depth`-limited snapshot that made the German card footer look empty — nearly a phantom blocker. **`584 / 25 / 45` are `In stock`, not progress.** `reports/regression/history.json` and two `BUG-loyalty-mission-*.md` drafts belong to a parallel session — untouched.

**Evidence:** `screenshots/` — `missions-default-desktop`, `missions-default-mobile`, `missions-dark-desktop`, `missions-anonymous-404-desktop`, `modal-ordervalue-desktop`, `modal-sku-desktop`, `modal-sku-mobile`. Console clean.
