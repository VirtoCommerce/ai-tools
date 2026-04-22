# Orders Suite Review — REG-2026-04-20-1000
**Review Date:** 2026-04-22
**Reviewer:** test-management-specialist
**Scope:** Suite 014 (orders-frontend, 67 cases) | Suite 015 (quotes, 30 cases)
**Trigger:** 47 of 67 suite-014 cases BLOCKED in REG-2026-04-20-1000 — Emily's agent-pool account had only New + Payment-required orders. No Shipped / Completed / Cancelled / Partially Shipped / BOPIS / Return states existed.

---

## Summary Counts Per Verdict Per Suite

| Suite | REWRITE | SEED | RELOCATE | N/A | COND-WRAP | Total Touched |
|-------|---------|------|----------|-----|-----------|---------------|
| 014 — orders-frontend | 6 | 18 | 1 | 1 | 12 | 38 |
| 015 — quotes | 0 | 24 | 0 | 0 | 8 | 24 |
| **TOTAL** | **6** | **42** | **1** | **1** | **20** | **62** |

---

## Golden Rule Violations Fixed

Total violations across both suites: **9**

| Case | Violation | Fix Applied |
|------|-----------|-------------|
| CHK-024 Test_Data | Hardcoded tracking number `1Z999AA10123456784` | Replaced with `{{SAMPLE_TRACKING_NUMBER}}` |
| CHK-024 Assertions | Referenced `{{TRACKING_NUMBER}}` (undefined var) | Rewritten to reference `{{SAMPLE_TRACKING_NUMBER}} value entered in admin` |
| ORD-005 Test_Data | Hardcoded tracking number | Replaced with `{{SAMPLE_TRACKING_NUMBER}}` |
| ORD-005 Steps | Referenced bare `tracking number` in admin step | Rewritten to reference `{{SAMPLE_TRACKING_NUMBER}}` |
| ORD-007 Test_Data | `sku={{TEST_SKU}}` — not a real env var | Removed; replaced with runtime resolution ("note first item SKU from order detail") |
| ORD-005 Assertions | `{{TRACKING_NUMBER}}` undefined var in assertions | Rewritten to match `{{SAMPLE_TRACKING_NUMBER}}` |
| ORD-006 Preconditions | Bare "shipped order" without env var reference | Bound to `{{SHIPPED_ORDER}}` |
| CHK-023 Automation_Status | "Generated" despite needing admin action | Updated to RELOCATE verdict |
| ORD-033 | Steps asserted timeline on storefront (feature absent) | Marked N/A with explanation |

---

## Pattern 1 — SEED REQUIRED (suite 014)

Missing order-state fixtures. Env vars must be added to `.env` and orders provisioned in QA before running.

### CHK-012 — BOPIS Pickup Order
**Fixture:** `{{BOPIS_PICKUP_ORDER}}` — order placed as BOPIS/pickup for `{{USER_EMAIL}}`
**Impact:** Pickup details display (pickup location, store hours, instructions) cannot be verified
**Cases blocked:** 1

### CHK-013, ORD-006, ORD-012, ORD-030 — Shipped Order with Tracking
**Fixture:** `{{SHIPPED_ORDER}}` — order in Shipped state with tracking number and carrier name assigned in admin
**Impact:** Shipped status display, tracking link rendering, cancel-blocked-on-shipped, tracking anchor verification cannot run
**Cases blocked:** 4

### CHK-025, CHK-039, CHK-040, ORD-001, ORD-003, ORD-007, ORD-008, ORD-009, ORD-010, ORD-035 — Completed Order
**Fixture:** `{{COMPLETED_ORDER}}` — order in Completed state (all shipments delivered) for `{{USER_EMAIL}}`
**Impact:** Completed status display, all Reorder flows, Return requests, Reorder pricing, Reorder merge cannot run
**Cases blocked:** 10 (highest ROI fixture)

### CHK-047, CHK-048, ORD-014, ORD-041, ORD-042, ORD-043 — Invoice-Available Order
**Fixture:** `{{INVOICE_AVAILABLE_ORDER}}` — completed order with PDF invoice feature enabled
**Impact:** Invoice download, PDF content, multiple document types cannot be tested
**Cases blocked:** 6

### ORD-011, ORD-044, ORD-046 — Buyer Cancel (New Order)
**Fixture:** fresh New order owned by `{{USER_EMAIL}}`; `STORE_CONFIG_BUYER_CANCEL=true`
**Impact:** Buyer cancel flows (with reason, with refund notification) cannot run without store config confirmed
**Cases blocked:** 3

### ORD-038 — Order with Active Return
**Fixture:** `{{ORDER_WITH_RETURN}}` — completed order with admin-acknowledged RMA/return request; RETURNS_FEATURE_ENABLED=true
**Impact:** Return status tracking display cannot be verified
**Cases blocked:** 1

