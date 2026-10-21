# Test strategy — VCST-5903

## Round 1 of 3 — 2026-10-19

Status: APPROVED (Elena Mutykova, 2026-10-19) · Depth label: deep (computed)
Blocked: no
Build: vc-frontend#2568 @ 3f8af63a · Stand: vcst (theme 2.61.0-pr-2568-3f8a-3f8af63a; QA Storybook image 2.61.0-alpha.2594-vcst-5903-vc-stat-widget-3f8af63a) · Deployed: yes · Previous: none
Floors fired: F2 (doubt: domain map ABSENT — purpose not readable) · F3 (rendering file vc-stat-widget.vue) · F5 (10 suites at risk: 011, 011b, 012, 013, 028, 029, 030, 072, 072e, 072f) · F8 (ui-kit files under client-app/ui-kit/) · F11 (hidden behaviour: default-values) · not fired: F1 (priority Medium; R4 High → exploratory anyway), F4 (no revenue flow named), F6 (no NOT DEPLOYED blocker), F7 (type Story), F9 (applied inside each floor), F10 (no org context)

**Mission.** Establish whether the new kit card `VcStatWidget` renders every state and variant correctly, accessibly and within its box on the PR's Storybook, so the follow-up Sales Rep Hub migration can adopt it, for the vc-frontend team and the PO.

### Inputs
| Input | What we have | Gap → project risk |
|---|---|---|
| Project environment | vcst; PR #2568 deployed (theme + QA Storybook, 8 VcStatWidget stories: Basic, Colors, Delta Colors, With Suffix, Loading, Error State, Prepend Slot, Row). Nothing on the storefront renders the component (PR: "nothing uses it yet"). No role or account needed. Lanes: chrome, firefox, DevTools free. F11 stand values: the diff reads no platform/store setting; the defaults are component prop defaults `color=neutral`, `deltaColor=neutral` (vc-stat-widget.vue:79) | P1 · P2 |
| Product elements | storefront ui-kit only: new organism `vc-stat-widget.vue` (+types, stories, vitest), barrel export + GlobalComponents (organisms/index.ts, types.d.ts), `ui_kit.stat_widget.loading/.error` in 13 locales | |
| Quality criteria | no ACs (Acceptance field: "No requirements.") — oracle is the two mockups (att 83239, 83164) + PR #2568 body · BL-UI-001…006 · WCAG 2.2 AA · KB-BC9F3CB1 (hub stat cards it is extracted from) · VirtoOZ absent, Context7: no page for the component (NEW) | P3 |

### Risks
| R | What a customer would see if this is wrong | Source | L×I | Level |
|---|---|---|---|---|
| R1 | The kit card cannot reproduce the hub/mockup card (icon+uppercase label, figure+unit, description, coloured delta with glyph, coloured start bar), so the hub migration changes what sales reps see | floor:F2 · att 83239/83164 · KB-BC9F3CB1 | 3×3=9 | Medium |
| R2 | A wrong default shows a wrong figure: blank row instead of a dash for a missing/whitespace value, "0" hidden, unknown or neutral color painting the wrong accent/delta | floor:F11 · client-app/ui-kit/components/organisms/stat-widget/vc-stat-widget.vue:79 · client-app/ui-kit/components/organisms/stat-widget/vc-stat-widget.vue:90 · client-app/ui-kit/components/organisms/stat-widget/vc-stat-widget.vue:102 | 3×3=9 | Medium |
| R3 | State precedence wrong: a retry shows the stale error instead of the spinner, the label disappears in error, or the loader blocks a prepend control | client-app/ui-kit/components/organisms/stat-widget/vc-stat-widget.vue:15 · client-app/ui-kit/components/organisms/stat-widget/vc-stat-widget.vue:45 | 3×3=9 | Medium |
| R4 | A long figure wraps mid-number or paints past the card; a long label breaks inside a word; cards in a row get unequal heights or misaligned figures (PR claims "figures never wrap" — no nowrap rule in the code) | client-app/ui-kit/components/organisms/stat-widget/vc-stat-widget.vue:140 · client-app/ui-kit/components/organisms/stat-widget/vc-stat-widget.vue:130 · BL-UI-004 · BL-UI-005 · att 83239 | 4×3=12 | High |
| R5 | Delta or error text is unreadable (below WCAG AA 4.5:1) in some colour or dark preset | client-app/ui-kit/components/organisms/stat-widget/vc-stat-widget.vue:167 · client-app/ui-kit/components/organisms/stat-widget/vc-stat-widget.vue:156 | 3×3=9 | Medium |
| R6 | A screen-reader user hears nothing for a card that mounts in error/loading, or hears the status twice | client-app/ui-kit/components/organisms/stat-widget/vc-stat-widget.vue:96 | 3×3=9 | Medium |
| R7 | A loading card under a sticky header draws its spinner over the header and blocks clicks | client-app/ui-kit/components/organisms/stat-widget/vc-stat-widget.vue:109 | 2×3=6 | Medium |
| R8 | Setting `--vc-stat-widget-bg-color/-border-color/-radius` does not restyle the card, or the unset defaults differ from the kit chain | client-app/ui-kit/components/organisms/stat-widget/vc-stat-widget.vue:105 | 3×2=6 | Medium |
| R9 | A non-English shopper's screen reader announces a raw key or drops the metric name | client-app/ui-kit/locales/en.json:172 (+12 locales) | 3×2=6 | Medium |
| R10 | The new barrel export / locale keys break an existing kit consumer or the storefront boot | organisms/index.ts:1 · floor F5 | 2×4=8 | Medium |

