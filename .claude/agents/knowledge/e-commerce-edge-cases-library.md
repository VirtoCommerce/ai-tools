# E-Commerce QA Edge Cases & Strange User Behavior Library

**Version:** 1.0  
**Last Updated:** March 2026  
**Status:** Living document—add real patterns from your platform

---

## Using This Library

This is a structured reference for:
- **Test case generation** — turn each pattern into test scenarios
- **QA checklists** — verify each category during feature releases
- **Anomaly detection** — identify suspicious user behaviors in logs
- **Coverage planning** — ensure edge cases are represented in your test suite
- **Agentic QA design** — feed into system prompts for autonomous agents

**How to maintain it:**
1. Add new patterns as you discover them in production
2. Mark patterns with `[OBSERVED]` if confirmed on your platform
3. Mark with `[THEORETICAL]` if research-based but not yet seen
4. Update frequency columns when specific cases occur
5. Link to Jira/tickets where these bugs manifested

---

## 1. Checkout & Payment Processing

### 1.1 Payment Method Edge Cases

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Expired card mid-transaction** | User adds card to wallet, time passes, card expires during checkout flow | Low | Payment fails, unclear error message | [THEORETICAL] |
| **Duplicate payment submission** | User clicks "Pay" button twice (slow network, accidental double-click) | Medium | Double charge, order duplication | [OBSERVED] |
| **Card validation mismatch** | Card passes fraud check initially, fails at settlement (zip/CVV mismatch) | Low | Partial authorization, refund needed | [OBSERVED] |
| **Mismatched billing/shipping flags fraud** | User's address changes between page load and submission, flagged as suspicious | Medium | Order held, manual review needed | [OBSERVED] |
| **International card edge case** | 3D Secure/SCA challenges user in non-English, user abandons | Low | Conversion loss | [THEORETICAL] |
| **Split payment across cards** | User adds multiple cards, attempts to split total across them | Low | UX confusion, unclear billing | [THEORETICAL] |
| **Declined then accepted** | Card declined on first attempt, accepted on retry without user action | Low | Confusion about charge status | [OBSERVED] |
| **Rapid card testing** | User tests low-value transaction, then immediately high-value (potential fraud testing pattern) | Low-Medium | False positive fraud flag | [OBSERVED] |

### 1.2 Session & Timeout Issues

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Session timeout at payment** | User fills cart, steps away, session expires during checkout | High | Complete checkout loss, poor UX | [OBSERVED] |
| **Stale cart total** | Cart price changes (sale ends, stock updated) between page load and submission | Medium | User charged different amount | [OBSERVED] |
| **Lost CSRF token** | Form token expires while user fills payment fields | Low | Payment fails mysteriously | [OBSERVED] |
| **Payment processing hangs** | API endpoint slow, user doesn't see confirmation, navigates away | Medium | User thinks no order placed, creates duplicate | [OBSERVED] |
| **Browser back button during payment** | User hits back, returns to cart, can re-submit same payment | Medium | Accidental duplicate order | [OBSERVED] |

### 1.3 Coupon & Discount Stacking

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Coupon expires during checkout** | User applies 24-hour coupon, checkout takes 30 minutes | Low-Medium | Coupon rejected, unclear to user | [OBSERVED] |
| **Gift card + coupon invalid combo** | System doesn't allow combining gift card with percentage discount | Low | Confusing error, user navigates away | [THEORETICAL] |
| **Bulk discount not applying** | User adds 10 items for bulk discount, but system counts them separately by variant | Medium | Wrong price calculation | [OBSERVED] |
| **Free shipping threshold crossed** | User adds item that triggers free shipping; price changes mid-flow | Low-Medium | User expects one total, sees another | [OBSERVED] |
| **Coupon case sensitivity** | System requires exact case but user enters lowercase | Low | Coupon rejected unnecessarily | [OBSERVED] |
| **Coupon for product no longer in cart** | User applies coupon, then removes the coupon-eligible product | Low-Medium | Coupon error or unexpected discount | [THEORETICAL] |
| **First-time buyer coupon on second cart** | User has multiple sessions; second session still applies first-time discount | Low | Revenue loss | [OBSERVED] |

---

## 2. Inventory & Stock Management

### 2.1 Race Conditions & Overselling

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Last item race condition** | Two users simultaneously buy the last unit; one gets order, other gets "out of stock" mid-checkout | Medium | One user blocked unfairly OR oversold | [OBSERVED] |
| **Stock update during add-to-cart** | User adds item with 5 remaining, by checkout only 1 remains | Low-Medium | Quantity mismatch on order | [OBSERVED] |
| **Phantom inventory** | Item shows in stock on listing but "out of stock" in cart | Medium | Abandonment, poor UX | [OBSERVED] |
| **Oversold due to async delay** | Inventory decrement is async; two checkouts both succeed before decrement completes | Low-High | Overselling, fulfillment crisis | [OBSERVED] |
| **Pre-order treated as in-stock** | Pre-order items appear as immediately available; user gets surprised shipping delay | Low-Medium | Customer frustration | [OBSERVED] |

