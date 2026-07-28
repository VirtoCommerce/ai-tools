# Test Case Lifecycle Report — TLC-2026-07-25-1251

## Summary
- **Input:** `regression/suites/Frontend/cart --auto-fix`
- **Input Type:** direct-scope (domain cart)
- **Date:** 2026-07-25 12:51
- **Env:** vcst-qa · Platform **3.1048.0** · Theme **2.54.0-pr-2395-fd70**
- **Modules:** XCart 3.1028.0, Cart 3.1007.0, Marketing 3.1006.0, Pricing 3.1004.0, Loyalty 3.1004.0, XCatalog 3.1014.0, Customer 3.1020.0
- **Verdict:** **APPROVED WITH WARNINGS** (revised 13:05 after remediation — was NEEDS FIXES). All required gates pass; G7 carries 2 pre-existing duplication warnings and 48 `REQ-001` traceability items remain by policy.

> **Post-verdict remediation (all four follow-ups completed).** The G1 blocker was resolved by renumbering; the three unresolved hypotheses were re-verified live and promoted; the price-change cluster was triaged (and **reclassified** — see below); the five test-data gaps were authored and the two new fixtures provisioned. Details in §Remediation.

## Phase Results

| Phase | Agent | Status | Key Metrics |
|-------|-------|--------|-------------|
| 1. Scope | orchestrator | Done | 3 suites (028/029/030), 93 cases |
| 2. Sync | — | **Skipped** | Direct scope, no change source |
| 3. Analyze & Generate | test-management-specialist | Done | 9 real gaps → 9 cases (CART-090..098); 2 flagged false gaps |
| 4. Review & Fix | test-management-specialist | Done | 417 → 115 findings; **80 Critical → 0** |
| 4c. BL Audit | — | **No-op** | 0 BL candidates surfaced (nothing to triangulate) |
| 5. Verify | qa-testing-expert (firefox) | Done | 9 targets; 1 VERIFIED, 6 CHANGED, 1 blocked-on-fixture, 1 not-executed |
| 6. Approve | orchestrator | **NEEDS FIXES** | 8/9 gates pass; G1 fails |

## Quality Gates

| Gate | Status | Details |
|------|--------|---------|
| G1: Structure | **FAIL** | 13 duplicate case IDs across suites (below). In-file structure is clean: 50/34/18 rows, uniform 15 columns, no in-file dupes. |
| G2: Determinism | PASS | 0 Critical. 71 D-004 `[WAIT]` insertions + 37 D-005 splits. 1 residual High D-005 (CART-093). |
| G3: Completeness | PASS | ≤3 High: 9 C-005 `errors[]` gaps closed. |
| G4: Testability | PASS | 0 Critical. 92 `[DOM]` + 31 `[MATH]` assertions made falsifiable. |
| G5: Data Validity | PASS | `@td()` 106/106 resolved, 0 hardcoded GUIDs, `{{VALID_COUPON_CODE}}` removed. |
| G6: Coverage | PASS | BL mapping ≥80% on P0/P1; 0 unresolved CONTRADICTORY (4c had no candidates). |
| G7: Duplication | **WARN** | 2 pre-existing DUP-004 (CART-044 vs 024; CART-066 vs 065). |
| G8: Environment | PASS | 0 BROKEN. Storefront/`/cart`/platform all 200. |
| G9: Sync | N/A | Phase 2 skipped. |

## Findings: before → after

| Suite | Before | After | Critical | High | Medium |
|---|---|---|---|---|---|
| 028 | 141 | 48 | 18 → **0** | 77 → 18 | 45 → 29 |
| 029 | 180 | 50 | 36 → **0** | 108 → 25 | 35 → 24 |
| 030 | 96 | 17 | 26 → **0** | 51 → 6 | 18 → 10 |
| **Total** | **417** | **115** | **80 → 0** | 236 → 49 | 98 → 63 |

48 of the 49 residual High are `REQ-001` (no requirement link) — deliberately not auto-fixed, since satisfying it means inventing ticket numbers. The 1 other is a compound step in CART-093.

