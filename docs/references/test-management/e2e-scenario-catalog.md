# Comprehensive E2E Scenario Catalog

> Reference file for test-management-specialist agent. Read when creating test cases for any feature domain.

This catalog provides **105 end-to-end test scenarios** across **18 business domains** of the Virto Commerce platform. Use these as the foundation when creating test cases for any feature.

**How to use this catalog:**
1. Identify which domain(s) a feature touches
2. Select relevant scenarios from each domain
3. Expand each scenario into detailed test cases (using the Test Case Template in the agent)
4. Add domain-specific edge cases discovered during UI exploration
5. Map scenarios to regression suites for traceability

## Summary

| # | Domain | Prefix | Scenarios | Priority | Related Suites |
|---|--------|--------|-----------|----------|----------------|
| 1 | Authentication & Registration | E2E-AUTH | 8 | P0/P1 | 01, 02, 08 |
| 2 | Catalog & Product Discovery | E2E-CAT | 8 | P0/P1 | 01, 03, 16 |
| 3 | Search | E2E-SEARCH | 5 | P0/P1 | 03, 26 |
| 4 | Cart Operations | E2E-CART | 8 | P0/P1 | 01, 04 |
| 5 | Checkout Flows | E2E-CHK | 10 | P0/P1 | 04, 06 |
| 6 | Payment Processing | E2E-PAY | 6 | P0 | 06 |
| 7 | Order Management | E2E-ORD | 6 | P0/P1 | 01, 20 |
| 8 | BOPIS (Pickup) | E2E-BOPIS | 5 | P1 | 05, 30 |
| 9 | B2B Quotes & RFQ | E2E-QUOTE | 6 | P1 | 20 |
| 10 | B2B Multi-Organization | E2E-ORG | 7 | P1 | 02, 21 |
| 11 | B2B Company Members & Roles | E2E-MEMBER | 5 | P1 | 02, 21 |
| 12 | B2B Lists & Quick Order | E2E-LIST | 5 | P1/P2 | 13 |
| 13 | Configurable Products & CPQ | E2E-CONFIG | 5 | P1 | 36 |
| 14 | Admin Catalog CRUD | E2E-ADMIN-CAT | 5 | P1 | 16, 19 |
| 15 | Admin Order Management | E2E-ADMIN-ORD | 4 | P1 | 20 |
| 16 | Localization & Multi-Currency | E2E-L10N | 4 | P2 | 10 |
| 17 | Analytics & Tracking | E2E-GA | 4 | P2 | 07 |
| 18 | Security & Compliance | E2E-SEC | 4 | P0 | 08 |
| | **TOTAL** | | **105** | | |

---

## Domain 1: Authentication & Registration (E2E-AUTH)

| ID | Scenario | P | Flow |
|----|----------|---|------|
| E2E-AUTH-001 | Personal account registration → sign-in → profile access | P0 | Register personal account → verify confirmation → sign in → access dashboard → verify profile data |
| E2E-AUTH-002 | Organization account registration → admin role → B2B access | P0 | Register org account → fill company details → verify org created in admin → sign in → verify B2B features (quotes, members, lists) |
| E2E-AUTH-003 | Sign-in → session persistence → sign-out | P0 | Sign in → navigate multiple pages → verify session active → refresh browser → verify still signed in → sign out → verify redirected → verify protected pages inaccessible |
| E2E-AUTH-004 | Password reset → email verification → new password sign-in | P1 | Click "Forgot Password" → enter email → verify reset email sent → click reset link → enter new password → sign in with new password → verify old password rejected |
| E2E-AUTH-005 | Invalid login attempts → account lockout → recovery | P1 | Enter wrong password 5 times → verify lockout message → wait lockout period (or admin unlock) → verify can sign in again |
| E2E-AUTH-006 | Remember me → session expiry → token refresh | P1 | Sign in with "Remember me" → close browser → reopen → verify still authenticated → verify token refresh works |
| E2E-AUTH-007 | Concurrent sessions → sign-in from second device | P1 | Sign in on browser A → sign in on browser B → verify both sessions active → sign out on A → verify B still active |
| E2E-AUTH-008 | Registration validation → duplicate email → weak password | P1 | Try registering with existing email → verify error → try weak password → verify requirements shown → try mismatched confirm password → verify validation |