### 2.2 Stock Depletion Notifications

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **"Only 1 left" nagware** | System shows warning but doesn't actually reserve stock | Medium | User sees 1 left, checkout succeeds despite stock gone | [OBSERVED] |
| **Stale inventory cache** | User sees product in stock, but backend cache hasn't synced | Low-Medium | Order placed for out-of-stock item | [THEORETICAL] |
| **Partial out-of-stock** | Multi-SKU cart: user ordered 3 units, only 2 in stock, system doesn't clarify which remains | Low-Medium | Confusing notification, support tickets | [OBSERVED] |

### 2.3 Pricing Timing Issues

| Pattern | Description | Frequency | Impact | Status |
|---------|=========|-----------|--------|--------|
| **Price changes between cart and checkout** | Sale ends, price tiers shift, inventory moves user into different pricing | Medium | User sees $20, charged $25 | [OBSERVED] |
| **Flash sale conflict** | Item on flash sale; user adds to cart right at sale end | Low-Medium | Charged non-sale price | [OBSERVED] |
| **Dynamic pricing not recalculated** | Cart shows old price, checkout shows new price without warning | Low-Medium | User surprises at final price | [OBSERVED] |
| **Tax/shipping recalculated unexpectedly** | User views cart at 11:55 PM, tax zone updates at midnight (new tax rates) | Low | Charged more tax than expected | [THEORETICAL] |

---

## 3. Search & Discovery

### 3.1 No Results & Edge Cases

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Typo returns zero results** | User searches "dres" instead of "dress"; system returns nothing | High | User leaves, doesn't see alternatives | [OBSERVED] |
| **Overly specific filter combo** | User filters: "Size 28W x 34L AND Color Plaid AND Organic Cotton" → 0 results exist | Medium | Dead-end, user frustrated | [OBSERVED] |
| **"No results" page has no guidance** | User hits dead search, no "did you mean" or category suggestions | High | Abandonment | [OBSERVED] |
| **Search pagination broken on last page** | User clicks page 2, sees products, page 3 shows "no results" but page 3 exists | Low-Medium | Confusing UX, lost products | [THEORETICAL] |
| **Category exclusions too aggressive** | Filtering by "vegetarian" excludes items that mention "may contain traces of..." | Low-Medium | User misses relevant products | [THEORETICAL] |

### 3.2 Filter & Sort Edge Cases

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Sort order resets on filter** | User sorts by "price: low to high", applies color filter, sort resets to default | Medium | Frustration, poor UX | [OBSERVED] |
| **Price range filter boundaries** | User filters $10-$20, but item at exactly $20.00 is excluded | Low | Edge case precision issue | [OBSERVED] |
| **Multi-select filter AND vs OR confusion** | User selects "Color: Red OR Blue" but system interprets as "Color: Red AND Blue" (impossible) | Low | No results, user confusion | [THEORETICAL] |
| **Filter persists incorrectly** | User applies filter, navigates to product detail, back to search—filter changed | Low-Medium | Unexpected product list | [OBSERVED] |

### 3.3 Search Quality Issues

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Exact name search ranks low** | User searches "Organic Cotton T-Shirt Blue," system ranks wrong variants first | Low-Medium | User scrolls, might miss exact product | [OBSERVED] |
| **Brand name not indexed** | Product says "Made by Nike" but search doesn't index; searching "Nike" returns nothing | Low | Lost conversions | [THEORETICAL] |
| **Synonym failure** | User searches "couch," system only indexes "sofa" | Low | Zero results | [OBSERVED] |
| **Search returns deleted products** | Cached search result points to archived product | Low | 404 or confusing redirect | [THEORETICAL] |

---

## 4. User Account & Authentication

### 4.1 Email & Identity Variations

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Gmail dot notation** | User creates account with `john.doe@gmail.com`, later logs in with `johndoe@gmail.com` | Low-Medium | Duplicate accounts, support burden | [OBSERVED] |
| **Email case sensitivity** | System stores email as lowercase but user's provider treats as case-sensitive | Low | Login failures, confusion | [THEORETICAL] |
| **Plus-addressing ignored** | User signs up with `john+shop@gmail.com`, system strips the `+shop` part | Low | Unintended account merge | [THEORETICAL] |
| **Temporary email address** | User signs up with temp email, confirms, then email expires; can't reset password | Low | Account locked out | [OBSERVED] |
| **Email domain typo at signup** | User types `gmai.com` instead of `gmail.com`, can't receive confirmation | Low | Account never activated | [OBSERVED] |