## G1 blocker — 13 duplicate case IDs (needs your decision)

`CART-057, 058, 059, 060, 061, 062, 063, 064, 069, 070, 071, 072` collide between **028** and **030**; `CART-073` collides three ways (028/029/030). All are genuinely distinct cases. The per-file linter cannot see this, so it went undetected.

**This has already destroyed evidence.** In run `REG-2026-07-24-2121`:
- `CART-070` — **FAIL** in 028 (*Save for Later*) and **BLOCKED** in 030 (*Merge Selection Mixed+Mixed*) → one `CART-070-FAIL-trace.json`
- `CART-073` — **PASS** in 028 and **FAIL** in 030 → one `CART-073-FAIL-trace.json`

The trace namespace is `{TC-ID}-FAIL-trace.json` per run (`.claude/rules/reports.md` §6), so colliding IDs silently overwrite each other's failure evidence. `.triage-fingerprints.json` also keys on case ID, cross-contaminating the flakiness feed between suites, and two open bug reports cite these IDs ambiguously.

**Recommended remediation** (not executed — renumbering needs your approval):
- Renumber **030's whole 17-case block** `CART-057..073` → **`CART-100..116`** (keeps 030 contiguous; clear of 090-098 and every other suite).
- Renumber **029's `CART-073`** → **`CART-117`**.
- Leave **028 untouched** — it is the anchor side, `Reviewed`, tied to VCST-4896/4590/4205/5101.
- Before executing: disambiguate each external citation (the 2026-07-24 traces, `test-data/README.md`, 2 open bug reports), and leave the historical `REG-*` artifacts as-is.

Traceability risk: **High** for 030's block (live traces + 2 open bugs in the blast radius); **Low** for 029's single ID.

## Cases generated (9)

| Case | Suite | Title | Priority | State |
|---|---|---|---|---|
| CART-090 | 028 | Add to Cart — Out-of-Stock Blocked (Negative) | High | Executable |
| CART-091 | 028 | Subtotal Rounding Across Fractional-Cent Lines (Boundary) | High | Needs re-verify |
| CART-092 | 028 | Coupon Cannot Drive Total Below Zero (Negative) | High | Rescoped, executable |
| CART-093 | 028 | Currency Switch — Applied Coupon Recalculates (Negative) | High | **Blocked on fixture** |
| CART-094 | 028 | Currency Switch — Empty Cart (Boundary) | Medium | Executable |
| CART-095 | 028 | Coupons Sidebar — Min-Order Threshold (Boundary) | **Critical** | Executable |
| CART-096 | 029 | Persistence at Max Available Stock (Boundary) | High | Needs re-verify |
| CART-097 | 029 | Price Change — Admin Sets Price to Zero (Negative) | High | Executable |
| CART-098 | 030 | Merge — Combined Qty Exceeding Stock (Boundary) | High | Needs re-verify |

## Phase 5 — what live verification caught

The generated cases did **not** survive contact with the environment. Six of nine needed correction:

1. **A fabricated selector, 20×.** The D-005 logout-boilerplate rewrite invented `data-testid="main-layout.top-header.account-menu.sign-out-button"` — wrong attribute spelling (convention is `data-test-id`) and a dotted value existing nowhere in the codebase. It replaced vague-but-honest prose with precise-looking fiction: the exact GRD-002 failure the pipeline exists to prevent. Corrected to the live two-click flow `[data-test-id="account-button"]` → `[data-test-id="sign-out-button"]`; verified 0 remaining.

2. **CART-095 (Critical) would have failed a correct product.** It asserted "no discount line appears" — live, the Discount row is *always* rendered at $0.00. It also used the dashed card border as the rejection signal, but dashed is the *default* state; the real discriminators are a red icon + "This code is not valid". Its "re-apply the coupon" step was not executable at all (the Apply button stays disabled for a rejected code until reload). The threshold logic itself is correct, and BL-CHK-006 held exactly: `59.96 − 6.00 + 0.00 + 10.79 = 64.75`, tax on the discounted base.

