# Test Design Techniques Reference

> Shared reference for all QA agents. Read when deriving test cases for a feature, reviewing test coverage gaps, or building regression suites.
> For output formatting and artifact paths, see `evidence-capture-policy.md` and `output-paths.md` in the qa-evidence skill.

---

## 1. Technique Selection Guide

Use this table to pick the right technique(s) for the feature under test. Most features benefit from combining two or more techniques.

| Situation | Recommended Technique(s) | Rationale |
|---|---|---|
| Many input values, few business rules | EP + BVA | Partitions reduce combinatorial explosion; boundaries catch off-by-one errors |
| Complex business rules with multiple conditions | Decision Table | Exhaustive rule coverage; exposes missing/contradictory rules |
| Feature has a lifecycle (status changes) | State Transition Testing | Catches invalid transitions and unreachable states |
| Many parameters, full combination infeasible | Pairwise / Combinatorial | Covers all 2-way interactions at ~15% of full combinations |
| Mature feature, looking for edge cases | Error Guessing | Leverages domain knowledge to target likely failure points |
| New or unknown feature | EP + BVA + Error Guessing | Baseline systematic coverage plus exploratory edge cases |
| Integration or E2E testing | All applicable | Layer techniques: EP for inputs, State for flows, Decision for rules |

**Combining techniques:** Start with EP + BVA to establish baseline coverage, then layer additional techniques based on feature characteristics. Track which technique produced each test case for traceability.

---

## 2. Equivalence Partitioning (EP)

**Concept:** Divide the input domain into classes (partitions) where all values in a partition are expected to produce the same behavior. Select one representative value per partition. If the system handles one value correctly from a partition, it should handle all values in that partition correctly.

**When to use:** Any feature that accepts input values — form fields, API parameters, search queries, quantity selectors, filters.

### VC Example: Product Quantity Input

| Partition | Class | Representative Value | Expected Result |
|---|---|---|---|
| Valid quantity | Valid | 5 | Accepted, cart updated |
| Minimum valid | Valid boundary | 1 | Accepted, cart shows 1 item |
| Zero | Invalid | 0 | Rejected with validation error |
| Negative number | Invalid | -1 | Rejected with validation error |
| Over maximum limit | Invalid | 1000 | Rejected or capped at max (999) |
| Non-numeric input | Invalid | "abc" | Rejected with validation error |
| Decimal number | Invalid | 2.5 | Rejected or rounded (depends on product type) |
| Empty / blank | Invalid | "" | Rejected with required field error |

### VC Example: Price Range Filter

| Partition | Class | Representative Value | Expected Result |
|---|---|---|---|
| Below minimum ($0) | Invalid | -10 to -1 | No results or validation error |
| Valid range | Valid | $10 to $500 | Filtered results within range |
| Above maximum | Valid (open-ended) | $10000+ | Results at or above value |
| Inverted range (min > max) | Invalid | $500 to $10 | Error or auto-correction |
| Zero range (min = max) | Edge | $100 to $100 | Results at exact price |
| Empty fields | Invalid | "" to "" | No filter applied / show all |

### VC Example: Search Query

| Partition | Class | Representative Value | Expected Result |
|---|---|---|---|
| Empty query | Invalid | "" | Validation error or default results |
| Single character | Edge | "a" | May search or show minimum length warning |
| Normal query (2-100 chars) | Valid | "laptop bag" | Relevant search results |
| Long query (>100 chars) | Edge | 150-char string | Truncated or handled gracefully |
| Special characters | Edge | "laptop & bag (15\")" | Escaped properly, no injection |
| XSS attempt | Invalid / Security | "<script>alert(1)</script>" | Sanitized, no script execution |
| Unicode characters | Valid | Product name in Japanese | Correct results for locale |
| SQL injection attempt | Invalid / Security | "' OR 1=1 --" | Sanitized, no data leak |

---

## 3. Boundary Value Analysis (BVA)

**Concept:** Bugs cluster at the edges of equivalence partitions. Test the exact boundary values: the last valid value, the first invalid value, and immediately adjacent values. For a range [min, max], test: min-1, min, min+1, max-1, max, max+1.

**When to use:** Always pair with EP. Especially important for numeric inputs, character limits, pagination, date ranges, and any field with defined min/max constraints.