### 4.2 Password & Authentication Edge Cases

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Brute force password attempts** | Attacker attempts 100+ login tries in 1 minute | Low-High | Security breach risk | [OBSERVED] |
| **Password with leading/trailing spaces** | User enters `password ` with space; system trims; later login fails | Low | Locked out, support needed | [OBSERVED] |
| **Unicode/special character password** | User's password has emoji or non-ASCII; system doesn't validate encoding | Low | Login failures | [THEORETICAL] |
| **Credential stuffing** | Attacker uses leaked password list across your platform | Medium | Account takeover risk | [OBSERVED] |
| **Account lockout mechanism too strict** | User locked out after 3 failed attempts; no unlock option visible | Low | Support tickets | [OBSERVED] |

### 4.3 Account Takeover & Impersonation

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Email verification bypass** | User changes email without verifying new email | Low-High | Account takeover risk | [THEORETICAL] |
| **Session fixation** | Attacker forces user to use attacker's session ID | Low | Account access | [THEORETICAL] |
| **Weak recovery questions** | "What's your favorite color?" used as password reset verification | Low | Easy account takeover | [THEORETICAL] |
| **Same OTP reused multiple times** | User doesn't clear OTP; it remains valid indefinitely | Low-Medium | Multi-use vulnerability | [OBSERVED] |
| **Geographic impossible travel** | User logs in UK at 10 AM, then US at 10:05 AM (physically impossible) | Low | Should flag as fraud | [OBSERVED] |

### 4.4 Guest vs. Registered Checkout

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Guest checkout then registration conflict** | User checks out as guest with email `john@example.com`, then tries to register with same email | Medium | Unclear error, duplicate account risk | [OBSERVED] |
| **Guest data doesn't transfer to account** | User checks out as guest, creates account post-purchase; account has no order history | Low-Medium | Support tickets | [THEORETICAL] |
| **Account creation forces new password** | User tries to register after guest checkout with their email; system forces password reset | Low | Friction, abandonment | [OBSERVED] |

---

## 5. User Behavior Anomalies & Bot-Like Patterns

### 5.1 Rapid & Repetitive Actions

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Bulk add-to-cart in seconds** | User adds 100+ items in <10 seconds (bot behavior) | Low | Inventory hoarding, reseller activity | [OBSERVED] |
| **Rapid successive purchases** | User places 5 orders in 3 minutes with different cards | Low-Medium | Fraud risk or legitimate power buyer? | [OBSERVED] |
| **Testing small purchases before large** | User buys $5 item, then $500 item minutes later | Low-Medium | Card testing pattern or legitimate? | [OBSERVED] |
| **Repeated failed checkout attempts** | User attempts checkout 10+ times with same cart, fails each time | Medium | Legitimate user stuck OR attacker | [OBSERVED] |

### 5.2 Geographic & Temporal Anomalies

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Impossible travel velocity** | User logs in from UK, purchase from US 30 minutes later | Low-Medium | Fraud indicator | [OBSERVED] |
| **Off-hours purchasing spike** | User who normally buys at 9 AM suddenly orders at 3 AM | Low | Potential account takeover | [OBSERVED] |
| **VPN/Proxy detection** | User's IP matches known VPN range but purchase is legitimate | Low-Medium | False positive fraud block | [OBSERVED] |
| **Shipping to unusual location** | User with US IP ships to Somalia; product is electronics | Low-Medium | Fraud risk vs. legitimate international purchase | [OBSERVED] |

### 5.3 Cart & Browsing Behavior

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Abandoned high-value cart** | User adds $5,000 in items, leaves cart for 2 weeks | Low-Medium | Legitimate savings or window shopping? | [OBSERVED] |
| **Wishlist churn** | User adds/removes same item 50+ times over days | Low | Window shopper, price monitoring | [OBSERVED] |
| **Price comparison pattern** | User adds identical products from different vendors to cart | Low | Comparison shopping | [OBSERVED] |
| **Rapid category browsing** | User clicks through 20 categories in 2 minutes without viewing products | Low-Medium | Bot scraping OR confused user | [OBSERVED] |
| **Cart manipulation** | User sets quantity to negative number or absurdly large number (999999) | Low | Input validation issue | [OBSERVED] |

### 5.4 Return & Refund Abuse

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **"Wardrobing" — purchase, wear, return** | User buys expensive clothing, wears it (with tags still on), returns for refund | Medium | Revenue loss, difficult to detect | [OBSERVED] |
| **Serial returner** | User returns 80%+ of purchases | Low-Medium | Policy abuse or quality issue? | [OBSERVED] |
| **Return without shipping back** | User initiates return but never ships item back; system closes return without verification | Low-Medium | Inventory loss | [OBSERVED] |
| **Refund to different payment method** | User paid with Card A, requests refund to Card B (potential fraud scheme) | Low | Refund fraud | [OBSERVED] |

