# VCST-5957 — Agent findings log

**Ticket:** VCST-5957 Loyalty Missions — "Missions & challenges" redesign (L6 display) · Story · P2
**Run:** `/qa-test VCST-5957` FULL path · 2026-10-01 · run record `summary.json` (this folder)
**Env:** vcst-qa · theme `2.59.0-pr-2524-3069-30691594` (vc-frontend PR #2524) · Loyalty `3.1009.0-pr-18-4411` · Platform 3.1075.0 · account `@td(LOY_PERSONAL_NOORG)`
**Sources:** Test Model `reports/ba/test-models/VCST-5957-2026-10-01.md` · discovery `reports/exploratory/SBTM-VCST-5957-2026-10-01.md` · `testing-checklist.md` · `design-report.md` · C1 `reports/regression/REG-2026-10-01-1243/` (report + `triage-report.md`)

## Outcome

| | |
|---|---|
| Verdict | **PASS WITH NOTES**. The operator accepted 3 unbuilt items (sort dropdown, "Account setup" kind, redeem CTA) as scope cuts |
| Ticket | Ready for test → Testing (1a) → **Tested** (5-status, confirmed). QA comment 110980 |
| Filed | **VCST-6142** completed-check contrast 2.04:1 light / 2.56:1 dark (Medium, a11y, introduced by the PR) · **VCST-6143** progress bars have no progressbar role (Medium, a11y, pre-existing). Both standalone, non-blocking |
| Linked, not re-filed | VCST-5823 redeem CTA · VCST-5830 bare "0" subtotal · VCST-5826 generic "Open mission" names (all Cancelled duplicates from VCST-5346) |
| Low drafts | 6 in `reports/bugs/open/low/` (table below) |
| Cases | 16 new Draft rows: MSNF-088..102 (083c) + MSN-E2E-009 (083d). C1: 10 PASS · 9 FAIL · 9 BLOCKED · 1 AMBIGUOUS of 29 |
| Residue | Checkout orders CO261001-00002/-00003/-00004 left uncancelled (operator decision). All 54 seeded missions Archived |
| Moved to `bugs/fixed/` | `BUG-loyalty-mission-date-severity-ladder-collapses.md` (VCST-5910) · `BUG-missions-points-history-link-below-aa-touch-target.md` (VCST-5834) |
| Docs (5-docs) | Existing Customer guide updated in place: `reports/ba/Loyalty&Mixed cart/vcst-5346-loyalty-missions-customer-guide.md` |

## Timeline — who found what

| Step | Agent · lane | Contribution |
|---|---|---|
| 1r | qa-frontend-expert · chrome | Change deployed and reachable |
| 1c | ba-system-analyzer · firefox + source | First observations F02–F13 (redeem CTA missing, 208 px banner, overlay colour, body order, bare "0", prior bugs 5833/5834/5910) |
| 1d | ba-story-writer | No ACs and no DoD. VCDZ-897 design still In Progress. SKU-modal rebuild contradicts the artifact |
| 3x | exploratory · firefox (~39 min) | Confirmed the 1c drift. Found EXP-01..07: GUID + 404, unbuyable in-stock badge, over-stock counted, ended mission live CTA, banner crop, copy and locale issues |
| 3a | test-data-engineer | Seeded the deadline boundary set (`MSN_DL_*`, run `202610011149`). **Side effect:** completed 4 unrelated missions on the shared account (lesson 1) |
| 3 | test-management-specialist + verifier | Authored 16 Draft cases. Verifier REJECTED once, then APPROVED after a fix round (lesson 5) |
| 4v | ui-ux-expert · playwright-edge | axe 0 violations, keyboard/focus PASS. A1–A4 a11y FAILs, BL-UI-006 spacing at 375, vs. DESIGN property DRIFT (5/6) |
| 4a | qa-frontend-expert · chrome | Checklist: 23 PASS · 8 FAIL · 4 NOT-RUN. Journey, deadline ladder, balance parity, BL cart-add-no-accrual all PASS |
| 4c | C1 regression · chrome | 29 cases. Product FAILs match 4a. BLOCKED rows were all test-infra (lessons 2, 4, 6) |
| 5 | qa-lead (inline) | Graded, deduped against Jira, filed 2 and linked 3, wrote 6 Low drafts, moved the ticket to Tested |

## Findings → final disposition

| # | Finding | Found at | Disposition |
|---|---|---|---|
| F02 | Redeem banner has no "Rewards catalog" button or link (`missions.vue` passes no `linkTo`) | 1c, 3x, 4a C17 | Scope cut accepted · linked **VCST-5823** |
| F03/F35 | Card banner 208 px vs design 210 | 1c, 4v | Design drift, advisory |
| F04/F32/F33 | Completed check contrast: overlay `success-400 @0.75` vs design `success-600 @55%` | 1c → 4v A3/A4 → 4a C6 | **VCST-6142** (Medium) |
| F05 | Card body order differs from the design ("urgency first") | 1c, 3x | Design drift, intended per the PR |
| F06/F07 | Sort dropdown and "Account setup" kind not built | 1c | Scope cut accepted |
| F08 | SKU modal Cart subtotal bare "0" at 0 units (all locales) | 1c → 3x → 4a C26 → MSNF-093 | Linked **VCST-5830** (pre-existing) |
| F10 | Points history control (VCST-5834) | 1c, 4a C15 | **Fixed**: 119×38 at 1920 and 375 |
| F11 | Order-modal banner missing (VCST-5833) | 1c, MSNF-060 | Still present. The existing draft `BUG-loyalty-missions-design-drift-three-surfaces.md` (VCST-5833) was re-checked and updated this run |
| F13 | Deadline ladder 15/30 (VCST-5910) | 3x, 4a C11, MSNF-088 | **Fixed**: PASS at every boundary |
| F15 | Ended mission: "0 days left" + live CTA until the sweep | 3x EXP-04, 4a C13, MSNF-102 | Low draft `BUG-missions-ended-mission-zero-days-live-cta.md` |
| F16 | Deleted target: raw GUID title + 404 link | 3x EXP-02, 4a C24, MSNF-099 | Low draft `BUG-missions-sku-modal-degraded-target-states.md` |
| F17 | Over-stock quantity counted in the summary | 3x EXP-01, 4a C27 | Same draft |
| F18 | Unbuyable target with a green "In stock" badge | 3x EXP-03, 4a C25, MSNF-100 | Same draft |
| F19 | 208 px banner crops artwork text | 3x EXP-05, 4v | Low draft `BUG-missions-redesign-visual-polish.md` |
| F23/F31 | Completed check unnamed · no progressbar role | 3x, 4v A2, MSNF-090 | **VCST-6143** (progress bar) · check icon in the visual-polish draft |
| F30 | 12 CTAs all named "Open mission" | 4v A1 | Linked **VCST-5826** |
| B8 | Points chip colour differs between card and modal | 4a C3 | Visual-polish draft |
| F21/B9/B10 | de/fi percent, ja 日残リ, en "1 of 1 orders", untranslated "N/A" | 3x, 4a C34 | Low draft `BUG-missions-locale-defects.md` |
| F34 | VcPagination / VcQuantityStepper spacing < 8 px at 375 | 4v | Low draft `BUG-shared-pagination-stepper-target-spacing-375.md` (out of scope) |
| B11 | Account sidebar breaks words at 768 | 4a | Low draft `BUG-account-sidebar-word-break-768.md` (out of scope) |
| — | SKU modal shows no progress bar (card/modal parity) · no in-cart count per row · red "0" OOS badge | C1 MSNF-096/027/035 | Graded at triage, see `triage-report.md` |
| F22 | Dark theme: banners follow the theme (the model assumed hard-coded white) | 3x | Model premise falsified |

**Checked and passed:** journey MSN-E2E-009 · balance banner = points-history (40,939) · cart add moves no progress · OOS row and null product can't be added · modal keyboard/focus · axe 0 violations · no overflow at 375/768 · console and GraphQL clean.
**Not covered:** unknown goal type (Admin can't create one) · pager URL (UIP-BACK) · vs. DESIGN token/icon/geometry diff (no local design source) · screen reader, 200% zoom, reduced motion, Coffee preset · a partly complete PerSku mission (no fixture).

## Lessons learned (from the run session, 2026-10-01)

| # | What happened · cost | Root cause | Change | Fixed? |
|---|---|---|---|---|
| L1 | **The seeder mutated the shared account.** 3a's order completed 4 unrelated missions mid-session, so 3x readings before and after 11:49Z disagree. C1 re-minted 5×, leaving 5 extra permanent orders | One seeder makes both the deadline bands (no order needed) and the completed state (needs an order). Band missions are Published to every account | Split `seed-missions-deadline.mjs` into `--bands-only` and an opt-in completed slot on its own account. Serialise 3a with 3x on a shared account (`skills/qa-test/sequencing.md` never-parallelise table) | No, accepted and recorded |
| L2 | **Declared fixture states don't hold.** `MSN_PROGRESS_COMPLETED/PARTIAL`, `MSN_PERSKU_*` read 0%, so MSNF-019/087 were BLOCKED | USER/VIP accounts were recreated 2026-09-19 with new ids. Progress is still Completed on the old id (drift, not a product reversal; verified via `/api/loyalty-mission-progress/search`) | `td:reconcile` liveness guard: progress-owner id = current account id. Seeders write `progress_status_at_seed` for every progress fixture, not just OrderValue | Cases re-pointed to `@td(MSN_ORDERVALUE)`. Guard not done |
| L3 | **Seed run 202610011309 failed its own validation** | Back-to-back mints inside `DAY_OFFSET_SLACK_HOURS` collided | Per-case mint lock, or a suite-level preflight seed | No |
| L4 | **Leftover probe carts blocked MSN-E2E-003/006/008.** Those product questions are still unanswered | `seed-missions-e2e.mjs` `measureCart()` empties `agent-test-msn-e2e-probe` but never deletes it. The `MSN_E2E_*` accounts already have orders | `measureCart()` deletes its cart. Re-seed + `carts:sweep` | No, recommended |
| L5 | **Step-3 verifier REJECT** (~10 min fix round) | Bare `@td(MSN_DL_RUN)` (no field) · seed command in Preconditions prose (PRE-002 class) · "teardown after last case" (undecidable per case) · 9 rows citing an alias they never produce · `PENDING-A` left in the checklist | `scaffold-rows.ts` / lint flags field-less `@td()` and shell commands in Preconditions before the gate does | Yes, re-verify APPROVED |
| L6 | **Cases undecidable at run time:** MSNF-034/101/097/095 | PerSku target A is `trackInventory:false`, so there's no stock number to exceed. No long-content mission exists. DOM measurements are forbidden by the runner's REAL-USER rule | Tracked-stock PerSku slot (test-data-engineer). Route DOM-measurement cases to the visual lane, or reject them at scaffold time for runner lanes | 095 rewritten to a11y-tree. Rest open |
| L7 | **Lanes and tools:** firefox stalled 3× (a new tab cleared it) · vs. DESIGN had no local design source · 4v used Edge (role-gated target, DevTools MCP has no `--secrets`) · App Insights skipped (`APPINSIGHTS_APP_ID` unset) · the dashboard watcher was killed at the 30-min background limit | Lane and config gaps | `/qa-regression` Step 3 starts the watcher with `timeout 7200000`. Put the design project on disk before 4v. Set `APPINSIGHTS_APP_ID` | Extractor change made DESIGN-PROPERTY work (5/6). Rest open |
| L8 | **Oracle and process:** no ACs/DoD, VCDZ-897 in progress, PR cut 3 artifact items on its own. **~⅓ of triage and close-out went to PO-decision items.** 4 findings were already Cancelled duplicates from VCST-5346 | Duplicates found only at the 5-file dedup | `2-map` searches the tracker for Cancelled sub-tasks of the predecessor story **before 1e** | No |
| L9 | **Model errors:** BL-LOY-016 mis-cited (it is the order-total rule; now `{SPEC}` mind-map `cart-add-no-accrual`) · invented mind-map node id (caught by `models:check` TM-015) · #38 premise wrong · "missing availability" really means `product: null` (`availabilityData` is non-null in the schema) | Model written ahead of observation | 3x caught what the model missed: ended-not-swept state (new D17), GUID + 404, isBuyable/isInStock mismatch, over-stock counted, banner crop | Corrected in the run |
| L10 | **Keep:** 3x before the checklist (rows 13, 24–28 all became real findings) · classifier reading main-branch source to separate introduced vs pre-existing (1 of 5 real bugs was introduced) · a live progress-row read to tell reversal from drift · one-round verifier loop · per-case unconditional teardown (54/54 Archived) | — | — | — |

## Follow-ups (owner to assign)

1. Fixture fixes L1–L4 and L6 → test-data-engineer.
2. Lint for field-less `@td()` and Preconditions commands (L5) → `scaffold-rows.ts`.
3. Predecessor-ticket Jira dedup before 1e (L8) and the watcher timeout (L7) → `/qa-test` and `/qa-regression` skills.
4. Re-run MSN-E2E-003/006/008 after the cart sweep. The product question is still open.
