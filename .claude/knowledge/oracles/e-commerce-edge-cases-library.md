---
applicability: reference
applicability_rationale: "14 generic ECL chapters (1-13, 15; universal) + 1 VC-specific chapter (14, 10 subsections). File-level classification is reference because the VC-specific chapter is intermixed with the generic ones in document order; future refactor: split into universal + VC-specific files."
---

# E-Commerce QA Edge Cases & Strange User Behavior Library

**Version:** 1.1  
**Last Updated:** August 2026 (oracle audit — deletions, drift fixes, and new sections; see audit history for the verdict trail)  
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

*(Low-value-then-high-value card-testing behavior is covered once, at §5.1, to avoid duplicating the same signal under two chapters.)*

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

### 1.4 Layout Shift & Hover-Induced Displacement

*(Cross-cutting layout-stability pattern — filed in this chapter's number range to match established test-suite citations rather than under "Checkout & Payment." Governed by `BL-UI-003` in `business-logic.md`.)*

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Hover triggers layout shift** | Hovering a card/button changes its border/padding using a layout-affecting property (border width, margin) instead of `outline` or a pre-reserved transparent border, pushing neighboring elements | Medium | Visual jank, perceived instability, CLS penalty | [OBSERVED] |
| **State change reflows siblings** | A component's error/active/expanded state adds height without reserving space in the collapsed state, so appearing/disappearing content shifts everything below it | Medium | Misclicks on the shifted target, poor UX | [OBSERVED] |

### 1.5 Spacing & Design-Token Compliance

*(Governed by `BL-UI-002`. The reference scale is the DERIVED design-system spacing grid, kept in sync via `npm run tokens:sync` — never a hardcoded 4px/8px multiple assumption.)*

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Off-grid spacing** | A component uses a padding/margin/gap value that isn't one of the design system's declared spacing steps | Low | Visual inconsistency across the storefront | [OBSERVED] |
| **Audit tool hardcodes a stale grid** | A layout-audit script embeds its own copy of the spacing scale instead of deriving it from the live token source, flagging conforming components as violations after a design refresh | Low | False-positive test failures, eroded trust in the check | [OBSERVED] |

### 1.6 Overflow & Viewport Scroll

*(Governed by `BL-UI-004`. Applies at both fixed breakpoints and the fluid bands between them.)*

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Horizontal scroll at narrow viewports** | A fixed-width element or unwrapped content forces `documentElement.scrollWidth` beyond the viewport at mobile widths | Medium | Broken mobile layout, content clipped or requiring sideways scroll | [OBSERVED] |
| **Overflow only in the fluid band between fixed breakpoints** | A layout that passes at common fixed widths (375/768/1024/1280/1920) overflows only in an untested intermediate width, because a content block's own breakpoint doesn't align with the test's sampled widths | Low-Medium | Real users on in-between viewport widths see a bug the standard breakpoint sweep misses | [OBSERVED] |

### 1.7 Alignment in Horizontal Groups

*(Governed by `BL-UI-005`.)*

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Row height parity broken** | Cards or controls in the same visual row don't share height within a small tolerance, because one contains more content than its siblings and the container doesn't equalize | Low-Medium | Ragged grid, unprofessional appearance | [OBSERVED] |

### 1.8 Touch Target Sizing

*(Governed by `BL-UI-006`. Two tiers apply: below 24×24px fails WCAG 2.2 SC 2.5.8 (AA); 24-44px is a WARN under SC 2.5.5 (AAA) where the design system intentionally ships compact controls.)*

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Touch target below the AA floor on mobile** | An interactive control (icon button, chip, checkbox) renders smaller than 24×24px at mobile viewport widths | Medium | Missed taps, accessibility violation | [OBSERVED] |
| **Adjacent small targets have no spacing buffer** | Two small controls sit close enough that a touch can't reliably distinguish them, even if each individually clears the size floor | Low | Accidental wrong-control activation | [OBSERVED] |

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

*(Impossible-travel-velocity login patterns are covered once, at §5.2, to avoid duplicating the same signal under two chapters.)*

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

### 6.4 File Upload & Import Validation Errors

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Empty file accepted or crashes silently** | A 0-byte upload (content import, CSV catalog import, asset upload) is submitted; the importer either proceeds with an empty dataset with no warning, or throws an unhandled error instead of a validation message | Low-Medium | Confusing failure, no actionable feedback | [OBSERVED] |
| **Malformed content passes the extension check** | A file renamed to match the expected extension (e.g. plain text renamed to `.json`) is accepted by an extension-only check, then fails deep in parsing with a raw/technical error | Low-Medium | Stack-trace-like error surfaced to an admin user | [OBSERVED] |
| **Oversized file has no pre-upload guard** | A file well beyond the practical import size is accepted by the picker and only rejected (or times out) after a full upload round-trip | Low | Wasted upload time, unclear size limit | [OBSERVED] |
| **Partial import on validation failure** | One invalid record/row in an otherwise-valid import file aborts the whole import instead of skipping the bad record and importing the rest, or the reverse — a partial import commits with no indication which records failed | Low-Medium | Data loss or unclear import state | [THEORETICAL] |

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

### 7.4 Mobile & Responsive Layout Edge Cases

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Above-the-fold element hidden at narrow widths** | A logo, CTA, or nav control that renders correctly on desktop is clipped, overlapped, or pushed off-screen at common mobile widths (e.g. 375px) | Medium | Branding/functional element invisible to mobile users | [OBSERVED] |
| **Hamburger menu content not fully enumerated by testing** | The mobile nav collapses into a hamburger menu whose contents differ from the desktop mega-menu (fewer/reordered items), and a test pass that only checks the desktop nav misses regressions in the collapsed version | Medium | Broken/incomplete mobile navigation ships undetected | [OBSERVED] |
| **Cross-browser rendering divergence on mobile** | The same responsive layout renders correctly in one mobile browser engine (e.g. Safari iOS) but breaks in another (e.g. Chrome Android) — vendor-prefixed CSS, viewport unit handling, or safe-area-inset differences | Low-Medium | Browser-specific mobile bugs missed by a single-engine test pass | [OBSERVED] |
| **Orientation change loses in-progress state** | Rotating the device between portrait and landscape mid-flow (e.g. mid-checkout form fill) resets scroll position, collapses an expanded section, or drops unsaved input | Low | Frustration, potential data loss on a long form | [THEORETICAL] |
| **Touch/hover-only interaction has no mobile equivalent** | A desktop interaction that depends on `:hover` (a tooltip, a reveal-on-hover swatch) has no tap-triggered equivalent on touch devices, making the information or control unreachable on mobile | Low-Medium | Feature effectively missing on mobile despite existing in the DOM | [OBSERVED] |

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

### 10.3 Admin SPA Module/Blade Availability & Degradation

*(Governed by `BL-CROSS-003` "Module disable → API 404, Admin section removal, dependent degradation" and `BL-CROSS-011` "Graceful degradation when dependent service is down.")*

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Blade fails to open silently instead of a clear error** | An Admin SPA module blade (Notifications, CMS, Assets, SEO, White Labeling, Push Messages, Loyalty, Returns, …) throws an unhandled error or shows a blank panel when its data source is unavailable, instead of a labeled "unavailable" state | Medium | Operator sees a broken screen with no actionable message; hard to distinguish "not installed" from "genuinely broken" | [OBSERVED] |
| **Underlying REST endpoint returns 500 instead of a documented empty/degraded response** | A module's backing API returns an unhandled 500 (rather than an empty result set or a typed error) when its module is disabled, misconfigured, or has zero records | Medium | Blade/grid throws instead of showing an empty state; masks the real cause | [OBSERVED] |
| **Grid shows stale/cached content with no "data may be out of date" signal when its source is degraded** | A list blade continues rendering a previous successful response when the live call is failing, giving no indication the displayed data may not be current | Low | Operator acts on stale information without warning | [THEORETICAL] |

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
| **Failure hidden in the response body, not in `errors[]`** | xAPI mutations (`addItem`, `createOrderFromCart`, `addBulkItems`) return HTTP 200 **and an EMPTY top-level GraphQL `errors[]`**, with the failure surfaced only inside the payload — a populated `validationErrors` on `CartType`/line items, or `Errors` on a bulk-add result. Checking HTTP status *or* the protocol-level `errors[]` misses it; the two are independent signals and a case must assert both. A genuine unhandled backend exception is the opposite shape — non-empty `errors[]` **plus a null data object** (see ECL-14.9) | High | Test false-positive, missed bugs | BL-CART-001, BL-ORD-001 | ECL-10.2 | [OBSERVED] |
| **Partial cart update** | `changeCartItemQuantity` returns 200 but qty not actually changed in `cart` response — stale response body | Medium | Wrong quantity in order | BL-CART-002 | ECL-2.1 | [OBSERVED] |
| **Missing storeId/cultureName** | xAPI query without required context params returns empty result or wrong catalog — agent reads wrong prices | Medium | Wrong product data in test | BL-PRICE-005 | ECL-12.1 | [OBSERVED] |
| **addItem with parent SKU** | Agent adds parent product SKU instead of variant SKU — API accepts it silently, cart shows configurable parent without variation | Low-Medium | Wrong item ordered | BL-CAT-006 | ECL-8.2 | [OBSERVED] |

### 14.2 Search Index Lag (Elasticsearch)

| Pattern | Description | Frequency | Impact | BL Invariant | ECL Ref | Status |
|---------|-------------|-----------|--------|-------------|---------|--------|
| **Price change not reflected** | Admin updates price → storefront still shows old price for 30-60s until re-index completes | High | Price test fails spuriously | BL-CROSS-002 | ECL-2.3 | [OBSERVED] |
| **New product invisible** | Product published in admin, agent searches immediately — product not in results because index job queued | Medium | Product not found in test | BL-SRCH-003 | ECL-3.3 | [OBSERVED] |
| **Out-of-stock item still shown** | Inventory depleted, but search results still show item as available for 30-60s | Medium | Add-to-cart fails unexpectedly | BL-CROSS-002 | ECL-2.1 | [OBSERVED] |
| **Facet count stale** | Filter shows "Color: Blue (12)" but actual result count differs after price/stock changes | Low-Medium | Misleading filter, zero results on click | BL-SRCH-001 | ECL-3.2 | [OBSERVED] |

**Agent rule:** After any catalog/price/inventory change in admin, wait 60s before asserting storefront reflects the change.

### 14.3 B2B Organization Context

| Pattern | Description | Frequency | Impact | BL Invariant | ECL Ref | Status |
|---------|-------------|-----------|--------|-------------|---------|--------|
| **Cart isolation loss** | Agent switches org via account selector — previous org's cart persists or bleeds into new org cart | Medium | Wrong cart in checkout | BL-B2B-001 | ECL-5.3 | [OBSERVED] |
| **Org context missing after login** | User logs in, `me.organization` is null in first GraphQL request — populated after second call or page refresh | Medium | B2B features absent on first load | BL-B2B-001 | ECL-4.2 | [OBSERVED] |
| **Company member role not applied** | New org member invited, but role permissions (Buyer vs Manager vs Admin) not enforced immediately — role applied after session refresh | Low-Medium | Feature access test incorrect | BL-B2B-005 | ECL-4.3 | [OBSERVED] |
| **Multi-org ship-to conflict** | User with 2 orgs — ship-to addresses from Org A visible when acting as Org B | Low | Wrong address options shown | BL-B2B-001 | ECL-6.3 | [OBSERVED] |
| **Addresses link visible for org user** | `Addresses` link in account sidebar hidden for org users — expected behavior, not a bug | High (false bug) | False-positive bug reports | BL-B2B-001 | — | [OBSERVED] |

### 14.4 Price List & Currency Edge Cases

| Pattern | Description | Frequency | Impact | BL Invariant | ECL Ref | Status |
|---------|-------------|-----------|--------|-------------|---------|--------|
| **Currency switch shows "unavailable"** | No price list for selected currency → product shows as unavailable — correct behavior but confusing | Medium | Test confusion (pass vs fail) | BL-PRICE-005 | ECL-12.1 | [OBSERVED] |
| **Tier price boundary off-by-one** | Price tier at qty=10 doesn't activate at exactly 10 — activates at 11 | Low | Revenue loss at boundary | BL-PRICE-004 | ECL-2.3 | [OBSERVED] |
| **Stale price in mini-cart** | Price updated in admin → user's open mini-cart still shows old price even after addItem | Medium | Overcharge/undercharge | BL-CROSS-002 | ECL-1.3 | [OBSERVED] |
| **Tax recalculated at wrong step** | Tax shown in cart, recalculated at checkout when shipping address added — user sees different total | Medium | User surprise, cart abandonment | BL-PRICE-002 | ECL-6.2 | [OBSERVED] |

### 14.5 Configurable Product & Variation Edge Cases

| Pattern | Description | Frequency | Impact | BL Invariant | ECL Ref | Status |
|---------|-------------|-----------|--------|-------------|---------|--------|
| **Add to Cart enabled before selection** | B2C variation product: 'Add to Cart' clickable before user selects any option — adds parent SKU | Medium | Wrong item in cart | BL-CAT-006 | ECL-8.2 | [OBSERVED] |
| **VirtoFrontend_UI_Layout property absent** | B2C layout not shown because property missing from product — shows B2B table instead | Low-Medium | Wrong layout in test | BL-CAT-006 | ECL-8.1 | [OBSERVED] |
| **Image not switching on variant select** | Variant image URL present in API response but main PDP image doesn't update on option click | Low | Visual confusion, wrong variant ordered | BL-CAT-006 | ECL-8.2 | [OBSERVED] |
| **Unavailable combo not blocked** | Two options selected forming an out-of-stock combination — 'Add to Cart' stays enabled, error only at API | Low-Medium | Order for unavailable variant | BL-CAT-006 | ECL-2.1 | [OBSERVED] |
| **Required configuration section omitted at the API layer** | A direct GraphQL `addItem` call submits only some of a configurable product's sections, omitting a required one — the mutation must reject it (non-empty `errors[]` or zero items added), not silently accept a partially-configured line, even though the storefront UI already blocks this via the disabled Add-to-Cart button | Low | Incomplete configuration reaches an order via a non-UI client | BL-CAT-006 | ECL-2.1 | [OBSERVED] |
| **Saved-for-Later loses configuration on a bulk, mixed-type move** | Moving several configurable line items (of different configuration shapes) to Saved-for-Later in one bulk call must preserve each item's own `configurationItems` count and type identity — not average, drop, or cross-contaminate them | Low | Configuration silently lost on an item a user expects to restore later | BL-CART-015 | ECL-2.1 | [OBSERVED] |

### 14.6 Payment Processor Differences (VC-specific)

| Pattern | Description | Frequency | Impact | BL Invariant | ECL Ref | Status |
|---------|-------------|-----------|--------|-------------|---------|--------|
| **CyberSource on cart page** | CyberSource payment form renders directly on `/cart` — NOT on `/checkout/payment`. Agent that navigates to `/checkout/payment` first will miss the form | High | Test never reaches payment | BL-PAY-004 | ECL-1.1 | [OBSERVED] |
| **Datatrans is the only redirect processor** | Datatrans has no inline cart-payment component (`allowCartPayment=false`) — selecting it and clicking 'Place Order' redirects to `/checkout/payment` for card entry. CyberSource, Skyflow **and** Authorize.Net all render inline on `/cart` (as the row above), so an agent that still expects Skyflow or Authorize.Net to redirect will navigate away from the form it needs | High | Agent tries wrong page / misses the inline form | BL-PAY-004 | ECL-1.1 | [OBSERVED] |
| **Payment iframe blocked by ad-blocker** | Payment script (CyberSource/Skyflow) blocked silently — form appears blank, no error shown | Low-Medium | Silent payment failure | BL-PAY-001 | ECL-7.1 | [OBSERVED] |
| **Double-click Place Order** | Slow connection: user/agent clicks 'Place Order' twice — two orders created | Medium | Duplicate order | BL-CHK-002 | ECL-7.3 | [OBSERVED] |

**Amended:** 2026-08-06 (auto-applied, triangulated — ECL-AUDIT-2026-08-06). Row 2 was **DRIFT**: it claimed Skyflow, Authorize.Net and "DataTrance" all redirect after Place Order. Skyflow and Authorize.Net have since moved to `allowCartPayment=true` and render inline on the cart like CyberSource, leaving Datatrans as the only redirect processor — the row was steering agents to the wrong page for two of the three processors it named. **Source:** the storefront's shared payment component renders the CyberSource, Skyflow and Authorize.Net processors inline, keyed on the payment type, with an explicit `TODO` noting Datatrans cart payments are not yet supported; the checkout composable's `canPayFromCart` gates on the payment method's `allowCartPayment` flag generically, not on a processor allowlist. **Live:** selecting Authorize.Net on the cart kept the page on `/cart` with no redirect.

### 14.7 Background Job Timing (Hangfire)

| Pattern | Description | Frequency | Impact | BL Invariant | ECL Ref | Status |
|---------|-------------|-----------|--------|-------------|---------|--------|
| **Order confirmation email delay** | Email sent via Hangfire — may arrive 5-30s after order confirmation page shown | High | Email assertion fails if checked immediately | BL-NOTIF-001 | ECL-10.1 | [OBSERVED] |
| **Search reindex job queued** | Reindex triggered by catalog change but job queued behind other jobs — lag exceeds 60s under load | Low-Medium | Price/product not visible longer than expected | BL-SRCH-003 | ECL-2.3 | [OBSERVED] |
| **Inventory sync job** | Inventory decrement happens via background job — brief window where item shows as in-stock post-purchase | Low | Oversell window | BL-CROSS-009 | ECL-2.1 | [OBSERVED] |

### 14.8 Environment / Module Version-Schema Drift

Triggered by VCST-5651: a "Loyalty missions" pre-release build (vc-module-loyalty PR #14 — `LoyaltyProgramOperationLog.LoyaltyProgramId` renamed to `SourceType`/`SourceId`) was installed on a shared non-prod environment, ran its forward EF Core migration, and was then reverted to the released build **without** a corresponding down-migration. The released build's `LoyaltyRepository.GetLoyaltyProgramOperationLogsByIdsAsync` (queried via `LoyaltyLogicService.GetUserBalanceAsync`) still selects the old column name, which no longer exists → `SqlException: Invalid column name 'LoyaltyProgramId'` surfaces as an unhandled GraphQL error and `data.cart: null`. No `BL-*` invariant governs environment/schema integrity today — this whole subsection is a coverage gap, not a violation of an existing rule.

| Pattern | Description | Frequency | Impact | BL Invariant | ECL Ref | Status |
|---------|-------------|-----------|--------|---------------|---------|--------|
| **Module downgraded after a forward schema migration** | A newer build's migration renames/drops a column that an older, already-released module build still queries by its old name. The module binary is reverted to the older release without a matching down-migration, so the running code queries a column the live schema no longer has (`Invalid column name`) — the query throws instead of returning data, for every user who exercises that code path, not just one row | Low (non-prod/QA envs where pre-release builds get installed then reverted) | Whole query fails; entire parent object (e.g. `cart`) resolves to `null` rather than a scoped error | — (gap) | — | [OBSERVED] |
| **Module upgraded before its migration has actually run** | The inverse direction: the module binary is bumped to a newer release (or a pre-release that adds/renames columns) but the target database's migration was never applied — the newer code queries/writes a column or table that does not exist yet. Same `Invalid column/object name` signature as the row above, opposite cause | Low | Same as above | — (gap) | — | [THEORETICAL] |
| **Dependent modules rolled back independently** | Two modules share a data contract (e.g. an evaluation-context field, a cross-module event payload). One module is reverted to an older release while a dependent module stays on the newer build that assumes the new shape — reads/writes between them desync even though each module individually reports healthy on its own health check | Low | Silent cross-module data corruption or intermittent query failures, hard to attribute to either module in isolation | — (gap) | — | [THEORETICAL] |
| **Pre-release install pollutes a shared non-prod schema for unrelated test runs** | A pre-release artifact is installed on a shared QA/dev environment to validate one ticket, then the module is reverted to the released version once that ticket is closed — but the migration it ran is never rolled back. A later, functionally unrelated regression run against the same environment can hit the identical schema/code mismatch with zero connection to the feature it is actually testing, and reads as a flaky/unrelated failure | Low | Wastes triage time; a real environment-integrity defect masquerades as test flakiness in an unrelated suite | — (gap) | — | [OBSERVED] |

**Agent rule:** After any admin-driven module version change (install a pre-release build, then revert it) on a shared environment, treat every suite touching that module's data as suspect until a schema sanity check (e.g. a query that reads the affected entity) is re-run — do not assume "downgraded" means "back to the previous behavior."

### 14.9 Cart Validator Extension-Point Fault Isolation

`ICartValidator` implementations (module-contributed — Loyalty, Promotions, Shipping, …) run through `CartValidatorRegistry.ValidateAsync` in a single unguarded loop (vc-module-x-cart `src/VirtoCommerce.XCart.Data/Validators/CartValidatorRegistry.cs`, `foreach (var validator in validators) { ... await validator.ValidateAsync(...) ... }`, no try/catch per validator). An unhandled exception thrown while evaluating ONE validator's rule propagates uncaught through `CartAggregate.ValidateAsync` into the `cart.validationErrors` GraphQL resolver, and the entire top-level `cart` object resolves to `null` — not a scoped error on that one rule.

| Pattern | Description | Frequency | Impact | BL Invariant | ECL Ref | Status |
|---------|-------------|-----------|--------|---------------|---------|--------|
| **One validator's exception nulls the entire parent object** | A single `ICartValidator`'s unhandled exception (e.g. a loyalty-balance lookup hitting a broken query) is not caught per-validator; the whole `cart` response is lost along with every OTHER validator's result and the rest of the cart payload — a design gap in the shared validation pipeline, not specific to Loyalty | Low | Cart becomes completely unreadable for any user who trips the failing validator, cross-module blast radius | — (gap; contrast BL-LOY-008, which only covers the *designed* `LOYALTY_INSUFFICIENT_BALANCE` typed-error path) | ECL-10.2 | [OBSERVED] |
| **Trigger condition is "any loyalty-priced line", not "mixed cart" specifically** | The balance-check branch fires whenever the cart contains at least one loyalty-currency line item (`hasPointProducts`), independent of whether a cash line is also present (`LoyaltyCartValidator.cs` rule 4). A cart holding ONLY a loyalty-priced item hits the identical code path — "add regular items first" is incidental to the repro, not a precondition | Low | Same crash, wider trigger surface than the reported steps suggest | BL-LOY-008 (rule 4; exception path uncovered) | — | [THEORETICAL] |
| **A cart made unreadable by a validator crash has no self-service recovery** | Once `cart` resolves to `null`, the storefront has no path to fetch the cart and let the user remove the offending line item — there is no "remove item without first reading validationErrors" flow. The user is stuck with an unusable cart until an operator intervenes, not merely a degraded checkout step | Low | User-facing dead end with no workaround; support escalation required | — (gap) | — | [THEORETICAL] |

**Agent rule:** When a cart/order query returns `data.<aggregate>: null` with a GraphQL `errors[]` entry that looks like an unhandled backend exception (not a typed `errorCode`), suspect a validator/extension-point crash rather than a plain "field failed to resolve" — check whether removing the most recently added line item (via a fresh cart, not the broken one) isolates which contributed rule is throwing.

### 14.10 Admin Order-Edit UI Guards & Status Preservation

Admin SPA order-detail patterns where an editing action must not disturb state it doesn't own. Generic analog: chapter 13.1 (Order Fulfillment Issues).

| Pattern | Description | Frequency | Impact | BL Invariant | ECL Ref | Status |
|---------|-------------|-----------|--------|---------------|---------|--------|
| **Cancel-document control stays enabled during an in-flight refund** | The order-detail "Cancel document" action must be disabled while a refund on that document is submitted/pending — leaving it enabled lets an operator cancel a document a payment operation is currently acting on | Low | Race between cancel and refund, inconsistent payment state | BL-ORD-004 | ECL-13.1 | [OBSERVED] |
| **Line-item statuses reset when a product is added to an existing order** | Editing an order to add a new line item must not reset the fulfillment/shipment status already recorded on the order's other line items | Low | Loses fulfillment progress, requires manual re-entry | BL-ORD-003 | ECL-13.1 | [OBSERVED] |
| **Multiple concurrent custom order statuses collapse to one after an edit** | An order carrying more than one custom status value (from different shipments/line items) must preserve all of them after an unrelated edit (e.g. adding a product) — not silently collapse to a single status | Low | Loses operationally meaningful status detail | BL-ORD-003 | ECL-13.1 | [OBSERVED] |

---

## 15. Accessibility Edge Cases

Screen-reader and assistive-technology interaction patterns surfaced by manual/automated WCAG 2.2 AA audits. **Note:** `business-logic.md` does not currently carry a `BL-A11Y` domain; this chapter's `Status` column stands on its own [OBSERVED]/[THEORETICAL] evidence rather than a BL citation (proposed as a BL gap in this audit's cover report).

### 15.1 Screen Reader Interaction Patterns

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Modal open/close not announced** | A modal dialog gains focus visually but a screen reader user gets no announcement that a dialog opened, what it contains, or that closing it returned focus to the triggering control | Medium | Screen-reader users lose context, may not know a modal is present | [OBSERVED] |
| **List semantics not exposed** | A visually list-like structure (product grid, filter options) is not marked up with list/listitem roles, so a screen reader announces it as an undifferentiated block of text | Medium | Screen-reader users can't navigate item-by-item or get a count | [OBSERVED] |
| **Form field lacks a programmatically associated label** | An input is visually adjacent to its label text but the two aren't associated via `<label for>`/`aria-labelledby`, so a screen reader announces the field with no name | High | Screen-reader users can't tell what a field is for | [OBSERVED] |
| **Validation error not announced at the point of failure** | A field-level validation error appears visually (red text/border) but isn't associated to the field via `aria-describedby` or announced via a live region, so a screen-reader user submits again with no idea what's wrong | High | Screen-reader users are stuck in a silent failure loop | [OBSERVED] |
| **Interactive control has no accessible name** | An icon-only button (cart, search, close) has no `aria-label`/visible text, so a screen reader announces only "button" | Medium | Screen-reader users can't identify the control's purpose | [OBSERVED] |

---

## Appendix D: ECL → Business Logic Invariant Cross-Reference

Quick lookup: which ECL sections map to which BL-* invariants in `business-logic.md`.

| ECL Section | Description | BL Invariants |
|-------------|-------------|---------------|
| ECL-1.1 Payment Methods | Payment form location, processor differences | BL-PAY-001 |
| ECL-1.2 Session & Timeout | Session expiry during checkout | BL-AUTH-001 |
| ECL-1.3 Coupon & Discount | Stacking, expiry, case sensitivity | BL-PRICE-001, BL-PRICE-006 |
| ECL-1.4 Layout Shift & Hover Displacement | Hover/state-change layout shift | BL-UI-003 |
| ECL-1.5 Spacing & Design-Token Compliance | Off-grid spacing, stale audit grid | BL-UI-002 |
| ECL-1.6 Overflow & Viewport Scroll | Horizontal scroll, fluid-band overflow | BL-UI-004 |
| ECL-1.7 Alignment in Horizontal Groups | Row height parity | BL-UI-005 |
| ECL-1.8 Touch Target Sizing | Sub-AA touch targets, no spacing buffer | BL-UI-006 |
| ECL-2.1 Race Conditions | Overselling, last-item conflict | BL-CART-001 |
| ECL-2.2 Stock Depletion Notifications | "Only 1 left" nagware, stale inventory cache | BL-CART-001 |
| ECL-2.3 Pricing Timing | Stale cart totals, flash sale conflict | BL-PRICE-001, BL-PRICE-004 |
| ECL-3.1 No Results | Dead-end search, zero results | BL-SRCH-002 |
| ECL-3.2 Filter & Sort | Sort reset, filter persistence | BL-SRCH-001 |
| ECL-3.3 Search Quality Issues | Synonym failure, deleted product in results | BL-SRCH-003 |
| ECL-4.1 Email & Identity | Email variations, typos | — (no BL invariant governs consumer email/identity normalization) |
| ECL-4.2 Password & Auth | Brute force, spaces, lockout | BL-AUTH-003 |
| ECL-4.3 Account Takeover | Session fixation, OTP reuse, email-change bypass | BL-AUTH-002 |
| ECL-4.4 Guest vs Registered | Conflict on same email | BL-CHK-001 |
| ECL-5.1 Rapid & Repetitive Actions | Bulk add-to-cart, card testing pattern | — (fraud-detection heuristic, not a testable platform invariant) |
| ECL-5.2 Geographic & Temporal Anomalies | Impossible travel, VPN/proxy | — (fraud-detection heuristic, not a testable platform invariant) |
| ECL-5.3 Cart & Browsing | Quantity manipulation (negative/huge) | BL-CART-001 |
| ECL-5.4 Return & Refund Abuse | Wardrobing, serial returner | BL-ORD-004 |
| ECL-6.1 Stock Sync Problems | Warehouse lag, off-by-one count | BL-CAT-007 |
| ECL-6.2 Tax & Shipping | Threshold edge case, recalculation | BL-PRICE-002 |
| ECL-6.3 Address Validation | Autocomplete, special chars, country format | BL-CHK-003 |
| ECL-6.4 File Upload & Import Validation | Empty/malformed/oversized import files | — (gap; see `bl_proposals` in the audit that added this section) |
| ECL-7.1 Browser & Device Issues | JS disabled, ad-blocker, stale cache | — (no single BL invariant; overlaps BL-CROSS-011) |
| ECL-7.2 Form Input Edge Cases | Special chars, off-screen validation | — (no single BL invariant; overlaps BL-CHK-003) |
| ECL-7.3 Loading States | Double-click checkout, spinner | BL-CHK-002 |
| ECL-7.4 Mobile & Responsive Layout | Hidden above-fold element, hamburger content, orientation loss | — (gap; see `bl_proposals` in the audit that added this section) |
| ECL-8.1 Product Information Problems | Misleading images, missing size chart | — (no single BL invariant) |
| ECL-8.2 Variant & SKU | Hidden variants, price caching | BL-CAT-006 |
| ECL-9.1 Fake & Manipulated Reviews | Coordinated reviews, revenge reviews | — (not modeled by a platform business-logic invariant) |
| ECL-9.2 Review Display Issues | Sort bias, vote manipulation | — (not modeled by a platform business-logic invariant) |
| ECL-10.1 Timeout & Slow Load | Checkout API timeout, stale API cache | BL-CROSS-009 |
| ECL-10.2 Error Handling | Silent failure, vague messages | BL-ORD-001 |
| ECL-10.3 Admin SPA Module/Blade Availability | Blade fails silently, 500 instead of degraded response | BL-CROSS-003, BL-CROSS-011 |
| ECL-11.1 Conversion Tracking | Duplicate pixel fire on refresh | BL-CROSS-005 |
| ECL-12.1 Currency | No price list → unavailable | BL-PRICE-005 |
| ECL-12.2 International Shipping & Taxes | VAT/GST error, undisclosed customs duty | BL-PRICE-002 |
| ECL-13.1 Order Fulfillment Issues | Partial fulfillment, backorder, cancel-after-ship | BL-ORD-002, BL-ORD-003 |
| ECL-13.2 Subscription & Recurring Billing | Silent renewal failure, proration | — (no native VC subscription/recurring-billing module; applies only to deployments with a custom extension) |
| ECL-13.3 Loyalty & Points | Points not credited, double-counting | BL-LOY-007, BL-LOY-008 |
| ECL-14.1 GraphQL xAPI Error Patterns | Silent `errors[]`, missing context params | BL-CART-001, BL-ORD-001, BL-PRICE-005, BL-CAT-006 |
| ECL-14.2 Search Index Lag | Price/product/facet staleness after admin change | BL-CROSS-002, BL-SRCH-001, BL-SRCH-003 |
| ECL-14.3 B2B Organization Context | Cart isolation loss, role not applied | BL-B2B-001, BL-B2B-005 |
| ECL-14.4 Price List & Currency Edge Cases | Currency unavailable, tier boundary, stale mini-cart price | BL-PRICE-002, BL-PRICE-004, BL-PRICE-005, BL-CROSS-002 |
| ECL-14.5 Configurable Product & Variation Edge Cases | Add-to-cart before selection, required-section omission, bulk SFL | BL-CAT-006, BL-CART-015 |
| ECL-14.6 Payment Processor Differences | Form-location differences, double-click Place Order | BL-PAY-001, BL-PAY-004, BL-CHK-002 |
| ECL-14.7 Background Job Timing | Email delay, reindex lag, inventory sync window | BL-NOTIF-001, BL-SRCH-003, BL-CROSS-009 |
| ECL-14.8 Environment/Schema Drift | Module downgrade without DB rollback; upgrade before migration runs | — (gap; VCST-5651) |
| ECL-14.9 Validator Fault Isolation | Unhandled validator exception nulls the whole cart/order object | BL-LOY-008 (partial); ECL-10.2 |
| ECL-14.10 Admin Order-Edit UI Guards | Cancel-during-refund guard, status preservation on edit | BL-ORD-003, BL-ORD-004 |
| ECL-15.1 Screen Reader Interaction Patterns | Unannounced modals/errors, unlabeled controls | — (gap; no `BL-A11Y` domain yet — see `bl_proposals`) |

**End of Library**