---

## 6. Data & Integration Issues

### 6.1 Stock Sync Problems

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Third-party warehouse stock lag** | Warehouse system updates every 30 mins; orders placed in-between lead to overselling | Medium | Fulfillment issues | [OBSERVED] |
| **Inventory count off-by-one** | System shows 1 unit in stock; actually 0 (counting error during restock) | Low-Medium | Backorder surprises | [OBSERVED] |
| **Return not credited to inventory** | Customer returns item; system never re-adds stock | Low-Medium | Inventory undercount | [OBSERVED] |

### 6.2 Tax & Shipping Calculation Errors

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Incorrect sales tax bracket** | User in state X charged tax for state Y | Low | Refund needed, support | [OBSERVED] |
| **Free shipping threshold edge case** | Shipping cost calculated before coupon applied, then threshold missed | Low-Medium | Unexpected charge | [OBSERVED] |
| **International shipping disabled mid-checkout** | Shipping option disappears after address entry | Low | Checkout failure | [THEORETICAL] |
| **Duty/tax calculated in addition to shipping** | User charged unexpected duties on top of quoted price | Low | Customer shock | [THEORETICAL] |

### 6.3 Address Validation Issues

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Autocomplete returns wrong address** | User types "Main St, Springfield" and autocomplete suggests wrong state's Main St | Low-Medium | Misdelivery | [OBSERVED] |
| **Validation rejects valid addresses** | Apartment addresses with "/" or "#" rejected by strict regex | Low-Medium | User can't complete order | [OBSERVED] |
| **Zip code mismatch with city** | User enters real address but zip code doesn't match city; validation fails | Low | Checkout blocked | [OBSERVED] |
| **International address breaks system** | Address format for Japan/UK doesn't fit US form fields | Low-Medium | Can't ship internationally | [THEORETICAL] |

---

## 7. Frontend & UI Edge Cases

### 7.1 Browser & Device Issues

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Mobile viewport checkout misalignment** | Payment button hidden below fold; user thinks button doesn't exist | Low-Medium | Abandonment | [OBSERVED] |
| **Autocomplete overwrites form fields** | Browser autocomplete fills in wrong address; user doesn't notice | Low-Medium | Wrong shipping address | [OBSERVED] |
| **JavaScript disabled** | User has JS disabled; form submits but nothing happens | Low | 404 or confusing error | [OBSERVED] |
| **Cached page stale data** | User back-buttons to checkout page; sees old prices/inventory | Low-Medium | Checkout with stale state | [OBSERVED] |
| **Third-party script blocking** | Ad blocker or privacy tool blocks payment script | Low-Medium | Silent payment failure | [OBSERVED] |

### 7.2 Form Input Edge Cases

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Paste into form field triggers validation twice** | Paste + change event fires validation before user expects | Low | Confusing error states | [OBSERVED] |
| **Special characters in name field** | User's name "O'Brien" or "Müller" rejected by regex | Low | User can't complete order | [OBSERVED] |
| **Numeric field accepts leading zeros** | User types "01234" for house number; system treats as octal | Low | Address validation issue | [THEORETICAL] |
| **Required field validation off-screen** | Error message for required field not visible; user thinks form is complete | Low-Medium | Stuck on checkout | [OBSERVED] |

### 7.3 Loading States & Race Conditions

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Double-click checkout button** | User sees slow load, clicks "Place Order" twice | Medium | Duplicate order | [OBSERVED] |
| **Loading spinner doesn't disable button** | User clicks button during loading; multiple requests sent | Low-Medium | Duplicate order/payment | [OBSERVED] |
| **Modal doesn't prevent interaction** | User clicks element behind loading modal; unexpected action triggered | Low | Confusing behavior | [OBSERVED] |

---

## 8. Content & Product Data Issues

### 8.1 Product Information Problems

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Misleading product images** | Product image shows different color than "color: blue" field | Low-Medium | Wrong product ordered | [OBSERVED] |
| **Missing critical product info** | Size chart missing or links to wrong chart | Low-Medium | Returns, customer frustration | [OBSERVED] |
| **Contradictory descriptions** | Product description says "waterproof" but details say "water-resistant" | Low-Medium | Customer disappointment | [OBSERVED] |
| **Out-of-date product details** | Listing shows old SKU, old price, or discontinued info | Low | Confusing purchase | [OBSERVED] |