**xAPI:** `createUser` mutation, `requestPasswordReset`, `resetPassword`, `signIn`, `signOut`
**Verify in Admin:** User appears in Customers → Contacts, Organization appears in Customers → Organizations

---

## Domain 2: Catalog & Product Discovery (E2E-CAT)

| ID | Scenario | P | Flow |
|----|----------|---|------|
| E2E-CAT-001 | Category navigation → product listing → PDP → breadcrumbs | P0 | Homepage → click category → verify product grid → click subcategory → verify filtered products → click product → verify PDP loads → verify breadcrumb trail → click breadcrumb → verify navigation back |
| E2E-CAT-002 | Faceted filtering → chips → clear filters | P0 | Category page → apply brand filter → verify results filtered → apply price range → verify intersection → verify filter chips shown → remove one chip → verify results update → click "Clear All" → verify all products |
| E2E-CAT-003 | Product sorting → price/name/relevance | P1 | Category page → sort by "Price: Low to High" → verify order → sort by "Price: High to Low" → verify reversed → sort by "Name A-Z" → verify alphabetical |
| E2E-CAT-004 | Pagination → load more → page navigation | P1 | Category with 50+ products → verify initial page (default count) → click next page or "Load More" → verify additional products → navigate to last page → verify correct count |
| E2E-CAT-005 | Product detail page → images → specs → reviews | P0 | Navigate to PDP → verify product name, price, SKU → verify image gallery (main + thumbnails) → click thumbnails → verify main image changes → scroll to specs → verify attributes → check reviews section |
| E2E-CAT-006 | Filter by availability → in-stock only | P1 | Category page → check "In Stock" filter → verify out-of-stock items hidden → uncheck → verify all products return → check "Purchased Before" filter (B2B) → verify only previously ordered items |
| E2E-CAT-007 | Virtual catalog → audience-specific view | P2 | Sign in as user with assigned virtual catalog → verify sees only allowed products → sign in as different user → verify sees different catalog → verify prices match catalog assignment |
| E2E-CAT-008 | SEO URLs → breadcrumbs → canonical links | P1 | Navigate via SEO-friendly URL → verify page loads → inspect canonical URL → verify breadcrumbs match URL hierarchy → check meta title/description |

**xAPI:** `products` query, `categories` query, `product` by ID/slug, `searchProducts` with facets, `category` query
**Verify in Admin:** Products blade, Categories tree, Virtual Catalogs, SEO data

---

## Domain 3: Search (E2E-SEARCH)

| ID | Scenario | P | Flow |
|----|----------|---|------|
| E2E-SEARCH-001 | Global search → results page → product click | P0 | Click search bar → type query → verify autocomplete dropdown → press Enter → verify search results page → verify result count → click product → verify PDP loads → verify back navigates to results |
| E2E-SEARCH-002 | Search within category → scoped results | P1 | Navigate to specific category → use search within category → verify results scoped to category → clear category scope → verify global results |
| E2E-SEARCH-003 | Search history → recent queries → clear history | P1 | Search for "laptop" → search for "headphones" → click search bar → verify recent queries shown → click "laptop" from history → verify results → clear search history → verify history empty |
| E2E-SEARCH-004 | No results → suggestions → typo tolerance | P1 | Search for misspelled term → verify "Did you mean...?" suggestion OR fuzzy match results → search for nonexistent term → verify "No results" message → verify suggested categories or popular products shown |
| E2E-SEARCH-005 | Search dropdown → product previews → "View All" | P0 | Type in search bar → verify dropdown shows product previews (image, name, price) → verify max items in dropdown → click "View All Results" → verify full results page |

