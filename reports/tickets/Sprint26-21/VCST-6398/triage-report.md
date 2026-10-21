# Triage — VCST-6398 (ticket mode, --verify)

| Field | Value |
|---|---|
| Source | `testing-checklist.md` (A/B/X rows incl. R13-* from REG-2026-10-20-1418) · 2026-10-20 · vcst |
| Build | vc-frontend-next `3.1.0-pr-11-d67b-d67b0e0a` (footer, every lane) |
| Issues collected | 23 (18 FAIL · 4 BLOCKED · 1 NOT-RUN); R13-2 split into 4 cases, R13-8 into its 22 regression cases |
| Live repros (vc-fix:qa-investigate) | 11 candidates → 6 confirmed · 3 reproduced-by-design/PO · 1 stale test · 1 not reproduced |
| Phase 2 | skipped (ticket mode — no cross-run history) · `--fix` ignored in ticket mode |

**Reading rule applied after the user's two corrections:** vc-frontend-next is a separate, redesigned theme, and every regression suite is written for vc-frontend. So R13 is indicative on this build: a pass means the behaviour held, and a UI or placement FAIL means the suite does not match the Next design until Next's source says otherwise. Owning repo is vc-frontend-next wherever the cited code lives there.

## 1. Confirmed real bugs
| Case | Severity | Repo | Root cause | Package | New with merge |
|---|---|---|---|---|---|
| R13-3 | Medium | vc-frontend-next | quotes module locale not awaited (`quotes/index.ts:81`) + setup-time `t()` in quotes.vue/view-quote.vue/edit-quote.vue → raw keys on 7/10 hard loads | `evidence-R13-3/` | no |
| X4 | Medium | vc-frontend-next | `category.vue` `changeProductsPage` sends the accumulated grid to `viewItemList` → page-N repeats pages 1..N-1 | `evidence-X4/` | no (≥2.40.0) |
| V8 | Medium (a11y, standalone, non-blocking) | vc-frontend-next | `option-product.vue` / `option-product-none.vue` render VcRadioButton without a name → axe `label` critical | `evidence-V8/` | no |
| QUOTE-005 | Low | vc-frontend-next | `quote-line-items.vue` omits `show-placed-price` → wide layout shows list price beside the proposal total | `evidence-QUOTE-005/` | no |
| V6 | Low (BL-UI-001 literal FAIL @1920 only) | vc-frontend-next | new ProductConfigurationChecklist mounts late with no reserved space → CLS 0.1015 @1920 (0.0996 @1280) | `evidence-V6/` | yes (the part that crosses the limit) |
| BUG_098_001 | Low | vc-frontend-next | logout calls Firebase `deleteToken` with no token → SDK registers default `/firebase-messaging-sw.js` → 404 console error | `evidence-BUG_098_001/` | no (KB-EED5F6AC) |

## 2. Test-case / checklist fixes
| Case | Class | Where | Fix (applied / recommended) |
|---|---|---|---|
| A16 | ASSERTION_DEFECT | checklist | **applied** — Expected per vc-frontend#2533 §Quotes (positive-number + aria; no upper bound on quotes); re-run pending |
| B2 | ASSERTION_DEFECT | checklist | **applied** — Expected "no data returned" (sales-rep.md §10 A3); re-evaluated on recorded HAR |
| X12 | TEST_DATA_DEFECT | checklist | CFG-004/008/010 fixtures 404; split into 3 rows next round |
| V7 | ASSERTION_DEFECT | BL-UI-006 | recommended `/qa-review-oracles bl`: add the WCAG 2.5.8 spacing exception |
| R13-5 | ASSERTION_DEFECT | BL-GA4-003 / suite 043 | recommended: `purchase` is documented as not firing for Manual payment |
| R13-1 SR-HD-100 | ASSERTION_DEFECT | suite 093b (vc-frontend) | recommended `@td(ORG_ACME.platform_id)` — not applied (rule 5; suite targets vc-frontend) |
| QUOTE-001/006/007 | STALE_TEST | suite 015 (vc-frontend) | recommended rewrites (cart empties after RFQ — KB-487FCE72; Approve places the order — KB-2BCFC8A6) |
| GA-034 | STALE_TEST | suite 043 (vc-frontend) | Next `/` always renders demo-home with no tracked list (KB-A788D882); vc-frontend-only case |
| R13-4 | TEST_DATA_DEFECT | qa-user-01 address | last name with digits fails the member-name whitelist (VCST-5690) |
| R13-6 images, R13-7 coupons, MSNF-072/073/074, SR-HD-048, SR-TK-001, CMP-014, GA-036 | TEST_DATA_DEFECT | fixtures | re-seed / create in case (FIFTH RULE); coupons: ZUR10 needs subtotal ≥100, data intact (KB-2800B0C0) |
| B7, MSNF-006, SR-HD-035/036/057/060/102/109, CMP-036/038/041/052 | TEST_STEPS_DEFECT | executability | need interception / CDP — EX-code or machine lane |
| CFG-VAR-019 | TEST_STEPS_DEFECT | lane routing | API-only case on the browser lane |

## 3. Dismissed / needs-review
| Case | Class | Reason |
|---|---|---|
| X1 | KNOWN_ISSUE | VCST-6396 (raw `Sales_rep.navigation.link` while plugin loads) |
| X6 | KNOWN_ISSUE | VCST-6099 (`category_undefined` on /search) |
| V10 | KNOWN_ISSUE | paprika preset not WCAG-gated (VC-UI-001, KB-9F5ED18C) |
| V11 | by design → PO | Differences always keeps Price/Availability/pinned; counter counts differing rows (KB-0D6455F6) |
| CMP-015 | by design (deliberate hold-out) → PO | `IS_ORGANIZATION_SWITCHER_SHOWN = false` on Next desktop (d5cc49aa, VCST-6030); mobile has it (KB-F97583AC) |
| X5 | needs-review → PO | empty `view_item_list` on zero-result grids; no human rule forbids it (KB-2A8EBFB8) |
| V9 | needs-review | no keyboard barrier in Firefox; static axe condition real; WebKit untested (KB-8A4AB65C) |
| B12 | ENV | Punchout module absent on vcst |
| MSNF-004 | ENV | needs an env-wide setting flip |

No tracker ticket filed, no fix triggered — human decides.
