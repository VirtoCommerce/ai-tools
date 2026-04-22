# BOPIS Suites Quality Review
**Date:** 2026-04-22
**Reviewer:** test-management-specialist
**Scope:** Suites 036, 037, 038 — Frontend/bopis/
**Methodology:** 8-dimension quality analysis per `/qa-review-tests`

---

## Suite Overview

| Suite | File | Name | Tests | P0 Crit | P1 High | P2 Med | Automated | Manual | Generated |
|-------|------|------|-------|---------|---------|--------|-----------|--------|-----------|
| 036 | `036-bopis-store-selector.csv` | BOPIS Store Selector | 36 | 8 | 19 | 9 | 26 | 9 | 1 |
| 037 | `037-bopis-cart.csv` | BOPIS Cart | 44 | 8 | 25 | 11 | 0 | 44 | 0 |
| 038 | `038-bopis-checkout.csv` | BOPIS Checkout | 8 | 0 | 4 | 4 | 0 | 0 | 8 |
| **Total** | | | **88** | **16** | **48** | **24** | **26** | **53** | **9** |

**ID space:** BOPIS-001 through BOPIS-088 with no cross-suite duplicates. Gaps in sequence: BOPIS-034 (in 037, not 036), BOPIS-087 (in 036 out of numerical order — pagination edge case added late). BOPIS-036 and BOPIS-087 are both in suite 036 while sitting in the ID range that visually belongs to 037/038, which creates a non-obvious ID-to-suite mapping. No true ID collisions.

---

## 8-Dimension Analysis

### Dimension 1 — Structure (15-column CSV)

**Pass with minor notes.**

All three suites use the correct 15-column enriched CSV format: `ID, Title, Section, Priority, Business_Rule, Edge_Case_Refs, Preconditions, Test_Data, Steps, Assertions, Cross_Layer_Checks, Failure_Signals, Cleanup, References, Automation_Status`. All columns are populated in every row across all 88 tests — no blank required columns detected.

Step tags are used correctly per layer. Storefront UI tests use `[NAV]`, `[ACT]`, `[WAIT]`, `[ASSERT]`, `[SCROLL]`, `[KEY]`. The Suite 037 cases that include Admin verification use `[ADMIN]` tags correctly in Steps (e.g., BOPIS-037, BOPIS-044, BOPIS-072). Assertion tags (`[DOM]`, `[STATE]`, `[MATH]`, `[NAV]`, `[FORMAT]`) are correctly separated from Steps.

**Minor issue:** BOPIS-007 uses `[ASSERT]` inside the Steps column (`[ASSERT] search requests are debounced`) which is a mid-flow assertion that should remain in Steps per the template rules (mid-flow gates are acceptable as `[ASSERT]` in Steps). This is borderline — the final determinism assertion is correctly in Assertions. No change needed.

Section hierarchy paths are consistent and well-organized: `BOPIS > Map`, `BOPIS > Cart > Availability`, `BOPIS > Cart > Filters`, etc.

---

### Dimension 2 — Determinism

**Mixed — issues in Suites 036 and 037.**

Most cases are deterministic. Key concerns:

**Suite 036:**

- **BOPIS-022** (Map Width Bug Fix): The assertion `[ASSERT] map container dimensions unchanged` and `[MATH] map container width >= 40% of modal width` requires measuring a CSS/DOM property. The step `[ACT] measure map container dimensions` has no concrete mechanism defined — no selector, no `browser_evaluate`, no expected initial baseline value. An agent cannot reliably reproduce this check without explicit instrumentation. The assertion is technically sound (measuring a width ratio) but the measurement mechanism is ambiguous.
- **BOPIS-007** (Debounce/Performance): `[ASSERT] search requests are debounced (not one per keystroke)` is difficult to deterministically verify without explicit network call counting. The Cross_Layer_Check `[NETWORK] verify search API call count is <= number of debounce intervals` is correct but the Step mechanism for counting API calls is not specified.
- **BOPIS-009** (Filter - Distance): Requires geolocation. The precondition says "Geolocation available" but no step grants or mocks geolocation permission. Browser automation with geolocation requires explicit permission setup — this case is likely to be flaky if location permission is not pre-granted.
- **BOPIS-087** (Load-More/Pagination): Contains conditional logic: `[ACT] if load-more button present: click 'Load more'`. Conditional steps create non-deterministic execution paths. The step should be split into separate cases or the precondition should guarantee which pagination style is active.