**xAPI:** `searchProducts` query with `keyword`, `fuzzyLevel`, `filter`, `facets`
**Verify in Admin:** Search index status (Settings → Search), Elasticsearch configuration

---

## Domain 4: Cart Operations (E2E-CART)

| ID | Scenario | P | Flow |
|----|----------|---|------|
| E2E-CART-001 | Add to cart → mini cart → full cart → totals | P0 | PDP → click "Add to Cart" → verify success toast → verify cart icon badge updated → click cart icon → verify mini cart preview → click "View Cart" → verify full cart with line items, prices, subtotal |
| E2E-CART-002 | Update quantity → stepper +/- → direct input → min/max | P0 | Cart page → click "+" → verify qty increments → verify line total updates → click "-" → verify qty decrements → type "0" → verify minimum enforced → type "999" → verify max stock limit |
| E2E-CART-003 | Remove item → empty cart state → continue shopping | P1 | Cart with 3 items → remove middle item → verify 2 items remain → remove all → verify empty cart message → click "Continue Shopping" → verify navigates to catalog |
| E2E-CART-004 | Save for later → move to cart → persistence | P1 | Cart with items → click "Save for Later" on item → verify moved to "Saved" section → verify cart total updates → click "Move to Cart" → verify item returns → verify totals restored |
| E2E-CART-005 | Add from category listing → quick add → cart badge | P1 | Category page → click quick-add button on product card → verify cart badge increments → add same product again → verify quantity increases (not duplicate line) |
| E2E-CART-006 | Multiple product types in cart → mixed totals | P1 | Add physical product → add digital product → add variation product → verify cart shows all types → verify individual prices correct → verify subtotal is sum of all lines |
| E2E-CART-007 | Cart with promo code → apply → remove → validation | P1 | Cart with items → enter valid promo code → click "Apply" → verify discount applied → verify new total → enter invalid code → verify error message → remove valid code → verify total restored |
| E2E-CART-008 | Cart persistence → sign out → sign in → verify | P1 | Add items to cart (signed in) → sign out → sign in again → verify cart items preserved → verify quantities correct → verify prices current |

**xAPI:** `addItem`, `changeCartItemQuantity`, `removeCartItem`, `clearCart`, `addCoupon`, `removeCoupon`, `cart` query, `addItemsCart` (bulk)
**Verify in Admin:** Cart not directly visible — verify via order creation

---

## Domain 5: Checkout Flows (E2E-CHK)

| ID | Scenario | P | Flow |
|----|----------|---|------|
| E2E-CHK-001 | Single-step checkout → delivery → payment → order confirm | P0 | Cart → "Proceed to Checkout" → fill shipping address → select shipping method → enter payment → review order summary → click "Place Order" → verify order confirmation page → verify order number → verify cart cleared |
| E2E-CHK-002 | Multi-step checkout → step navigation → validation per step | P0 | Cart → Checkout → Step 1: Shipping address (validate required fields) → Step 2: Shipping method → Step 3: Payment → Step 4: Review → Place Order → verify step indicators → verify back/forward navigation between steps |
| E2E-CHK-003 | Guest checkout → email entry → order → tracking | P1 | Cart (not signed in) → "Checkout as Guest" → enter email → fill shipping → select method → pay → verify order → verify confirmation email → verify can track with email + order number |
| E2E-CHK-004 | B2B checkout → PO number → approval workflow | P1 | Sign in as B2B buyer → add items → checkout → enter PO number → select "Net 30" payment terms → submit for approval → verify order status "Pending Approval" → sign in as approver → approve order → verify status changes to "Approved" |
| E2E-CHK-005 | Checkout with new shipping address → save address | P1 | Checkout → click "Add New Address" → fill address form → check "Save to address book" → complete checkout → go to Account → Addresses → verify address saved |
| E2E-CHK-006 | Checkout with saved address → select from list | P1 | Checkout → verify saved addresses listed → select existing address → verify address populated → change to different saved address → verify updated → complete checkout |
| E2E-CHK-007 | Checkout with billing address different from shipping | P1 | Checkout → fill shipping address → uncheck "Same as shipping" → fill different billing address → complete checkout → verify order shows both addresses in confirmation and in admin |
| E2E-CHK-008 | Subscription checkout → recurring order setup | P2 | Add subscription product → checkout → verify subscription options (frequency: weekly/monthly/quarterly) → select "Monthly" → complete checkout → verify order confirmation shows subscription details → verify in Admin |
| E2E-CHK-009 | Checkout from saved list → independent cart | P2 | Account → Lists → select list → click "Order from List" → verify items added to separate cart (not main cart) → complete checkout → verify main cart unaffected |
| E2E-CHK-010 | Checkout validation → empty fields → invalid data → recovery | P1 | Checkout → leave required fields empty → click "Continue" → verify field-level error messages → enter invalid zip/phone → verify format errors → fix errors → verify can proceed |

