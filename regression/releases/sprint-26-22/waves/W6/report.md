# Sprint 26-22 · W6 UI kit, design tokens, a11y & i18n — report

**Owner:** Elena Kutasina · **Sub-task:** VCST-6802 · **Env:** vcst · **Lane:** playwright-edge, slot 3
**Runs:** REG-2026-11-12-0431-W6 — 048c, 045, 046, 070, 071, all priorities · REG-2026-11-12-0729-W6 — 083c (all) + 5 re-runs of 045 on USER_DEFAULT, after W3 released its accounts · REG-2026-11-12-0846-W6 — 7 BLOCKED 083c cases re-run (unblock pass)
**Build:** Platform 3.1097.0 · theme 2.62.0-alpha.2647 (redeployed mid-release; `release.json` names alpha.2642). Between the runs BackgroundJobs 3.1054.0→3.1055.0 and Xapi 3.1031.0-pr-70→3.1031.0 were redeployed; no 0729 failure traces to either.
**Seed before 0729:** `seed:loyalty-missions` (23 missions, progress orders for USER) and `seed-missions-deadline.mjs` run 202611120728 (ladder valid until 19:28Z).

## Verdict

**All 283 cases run: 105 PASS · 20 FAIL · 36 BLOCKED · 119 SKIPPED (Manual) · 3 inconclusive (048c TGT-002, COMP-VCEXPANSION-004 — layout runner gave no verdict; 083c MSNF-056).** No new product defect in this release: every FAIL is an open bug, a cancelled decision, an oracle stricter than WCAG, or a case held RED that waits for a PO decision. All triaged.

| Suite | Pass | Fail | Blocked | Skipped |
|-------|------|------|---------|---------|
| 048c Layout stability | 36 | 7 | 4 | 0 |
| 045 Accessibility | 4 | 3 | 1 | 22 |
| 046 Localization | 5 | 0 | 4 | 28 |
| 083c Loyalty missions | 60 | 10 | 27 | 1 |
| 070 Whitelabeling storefront | 0 | 0 | 0 | 51 |
| 071 Whitelabeling branding | 0 | 0 | 0 | 17 |

## FAIL

| Case | Observed | Verdict |
|------|----------|---------|
| 048c LAYOUT-CLS-001 | Home CLS 0.397 (limit 0.1) | DUPLICATE VCST-6710 |
| 048c LAYOUT-CLS-002 | CLS 0.190, source `ul.mega-menu__nav` | DUPLICATE VCST-6712 — confirm it is the same shift |
| 048c LAYOUT-IMG-001 | Store logo SVG without dimensions | DUPLICATE VCST-6709 |
| 048c LAYOUT-STR-001 | Horizontal scroll at 320px (353px) | DUPLICATE VCST-6708 |
| 048c LAYOUT-TGT-001 · COMP-HEADER-003 · 083c MSNF-062 | Controls 0–5px apart at 375px (pager, stepper, header) | TEST_DEFECT — BL-UI-006 8px gap rule is stricter than SC 2.5.8 |
| 048c LAYOUT-CNT-006 | "WF-3620" counted as a mid-word wrap | PENDING_DECISION — the break may be at the hyphen |
| 045 A11Y-SORT-001…003 | Address popup: first click sorts descending; non-sortable headers carry `aria-sort=none` | DUPLICATE VCST-6606 |
| 083c MSNF-046 | Every "Open mission" button has the same accessible name | DUPLICATE VCST-6742 |
| 083c MSNF-010 · 044 | No redeem-catalogue CTA in the banner / no "Redeem products" in the order modal | BY_DESIGN — VCST-5823 (dead CTA keys) was Cancelled; cases to align |
| 083c MSNF-093 | SKU modal Cart subtotal reads a bare "0" | BY_DESIGN — VCST-5830 Cancelled; VCST-6141 (backend totals) replaces it |
| 083c MSNF-068 | No translation for the locale: internal name shown, description blank (KB-3477E3D7) | PENDING_DECISION — default-language fallback |
| 083c MSNF-099 · 100 · 101 · 102 | SBTM cases held RED: deleted-product placeholder, unbuyable in-stock badge, over-stock totals, ended-not-swept card | PENDING_DECISION — expectations are hypotheses with no PO wording |

## BLOCKED

| Cases | Verdict | Cause |
|-------|---------|-------|
| 083c 006, 008, 022, 039, 067; 049, 050, 063, 087, 091, UIP-EXPIRE-001, UIP-STORAGE-001 | TEST_DEFECT | Need request interception, evaluate, computed styles, emulation or storage tampering — Playwright `.spec` twins |
| 083c 072…080 | DATA | MSN_E2E_* fixtures not on vcst; `seed:missions-e2e` fails there (earn order: "The cart has validation errors") |
| 083c 007, 071 · 034 · 065 | DATA | No zero-mission account · untracked stock on SKU targets · ALT (AUD) mission absent in a USD session — likely currency-filtered, not verified |
| 083c 056 (inconclusive) | TEST_DEFECT | Premise "0 days left" unreachable while hours remain: daysRemaining rounds up (KB-26B8BE64) |
| 083c 004, 005 | NOT_TESTABLE | Toggle store-wide loyalty settings on the shared store |
| 048c COMP-VCINPUT-002, COMP-VCBUTTON-005, 006 | ENV_CONFIG | Storybook stories timed out after 30s |
| 048c CNT-003 · 046 L10N-002, 003, 004, 006 | TEST_DEFECT | Scope `#main-content` matches nothing · `[GQL]` steps inside a browser case |
| 045 A11Y-VCP-001 | DATA | VARIANT_PICKER_MASTER returns 404; `seed:variant-picker` creates the product but xAPI never serves it on vcst |

**Unblock pass (0846):** MSNF-019, 090 and 096 PASS when run as USER, the account the ORDERVALUE fixture is seeded for — the cases declare LOY_PERSONAL_NOORG and need their persona repaired. 096 also saw PERSKU-ALL at 75% (the USER seed state) where the case expects 0%.

## Other observations

- 045 A11Y-SR-006 and A11Y-CC-004 pass on USER_DEFAULT; CC-004's selector `.save-v2` is stale (the icon is `.lucide-save`).
- The 045 password key for USER_DEFAULT on this lane is `TEST_USER_PASSWORD_VCST`; `USER_DEFAULT_PASSWORD_VCST` does not exist.
- 046 L10N-005 passed, but `/de/accessories` showed an English 404 after Back (KB-912B0774).
- Mission expiry sweep: DUE-00 left the list within ~18 min of its end date.
- State restored: noorg cart line re-added at qty 1; the item added for 045's precondition removed. The two seeder orders for USER stay (mission progress).
- 118 Manual cases (all of 070/071, most of 045/046, 083c MSNF-064) need a human pass or automation.