3. **Soft-404 on three cases.** `/product/<sku>` returns HTTP 200 with a client-rendered "Page not found" for the AGENT-TEST seeded fixtures. Corrected to the working slug paths. Note the route is *not* broken generally — 7 pre-existing cases use `/product/{{TEST_SKU}}` (`XKC-38084072`) and all 7 passed in the last run, so it resolves for indexed catalog SKUs and fails only for the seeded fixtures.

4. **Two cases were vacuous or unverifiable.** CART-092's "total below zero" boundary is unreachable ($5 coupon vs a $9.99 cheapest fixture) — it would have passed vacuously, worse than no test; rescoped to the reachable invariant. CART-093 cannot be verified at all: no AGENT-TEST fixture carries a EUR price, so every line collapses to €0.00 and any coupon invalidates for the wrong reason.

5. **CART-091's `{OBSERVED}` tags were unearned.** The verifier reported it VERIFIED citing `4 × $14.99 = $59.96`, but that is CART-095's scenario — CART-091 is 3 distinct SKUs at qty 3/7/11. Its own rounding-drift boundary was never executed. The `[MATH]` assertion was demoted back to `{HYPOTHESIS}` with a re-verify note; the `[FORMAT]` 2-decimal assertion stays `{OBSERVED}` (directly seen).

## Price-change cluster — a shared test defect, not six product bugs

`CART-024/028/029/043/044/076` (029) all FAILed in the last run. The storefront surfaces **no** stale-price warning UI at all — across ~10 `/cart` renders the line-item row exposes only Product / Price per item / Quantity / Total, with no badge, toast, or strikethrough. But five of the six don't require one; they accept a plain price update, so a missing surface cannot explain their failure.

What all six share is one test-design defect: no product is named (literally `add product to cart`, no `@td()`); hardcoded before/after prices that **contradict each other** across cases ($10→$15, $20→$15, $10→$15, $25→$18) against the same unnamed product, violating the no-hardcode rule; and all are admin-destructive on a shared fixture while carrying "do not run during parallel regression", yet sit in a suite the runner batches 3-wide.

`CART-044`'s `[DOM] visual indicator informs user of price change` is the lone genuine product question — it targets a surface I found no evidence of, the same nonexistent-surface pattern as `project_storefront_no_tracking_number_ui`. Settling it needs an admin price mutation. **Not fixed and not filed** — this is `/qa-triage-results` scope.

## Also observed (not filed)

An intermittent `ApolloError: NetworkError when attempting to fetch resource` on currency switch (1 of 3 attempts) that **silently no-ops with no user-facing message** — the header stayed EUR and nothing told the user the switch failed. Recovered on retry. Worth investigating independently; a silent failure with no UI signal is the shape of a real defect.

## Test-data findings (route: `test-data-engineer`, not product bugs)

1. No EUR/second-currency price list on any AGENT-TEST fixture — blocks CART-093 as designed.
2. `.env.vcst` `OOS_SKU=OOS-PRODUCT-001` disagrees with `aliases.json` `PROD_OOS` sku `QA-OOS-001`.
3. `PROD_OOS`'s recorded GUID/route soft-404s; only `/seed-test-fixtures/agent-test-oos-fixture` works. The alias should carry a working `slug`/`url` field.
4. No fixture priced under $5 — blocks a genuine discount-exceeds-subtotal boundary.
5. The OOS fixture is hidden by default: the category page ships "Show in stock" **checked**, contradicting `feedback_show_in_stock_localstorage`.

## Files Modified

| File | Rows |
|---|---|
| `regression/suites/Frontend/cart/028-cart-core.csv` | 44 → 50 |
| `regression/suites/Frontend/cart/029-cart-validation-persistence.csv` | 32 → 34 |
| `regression/suites/Frontend/cart/030-cart-merge.csv` | 17 → 18 |
| `config/test-suites.json` | cart testCount/estimatedMinutes synced (cart entries only) |
| `scripts/test-cases/sync-test-suites.ts` | suite 030 removed from `CSV_LINT_BASELINE` (now passes; backlog 7 → 6) |