**Suite 037:**

- **BOPIS-052** (Rapid Toggle): Rapid UI interaction timing depends on system performance. Acceptable for an agent-based test if the agent performs clicks sequentially without artificial delays.
- **BOPIS-054** (Quantity Revalidates Pickup): The precondition `branch stock is limited, e.g., 5 units` is fragile — this requires a specific product configured with known limited stock. If the environment's product stock changes, the test becomes undeterminable. Should reference a specific test fixture.

**Suite 038:**

- **BOPIS-081** (Post-Purchase Registration): The precondition is "Guest BOPIS order completed (see BOPIS-080)" — this creates a hard sequential dependency. An agent cannot run BOPIS-081 in isolation. This is a design choice but should be flagged in the References column as a dependency, not just a precondition reference.
- **BOPIS-086** (Multiple Items → Different Pickup Locations): The Failure_Signals include "Platform does not support per-item pickup (test becomes N/A)" — a test that may be N/A by design based on platform capability is non-deterministic in scope. The test should either confirm the platform supports per-item pickup assignment or be moved to a separate exploratory check.

---

### Dimension 3 — Completeness

**Suite 036: PASS.** All 36 tests have populated Steps, Assertions, Cross_Layer_Checks, Failure_Signals, and Cleanup.

**Suite 037: PASS with one note.** All 44 tests are fully populated. BOPIS-073 has only `[ACT] log in as org user` without explicit sign-in steps (email fill + password fill), which is incomplete (see Dimension 5 / BL-AUTH-007).

**Suite 038: PASS.** All 8 tests are fully populated. BOPIS-080 and BOPIS-081 have thorough steps for the guest checkout and post-purchase registration flows.

**Observation:** Suite 038 is notably thin (8 tests, no Critical cases). The checkout layer is the highest-risk layer for BOPIS (it is where orders are placed, payments are taken, and fulfillment is committed) yet it has zero P0 Critical cases. This is a coverage gap, not a completeness issue within each individual case.

---

### Dimension 4 — Testability

**Suite 036: PASS with notes.**

26 of 36 tests are marked `Automated` and use standard Playwright-executable steps. The 9 Manual cases (BOPIS-028 through BOPIS-036) are correctly marked Manual — they involve visual inspection of the product page BOPIS widget, `noIndicator` prop verification, and tooltip behavior, which are legitimately hard to automate reliably.

Concerns:
- BOPIS-007 (Debounce): Requires accessing the Network tab to count API calls. The test-runner-agent can use `browser_network_requests` to verify this, but the Step does not specify this tool call.
- BOPIS-009 (Distance Filter): Geolocation dependency. Playwright MCP requires `--allow-any-origin` or explicit geolocation permission configuration. Not documented in Preconditions.
- BOPIS-022 (Map Width): The `browser_evaluate` call needed to measure CSS width is not written into Steps. An agent would need to improvise this, which is a testability gap.
- BOPIS-087 (Pagination): Requires 10+ pickup locations in the environment. Preconditions state this, but no test data alias points to a seeded state with 10+ locations.

**Suite 037: PASS.**

All 44 tests are executable by a Playwright-based agent. Admin verification cases (BOPIS-037, BOPIS-044, BOPIS-072) correctly start with `[ADMIN]` steps using `admin={{ADMIN_URL}}` in Test_Data. The cross-layer cases (BOPIS-075, BOPIS-076) require DevTools network inspection — appropriately using `[NETWORK]` tags.

**Suite 038: CONDITIONAL PASS.**

