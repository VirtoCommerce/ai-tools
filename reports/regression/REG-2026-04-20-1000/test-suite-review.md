# Test Suite Review — REG-2026-04-20-1000
**Review Date:** 2026-04-21
**Reviewer:** test-management-specialist
**Scope:** Cart suites 028, 029, 030 | Checkout suites 011, 012, 013
**Auth suites 031, 032, 033:** Reference-only — no edits required

---

## Summary Counts Per Verdict Per Suite

| Suite | REWRITE | SEED | ADMIN-DESTRUCTIVE | TOOL-LIMITATION | SPEC-GAP | FEATURE-GAP | DUP | Total Touched |
|-------|---------|------|-------------------|-----------------|----------|-------------|-----|---------------|
| 028 — cart-core | 2 | 4 | 0 | 0 | 0 | 1 | 0 | 7 |
| 029 — cart-validation-persistence | 3 | 4 | 13 | 1 | 0 | 0 | 2 | 23 |
| 030 — cart-merge | 2 | 4 | 0 | 1 | 0 | 0 | 0 | 7 |
| 011 — checkout-flow | 4 | 6 | 2 | 1 | 1 | 0 | 2 | 16 |
| 012 — checkout-guest | 3 | 1 | 0 | 0 | 0 | 2 | 0 | 6 |
| 013 — checkout-b2b | 2 | 4 | 0 | 0 | 1 | 1 | 0 | 8 |
| **TOTAL** | **16** | **23** | **16** | **3** | **2** | **4** | **2** | **67** |

---

## Pattern 1 — Test Data (SEED)

Missing fixtures blocking test execution. Env vars must be added to `.env` and provisioned in QA before running.

### CART-037 (028)
**Verdict:** SEED
**Fixture:** `{{LOW_STOCK_SKU}}` — product with stock ≤ 10 in B2B virtual catalog
**Impact:** Low-stock warning badge/message cannot be verified

### CART-052, CART-053 (028)
**Verdict:** SEED
**Fixture:** `{{MULTI_ORG_USER_EMAIL}}` + `{{MULTI_ORG_USER_PASSWORD}}` — user who is member of 2+ B2B orgs simultaneously
**Impact:** Org-selector UI in cart (multi-org context) cannot be tested

### CART-054, CART-055 (028)
**Verdict:** SEED
**Fixture:** `{{PACK_SIZE_SKU}}` — product with MOQ=6 (pack size)
**Impact:** Pack-size / minimum-order-quantity validation cannot be tested

### CART-014, CART-042 (029)
**Verdict:** SEED
**Fixture:** `{{VALID_COUPON_CODE}}` — active coupon applicable to all users, usage limit ≥ 100
**Impact:** Coupon apply/persist scenarios blocked in cart validation suite

### CART-046, CART-082 (029)
**Verdict:** REWRITE + SEED (rewrites replaced admin-destructive approach with permanent fixture)
**Fixture:** `{{OOS_SKU}}` — permanent OOS product (inventory = 0, never restocked)
**Impact:** Out-of-stock validation in cart cannot be tested without fixture

### CART-078 (029)
**Verdict:** SEED
**Fixture:** `{{TIER_PRICED_SKU}}` — product with qty-break tier pricing
**Impact:** Tier pricing quantity changes cannot be tested

### CART-059 (030)
**Verdict:** SEED
**Fixture:** `{{EUR_USER_EMAIL}}` + `{{EUR_USER_PASSWORD}}` — user with EUR default currency
**Impact:** EUR currency merge scenario blocked

### CART-061 (030)
**Verdict:** SEED
**Fixture:** `{{CONFIGURABLE_SKU}}` — configurable product with variant selector
**Impact:** Variant product merge scenario blocked

### CHK-014 (012) — coupon dependency
See CART-014 / CHK-018 below. `{{VALID_COUPON_CODE}}` required for CHK-018.

### CHK-018 (012)
**Verdict:** SEED
**Fixture:** `{{VALID_COUPON_CODE}}` applicable to guest users
**Impact:** Guest checkout + coupon scenario blocked

