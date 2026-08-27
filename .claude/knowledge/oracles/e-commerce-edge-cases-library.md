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
| **Coupon code case normalization** | Coupon codes are matched **case-insensitively server-side**, and the storefront sends the code as typed (trimmed only) — it folds case solely to compare the applied code against the entered one. So a code registered in one case applies when entered in any case. The naive expectation is inverted: the presentation layer force-UPPERCASES the code in the account coupon list and in the clipboard copy, which is functionally harmless for a collision-free code precisely because validation ignores case. The real harm is a **collision**, not a rejection — where an uppercase twin exists as a DISTINCT coupon, the uppercased entry resolves to that other coupon and best-reward selection takes the larger discount. Residual risk: case folding reintroduced on the wire, or a backend lookup that becomes case-sensitive | Low | The user sees and copies a code in the wrong case; where an uppercase twin exists, a different coupon is applied than the one acted on | [OBSERVED] |
| **Coupon for product no longer in cart** | User applies coupon, then removes the coupon-eligible product | Low-Medium | Coupon error or unexpected discount | [THEORETICAL] |
| **First-time buyer coupon on second cart** | User has multiple sessions; second session still applies first-time discount | Low | Revenue loss | [OBSERVED] |

**Amended:** 2026-08-27 (auto-applied, triangulated — ECL-AUDIT-2026-08-27). **Row 5** previously read `**Coupon case sensitivity** | System requires exact case but user enters lowercase`, which inverts the mechanism on this platform and sends an agent hunting a rejection that does not occur. Matching is case-insensitive **server-side**; the defect is presentation-layer (the code is force-uppercased in the account coupon list and in the clipboard copy), and its real consequence is a wrong-coupon **collision** where an uppercase twin exists as a separate coupon, not an invalid code. **Source:** the storefront cart's coupon utility folds case only to compare the applied code against the entered one, with an in-file note that the backend matches case-insensitively; the apply path sends the trimmed code as typed and validates before removing the previously applied one. **Live:** a lowercase-registered, collision-free coupon entered in all uppercase applied successfully, discounted the cart by its declared percentage, and flipped the matching promotion card to its remove state — confirming case-insensitive server-side matching on the deployed build. **Not asserted:** whether the presentation-layer defect is now fixed — that lives on the account coupon list, which this run did not observe, so no claim is made either way. Other rows unchanged.

---

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
| **Overflow only in the fluid band between fixed breakpoints** | A layout that passes at a handful of hand-picked "common" widths overflows only in an untested intermediate width, because a content block's own breakpoint doesn't align with the sampled widths. Sweep the DERIVED viewport set (`AUDIT_VIEWPORTS_PX` — every real ui-kit breakpoint edge, just below it, and the fluid midpoints), never a transcribed list: the design system declares breakpoint edges a naive five-width sweep omits outright, so a transcribed list samples around the very band this pattern lives in | Low-Medium | Real users on in-between viewport widths see a bug the standard breakpoint sweep misses | [OBSERVED] |

**Amended:** 2026-08-27 (auto-applied, triangulated — ECL-AUDIT-2026-08-27). **Row 2** only: the transcribed width list was replaced by a pointer to the derived viewport set. The row's *claim* was never wrong — this is the GOLDEN-RULE drift, where a transcribed constant in an oracle rots exactly as one in a script does, and this one was already provably incomplete. **Source:** the ui-kit's breakpoint constants declare edges the transcribed list omitted outright, and its largest breakpoint is not the Tailwind default, so a reader following the old list would build precisely the sweep that misses this pattern. Derived mirror: `AUDIT_VIEWPORTS_PX` in `scripts/lib/design-tokens.generated.ts` (regenerated by `npm run tokens:sync`, drift-gated by `npm run tokens:check`). **Docs:** the storefront developer guide states the responsive contract the row measures against; the failure mechanics themselves are undocumented (§1a class 1). **Live:** no horizontal document overflow at the sampled mobile and desktop widths, so the condition remains constructible rather than removed. Row 1 re-confirmed unchanged.

---

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
|---------|-------------|-----------|--------|--------|
| **Price changes between cart and checkout** | Sale ends, price tiers shift, inventory moves user into different pricing | Medium | User sees $20, charged $25 | [OBSERVED] |
| **Flash sale conflict** | Item on flash sale; user adds to cart right at sale end | Low-Medium | Charged non-sale price | [OBSERVED] |
| **Dynamic pricing not recalculated** | Cart shows old price, checkout shows new price without warning | Low-Medium | User surprises at final price | [OBSERVED] |
| **Tax/shipping recalculated unexpectedly** | User views cart at 11:55 PM, tax zone updates at midnight (new tax rates) | Low | Charged more tax than expected | [THEORETICAL] |

---

## 3. Search & Discovery

### 3.1 No Results & Edge Cases

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Typo returns zero results when fuzzy matching is off** | A one-character misspelling of a high-yield term returns zero results. Fuzzy matching is a per-request parameter the storefront's search query already declares and forwards, so the outcome depends on whether the store's configuration sets it — do not assume either state; establish it, then assert against it | High | User leaves, doesn't see alternatives | [OBSERVED] |
| **Overly specific filter combo** | User filters: "Size 28W x 34L AND Color Plaid AND Organic Cotton" → 0 results exist | Medium | Dead-end, user frustrated | [OBSERVED] |
| **"No results" page loses its recovery action** | The zero-result page must render an intact empty state with a working reset control that clears the keyword and filters. Spelling suggestions and a category fallback are deliberately not implemented, so their absence is not a finding — the failure is a blank grid, a broken layout, or a reset control that is missing or does not clear state | High | Abandonment | [OBSERVED] |
| **Search pagination broken on last page** | User clicks page 2, sees products, page 3 shows "no results" but page 3 exists | Low-Medium | Confusing UX, lost products | [THEORETICAL] |
| **Category exclusions too aggressive** | Filtering by "vegetarian" excludes items that mention "may contain traces of..." | Low-Medium | User misses relevant products | [THEORETICAL] |

**Amended:** 2026-08-27 (auto-applied, triangulated — ECL-AUDIT-2026-08-27). **Rows 1 and 3** changed. Row 1 asserted an unconditional outcome: the storefront's own search query declares and forwards fuzzy-matching parameters, and the platform documents fuzzy matching with configurable levels, so a typo returning nothing is a *configuration state* to establish rather than a platform fact — a case that assumes it is vacuous wherever fuzzy is on. Row 3 was stale in the direction that manufactures false bugs: it named the absence of "did you mean" and category suggestions as the defect, while the recovery affordance the guides describe (clear all applied filters in a single click and restore the full product list) is present and live, and `BL-SRCH-002` records that spelling suggestions and a popular-products fallback are explicitly **not** implemented and must not be asserted. Rewritten to name the real failure — a lost or non-clearing reset. **Source:** the storefront search query's fuzzy variables; the shared search/category renderer that owns the single empty state. **Live:** a nonsense query and a one-character typo both rendered the intact empty state with a working reset control and no suggestion of any kind.

---

### 3.2 Filter & Sort Edge Cases

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Sort selection lost when the result set is re-queried** | The sort code and the facet expression are independent URL parameters and applying a filter resets only the page, so the selection should survive. The residual risk is the *option list*: available sort codes are store-defined and re-derived from each faceted response, so a selected code the new result set no longer offers falls back to the default | Medium | Frustration, poor UX | [OBSERVED] |
| **Price range filter boundaries** | User filters $10-$20, but item at exactly $20.00 is excluded | Low | Edge case precision issue | [OBSERVED] |
| **Multi-select filter AND vs OR confusion** | User selects "Color: Red OR Blue" but system interprets as "Color: Red AND Blue" (impossible) | Low | No results, user confusion | [THEORETICAL] |
| **Filter persistence is asymmetric between control and facet filters** | The availability, branch and purchased-before controls persist in browser storage — surviving navigation, a new tab and a new session, with availability defaulting to on for a first-time visitor — while facet filters live only in the URL and vanish on navigation. Returning to a result list can therefore show a different product set than the one left, in either direction | Low-Medium | Unexpected product list | [OBSERVED] |