All 8 tests have clear step sequences. However, all 8 are marked `Generated` — none has been validated against the live QA environment. Before these tests can be executed in a regression run, they need:
- BOPIS-080/081: Confirmation that guest checkout is enabled (`createAnonymousOrderEnabled = true`) on QA.
- BOPIS-086: Confirmation that per-item pickup location assignment is supported by the platform.
- BOPIS-081: Confirmation that post-purchase registration flow exists on the storefront (check `/account/orders` accessibility immediately after guest checkout).

---

### Dimension 5 — Data Validity

**Suite 036: PASS with one hardcoded issue.**

- **BOPIS-022**: Steps contain `[ACT] type 'Westent foxpost' in search field`. The string `'Westent foxpost'` is a hardcoded location name. This is a specific location name from a real or test environment. If this location does not exist in the QA environment, the test will always show a no-results state regardless of bug status. This should be replaced with `{{BOPIS_NO_RESULTS_QUERY}}` (a configurable nonsense search term) or use a dynamic alias. Severity: **P1** — this is the sole purpose of this bug-fix regression test.

All other Suite 036 cases use `{{FRONT_URL}}`, `{{TEST_SKU}}`, `{{USER_EMAIL}}`, `{{USER_PASSWORD}}` correctly. One test (BOPIS-087) exists in the test data registry as `Generated` with no @td() alias for location count — it relies on environment having 10+ locations which is an unchecked assumption.

**Suite 037: PASS with multiple hardcoded issues.**

The following cases contain hardcoded geographic values in Steps or Assertions:

| Case | Hardcoded Value | Field | Issue |
|------|----------------|-------|-------|
| BOPIS-058 | `NY` (State), `New York` | Steps | Hardcoded state/city |
| BOPIS-059 | `New York` (city) | Steps + Assertions | Hardcoded city name |
| BOPIS-062 | `34th St` | Steps | Hardcoded street name |
| BOPIS-063 | `St. Patrick's`, `5th Ave & 50th` | Steps | Hardcoded search terms |
| BOPIS-065 | `New York`, `Building` | Steps + Assertions | Hardcoded city + search term |
| BOPIS-069 | `Building` | Steps | Hardcoded search term |
| BOPIS-071 | `Building` | Steps | Hardcoded search term |

The `@td()` resolver is correctly used in **BOPIS-061** with `@td(ADDR_NY.zip)`, which resolves to the `ADDR_NY` alias (confirmed in `test-data/aliases.json`). However, the sibling cases BOPIS-058, 059, 062, 065, 069, 071 that test the same filter/search functionality use raw hardcoded values instead of `@td()` aliases. These should use `@td(ADDR_NY.state)`, `@td(ADDR_NY.city)`, `@td(ADDR_NY.street)` etc. to stay consistent with the resolver pattern.

**BOPIS-073**: `[ACT] log in as org user` is a vague step. The Test_Data supplies `email={{ORG_USER_EMAIL}};password={{ORG_USER_PASSWORD}}` which is correct, but the Steps do not include explicit `[NAV]` to `/sign-in`, `[ACT] fill 'Email': {{ORG_USER_EMAIL}}`, `[ACT] fill 'Password': {{ORG_USER_PASSWORD}}`, `[ACT] click 'Sign In'` steps. This violates the executability requirement — the agent cannot infer what "log in as org user" means without explicit steps.

**Suite 038: CONDITIONAL PASS — undefined variables.**

| Case | Undefined Variable | Present in `.env` template? | Present in `aliases.json`? |
|------|-------------------|-----------------------------|---------------------------|
| BOPIS-080 | `{{GUEST_EMAIL}}` | No | No |
| BOPIS-081 | `{{GUEST_EMAIL}}` | No | No |
| BOPIS-084 | `{{COUPON_CODE_PRODUCT}}` | Not in template (33-var list) | No |
| BOPIS-085 | `{{COUPON_CODE_FREE_SHIP}}` | Not in template (33-var list) | No |
| BOPIS-086 | `{{TEST_SKU_2}}` | Not in template | No |

