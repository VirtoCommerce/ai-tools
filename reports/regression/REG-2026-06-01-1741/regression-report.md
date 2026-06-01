# Regression Report — REG-2026-06-01-1741

**Selection:** `b2c` (tag-resolved → suites 006, 007, 008, 009, 010)
**Env:** vcst-qa @ Platform 3.1032.0, theme 2.50.0-alpha.2359 (Customer 3.1007.0, ProfileExperienceApi 3.1007.0, XCart 3.1016.0, Catalog 3.1025.0)
**Mode:** standard · **Seed:** none (no `--seed` passed) · **Browsers:** chrome / firefox / edge
**Date:** 2026-06-01 · **Endpoints:** all UP at pre-flight (storefront, admin, health, GraphQL = 200)

## Executive Summary

5 suites / 166 cases. **66 PASS · 11 FAIL · 84 BLOCKED · 3 SKIP.** Executable pass rate **85.7% (66/77)**; incl. blocked 40.2%. One **High** candidate regression (VCST-4612, configurator) reconfirmed and two browser-infra incidents handled via the fallback chain. The very high blocked count is **not** an environment outage — it is fixture drift + missing seed data + a few unimplemented features. **Quality gate: CONDITIONAL / NO-GO pending triage** of the VCST-4612 regression.

## Counts

| Suite | Name | Total | Pass | Fail | Blocked | Skip | Rate | Browser |
|-------|------|-------|------|------|---------|------|------|---------|
| 006 | B2C Organization | 39 | 1 | 0 | 38 | 0 | 2.6% | chrome |
| 007 | B2C Lists & Shared | 26 | 20 | 0 | 4 | 0 | 76.9% | firefox |
| 008 | B2C Members | 18 | 9 | 1 | 8 | 0 | 50.0% | edge |
| 009 | B2C Variations & Configs | 31 | 16 | 3 | 9 | 3 | 51.6% | edge (3rd attempt) |
| 010 | B2C Bulk Ship Dashboard | 52 | 20 | 7 | 25 | 0 | 38.5% | edge |
| **Total** | | **166** | **66** | **11** | **84** | **3** | | |

## Failures

| TC-ID | Sev | Expected → Actual | Bug |
|-------|-----|-------------------|-----|
| **B2C-CONFIG-016** | **High** | First click in freshly-expanded configurator accordion registers the option → section collapses, selection NOT registered (**VCST-4612 regression**) | BUG_009_002 |
| **B2C-CONFIG-017** | **High** | Radio selection sticks after first click → reverts to default (256GB), price stays $1,099 not $1,174 (same VCST-4612 root cause) | BUG_009_002 |
| B2C-BULK-007 | High | Duplicate SKU rows coalesce into 1 cart line (BL-CART-007) → 2 separate lines | BUG_010_004 ⚠ |
| B2C-LIST-028 | High | CSV file-upload control on /bulk-order → no upload UI exists | BUG_010_005 ⚠ |
| B2C-VAR-010 | Med | Variant selection updates URL with `?color=&size=` → URL never changes (no deep-link) | BUG_009_001 ⚠ |
| B2C-BULK-001 | Med | SKU entry resolves inline product (name/price/avail) → row shows raw SKU only | BUG_010_001 ⚠ |
| B2C-BULK-003 | Med | Invalid SKU shows per-row error → silently skipped, valid item added | BUG_010_002 ⚠ |
| B2C-BULK-006 | Med | qty=0 blocks Add to Cart → button stays enabled (min=1 not enforced in UI) | BUG_010_003 ⚠ |
| B2C-LIST-029 | Med | SKU autocomplete after 3+ chars → no typeahead | BUG_010_006 ⚠ |
| B2C-LIST-030 | Med | Clear error for non-existent SKU → silently discarded | BUG_010_007 ⚠ |
| B2C-MBR-018 | Low | Member count indicator on /company/members → none rendered | BUG_008_001 |

⚠ = needs triage; several /bulk-order items (CSV upload, autocomplete, inline resolution) may be **test-case expectation mismatches** rather than product defects, and BUG_010_004 (coalescing) is confounded by pre-existing cart items — see Bugs Found.

## Passes (by suite)

- **006:** B2C-ORG-039 (Company Info XSS — server-side NoHtmlTags rejection works).
- **007:** B2C-LIST 001–009, 011, 012, 014–021, 023, 024, 026 (20 — wishlist CRUD, shared-list visibility both directions, add-to-cart from list).
- **008:** B2C-MBR 001, 002, 004–006, 008–012 (9 — member listing, role display, edit).
- **009:** B2C-VAR 001–009, B2C-CONFIG 001, 002, 004, 008–012, 018 (16 — variant selection, price/stock updates, configurator add-to-cart, edit-in-cart).
- **010:** 20 ship-to / dashboard / order-history cases (Copy&Paste bulk mode resolves products and adds to cart correctly).

