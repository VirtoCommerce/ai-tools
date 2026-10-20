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