### VC Example: Cart Quantity (Range 1-999)

| Boundary | Test Value | Expected | Type |
|---|---|---|---|
| Below minimum | 0 | Rejected — quantity must be at least 1 | Invalid |
| At minimum | 1 | Accepted — cart shows 1 item | Valid |
| Above minimum | 2 | Accepted — standard case | Valid |
| Below maximum | 998 | Accepted — large but valid | Valid |
| At maximum | 999 | Accepted — max quantity | Valid |
| Above maximum | 1000 | Rejected — exceeds maximum | Invalid |

### VC Example: Pagination (Total: 47 items, Page size: 20)

| Boundary | Test Value | Expected | Type |
|---|---|---|---|
| Before first page | Page 0 | Error or redirect to page 1 | Invalid |
| First page | Page 1 | Items 1-20 displayed | Valid |
| Last full page | Page 2 | Items 21-40 displayed | Valid |
| Last partial page | Page 3 | Items 41-47 displayed (partial) | Valid |
| Beyond last page | Page 4 | Empty results or redirect to last page | Invalid |
| Negative page | Page -1 | Error or redirect to page 1 | Invalid |

### VC Example: Input Character Limits

| Field | Limit | Test Values | Expected |
|---|---|---|---|
| Product name | 256 chars | 0, 1, 255, 256, 257 | Empty rejected; 1-256 accepted; 257 rejected or truncated |
| Address line | 128 chars | 0, 1, 127, 128, 129 | Same pattern |
| Search query | 100 chars | 0, 1, 99, 100, 101 | Empty shows default; 1-100 accepted; 101 truncated |
| SKU | 64 chars | 0, 1, 63, 64, 65 | Empty rejected; 1-64 accepted; 65 rejected |

### VC Example: Price Values

| Boundary | Test Value | Expected | Type |
|---|---|---|---|
| Zero price | $0.00 | Allowed for free items or rejected per policy | Edge |
| Minimum positive | $0.01 | Accepted — lowest valid price | Valid |
| Standard price | $49.99 | Accepted — normal case | Valid |
| High price boundary | $99,999.99 | Accepted — near platform max | Valid |
| At platform max | $100,000.00 | Accepted or rejected per config | Edge |
| Above platform max | $100,000.01 | Rejected — exceeds limit | Invalid |
| Negative price | -$1.00 | Rejected — price cannot be negative | Invalid |

---

## 4. Decision Table Testing

**Concept:** Model features with multiple conditions and corresponding actions as a decision table. Each column represents a unique rule (combination of conditions) and specifies which actions apply. Ensures every meaningful combination of conditions is tested.

**When to use:** Features with business rules that combine 3+ independent conditions. Checkout flows, permission checks, pricing rules, shipping method selection, promotion eligibility.

### VC Example: Checkout Rule Engine

**Conditions:**

| # | Condition | Values |
|---|---|---|
| C1 | User Type | B2B, B2C |
| C2 | Payment Method | Card, Invoice, Purchase Order |
| C3 | Shipping Method | Standard, Express, Pickup |
| C4 | Discount Applied | Yes, No |

**Full combination count:** 2 x 3 x 3 x 2 = 36 rules

**Reduced decision table** (meaningful subset covering critical rules):

| Rule | C1: User | C2: Payment | C3: Shipping | C4: Discount | Action | Priority |
|---|---|---|---|---|---|---|
| R1 | B2C | Card | Standard | No | Standard checkout | P0 |
| R2 | B2C | Card | Express | No | Checkout + express fee | P1 |
| R3 | B2C | Card | Pickup | No | Checkout + pickup location required | P1 |
| R4 | B2C | Card | Standard | Yes | Checkout + discount applied to total | P1 |
| R5 | B2B | Card | Standard | No | Standard B2B checkout | P0 |
| R6 | B2B | Invoice | Standard | No | Checkout + invoice terms displayed | P1 |
| R7 | B2B | Purchase Order | Standard | No | Checkout + PO number required | P1 |
| R8 | B2B | Purchase Order | Express | Yes | Full combo: B2B + PO + express + discount | P1 |
| R9 | B2C | Invoice | Standard | No | Rejected — B2C cannot use invoice | P1 |
| R10 | B2C | Purchase Order | Standard | No | Rejected — B2C cannot use PO | P1 |
| R11 | B2B | Card | Pickup | Yes | B2B pickup + card + discount | P2 |
| R12 | B2B | Invoice | Pickup | No | B2B pickup + invoice | P2 |