`COUPON_FREESHIP` alias exists in `aliases.json` (resolves to COU-020) — BOPIS-085 should use `@td(COUPON_FREESHIP.code)` instead of `{{COUPON_CODE_FREE_SHIP}}`. Similarly, `COUPON_10PCT` or `COUPON_20PCT` aliases exist for product coupons — BOPIS-084 should reference one of these. `TEST_SKU_2` should use a second product alias (e.g., `@td(PROD_LAPTOP.sku)` alongside `@td(PROD_HEADPHONES.sku)`). `GUEST_EMAIL` does not have an alias or env var — needs either a new alias or to use a `{{USER_EMAIL}}`-based approach with a fresh unregistered email address pattern.

---

### Dimension 6 — Business Logic / Edge Case Coverage

**BL-BOPIS-* References:** All three suites reference `BL-BOPIS-001` through `BL-BOPIS-007`. These IDs do not exist in `business-logic.md` — the file contains `BL-SHIP-002` as the canonical BOPIS invariant, plus `BL-CART-*`, `BL-CHK-*`, and `BL-CROSS-*` invariants that apply to BOPIS flows. The `BL-BOPIS-*` IDs appear to be suite-internal references to a BOPIS-specific invariant set that was never formally added to `business-logic.md`.

**Impact:** An agent executing these tests will not be able to resolve `BL-BOPIS-001` through `BL-BOPIS-007` against any known invariant, making the Business_Rule column non-functional as a classification aid. This is a documentation gap, not a test quality issue per se, but it reduces the value of the column significantly.

**Mapped coverage against `business-logic.md` invariants:**

| Invariant | Covered? | Where |
|-----------|---------|-------|
| BL-SHIP-002: BOPIS requires store pickup location | Partial | BOPIS-043 (no locations), BOPIS-026 (flow), BOPIS-074 (billing addr required) |
| BL-CART-001: Max quantity / stock enforcement | Yes | BOPIS-054, BOPIS-055 |
| BL-CART-002: Out-of-stock mid-session | Partial | BOPIS-054 (branch stock) |
| BL-CART-007: Same SKU aggregates quantity | Yes | BOPIS-056 |
| BL-CHK-001: Guest checkout enabled flag | Partial | BOPIS-080 assumes guest checkout is on; no test for when it is OFF |
| BL-CHK-005: Shipping method depends on address | Partial | BOPIS-053 (ship-to change) |
| BL-CHK-006: Order total formula | Not covered in 038 | BOPIS-049 (cart total) covers subtotals in cart, but no checkout-stage total verification test |
| BL-PRICE-002: Tax calculated after discounts | Yes | BOPIS-049 |
| BL-PRICE-003: Price rounding | Not covered | No test verifies 2-decimal display in BOPIS context |
| BL-B2B-001: Org switching isolates cart | Yes | BOPIS-073 |
| BL-CROSS-005: Order side effects (inventory, email, GA4) | Not covered | No test verifies post-order side effects for BOPIS |
| BL-CROSS-006: Feature flag toggle → immediate effect | Partial | BOPIS-037 (BOPIS module OFF) |
| BL-ORD-007: Shipment state machine | Not covered | No test verifies BOPIS order shipment state transitions in admin |

**Missing critical BL coverage:**

1. **BL-CHK-006** (order total formula) — No checkout-stage test verifies `subtotal + tax - discount = grand total` for a BOPIS order. BOPIS-049 covers the cart stage only.
2. **BL-CROSS-005** (order side effects) — No test verifies that placing a BOPIS order decrements inventory, sends a confirmation email, or fires GA4 events.
3. **BL-ORD-007** (shipment state machine) — No test in any BOPIS suite verifies that a BOPIS order's shipment status transitions correctly through `New → Pick & Pack → Ready to Send → Send` in admin after pickup.
4. **BL-CHK-001** (guest checkout flag OFF) — BOPIS-080 tests guest checkout happy path but there is no negative test for when `createAnonymousOrderEnabled = false` blocks a guest from BOPIS checkout.
5. **Pickup notification** — No test covers the customer receiving a "Ready for pickup" notification when the order is ready. BL-NOTIF-001 applies here.