**xAPI:** `createOrderFromCart`, `addOrUpdateCartShipment`, `addOrUpdateCartPayment`, `addCartAddress`, `validateCoupon`, `cart` query with shipments/payments
**Verify in Admin:** Orders blade → verify order details, status, addresses, payment, shipping method

---

## Domain 6: Payment Processing (E2E-PAY)

| ID | Scenario | P | Flow |
|----|----------|---|------|
| E2E-PAY-001 | Skyflow Visa → tokenized payment → order success | P0 | Checkout → select Skyflow → enter Visa card (from .env: SKYFLOW_VISA) → enter expiry + CVV → verify tokenization → Place Order → verify payment processed → verify order status "Paid" |
| E2E-PAY-002 | Skyflow Mastercard → alternate card type | P0 | Checkout → Skyflow → enter Mastercard (SKYFLOW_MASTERCARD) → complete payment → verify card type detected → verify order success |
| E2E-PAY-003 | CyberSource → payment processing → verification | P0 | Checkout → select CyberSource → enter card details → complete payment → verify 3DS challenge (if applicable) → verify order confirmed |
| E2E-PAY-004 | Authorize.Net → payment capture → admin verification | P0 | Checkout → select Authorize.Net → enter card → complete → verify transaction ID in confirmation → verify in Admin: order payment status "Captured" |
| E2E-PAY-005 | Datatrance → card + OTP verification | P0 | Checkout → select Datatrance → enter card (DATATRANCE card from .env) → enter expiry + CVV → verify OTP prompt → enter OTP (DATATRANCE_OTP) → verify payment → verify order |
| E2E-PAY-006 | Payment decline → error handling → retry with different card | P1 | Checkout → enter declined test card → click Pay → verify decline error message → verify can re-enter different card → pay with valid card → verify success |

**xAPI:** `addOrUpdateCartPayment`, `createOrderFromCart`, `processPayment`
**Verify in Admin:** Order → Payments tab → transaction ID, status, amount

---

## Domain 7: Order Management (E2E-ORD)

| ID | Scenario | P | Flow |
|----|----------|---|------|
| E2E-ORD-001 | Place order → order detail page → status tracking | P0 | Complete checkout → click order number → verify order detail page → verify: items, quantities, prices, addresses, payment method, shipping method, status |
| E2E-ORD-002 | Order history → filter → search → pagination | P1 | Account → Orders → verify order list → filter by date range → filter by status → search by order number → verify pagination if many orders |
| E2E-ORD-003 | Reorder → add previous order items to cart | P1 | Order history → select past order → click "Reorder" → verify items added to cart → verify quantities match → verify prices are current (may differ from original) |
| E2E-ORD-004 | Order status lifecycle → Admin updates → storefront reflects | P1 | Place order (status: "New") → Admin: change to "Processing" → Storefront: verify status updated → Admin: add tracking number → Storefront: verify tracking visible → Admin: mark "Shipped" → Storefront: verify |
| E2E-ORD-005 | Return/RMA request → submission → admin processing | P2 | Order history → completed order → click "Request Return" → select items → enter reason → submit → verify return request status → Admin: process return → Storefront: verify status update |
| E2E-ORD-006 | Invoice → download → verify content | P2 | Order detail → click "Download Invoice" → verify PDF generated → verify invoice contains: order items, prices, tax, total, shipping/billing addresses, company info |