**Amended:** 2026-08-27 (auto-applied, triangulated — ECL-AUDIT-2026-08-27). **Rows 1 and 4** changed. Row 1 named a mechanism the implementation contradicts: the sort code and the facet expression are separate route query parameters and the filter-apply path resets only the page, so a filter cannot clear the sort — rewritten to the risk that survives, a server-derived sort option list re-read per response. Row 4 was correct but mechanism-free, and the mechanism turns out to be an asymmetry worth stating: three control filters persist in browser storage (availability defaulting to on) while facet filters are URL-only. **Source:** the products composable's two independent query params, its filter-apply path, its three storage-backed controls, and the per-response sortings assignment; the storefront search query's sortings selection. **Live:** the facet sidebar, the sort dropdown, the three checkbox controls with availability pre-checked, and an active-filter chip row with a reset control, all on a keyword result page. **Note on the live axis:** the filter-apply then sort-persistence sequence was not executed live (the assigned lane cannot click), so row 1 rests on docs + source with live supplying reachability of both controls.

---

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
| **Email case sensitivity** | Identity lookup runs against a case-normalized form of the address, so a differently-cased spelling of an existing address resolves to the same account — registration is refused as already-taken and sign-in succeeds. The residual risk is inconsistent casing in the stored profile and in outbound notifications, not a login failure | Low | Inconsistent casing in stored profile and outbound notifications | [OBSERVED] |
| **Plus-addressing not canonicalized** | A user registers with a `+tag` sub-address of an address that already has an account; the platform compares the literal normalized address, so the sub-address is accepted as a separate account rather than recognized as the same mailbox | Low | Unlimited alias accounts from one mailbox — duplicate-account support burden, per-account promo/coupon abuse | [OBSERVED] |
| **Temporary email address** | User signs up with temp email, confirms, then email expires; can't reset password | Low | Account locked out | [OBSERVED] |
| **Email domain typo at signup** | User types `gmai.com` instead of `gmail.com`, can't receive confirmation | Low | Account never activated | [OBSERVED] |

**Amended:** 2026-08-27 (auto-applied, triangulated — ECL-AUDIT-2026-08-27). **Rows 2 and 3** were **DRIFT**, and row 3 described the exact inverse of the behaviour. Row 2 claimed login failures caused by case differences; identity lookup is case-normalized, so a differently-cased spelling resolves to the same account and the residual risk is display/notification casing (`[THEORETICAL]` → `[OBSERVED]`). Row 3 claimed the platform STRIPS a `+tag` and merges accounts; it does the opposite — the literal normalized address is compared, so a sub-address registers as a **separate** account, which inverts the impact from an account merge to alias-account proliferation (`[THEORETICAL]` → `[OBSERVED]`). Rows 1, 4 and 5 CONFIRMED unchanged. **Source:** the platform's identity options require a unique email, enforced on the case-folded normalized address with no local-part canonicalization anywhere in the chain; the storefront registration schema trims and format-checks the address and runs a debounced uniqueness test, and does no dot- or plus-handling. **Docs:** the storefront guide's create-account page confirms the flow; the normalization mechanics are undocumented (§1a class 1). **Live:** on the registration form a dot-removed variant and a `+tag` variant of an existing address both passed the uniqueness check, while the exact address and its all-uppercase spelling were both refused — a paired positive/negative control in a single pass.

---

### 4.2 Password & Authentication Edge Cases

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Brute force password attempts** | Attacker attempts 100+ login tries in 1 minute | Low-High | Security breach risk | [OBSERVED] |
| **Password with leading/trailing spaces** | The email field is trimmed on both the sign-in and the registration form, but the password field is not — surrounding whitespace is retained and becomes part of the stored credential, so a user who set a padded password and later types the unpadded one is rejected | Low | Locked out, support needed | [OBSERVED] |
| **Unicode/special character password** | User's password has emoji or non-ASCII; system doesn't validate encoding | Low | Login failures | [THEORETICAL] |
| **Credential stuffing** | Attacker uses leaked password list across your platform | Medium | Account takeover risk | [OBSERVED] |
| **Account lockout mechanism too strict** | Lockout fires after a configurable number of consecutive failed attempts and expires after a configurable interval — read the deployment's identity lockout options rather than assuming a fixed count (see `BL-AUTH-003`). The storefront renders a contact-administrator affordance on a lockout error, so the pattern is perceived-dead-end friction, not an absent unlock path. Org-scoped lockout is a **distinct** mechanism (`BL-AUTH-012`/`BL-AUTH-013`), not this one | Low | Support tickets | [OBSERVED] |

**Amended:** 2026-08-27 (auto-applied, triangulated — ECL-AUDIT-2026-08-27) — §4.2. **Rows 2 and 5** were **DRIFT**. Row 2 attributed the lock-out to the system TRIMMING the password; nothing trims it — the email field is trimmed on both the sign-in and the registration form while the password field is not, so surrounding whitespace is retained and becomes part of the credential. Row 5 transcribed a fixed "3 failed attempts" and claimed no unlock path: the attempt count and the lockout interval are both configurable platform identity options (the documented default is higher than the number the row carried), and the storefront renders a contact-administrator affordance on a lockout error — so the row now points at the setting instead of a number, which is the same GOLDEN-RULE correction applied to the viewport list in §1.6 and §7.4. Rows 1, 3 and 4 CONFIRMED unchanged, at the reachability ceiling only — no lockout or brute-force sequence was run. **Source:** the storefront sign-in form trims the email model and not the password model, and branches on a lockout error code to render a contact-administrator link; the registration schema likewise trims only the address; the platform's identity lockout options carry both the maximum failed-attempt count and the lockout timespan. **Docs:** the storefront guide's sign-in page documents the blocked-account screen and directs the user to the administrator, and its password-management page documents the self-service reset. **Live:** a single failed sign-in against a non-existent address returned a generic failure with no account-existence disclosure, and the password field retained the whitespace it was given.

---

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
| **Cart manipulation** | User enters a negative, non-numeric, decimal or absurdly large quantity. The two entry surfaces differ BY DESIGN (`BL-CART-001`): the product page blocks the commit client-side with an inline allowed-range message and adds no line, while an existing cart line accepts and PERSISTS the out-of-range value — line total and cart totals recompute from it, surviving a reload — and blocks order completion with a per-line advisory instead | Low | Alarming but non-committal totals; the real defect would be a silent cap to available stock, or Place-order becoming enabled | [OBSERVED] |

**Amended:** 2026-08-27 (auto-applied, triangulated — ECL-AUDIT-2026-08-27) — §5.3. **Row 5** was **DRIFT**: its Impact read "Input validation issue", which invites an agent to file the recomputed out-of-range cart total as a bug — but `BL-CART-001` records that behaviour as INTENDED, and names the opposite as its violation signal (a silent cap to available stock, or Place-order becoming enabled). The row now distinguishes the two entry surfaces and states what a real violation would look like. This row is the worked example of a drift detector used repeatedly in this audit: **the cited invariant was materially more precise than the row citing it**, and a five-word Impact cell was pointing the wrong way. Rows 1–3 CONFIRMED unchanged; **row 4 was NOT confirmed** (rapid category browsing / bot scraping — no code path exists to anchor a source axis) and is recorded in `reports/ba/ecl-proposals-2026-08-27.md`. **Source:** the cart line-item validator's min/max quantity rule attaches a per-line failure rather than blocking, and the add/change-quantity command handlers save unconditionally with no branch on the validator outcome. **Docs:** the storefront guide's checkout page documents changing a cart line's quantity. **Live:** on the product page an out-of-range quantity was refused pre-commit with an inline allowed-range message and no line added; on an existing cart line the same value was persisted, all totals recomputed from it, and order completion stayed disabled behind a per-line advisory.