## Remediation (post-verdict, 2026-07-25 13:05)

### 1. ID collisions — RESOLVED (G1 now PASS)

Suite 030's block `CART-057..073` → **`CART-100..116`**; 029's `CART-073` → **`CART-117`**; 028 untouched as the anchor side. Verified **zero `CART-*` collisions** across all of `regression/suites` (106 IDs). No internal cross-references needed changing — every reference in 029/030 points outward to 028's `CART-001..008`.

External citations disambiguated by reading each: `BUG-cart-storefront-display-gaps` cites **028** (untouched); `BUG-cart-configurable-line-summary` and `test-data/README.md` cite **030** and were updated with the old IDs annotated. Historical `REG-*` artifacts left as immutable record.

### 2. Hypotheses re-verified live — all three promoted to `{OBSERVED}`

| Case | Result |
|---|---|
| CART-091 | Subtotal **$2,006.89** across 3 lines, **drift 0**; BL-CHK-006 total $2,408.27 |
| CART-096 | Qty 5 (= stock ceiling) survived sign-out → sign-in unchanged; no stock message |
| CART-098 | **No oversell.** Merge retains raw qty 6 vs stock 5 but flags the line *"You can order maximum 5 item(s)"*, `+` disabled. Confirmed reactive (message clears at qty 5), not a static banner. Title/assertion reworded — "capped/rejected" was false |

Unproven and worth a follow-up: "Place order" was disabled at qty 6 **but also at the valid qty 5** (generic incomplete-info gate), so a hard stock block at checkout is not demonstrated.

### 3. Price-change cluster — RECLASSIFIED as a real product bug

The earlier "shared test-design defect" call in this report was **wrong**. Collected evidence shows a rigorous exclusive-access repro: after an admin price change, `getCart` keeps returning stale `listPrice`/`salePrice`/`placedPrice`/`extendedPrice` across reloads, with subtotal computed off them; only a cart mutation forces a reprice. Confirmed both directions. The isolating detail: `product.availabilityData` and the "Recently browsed" widget in the *same response cycle* already show the new price.

Filed as a draft: **`reports/bugs/open/BUG-stale-cart-price-after-admin-price-change.md`** (P1, price integrity; was `BUG_029_005` inside the run report). **Not filed to the tracker.**

What survives from the original critique, as a separate test-side issue: the six cases name no product and carry mutually contradictory hardcoded prices, so they still need `@td()` fixtures + serialisation (`/qa-review-tests suite 029 --fix`). CART-044's missing price-change *indicator* is a nonexistent surface, not a regression — needs design-intent confirmation.

### 4. Dead PDP route — 13 cases fixed (a defect green tests were hiding)