**xAPI:** `order` query, `orders` query with filtering, `customerReorders`, `createReturn`
**Verify in Admin:** Orders blade → status transitions, payment captures, shipments, returns

---

## Domain 8: BOPIS - Buy Online Pickup In Store (E2E-BOPIS)

| ID | Scenario | P | Flow |
|----|----------|---|------|
| E2E-BOPIS-001 | Select pickup → choose location → complete order | P1 | Cart → select "Pickup" delivery → verify location selector opens → browse/search locations on map → select store → verify store address and hours shown → complete checkout → verify order confirmation shows pickup location |
| E2E-BOPIS-002 | Pickup location search → filter → select | P1 | Pickup modal → enter zip code or city → verify locations listed by distance → filter by features → select location → verify pin highlighted on map |
| E2E-BOPIS-003 | Mixed cart → some pickup + some delivery | P1 | Add item A (pickup available) → add item B (delivery only) → checkout → verify item A shows pickup option → verify item B shows delivery only → select pickup for A, delivery for B → complete checkout |
| E2E-BOPIS-004 | Change pickup location → update during checkout | P2 | Checkout with pickup selected → click "Change Location" → select different store → verify address updates → verify any location-specific pricing updates → complete checkout |
| E2E-BOPIS-005 | Pickup map → resize modal → mobile responsive | P2 | Open pickup location selector → verify map renders → resize modal/viewport → verify map and list responsive → verify touch targets on mobile (44x44px min) → verify location cards readable |

**xAPI:** `fulfillmentCenters` query, `addOrUpdateCartShipment` with fulfillment center ID
**Verify in Admin:** Order → Shipments → verify fulfillment center assignment, pickup status

---

## Domain 9: B2B Quotes & RFQ (E2E-QUOTE)

| ID | Scenario | P | Flow |
|----|----------|---|------|
| E2E-QUOTE-001 | Create RFQ → submit → verify in admin | P1 | Sign in as B2B buyer → add products to quote request → add specifications/attachments → submit RFQ → verify status "Processing" → Admin: verify RFQ visible in back office |
| E2E-QUOTE-002 | Quote negotiation → seller response → buyer review | P1 | Admin: open RFQ → respond with pricing → send to customer → Storefront: verify quote received → review pricing → request adjustment → Admin: update and resend |
| E2E-QUOTE-003 | Accept quote → convert to order | P1 | Storefront: review final quote → click "Accept" → verify quote converts to order → verify order has quoted prices (not catalog prices) → verify order in Admin |
| E2E-QUOTE-004 | Reject quote → provide reason → re-negotiate | P2 | Storefront: review quote → click "Reject" → enter rejection reason → verify quote status "Rejected" → Admin: see rejection → create revised quote |
| E2E-QUOTE-005 | Quote with substitutions → alternate products | P2 | Admin: respond to RFQ with substitution (different product) → Storefront: verify substitution shown → buyer accepts substitution → convert to order with substituted product |
| E2E-QUOTE-006 | Quote expiry → expired quote handling | P2 | Admin: create quote with expiry date → wait/simulate expiry → Storefront: verify quote shows "Expired" → verify cannot convert expired quote to order → verify can request new quote |

**xAPI:** `createQuoteFromCart`, `updateQuote`, `approveQuote`, `declineQuote`, `quotes` query
**Verify in Admin:** Quotes blade → status transitions, line items, pricing, discussion history

---

## Domain 10: B2B Multi-Organization (E2E-ORG)