---

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
| **Browser autofill silently overwrites address fields** | The address form declares no `autocomplete` attribute on its text inputs and integrates no address-suggest/geocoding service, so the browser's own autofill populates them by its heuristics — filling a stale or wrong saved address that the shopper does not re-read | Low-Medium | Misdelivery | [OBSERVED] |
| **Address rejected or silently truncated rather than validated** | Client-side address validation is length-and-required only (no character-class regex), and a dedicated apartment/suite field exists — so punctuation-heavy or long addresses are not rejected up front but are silently cut at the field's max length, and any real rejection arrives later from the server-side address-validation provider with its own message | Low-Medium | User can't complete order, or a truncated address ships | [OBSERVED] |
| **Zip code mismatch with city** | User enters real address but zip code doesn't match city; validation fails | Low | Checkout blocked | [OBSERVED] |
| **International address breaks system** | Address format for Japan/UK doesn't fit US form fields | Low-Medium | Can't ship internationally | [THEORETICAL] |

**Amended:** 2026-08-27 (auto-applied, triangulated — ECL-AUDIT-2026-08-27). **Rows 1 and 2** rewrote their *mechanism*, not their risk. Row 1 named a third-party address-suggest service: the storefront integrates none (its map composable resolves only markers, and the sole in-form suggestion list filters a fixed server-supplied country list), so the reachable mechanism is the browser's own autofill on inputs that declare no `autocomplete` attribute. Row 2 named a "strict regex": the UI-kit input carries no `pattern` and the form's field rules are trim/max-length/required only, a separate apartment/suite field exists, and an address containing `#`, `/`, an apostrophe and an umlaut was accepted verbatim live — so the reachable failure shape is max-length truncation plus server-side provider rejection. Rows 3 and 4 confirmed unchanged: postal code is free text with no client-side city cross-check, and the field set is fixed while only the region select adapts to the selected country (it stays disabled and non-required for a country with no region data). **Note:** row 1's corrected mechanism now overlaps §7.1 row 2; that was flagged rather than merged, because a DUPLICATE merge would move citations between a section with single-digit demand and one with several hundred.

---

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
| **JavaScript disabled** | The storefront is a single-page application whose entry document ships an empty mount element and a module script with no `noscript` fallback, so with JS disabled or blocked the page renders nothing at all — there is no form to submit and no message explaining why | Low | Blank page, no diagnosable error | [OBSERVED] |
| **Cached page stale data** | User back-buttons to checkout page; sees old prices/inventory | Low-Medium | Checkout with stale state | [OBSERVED] |
| **Third-party script blocking** | Ad blocker or privacy tool blocks payment script | Low-Medium | Silent payment failure | [OBSERVED] |

**Amended:** 2026-08-27 (auto-applied, triangulated — ECL-AUDIT-2026-08-27) — §7.1. **Row 3** only: the old description ("form submits but nothing happens", "404 or confusing error") is a server-rendered-form symptom that cannot arise on this platform. The storefront entry document mounts an empty element and loads a module script with no `noscript` fallback, and the served HTML confirms no `noscript` element is present, so the JS-disabled symptom is a blank page rather than a broken submit. Rows 1, 2, 4 and 5 confirmed unchanged; note that row 1 is mitigated for the checkout CTA specifically by a sticky bottom bar that duplicates the order button at narrow widths, and that row 2's mechanism is anchored in the address form declaring no `autocomplete` attribute on its text inputs.

---

### 7.2 Form Input Edge Cases

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Paste into form field triggers validation twice** | Paste + change event fires validation before user expects | Low | Confusing error states | [OBSERVED] |
| **Special characters silently truncated rather than rejected** | Name and address fields validate on length only — no character-class regex exists — so apostrophes, hyphens and diacritics are accepted verbatim, and the real risk is a long name being cut at the field's max length with no warning that the stored value differs from what was typed | Low | Wrong name on the order/shipment | [OBSERVED] |
| **Numeric field accepts leading zeros** | User types "01234" for house number; system treats as octal | Low | Address validation issue | [THEORETICAL] |
| **Required field validation off-screen** | Error message for required field not visible; user thinks form is complete | Low-Medium | Stuck on checkout | [OBSERVED] |

**Amended:** 2026-08-27 (auto-applied, triangulated — ECL-AUDIT-2026-08-27) — §7.2. **Row 2** only: "rejected by regex" has no code path — the shared UI-kit input declares no `pattern` attribute and every form field rule is length-and-required only, and a name containing both an apostrophe and a diacritic was accepted verbatim live. The reachable failure shape is silent max-length truncation, so the description and Impact were rewritten to name it. Rows 3 and 4 confirmed unchanged (numeric coercion applies only to explicitly numeric inputs, so a leading zero in a postal code is preserved as text; required fields are marked and gate submission, which is what makes an off-screen error reachable on a long form at narrow widths). **Row 1 was NOT confirmed** and is recorded in `reports/ba/ecl-proposals-2026-08-27.md`: its described double-validation-on-paste has no code path here, but absence of a mechanism is not evidence the pattern never occurred, so its `[OBSERVED]` marker is a status question for a human rather than an auto-apply.

---

### 7.3 Loading States & Race Conditions

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Double-click checkout button** | User sees slow load, clicks "Place Order" twice | Medium | Duplicate order | [OBSERVED] |
| **Loading spinner doesn't disable button** | User clicks button during loading; multiple requests sent | Low-Medium | Duplicate order/payment | [OBSERVED] |
| **Modal doesn't prevent interaction** | User clicks element behind loading modal; unexpected action triggered | Low | Confusing behavior | [OBSERVED] |

### 7.4 Mobile & Responsive Layout Edge Cases

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Above-the-fold element hidden at narrow widths** | A logo, CTA, or nav control that renders correctly on desktop is clipped, overlapped, or pushed off-screen at or below the narrowest declared breakpoint in the storefront's breakpoint scale (`BREAKPOINTS.xs` in the UI-kit constants — do not transcribe the value, read it from there; common device widths sit below it). Some flows mitigate this with a sticky bar that re-pins the primary CTA, so a test must confirm the specific control, not the page | Medium | Branding/functional element invisible to mobile users | [OBSERVED] |
| **Hamburger menu content not fully enumerated by testing** | The mobile nav collapses into a hamburger menu whose contents differ from the desktop mega-menu (fewer/reordered items), and a test pass that only checks the desktop nav misses regressions in the collapsed version | Medium | Broken/incomplete mobile navigation ships undetected | [OBSERVED] |
| **Cross-browser rendering divergence on mobile** | The same responsive layout renders correctly in one mobile browser engine (e.g. Safari iOS) but breaks in another (e.g. Chrome Android) — vendor-prefixed CSS, viewport unit handling, or safe-area-inset differences | Low-Medium | Browser-specific mobile bugs missed by a single-engine test pass | [OBSERVED] |
| **Orientation change loses in-progress state** | Rotating the device between portrait and landscape mid-flow (e.g. mid-checkout form fill) resets scroll position, collapses an expanded section, or drops unsaved input | Low | Frustration, potential data loss on a long form | [THEORETICAL] |
| **Touch/hover-only interaction has no mobile equivalent** | A desktop interaction that depends on `:hover` (a tooltip, a reveal-on-hover swatch) has no tap-triggered equivalent on touch devices, making the information or control unreachable on mobile | Low-Medium | Feature effectively missing on mobile despite existing in the DOM | [OBSERVED] |

---

