# VCST-5957 — Agent findings log

**Ticket:** VCST-5957 Loyalty Missions — "Missions & challenges" redesign (L6 display) · Story · P2
**Run:** `/qa-test VCST-5957` FULL path · Test Model `reports/ba/test-models/VCST-5957-2026-10-01.md` · Discovery `reports/exploratory/SBTM-VCST-5957-2026-10-01.md` · Checklist `testing-checklist.md` (this folder)
**Env:** vcst-qa · theme `2.59.0-pr-2524-3069-30691594` (vc-frontend PR #2524, vc-deploy-dev #6660) · Loyalty `3.1009.0-pr-18-4411` · Platform 3.1075.0 · account `@td(LOY_PERSONAL_NOORG)` · seed handle `@td(MSN_DL_RUN)` `202610011149` (boundary values valid until 2026-10-01T23:49Z)
**Ticket status:** Ready for test → Testing (at 1a)

## Log status

| Updated | Run step | State |
|---|---|---|
| 2026-10-01 13:34 | 3x discovery ‖ 3a seeding | Context-wave observations F01–F14 |
| 2026-10-01 14:18 | 4a (chrome) ‖ 4v (DevTools) running | 3x finished. F02/F04/F08/F13 confirmed live, F15–F27 added. **Still no Step 4 verdicts, no bugs filed** |
| 2026-10-01 14:44 | 4v finished · 4a screenshots done, verdicts not yet in the checklist | 4v results F28–F37 added (`design-report.md`). New Draft cases MSNF-088..102 (083c) + MSN-E2E-009 (083d) authored. **No bugs filed yet** |
| 2026-10-01 15:40 | 4c regression `REG-2026-10-01-1243` running (29 cases, serial, chrome) | 4a verdicts added (relayed by the run session; the checklist Verdict column is only filled at 5-report). The step-3 verifier rejected once, a fix round ran, and the re-verify approved. **No bugs filed or drafted yet** |

Verdicts: `OBSERVATION` (context wave) · `CONFIRMED` (3x checked it live) · `PASS` / `FAIL` / `BLOCKED` / `NOT-RUN` / `SKIPPED` (Step 4 on).
Kind: `defect?` (could become a bug at 5-triage) · `design-drift` (PO decision) · `scope-cut` · `prior-bug` (re-check of an earlier ticket) · `test-infra` (our fixtures and tooling, not the product).

## Findings — context wave (1r / 1c / 1d)

| # | Agent · lane | Step | What was checked | Verdict · what we saw | Kind | Evidence (`screenshots/`) | Scen. |
|---|---|---|---|---|---|---|---|
| F01 | qa-frontend-expert · chrome | 1r | Deployed and reachable | OBSERVATION: **REACHABLE.** The redesign renders: white banners, chips on the banner, completed overlay + check, no "Completed" chip. SKU modal with the new columns + estimate hint | — | — | #24 |
| F02 | ba-system-analyzer · firefox | 1c → 3x | Redeem banner "Rewards catalog" button (attachment 83929) | **CONFIRMED absent:** no button and no link. The only way to spend points is the global nav "Loyalty" item. `missions.vue` passes no `linkTo` | defect? / PO. Cases MSNF-010/044 assert it | `1c-missions-page-desktop.png` | #35 |
| F03 | ba-system-analyzer · firefox | 1c → 3x | Card banner height (design 210 px) | CONFIRMED: **208 px** (`h-52`) | design-drift | `1c-missions-page-desktop.png` | T03 |
| F04 | ba-system-analyzer · source → 3x | 1c → 3x | Completed overlay (design `success-600 @55%`) | CONFIRMED: `success-400` #5bae7e @0.75. 3x calculated **~2.1:1** contrast for the check over white (needs ≥3:1) | design-drift + defect? (BL-A11Y-003) | `3x-completed-overlay-real-banner-light.png` | #28 |
| F05 | ba-system-analyzer · firefox | 1c → 3x | Card body order (design: urgency first) | CONFIRMED: note → bar + % → title → footer (date badge + CTA). The PR says this is intended | design-drift, **PO** | `1c-missions-page-desktop.png` | T16 |
| F06 | ba-system-analyzer · firefox | 1c → 3x | Sort dropdown | CONFIRMED absent. The PR declares it out of scope | scope-cut | — | T10/11 |
| F07 | ba-system-analyzer · source | 1c → 3x | "Account setup" mission kind | CONFIRMED absent. No backend MissionType exists for it | scope-cut | — | T13 |
| F08 | ba-system-analyzer · firefox | 1c → 3x | SKU modal Cart subtotal at 0 units | CONFIRMED: shows a bare **"0"** while every line Total reads "$0.00". At 2 units it reads "$60.00" (= $30.00 × 2, correct) | defect? (Low–Med) | `3x-sku-modal-oos-qty0-subtotal-bare.png` | #31 |
| F09 | ba-system-analyzer · firefox | 1c | OOS row (flags false) | OBSERVATION: stepper disabled, red "0" badge, in-stock row enabled, Add disabled at 0 | Step 4 | `1c-sku-modal-oos-mission.png` | #29 |
| F10 | ba-system-analyzer · firefox | 1c | Points history control (VCST-5834) | OBSERVATION: 119×38 px at 1920 (was 86.9×18), looks fixed. **375 not measured** | prior-bug | — | #32 |
| F11 | ba-system-analyzer · firefox | 1c | Order-mission modal banner (VCST-5833 item 1) | OBSERVATION: **still no banner.** Bar is now info, 25.2% | prior-bug, still present | `1c-order-modal-partial.png` | #36 |
| F12 | ba-system-analyzer · firefox | 1c | Mobile 375 | OBSERVATION: banners and cards stack, no overflow | — | `1c-missions-mobile-375.png` | #37 |
| F13 | ba-system-analyzer → 3x | 1c → 3x | Deadline ladder (VCST-5910) | **CONFIRMED live** on seeded boundary missions: 31 = success · 30 / 16 = warning · 15 / 1 = danger · null = "No deadline" + success · completed with 15 days left = "Mission completed" + success (#26 holds) | prior-bug looks fixed | `3x-deadline-boundary-set-page1.png` | #25, #26 |
| F14 | ba-story-writer · — | 1d | Acceptance criteria | OBSERVATION: **no written ACs, no DoD.** VCDZ-897 (design) still In Progress. The SKU-modal rebuild contradicts the artifact's "out of scope" line | process risk | — | T24 |

## Findings — 3x exploratory (playwright-firefox, ~39 min)

| # | What was checked | What we saw | Kind | Evidence (`screenshots/`) | Fate |
|---|---|---|---|---|---|
| F15 | Mission past its endDate, before the sweep (EXP-04) | API returns InProgress, `daysRemaining` 0. Card reads **"0 days left"** with "Open mission" still active. In its last hour a mission reads "1 day left" (there is no last-day label). Both readings fail MSNF-056 | defect? (Low–Med) / PO | `3x-card-ended-mission-0-days-left.png` | #44 |
| F16 | Deleted target product in the SKU modal (EXP-02) | Title and img alt are the raw **GUID** `05daed62-…`. The link goes to a **404**, price and Total read "N/A", and the stepper is disabled. The mission can never complete and nothing says why | defect? (Medium) | `3x-sku-modal-null-product-guid-title.png` | #40 |
| F17 | Over-stock quantity (EXP-01) | Qty 150 against stock 99: the field is invalid and Add is disabled, but the summary still counts 150 units and a **$18,450.00** subtotal. A valid row elsewhere can't be added either | defect? (Low) | `3x-sku-modal-overstock-counted-in-summary.png` | #42 |
| F18 | Unbuyable target that is in stock (EXP-03) | Stepper disabled, but the badge reads **"In stock 33"**. A points-priced target shows "$0.00 / No longer available" | defect? (Low) | `3x-sku-modal-unbuyable-row-in-stock-badge.png` | #41 |
| F19 | Banner artwork crop (EXP-05) | The 208 px banner keeps only ~66% of the width of 2048×768 artwork (~91% at the old 150 px), so text baked into the image is cut off | defect? (Low–Med) | `3x-card-banner-artwork-text-cropped.png` | 4v |
| F20 | PerSkuAny footer copy (EXP-06) | "Earn 400 points when **all** targets are met" sits next to "Targets met 0 / 1" | copy → PO | — | declined |
| F21 | de locale (EXP-07) | "257,00 $ von 7.200,00 $" next to **"3.6%"** (percent not localised) | advisory | — | #39 |
| F22 | Dark theme (the #38 premise) | **Premise falsified:** banners follow the theme (#0a0a0a). Cards and modals are readable. The completed check turns near-black on the green overlay, so its contrast still needs checking | — / 4v | `3x-missions-dark-theme.png`, `3x-sku-modal-dark-theme.png` | #38 |
| F23 | Completed state for assistive tech (T22) | The footer text **"Mission completed"** is exposed. The overlay check is an **unnamed `img`** | 4v | — | #27 |
| F24 | Modal add → cart → progress (BL-LOY-016) | Target A ×2 → the cart holds 1 line × 2 at $60.00 (= the estimate). Progress didn't change after the add or after removing the line. **Holds** | — | `3x-cart-after-modal-add.png` | #24 |
| F25 | Unknown / raw `PerSku` type | Admin offers exactly 3 goals, so the type can't be published. **GAP by construction** | scope | `3x-admin-mission-add-palette.png` | #34 NOT-RUN |
| F26 | Existing corpus (tc:scope, 27 priority rows) | **7 STALE** (MSNF-019, -027, -060, -078, -084, -087, MSN-E2E-002) + MSNF-034/-035 · 17 still true · 3 unsure (MSNF-015, -017, -024) | test-infra | — | 2a |
| F27 | Test-run hygiene | 3a's order `AGENT-TEST-MSN-VCST5957-202610011149-ORD` **completed 4 existing OrderCount missions (+2,023 pts) on the shared account** while 3x was reading it. The declared states `@td(MSN_PROGRESS_COMPLETED/_PARTIAL, MSN_PERSKU_ALL/_ANY, MSN_ORDERCOUNT)` don't hold for this account, and `MSN_ENDING_SOON` is missing. The firefox lane stalled twice (a new tab cleared it) | test-infra | — | fixture fix |

Also seen and recorded on the checklist: every card CTA has the same accessible name "Open mission", the progress bar has no `progressbar` role (#31 on the checklist), and paging doesn't update the URL (UIP-BACK, #38 on the checklist).

## Findings — 4v visual lane (ui-ux-expert, playwright-edge, Red preset)

Full report: `design-report.md`. Accessibility findings on a feature ticket are filed separately and **do not block** the ticket.

| # | Check | Verdict · what we saw | Kind | Evidence (`screenshots/`) |
|---|---|---|---|---|
| F28 | axe-core (WCAG 2.0/2.1/2.2 AA): page, SKU modal, order modals, light + dark | **PASS: 0 violations.** Some items are `incomplete` (contrast over images, HeadlessUI focus guards) | — | `4v-missions-page-light-1440.png` |
| F29 | Modal keyboard and focus (BL-A11Y-001) | **PASS:** dialog role, focus trapped, Esc closes, focus returns to "Open mission" | — | — |
| F30 | Card CTA names (A1) | **FAIL:** all 12 card buttons are named "Open mission" and none includes the mission title | a11y defect (Medium) | `4v-missions-page-light-1440.png` |
| F31 | Progress bar and completed check (A2) | **FAIL:** the bar has no `progressbar` role or value. The 56 px check is an unnamed graphic, but "Mission completed" text carries the state, so no information is lost | a11y defect (Medium bar / Low check) | `4v-order-modal-completed-light.png` |
| F32 | Completed check contrast, **dark** (A3) — updates F04/F22 | **FAIL:** near-black check on the green overlay measures 2.56–2.79:1 over dark artwork (needs ≥3:1) | a11y defect (Medium) | `4v-missions-page-dark-1440.png` |
| F33 | Completed check contrast, **light** (A4) — updates F04 | **Conditional FAIL:** 2.04:1 over white artwork and as low as 2.56:1 over the default placeholder. Over the real (dark) artwork it couldn't be measured; the upper bound is 4.16 (PASS). Cause: `success-400` overlay | a11y defect (Medium) | `4v-missions-page-light-1440.png` |
| F34 | Touch-target spacing at 375 (BL-UI-006) | **FAIL ×2, both in shared components the PR didn't touch:** pagination buttons have 0 px gaps, and the SKU-modal stepper buttons sit 1 px from the input. The 24 px minimum size passes | existing defect, not this PR | `4v-missions-page-375.png`, `4v-sku-modal-375.png` |
| F35 | Design properties measured against the Changes artifact (6 rows) | **DRIFT:** 5 confirmed (grid gap 20, CTA 38, 4 px banner edge, 56 px check, 56 px icon circle). Banner is **208 vs 210 px** (= F03) | design-drift | — |
| F36 | Design-system tokens | **PASS with 2 advisories:** the banner shadow is a custom value outside the Tailwind scale (D1), and the date-dot colours aren't the `-500` tokens the PR text names (D2, needs dev confirmation) | advisory | — |
| F37 | Re-confirmations | F02 (no redeem CTA) and F08 (bare "0" subtotal) re-confirmed. 375: no horizontal scroll, modal fits. The mission grid isn't exposed as a list (Low) | — | — |

**4v did not cover:** the token, icon and full-geometry comparison with the design (no local copy of project `518d0b90`), a screen-reader pass, 200% zoom / 320 px reflow, reduced motion, the Coffee preset, and the layout sweeps from 375 to 1920.

## Step 4a — storefront execution (qa-frontend-expert, playwright-chrome, 12:17–12:33Z)

The `C#` column is the row number in `testing-checklist.md`. Screenshots are `screenshots/4a-*`.

**Totals for the 40 checklist rows:** 23 PASS · 8 FAIL · 4 NOT-RUN · 4 observed-only by 4v · 1 vs. DESIGN DRIFT.

**PASS (23):** C1 the journey (status readable at a glance, then the no-availability SKU mission's Target A ×2 added → cart holds 1 line × 2 at $60.00; banner 40,939 = points-history 40939) · C2 chips + glyphs · C3 points chip on the card · C4 completed overlay · C5 completion exposed as text · C7 CTA 38×38 · C10 bar colour card = modal · **C11 deadline ladder** (31/60/159 success · 30/16 warning · 15/1/0 danger · null "No deadline") · C12 completed with 15 days left · C15 Points history 119×38 at 1920 **and 375**, so VCST-5834 looks fixed · C16 balance parity · C18 grid 12/page, 57 missions · C21 modal 960 px + columns · C22 OOS row · C23 null product can't be added · C28 auto-close + "in Cart 2" · C29 progress unchanged by add/remove (BL-LOY-016) · C30 keyboard/focus (4v) · C32 no overflow at 375/768 · C36 console clean, every GraphQL call 200 with no `errors[]` · C39 catalog reachable from the nav (spending not tested).

| C# | FAIL | What we saw | Log ref | Evidence |
|---|---|---|---|---|
| C6 | Completed-check contrast | White check **2.56:1** where the ring crosses light artwork. Chip text 5.79/7.33:1 OK | F32/F33 · B6 | `4a-card-completed-placeholder.png` |
| C13 | Ended, not-yet-swept mission | DUE-00 reads "0 days left" with a danger dot and a **live CTA**. The order modal also says "0 days left" | F15 · B5 | `4a-ended-mission-due00-modal.png` |
| C17 | Redeem banner CTA | No "Rewards catalog" button (`VcButton v-if="linkTo"`, no `linkTo` passed) | F02 · B7 (PO) | `4a-banners-1920.png` |
| C24 | Deleted target product | Raw GUID `05daed62-…` as title and alt; link `/product/<guid>` → **404** | F16 · B2 | `4a-null-product-link-404.png` |
| C25 | Unbuyable target, in stock | Product 16785001: disabled stepper next to a green **"33" in-stock** badge, price $0.00 | F18 · B4 | `4a-sku-modal-overstock-150-of-99.png` |
| C26 | Subtotal format | Line Total correct ($30 × 2 = $60.00), but Cart subtotal is a **bare "0"** at 0 units while lines show "$0.00". Same in de/fi/ja | F08 · B1 | `4a-sku-modal-noavail-qty0.png` |
| C27 | Over-stock quantity | Qty 150 > stock 99: hint shown and Add disabled, but the summary counts it (150 units, 1/5 targets, **$18,450.00**) | F17 · B3 | `4a-sku-modal-overstock-150-of-99.png` |
| C34 (Low) | Locales | No raw keys, but de/fi show percent as "3.6%" (not localised), ja has a katakana typo in "日残リ", and "N/A" is untranslated | F21 · B9 | `4a-missions-de.png`, `4a-sku-modal-ja.png` |

**NOT-RUN (4):** C19 sort dropdown (scope cut) · C20 "Account setup" kind (no backend type) · C37 unknown type (unreachable) · C38 UIP-BACK (named only).
**Observed by 4v only:** C8 banner 208 px · C9 body order · C14 banner styling · C31 identical CTA names + no progressbar role · C33 dark-theme check 2.56–2.79:1 · C35 banner crop (`4a-missions-page4-1920.png`). C40 vs. DESIGN: DRIFT (5/6 match), token/icon diff SKIPPED.

## Still open

4c regression `REG-2026-10-01-1243` (29 cases) → 5-triage (grading) → 5-file (Jira) → 5-report (checklist verdicts).

## Bugs filed

None yet: no Jira keys and no `reports/bugs/open/` drafts. Candidates the run session will grade at 5-triage:

| ID | Candidate | Log ref | Note |
|---|---|---|---|
| B1 | SKU modal Cart subtotal shows a bare "0" | F08 · C26 | |
| B2 | Deleted target: GUID title + 404 link | F16 · C24 | |
| B3 | Over-stock quantity counted in the summary | F17 · C27 | |
| B4 | Unbuyable row: green in-stock badge + $0.00 | F18 · C25 | |
| B5 | Ended mission: "0 days left" + live CTA | F15 · C13 | |
| B6 | Completed-check contrast | F32/F33 · C6 | |
| B7 | No "Rewards catalog" CTA | F02 · C17 | PO decision |
| B8 | Points chip colour differs between card and modal | — · C3 | new, incidental |
| B9 | ja katakana typo | F21 · C34 | pre-existing |
| B10 | en not pluralised: "1 of 1 orders" | — | new, pre-existing |
| B11 | Sidebar word-break at 768 | — | new, pre-existing |
| F19 | Banner crop cuts artwork text | C35 | 3x/4v. Not in the run's B-list |

**Accessibility, filed separately and non-blocking at 5-file:** A1 identical "Open mission" names (F30, Med) · A2 no progressbar role (F31, Med) · A3 dark check 2.56–2.79:1 (F32, Med) · A4 light check 2.04:1 over white art (F33, Med, conditional). **Pre-existing components:** BL-UI-006 spacing at 375 in VcPagination / VcQuantityStepper (F34).

## Open questions for the PO

1. Redeem banner without a "Rewards catalog" CTA (F02): bug or accepted cut?
2. Card body order (F05) and overlay colour (F04): follow the PR or the design? Blocked on VCDZ-897.
3. SKU modal rebuilt though the artifact says it is out of scope (F14): confirm it is in scope.
4. Ended mission still shows "0 days left" with a live CTA, and there's no last-day label (F15): which behaviour is intended?
5. The PerSkuAny footer says "all targets" (F20): fix the copy?