Project risks: P1 no consumer on the storefront → test on QA Storybook stories + controls (`&args=`); accepted. P2 QA Storybook answered 503 at 10:39 while redeploying (up at 10:46) → re-probe before Stage 2; BLOCKED if down. P3 no ACs → oracle is the mockups ({SPEC}) and the PR body (author's word); a mockup-vs-PR conflict goes to the PO as a question.

### Strategy mix
Analytical ✔ · Methodical ✔ · Consultative ✔ · Model-based ✔: R1, R2 are MODEL (F2, F11) · Reactive ✔: F2 fired, R6/R7 rest on {HYPOTHESIS}, feature is new · Regression-averse ✔: F5 fired · Process-compliant ✔: WCAG 2.2 AA in scope (R5, R6)

### Approach per risk
| R | Technique / approach | Oracle {authority} | Layer · tool | Lane · agent | Effort |
|---|---|---|---|---|---|
| R1 | MODEL | mockups att 83239/83164 {SPEC} | storefront · Storybook + Playwright | chrome · qa-frontend-expert | medium |
| R2 | MODEL | PR #2568 body + vc-stat-widget.vue:79 {SPEC} | storefront · Storybook controls | chrome · qa-frontend-expert | medium |
| R3 | ST, DT | PR #2568 body "loading outranks errorText" {SPEC} | storefront · Storybook controls | chrome · qa-frontend-expert | medium |
| R4 | BVA, VISUAL | BL-UI-004, BL-UI-005 {BL} · att 83239 {SPEC} | storefront · Storybook @375/1280/1920 | chrome · qa-frontend-expert | high |
| R5 | VISUAL | WCAG 2.2 AA 1.4.3 {DOC} | storefront · DevTools + axe | devtools · ui-ux-expert | medium |
| R6 | EXPLORE | announcement on first mount {HYPOTHESIS} | storefront · a11y tree | firefox · qa-testing-expert | medium |
| R7 | EXPLORE | overlay containment under a sticky header {HYPOTHESIS} | storefront · Storybook | firefox · qa-testing-expert | low |
| R8 | VISUAL | PR #2568 body token chain {SPEC} | storefront · DevTools computed styles | devtools · ui-ux-expert | medium |
| R9 | EP | PR #2568 body + en.json keys {SPEC} | storefront · locale files + Storybook locale | chrome · qa-frontend-expert | low |
| R10 | REGRESSION | existing suite assertions {OBSERVED} | storefront · /qa-regression | chrome/edge/firefox · test-runner-agent | low |

### Artifacts
| Artifact | Decision |
|---|---|
| Test model | RUN (new) — R1, R2 |
| Mind map | SKIP — domain map `ui` ABSENT and not built (single-layer chain, axes.md §2g) |
| Checklist | RUN (always) |
| Exploratory | RUN 30 min, FIRST — charter: R6, R7, R1 open cells, R4 edge widths |
| Visual lane | RUN (F3/F8) + token audit (R8) |
| Contract refresh | SKIP — the diff names no GraphQL operation and no REST contract |
| Coverage triage + regression | RUN — 10 suites (011, 011b, 012, 013, 028, 029, 030, 072, 072e, 072f), after Stage 2; staleness: tc:scope finds 0 rows naming the component, 0 stale |
| Verifier | SKIP — no Critical risk |
| Case authoring | never in the run (D2) — candidate cases are listed at close-out |

Lanes sequenced: Stage 2 runs chrome (checklist) ‖ firefox (exploratory) ‖ DevTools (visual); the F5 regression runs after they return.

### Data
No entities: every item drives Storybook story args (`&args=` / Controls). Must differ: `value` undefined vs `""` vs `" "` vs `"0"` (R2); `color` neutral vs unknown vs each named colour (R2); `loading=true` with `errorText` set vs `errorText` alone (R3); a figure at least as long as `$1,512,400.00` in a 176px card (R4). Before redeploy: none.

### Out of scope
- Storefront pages using the card — none exist until the Sales Rep Hub follow-up — residual risk Low
- `@vc-frontend/core` facade export — PR says not exported yet — residual risk Low
- vc-shell `VcWidget` (Vendor Portal) — different product — residual risk none

### Criteria
Entry: theme + Storybook carry 3f8af63a · env:check green · QA Storybook answers 200 with the 8 stories · Suspend (BLOCKED): QA Storybook down or not on the PR image
Exit: every in-scope R has a result or a named deviation · exploratory 30-min box spent · design-report.md written · regression run reported

### Amendments
- 2026-10-19 — Coverage triage + regression (F5, R10) NOT RUN: the user stopped REG-2026-10-19-1305 before dispatch ("we do not regression now"). Deviation below the F5 floor, by user decision. Staleness check had found 0 rows naming the component; R10 rests on A15 (storefront home + catalog boot on the PR theme, PASS) only. Residual: an existing cart/checkout/configurable flow broken by the barrel export or locale keys is unverified.
- 2026-10-19 — R10 re-scoped by the user: regression of suite 093 (Sales Rep Hub Dashboard) P0/Critical cases only (18 of 79), run REG-2026-10-19-1307 — the hub is the consumer VcStatWidget is extracted from (PR #2568).
- 2026-10-19 — R5 a11y scope narrowed by the user to the Coffee preset only ("for a11y use only coffee presets"). Black gold light secondary 3.36:1 (B1) is out of scope and recorded, not filed; its live investigation was stopped.

### Reconciliation (filled at close-out)
| R | Planned | Ran (item ids · charter · lane · case ids) | Result | Deviation — reason |
|---|---|---|---|---|
| R1 | MODEL S1, S2, S7, S8 · checklist | A1, A2, A7, B3 · charter X1, X6 · chrome/firefox/devtools | PASS — anatomy, tokens, suffix match; S2 PO question (unchanged trend: info vs neutral) | — |
| R2 | MODEL S3–S6, S9 · checklist | A3, A4, A5, A6, A8 · chrome | FAIL (A3 → VCST-6427, P3) · A5 BLOCKED (Storybook rejects an out-of-list colour; source shows the neutral path) | A5 test-steps defect — needs a direct mount |
| R3 | ST, DT | A9, A10 · chrome | PASS | — |
| R4 | BVA, VISUAL | A11, A12, A13 · charter X7–X10 · chrome/edge | FAIL (A11 → VCST-6428, P3: figure past the border @1024 / @480) · A12, A13 PASS | — |
| R5 | VISUAL | B1 · devtools | PASS in Coffee (≥ 4.53:1) | a11y scope narrowed to Coffee by the user; Black gold 3.36:1 recorded, out of scope |
| R6 | EXPLORE | charter X3, X4 · firefox | needs-review — status text present at first render (likely not announced); no screen reader run | MANUAL — toolkit has no screen reader |
| R7 | EXPLORE | charter X5 · firefox | PASS on computed styles (isolate contains the overlay) | live sticky-header overlap not built — no consumer page |
| R8 | VISUAL | B2 · devtools | PASS | — |
| R9 | EP | A14 · chrome | PASS (13 locales carry both keys) | non-en live not reached — no locale switcher in Storybook |
| R10 | REGRESSION | A15 · C2 093 P0 (REG-2026-10-19-1307) | PASS — 0 attributable failures (12 PASS · 2 FAIL stale cases · 4 BLOCKED) | F5 10-suite run (C1) dropped by the user; R10 rests on A15 + C2 |
| A-1 (amend.) | user re-scope of F5 | C1 NOT-RUN | — | user decision |
| A-3 (amend.) | user a11y scope | B1 | Coffee PASS | user decision |
| V1 (found) | visual lane | V1 · evidence-V1 | needs-review — lone card shifts 50/64px between states; inherited from the Sales Rep Hub card | PO decision (BL-UI-003 INFERRED) |

Candidate cases (→ /qa-test-lifecycle): A1, A4, A6, A9, A13 (kit cases for VcStatWidget — no suite stamps them) · Carried to Round 2 / escalation: R6 (manual screen-reader run), V1 + X2 + S2 (PO questions)

## Round 2 of 3 — 2026-10-20

Status: APPROVED (Elena Mutykova, 2026-10-20) · Depth label: deep (computed)
Blocked: no
Build: vc-frontend#2568 @ bfe0b259 (product) / a6255676 (head = bfe0b259 + dev merge: CI workflow only) · Stand: vcst (theme 2.61.0-pr-2568-bfe0-bfe0b259; QA Storybook image 2.61.0-alpha.2597-vcst-5903-vc-stat-widget-a6255676) · Deployed: UNKNOWN → unverified (bundle: "DEPLOYMENT UNKNOWN: VirtoCommerce/vc-frontend#2568 — no CI artifact resolved for this PR"; vc-deploy-dev vcst-qa pins both builds above) · Previous: Round 1 PASS WITH NOTES, 3f8af63a
Floors fired: F2 (doubt: domain map ABSENT) · F3 (rendering file vc-stat-widget.vue) · F5 (10 suites at risk: 011, 011b, 012, 013, 028, 029, 030, 072, 072e, 072f) · F8 (ui-kit files) · F11 (hidden behaviour: default-values) · not fired: F1 (priority Medium; R4 High → exploratory anyway), F4 (no revenue flow named), F6 (no NOT DEPLOYED blocker), F7 (type Story), F9 (applied inside each floor), F10 (no org context). Floors read the whole PR diff; the delta narrows the risks only.

**Mission.** Establish whether bfe0b259 fixes VCST-6427 (blank value / errorText) without breaking the states next to it, and whether VCST-6428 still reproduces now that only a usage note was added, for the vc-frontend developer and the PO.

### Inputs
| Input | What we have | Gap → project risk |
|---|---|---|
| Project environment | vcst; theme bfe0b259 on the storefront, QA Storybook re-pinned to a6255676 at 07:37 and answering 503 at 07:56. No consumer page; no role needed. Lanes: chrome, firefox, DevTools free. F11 stand values: no platform/store setting read; defaults are prop defaults color/deltaColor = neutral (vc-stat-widget.vue:79). PR CI red on a6255676 — 8 sales-rep-tasks-page tests from the dev merge; all 11 vc-stat-widget tests green | P1 · P2 |
| Product elements | delta 3f8af63a→bfe0b259: `hasValue` / `hasError` trim (vc-stat-widget.vue:90-91), error branch on `hasError` (:17), status text on `hasError` (:97); 2 vitest cases; llms doc note "give the card a cell at least as wide as its figure" (VCST-6428 guidance, no code). a6255676 adds `.github/workflows/storybook-ci.yml` only | |
| Quality criteria | no ACs — oracle: mockups att 83239/83164 {SPEC}, PR #2568 body {SPEC}, VCST-6427 / VCST-6428 expected results · BL-UI-003, BL-UI-004 · KB-B9BB372D, KB-A4C7F35D (defect on 3f8af63a), KB-82296935 | P3 |

### Risks
| R | What a customer would see if this is wrong | Source | L×I | Level |
|---|---|---|---|---|
| R1 | The kit card no longer matches the hub/mockup card once its state branches changed (anatomy, suffix, delta) | floor:F2 · carried from Round 1 R1 · att 83239/83164 | 2×3=6 | Medium |
| R2 | A blank figure still reads as a value: whitespace value shows an empty/unit-only row instead of the dash, a whitespace errorText still hides the figures, or the fix swallows a real "0" / real value | floor:F11 · VCST-6427 · client-app/ui-kit/components/organisms/stat-widget/vc-stat-widget.vue:90 · client-app/ui-kit/components/organisms/stat-widget/vc-stat-widget.vue:91 · carried from Round 1 R2 | 3×3=9 | Medium |
| R3 | State precedence broken by the new `hasError`: loading no longer outranks an error, a real error stops showing, or clearing an error to blank leaves the card in error | client-app/ui-kit/components/organisms/stat-widget/vc-stat-widget.vue:17 · client-app/ui-kit/components/organisms/stat-widget/vc-stat-widget.vue:94 · client-app/ui-kit/components/organisms/stat-widget/vc-stat-widget.vue:97 · carried from Round 1 R3 | 3×3=9 | Medium |
| R4 | A long figure still paints past the card border in the kit's own 4-column grid (the Colors/DeltaColors stories keep `lg:grid-cols-4`, the layout the new note warns against) | VCST-6428 · BL-UI-004 · client-app/ui-kit/components/organisms/stat-widget/vc-stat-widget.vue:141 · client-app/ui-kit/components/organisms/stat-widget/vc-stat-widget.vue:31 · llms/ui-kit/llms-detailed.txt:528 · carried from Round 1 R4 | 4×3=12 | High |
| R6 | A screen-reader user hears "<label>:" for a blank error, or a card mounting in error/loading is not announced | client-app/ui-kit/components/organisms/stat-widget/vc-stat-widget.vue:13 · carried from Round 1 R6 | 3×3=9 | Medium |
| R10 | The barrel export / locale keys break an existing storefront flow | organisms/index.ts:1 · floor F5 · carried from Round 1 R10 (C1 not run) | 2×4=8 | Medium |
| R11 | A value that only looks blank (zero-width space, other non-trimmed invisible char) or is padded (" 42 ") renders an empty or shifted figure | client-app/ui-kit/components/organisms/stat-widget/vc-stat-widget.vue:90 | 1×3=3 | Low |

Project risks: P1 no consumer page → Storybook stories + Controls/URL args; accepted. P2 QA Storybook 503 after the 07:37 re-pin → re-probe before Stage 2; BLOCKED if still down. P3 no ACs → oracle is mockups + PR body + the bug tickets; conflicts go to the PO.

### Strategy mix
Analytical ✔ · Methodical ✔ · Consultative ✔ · Model-based ✔: R1, R2 MODEL (F2, F11) · Reactive ✔: F2 fired, R4 High, R6/R11 rest on {HYPOTHESIS} · Regression-averse ✔: F5 fired · Process-compliant ✔: WCAG 2.2 AA (R6)

### Approach per risk
| R | Technique / approach | Oracle {authority} | Layer · tool | Lane · agent | Effort |
|---|---|---|---|---|---|
| R1 | MODEL | mockups att 83239/83164 {SPEC} | storefront · Storybook + Playwright | chrome · qa-frontend-expert | low |
| R2 | MODEL | PR #2568 body "a blank figure can't read as a value" + VCST-6427 expected {SPEC} | storefront · Storybook Controls/args | chrome · qa-frontend-expert | medium |
| R3 | ST, DT | PR #2568 body "loading outranks errorText" {SPEC} | storefront · Storybook Controls | chrome · qa-frontend-expert | medium |
| R4 | BVA, VISUAL | BL-UI-004 {BL} · VCST-6428 expected {SPEC} | storefront · Storybook @480/1024/1280 | chrome · qa-frontend-expert | medium |
| R6 | EXPLORE | status read once per state, blank error silent {HYPOTHESIS} | storefront · a11y tree | firefox · qa-testing-expert | low |
| R10 | REGRESSION | existing suite assertions {OBSERVED} | storefront · /qa-regression | chrome/edge/firefox · test-runner-agent | low |
| R11 | EXPLORE | invisible-only value shows the dash {HYPOTHESIS} | storefront · Storybook Controls | firefox · qa-testing-expert | low |

### Artifacts
| Artifact | Decision |
|---|---|
| Test model | RUN (amend reports/ba/test-models/VCST-5903-2026-10-19.md) — R1, R2 |
| Mind map | SKIP — domain map `ui` ABSENT and not built (single-layer chain, axes.md §2g) |
| Checklist | RUN (always) |
| Exploratory | RUN 30 min, ALONGSIDE — charter: R6, R11, R4 widths, live state toggles |
| Visual lane | RUN (F3/F8) — dash / blank-error states (BL-UI-003 height vs `""`), token audit |
| Contract refresh | SKIP — the diff names no GraphQL operation and no REST contract |
| Coverage triage + regression | RUN — 10 suites (011, 011b, 012, 013, 028, 029, 030, 072, 072e, 072f) after the staleness check; Round 1 triage test-defects: none in these suites |
| Verifier | SKIP — no Critical risk |
| Case authoring | never in the run (D2) — candidate cases are listed at close-out |

Lanes: chrome (checklist) ‖ firefox (exploratory) ‖ DevTools (visual); the F5 regression runs after they return.

### Data
No entities: Storybook story args / Controls. Must differ: value undefined vs `""` vs `" "` vs tab vs NBSP vs U+200B vs `"0"` vs `" 42 "` (R2, R11); errorText `""` vs `" "` vs `"Boom"`, each with loading true and false (R3); figure `$123,456,789.00` vs `$12,345,678.90` at 1024 / 480 (R4). Before redeploy: none.

### Out of scope
- R5 contrast (client-app/ui-kit/components/organisms/stat-widget/vc-stat-widget.vue:157, client-app/ui-kit/components/organisms/stat-widget/vc-stat-widget.vue:168), R7 overlay containment (client-app/ui-kit/components/organisms/stat-widget/vc-stat-widget.vue:110), R8 tokens beyond the visual lane's audit (client-app/ui-kit/components/organisms/stat-widget/vc-stat-widget.vue:106), long-label row alignment (client-app/ui-kit/components/organisms/stat-widget/vc-stat-widget.vue:131), R9 locale strings — code under them unchanged since the Round 1 PASS — residual Low
- Unknown `color` fallback (Round 1 A5, client-app/ui-kit/components/organisms/stat-widget/vc-stat-widget.vue:115) — Storybook rejects out-of-list values; carried, still untestable without a direct mount — residual Low
- Screen-reader first-mount announcement (Round 1 R6, manual part) — no screen reader in the toolkit; carried as MANUAL — residual Medium
- PO questions V1 (height across states), X2 (overlay blocks prepend, client-app/ui-kit/components/organisms/stat-widget/vc-stat-widget.vue:45), S2 (unchanged trend colour) — carried, need a PO answer, not a test — residual Low
- PR #2585 (VCI-1445 Storybook CI tags: .github/workflows/storybook-ci.yml:139, .github/workflows/storybook-ci.yml:150, .github/workflows/storybook-ci.yml:153, .github/workflows/storybook-ci.yml:155, .github/workflows/storybook-ci.yml:174) — CI only, no product surface — residual none

### Criteria
Entry: QA Storybook answers 200 with the VcStatWidget stories on the a6255676 image · storefront theme bfe0b259 · env:check green · Suspend (BLOCKED): Storybook down or on another image
Exit: every in-scope R has a result or a named deviation · exploratory 30-min box spent · design-report.md written · regression run reported

### Amendments
- 2026-10-20 — Coverage triage + regression (F5, R10) NOT RUN: approved by the user as "Approve, no regression". Deviation below the F5 floor, by user decision. R10 rests on a storefront boot check on theme bfe0b259 (home + catalog render, console clean). Residual: an existing cart/checkout/configurable flow broken by the barrel export or locale keys is unverified (unchanged since Round 1).
- 2026-10-20 — R4 oracle amended after reading the sub-task comments (the context bundle carried their descriptions only): on VCST-6428 the developer (comment 112171) calls the overflow by design — the figure never wraps or truncates, the layout must give the card a cell as wide as its figure (`grid-cols-N` = `minmax(0,1fr)` squeezes it) — and proposes Won't Fix. BL-UI-004 {BL} vs the developer's design decision is a PO question, so A6's result is recorded as `VCST-6428 HOLDS — Won't Fix proposed, PO decides`, never a new bug. Added to the question: the kit's own Colors / DeltaColors stories use `lg:grid-cols-4`, the layout the new note warns against. VCST-6427 comment 112170 states the fix in bfe0b2595 — matches A2–A5 / B1.
- 2026-10-20 — Risks discovered by the exploratory lane, added for reconciliation: **R12** (Low) secondary string props (delta, description, label, valueSuffix) are not blank-safe — a blank delta shows a lone chevron (X15) · **R13** (Medium) an unbreakable word in errorText / description / delta overflows the card border, only the label wraps (X27, BL-UI-004) · **R14** (Low, a11y question) the no-value dash is silent to assistive tech and below 3:1 in every mode (X25, X30). R11 result: refuted for U+200B (X5).
- 2026-10-20 — Exploratory box ~28 of 30 min (a rate-limit stop cut the continuation) — 2 min under the floor, named deviation; every charter item was covered.

### Reconciliation (filled at close-out)
| R | Planned | Ran (item ids · charter · lane · case ids) | Result | Deviation — reason |
|---|---|---|---|---|
| R1 | MODEL S1r | A1 · chrome | PASS — anatomy unchanged | — |
| R2 | MODEL S3r, S10 | A2, A3, A4, B1 · chrome/devtools | PASS — VCST-6427 fixed: " ", "   ", tab, NBSP, "" → dash; "0"/"42" shown; blank errorText leaves the card ready; 0 px shift | — |
| R3 | ST, DT | A5 · charter X3, X10 · chrome/firefox | PASS — loading outranks blank and real error | — |
| R4 | BVA, VISUAL | A6 · charter X11–X13, X29 · chrome/firefox | FAIL — VCST-6428 HOLDS (13.1px @1024, 15.7px @480; page scrolls sideways @480 with a 9-digit figure); developer proposes Won't Fix → PO | Row long figure NOT-RUN (X18) — story ignores args |
| R6 | EXPLORE | charter X1, X3, X25 · firefox | PASS for blank error (status silent); needs-review: no-value card silent to AT (X25) | first-mount SR announcement MANUAL |
| R10 | REGRESSION | A7 · chrome | PASS — storefront boot on bfe0b259 | F5 10-suite run dropped by the user (amendment) |
| R11 | EXPLORE | charter X5, X6 · firefox; investigated · chrome | FAIL — U+200B value/errorText reads as content → VCST-6449 (P4) | — |
| R12 (amend.) | found | charter X15 · firefox | needs-review — secondary props not blank-safe (KB-7C95C0AE) | dev/PO question |
| R13 (amend.) | found | charter X27 · firefox; investigated · edge | FAIL — unbreakable word overflows in error/description/delta → VCST-6448 (P3) | — |
| R14 (amend.) | found | charter X25, X30 · firefox | needs-review — dash silent to AT, contrast < 3:1 | ui-ux/PO question |

Candidate cases (→ /qa-test-lifecycle): A2, A3, A4, A5 (kit cases for the blank value / errorText rules — no suite stamps VcStatWidget) · Carried to Round 3 / escalation: R4 (PO decision on VCST-6428), R12, R14, first-mount SR announcement (manual), PO questions V1 / X2 / S2