**Amended:** 2026-08-27 (auto-applied, triangulated — ECL-AUDIT-2026-08-27) — §7.4. **Row 1** only, on two counts. It hardcoded a pixel width, which the repo's GOLDEN RULE forbids in a file other skills read — the storefront declares its breakpoint scale in the UI-kit constants (narrowest `xs`), and a transcribed number goes stale silently at the next redesign; the row now points at that source instead. It also omitted that the checkout CTA specifically is re-pinned by a sticky bar at narrow widths, which was observed live and which makes a page-level "is it visible" assertion pass while a control-level regression hides. Rows 2, 4 and 5 confirmed unchanged: the mobile navigation is a separate component tree with its own menu set (observed to differ materially from the desktop header), the layout re-flows on viewport change, and the collapsed nav provides tap-expandable equivalents for the desktop hover mega-menu. **Row 3 was NOT confirmed** — an engine-divergence claim is impossible to observe from a single-engine lane, and WebKit is unsupported on this platform's harness at all, so it is recorded in the proposals file with a recommendation that it be marked as covered by manual/device-cloud verification rather than left looking unaudited.

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
| **Variant present but not visible** | The variations widget is a filtered, sorted and paginated projection, and the availability control that feeds it defaults to on and persists per browser — so a real variant can be off the current page, excluded by an active variation filter, or hidden as out of stock. Establish which projection is in effect before calling a variant missing; the defect is a variant absent from an unfiltered, unpaginated, availability-off view | Low-Medium | User thinks size unavailable | [OBSERVED] |
| **Listing price and variant price disagree** | A listing card shows the parent's minimum-variation price while the detail page shows the selected variation's own price — two distinct fields on the same response. Until a variant is selected the detail page shows no price at all and the add-to-cart control is disabled, so the comparison is only meaningful once a selection resolves | Low | Price inconsistency | [OBSERVED] |
| **Incorrect variant grouped** | Variant "Blue S" shown under wrong parent product | Low | Wrong item ordered | [OBSERVED] |

---

**Amended:** 2026-08-27 (auto-applied, triangulated — ECL-AUDIT-2026-08-27) — §8.2. **Rows 1 and 2** changed. Row 1 attributed the symptom to the system "hiding" a variant, which named none of the three orthogonal reasons a variant is legitimately not on screen — pagination, an active variation filter, or the storage-backed availability control that defaults to on — so a case written from it reports the widget working as a bug. Row 2 asserted a caching cause the evidence does not support; the real, checkable shape is that the listing reads the parent's minimum-variation price while the detail page reads the variation's own price, and that no price exists at all before a selection resolves. **Source:** the variations widget's list/table, filter, sort and pagination surface plus its empty view; the products composable's availability default; the storefront search query selecting both the per-variation price and the parent's minimum-variation price. **Live:** a grid card advertising multiple variations with a "from" price, and its detail page rendering per-axis option groups with no price and a disabled add-to-cart control labelled "select options to proceed".

---

## 9. Review & Rating System

### 9.1 Fake & Manipulated Reviews

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Coordinated fake positive reviews** | Suspicious cluster of 5-star reviews within same hour from new accounts | Low-Medium | Trust erosion | [OBSERVED] |
| **Revenge negative reviews** | User leaves a 1-star review without having purchased. The stored review record carries no order reference and no verified-purchase flag, so "no order linked" is the state of EVERY review and cannot be used as the proof — moderation status is the only discriminator | Low-Medium | Unfair rating | [OBSERVED] |
| **Review from competitor account** | Review text contains competitor product name promoting alternative | Low | Trust issue | [OBSERVED] |
| **Incentivized reviews not disclosed** | Seller sends coupon code post-purchase with implicit expectation of 5-star review | Low-Medium | Fake review violation | [OBSERVED] |

**Amended:** 2026-08-27 (auto-applied, triangulated — ECL-AUDIT-2026-08-27). **Row 2** was **DRIFT**: it named "proof: no order linked" as the detection signal, but the review entity has no order reference or verified-purchase field of any kind, so that predicate is true of every review on the platform and an agent asserting on it would flag 100% of records. The pattern itself is unchanged and reachable; only its stated proof mechanism was wrong. Rows 1, 3 and 4 were CONFIRMED unchanged. **Docs:** the storefront guide documents review authoring as entered from a completed order, so the *authoring path* is purchase-gated while the *record* retains no evidence of it. **Source:** the review entity exposes only title/body/rating/user/entity/store/status/images; no order or verified-purchase field exists anywhere in the module's core model set, and the review search criteria offer no such filter. **Live:** review cards on a product page render stars, author and body with no verified-purchase indicator; review moderation status is the only server-side discriminator exposed.

---

### 9.2 Review Display Issues

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Review ordering biases perception** | The review list exposes a single ordering (by date) with no relevance or helpfulness ranking, so whichever reviews happen to be most recent dominate the first page regardless of rating distribution | Low-Medium | Biased perception | [OBSERVED] |
| **Review count doesn't match displayed reviews** | Product says "47 reviews" but only 12 are visible | Low | User sees fewer reviews than exist | [OBSERVED] |
| **Helpful vote manipulation** | A reviewer up-votes all negative reviews to push them up the list (voting attack). No native review-helpfulness or voting capability exists — the stored review carries no vote field and the list exposes no vote control — so this applies only to a deployment that adds one | Low-Medium | Skewed perception | [THEORETICAL] |

---

**Amended:** 2026-08-27 (auto-applied, triangulated — ECL-AUDIT-2026-08-27) — §9.2. **Rows 1 and 3** were **DRIFT**: both named a review-helpfulness feature — a "Helpful" sort and per-review votes — that does not exist on this platform, so an agent following either row would look for a control that is never rendered. Row 1 was rewritten to the real ordering risk; row 3 keeps the generic attack shape, records that it needs a deployment-added capability, and drops to `[THEORETICAL]` because the surface it attacks is absent. Row 2 was CONFIRMED unchanged — it is the reachable one, and moderation status is its mechanism. **Docs:** the storefront guide documents the review list as config-gated product-page content and describes no helpfulness, ranking or voting behaviour. **Source:** neither the review entity nor the list DTO the storefront renders carries any vote or helpfulness field, and the review search criteria offer no such sort; review status is the only visibility gate. **Live:** the review widget exposes one ordering control, by date, and no vote affordance on any card; the aggregate review count is rendered separately from the list body. Note the deliberate consequence: dropping row 3 to `[THEORETICAL]` lowers this section's `[OBSERVED]` share and therefore its product-value bump — that is the evidence being followed, not a reason to leave the row wrong.

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
| **Underlying REST endpoint returns 500 instead of a documented empty/degraded response** | A module's backing API returns an unhandled 500 (rather than an empty result set or a typed error) when it is misconfigured, has zero records, or its own dependency is unavailable. A **disabled** module is the separate, correct case — `BL-CROSS-003` specifies 404 there and names 500 as the violation — so a 404 is not this pattern; the trap is that a 404 alone cannot tell an operator "module disabled" from "route wrong" | Medium | Blade/grid throws instead of showing an empty state; masks the real cause | [OBSERVED] |
| **Grid shows stale/cached content with no "data may be out of date" signal when its source is degraded** | A list blade continues rendering a previous successful response when the live call is failing, giving no indication the displayed data may not be current | Low | Operator acts on stale information without warning | [THEORETICAL] |

---

