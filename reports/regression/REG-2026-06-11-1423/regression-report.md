# Regression Report — REG-2026-06-11-1423

**Selection:** `cart` + `050b5` · **Env:** vcst-qa · **Build:** Platform `3.1035.0`, XCart `3.1019.0-pr-124-89a6`, Theme `2.51.0-pr-2310` · **Date:** 2026-06-11
**Browsers:** chrome (028, A-retry, D/C-OOS), edge (029, 030-fallback, B, E), firefox (030-initial) · GraphQL runner (050b5)

## Summary (initial run)

| Suite | Pass | Fail | Blocked | Total |
|---|---|---|---|---|
| 050b5 GraphQL xCart Validation | 11 | 0 | 0 | 11 |
| 028 Cart Core | 37 | 2 | 8 | 47 |
| 029 Cart Validation & Persistence | 12 | 1 | 19 | 32 |
| 030 Cart Merge (firefox→edge fallback) | 10 | 3 | 4 | 17 |
| **Total** | **70** | **6** | **31** | **107** |

**Initial pass rate among runnable (excl. blocked): 70/76 = 92%.** No backend 5xx/exceptions in-window (App Insights verified). **Quality gate: PASS with findings.** The 31 BLOCKED were then driven to root cause (see Recovery Addendum) — **17 recovered to PASS**.

## Failures (initial 6) — triage shortlist

| TC | Suite | Sev | Finding | Disposition |
|---|---|---|---|---|
| CART-071 + CART-073 | 030 | Med | **Config summary label mismatch** — line header shows wrong color; data layer correct. 2× confirmed. | NEW — file (display-only) |
| CART-072 | 030 | Med | **Configurable configs NOT consolidated on merge** — split lines; total correct. | Verify by-design |
| CART-036 | 028 | Med | **Invalid-qty client validation gap** — server rejects (no 5xx); UI shows generic toast not inline. | File (client UX) |
| CART-047 | 029 | Low/Med | over-stock subtotal uses entered qty; "Something went wrong" summary error. | (a) verify design; (b) see cluster |
| CART-073 | 028 | Low | Apollo "Missing field currencyCode" — **known (VCST-5238)**, Draft-RED. | no new action |

### 🔴 Cross-suite — "Something went wrong" order-summary error (client-side)
Reproduced in 3 states: CART-047 (over-stock), CART-051 (EUR 100%-off promo→€0), CART-059 (EUR merge). **App Insights: no backend 5xx**; storefront logs 5 ApolloErrors matching the **VCST-5238 `currencyCode` cache-write cluster**. Likely the same client error-handling path.

## App Insights (run window ~120m, both layers)
- **Backend (vcst-qa):** 0 × 5xx, 0 exceptions. Only benign 404s (FileUpload probes + static assets). Telemetry verified (591 req/30m).
- **Storefront:** 5 × ApolloError (`currencyCode` cluster, VCST-5238) — no new signatures.
- No suite reported PASS while a backend error fired.

## Notes / follow-ups (not bugs)
- **Firefox stability quirk severe this session** — beyond `/cart` to header logout, login submit, configurable-PDP widget (blocked 15/17 on initial 030; all recovered on Edge). Broader than `feedback_firefox_cart_dropdown_quirk` documents.
- **Test-data drift — `CFG_HAT` URL fixed** (`configurable-caps-shirts`→`configurable-products/configurable-hat`, confirmed live). 6 sibling `CFG_*` rows still stale — flagged for test-data sync.
- `TEST_SKU=XKC-38084072` 404s on `/product/{sku}` — refresh the env var.

---

## BLOCKED-case Recovery Addendum (root-cause + re-run)

Per "BLOCKED is not terminal," all 31 originally-blocked cases were root-caused and driven to resolution. **17 recovered to PASS** (+1 PASS-with-caveat), 1 real defect surfaced, the rest are env-design/infra-gated (not per-case).

| Group | Cases | Result | Root cause / fix |
|---|---|---|---|
| A price-recalc | CART-024/028/043/076 | ✅ 4 PASS | ran serially (parallel-skip no longer applied) |
| A-retry (fresh cart) | CART-020/023/025/027/045/081 | ✅ 6 PASS | `removeCart` of 5 dup carts + re-login cleared the Apollo phantom |
| A-retry caveat | CART-029 | ◑ caveat | lazy-reprice: decrease stale on passive reload, correct after any write (not financial) |
| A-retry fail | CART-044 | 🐛 FAIL | no price-change indicator even after price corrects (UX) |
| A-retry blocked | CART-030 | ⛔ promo | can't isolate the auto-promo among 49 active to remove safely |
| E re-routed | CART-021/004 | ✅ 2 PASS | cross-device via logout/login persistence; variation via live-discovered parent |
| D store-toggle | CART-068/069/070 | ✅ 3 PASS | set "Default selected = OFF" + restore to ON (verified) |
| C-OOS | CART-046/082 | ✅ 2 PASS | admin stock→0 + restore to 49 (verified) |
| B coupons | CART-014/042/058/059/061/062/065 | ⛔ env-design | store-wide exclusive AUTOMATIC promo seals every cart; no promo-neutral product; even user's own preset coupons rejected. Needs a dedicated coupon store / promo-excluded product — not a safe runtime toggle (conflicts with exclusivity suites). |
| Infra-gated | CART-065/066/057 | ⛔ infra | no readable test mailbox (email-verify) + mock-only 500 injection |

### New findings surfaced during recovery (file candidates)
1. **B2B multi-cart write/read desync (High, backend xCart):** a user accrues multiple "default" carts; reads/writes resolve to different rows; cart-page load auto-appends an orphan shipment+payment each visit (runaway). Mechanism behind the original "broken cart". Reproducible.
2. **Lazy-reprice on decrease (Low/Med UX):** cart line reprices on write, not on passive read after an external price change. Not financial.
3. **CART-044 missing price-change indicator (Low/Med UX).**

### Environment-design recommendations (not per-case fixes)
- **Coupon store/fixture:** a store (or promo-excluded product) free of auto/exclusive promos so coupon happy-paths (8 cases) test without disturbing the exclusivity suites.
- **Test mailbox:** a readable inbox so email-verify + fresh-user flows (CART-065/057) run.
- **Fixtures:** `PROD_VARIATION_PARENT_SALE`/STD-002 has only one USD-priced color; 6 `CFG_*` rows still carry the stale `/configurable-caps-shirts/` URL segment.

## Artifacts
- Per-suite JSON: `028/029/030/030-edge-results.json`, `029-groupA-results.json`, `029-groupA-retry-results.json`, `coupon-groupBC-results.json`, `groupE-results.json`, `groupD-COOS-results.json`
- Screenshots: `screenshots/` + `test-results/{edge,chrome}/` · 050b5 evidence: `reports/regression/graphql-evidence/CVAL-GQL-*.json`
