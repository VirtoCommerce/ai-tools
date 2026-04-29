# Regression Run — 2026-04-29

## Executive Summary

| Field | Value |
|-------|-------|
| Run ID | `REG-2026-04-29-0929` |
| Selection | `050b1` (single suite) |
| Mode | Standard (GraphQL Runner Fast Path — browserless) |
| Started | 2026-04-29 07:29 UTC |
| Completed | 2026-04-29 07:36 UTC |
| Duration | ~7 min |
| Environment | QA |
| Seed | _(none)_ |
| Teardown | _(none)_ |

**Verdict:** ⚠️ **FAIL — 70.6% pass rate (3 FAIL + 2 BLOCKED)** → **0 platform bugs after triage** (all 3 failures collapse into 1 suite-data fixture defect — see [Triage Outcome](#triage-outcome) below)

| Suite | Total | Passed | Failed | Blocked | Skipped | Pass Rate |
|-------|------:|-------:|-------:|--------:|--------:|----------:|
| 050b1 GraphQL xCart Basic CRUD & Quantity | 17 | 12 | 3 | 2 | 0 | **70.6%** |
| **TOTAL** | **17** | **12** | **3** | **2** | **0** | **70.6%** |

> Note: manifest declares 16 cases for 050b1 — runner discovered 17 rows in the CSV. Manifest count is stale; not a defect.

## Build State

| Component | Version | Source |
|-----------|---------|--------|
| Platform | `3.1025.0-pr-2987-eb8e-vcst-4710-eb8e622b` | deploy-state-cache.json (2026-04-27) |
| Theme | `2.48.0-pr-2219-d1d4-d1d4b74c` | deploy-state-cache.json |
| **VirtoCommerce.XCart** | **3.1009.0** (stable) | deploy-state-cache.json |
| VirtoCommerce.Xapi | 3.1006.0 (stable) | deploy-state-cache.json |
| VirtoCommerce.XCatalog | 3.1004.0 (stable) | deploy-state-cache.json |

> Deploy state cache is 2 days old. XCart/Xapi modules are STABLE (not pre-release) — failures should be reproducible against current QA build.

## Suite-by-Suite Results

### Suite 050b1 — GraphQL xCart Basic CRUD & Quantity

- **Priority:** P1
- **Layer:** backend / api
- **Domain:** purchase-flow
- **Agent:** qa-backend-expert
- **Mode:** GraphQL Runner Fast Path (no browser)
- **Auth role:** ORG_USER
- **Lint:** ✅ exit 0, 17 rows scanned, 16 runner-native cases — balanced labels
- **Output:** `reports/regression/REG-2026-04-29-0929/suite-050b1-results.json`
- **Evidence:** `reports/regression/REG-2026-04-29-0929/graphql-evidence/` (18 files)

#### Failed cases (3)

| ID | Title | Failed Assertion | Severity |
|----|-------|------------------|----------|
| **GQL-006** | xCart — addItem Adds Product to Cart | `[COUNT label=add_one] expected data.addItem.itemsCount = 1, actual = 0` | Medium |
| **GQL-017** | xCart — Full Checkout Flow via GraphQL | `[ERRORS label=create_order] expected errors[] empty, actual ValidationError 'The cart has validation errors'` | High |
| **GQL-094** | xCart Pickup — cartPickupLocations Returns Confirmed Location (VCST-4707) | `[COUNT label=probe_all_locations] expected totalCount >= 1, actual = 0` | Medium |

#### Blocked cases (2)

| ID | Title | Reason |
|----|-------|--------|
| GQL-049 | updateCartQuantity Exceeds Available Stock | `[MANUAL-BLOCKED]` tag — awaiting low-stock product fixture seeding |
| GQL-050 | updateCartQuantity Non-Existent ProductId | CSV has 0 automatable assertions (only runner-manual `[EVIDENCE]`) — case needs `[ERRORS]`/`[DATA]` assertions added before it can produce a verdict |

#### Passed cases (12)

GQL-005, GQL-007, GQL-008, GQL-009, GQL-010, GQL-046, GQL-047, GQL-048, GQL-051, GQL-059, GQL-060, GQL-093

## Preliminary Bugs (`confirmed: false`)

> All bugs require qa-testing-expert investigation before escalation. Transient signals NOT auto-confirmed.

### BUG-050b1-001 — addItem mutation response cart projection empty
- **Case:** GQL-006
- **Severity:** Medium
- **Module:** VirtoCommerce.XCart 3.1009.0
- **Symptom:** `addItem` returns 200 OK with `errors[]` empty, but the response's `data.addItem` cart projection shows `itemsCount=0` and `items[]` empty/null. Subsequent `cart` query confirms the item *is* added — only the mutation's return projection is broken.
- **Likely scope:** API contract / serialization regression in xCart `addItem` mutation return type
- **Evidence:** `graphql-evidence/GQL-006-1777447958899.json`
- **Possible upstream cause for GQL-017** (see below)

### BUG-050b1-002 — createOrderFromCart "validation errors" after successful setup
- **Case:** GQL-017
- **Severity:** High
- **Module:** VirtoCommerce.XCart 3.1009.0
- **Symptom:** `addItem` + `addOrUpdateCartShipment` + `addOrUpdateCartPayment` all 200 OK. `createOrderFromCart` returns 200 OK with `errors[]` containing `ValidationError: "The cart has validation errors"`.
- **Cross-ref:** `order-creation-matrix.md` BL-ORD-001
- **Possible root cause:** GQL-006 leak — if `addItem` response is misleading and cart was never actually populated as the response suggests, the order would fail validation. qa-testing-expert should disambiguate by re-querying cart state between each mutation.
- **Evidence:** `graphql-evidence/GQL-017-1777447993699.json`

### BUG-050b1-003 — cartPickupLocations returns 0 for ORG_USER cart store (VCST-4707 regression OR fixture gap)
- **Case:** GQL-094
- **Severity:** Medium
- **Module:** VirtoCommerce.XCart 3.1009.0
- **Symptom:** `cartPickupLocations(...)` returns `totalCount=0` and empty `items[]` for the ORG_USER's cart store. VCST-4707 `IncludeLocationIds` assertions cannot be evaluated. Downstream `addOrUpdateCartShipment(type=pickup)` fails with VALIDATION.
- **Triage path:** verify pickup-location seed exists in QA store config (admin → Stores → pickup locations). If seeded → pickup-locations regression in xCart 3.1009.0. If empty → env fixture gap (re-seed required).
- **Evidence:** `graphql-evidence/GQL-094-1777448043728.json`

## Retry Log

_No retries — single suite, completed first attempt._

## Triage Outcome

**Triaged by:** qa-testing-expert (interactive) on 2026-04-29
**Triage report:** `reports/regression/REG-2026-04-29-0929/triage-report.md`
**Probes:** `reports/regression/REG-2026-04-29-0929/triage-probes/` (4 evidence JSON files)

### Verdict per bug

| Original Bug | Triage Verdict | Reclassification |
|---|---|---|
| BUG-050b1-001 (GQL-006 addItem) | ❌ **REFUTED** as API regression | Suite-data fixture defect + runner UX blind spot |
| BUG-050b1-002 (GQL-017 createOrder) | ❌ **REFUTED** | Pure downstream of -001 (cart was empty). Order CO260429-00001 created successfully during triage with a buyable line — flow is healthy |
| BUG-050b1-003 (GQL-094 pickup) | ❌ **REFUTED** | Pure downstream of -001. 102 pickup locations exist via non-cart query; `cartPickupLocations` correctly returns 0 for empty cart |

### Root cause (single defect, three symptoms)

`setup_prod` query in 8 cases (GQL-006, 017, 046–051, 094) selects parent product `8e0eaa82-a744-439c-ac44-7c519e7041f4` which has **min_qty=10**. The suite hardcodes `quantity: 1` or `quantity: 2` in `addItem`. Platform correctly rejects via `data.addItem.validationErrors[].errorCode = "PRODUCT_MIN_MAX_QTY"` ("You can order from 10 to 50 items"). However:

1. **Runner blind spot (D-2):** assertions check only GraphQL transport `errors[]` (correctly empty for domain validations) and `data.addItem.itemsCount=1` — they do NOT inspect `data.addItem.validationErrors`. The actionable signal is hidden.
2. **Why some downstream cases passed (GQL-007/008/046/047/051):** their `add_one` setup uses minimal projection `{id}` and the runner doesn't assert itemsCount on those steps. Subsequent `updateCartQuantity` (which works on `items: [{productId, quantity}]`) bypasses the addItem min_qty path and creates the line. So those cases "rescue" themselves and mask the root cause.

### Module assessment: VirtoCommerce.XCart 3.1009.0

✅ **Healthy.** No regressions detected. `addItem`, `createOrderFromCart`, `cartPickupLocations`, and pickup-location seeding all work correctly when given valid input.

## Recommended Next Actions

### Tickets to file (3 — all test-infra; **0 platform bugs**)

| # | Type | Title | Severity | Owner |
|---|------|-------|----------|-------|
| T1 | Test data | `[Suite 050b1] setup_prod query returns product with min_qty=10 — suite uses qty: 1/2 → addItem silently rejected` | Medium | test-management-specialist |
| T2 | Runner UX | `[GraphQL Runner] Surface data.<mutation>.validationErrors in failure evidence — currently only checks transport errors[]` | Medium | qa-backend-expert / dev-tools |
| T3 | xCart consistency note (informational) | `[xCart] updateCartQuantity bypasses PRODUCT_MIN_MAX_QTY validation that addItem enforces — document or align` | Low | qa-backend-expert |

### Suite CSV updates (queue for test-management-specialist)

8 cases (GQL-006, 017, 046, 047, 048, 049, 051, 094) need `setup_prod` change. Three options ranked best→worst:
- **Option A (preferred):** filter `setup_prod` to product with `min_qty=1`, OR resolve via `@td(BUYABLE_NO_MIN_QTY.id)` test-data alias (alias to be added to `test-data/aliases.json`)
- **Option B:** capture variation ID (`setup_prod.data.products.items.0.variations.0.id`) — variations don't carry parent's min_qty rule
- **Option C:** capture `minQuantity` field and use `quantity: {{MIN_QTY}}`

Also add new assertion to all `addItem`-using cases: `[DATA label=add_one] data.addItem.validationErrors is empty array` — catches future silent rejections for any reason.

### Pre-existing test-case issues (separate from root cause)

- **GQL-049** still BLOCKED (`[MANUAL-BLOCKED]`) awaiting low-stock fixture seeding
- **GQL-050** still BLOCKED — CSV has 0 automatable assertions; needs `[ERRORS]`/`[DATA]` assertions added

### Cleanup required

- **Order CO260429-00001** ($226.92, status=New) was created in QA during BUG-002 triage (proving createOrderFromCart works). Cancel via Admin or `/api/order/customerOrders/{id}` to keep QA order ledger clean.

### Manifest sync

- Update `config/test-suites.json` 050b1 `testCount` from 16 → 17 to match CSV reality.

## Artifacts

- Status tracker: `reports/regression/test-run-status.json`
- Per-suite results JSON: `reports/regression/REG-2026-04-29-0929/suite-050b1-results.json`
- GraphQL evidence: `reports/regression/REG-2026-04-29-0929/graphql-evidence/` (18 files)
- This report: `reports/regression/regression-2026-04-29.md`