**Amended:** 2026-08-27 (auto-applied, triangulated — ECL-AUDIT-2026-08-27). **Row 2** was **DRIFT**: it listed "its module is disabled" among the triggers for an unhandled 500, but the invariant this section declares itself governed by, `BL-CROSS-003`, specifies **404** as the *correct* response for a disabled module and names 500 as the violation. The row therefore folded the desired behaviour into the anti-pattern, and an agent reading it could file a correct 404 as a defect. Rows 1 and 3 were CONFIRMED unchanged. **Source:** the Admin SPA's global HTTP-error handler routes a failure to the blade error state only when a blade is currently open and the event was not already default-prevented, so an error outside those conditions surfaces nowhere; a separate handler clears the blade's error on *any* subsequent successful request, independently of whether the blade's rendered content was refreshed. **Docs:** an Admin SPA section is registered by its own module at runtime, with no platform-side placeholder when the module is absent. **Live:** requesting an unresolvable blade route fell through to the default workspace with no error of any kind, while the target module's menu entry was present and the module reported installed.

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
| **Cart amount changes on currency switch — re-resolution, not conversion** | The amount for an item already in the cart can differ from what the shopper saw when adding it, because the selected currency is a stored preference (local storage → contact preference → store default, applied via a full reload) and changing it re-resolves every line against that currency's own price list. The platform does NOT convert by exchange rate (`BL-PRICE-005`), so there is no FX-drift bug to hunt; a currency with no covering price list yields no price at all rather than a converted one | Low-Medium | Unexpected amount, or no price at all | [OBSERVED] |
| **Language doesn't match locale** | User in France sees English site; address validation expects English format | Low | UX friction | [OBSERVED] |
| **Missing currency symbol** | Price displays as "50" without "$"; user in another currency confused | Low | Confusion | [OBSERVED] |

**Amended:** 2026-08-27 (auto-applied, triangulated — ECL-AUDIT-2026-08-27). **Row 1** was **DRIFT**, and of a kind worth naming: it described an exchange-rate conversion between add-to-cart and checkout, a mechanism this platform does not implement — and in doing so it contradicted `BL-PRICE-005`, the very invariant Appendix D maps this section to, whose Rule states prices are NOT converted by exchange rate and whose *violation signal* is precisely "prices appear to be exchange-rate conversions". The oracle was therefore describing a violation as the expected pattern, and disagreeing with itself across two files. Rewritten to the real mechanism: currency is a stored shopper preference applied via a reload, and changing an existing cart's currency re-resolves each line against that currency's own price list. The pattern **name** had to change too, since "conversion timing" is what an agent reads. Rows 2 and 3 CONFIRMED unchanged. **Source:** a price entity carries a price-list id and a currency with no rate field; the storefront currency composable resolves saved-preference → contact → store default and reloads; a dedicated cart-currency mutation returns the whole re-resolved cart; the language composable reads a pinned locale, a URL segment or the store default, with no browser-language or geo detection. **Live:** the header offers several currencies each with its own symbol and 15+ languages with the store default active. **Not evidence either way:** the tested environment has no product price list for one of the offered currencies, which is a seed-data gap and the documented correct behaviour for an uncovered currency.

---

### 12.2 International Shipping & Taxes

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Shipping to restricted country** | User ships to country under trade sanctions; order placed but can't ship | Low-High | Legal issue | [THEORETICAL] |
| **VAT/GST calculation error** | International order charged wrong tax percentage | Low | Audit issue | [OBSERVED] |
| **Customs duty not disclosed** | User shocked by duty fee upon delivery | Low-Medium | Customer complaints | [THEORETICAL] |

---

## 13. Business Logic & Workflow Edge Cases

### 13.1 Order Fulfillment Issues

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Partial order fulfillment not communicated** | User ordered 5 items; 3 ship today, 2 ship later; user unaware | Low-Medium | Support tickets, confusion | [OBSERVED] |
| **Backorder handling unclear** | System accepts backorder but shipping date estimate is wrong | Low-Medium | Customer frustration | [OBSERVED] |
| **Order cancellation after partial ship** | User cancels order; one unit already shipped; system in inconsistent state | Low | Logistics chaos | [OBSERVED] |

### 13.2 Subscription & Recurring Billing

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Subscription renewal fails silently** | Card declines at renewal; user not notified; account suspended without warning | Medium | Service interruption, support burden | [OBSERVED] |
| **Cancel subscription still charges** | User cancels but next billing date still occurs | Low-Medium | Refund needed | [OBSERVED] |
| **Proration calculation wrong** | User cancels mid-month; proration calculation doesn't match what user expects | Low | Billing dispute | [OBSERVED] |

### 13.3 Loyalty & Points Edge Cases

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Points not credited after purchase** | User completes purchase; loyalty points never appear | Low-Medium | Support tickets | [OBSERVED] |
| **Points never expire — there is no expiry mechanism** | Points are a running balance carried on each operation-log row (Earned / Redeemed only): no per-point validity date, no expired operation type, no expiry sweep, and the balance read applies no date filter. A program's own activation period bounds the PROGRAM, not the points it already awarded. So any expiry policy stated in terms and conditions is unenforceable by the platform and the balance accrues without bound. Do not test for "redeeming an expired point" — that state is unrepresentable | Low | Stated expiry policy unenforceable; unbounded points liability | [OBSERVED] |
| **Double-counting bonus points** | Two accrual paths can post against one order: more than one active program matching it, and a retried background job re-processing it. Dedup is keyed on (object type, object id, operation type), so an Earned and a Redeemed legitimately coexist on one order while a second Earned must not. Referral bonuses are not modelled by the platform — reward rules are fixed points or a percentage of order value — so the real vectors are concurrent programs and job retries (see `BL-LOY-007`) | Low | System error | [OBSERVED] |

---

**Amended:** 2026-08-27 (auto-applied, triangulated — ECL-AUDIT-2026-08-27) — §13.3. **Row 2** was **DRIFT** and is the sharper of the two: it asserted, as `[OBSERVED]`, that expired points can still be redeemed — but this platform has no point-expiry mechanism of any kind, so "an expired point" is not a representable state and the stated failure mode cannot occur. The reachable risk is the inverse and is now what the row says: points never lapse, so a stated expiry policy is unenforceable and the balance is an unbounded liability. This is a DRIFT and **not** a RETIRE: the exposure underneath is real and the section number is a citation contract, so retiring would delete a live risk and orphan the citations, while leaving it sent testers after a redemption-gate bug that cannot exist. **Row 3** was DRIFT in its example only: referral bonuses are not modelled here (reward rules are fixed points or a percentage of order value), and the row was materially less precise than `BL-LOY-007`, the invariant it depends on — restated to the platform's two real double-accrual vectors, concurrent matching programs and background-job retries. Row 1 CONFIRMED unchanged. **Source:** the loyalty operation log carries only user, program, object, operation type (earned/redeemed), amount and balance — no validity date and no expired type; the balance read returns the running balance from the latest row with no date filter; a program's start/end dates bound the program, not awarded points; no expiry service exists in the module's service set; and the accrual dedup gate is keyed on object type, object id and operation type. **Docs:** the loyalty guide describes accrual, redemption, balance and a pay-with-points method, and is silent on expiry and on referral rewards. **Live:** the points-history surface exposes operation, type, date, amount and a balance with no expiry column, and earns more than a month old still count toward the balance. No points were spent, reset or manipulated to establish this.

---

## Appendix A: How to Add Patterns

### Template for New Edge Cases