**Reduction strategy:** From 36 to 12 rules by:
1. Always include all "happy path" combinations (R1, R5)
2. Include all invalid/rejected combinations (R9, R10)
3. Cover each condition value at least once in a valid rule
4. Add the "full combination" rule that exercises all conditions simultaneously (R8)
5. Add edge combos that mix unusual conditions (R11, R12)

---

## 5. State Transition Testing

**Concept:** Model the feature as a finite state machine with defined states, events (triggers), transitions, and actions. Test all valid transitions, and explicitly verify that invalid transitions are blocked.

**When to use:** Any feature with a lifecycle — orders, quotes, returns, user accounts, payment transactions, shopping carts, approval workflows.

### VC Example: Order Lifecycle

**State diagram:**

```
                                  ┌─────────────┐
                ┌────────────────►│  Cancelled   │
                │                 └─────────────┘
                │                        ▲
                │                        │ Cancel
                │                        │
  ┌──────────┐  │  ┌───────────┐  ┌──────┴──────┐  ┌──────────┐  ┌───────────┐
  │  Draft    ├──┴─►│ Confirmed │─►│ Processing  ├─►│ Shipped  ├─►│ Delivered │
  └──────────┘     └───────────┘  └─────────────┘  └──────────┘  └───────────┘
    Confirm           Process          Ship             Deliver
                                        │
                                        │ Partial Ship
                                        ▼
                                 ┌─────────────────┐
                                 │ Partially Shipped│──► Shipped ──► Delivered
                                 └─────────────────┘
```

**State transition table:**

| Current State | Event | Next State | Action | Valid? |
|---|---|---|---|---|
| Draft | Confirm | Confirmed | Validate items, reserve inventory | Yes |
| Draft | Cancel | Cancelled | Release any holds | Yes |
| Confirmed | Process | Processing | Charge payment, create fulfillment | Yes |
| Confirmed | Cancel | Cancelled | Release inventory reservation | Yes |
| Processing | Ship | Shipped | Generate tracking, notify customer | Yes |
| Processing | Partial Ship | Partially Shipped | Ship available items, hold remainder | Yes |
| Processing | Cancel | Cancelled | Refund payment, release inventory | Yes |
| Partially Shipped | Ship | Shipped | Ship remaining items | Yes |
| Shipped | Deliver | Delivered | Mark complete, trigger review request | Yes |
| Delivered | Confirm | -- | Blocked — cannot re-confirm delivered order | No |
| Delivered | Process | -- | Blocked — cannot reprocess delivered order | No |
| Delivered | Cancel | -- | Blocked — must use Return flow instead | No |
| Cancelled | Confirm | -- | Blocked — cancelled orders are terminal | No |
| Cancelled | Process | -- | Blocked — cancelled orders are terminal | No |
| Draft | Ship | -- | Blocked — cannot ship before processing | No |
| Confirmed | Ship | -- | Blocked — must process before shipping | No |
| Draft | Deliver | -- | Blocked — cannot deliver from draft | No |

**Test cases to derive:**
1. One test per valid transition (7 tests)
2. One test per invalid transition (7 tests for blocked paths)
3. Full happy path: Draft -> Confirmed -> Processing -> Shipped -> Delivered (1 test)
4. Cancel from each cancellable state: Draft, Confirmed, Processing (3 tests)
5. Partial ship path: Processing -> Partially Shipped -> Shipped -> Delivered (1 test)

---

## 6. Pairwise / Combinatorial Testing

**Concept:** Most defects are triggered by the interaction of at most 2 parameters (pairwise interaction). Instead of testing all possible combinations (full Cartesian product), generate a reduced set that covers every pair of parameter values at least once. Typically reduces test count by 80-90%.

**When to use:** Cross-browser testing matrices, configuration testing, any scenario with 4+ parameters where full coverage is infeasible.

### VC Example: Cross-Browser Testing Matrix

**Parameters:**