### ORD-040 — Order Past Return Window
**Fixture:** `{{ORDER_PAST_RETURN_WINDOW}}` — completed order delivered 30+ days ago; RETURNS_FEATURE_ENABLED=true
**Impact:** Return window expiry enforcement cannot be verified
**Cases blocked:** 1

### ORD-045 — Partially Shipped Order
**Fixture:** `{{PARTIALLY_SHIPPED_ORDER}}` — order with 2+ shipments where at least one is Sent and one is still pending
**Impact:** Cancellation blocked for partially shipped cannot be verified
**Cases blocked:** 1

### ORD-047 — Processing Order
**Fixture:** `{{PROCESSING_ORDER}}` — New order promoted to Processing by admin
**Impact:** "Too late to cancel" guard for Processing state cannot be verified
**Cases blocked:** 1

### CHK-041, ORD-002, ORD-034, ORD-036 — Order with Discontinued Item
**Fixture:** `{{ORDER_WITH_DISCONTINUED_ITEM}}` — completed order where at least one SKU was later discontinued
**Impact:** Partial reorder with discontinued item, mixed-availability reorder cannot run
**Cases blocked:** 4

### CHK-042 — Order with OOS Item
**Fixture:** `{{ORDER_WITH_OOS_ITEM}}` — completed order where at least one SKU is currently OOS
**Impact:** Reorder with OOS item handling cannot be verified
**Cases blocked:** 1

---

## Pattern 2 — SEED REQUIRED (suite 015)

All quote fixtures require admin-side action (entering pricing, accepting, setting expiry). All owned by `{{ORG_USER_EMAIL}}`.

### QUOTE-004, 005, 006, 008, 009, 018, 019, 020, 021, 025 — Quote with Admin Response
**Fixture:** `{{QUOTE_WITH_ADMIN_RESPONSE}}` — quote in "Quote Received" status with admin-proposed per-line pricing
**Impact:** 10 cases blocked — accept, reject, negotiate, view pricing, notifications cannot run
**Admin action required:** Admin > Quotes > [Quote] > enter per-line prices > submit

### QUOTE-007, 024, 027, 028, 030 — Accepted Quote
**Fixture:** `{{ACCEPTED_QUOTE}}` — quote that buyer accepted after admin pricing response
**Impact:** 5 conversion cases blocked — Convert to Order, price preservation, partial conversion guard
**Admin action required:** Complete `{{QUOTE_WITH_ADMIN_RESPONSE}}` creation, then buyer accepts

### QUOTE-011, 022, 023 — Expired Quote
**Fixture:** `{{EXPIRED_QUOTE}}` — quote with admin-set expiry date that has passed
**Impact:** Expiry enforcement, expired-cannot-accept, expiry badge display cannot run
**Admin action required:** Admin > Quotes > [Quote] > set expiry date to a past date

### QUOTE-012, 014, 017 — Multiple Quotes in Various States
**Fixture:** Multiple quotes in different statuses owned by `{{ORG_USER_EMAIL}}`
**Impact:** Filter, list display, search by ID cannot be fully tested without 3+ quotes

### QUOTE-026 — Accepted Quote with OOS Item
**Fixture:** `{{ACCEPTED_QUOTE_OOS}}` — accepted quote where one item became OOS after acceptance
**Impact:** Conversion-with-OOS-item error handling cannot be verified

### QUOTE-029 — Accepted Quote with PO Number
**Fixture:** `{{ACCEPTED_QUOTE_WITH_PO}}` — accepted quote originally submitted with PO number
**Impact:** PO number preservation during quote-to-order conversion cannot be verified

### QUOTE-019 — Multi-Round Negotiation Quote
**Fixture:** `{{QUOTE_MULTI_ROUND}}` — quote with 2+ completed negotiation rounds
**Impact:** Multi-round history display cannot be verified
**Note:** DEFERRED — requires negotiation feature confirmed enabled

### QUOTE-010 — Quote with Substitution
**Fixture:** `{{QUOTE_WITH_SUBSTITUTION}}` — quote where admin added a substitute product on a line
**Impact:** Substitution badge and accept/reject per-line cannot be verified
**Note:** DEFERRED — requires substitution feature confirmed enabled

---

## Pattern 3 — RELOCATE

### CHK-023 — Order Status Processing (Admin-Driven)
**Verdict:** RELOCATE to `017-orders-admin-management.csv`
**Reason:** Test is primarily about admin promoting an order to Processing status. Storefront verification is a secondary cross-layer check, not the primary scenario. Keeping a lightweight storefront-side verification copy is acceptable but the full case belongs in the admin suite.
**Cases affected:** 1

---

## Pattern 4 — N/A (Feature Not on Storefront)

### ORD-033 — Order Timeline / Activity History
**Verdict:** N/A
**Reason:** Order audit trail / status history is admin-only per BL-ORD-008. The storefront order detail page does not expose a timeline or activity history section. Testing this on the storefront is invalid. Admin-side coverage should be in Backend suite 017.
**Cases affected:** 1

---

## Pattern 5 — Conditional Wrapping (COND-WRAP)