```markdown
### [Category] [Specific Issue]

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
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

**Agent rule:** After any catalog/price/inventory change in admin, **poll** the storefront for the expected value rather than waiting a fixed interval, and treat a timeout as index lag rather than a product failure. A 60s wait is not a safe bound: incremental indexing is a queued background job whose latency comes from configuration and queue depth, not from a constant — event-based indexing fires on the change itself, time-based incremental indexing is a separate recurring job that is disabled by default and runs on a configurable interval when enabled, and an indexing pass that cannot take the cluster-wide indexation lock is skipped entirely rather than merely delayed (ECL-14.7 row 2 already records lag exceeding a minute under load).

**Amended:** 2026-08-27 (auto-applied, triangulated — ECL-AUDIT-2026-08-27). The four pattern rows are CONFIRMED unchanged; the **section-level Agent rule** was DRIFT — it prescribed an unconditional 60-second wait, which is not a bound the platform offers and which contradicts ECL-14.7 row 2 in this same chapter. **Docs:** the Platform Developer Guide's incremental-indexing article distinguishes event-based indexing (triggered when a product changes) from time-based incremental indexing — a separate recurring background job, disabled by default, on a configurable interval whose documented default is several minutes. **Source:** the Search module's indexing background-job class enqueues per-document indexing onto prioritised Hangfire queues and wraps each indexing run in a cluster-wide distributed indexation lock, reporting "already in progress" and skipping the pass when the lock cannot be taken — so latency is governed by configuration and queue depth, not a constant. **Live:** the storefront search surface returns the price, stock-quantity and facet-count fields all four rows concern, so every row's subject is reachable on the deployed build.

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
| **Add-to-cart is gated until every variant option resolves — a disabled control here is the guard working** | On a variation or configurable PDP the add-to-cart control is not clickable until the selection resolves to a single purchasable variant: it renders disabled with a "select options" affordance and no price, and on a variation product the quantity/add control appears only once the last option is picked. Reporting that disabled state as a missing capability is a false bug (REAL-USER rule); the real risk is the inverse — a build in which the control becomes clickable while a required option or section is unset, which orders the parent SKU. The non-UI path is covered by the API-layer row below | Low | False-positive bug reports; a regression here orders the parent instead of the variant | BL-CAT-006 | ECL-8.2 | [OBSERVED] |
| **VirtoFrontend_UI_Layout property absent** | B2C layout not shown because property missing from product — shows B2B table instead | Low-Medium | Wrong layout in test | BL-CAT-006 | ECL-8.1 | [OBSERVED] |
| **Image not switching on variant select** | Variant image URL present in API response but main PDP image doesn't update on option click | Low | Visual confusion, wrong variant ordered | BL-CAT-006 | ECL-8.2 | [OBSERVED] |
| **Unavailable combo not blocked** | Two options selected forming an out-of-stock combination — 'Add to Cart' stays enabled, error only at API | Low-Medium | Order for unavailable variant | BL-CAT-006 | ECL-2.1 | [OBSERVED] |
| **Required configuration section omitted at the API layer** | A direct GraphQL `addItem` call submits only some of a configurable product's sections, omitting a required one — the mutation must reject it (non-empty `errors[]` or zero items added), not silently accept a partially-configured line, even though the storefront UI already blocks this via the disabled Add-to-Cart button | Low | Incomplete configuration reaches an order via a non-UI client | BL-CAT-006 | ECL-2.1 | [OBSERVED] |
| **Saved-for-Later loses configuration on a bulk, mixed-type move** | Moving several configurable line items (of different configuration shapes) to Saved-for-Later in one bulk call must preserve each item's own `configurationItems` count and type identity — not average, drop, or cross-contaminate them | Low | Configuration silently lost on an item a user expects to restore later | BL-CART-015 | ECL-2.1 | [OBSERVED] |

**Amended:** 2026-08-27 (auto-applied, triangulated — ECL-AUDIT-2026-08-27). **Row 1** was **DRIFT**: it claimed the add-to-cart control is clickable before any option is selected. The storefront gates it explicitly — on a variation PDP the control renders disabled with a "select options" affordance and no price, and is replaced by the quantity/add control only once the final option resolves the variant; on a configurable-sections PDP it renders disabled until the sections are configured. The row was steering agents to file the working guard as a defect, and its pattern name asserted the opposite of the shipped behaviour; the residual risk it was protecting against now lives at the non-UI layer, which the required-configuration-section row already covers. **Source:** the cart validation pipeline in the xAPI cart module, plus `BL-CAT-006`. **Docs:** the storefront user guide's product-variation and product-configuration pages describe a selection-driven flow in which required options must be chosen and unavailable combinations are visibly disabled. **Live:** on both a variation PDP and a configurable-sections PDP the add-to-cart control was observed disabled before selection, with no price. **Rows 2, 4 and 6 were NOT confirmed this run** and are recorded in `reports/ba/ecl-proposals-2026-08-27.md`: row 2 is UNGROUNDED on all three axes, row 4 is CONTRADICTORY against the documented behaviour, and row 6 claims a bulk scope that its own cited invariant explicitly disclaims.

---

### 14.6 Payment Processor Differences (VC-specific)

| Pattern | Description | Frequency | Impact | BL Invariant | ECL Ref | Status |
|---------|-------------|-----------|--------|-------------|---------|--------|
| **Inline cart payment is single-step checkout ONLY — the multistep setting moves the card form to the payment page** | Where single-page checkout is configured, a processor that allows cart payment renders its card form directly in the cart page's own payment section rather than on the dedicated payment route, so an agent that navigates to the payment route first misses the form entirely. Where multistep checkout is enabled the gate inverts: the storefront computes cart payability as "multistep is OFF **and** the method allows cart payment", so no processor renders inline on the cart and card entry belongs to the dedicated payment step reached after Place order. Read the store's multistep-checkout setting before deciding which page holds the card form | High | Test never reaches payment — in either direction, depending on which flow the store is configured for | BL-PAY-004 | ECL-1.1 | [OBSERVED] |
| **Datatrans is the only redirect processor — in single-step checkout** | In single-page checkout Datatrans has no inline cart-payment component, so selecting it and clicking Place order routes to the dedicated payment page for card entry, while CyberSource, Skyflow **and** Authorize.Net all render inline on the cart page (the row above) — the storefront's shared payment component branches on the payment type across exactly those three and still carries an explicit TODO for Datatrans cart payments. Under multistep checkout the distinction disappears: every method defers card entry to the payment step, so "only Datatrans redirects" holds for single-step configurations only | High | Agent tries wrong page / misses the inline form | BL-PAY-004 | ECL-1.1 | [OBSERVED] |
| **Payment iframe blocked by ad-blocker** | Payment script (CyberSource/Skyflow) blocked silently — form appears blank, no error shown | Low-Medium | Silent payment failure | BL-PAY-001 | ECL-7.1 | [OBSERVED] |
| **Double-click Place Order** | Slow connection: user/agent clicks 'Place Order' twice — two orders created | Medium | Duplicate order | BL-CHK-002 | ECL-7.3 | [OBSERVED] |

**Amended:** 2026-08-06 (auto-applied, triangulated — ECL-AUDIT-2026-08-06). Row 2 was **DRIFT**: it claimed Skyflow, Authorize.Net and "DataTrance" all redirect after Place Order. Skyflow and Authorize.Net have since moved to `allowCartPayment=true` and render inline on the cart like CyberSource, leaving Datatrans as the only redirect processor — the row was steering agents to the wrong page for two of the three processors it named. **Source:** the storefront's shared payment component renders the CyberSource, Skyflow and Authorize.Net processors inline, keyed on the payment type, with an explicit `TODO` noting Datatrans cart payments are not yet supported; the checkout composable's `canPayFromCart` gates on the payment method's `allowCartPayment` flag generically, not on a processor allowlist. **Live:** selecting Authorize.Net on the cart kept the page on `/cart` with no redirect.

**Amended:** 2026-08-27 (auto-applied, triangulated — ECL-AUDIT-2026-08-27). **Rows 1 and 2** were **DRIFT** for one shared reason: both stated the inline-on-cart behaviour unconditionally, omitting the multistep-checkout gate. The storefront computes cart payability as "multistep checkout is OFF **and** the method allows cart payment", so on a store configured for multistep no processor renders inline on the cart and every method — not only Datatrans — defers card entry to the dedicated payment step. As written, row 1 sent an agent to the cart looking for a form that is not there on a multistep store, and row 2's "only Datatrans redirects" was false in that configuration. The 2026-08-06 processor list above was **re-verified unchanged** this run: the shared payment component still renders exactly the CyberSource, Skyflow and Authorize.Net processors inline and still carries its TODO for Datatrans. Note that `BL-PAY-004` already carried this multistep caveat in full — the ECL rows had drifted away from their own cited invariant, which is a cheap drift detector worth reusing. **Source:** the checkout composable's cart-payability computed value and its post-place-order route decision; the shared payment component's payment-type branch. **Docs:** the storefront developer guide documents the multistep toggle as a theme setting and documents the multistep funnel's separate payment step that single-step checkout does not have. **Live:** on a single-step-configured store, selecting a card processor on the cart rendered the hosted card fields inline on the cart page with no navigation away from it.

---

### 14.7 Background Job Timing (Hangfire)

| Pattern | Description | Frequency | Impact | BL Invariant | ECL Ref | Status |
|---------|-------------|-----------|--------|-------------|---------|--------|
| **Order confirmation email delay** | Email sent via Hangfire — may arrive 5-30s after order confirmation page shown | High | Email assertion fails if checked immediately | BL-NOTIF-001 | ECL-10.1 | [OBSERVED] |
| **Reindex after a catalog change is not a timed queue — it can be abandoned, or never scheduled at all** | Incremental reindexing has two independent mechanisms and "queued behind other jobs, lag exceeds 60s" describes neither. **Event-based** indexing enqueues per-document jobs onto one of three prioritized background queues, so lag tracks the priority the calling module chose, not queue depth alone. Any indexation pass first takes a cluster-wide distributed lock with a **zero** timeout and, if another indexation already holds it, **gives up immediately** rather than waiting — the pass is abandoned, not delayed. **Time-based** incremental indexing is a separate recurring job that is **disabled by default** and is frequently absent from a deployment's registered recurring jobs, so nothing later picks up a change whose event-based enqueue was lost; that job also runs with zero automatic retries. Background jobs may additionally be processed by a different platform instance than the one serving the request. Check the job dashboard for what is actually registered instead of assuming a documented cadence | Low-Medium | Lag is unbounded rather than bounded at ~60s: a change can stay unindexed indefinitely, and a fixed "wait 60s then assert" step then produces a spurious failure that reads as a catalog or search defect | BL-SRCH-003 | ECL-2.3 | [OBSERVED] |
| **Inventory sync job** | Inventory decrement happens via background job — brief window where item shows as in-stock post-purchase | Low | Oversell window | BL-CROSS-009 | ECL-2.1 | [OBSERVED] |

**Amended:** 2026-08-27 (auto-applied, triangulated — ECL-AUDIT-2026-08-27). **Row 2** was **DRIFT**: it described reindex lag as a queue-depth delay bounded at roughly a minute. Both halves are wrong in the direction that costs a run. The indexation pass takes a cluster-wide lock with a zero timeout and abandons itself on contention rather than queuing behind the holder; per-document indexing rides three prioritized queues; and the time-based incremental job that would otherwise act as a safety net is disabled by default, runs with no automatic retries, and was observed **absent** from the registered recurring jobs on the environment — so the worst case is not a longer wait, it is no reindex at all. This is the same evidence that corrected `ECL-14.2`'s section-level agent rule in this run; the two sections must not be applied apart. **Source:** the search module's indexing background-job class — its conditional recurring-job registration, its zero-timeout distributed lock with an "already in progress" bail, its per-priority queue attributes, and its zero-retry attribute on the changes job. **Docs:** the platform developer guide's incremental-index-updates section states the time-based type re-indexes every few minutes by default and is disabled by default, and its scalability guidance recommends processing background jobs on a separate platform instance. **Live:** the job dashboard listed eight registered recurring jobs across two servers, none of them the index-changes job.

---

### 14.8 Environment / Module Version-Schema Drift

Triggered by VCST-5651: a "Loyalty missions" pre-release build (vc-module-loyalty PR #14 — `LoyaltyProgramOperationLog.LoyaltyProgramId` renamed to `SourceType`/`SourceId`) was installed on a shared non-prod environment, ran its forward EF Core migration, and was then reverted to the released build **without** a corresponding down-migration. The released build's `LoyaltyRepository.GetLoyaltyProgramOperationLogsByIdsAsync` (queried via `LoyaltyLogicService.GetUserBalanceAsync`) still selects the old column name, which no longer exists → `SqlException: Invalid column name 'LoyaltyProgramId'` surfaces as an unhandled GraphQL error and `data.cart: null`. No `BL-*` invariant governs environment/schema integrity today — this whole subsection is a coverage gap, not a violation of an existing rule.

| Pattern | Description | Frequency | Impact | BL Invariant | ECL Ref | Status |
|---------|-------------|-----------|--------|---------------|---------|--------|
| **Module downgraded after a forward schema migration** | A newer build's migration renames/drops a column that an older, already-released module build still queries by its old name. The module binary is reverted to the older release without a matching down-migration, so the running code queries a column the live schema no longer has (`Invalid column name`) — the query throws instead of returning data, for every user who exercises that code path, not just one row | Low (non-prod/QA envs where pre-release builds get installed then reverted) | Whole query fails; entire parent object (e.g. `cart`) resolves to `null` rather than a scoped error | — (gap) | — | [OBSERVED] |
| **Module upgraded before its migration has actually run** | The inverse direction: the module binary is bumped to a newer release (or a pre-release that adds/renames columns) but the target database's migration was never applied — the newer code queries/writes a column or table that does not exist yet. Same `Invalid column/object name` signature as the row above, opposite cause | Low | Same as above | — (gap) | — | [THEORETICAL] |
| **One side of a shared version contract rolled back independently** | Two modules share a data contract (e.g. an evaluation-context field, a cross-module event payload), **or the storefront frontend declares a minimum version for a module it consumes**. One side is reverted to — or simply left on — an older release while the other stays on the build that assumes the new shape, so reads/writes between them desync. The platform's modules health check is a **load** check (it reports only modules that failed to load) and per-module `errors`/`validationErrors` stay empty, so a version-contract violation leaves the whole backend reporting Healthy; the storefront's own startup check is the only surface that names the mismatch, and it degrades to a log warning if that check itself throws | Low | Silent cross-module data corruption or intermittent query failures, hard to attribute to either module in isolation; the consumer warns only that features "may be unavailable, degraded, or unstable" without naming which | — (gap) | — | [OBSERVED] |
| **Pre-release install pollutes a shared non-prod schema for unrelated test runs** | A pre-release artifact is installed on a shared QA/dev environment to validate one ticket, then the module is reverted to the released version once that ticket is closed — but the migration it ran is never rolled back. A later, functionally unrelated regression run against the same environment can hit the identical schema/code mismatch with zero connection to the feature it is actually testing, and reads as a flaky/unrelated failure | Low | Wastes triage time; a real environment-integrity defect masquerades as test flakiness in an unrelated suite | — (gap) | — | [OBSERVED] |

**Amended:** 2026-08-27 (auto-applied, triangulated — ECL-AUDIT-2026-08-27). **Row 3** was **DRIFT** in three ways: it scoped the pattern to two *modules*, when the storefront frontend also declares a minimum version per module it consumes and is the only surface that reports a violation; it left the row `[THEORETICAL]` although the condition is directly observable without any destructive action; and it asserted the per-module health check stays green without saying *why*, which is what makes the pattern undetectable rather than merely unnoticed. The pattern name was widened accordingly, since "dependent modules" is what an agent reads and it excluded the case actually seen. **Source:** the platform's modules health checker derives its verdict solely from the set of modules that failed to *load* and otherwise returns "All modules are loaded", never inspecting a schema or a version contract; the storefront's app runner computes an outdated-module set at startup and renders one `<moduleId> <expectedVersion> >= <backendVersion>` line per violation, inside a try/catch whose only failure path is a log warning. **Docs:** the deployment guide warns that a module version incompatible with the Platform may surface only as a "Degraded" status to be chased through logs; the platform developer guide's database-model tutorial confirms forward migrations are applied automatically in a module's `PostInitialize()` while the `Down()` direction is a developer-console operation the platform never runs. **Live:** on the environment a module was installed one minor version below its consumer's declared minimum, with empty `errors`/`validationErrors`, every module reporting no errors and the platform health endpoint reporting all modules loaded — while the storefront simultaneously warned the backend was incompatible.

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

Screen-reader and assistive-technology interaction patterns surfaced by manual/automated WCAG 2.2 AA audits. **Note:** `business-logic.md` carries Domain 21 **Accessibility (`BL-A11Y`)** — `BL-A11Y-001` keyboard operability and focus management, `BL-A11Y-002` accessible naming and label association, `BL-A11Y-003` colour contrast and non-colour status differentiation, `BL-A11Y-004` programmatic status/state/role correctness — all `[P1-data]`, and all grounded in the external WCAG 2.1/2.2 success criteria rather than in Virto documentation, which states no conformance target. Cite the invariant a row endangers; the `Status` column records the evidence, not the exposure. **Still uncovered by any invariant:** structural semantics (WCAG 1.3.1) — a list-like structure exposing no `list`/`listitem` roles violates no `BL-A11Y-*` rule as written; see `bl_proposals`.

### 15.1 Screen Reader Interaction Patterns

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Modal open/close not announced** | A modal dialog gains focus visually but a screen reader user gets no announcement that a dialog opened, what it contains, or that closing it returned focus to the triggering control | Medium | Screen-reader users lose context, may not know a modal is present | [OBSERVED] |
| **List semantics not exposed** | A visually list-like structure (product grid, filter options) is not marked up with list/listitem roles, so a screen reader announces it as an undifferentiated block of text | Medium | Screen-reader users can't navigate item-by-item or get a count | [OBSERVED] |
| **Form field lacks a programmatically associated label** | An input is visually adjacent to its label text but the two aren't associated via `<label for>`/`aria-labelledby`, so a screen reader announces the field with no name | High | Screen-reader users can't tell what a field is for | [OBSERVED] |
| **Validation error not announced at the point of failure** | A field-level validation error appears visually (red text/border) but isn't associated to the field via `aria-describedby` or announced via a live region, so a screen-reader user submits again with no idea what's wrong | High | Screen-reader users are stuck in a silent failure loop | [OBSERVED] |
| **Interactive control has no accessible name** | An icon-only button (cart, search, close) has no `aria-label`/visible text, so a screen reader announces only "button" | Medium | Screen-reader users can't identify the control's purpose | [OBSERVED] |

---

**Amended:** 2026-08-27 (auto-applied, triangulated — ECL-AUDIT-2026-08-27). No pattern row changed. The **chapter-15 intro note** was **DRIFT**: it stated that `business-logic.md` carries no `BL-A11Y` domain and that this chapter therefore stands without a BL citation. That domain exists as Domain 21 — `BL-A11Y-001` … `-004`, all `[P1-data]`; `BL-A11Y-004`'s own severity rationale already quotes this section by name, and the covering suite's cases already cite `BL-A11Y-002`/`-004`. The cross-reference was live in one direction and denied in the other. Appendix D's row was corrected in the same edit, and the one genuinely uncovered area — structural semantics under WCAG 1.3.1, which row 2 concerns and which no `BL-A11Y-*` rule states — is now named as a gap rather than hidden inside a blanket denial. **Source:** the UI kit's dialog component renders its root as a plain container with a focus-trap keydown handler and no dialog role, `aria-modal` or accessible name; the input component, by contrast, wires both label association and `aria-describedby` correctly, so rows 3–4 are consumer-side risks rather than kit defects. **Live:** on the storefront the product grid exposed no list semantics, and field-level validation errors appeared as elements carrying no alert role.

---

## Appendix D: ECL → Business Logic Invariant Cross-Reference

Quick lookup: which ECL sections map to which BL-* invariants in `business-logic.md`.

| ECL Section | Description | BL Invariants |
|-------------|-------------|---------------|
| ECL-1.1 Payment Methods | Card expiry mid-transaction, duplicate submission, settlement/fraud mismatch, 3DS/SCA, split payment, retry | BL-PAY-001, BL-CHK-002 |
| ECL-1.2 Session & Timeout | Session expiry during checkout | BL-AUTH-001 |
| ECL-1.3 Coupon & Discount | Stacking, expiry, case normalization | BL-PRICE-001, BL-CART-003, BL-CART-009 |
| ECL-1.4 Layout Shift & Hover Displacement | Hover/state-change layout shift | BL-UI-003 |
| ECL-1.5 Spacing & Design-Token Compliance | Off-grid spacing, stale audit grid | BL-UI-002 |
| ECL-1.6 Overflow & Viewport Scroll | Horizontal scroll, fluid-band overflow | BL-UI-004 |
| ECL-1.7 Alignment in Horizontal Groups | Row height parity | BL-UI-005 |
| ECL-1.8 Touch Target Sizing | Sub-AA touch targets, no spacing buffer | BL-UI-006 |
| ECL-2.1 Race Conditions | Overselling, last-item conflict | BL-CART-002, BL-CAT-001 |
| ECL-2.2 Stock Depletion Notifications | "Only 1 left" nagware, stale inventory cache | BL-CART-002, BL-CAT-001, BL-CAT-007, BL-BOPIS-003 |
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
| ECL-13.2 Subscription & Recurring Billing | Silent renewal failure, proration | — (gap; a native subscription/recurring-billing module exists, is documented and is enabled on the tested deployment, but no BL invariant governs renewal notification, cancellation-vs-open-order, or proration — see `bl_proposals`) |
| ECL-13.3 Loyalty & Points | Points not credited, double-counting | BL-LOY-007, BL-LOY-008 |
| ECL-14.1 GraphQL xAPI Error Patterns | Silent `errors[]`, missing context params | BL-CART-001, BL-CART-002, BL-ORD-001, BL-PRICE-005, BL-CAT-006 |
| ECL-14.2 Search Index Lag | Price/product/facet staleness after admin change | BL-CROSS-002, BL-SRCH-001, BL-SRCH-003 |
| ECL-14.3 B2B Organization Context | Cart isolation loss, role not applied | BL-B2B-001, BL-B2B-005 |
| ECL-14.4 Price List & Currency Edge Cases | Currency unavailable, tier boundary, stale mini-cart price | BL-PRICE-002, BL-PRICE-004, BL-PRICE-005, BL-CROSS-002 |
| ECL-14.5 Configurable Product & Variation Edge Cases | Add-to-cart before selection, required-section omission, bulk SFL | BL-CAT-006, BL-CART-015 |
| ECL-14.6 Payment Processor Differences | Form-location differences, double-click Place Order | BL-PAY-001, BL-PAY-004, BL-CHK-002 |
| ECL-14.7 Background Job Timing | Email delay, reindex lag, inventory sync window | BL-NOTIF-001, BL-SRCH-003, BL-CROSS-009 |
| ECL-14.8 Environment/Schema Drift | Module downgrade without DB rollback; upgrade before migration runs | — (gap; VCST-5651) |
| ECL-14.9 Validator Fault Isolation | Unhandled validator exception nulls the whole cart/order object | BL-LOY-008 (partial); ECL-10.2 |
| ECL-14.10 Admin Order-Edit UI Guards | Cancel-during-refund guard, status preservation on edit | BL-ORD-003, BL-ORD-004 |
| ECL-15.1 Screen Reader Interaction Patterns | Unannounced modals/errors, unlabeled controls | BL-A11Y-001, BL-A11Y-002, BL-A11Y-004 |

**End of Library**