| Parameter | Values | Count |
|---|---|---|
| Browser | Chrome, Firefox, Edge | 3 |
| Viewport | Desktop (1920px), Tablet (768px), Mobile (375px) | 3 |
| User Role | Admin, B2B Customer, B2C Customer, Guest | 4 |
| Payment | Card, Invoice, Purchase Order | 3 |

**Full combination:** 3 x 3 x 4 x 3 = 108 test configurations

**Pairwise reduction** (covers every 2-way parameter pair):

| # | Browser | Viewport | User Role | Payment |
|---|---|---|---|---|
| 1 | Chrome | Desktop | Admin | Card |
| 2 | Chrome | Tablet | B2B Customer | Invoice |
| 3 | Chrome | Mobile | B2C Customer | Purchase Order |
| 4 | Firefox | Desktop | B2B Customer | Purchase Order |
| 5 | Firefox | Tablet | B2C Customer | Card |
| 6 | Firefox | Mobile | Admin | Invoice |
| 7 | Edge | Desktop | B2C Customer | Invoice |
| 8 | Edge | Tablet | Admin | Purchase Order |
| 9 | Edge | Mobile | B2B Customer | Card |
| 10 | Chrome | Desktop | Guest | Invoice |
| 11 | Firefox | Desktop | Guest | Card |
| 12 | Edge | Tablet | Guest | Invoice |
| 13 | Chrome | Tablet | Guest | Card |
| 14 | Firefox | Mobile | Guest | Purchase Order |
| 15 | Edge | Desktop | Admin | Card |
| 16 | Edge | Mobile | B2C Customer | Card |

**Result:** 16 tests instead of 108 (85% reduction) while covering every pair of parameter values at least once.

**Verification:** Check that every pair appears:
- Chrome + Desktop: Test 1, 10 -- covered
- Firefox + Guest: Test 11, 14 -- covered
- Mobile + Card: Test 9, 16 -- covered
- (continue for all 2-way pairs)

**When to go beyond pairwise:** If a specific 3-way interaction is suspected of causing defects (e.g., Edge + Mobile + B2B is known to have rendering issues), add targeted 3-way covering tests.

---

## 7. Error Guessing Heuristics

**Concept:** Use domain knowledge, experience, and common failure patterns to guess where defects are likely to hide. Not systematic like EP/BVA, but highly effective for finding defects that formal techniques miss. Best applied after EP + BVA to catch the remaining ~40%.

**When to use:** After baseline techniques are applied. Especially valuable for mature features where obvious bugs are already found, and for VC-specific platform behaviors.

### Empty / Null Operations

| Scenario | What to Test | Why It Breaks |
|---|---|---|
| Empty cart checkout | Click checkout with 0 items | Missing guard on empty cart |
| Search with empty query | Submit search form with blank input | Unhandled empty string in Elasticsearch query |
| Save form with required fields blank | Submit without filling mandatory fields | Client-side validation bypassed or missing |
| Delete last item from cart | Remove the only item | Cart state not updated, total shows stale value |
| Apply empty coupon code | Submit blank coupon field | API may return 500 instead of validation error |
| Filter with no selections | Apply filters with all unchecked | Query builds invalid filter clause |

### Session and Timing

| Scenario | What to Test | Why It Breaks |
|---|---|---|
| Expired session mid-checkout | Start checkout, wait for session timeout, submit payment | Payment submitted without auth token |
| Concurrent cart updates | Open cart in two tabs, modify both, submit | Race condition on cart version |
| Stale CSRF token | Open form, wait 30+ minutes, submit | Token expired, silent 403 |
| Browser back after order placed | Place order, click browser back button | Duplicate order submission or stale cart page |
| Slow network on payment submit | Throttle network, submit payment | Double-click protection, timeout handling |
| Page refresh during checkout step | F5 on address/payment step | Form state lost, step reset |

### Data Edge Cases

| Scenario | What to Test | Why It Breaks |
|---|---|---|
| Unicode product names | Products with CJK, Arabic, emoji in names | Encoding issues in URL slugs, search index |
| Max-length address fields | 128+ character address lines | Truncation, database field overflow |
| Zero-price items | Add free item to cart | Division by zero in discount calc, tax calc edge case |
| Negative quantities via API | Send quantity=-1 via direct API call | Missing server-side validation |
| Very long SKU | 64+ character SKU identifier | Truncation in cart display, API payload rejection |
| Special chars in org name | Organization name with &, <, >, quotes | XSS in admin display, broken URL encoding |