### CHK-056, CHK-057 (011)
**Verdict:** SEED
**Fixture:** Saved tokenized credit card for `{{USER_EMAIL}}`
**Impact:** Saved payment method selection during checkout blocked

### CHK-059, CHK-060 (011)
**Verdict:** SEED
**Fixture:** 2+ saved addresses (CHK-059), 6+ saved addresses (CHK-060) for `{{USER_EMAIL}}`
**Impact:** Address selection from saved list, pagination blocked

### CHK-037 (013)
**Verdict:** SEED
**Fixture:** `{{VALID_COUPON_CODE}}` applicable to B2B org users
**Impact:** B2B checkout coupon + contract price combination blocked

---

## Pattern 2 — Admin Config (ADMIN-CONFIG)

Cases requiring non-default store or org configuration. Must be in isolated environments; not for parallel regression.

### CHK-054, CHK-055, CHK-084, CHK-085 (011)
**Verdict:** ADMIN-CONFIG
**Config Required:** `MinOrderTotal = 50` in Admin > Stores > [Store] > General
**Impact:** Minimum order total enforcement at checkout cannot be tested. CHK-084/085 duplicate CHK-054/055 scope.
**Cleanup:** Reset MinOrderTotal to 0 after tests.

### CHK-032 (013)
**Verdict:** ADMIN-CONFIG + SEED
**Config Required:** Net 30 / On Account payment terms configured for `{{ORG_USER_EMAIL}}` org AND On Account payment method enabled in store
**Impact:** Net 30 checkout payment flow blocked

### CHK-033, CHK-034 (013)
**Verdict:** ADMIN-CONFIG + SEED
**Config Required:** Order approval workflow enabled for `{{ORG_USER_EMAIL}}` org with buyer purchase limit threshold
**Impact:** Approval workflow (Pending Approval status) and bypass-prevention tests blocked

### CART-068, CART-069, CART-070 (030)
**Verdict:** ADMIN-CONFIG
**Config Required:** `selectedForCheckout = OFF` store setting
**Impact:** Tests for "items not selected for checkout" behavior blocked. QA default is ON.
**Cleanup:** Restore store setting to ON after tests.

---

## Pattern 3 — Feature Gap (FEATURE-GAP)

Features not implemented in current storefront; cases marked N/A.

### CART-004 (028)
**Verdict:** RELOCATE
**Finding:** Inline variant picker not implemented on standard PDP. Variant selection is part of the Configurable Products workflow, not the standard cart.
**Action:** Relocated to Suite 072 (configurable products). Automation_Status updated to Relocated.

### CHK-016 (012)
**Verdict:** N/A — FEATURE NOT IMPLEMENTED
**Finding:** Guest order tracking page (`/orders/track`) returns 404. No guest tracking feature exists in current storefront.
**Action:** `Automation_Status = N/A — feature not implemented`.

### CHK-021 (012)
**Verdict:** N/A — FEATURE NOT APPLICABLE IN QA
**Finding:** `anonymousUsersAllowed=false` store configuration not available in QA environment. QA store always has anonymous users allowed.
**Action:** `Automation_Status = N/A — feature not implemented`. Would need a separate store instance or explicit admin toggle to test.

### CHK-072 (013)
**Verdict:** N/A — FEATURE NOT IMPLEMENTED
**Finding:** Cost Center / Department field not present in checkout form for any B2B user in QA.
**Action:** `Automation_Status = N/A — feature not implemented`.

---

## Pattern 4 — Tool Limitation (TOOL-LIMITATION)

Cases blocked by MCP or Playwright browser constraints.

### CART-021 (029)
**Verdict:** REWRITE — TOOL-LIMITATION
**Finding:** Test required two simultaneous browser sessions (dual-context cross-session verification). MCP agent operates single-context.
**Fix:** Replaced dual-browser approach with API-layer verification: add items in browser, verify cart server-side via `getCart` GraphQL query using same credentials from a second API call.

