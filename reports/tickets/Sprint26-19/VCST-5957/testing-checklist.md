# Testing checklist — VCST-5957 "[Loyalty] Mission and challenges redesign"

**Build:** vcst-qa · theme `2.59.0-pr-2524-3069-30691594` (vc-frontend PR #2524) · Loyalty `3.1009.0-pr-18-4411` · Platform 3.1075.0 · store B2B-store, Customer mode
**Path:** FULL · **Model:** `reports/ba/test-models/VCST-5957-2026-10-01.md` (#24–#44) · **Discovery:** `reports/exploratory/SBTM-VCST-5957-2026-10-01.md`
**Account:** `@td(LOY_PERSONAL_NOORG)` · **Seed run:** `@td(MSN_DL_RUN)` handle `202610011149` — boundary values valid until **2026-10-01T23:49Z**
**Oracle sources:** the ticket has **no written ACs and no DoD**. ACs are derived from annotation 83896 (A1–A4), top-banner image 83929 (B1), the Changes artifact (C-items) and the PR #2524 description. Design dependency VCDZ-897 is still In Progress.
**Case column:** new Draft rows authored this run are MSNF-088..MSNF-102 (083c) and MSN-E2E-009 (083d); the other ids are existing cases. Model # → id map: `reports/ba/test-models/VCST-5957-2026-10-01.md`.

| # | Condition (what is checked) | Source | Case | Verdict |
|---|---|---|---|---|
| 1 | **[JOURNEY]** At a glance the customer distinguishes completed / in-progress / urgent missions → opens a PerSku mission → adds the in-stock target → the cart holds exactly that qty → the balance banner equals points-history | story + A1–A4 | MSN-E2E-009 | PASS (4a; C1 MSN-E2E-009 PASS) |
| 2 | Type chip is on top of the card banner, tonal info sm, sentence case, glyph per goal type (OrderValue cash · OrderCount shopping-bag · PerSku barcode "Featured SKUs") | A1, A2, C2 | MSNF-095; MSNF-013 | PASS (4a; glyph check MSNF-095 inconclusive in C1) |
| 3 | Points chip is tonal warning with an inline star; value = mission reward | A2, C3 | MSNF-095 | PASS card (4a); modal chip colour differs — Low draft |
| 4 | Completed mission: green overlay + 56 px circle-check; the "Completed" chip is gone; footer "Mission completed" | A4, C4 | MSNF-096; MSNF-019 (stale), MSNF-087 (stale) | PASS (4a; C1 MSNF-019 BLOCKED on fixture drift) |
| 5 | Completed status is exposed to assistive tech (not colour/icon-only) | gap-AC-9, BL-A11Y-002/003 | MSNF-090 | PASS — text "Mission completed"; icon unnamed (Low draft, C1 MSNF-090 FAIL) |
| 6 | Completed overlay contrast: check ≥3:1 and chip text ≥4.5:1 (3x calc ~2.1:1 over white) | BL-A11Y-003 | MSNF-091; 4v | FAIL — check 2.04–2.79:1 → **VCST-6142** (a11y, non-blocking) |
| 7 | Card CTA is VcButton sm outline primary, ~38×38 | A3, C5 | MSNF-061/062 | PASS 38×38 (4a, 4v) |
| 8 | Card banner height (design 210 px; build `h-52` = 208 px) — design parity | C1 (DRIFT) | 4v | DRIFT 208 vs 210 px (vs DESIGN, advisory) |
| 9 | Card body order: progress note → bar + % → title → footer (date badge + CTA) vs design "urgency first" — **PO decision** | C20 (DRIFT) | 4v; MSNF-024 (unsure) | DRIFT — body order differs from design (advisory) |
| 10 | Progress bar info-500 when in progress, success-500 when completed; card and order modal agree | PR text | MSNF-096; MSNF-014/016 | PASS (4a; C1 MSNF-096 parity case corrected) |
| 11 | Date dot at `daysRemaining` 1, 15 → danger · 16, 30 → warning · 31 → success · null → "No deadline" success | C19, PR text | MSNF-088 (`MSN_DL_DUE_*`) | PASS 1/15 danger · 16/30 warning · 31/null success (4a; C1 MSNF-088 PASS) |
| 12 | Completed + 15 days left → "Mission completed", success dot | PR text | MSNF-089 (`MSN_DL_DONE_SOON`) | PASS (4a; C1 MSNF-089 PASS) |
| 13 | Expired-not-swept mission reads "0 days left" + danger + live CTA (observed 3x) — is a live CTA on an ended mission acceptable? | 3x EXP-04 | MSNF-102 (after-end window); MSNF-088 L01 ("1 day left") | FAIL — pre-existing, Low draft (C1 MSNF-102 FAIL) |
| 14 | Banners are surfaces with a 4 px start-edge accent (primary / info), a solid icon circle with a white glyph, and an uppercase 14 px title "Virto Rewards balance" | B1, C9–C12 | 4v; MSNF-060 (stale) | PASS (4v; DESIGN-PROPERTY border 4 px, icon 56 px CONFIRMED) |
| 15 | "Points history" is a soft sm button, ≥24×24 at 375 (VCST-5834) and navigates to `/account/points-history` | B1, C11, BL-UI-006 | MSNF-094; MSNF-061/062 | PASS 119×38 at 1920 & 375 — VCST-5834 fixed |
| 16 | Balance banner value = points-history Balance | map §2b | MSNF-094 | PASS 40,939 = 40939 (C1 MSNF-094 PASS) |
| 17 | **Redeem banner "Rewards catalog" button** — design shows it; build has no `linkTo` (absent live in 1c and 3x) | B1, C (DRIFT) | MSNF-010 (#35 not re-authored — duplicate); MSNF-010, MSNF-044 | NOT BUILT — accepted scope cut (operator); VCST-5823 linked |
| 18 | 12 cards per page, pagination, 3 columns at desktop, grid gap 20 px — unchanged | C8, C18 | existing 083c | PASS (4a) |
| 19 | Sort dropdown (Default/Newest/Ending soon/Progress) — **not built, declared PR scope cut** | C14, C15 | none — record as ABSENT | NOT-RUN |
| 20 | "Account setup" mission kind — **not built, no backend type** | C17, A-image | none — record as ABSENT | NOT-RUN |
| 21 | SKU modal: 60rem, VcLineItems columns Product / Properties (SKU) / Price per item / Quantity / Total, estimate hint | PR text (CONTRADICTS artifact scope) | MSNF-027/029/030 | PASS (4a) |
| 22 | OOS target (flags false): stepper disabled, stock badge agrees; the in-stock row is enabled; Add disabled at 0 | PR text, ECL-2.1 | MSNF-035 + MSNF-092; MSN-E2E-002 | PASS (4a; C1 MSNF-092 PASS) |
| 23 | Target with null product (missing availability): stepper disabled, cannot be added | PR text | MSNF-092 (`MSN_DL_SKU_NOAVAIL`) | PASS (4a) |
| 24 | Null-product row title/link: 3x saw a raw GUID title + a 404 link | 3x EXP-02 | MSNF-099 | FAIL — pre-existing, Low draft (C1 MSNF-099) |
| 25 | Unbuyable-but-in-stock row: "In stock N" badge next to a disabled stepper | 3x EXP-03 | MSNF-100 | FAIL — pre-existing, Low draft (C1 MSNF-100) |
| 26 | Line Total = unit × qty; Cart subtotal currency-formatted at 0 units (3x: bare "0") | PR text, BL-PRICE-005 | MSNF-093; MSNF-029 | FAIL — bare "0", pre-existing, VCST-5830 linked (C1 MSNF-093) |
| 27 | Over-stock qty: field invalid, "Order from 1 to N" hint, Add disabled — and the summary should not count it (3x: counts it) | 3x | MSNF-101; MSNF-034 | FAIL — pre-existing, Low draft (C1 MSNF-101 BLOCKED: fixture) |
| 28 | After an add the modal auto-closes, the row shows "in Cart N"; "Buy at least N" turns green once the target is reached | 3x | MSN-E2E-002 (re-base) | PASS (4a) |
| 29 | Cart-add moves no mission progress; removing the line leaves progress unchanged | {SPEC} mind-map `cart-add-no-accrual` | MSN-E2E-009 | PASS — progress unchanged by cart add/remove (4a, 3x, C1 MSN-E2E-009) |
| 30 | Modal keyboard: focus trapped, returns to "Open mission" on close; Esc closes | ECL-15.1, BL-A11Y-001 | 4v | PASS (4v BL-A11Y-001) |
| 31 | Every card CTA has the same accessible name "Open mission" (no mission context); the progress bar has no progressbar role | 3x, BL-A11Y-002 | 4v | FAIL — names: VCST-5826 linked; progressbar role → **VCST-6143** |
| 32 | 375 / 768: no horizontal scroll; chips fit the banner; the modal table doesn't overflow the page; long SKUs truncated at 1920 (A and B read alike) | BL-UI-004, VC-UI-006 | MSNF-097 | PASS no overflow 375/768 (4a); BL-UI-006 spacing in shared comps → Low draft (out of scope) |
| 33 | Dark theme: banners/cards/modal readable; the dark completed check is near-black (contrast) | 3x, BL-A11Y-003 | 4v (#38) | PASS readable; dark check 2.56–2.79:1 → VCST-6142 |
| 34 | de / fi / ja: chip labels, day plurals and `subtotal_hint` translated, no raw keys; de percent not localised ("3.6%") | VC-UI-007, ECL-7.2 | MSNF-098; MSNF-053 | FAIL Low — ja typo / en plurals / de-fi % (Low draft) |
| 35 | Card banner crop: 208 px crops 2048×768 artwork to ~66 % width, cutting baked-in text | 3x EXP-05 | 4v | ADVISORY — artwork text cropped (Low draft) |
| 36 | Console clean (no unknown-icon warnings for barcode / cash / shopping-bag / circle-check / badge-check) on the page and both modals | DoD proposal | 4a | PASS console 0 errors, GraphQL clean |
| 37 | Unknown / raw `PerSku` type falls back safely — **unreachable** (Admin offers 3 goals) | gap-AC-17 | none — GAP | NOT-RUN |
| 38 | Pager does not update the URL (page lost on reload/back) — UIP-BACK | 3x | none — GAP, named | NOT-RUN |
| 39 | Epic seam: points from missions are spendable in the loyalty catalog (sibling VCST-5100/5101) — reached only via the nav "Loyalty" item | Epic VCST-5099 | 083 (not in C1) | PASS (reachability via nav "Loyalty") |
| 40 | **Design `vs. DESIGN` axis** — no local copy of project `518d0b90` at `.design-source/518d0b90-03fa-4d3f-9183-f7e6a4033346/` | visual-axis §1 | 4v | DRIFT — DESIGN-PROPERTY 5/6 match; token/icon diff SKIPPED (no .design-source copy) |

**Uncovered (stated, not omitted):** #19, #20 (not built: scope cut / no backend), #37 (unknown type unreachable), #38 (UIP-BACK, named not authored), #40 (vs. DESIGN skipped, no local design source). No partially complete PerSku mission exists for this account (fixture gap), so a partial SKU-modal state is unobserved.
**Verdict: PASS WITH NOTES** (2026-10-01; 3 unbuilt items accepted as scope cuts by the operator — rows 17, 19, 20). C1 `REG-2026-10-01-1243`: 10 P / 9 F / 9 B / 1 inconclusive → triage `reports/regression/REG-2026-10-01-1243/triage-report.md`. AC coverage 36/40 = 90 %. Filed: VCST-6142, VCST-6143 (a11y, standalone). Linked: VCST-5823, VCST-5830, VCST-5826.
**Not filed (below severity floor): 6 Low** — `reports/bugs/open/low/BUG-missions-sku-modal-degraded-target-states.md` · `BUG-missions-ended-mission-zero-days-live-cta.md` · `BUG-missions-redesign-visual-polish.md` · `BUG-missions-locale-defects.md` · `BUG-shared-pagination-stepper-target-spacing-375.md` · `BUG-account-sidebar-word-break-768.md`.