**ECL references** are consistently applied. ECL-14.1 (BOPIS-specific) and ECL-14.2 (BOPIS availability) appear throughout. ECL-7.1 (feature flag / toggle edge cases) is used appropriately in switch tests. ECL-14.4 (mixed cart scenarios) is referenced in BOPIS-045, 046, 065. No ECL-* IDs exist in the library for section 14 (confirmed — the library covers sections 1–13 generically, with sections 14+ being VC-specific additions). The ECL-14.* references are project-internal extensions.

---

### Dimension 7 — Duplication

**Across suites: Partial overlap found between Suite 036 and Suite 037.**

**Genuine cross-suite overlap (semantic):**

- **BOPIS-027** (Suite 036, "Integration - Switch Delivery Methods") vs **BOPIS-050** (Suite 037, "Switch Delivery to Pickup: Shipping Cleared") and **BOPIS-051** ("Switch Pickup to Delivery: Location Cleared"): These cover essentially the same switching behavior. BOPIS-027 is an integration test in 036 that also tests the switch; BOPIS-050/051 in 037 test the same switching assertions in more detail. BOPIS-027 is the higher-level integration wrapper; 050/051 are the decomposed unit tests. The overlap is intentional and acceptable, but BOPIS-027 assertions are partially redundant with 050/051.
- **BOPIS-016** (Suite 036, "Pickup Location Card - Confirm") and **BOPIS-026** (Suite 036, "Integration - Cart to Checkout") both assert that confirming a location closes the modal and shows the location in cart. This is within-suite overlap — the scenario is legitimately tested at two levels (component level and integration level), which is acceptable.
- **BOPIS-008/009/010** (Suite 036, Availability/Distance/Combined Filters) vs **BOPIS-057–071** (Suite 037, Facet Filter series): These appear to overlap significantly. Suite 036's filter cases use the generic modal context; Suite 037's facet filter cases use the cart-context modal. However, on inspection they cover different filter dimensions: 036 covers availability + distance (store-level filters), while 037 covers Country/State/City geographic facets plus search. This is NOT a true duplication — they test different filter axes on the same UI. The `Section` path difference (`BOPIS > Filters` vs `BOPIS > Cart > Filters`) is justified.

**Within-suite duplication:**

- **Suite 037:** BOPIS-019 and BOPIS-020 (City/State filter, in 036) vs BOPIS-059 and BOPIS-058 (City/State facets, in 037) — these look similar in goal but are in different suites, and 037's versions are more detailed with multi-level filter combinations. No true duplication.
- **Suite 036:** BOPIS-008 ("Filter - Availability") and the availability chip tests BOPIS-038–042 in Suite 037 test the same availability labels. 036's BOPIS-008 tests only that the filter UI updates the list; 037's cases test the actual label values (Today, Transfer, Global Transfer, Not Available). No true duplication.

**Overall duplication verdict:** No duplicates requiring deletion. One redundancy to note (BOPIS-027 partially overlaps 050/051) — acceptable as-is.

---

### Dimension 8 — Environment Verification

**Suite 036: PASS with caveats.**

All tests navigate to `{{FRONT_URL}}/cart` or `{{FRONT_URL}}/[product-page]` — valid sitemap paths. The `/cart` URL is confirmed in `sitemap.md` as the combined cart/checkout page. No invalid storefront paths detected.

The `Automation_Status = Automated` on 26 cases implies these have been or will be run in the QA environment. The 9 Manual + 1 Generated cases require human validation or agent execution.

**Suite 037: PASS.**

All 44 tests use `{{FRONT_URL}}/cart` as the primary nav target. Admin URLs use `{{ADMIN_URL}}` correctly. `{{ORG_USER_EMAIL}}` / `{{ORG_USER_PASSWORD}}` are in the documented env var template (as `ORG_USER_EMAIL` / `ORG_USER_PASSWORD`).

**Suite 038: BLOCKED pending environment confirmation.**

- Guest checkout availability on QA must be confirmed before running BOPIS-080/081.
- Per-item pickup location assignment (BOPIS-086) is flagged as potentially N/A.
- All 8 tests are `Generated` with no execution history — none has been validated in the live environment.

---