### 8.2 Variant & SKU Issues

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Hidden variant SKU** | Product listing shows "Blue" as only option; system has Blue-Small, Blue-Large but hides Large | Low-Medium | User thinks size unavailable | [OBSERVED] |
| **Variant price not updating** | Main product price changes; variant prices cached incorrectly | Low | Price inconsistency | [OBSERVED] |
| **Incorrect variant grouped** | Variant "Blue S" shown under wrong parent product | Low | Wrong item ordered | [OBSERVED] |

---

## 9. Review & Rating System

### 9.1 Fake & Manipulated Reviews

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Coordinated fake positive reviews** | Suspicious cluster of 5-star reviews within same hour from new accounts | Low-Medium | Trust erosion | [OBSERVED] |
| **Revenge negative reviews** | User leaves 1-star without purchasing (proof: no order linked) | Low-Medium | Unfair rating | [OBSERVED] |
| **Review from competitor account** | Review text contains competitor product name promoting alternative | Low | Trust issue | [OBSERVED] |
| **Incentivized reviews not disclosed** | Seller sends coupon code post-purchase with implicit expectation of 5-star review | Low-Medium | Fake review violation | [OBSERVED] |

### 9.2 Review Display Issues

| Pattern | Description | Frequency | Impact | Status |
|---------|=========|-----------|--------|--------|
| **Low rating hides high reviews** | Product sorted by "Helpful" but negative reviews show first | Low-Medium | Biased perception | [OBSERVED] |
| **Review count doesn't match displayed reviews** | Product says "47 reviews" but only 12 are visible | Low | User sees fewer reviews than exist | [OBSERVED] |
| **Helpful vote manipulation** | Single reviewer marks all 1-star reviews as "Helpful" (voting attack) | Low-Medium | Skewed perception | [OBSERVED] |

---

## 10. Performance & System Issues

### 10.1 Timeout & Slow Load Edge Cases

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Checkout API timeout** | Payment processing takes >30s; user thinks request failed, retries | Medium | Duplicate charges, refund hassle | [OBSERVED] |
| **Image load timeout on mobile** | Product images fail on slow network; user doesn't see item, buys wrong variant | Low-Medium | Wrong product | [OBSERVED] |
| **Stale API cache response** | API returns cached inventory count from 1 hour ago | Low-Medium | Overselling | [OBSERVED] |

### 10.2 Error Handling Issues

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Vague error message on payment failure** | Error says "Transaction Declined" without reason (declined by processor vs. fraud block) | Medium | User confused, might retry same card | [OBSERVED] |
| **Silent failure on form submission** | Form submits, nothing happens, no error displayed | Low-Medium | User resubmits, duplicate created | [OBSERVED] |
| **Stack trace exposed in error page** | System error reveals internal code/database names to user | Low | Security issue | [THEORETICAL] |

---

## 11. Analytics & Tracking Issues

### 11.1 Conversion Tracking Problems

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Conversion counted multiple times** | User refreshes confirmation page; conversion pixel fires again | Low-Medium | Inflated conversion metrics | [OBSERVED] |
| **No conversion on failed payment** | User sees confirmation before payment actually settles; payment fails later | Low-Medium | False positive conversions | [OBSERVED] |
| **Cross-domain tracking broken** | User navigates between subdomains; session lost mid-checkout | Low | Incomplete conversion data | [OBSERVED] |

---

## 12. International & Multi-Currency Edge Cases

### 12.1 Currency & Localization

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Currency conversion timing** | User adds item at $50, checkout converts at different exchange rate (now $52) | Low-Medium | Unexpected charge | [OBSERVED] |
| **Language doesn't match locale** | User in France sees English site; address validation expects English format | Low | UX friction | [OBSERVED] |
| **Missing currency symbol** | Price displays as "50" without "$"; user in another currency confused | Low | Confusion | [OBSERVED] |

### 12.2 International Shipping & Taxes

| Pattern | Description | Frequency | Impact | Status |
|---------|=========|-----------|--------|--------|
| **Shipping to restricted country** | User ships to country under trade sanctions; order placed but can't ship | Low-High | Legal issue | [THEORETICAL] |
| **VAT/GST calculation error** | International order charged wrong tax percentage | Low | Audit issue | [OBSERVED] |
| **Customs duty not disclosed** | User shocked by duty fee upon delivery | Low-Medium | Customer complaints | [THEORETICAL] |

---

## 13. Business Logic & Workflow Edge Cases

### 13.1 Order Fulfillment Issues

| Pattern | Description | Frequency | Impact | Status |
|---------|=========|-----------|--------|--------|
| **Partial order fulfillment not communicated** | User ordered 5 items; 3 ship today, 2 ship later; user unaware | Low-Medium | Support tickets, confusion | [OBSERVED] |
| **Backorder handling unclear** | System accepts backorder but shipping date estimate is wrong | Low-Medium | Customer frustration | [OBSERVED] |
| **Order cancellation after partial ship** | User cancels order; one unit already shipped; system in inconsistent state | Low | Logistics chaos | [OBSERVED] |