12 cases in suite 014 and 8 cases in suite 015 had assertions or steps that assumed features were always present. These were wrapped with `[COND: feature enabled]` tags to prevent false failures when the feature is not configured for the store. Features gated this way:

| Feature Gate | Cases Wrapped | Tag Applied |
|-------------|---------------|-------------|
| Buyer cancel / Cancel Order button | ORD-011, ORD-044, ORD-046, ORD-047 | `[COND: buyer-cancel enabled]` |
| Returns / RMA | ORD-009, ORD-010, ORD-037, ORD-038, ORD-039, ORD-040 | `[COND: returns feature enabled]` |
| Invoice / PDF download | CHK-047, CHK-048 | `[COND: invoice feature enabled]` |
| Reorder button | CHK-039, CHK-040, CHK-041, CHK-042, ORD-001, ORD-002, ORD-003 | `[COND: reorder feature enabled]` |
| RFQ button (quotes) | QUOTE-001, QUOTE-013, QUOTE-015 | `[COND: RFQ feature enabled]` |
| Negotiation feature | QUOTE-009, QUOTE-018, QUOTE-019, QUOTE-020, QUOTE-021 | `[COND: negotiation feature enabled]` |
| Quote status history | QUOTE-024 | `[COND: status history feature present]` |
| Notification system | QUOTE-025 | `[COND: notification system enabled]` |

---

## Pattern 6 — Admin Status vs Storefront Label Gap (DEFERRED)

**Critical finding:** The exact internal admin status string values for orders are not fully documented. BL-ORD-007 documents shipment sub-states (New → PickPack → Sent → Delivered) but the order-aggregate status labels (what gets set in admin via the API / status field, and what appears in `statusDisplayValue` from xAPI) are not mapped in the knowledge base.

**Impact:** Seeding scripts that provision orders in specific states need to know the exact admin status strings to call against the admin API. Until these are confirmed, all seed fixture specs in `test-data/README.md` are flagged as `DEFERRED — exact admin status string TBD`.

**Resolution required from product owner:**
1. What is the admin API status field value for "Shipped"? (Is it the order status or is it created by creating a shipment with status "Sent"?)
2. What admin status string creates the "Completed" / delivered state visible on storefront?
3. What is the exact store setting key for enabling buyer-side order cancellation?
4. What is the exact store setting key for enabling the Returns/RMA feature?

---

## Deferred Items Requiring Product Owner Input

| Item | Impact | Owner |
|------|--------|-------|
| Admin order status string mapping (Shipped / Completed / Processing / Partially Shipped) | Seeding scripts blocked | Product Owner / Platform team |
| `STORE_CONFIG_BUYER_CANCEL` — exact config key | 4 cancellation cases gated | Product Owner |
| `RETURNS_FEATURE_ENABLED` — exact config key | 6 return cases gated | Product Owner |
| Invoice feature — store config location | 6 invoice cases gated | Product Owner |
| Quote negotiation feature availability | 5 negotiation cases gated | Product Owner |
| Quote substitution feature availability | 1 substitution case gated | Product Owner |

---

## Priority Order for Unblocking

| Priority | Action | Cases Unblocked |
|----------|--------|-----------------|
| 1 | Provision `{{COMPLETED_ORDER}}` for `{{USER_EMAIL}}` | 10 (suite 014) |
| 2 | Provision `{{SHIPPED_ORDER}}` for `{{USER_EMAIL}}` | 4 (suite 014) |
| 3 | Provision `{{QUOTE_WITH_ADMIN_RESPONSE}}` for `{{ORG_USER_EMAIL}}` | 10 (suite 015) |
| 4 | Provision `{{ACCEPTED_QUOTE}}` for `{{ORG_USER_EMAIL}}` | 5 (suite 015) |
| 5 | Confirm `STORE_CONFIG_BUYER_CANCEL` key + set to true | 4 (suite 014) |
| 6 | Provision `{{INVOICE_AVAILABLE_ORDER}}` + invoice feature enabled | 6 (suite 014) |
| 7 | Provision `{{EXPIRED_QUOTE}}` for `{{ORG_USER_EMAIL}}` | 3 (suite 015) |
| 8 | Provision `{{ORDER_WITH_DISCONTINUED_ITEM}}` | 4 (suite 014) |
| 9 | Confirm `RETURNS_FEATURE_ENABLED` key + RETURNS fixtures | 6 (suite 014) |
| 10 | Provision `{{PARTIALLY_SHIPPED_ORDER}}` | 1 (suite 014) |

**Total cases unblocked across both suites when all fixtures provisioned:** approximately 54 cases (32 suite-014 + 22 suite-015).

---

## Files Modified

- `regression/suites/Frontend/orders/014-orders-frontend.csv` — 38 cases touched
- `regression/suites/Frontend/orders/015-quotes.csv` — 24 cases touched
- `test-data/README.md` — "Orders Suite Seed Requirements (2026-04-22 review)" section appended