## Critical Issues by Suite

### Suite 036 — Critical Issues

| Priority | ID | Issue | Dimension |
|----------|-----|-------|-----------|
| P1 | BOPIS-022 | `'Westent foxpost'` is hardcoded — will always trigger no-results state if this exact location name is not seeded in QA. Should use `{{BOPIS_NO_RESULTS_QUERY}}` or a clearly nonsense string like `'xyzabc123'` (as used in BOPIS-006). | Data |
| P1 | BOPIS-022 | Map width measurement step has no concrete instrumentation (no selector, no `browser_evaluate` call specified). Agent cannot reproduce this deterministically. | Determinism |
| P2 | BOPIS-087 | ID is BOPIS-087, placed in suite 036 (IDs 001–036 range). This is an out-of-sequence numbering that will confuse traceability. | Structure |
| P2 | BOPIS-009 | Geolocation dependency not documented as a browser config requirement. Playwright MCP requires explicit geolocation permission grant. | Testability |
| P2 | BOPIS-007 | No `browser_network_requests` call specified for counting debounced API calls. Agent cannot verify debounce without this mechanism. | Testability |
| P2 | BOPIS-087 | `[ACT] if load-more button present:` is a conditional step — splits execution path non-deterministically. | Determinism |

### Suite 037 — Critical Issues

| Priority | ID | Issue | Dimension |
|----------|-----|-------|-----------|
| P1 | BOPIS-058–059, 062–063, 065, 069, 071 | Hardcoded geographic values: `NY`, `New York`, `34th St`, `St. Patrick's`, `5th Ave & 50th`, `Building`. These are environment-fragile. Should use `@td(ADDR_NY.state)`, `@td(ADDR_NY.city)`, `@td(ADDR_NY.street)`, or configurable env vars. | Data |
| P1 | BOPIS-073 | `[ACT] log in as org user` is not executable — missing `[NAV]` to `/sign-in`, `[ACT] fill 'Email'`, `[ACT] fill 'Password'`, `[ACT] click 'Sign In'` steps. Violates BL-AUTH-007 execution requirement. | Completeness + Data |
| P2 | All 44 | `Automation_Status = Manual` on all 44 cases in this suite. Given the systematic filter/search coverage (BOPIS-057–079), many of these are automatable. The Manual designation may be correct for this sprint but should be reviewed. | Structure |
| P2 | BOPIS-054 | `branch stock is limited, e.g., 5 units` — no test data alias for a BOPIS-eligible product with known limited branch stock. Requires environment-specific setup not captured in aliases.json. | Data |

### Suite 038 — Critical Issues

| Priority | ID | Issue | Dimension |
|----------|-----|-------|-----------|
| P0 | Entire suite | Zero Critical-priority tests in the checkout suite. The BOPIS checkout (where orders are placed and committed) has no P0 coverage. BL-CHK-006 (order total formula), BL-SHIP-002 (BOPIS skips shipping address), and BL-CROSS-005 (order side effects) are unverified at the checkout layer. | BL Coverage |
| P0 | Entire suite | All 8 tests are `Generated` — none has been validated in QA environment. Running unvalidated generated tests in regression carries risk of false failures. | Testability |
| P1 | BOPIS-080, 081 | `{{GUEST_EMAIL}}` is not defined in the `.env` template (33-var list) or `aliases.json`. Tests will fail at substitution. | Data |
| P1 | BOPIS-084 | `{{COUPON_CODE_PRODUCT}}` is undefined. Should use `@td(COUPON_10PCT.code)` or `@td(COUPON_20PCT.code)` (both exist in aliases.json). | Data |
| P1 | BOPIS-085 | `{{COUPON_CODE_FREE_SHIP}}` is undefined. Should use `@td(COUPON_FREESHIP.code)` (alias `COUPON_FREESHIP` exists in aliases.json for COU-020). | Data |
| P1 | BOPIS-086 | `{{TEST_SKU_2}}` is undefined. Should use a second product alias (e.g., `@td(PROD_LAPTOP.sku)`). | Data |
| P1 | BOPIS-081 | Hard sequential dependency on BOPIS-080 completion — cannot execute in isolation. Dependency must be explicit in References or Preconditions with `[DEPENDS ON BOPIS-080]`. | Determinism |
| P2 | BOPIS-086 | Contains a built-in N/A escape hatch (`Platform does not support per-item pickup → test becomes N/A`). A test that may be structurally N/A should be flagged for platform capability verification before inclusion in regression. | Testability |