### 13.2 Subscription & Recurring Billing

| Pattern | Description | Frequency | Impact | Status |
|---------|=========|-----------|--------|--------|
| **Subscription renewal fails silently** | Card declines at renewal; user not notified; account suspended without warning | Medium | Service interruption, support burden | [OBSERVED] |
| **Cancel subscription still charges** | User cancels but next billing date still occurs | Low-Medium | Refund needed | [OBSERVED] |
| **Proration calculation wrong** | User cancels mid-month; proration calculation doesn't match what user expects | Low | Billing dispute | [OBSERVED] |

### 13.3 Loyalty & Points Edge Cases

| Pattern | Description | Frequency | Impact | Status |
|---------|=========|-----------|--------|--------|
| **Points not credited after purchase** | User completes purchase; loyalty points never appear | Low-Medium | Support tickets | [OBSERVED] |
| **Expired points still redeemable** | User tries to redeem points that expired; system allows it | Low | Policy violation | [OBSERVED] |
| **Double-counting bonus points** | Bonus points for referral AND for purchase both applied on same order | Low | System error | [OBSERVED] |

---

## Appendix A: How to Add Patterns

### Template for New Edge Cases

```markdown
### [Category] [Specific Issue]

| Pattern | Description | Frequency | Impact | Status |
|---------|=========|-----------|--------|--------|
| **Pattern Name** | What exactly happens | Low/Medium/High | Business/User impact | [OBSERVED] or [THEORETICAL] |
```

**Frequency Guidelines:**
- **Low**: < 1 per month
- **Medium**: 1-10 per month
- **High**: > 10 per month or continuous

**Impact Classification:**
- **Revenue**: Direct financial loss
- **Support**: Increases support burden
- **UX**: User frustration, abandonment
- **Security**: Fraud, data, compliance
- **Data**: Inventory, analytics, integrity

### When to Update

- After production incidents
- During post-mortems
- During QA regression findings
- From customer support tickets
- From user analytics anomalies

---

## Appendix B: Linking to Test Cases

Once you have this library, create Jira/TestRail structure:

```
Epic: Edge Case Coverage
  Story: Checkout Payment Edge Cases
    Test Case 1: Expired card mid-transaction → [LINK to library: 1.1]
    Test Case 2: Duplicate payment submission → [LINK to library: 1.1]
    Test Case 3: Session timeout at payment → [LINK to library: 1.2]
  Story: Inventory Race Conditions
    Test Case 1: Last item race condition → [LINK to library: 2.1]
```

This creates traceability between library patterns and actual test execution.

---

## Appendix C: Using This for Agentic QA

When you build your autonomous QA agent, feed it this library structure:

### System Prompt Layer: Domain Knowledge

```
You are a QA agent for e-commerce checkout systems.
Known edge case patterns (by category):

1. Checkout & Payment:
   - Duplicate submission (user clicks button twice)
   - Session timeout scenarios
   - Coupon expiration timing
   
2. Inventory:
   - Race conditions on last item
   - Stock depletion notifications
   - Dynamic pricing recalculation

[... continue for all categories ...]

When testing any flow, check these patterns in order of likelihood.
```

### Test Generation Prompt

```
Given the payment checkout flow, generate test cases that cover:
- All patterns from section 1 (Checkout & Payment Processing)
- Edge cases from 5.1 (Rapid Actions) — bot-like behavior
- Error handling from 10.2

Output as: [PATTERN NAME] → [Test Case] → [Expected Result] → [Assertion]
```

---

---

## 14. Virto Commerce Platform-Specific Patterns

VC-specific patterns observed on the platform. Each entry maps to a business logic invariant (`BL-*` from `business-logic.md`) and an ECL section where analogous generic patterns exist.

### 14.1 GraphQL xAPI Error Patterns

| Pattern | Description | Frequency | Impact | BL Invariant | ECL Ref | Status |
|---------|-------------|-----------|--------|-------------|---------|--------|
| **Silent errors[] array** | xAPI mutations (addItem, createOrderFromCart) return HTTP 200 but include non-empty `errors[]` array — agent sees 200 and misses the failure | High | Test false-positive, missed bugs | BL-CART-001, BL-ORD-001 | ECL-10.2 | [OBSERVED] |
| **Partial cart update** | `changeCartItemQuantity` returns 200 but qty not actually changed in `cart` response — stale response body | Medium | Wrong quantity in order | BL-CART-002 | ECL-2.1 | [OBSERVED] |
| **Missing storeId/cultureName** | xAPI query without required context params returns empty result or wrong catalog — agent reads wrong prices | Medium | Wrong product data in test | BL-PRICE-005 | ECL-12.1 | [OBSERVED] |
| **addItem with parent SKU** | Agent adds parent product SKU instead of variant SKU — API accepts it silently, cart shows configurable parent without variation | Low-Medium | Wrong item ordered | BL-CAT-002 | ECL-8.2 | [OBSERVED] |