**`{{FRONT_URL}}/product/<sku>` 404s for every SKU** — confirmed directly in-browser (`/product/XKC-38084072` → "404 Page not found"; the report's earlier claim that it worked for indexed catalog SKUs was wrong, inferred from test-pass status rather than observed).

Because the agent-native runner silently improvises around a dead URL, **all 7 cases using it passed** in `REG-2026-07-24-2121` — the broken step never once surfaced as a failure. Fixed: 7 cases via `/search?q=` + click-matching-card (a route documented in `sitemap.md`), and 6 further occurrences of `/product/@td(PROD_*.sku)` in CART-037/054/055/078 switched to the new `@td(PROD_*.url)` field.

### 5. Test-data gaps — authored, guarded, and provisioned

The root cause of the missing-currency gap was in the seeder, not the data: `seed-standard-products.mjs` created a single pricelist and hardcoded `currency:'USD'`, so no fixture *could* carry a second currency. Reworked to one pricelist per currency, with teardown sweeping all of them.

| Gap | Resolution |
|---|---|
| No second-currency fixture | **PROD-106** `QA-MULTICUR-001` (24.99 USD / 22.49 EUR) — **seeded** `433f5a1a…` |
| No sub-$5 fixture | **PROD-107** `QA-SUBFIVE-001` (3.49 USD / 3.19 EUR) — **seeded** `28fb666d…` |
| `OOS_SKU` env/CSV mismatch | `.env.vcst`'s `OOS_SKU`/`PACK_SIZE_SKU`/`TIER_PRICED_SKU` all pointed at products that **do not exist** on the env; repointed to the live `QA-*` fixtures |
| Dead alias route | `slug`/`url` columns added, **derived** (not transcribed) from `productSlug()` and drift-guarded |
| OOS hidden by "Show in stock" | Mitigated via `@td(PROD_OOS.url)`. Ruled out as backend/settings; the default lives in vc-frontend and needs a browser to settle — **memory `feedback_show_in_stock_localstorage` deliberately NOT amended** pending that |

Gates: `npm test` **269/269**, `td:validate:standard` 0 problems / 0 warnings, `td:validate` clean (DV-013 + DV-021), `suites:lint` OK. Five new drift-guard checks [7]–[11] added, one negative-tested.

`td:reconcile` reports **8 hard problems — none of them ours**: ad-hoc `BIKE-*` configurable products (SKUs dated `20260724`/`20260725`) created directly on the env by another session, missing the `AGENT-TEST` prefix so teardown would orphan them, plus missing SEO. Not declared anywhere in `test-data/` or `scripts/seed-data/`. Left for their owner.

### Final finding counts

| Suite | Total | Critical | High | Medium |
|---|---|---|---|---|
| 028 | 49 | **0** | 19 | 29 |
| 029 | 50 | **0** | 25 | 24 |
| 030 | 17 | **0** | 6 | 10 |

50 High = **48 `REQ-001`** + 2 `D-005` on `[ACT] live-discover …` steps (single discovery actions with selection criteria — accepted as linter false positives, like the legitimate mid-flow `[ASSERT]` gates).

### Known-unresolved, pre-existing (not caused here)

- `036-bopis-store-selector.csv` — 17/22 `@td()` refs resolve; `BOPIS_BVA_50/51/100/101/151` aliases have never existed (absent at HEAD, suite CSV unchanged since `ddd101fe`). A store-count BVA ladder needs its own design intent + seeder + guard; not invented.
- `AGENT-TEST-Org-AcmeWest-20260310` seeded=true but not found live (reconcile warning).

## Next Steps

**Done in remediation:** ~~ID collisions~~ · ~~re-verify 091/096/098~~ · ~~triage the price-change cluster~~ · ~~route the test-data findings~~ · ~~dead PDP route~~

Remaining, for a human:

- [ ] **File `BUG-stale-cart-price-after-admin-price-change.md` to the tracker** (P1 price integrity) — drafted, deliberately not filed. Then `/qa-fix` it: the run report already routes it to XCart request-scoped caching, Sprint26-14's top-risk domain.
- [ ] Decide `REQ-001` policy — backfill real tickets for the 48 coverage-gap-sourced cases, or approve a `smoke-baseline` designation. This is the only thing standing between the suites and a clean sheet.
- [ ] `/qa-review-tests suite 029 --fix` on the 6 price-change cases — they need `@td()` fixtures and serialisation regardless of the product fix
- [ ] Confirm design intent on two nonexistent surfaces before anyone files them as bugs: the cart price-change **indicator** (CART-044) and the "Show in stock" default (memory left un-amended pending a browser check)
- [ ] Optional follow-ups: prove the checkout stock gate at qty 6 (CART-098's one unproven branch); pursue the variant-picker a11y gap (`radiogroup` with no `aria-checked`, selection conveyed by strikethrough only); seed a sub-cent-priced fixture to make CART-091's rounding-drift boundary genuinely reachable
- [ ] `/qa-regression 028,029,030` is now **unblocked** — traces will no longer overwrite each other