---

## Prioritized Fix List

### P0 — Block regression run

| ID | Fix Required |
|----|-------------|
| Suite 038 (all 8) | Validate all generated cases in live QA environment before adding to regression |
| BOPIS-080, 081 | Define `{{GUEST_EMAIL}}` — add to `.env` template or replace with `@td` alias for a fresh test email |
| BOPIS-084 | Replace `{{COUPON_CODE_PRODUCT}}` with `@td(COUPON_10PCT.code)` |
| BOPIS-085 | Replace `{{COUPON_CODE_FREE_SHIP}}` with `@td(COUPON_FREESHIP.code)` |
| BOPIS-086 | Replace `{{TEST_SKU_2}}` with `@td(PROD_LAPTOP.sku)` or another seeded product alias |
| Suite 038 (gap) | Add at least one Critical-priority E2E case covering: BOPIS checkout order total formula (BL-CHK-006) + confirmation page shows pickup details + no shipping address form shown |

### P1 — Fix before next sprint release

| ID | Fix Required |
|----|-------------|
| BOPIS-022 | Replace `'Westent foxpost'` with `{{BOPIS_NO_RESULTS_QUERY}}` env var (or reuse `'xyzabc123'` pattern from BOPIS-006) |
| BOPIS-022 | Add explicit `browser_evaluate` step to measure map container width (specify CSS selector for map element) |
| BOPIS-073 | Expand `[ACT] log in as org user` into full sign-in step sequence: `[NAV] {{FRONT_URL}}/sign-in`, `[ACT] fill 'Email': {{ORG_USER_EMAIL}}`, `[ACT] fill 'Password': {{ORG_USER_PASSWORD}}`, `[ACT] click 'Sign In'`, `[WAIT] authenticated state` |
| BOPIS-058 | Replace `NY` / `New York` with `@td(ADDR_NY.state)` / `@td(ADDR_NY.city)` |
| BOPIS-059 | Replace `New York` with `@td(ADDR_NY.city)` in Steps and Assertions |
| BOPIS-062 | Replace `34th St` with `@td(ADDR_NY.street)` or a street from an existing address alias |
| BOPIS-063 | Replace `St. Patrick's` and `5th Ave & 50th` with `{{BOPIS_SPECIAL_CHAR_QUERY_1}}` / `{{BOPIS_SPECIAL_CHAR_QUERY_2}}` env vars |
| BOPIS-065 | Replace `New York City` with `@td(ADDR_NY.city)` and `Building` with `{{BOPIS_PARTIAL_NAME_QUERY}}` |
| BOPIS-069, 071 | Replace `Building` with `{{BOPIS_PARTIAL_NAME_QUERY}}` |
| BOPIS-081 | Add `[DEPENDS ON BOPIS-080]` to Preconditions; mark clearly in References that this test requires BOPIS-080 to run first in the same session |
| BL coverage | Add one new case to Suite 038 covering: BOPIS order placement triggers inventory decrement (BL-CROSS-005) |
| BL coverage | Add one new case to Suite 038 (or cross-reference from Suite 037) covering: shipment state transitions for BOPIS order in Admin (BL-ORD-007) |
| BL-BOPIS-* | Document `BL-BOPIS-001` through `BL-BOPIS-007` formally in `business-logic.md` or replace references with existing canonical IDs (`BL-SHIP-002`, `BL-CART-001`, etc.) |

### P2 — Quality improvement, next maintenance cycle