### 14.2 Search Index Lag (Elasticsearch)

| Pattern | Description | Frequency | Impact | BL Invariant | ECL Ref | Status |
|---------|-------------|-----------|--------|-------------|---------|--------|
| **Price change not reflected** | Admin updates price → storefront still shows old price for 30-60s until re-index completes | High | Price test fails spuriously | BL-PRICE-001 | ECL-2.3 | [OBSERVED] |
| **New product invisible** | Product published in admin, agent searches immediately — product not in results because index job queued | Medium | Product not found in test | BL-SEARCH-001 | ECL-3.3 | [OBSERVED] |
| **Out-of-stock item still shown** | Inventory depleted, but search results still show item as available for 30-60s | Medium | Add-to-cart fails unexpectedly | BL-CART-001 | ECL-2.1 | [OBSERVED] |
| **Facet count stale** | Filter shows "Color: Blue (12)" but actual result count differs after price/stock changes | Low-Medium | Misleading filter, zero results on click | BL-SEARCH-001 | ECL-3.2 | [OBSERVED] |

**Agent rule:** After any catalog/price/inventory change in admin, wait 60s before asserting storefront reflects the change.

### 14.3 B2B Organization Context

| Pattern | Description | Frequency | Impact | BL Invariant | ECL Ref | Status |
|---------|-------------|-----------|--------|-------------|---------|--------|
| **Cart isolation loss** | Agent switches org via account selector — previous org's cart persists or bleeds into new org cart | Medium | Wrong cart in checkout | BL-ORG-002 | ECL-5.3 | [OBSERVED] |
| **Org context missing after login** | User logs in, `me.organization` is null in first GraphQL request — populated after second call or page refresh | Medium | B2B features absent on first load | BL-ORG-002 | ECL-4.2 | [OBSERVED] |
| **Company member role not applied** | New org member invited, but role permissions (Buyer vs Manager vs Admin) not enforced immediately — role applied after session refresh | Low-Medium | Feature access test incorrect | BL-ORG-003 | ECL-4.3 | [OBSERVED] |
| **Multi-org ship-to conflict** | User with 2 orgs — ship-to addresses from Org A visible when acting as Org B | Low | Wrong address options shown | BL-ORG-002 | ECL-6.3 | [OBSERVED] |
| **Addresses link visible for org user** | `Addresses` link in account sidebar hidden for org users — expected behavior, not a bug | High (false bug) | False-positive bug reports | BL-ORG-001 | — | [OBSERVED] |

### 14.4 Price List & Currency Edge Cases

| Pattern | Description | Frequency | Impact | BL Invariant | ECL Ref | Status |
|---------|-------------|-----------|--------|-------------|---------|--------|
| **Currency switch shows "unavailable"** | No price list for selected currency → product shows as unavailable — correct behavior but confusing | Medium | Test confusion (pass vs fail) | BL-PRICE-005 | ECL-12.1 | [OBSERVED] |
| **Tier price boundary off-by-one** | Price tier at qty=10 doesn't activate at exactly 10 — activates at 11 | Low | Revenue loss at boundary | BL-PRICE-004 | ECL-2.3 | [OBSERVED] |
| **Stale price in mini-cart** | Price updated in admin → user's open mini-cart still shows old price even after addItem | Medium | Overcharge/undercharge | BL-PRICE-001 | ECL-1.3 | [OBSERVED] |
| **Tax recalculated at wrong step** | Tax shown in cart, recalculated at checkout when shipping address added — user sees different total | Medium | User surprise, cart abandonment | BL-PRICE-002 | ECL-6.2 | [OBSERVED] |

### 14.5 Configurable Product & Variation Edge Cases

| Pattern | Description | Frequency | Impact | BL Invariant | ECL Ref | Status |
|---------|-------------|-----------|--------|-------------|---------|--------|
| **Add to Cart enabled before selection** | B2C variation product: 'Add to Cart' clickable before user selects any option — adds parent SKU | Medium | Wrong item in cart | BL-CAT-002 | ECL-8.2 | [OBSERVED] |
| **VirtoFrontend_UI_Layout property absent** | B2C layout not shown because property missing from product — shows B2B table instead | Low-Medium | Wrong layout in test | BL-CAT-002 | ECL-8.1 | [OBSERVED] |
| **Image not switching on variant select** | Variant image URL present in API response but main PDP image doesn't update on option click | Low | Visual confusion, wrong variant ordered | BL-CAT-002 | ECL-8.2 | [OBSERVED] |
| **Unavailable combo not blocked** | Two options selected forming an out-of-stock combination — 'Add to Cart' stays enabled, error only at API | Low-Medium | Order for unavailable variant | BL-CAT-002 | ECL-2.1 | [OBSERVED] |