### Concurrency

| Scenario | What to Test | Why It Breaks |
|---|---|---|
| Simultaneous order placement | Two users checkout the last item in stock | Inventory oversold, both orders confirmed |
| Duplicate payment submission | Double-click pay button rapidly | Payment charged twice |
| Concurrent admin catalog edit | Two admins edit same product simultaneously | Last write wins, data loss |
| Cart update during checkout | Add item to cart while on payment step | Cart total mismatch at order confirmation |

### VC Platform-Specific

| Scenario | What to Test | Why It Breaks |
|---|---|---|
| Cache stale after admin change | Change price in admin, check storefront immediately | Redis/memory cache not invalidated |
| GraphQL partial errors | Query returns HTTP 200 with `errors[]` array | Frontend treats 200 as success, ignores errors |
| Search index lag | Add product in admin, search immediately | Elasticsearch index not yet updated |
| Multi-store config bleed | Switch stores, check pricing/catalog | Store-scoped settings leaking between stores |
| Dynamic property missing | Feature depends on DP that was deleted | Null reference in rendering or business logic |
| Background job stuck | Trigger action that depends on Hangfire job | Job failed silently, feature appears broken |
| xAPI schema change | After platform update, query returns null field | Field renamed or removed in resolver refactor |
| Large cart performance | Add 50+ items to cart | GraphQL response timeout, UI render freeze |

---

## 8. Worked Example: Configurable Products

Apply all techniques to the configurable products feature end-to-end. This demonstrates how techniques layer together to produce comprehensive coverage.

### Feature Summary

Configurable products allow customers to select configuration options (size, color, material, etc.) that affect price, availability, and SKU. The configuration must be complete before adding to cart.

### 8.1 Equivalence Partitioning

**Input: Configuration option selection**

| Partition | Class | Representative | Expected |
|---|---|---|---|
| All required options selected | Valid | Size=L, Color=Blue, Material=Cotton | Price calculated, Add to Cart enabled |
| Some required options missing | Invalid | Size=L, Color=(none) | Add to Cart disabled, validation shown |
| No options selected | Invalid | All (none) | Add to Cart disabled |
| Invalid combination | Invalid | Size=XS, Material=Leather (not available in XS) | Combination flagged as unavailable |
| Optional option added | Valid | Size=L, Color=Blue + Gift Wrap=Yes | Price includes optional add-on |

### 8.2 Boundary Value Analysis

**Quantity boundaries for configured product:**

| Boundary | Value | Expected | Type |
|---|---|---|---|
| Below minimum | 0 | Rejected | Invalid |
| At minimum | 1 | Accepted, configured item added | Valid |
| Standard | 5 | Accepted | Valid |
| At stock limit | Available stock count | Accepted | Valid |
| Above stock limit | Available stock + 1 | Rejected or waitlist | Invalid |

**Price boundaries after configuration:**

| Boundary | Value | Expected | Type |
|---|---|---|---|
| Base price only | No add-ons selected | Shows base price | Valid |
| Base + cheapest option | Minimum add-on | Price = base + min option | Valid |
| Base + all max options | Every option at max price tier | Price = base + sum of max options | Valid |
| Price exceeds display limit | Configuration totaling $100,000+ | Displayed correctly, no overflow | Edge |

### 8.3 Decision Table

**Conditions for Add to Cart eligibility:**

| Rule | Required Options Complete | In Stock | Valid Combination | User Authenticated | Action |
|---|---|---|---|---|---|
| R1 | Yes | Yes | Yes | Yes | Add to Cart -- success |
| R2 | Yes | Yes | Yes | No (Guest) | Add to Cart -- success (guest cart) |
| R3 | Yes | No | Yes | Yes | Show "Out of Stock" label |
| R4 | No | Yes | Yes | Yes | "Complete configuration" prompt |
| R5 | Yes | Yes | No | Yes | "Unavailable combination" error |
| R6 | No | No | No | No | Multiple validation errors |

### 8.4 State Transition Testing

**Configuration lifecycle:**