### CART-062 (030)
**Verdict:** REWRITE — TOOL-LIMITATION
**Finding:** Test required fault injection (network interruption during mergeCarts). MCP browsers cannot intercept network at proxy level.
**Fix:** Replaced with: (1) normal merge + verify no crash, (2) API negative test via Postman/curl with malformed mergeCarts mutation.

### CHK-014 (012) — browser assignment
**Verdict:** REWRITE — TOOL-LIMITATION
**Finding:** Firefox MCP Playwright cannot click `div[role=button]` headlessui dropdown selectors used for delivery and payment method selection in guest checkout. Tests were failing silently on Firefox.
**Fix:** Preconditions updated to require `playwright-chrome`. All dependent CHK-01x cases likewise.

### CHK-061 (011)
**Verdict:** REWRITE — TOOL-LIMITATION
**Finding:** Original steps said "simulate session expiry by waiting for natural timeout" — impractical (timeout is 15–30 min). Also, "clearing cookies in browser developer tools" is not a reliable MCP step.
**Fix:** Steps rewritten to explicitly clear session cookies via `[ACT] Clear browser cookies and local storage`, which is testable via MCP evaluate.

---

## Pattern 5 — Spec Gap (SPEC-GAP)

Cases where the assertion or step did not match observed/documented behavior.

### CHK-029 (011)
**Verdict:** REWRITE — SPEC-GAP
**Finding:** Original assertion stated "[DOM] Error messages shown inline for fields containing HTML tags." Observed behavior: no inline validation error is shown for HTML input in address fields; server strips or escapes HTML silently. No client-side rejection.
**Fix:** Removed incorrect assertion. Replaced with structural security invariants: no `alert()` triggered, no script execution, server output renders as literal text (not parsed HTML). Automation_Status updated.

### CHK-038 (013)
**Verdict:** REWRITE — SPEC-GAP
**Finding:** Original assertions included "PO Number is required error if field is required" and "length validation error for over-max-length input." Current implementation: PO Number field is optional (required=false), no character length cap enforced. Both validation expectations are wrong.
**Fix:** Removed required-field and length-cap assertions. Rewritten to test optional-field behavior (checkout proceeds without PO entry) and order-detail persistence.

### CHK-031 (013)
**Verdict:** REWRITE — SPEC-GAP
**Finding:** Original assertions included "PO number shown on confirmation page." Observed behavior: PO number does NOT appear on `/checkout/completed` confirmation page. It appears on the order detail page (`/account/orders/{id}`).
**Fix:** Removed incorrect confirmation-page assertion. Added assertion on order detail page. Step updated to navigate to order detail for PO verification.

---

## Pattern 6 — Admin-Destructive (ENV-DESTRUCTIVE)

Cases that mutate shared fixtures during test execution, blocking parallel regression. Marked ADMIN-DESTRUCTIVE with isolation guard.

### CART-020, CART-024, CART-025, CART-027, CART-028, CART-029, CART-043, CART-044, CART-076, CART-081 (029)
**Verdict:** ADMIN-DESTRUCTIVE
**Mutation type:** Price mutation on shared product, inventory mutation (set to 0), product unpublish/deactivation on shared fixture
**Action:** Preconditions updated with "ADMIN-DESTRUCTIVE: Mutates [fixture]. Run in isolated environment only; do not run during parallel regression. Restore in Cleanup."
**Count:** 10 cases in suite 029

### CART-023, CART-045 (029)
**Verdict:** ADMIN-DESTRUCTIVE (inventory=0 mutation)
**Note:** CART-046 and CART-082 were rewritten to use permanent `{{OOS_SKU}}` fixture instead, eliminating the destructive pattern for the OOS validation scenario itself. CART-023/045 remain destructive as they test the moment of stock change, not the resulting state.

### CART-030 (029)
**Verdict:** ADMIN-DESTRUCTIVE + SEED
**Mutation type:** Deactivates shared promotion. Also requires coupon seed.
**Count:** 1 case

---

## Pattern 7 — Duplicate (DUP)

Cases with substantially overlapping coverage. Retained for history but flagged.

### CART-040 (029)
**Finding:** Substantially overlaps CART-019 (sign-out/sign-in persistence). Both test cart survival across sign-out + sign-in.
**Action:** Automation_Status flagged DUP; retained for coverage history. Review for consolidation in next suite refactor.