| ID | Scenario | P | Flow |
|----|----------|---|------|
| E2E-ORG-001 | Switch between organizations → verify context changes | P1 | Sign in as multi-org user → verify current org name in header → switch to Org B → verify org name changes → verify catalog may differ → verify cart is separate → switch back to Org A → verify original cart intact |
| E2E-ORG-002 | Cart isolation per organization | P1 | In Org A: add items to cart → switch to Org B → verify cart is empty (or Org B's cart) → add different items → switch to Org A → verify Org A cart unchanged |
| E2E-ORG-003 | Ship-to address per organization | P1 | In Org A: verify ship-to addresses are Org A addresses → switch to Org B → verify ship-to shows Org B addresses → verify no cross-contamination |
| E2E-ORG-004 | Organization-specific pricing | P1 | In Org A: check product price → switch to Org B → verify same product may have different (contract) price → verify cart totals use correct org pricing |
| E2E-ORG-005 | Sign in → default organization → switch | P1 | Sign in → verify default organization loads → navigate to org switcher → verify all assigned orgs listed → switch → verify full context change (catalog, prices, cart, addresses) |
| E2E-ORG-006 | Impersonate user → switch company context | P2 | Admin: impersonate user → verify storefront loads as that user → switch between companies as impersonated user → verify all context switches work → stop impersonation |
| E2E-ORG-007 | Shared vs private lists per organization | P2 | In Org A: create shared list → add products → switch to Org B → verify shared list visible to Org B members → create private list in Org A → switch to Org B → verify private list NOT visible |

**xAPI:** `switchOrganization` mutation, `organizations` query, `user` query with organization context
**Verify in Admin:** Customers → Organizations → verify members, addresses, pricing assignments

---

## Domain 11: B2B Company Members & Roles (E2E-MEMBER)

| ID | Scenario | P | Flow |
|----|----------|---|------|
| E2E-MEMBER-001 | Invite member → registration → role assignment | P1 | Account → Company Members → click "Invite" → enter email → assign role (Buyer/Admin) → send invite → verify invite email → recipient registers via invite link → verify member appears in list with correct role |
| E2E-MEMBER-002 | Edit member role → permissions change | P1 | Company Members → select member → change role from "Buyer" to "Admin" → save → verify member now has admin permissions (can invite, manage members) |
| E2E-MEMBER-003 | Block/Unblock member → access control | P1 | Company Members → block a member → verify member cannot sign in → unblock member → verify member can sign in again → verify their cart/orders preserved |
| E2E-MEMBER-004 | Member search and filter | P2 | Company Members → search by name → verify results → filter by role → verify filtered list → filter by status (Active/Blocked) → verify list |
| E2E-MEMBER-005 | Delegated purchasing → buyer places order → approval required | P1 | Sign in as Buyer (not Admin) → add items to cart → checkout → verify order requires approval → sign in as Admin/Approver → review pending order → approve → verify order status changes → Buyer: verify order confirmed |

**xAPI:** `inviteUser`, `updateContact`, `lockOrganizationContact`, `unlockOrganizationContact`, `organizationContacts` query
**Verify in Admin:** Customers → Organizations → Members list, role assignments, status

---

## Domain 12: B2B Lists & Quick Order (E2E-LIST)

| ID | Scenario | P | Flow |
|----|----------|---|------|
| E2E-LIST-001 | Create list → add products → manage list | P1 | Account → Lists → create new list → name it → add products from catalog → verify list items → change quantity → remove item → verify updates |
| E2E-LIST-002 | Add to cart from list → bulk add | P1 | Open saved list → select items (or "Select All") → click "Add to Cart" → verify items added with list quantities → verify cart totals |
| E2E-LIST-003 | Shared list → visible to team members | P2 | Create list marked as "Shared" → sign in as another org member → verify shared list visible → verify can add items to shared list → verify changes visible to original creator |
| E2E-LIST-004 | Quick order → SKU/name entry → bulk add | P1 | Navigate to Quick Order page → enter SKU directly → verify product found → enter quantity → add more rows → click "Add All to Cart" → verify all items added to cart with correct quantities |
| E2E-LIST-005 | Wishlist → add from PDP → manage → move to cart | P2 | PDP → click "Add to Wishlist" (heart icon) → Account → Wishlist → verify product listed → click "Add to Cart" from wishlist → verify item moved to cart |

**xAPI:** `createWishlist`, `addWishlistItem`, `removeWishlistItem`, `addWishlistBulkItem`, `renameWishlist`
**Verify in Admin:** Not directly visible — verify via storefront + API queries

---

## Domain 13: Configurable Products & CPQ (E2E-CONFIG)

| ID | Scenario | P | Flow |
|----|----------|---|------|
| E2E-CONFIG-001 | Product with size/color variations → selection → add to cart | P1 | Navigate to configurable product → select Size → verify available colors update → select Color → verify price updates → verify image updates → add to cart → verify variant details in cart |
| E2E-CONFIG-002 | Product configurator → sections → options → price calculation | P1 | Navigate to configurable product with configurator → complete Section 1 → Section 2 → Section 3 → verify running total updates → add configured product to cart |
| E2E-CONFIG-003 | Out-of-stock variant → disabled selection → fallback | P1 | Configurable product → select combination that is out of stock → verify variant greyed/disabled → verify "Out of Stock" message → select available variant → verify Add to Cart enabled |
| E2E-CONFIG-004 | Variant-specific images → gallery update on selection | P2 | Configurable product → default images shown → select Color: Blue → verify image gallery shows blue variant images → select Color: Red → verify images change to red variant |
| E2E-CONFIG-005 | Configured product in cart → edit configuration | P2 | Add configured product to cart → in cart, click "Edit" on configured item → verify configurator reopens with previous selections → change options → save → verify cart updated with new configuration and price |

**xAPI:** `product` query with `variations`, `configurationSections`, `availabilityData`
**Verify in Admin:** Catalog → Products → Variations tab, configuration sections, inventory per variant

---

## Domain 14: Admin Catalog CRUD (E2E-ADMIN-CAT)

| ID | Scenario | P | Flow |
|----|----------|---|------|
| E2E-ADMIN-CAT-001 | Create product → publish → verify on storefront | P1 | Admin: Catalog → Products → "Add Product" → fill fields → assign category → set inventory → Save → verify product appears on storefront |
| E2E-ADMIN-CAT-002 | Edit product → update price → verify storefront reflects | P1 | Admin: find product → edit price → save → Storefront: verify new price → add to cart → verify cart uses new price |
| E2E-ADMIN-CAT-003 | Create category → assign products → verify navigation | P1 | Admin: Catalog → Categories → "Add Category" → fill name, SEO slug → save → assign products → Storefront: verify category in navigation → verify products listed |
| E2E-ADMIN-CAT-004 | Bulk import products via CSV → verify catalog | P2 | Admin: Catalog → Import → upload CSV → verify import progress → verify products appear → Storefront: search for imported product |
| E2E-ADMIN-CAT-005 | Delete/unpublish product → verify removed from storefront | P1 | Admin: unpublish product → Storefront: verify not in search → verify direct URL shows 404 → Admin: republish → Storefront: verify accessible again |

**REST API:** POST/PUT/DELETE `/api/catalog/products`, `/api/catalog/categories`, `/api/catalog/import`
**Verify cross-layer:** Admin action → search index rebuild → Storefront reflection

---

## Domain 15: Admin Order Management (E2E-ADMIN-ORD)

| ID | Scenario | P | Flow |
|----|----------|---|------|
| E2E-ADMIN-ORD-001 | View order → process payment → create shipment → complete | P1 | Admin: Orders → find order → verify details → process payment capture → create shipment → add tracking → mark shipped → Storefront: verify customer sees "Shipped" with tracking |
| E2E-ADMIN-ORD-002 | Search orders → filter by status/date/customer | P1 | Admin: Orders → search by order number → filter by status → filter by date range → filter by customer email → verify results |
| E2E-ADMIN-ORD-003 | Refund order → partial and full refund | P2 | Admin: completed order → partial refund (1 of 3 items) → verify refund processed → full refund on remaining → verify order status "Refunded" |
| E2E-ADMIN-ORD-004 | Cancel order → inventory restoration | P2 | Admin: new order → cancel → verify status "Cancelled" → verify inventory restored → Storefront: verify product available again |

**REST API:** `/api/order/customerOrders`, PUT status transitions, POST shipments, POST refunds
**Verify cross-layer:** Admin status change → xAPI `order` query reflects new status → Storefront updated

---

## Domain 16: Localization & Multi-Currency (E2E-L10N)

| ID | Scenario | P | Flow |
|----|----------|---|------|
| E2E-L10N-001 | Language switch → UI translation → persist preference | P2 | Homepage (EN) → switch to German (DE) → verify labels translated → navigate to product → verify info in DE → refresh → verify DE persists |
| E2E-L10N-002 | Multi-currency → price display → checkout in currency | P2 | Switch to EUR → verify prices in EUR → add to cart → verify totals in EUR → complete checkout → verify order in EUR → Admin: verify correct currency |
| E2E-L10N-003 | RTL language support → layout direction | P2 | Switch to Arabic/Hebrew (if supported) → verify RTL layout → verify text alignment → verify navigation mirrors |
| E2E-L10N-004 | All 13 languages → navigation and checkout smoke | P2 | For each of 13 languages (EN, DE, FR, ES, NO, SV, PL, IT, PT, JA, ZH, FI, RU): switch → verify homepage → verify cart → verify checkout labels |

**xAPI:** `storeSettings` query for available languages/currencies, language header in requests
**Verify in Admin:** Store → Settings → Languages, Currencies enabled

---

## Domain 17: Analytics & Tracking (E2E-GA)

| ID | Scenario | P | Flow |
|----|----------|---|------|
| E2E-GA-001 | Product view → dataLayer event → GA4 view_item | P2 | Navigate to PDP → DevTools console → check `dataLayer` → verify `view_item` event with product ID, name, price, category |
| E2E-GA-002 | Add to cart → GA4 add_to_cart event | P2 | Add product to cart → verify `add_to_cart` event in dataLayer with item details, quantity, value |
| E2E-GA-003 | Checkout funnel → begin_checkout → add_payment_info → purchase | P2 | Start checkout → verify `begin_checkout` → add shipping → verify `add_shipping_info` → add payment → verify `add_payment_info` → place order → verify `purchase` event |
| E2E-GA-004 | Search → GA4 search event → view_search_results | P2 | Perform search → verify `search` event with search_term → view results → verify `view_search_results` with result count |

**Verify:** Chrome DevTools → Console → `window.dataLayer` inspection; Network tab → GA4 collect endpoint

---

## Domain 18: Security & Compliance (E2E-SEC)

| ID | Scenario | P | Flow |
|----|----------|---|------|
| E2E-SEC-001 | Auth token expiry → refresh → re-authentication | P0 | Sign in → wait for token expiry → attempt action → verify token refreshed automatically OR re-sign-in prompted → verify no data loss |
| E2E-SEC-002 | XSS prevention → script injection in inputs | P0 | Enter `<script>alert('xss')</script>` in search, address, name fields → verify no script execution → input sanitized → no console errors |
| E2E-SEC-003 | Unauthorized API access → role-based restrictions | P0 | As Buyer → attempt admin API endpoints → verify 401/403 → as Guest → attempt authenticated endpoints → verify 401 → verify no data leakage |
| E2E-SEC-004 | PCI compliance → payment card handling | P0 | Checkout → verify card field uses iframe/tokenization → verify card not in network requests → verify not in localStorage/sessionStorage → verify HTTPS |

**Verify:** DevTools → Network (no plain card data), Console (no errors), Application tab (no sensitive storage)