```
┌──────────┐  Select option  ┌──────────────────┐  Complete all  ┌───────────┐  Add to Cart  ┌──────────┐
│  Empty   ├────────────────►│ Partially Config  ├──────────────►│ Fully     ├──────────────►│ In Cart  │
└──────────┘                 └──────┬───────────┘               │ Configured│               └────┬─────┘
                                    │       ▲                   └───────────┘                    │
                                    │       │                                                    │
                                    │  Change option                                    Modify config
                                    │       │                                                    │
                                    └───────┘                                                    ▼
                                                                                          ┌──────────┐
                                                                                          │ Re-config│
                                                                                          └──────────┘
```

| Current State | Event | Next State | Valid? |
|---|---|---|---|
| Empty | Select first option | Partially Configured | Yes |
| Partially Configured | Select another option | Partially Configured | Yes |
| Partially Configured | Complete all required | Fully Configured | Yes |
| Partially Configured | Add to Cart | -- (blocked) | No |
| Fully Configured | Add to Cart | In Cart | Yes |
| Fully Configured | Change an option | Partially Configured | Yes |
| In Cart | Modify configuration | Re-configure | Yes |
| In Cart | Add to Cart again | -- (blocked, already in cart) | No |
| Re-configure | Complete options | Fully Configured | Yes |
| Empty | Add to Cart | -- (blocked) | No |

### 8.5 Pairwise for Configuration UI Testing

**Parameters:**

| Parameter | Values |
|---|---|
| Browser | Chrome, Firefox, Edge |
| Viewport | Desktop, Tablet, Mobile |
| Product Type | Simple Config (2 options), Complex Config (5+ options) |
| Option Display | Dropdown, Swatch, Radio Button |

**Full:** 3 x 3 x 2 x 3 = 54 combinations
**Pairwise reduction:**

| # | Browser | Viewport | Product Type | Option Display |
|---|---|---|---|---|
| 1 | Chrome | Desktop | Simple | Dropdown |
| 2 | Chrome | Tablet | Complex | Swatch |
| 3 | Chrome | Mobile | Simple | Radio Button |
| 4 | Firefox | Desktop | Complex | Radio Button |
| 5 | Firefox | Tablet | Simple | Dropdown |
| 6 | Firefox | Mobile | Complex | Dropdown |
| 7 | Edge | Desktop | Simple | Swatch |
| 8 | Edge | Tablet | Complex | Dropdown |
| 9 | Edge | Mobile | Complex | Swatch |
| 10 | Chrome | Desktop | Complex | Swatch |
| 11 | Firefox | Desktop | Simple | Swatch |
| 12 | Edge | Mobile | Simple | Radio Button |

**Result:** 12 tests instead of 54 (78% reduction).

### 8.6 Error Guessing

| # | Scenario | What Could Break |
|---|---|---|
| EG-1 | Select option, navigate away, return | Configuration state lost if not persisted |
| EG-2 | Rapidly switch between options | UI flicker, price calculation race condition |
| EG-3 | Select option that triggers dependent option change | Dependent dropdown not updated, stale options shown |
| EG-4 | Configure product, add to cart, then admin disables that option | Cart shows invalid configuration on next page load |
| EG-5 | Add configured product to cart, then change store/currency | Price not recalculated for new currency |
| EG-6 | Configure product with very long option values | Text overflow in configuration summary, cart display |
| EG-7 | Open configuration in two browser tabs, submit different configs | Cart contains unexpected configuration |
| EG-8 | Configure product, apply bulk discount coupon | Discount applied to base or configured price inconsistently |

### 8.7 Final Test Case Summary

| Technique | Test Cases Derived | Coverage |
|---|---|---|
| Equivalence Partitioning | 5 | All input partitions for option selection |
| Boundary Value Analysis | 9 | Quantity and price boundaries |
| Decision Table | 6 | All Add to Cart eligibility rules |
| State Transition | 10 | All valid + invalid transitions |
| Pairwise | 12 | Cross-browser/viewport/product type combos |
| Error Guessing | 8 | VC-specific edge cases and race conditions |
| **Total** | **50** | Comprehensive coverage with technique traceability |

Each test case in the final suite should include the technique attribution (e.g., "EP-3", "BVA-5", "DT-R4", "ST-7", "PW-9", "EG-6") for traceability and coverage reporting.