### CART-041 (029)
**Finding:** Substantially overlaps CART-022 (guest cart merge on sign-in). Both test guest-cart merge trigger.
**Action:** Same — flagged DUP, retained.

### CHK-084, CHK-085 (011)
**Finding:** Substantially duplicate CHK-054 and CHK-055 (MinOrderTotal scope). Same admin config required, same assertions.
**Action:** Both marked ADMIN-CONFIG BLOCKED. Flagged in Automation_Status for future consolidation.

---

## Expected BLOCKED-Rate Reduction After Seeding

| State | Estimate |
|-------|---------|
| Cases blocked before this review | ~35 cases across 6 suites |
| Cases resolved by rewrites (no seed needed) | ~14 (tool-limitation + spec-gap rewrites) |
| Cases remaining BLOCKED on seed | ~21 (require fixture provisioning) |
| Cases remaining BLOCKED on admin-destructive | ~13 (require isolated environment or rewrite) |
| Cases marked N/A (permanently excluded) | 4 (CART-004 relocated, CHK-016, CHK-021, CHK-072) |
| Expected BLOCKED rate after all seeds provisioned | < 10% (admin-destructive isolation still needed) |
| Expected BLOCKED rate after seeds + isolated env for destructive cases | < 2% |

---

## Seeder Checklist

Provision in this priority order:

- [ ] `VALID_COUPON_CODE` — Admin > Marketing > Promotions > new coupon promotion (all users, unlimited, no expiry in regression window). Unblocks: CART-014, CART-042, CHK-018, CHK-037.
- [ ] `OOS_SKU` — Admin > Catalog > new product "QA OOS Fixture"; Admin > Inventory > stock = 0 for all FCs; link to B2B virtual catalog. Unblocks: CART-046, CART-082.
- [ ] `MinOrderTotal` store setting — Admin > Stores > [Store] > General > Minimum order total = 50. Note: DESTRUCTIVE (affects all checkout tests) — set only in isolated run. Unblocks: CHK-054, CHK-055, CHK-084, CHK-085.
- [ ] Approval workflow — Admin > Customers > Organizations > [Org for ORG_USER_EMAIL] > Order approval > enable; set buyer limit = $100. Unblocks: CHK-033, CHK-034.
- [ ] 2+ saved addresses for `{{USER_EMAIL}}` — Storefront login as USER_EMAIL > Addresses > add 2 US addresses. For CHK-060 add 6 total. Unblocks: CHK-059, CHK-060.
- [ ] `MULTI_ORG_USER_EMAIL` — Admin > Customers > Contacts > [Contact for ORG_USER_EMAIL] > add to second organization. Add env var. Unblocks: CART-052, CART-053.
- [ ] `LOW_STOCK_SKU` — Admin > Catalog > existing product > Inventory > set stock = 5 for primary FC; link to B2B virtual catalog. Add env var. Unblocks: CART-037, CART-082.
- [ ] `TIER_PRICED_SKU` — Admin > Pricing > Price Lists > [List] > add SKU with qty-break prices. Add env var. Unblocks: CART-078.
- [ ] `PACK_SIZE_SKU` — Admin > Catalog > product > set MinQuantity/PackSize = 6. Add env var. Unblocks: CART-054, CART-055.
- [ ] `EUR_USER_EMAIL` — Admin > Customers > Members > new user with EUR default currency; or edit existing contact. Add env vars. Unblocks: CART-059.
- [ ] `CONFIGURABLE_SKU` — Admin > Catalog > configurable product with ≥1 variant property; link to B2B virtual catalog. Add env var. Unblocks: CART-061.
- [ ] Saved tokenized card for `{{USER_EMAIL}}` — Storefront login as USER_EMAIL > complete one checkout > save card. Unblocks: CHK-056, CHK-057.
- [ ] Net-30 payment terms — Admin > Customers > Organizations > [ORG] > set payment terms = Net 30; Admin > Stores > Payment methods > enable On Account. Unblocks: CHK-032.