| ID | Fix Required |
|----|-------------|
| BOPIS-087 | Move to suite 037 (ID number is within cart suite's range) or renumber to BOPIS-036b; explain out-of-sequence placement |
| BOPIS-087 | Split conditional step (`if load-more button present`) into two separate test cases: one for load-more pagination, one for infinite scroll |
| BOPIS-009 | Add explicit geolocation permission step to Preconditions: "Browser geolocation permission pre-granted in Playwright config" |
| BOPIS-007 | Add `[NETWORK] browser_network_requests: count XHR/fetch calls to search endpoint` as explicit step mechanism |
| BOPIS-054 | Reference a specific test fixture alias for a BOPIS product with known limited branch stock (requires new alias entry) |
| BOPIS-086 | Add a step to verify platform supports per-item pickup before proceeding, or add a Precondition with admin config check |
| Suite 038 | After live validation, update `Automation_Status` from `Generated` to `Automated` or `Manual` as appropriate |
| All suites | Add coverage for: pickup notification email to customer when order is ready for pickup (BL-NOTIF-001) |
| Suite 038 | Add coverage for: guest checkout with BOPIS disabled (BL-CHK-001 negative case) |

---

## Cross-Suite Observations

**Coverage distribution imbalance:** The three suites are severely imbalanced: 036 (36 tests) and 037 (44 tests) have strong coverage of the store selector UI and cart-level BOPIS logic, while 038 (8 tests) has thin checkout coverage. The checkout suite should have at least 15–20 cases to cover the critical fulfillment path adequately. This is the most significant gap across the set.

**BL-BOPIS-* reference problem spans all three suites.** All 88 tests reference invariants (`BL-BOPIS-001` through `BL-BOPIS-007`) that do not exist in the canonical `business-logic.md`. This means the `Business_Rule` column is using project-internal notation not aligned with the shared knowledge base. Resolution requires either: (a) add formal `BL-BOPIS-*` invariants to `business-logic.md`, or (b) remap all Business_Rule references to existing canonical IDs.

**Search/filter cases in Suite 037 are the richest cluster.** BOPIS-057 through BOPIS-079 (23 cases) cover the PickPoints modal filter system in excellent depth — Country, State, City, multi-select, breadcrumb removal, reset, AND logic, no-results states. This is the strongest part of the test set and needs the least attention.

**Availability label tests (BOPIS-038–042) are well-designed.** The FFC-matching logic (Today / Transfer / Global Transfer / Not Available) is clearly mapped to specific data configurations. These cases correctly reference admin-configurable `TransferDurationText` without hardcoding the duration text.

**No test across all three suites covers:**
1. Pickup notification to the customer when order status changes to "Ready for pickup"
2. BOPIS order behavior when all stores are closed (after-hours)
3. Store-level capacity limits (if a pickup location reaches a pickup queue limit)
4. Session expiry while in the BOPIS modal (BL-AUTH-001 in BOPIS context)
5. BOPIS with a configurable product (BL-CAT-006)

---

## Overall Verdict

| Suite | Verdict | Blocking Issues | Rationale |
|-------|---------|----------------|-----------|
| **036** Store Selector | **NEEDS-FIX** | BOPIS-022 hardcoded data + map measurement mechanism | Core cases are solid; 2 P1 data issues + testability gap on the bug-fix regression case |
| **037** BOPIS Cart | **NEEDS-FIX** | BOPIS-073 incomplete steps; 8 cases with hardcoded geographic values | High volume of well-written cases; data validity issues across geographic filter tests drag score down |
| **038** BOPIS Checkout | **NEEDS-FIX** | Zero P0 cases; 4 undefined variables; all 8 unvalidated | Checkout suite is the highest-risk layer and has the weakest coverage. Must not run in regression until P0 issues are resolved |

**Overall set:** NEEDS-FIX. The store selector and cart suites are structurally sound and can run with targeted fixes to data issues. The checkout suite requires more significant attention before it contributes to regression confidence.

---

*Review conducted by test-management-specialist on 2026-04-22. Source files:*
- `regression/suites/Frontend/bopis/036-bopis-store-selector.csv`
- `regression/suites/Frontend/bopis/037-bopis-cart.csv`
- `regression/suites/Frontend/bopis/038-bopis-checkout.csv`