### 14.6 Payment Processor Differences (VC-specific)

| Pattern | Description | Frequency | Impact | BL Invariant | ECL Ref | Status |
|---------|-------------|-----------|--------|-------------|---------|--------|
| **CyberSource on cart page** | CyberSource payment form renders directly on `/cart` — NOT on `/checkout/payment`. Agent that navigates to `/checkout/payment` first will miss the form | High | Test never reaches payment | BL-PAY-001 | ECL-1.1 | [OBSERVED] |
| **Skyflow/AuthorizeNet after Place Order** | Skyflow, Authorize.Net, DataTrance require clicking 'Place Order' first — redirects to `/checkout/payment` | High | Agent tries wrong page | BL-PAY-001 | ECL-1.1 | [OBSERVED] |
| **Payment iframe blocked by ad-blocker** | Payment script (CyberSource/Skyflow) blocked silently — form appears blank, no error shown | Low-Medium | Silent payment failure | BL-PAY-001 | ECL-7.1 | [OBSERVED] |
| **Double-click Place Order** | Slow connection: user/agent clicks 'Place Order' twice — two orders created | Medium | Duplicate order | BL-ORD-001 | ECL-7.3 | [OBSERVED] |

### 14.7 Background Job Timing (Hangfire)

| Pattern | Description | Frequency | Impact | BL Invariant | ECL Ref | Status |
|---------|-------------|-----------|--------|-------------|---------|--------|
| **Order confirmation email delay** | Email sent via Hangfire — may arrive 5-30s after order confirmation page shown | High | Email assertion fails if checked immediately | BL-ORD-002 | ECL-10.1 | [OBSERVED] |
| **Search reindex job queued** | Reindex triggered by catalog change but job queued behind other jobs — lag exceeds 60s under load | Low-Medium | Price/product not visible longer than expected | BL-SEARCH-001 | ECL-2.3 | [OBSERVED] |
| **Inventory sync job** | Inventory decrement happens via background job — brief window where item shows as in-stock post-purchase | Low | Oversell window | BL-CART-001 | ECL-2.1 | [OBSERVED] |

---

## Appendix D: ECL → Business Logic Invariant Cross-Reference

Quick lookup: which ECL sections map to which BL-* invariants in `business-logic.md`.

| ECL Section | Description | BL Invariants |
|-------------|-------------|---------------|
| ECL-1.1 Payment Methods | Payment form location, processor differences | BL-PAY-001 |
| ECL-1.2 Session & Timeout | Session expiry during checkout | BL-CHK-001 |
| ECL-1.3 Coupon & Discount | Stacking, expiry, case sensitivity | BL-PRICE-001, BL-PRICE-006 |
| ECL-2.1 Race Conditions | Overselling, last-item conflict | BL-CART-001 |
| ECL-2.3 Pricing Timing | Stale cart totals, flash sale conflict | BL-PRICE-001, BL-PRICE-004 |
| ECL-3.1 No Results | Dead-end search, zero results | BL-SEARCH-001 |
| ECL-3.2 Filter & Sort | Sort reset, filter persistence | BL-SEARCH-001 |
| ECL-4.1 Email & Identity | Email variations, typos | BL-AUTH-001 |
| ECL-4.2 Password & Auth | Brute force, spaces, lockout | BL-AUTH-001, BL-AUTH-002 |
| ECL-4.3 Account Takeover | Session fixation, OTP reuse | BL-AUTH-002 |
| ECL-4.4 Guest vs Registered | Conflict on same email | BL-AUTH-001 |
| ECL-5.3 Cart & Browsing | Quantity manipulation (negative/huge) | BL-CART-003 |
| ECL-6.2 Tax & Shipping | Threshold edge case, recalculation | BL-PRICE-002 |
| ECL-6.3 Address Validation | Autocomplete, special chars | BL-CHK-001 |
| ECL-7.3 Loading States | Double-click checkout, spinner | BL-ORD-001 |
| ECL-8.2 Variant & SKU | Hidden variants, price caching | BL-CAT-002 |
| ECL-10.2 Error Handling | Silent failure, vague messages | BL-ORD-001 |
| ECL-11.1 Conversion Tracking | Duplicate pixel fire on refresh | BL-ORD-001 |
| ECL-12.1 Currency | No price list → unavailable | BL-PRICE-005 |

**End of Library**