## Bugs Found (preliminary — `confirmed: false`, NOT yet filed)

1. **BUG_009_002 — High — VCST-4612 regression (configurator first-click).** `/CFG_LAPTOP` PDP, fresh load: expanding the Storage accordion then clicking an option immediately collapses the section without registering the selection; price/header keep the default. Reproduced on 2 cases (CONFIG-016/017) on edge. **Recommend: confirm via qa-testing-expert and reopen/link VCST-4612.** This is the run's go/no-go driver.
2. **BUG_010_004 — High (confounded) — duplicate-SKU cart lines.** Contradicts known B2B consolidation behavior (`reference_b2b_lineitem_consolidation` memory) and the observed qty included prior test items — likely cart-state pollution. Confirm on a clean cart before filing.
3. **BUG_009_001, BUG_010_001/002/003/005/006/007, BUG_008_001 — Medium/Low.** Cluster on /bulk-order (Quick Order) feature completeness + variant-URL + member-count. Triage to separate genuine gaps (invalid-SKU error feedback, qty=0 guard) from over-specified test cases (CSV upload, autocomplete) before filing.

Full detail in per-suite `suite-0NN-results.json`.

## Blocked Analysis (84 cases — root causes, none are env outage)

| Suite | Blocked | Root cause | Fix |
|-------|---------|-----------|-----|
| 006 | 38 | **Fixture drift:** `{{ORG_USER_EMAIL}}` repointed (May 2026) to a single-org user; all multi-org / org-switch / per-org pricing & cart-isolation scenarios un-runnable. | Remap suite 006 `Test_Data` to `MULTI_ORG_USER_EMAIL` alias, or seed a dedicated multi-org user for slot 1. |
| 010 | 25 | Bulk-order seed data + dashboard preconditions unmet. | `/qa-seed-data b2b` (+ catalog) before re-run. |
| 009 | 9 | SEED-REQUIRED: no discounted / conditional-dependency / File-section configurable products visible to Carlos (BuildRight). | Seed CFG variants incl. discounts + `dependsOnSectionId` chains. |
| 008 | 8 | Delegated-purchasing approval workflow not configured in BuildRight (no Approver role/threshold); 1 needs ≥10 members. | Configure approval workflow + seed members, or mark N/A if out of scope. |
| 007 | 4 | Unimplemented (email share, move-between-lists), large-list precondition, QA-bar overlay blocking user-switch. | Mark unimplemented as N/A; equivalent flow already covered by LIST-011. |

## Browser-Infra Incidents (handled — not product defects)

- **Suite 009 attempt 1 (chrome):** crashed mid-run on a Chromium user-data-dir conflict → 21 blocked. Known issue (close Chrome windows / restart MCP).
- **Suite 009 attempt 2 (firefox):** MCP pointer-action stability failure — all click/hover timed out though the app rendered clean (auth OK, PDPs OK, 0 console errors, GraphQL 200). Isolated to Firefox MCP layer.
- **Suite 009 attempt 3 (edge):** succeeded — 16/31 executed, the 3 fails above. Fallback chain recovered the suite.
- **Suites 007 & 010:** runner agents stopped mid-suite once each and were resumed to completion via SendMessage.

## Quality Gate: CONDITIONAL / NO-GO (pending triage)

- 0 Critical confirmed. **1 High candidate regression (VCST-4612) reconfirmed** — must be confirmed/filed before a B2C go decision.
- Coverage is materially incomplete (84 blocked, 51%) due to fixture drift + missing seed — **this run does not certify the B2C domain**.

### Recommended next actions
1. **Confirm VCST-4612** via `/qa-verify-fix VCST-4612` or qa-testing-expert; reopen if still broken on theme 2.50.0-alpha.2359.
2. Triage the /bulk-order cluster (BUG_010_*) — split real gaps from test-expectation mismatches; re-test BUG_010_004 on a clean cart.
3. **Re-run with seed:** `/qa-regression b2c --seed=b2b` after remapping suite 006's `{{ORG_USER_EMAIL}}` → `MULTI_ORG_USER_EMAIL` and seeding CFG-discount/conditional/File-section products. This should clear most of the 84 blocked.
4. Restart `playwright-chrome` MCP (clear user-data-dir) before the next interactive run.
