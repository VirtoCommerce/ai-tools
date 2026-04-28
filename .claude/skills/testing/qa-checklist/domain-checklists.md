# Domain Test Case Writing Checklists

> Reference file for `test-management-specialist` agent and `/qa-checklist` skill. Read on-demand when writing test cases for a specific domain.
>
> For Admin SPA and Platform API checklists, see `backend-admin-checklists.md` (27 Admin domains + 2 API domains | 255 items).

**33 storefront domains + 1 cross-domain checklist | 411 checklist items** — every checked item should map to at least one test case.

> **GraphQL test coverage**: GraphQL xAPI checklist items are maintained in [`graphql-checklist.md`](./graphql-checklist.md), not here. This file focuses on storefront UI/UX behavior.

## Summary

| # | Domain | Items | E2E Catalog | Related Suites |
|---|--------|-------|-------------|----------------|
| 1 | Auth | 8 | E2E-AUTH | 01, 02, 08 |
| 2 | Catalog | 26 | E2E-CAT | 01, 03, 16 |
| 3 | Categories | 6 | E2E-CAT | 03, 16 |
| 4 | SEO | 7 | E2E-CAT | 31 |
| 5 | Add to Cart | 10 | E2E-CART | 01, 04a |
| 6 | Search | 12 | E2E-SEARCH | 03, 26 |
| 7 | Ship-to Selector | 6 | E2E-CHK | 04a, 04b |
| 8 | Cart/Checkout | 19 | E2E-CHK | 04a, 04b, 06 |
| 9 | Payment | 12 | E2E-PAY | 06 |
| 10 | Orders | 11 | E2E-ORD | 01, 04c, 20 |
| 11 | Company Info | 6 | E2E-ORG | 02, 21 |
| 12 | Company Members | 12 | E2E-MEMBER | 02, 21 |
| 13 | Multi-Org | 11 | E2E-ORG | 02, 21 |
| 14 | Product Configurations & Variations | 55 | E2E-CONFIG | 36 |
| 15 | PDP (Product Detail Page) | 11 | E2E-CAT | 01, 03 |
| 16 | Google Analytics | 11 | E2E-GA | 07 |
| 17 | Anonymous Flow | 8 | E2E-CHK | 04a, 04b |
| 18 | Cart Merge | 7 | E2E-CART | 04a, 30 |
| 19 | BOPIS (Pickup) | 12 | E2E-BOPIS | 05, 30 |
| 20 | B2B Quotes & RFQ | 14 | E2E-QUOTE | 04c, 20 |
| 21 | B2B Lists & Quick Order | 13 | E2E-LIST | 13 |
| 22 | Localization & i18n | 7 | E2E-L10N | 10 |
| 23 | Notifications | 12 | E2E-NOTIF | 24 |
| 24 | White Labeling | 13 | E2E-WL | 32, 35 |
| 25 | Account Management | 13 | E2E-ACCT | 01, 02, 13 |
| 26 | Storefront Push Messages | 12 | E2E-PUSH | 33 |
| 27 | Coupons & Promotions | 12 | E2E-PROMO | 41, 23, 42 |
| 28 | Security | 10 | E2E-SEC | 08 |
| 29 | Accessibility | 10 | E2E-A11Y | 09 |
| 30 | Performance | 8 | E2E-PERF | 11 |
| 31 | Browser Compatibility | 7 | E2E-COMPAT | 12 |
| 32 | B2C Features | 10 | E2E-B2C | 13 |
| 33 | Subscriptions & Recurring Orders | 10 | E2E-SUB | 14 |
| **BF** | **Bug Fix Verification** | **10** | *cross-domain* | *per bug* |

---

## 1. Auth
- [ ] Personal registration (form validation, confirmation, first sign-in)
- [ ] Organization registration (company details, B2B features unlocked)
- [ ] Sign-in / Sign-out (session persistence across pages, refresh, redirect)
- [ ] Password reset (email link, new password works, old rejected)
- [ ] Invalid login attempts (lockout after N failures, recovery)
- [ ] Session expiry / token refresh
- [ ] Concurrent sessions (two browsers, sign-out isolation)
- [ ] Registration validation (duplicate email, weak password, mismatched confirm)

## 2. Catalog
- [ ] Category navigation → product grid → PDP → breadcrumbs round-trip
- [ ] Faceted filtering: brand, price range, color, size, availability, type
- [ ] Range facets: price slider / range inputs render for numeric/money properties configured as "Range" in Admin → Stores → Aggregation properties
- [ ] Range facet boundaries: inclusive `[100 TO 200]` vs exclusive `(100 TO 200)` produce correct result counts
- [ ] Range facet open-ended: `(TO 100]` (up to 100) and `(0 TO)` (greater than zero) return correct products
- [ ] Range facet with currency: `price.{currency}` scoped to selected currency, switching currency updates range facet values
- [ ] Range facet counts: each range bucket displays correct product count matching actual filtered results (cascading)
- [ ] Filter chips: display, remove one, "Reset filters"
- [ ] Sorting: price asc/desc, name A-Z, relevance
- [ ] Pagination / "Load More" / page count
- [ ] SEO-friendly URLs, canonical links, meta title/description
- [ ] Currency-aware product listing: prices update when currency switched, products without price in new currency show "Unavailable"
- [ ] Hidden product exclusion: products with `status:hidden` in Admin do not appear in storefront listing or search
- [ ] Recently browsed products: `recentlyBrowsed` section displays previously visited products (max 6), updates after viewing new products
- [ ] Fuzzy search support: `fuzzy: true` parameter returns products with slight misspellings, fuzziness level configurable via `fuzzyLevel`

### Product Types
- [ ] Physical product: tangible item displays correctly in listing and PDP
- [ ] Digital product: no shipping-related fields shown, download/access link available after purchase
- [ ] Variations: base product shows variation selector (color, size, etc.), switching updates price/image/SKU
- [ ] Configurable product: configuration sections render with required/optional options, price recalculates per selection

### Product Availability (3-switch model)
- [ ] `Visible` ON + `Can be purchased` ON + `Track inventory` OFF → always **InStock**
- [ ] `Visible` ON + `Can be purchased` ON + `Track inventory` ON → stock determined by fulfillment center inventory quantity
- [ ] `Visible` ON + `Can be purchased` OFF → **OutOfStock** label shown, Add to Cart disabled
- [ ] `Visible` OFF → **SoldOut**, product not displayed in storefront listing or search
- [ ] In-stock / out-of-stock filter works correctly in product listing
- [ ] "Purchased Before" tag displayed for previously ordered items (B2B)
- [ ] Multi-fulfillment center: `availabilityData.inventories` shows per-center stock levels (via xAPI)

## 3. Categories
- [ ] Multi-level navigation (top → sub → sub-sub)
- [ ] Breadcrumb trail: each segment clickable, correct hierarchy
- [ ] Category page pagination (product count, page navigation)
- [ ] "All Products" dropdown: all categories listed, correct links
- [ ] Category by slug URL vs category by ID URL
- [ ] Empty category handling (no products message)

## 4. SEO
- [ ] SEO-friendly URLs for categories and products
- [ ] Breadcrumbs match URL hierarchy
- [ ] Canonical URL present and correct on every page
- [ ] Meta title and description populated
- [ ] Structured data (JSON-LD) on PDP: product name, price, availability, rating
- [ ] Language prefix in localized URLs (`/de/`, `/fr/`, etc.)
- [ ] 404 page for invalid URLs

## 5. Add to Cart
- [ ] Stepper +/- buttons: increment, decrement, boundary enforcement
- [ ] Qty field: direct input, min qty enforced, max stock enforced
- [ ] Pack size / qty step (e.g., multiples of 6)
- [ ] Variations (B2B layout): select variant then add
- [ ] Variations (B2C layout): inline variant selection on card
- [ ] Configurable products: "Customize" → configure sections → add
- [ ] Quick-add from category listing (badge increments, same product adds qty)
- [ ] Success toast / mini-cart preview after add
- [ ] Cart icon badge count updates immediately
- [ ] Pickup availability on PDP: per-product pickup locations with availability type (InStock/LowStock/OutOfStock) and available quantity

## 6. Search
- [ ] Search input: type, autocomplete dropdown with product previews (image, name, price)
- [ ] Clear input (X button), empty state
- [ ] Global search → results page → result count → click product → back to results
- [ ] Within-category search (scoped results)
- [ ] Search history: recent queries shown, click to re-search, clear history
- [ ] No results: "No results" message, suggested categories/popular products
- [ ] Typo tolerance / fuzzy matching / "Did you mean...?"
- [ ] "View All Results" link from dropdown
- [ ] Facet counts update after each filter applied (cascading facets match actual result count) (BL-SRCH-001)
- [ ] Search + filter combination: text query combined with facet filter returns correct intersection
- [ ] Sort options on search results page: price, name, relevance persist through pagination
- [ ] Search by SKU: entering exact SKU returns the matching product

## 7. Ship-to Selector
- [ ] Favorite/default address pre-selected
- [ ] Add new address (form validation, save)
- [ ] "Show more" addresses (lazy load / expand)
- [ ] Search addresses by name/city/zip
- [ ] Switch address → shipping methods update
- [ ] Address displays correct format (name, street, city, state, zip, country)

## 8. Cart/Checkout
- [ ] Qty changes in cart: stepper, direct input, line total recalculates
- [ ] Select / unselect items (partial checkout)
- [ ] Save for later → move back to cart → totals update
- [ ] Pickup vs delivery toggle per item
- [ ] Shipping method selection (rates, estimated delivery)
- [ ] Payment method: Skyflow (Visa, MC), AuthorizeNet, CyberSource, DataTrance (OTP)
- [ ] Billing address: same as shipping / different
- [ ] Order summary: items, subtotal, shipping, tax, total
- [ ] Place order → confirmation page → order number → cart cleared
- [ ] Promo code: apply valid, invalid error, remove, total recalculates
- [ ] Checkout validation: empty required fields, invalid zip/phone, recovery
- [ ] Saved credit cards: reuse tokenized card from previous order, select from saved list, delete saved card
- [ ] Billing address field-level validation: all 17+ fields (firstName, lastName, line1, city, regionId, zip, countryCode, email, phone) validated per country
- [ ] Payment authorization error handling: gateway decline returns `isSuccess: false` with `errorMessage`, user can retry
- [ ] Loyalty points as payment: apply points balance to reduce order total, insufficient points blocked (if loyalty enabled)
- [ ] Recently browsed products: cart page displays recently viewed products section below main cart content (if feature enabled)
- [ ] Loyalty gifts display: preselected loyalty gifts shown on cart page when loyalty program awards free items
- [ ] Purchase Order Number (B2B): `purchaseOrderNumber` field editable on cart, persists to created order, visible in order detail (`changePurchaseOrderNumber` mutation)
- [ ] Multi-cart / named cart support: user can create multiple named carts (e.g. "Default", "Office Supplies"), switch between them, items isolated per cart, merge items from multiple carts into one final order

## 9. Payment
- [ ] Skyflow Visa: card entry → tokenization → payment success → order status "Paid"
- [ ] Skyflow Mastercard: card type detected, payment success
- [ ] CyberSource: payment form renders on `/cart` page (NOT `/checkout/payment`), card entry, order confirmed
- [ ] CyberSource 3DS: challenge renders in iframe → user completes → returns to storefront → order confirmed
- [ ] Authorize.Net: card entry, transaction ID in confirmation, Admin captured
- [ ] DataTrance: card + expiry + CVV → OTP prompt → enter OTP → verify payment
- [ ] Declined card: error message, retry with different card, checkout state preserved (address, shipping)
- [ ] Form validation: required fields, card format, expiry format, CVV length
- [ ] PCI: card in iframe/tokenized, not in network requests or localStorage
- [ ] Skyflow tokenization observable: Skyflow vault call visible in Network tab before Authorize.NET processing
- [ ] Manual/offline payment method: if configured, order placed with "Pending" payment status
- [ ] Saved card reuse: previously tokenized card selectable from saved payment methods list

## 10. Orders
- [ ] Order detail page: items, quantities, prices, addresses, payment, shipping, status, invoice number, purchase order number (B2B)
- [ ] Order history table (`/account/orders`): list view, pagination
- [ ] "All orders" / "My orders" tabs: B2B users see all org orders vs own orders only; personal accounts hide tab switcher
- [ ] Filters: date range (created from/to), status (New, Processing, Shipped, Completed, Cancelled), keyword search
- [ ] Search by order number or invoice number
- [ ] Sort options: by date, status, total — ascending and descending
- [ ] Reorder: items added to cart with correct qty, current prices (may differ from original order), unavailable items flagged
- [ ] Order status lifecycle: Admin updates status → storefront reflects (real-time or on next page load)
- [ ] Tracking number visible when shipped, link to carrier tracking page (if integrated)
- [ ] B2B Order Approval workflow: order placed in "Pending Approval" status → maintainer approves via `approveOrder` mutation → status moves to "Approved", `approvedBy` and `approvedDate` populated; reject path also exercised
- [ ] Order approval permissions: only roles with approval permission can approve/reject; non-approvers see read-only view
- [ ] Currency-aware totals: order shows correct currency and language reflecting the locale at checkout time

## 11. Company Info
- [ ] Organization details page (`/account/company`): company name, description, addresses, phones displayed
- [ ] Edit company details: update name, addresses, phones (Organization maintainer role required)
- [ ] Company logo upload: upload from account settings, logo displayed in header/account area (Organization maintainer only)
- [ ] Company addresses: add, edit, delete company shipping/billing addresses (scoped to org, not personal)
- [ ] Role restriction: non-maintainer roles cannot edit company info — edit controls hidden or disabled
- [ ] Company info persistence: changes reflected across all org members' sessions after refresh

## 12. Company Members
- [ ] Invite member: enter email, assign role(s), send — roles: Organization maintainer, Store administrator, Purchasing agent, Organization employee
- [ ] Bulk invite: multiple emails at once, partial failure handling (some succeed, some fail with error details)
- [ ] Custom invitation message: message appears in email body, empty message uses default template
- [ ] Invited user registers via link → appears in list with correct role and icon
- [ ] Invitation expiry: expired invitation link shows error, resend invitation generates new link
- [ ] Edit role: change member role via action menu (e.g., Purchasing agent → Organization maintainer), permissions update immediately
- [ ] Multi-role assignment: member can hold multiple roles simultaneously (e.g., `org-maintainer` + `purchasing-agent`)
- [ ] Role-based icon display: each role shows distinct icon in member list (Organization maintainer, Store administrator, Purchasing agent)
- [ ] Block member → cannot sign in; Unblock → can sign in, data preserved
- [ ] Filter by role (Organization maintainer, Store administrator, Purchasing agent, Organization employee), filter by status (Active, Blocked)
- [ ] Search members by name or role
- [ ] Role permissions enforcement: Organization maintainer can manage company info/addresses/logo; Purchasing agent can place orders; Organization employee has basic access only

## 13. Multi-Org
- [ ] Org switcher: current org in header, list of assigned orgs, switch
- [ ] Cart isolation: Org A cart ≠ Org B cart, switching preserves each
- [ ] Ship-to per company: addresses scoped to active org, no cross-contamination
- [ ] Org-specific pricing: same product, different price per org
- [ ] Default org on sign-in, full context change on switch (catalog, prices, cart, addresses)
- [ ] Shared lists visible across org members; private lists scoped to creator
- [ ] Account menu dropdown: user section + organizations with radio buttons + search
- [ ] Org search in dropdown: filters org list, case-insensitive, no results state
- [ ] Single-org user: org switcher hidden or shows single non-switchable entry
- [ ] Org switch triggers branding update: logo/favicon/theme change per org white labeling (if WL enabled)
- [ ] New org assignment: user added to second org → org appears in switcher (after re-login or session refresh)

## 14. Product Configurations & Variations

### Variations
- [ ] Variation swatches: color, size selectors displayed on PDP
- [ ] Select variation → price updates, image gallery switches to variant images
- [ ] "From $X" price on listing (`minVariationPrice`) → specific price after variant selection
- [ ] "N variations" link on product card → opens variation selector or separate page
- [ ] Out-of-stock variant: greyed/disabled, "Out of Stock" message, cannot add
- [ ] Unavailable combinations: selecting one option disables incompatible others
- [ ] Stock per variation: inventory shown for selected variant
- [ ] Cart line shows variant details (color, size) not just parent product name
- [ ] B2B vs B2C layout differences for variation products

### Configurable Products — Section Types
Configurable products use **sections** (customizable parts) with **options** (choices per section). Three section types:

#### Product Section Type
- [ ] Product section renders with list of catalog items as selectable options
- [ ] Each option shows product name, SKU/code, properties, and extended price
- [ ] Option quantity selector: changing quantity recalculates `extendedPrice` (qty × unit price)
- [ ] Required product section (`isRequired: true`): cannot proceed without selecting an option
- [ ] Optional product section (`isRequired: false`): can skip section, configuration still valid
- [ ] Multiple options in one section: only one selectable at a time (radio-style), or multiple if allowed
- [ ] Per-option pricing fields populated: `listPrice`, `salePrice`, `discountAmount` (when on sale), `extendedPrice` — values match current Pricelist for the user/org context
- [ ] Out-of-stock option: greyed/disabled in section, cannot be selected, configuration cannot complete with it

#### Text Section Type
- [ ] Text section renders input field for custom/predefined text entry
- [ ] Custom text properties (Custom1, Custom2, Custom3 fields) accept free-form input
- [ ] Required text section: validation prevents proceeding with empty text
- [ ] Optional text section: can leave blank without blocking configuration
- [ ] Text input character limits / validation rules enforced (if configured)
- [ ] Predefined text options: dropdown or selection list of preset text values
- [ ] Custom-vs-preset serialization: Custom input serialized as `customText` payload; preset selection serialized as `optionId` reference (NOT re-encoded as `customText`)
- [ ] `maxLength` scope: validation applies ONLY to Custom input, preset option labels are NOT length-validated even if longer than `maxLength`
- [ ] Switching from preset → Custom (and back): payload toggles between optionId and customText cleanly, no stale value left behind

#### File Section Type
- [ ] File section renders file upload control (e.g., logo uploads, custom artwork)
- [ ] Required file section: cannot complete configuration without uploading a file
- [ ] Optional file section: configuration valid without file attachment
- [ ] File type validation: only accepted formats allowed (image, PDF, etc.) — invalid type rejected with user-friendly error
- [ ] File size limits enforced with user-friendly error message
- [ ] Uploaded file preview displayed after successful upload
- [ ] Replace/remove uploaded file: previous file cleared from configuration, new file persisted on save

### Configurable Products — Storefront UX
- [ ] "Customize" CTA on PDP opens configurator (not standard "Add to Cart")
- [ ] Configurator displays sections in defined order (Section 1 → 2 → 3 …)
- [ ] Section name and description rendered for each configuration step
- [ ] Running total updates dynamically as options are selected across sections
- [ ] Required sections visually distinguished from optional (asterisk, label, or styling)
- [ ] Validation: cannot add to cart until all required sections are satisfied
- [ ] Validation error messages indicate which required sections are incomplete
- [ ] Configuration summary shown before adding to cart (all selected options with prices)
- [ ] Mixed section types in one product: Product + Text + File sections render correctly together
- [ ] Empty configuration (no sections defined): product behaves as standard non-configurable product

### Configurable Products — Cart & Checkout
- [ ] Configured product in cart: shows selected options per section (product name, text value, file name)
- [ ] Cart line item displays configuration details, not just parent product name
- [ ] Edit configured product in cart: reopens configurator with previous selections pre-filled, save dispatches `changeCartConfiguredItem` mutation
- [ ] Remove configured product from cart: entire configuration removed as one unit (parent line + child `configurationItems`)
- [ ] Price in cart matches running total from configurator (sum of all section option prices)
- [ ] Quantity change on configured cart item: dispatches `changeCartConfiguredItem` with new `quantity`, recalculates total (qty × configured price)
- [ ] Multiple configurations of same base product: appear as separate cart lines (independent `lineItemId`)
- [ ] Configured product persists through cart merge (anonymous → authenticated): `configurationItems` carried over intact
- [ ] Configured product survives cart persistence across sessions
- [ ] Checkout displays configuration details in order summary
- [ ] Order confirmation / order history shows full configuration breakdown

> **GraphQL API coverage** for `productConfiguration`, `createConfiguredLineItem`, `changeCartConfiguredItem`, and `configurationItems` lives in [`graphql-checklist.md`](./graphql-checklist.md) — keep this domain checklist UI/UX-focused.

### Test Data
- [ ] Category `/products-with-options`: 8 configurable + 7 variation products as test data

## 15. PDP (Product Detail Page)
- [ ] Product name, SKU, and description render correctly
- [ ] Image gallery: thumbnails switch main image, multiple images navigable
- [ ] Video media: embedded videos render and play on PDP
- [ ] Properties displayed in collapsible groups (specs, attributes) — all structured properties render
- [ ] Pricing: list price, sale price, discount amount/percentage shown
- [ ] `minVariationPrice` shown for products with variations ("From $X")
- [ ] Stock level visibility for physical products (in-stock quantity when tracked)
- [ ] Related products section displayed below product details
- [ ] Recommendations section rendered (if configured)
- [ ] Customer reviews section: display existing reviews, submit new review
- [ ] `keyProperties` (top 3 key specs) shown prominently on PDP and in product cards

## 16. Google Analytics
- [ ] `view_item` event on PDP: product ID, name, price, category
- [ ] `add_to_cart` event: item details, quantity, value
- [ ] `remove_from_cart` event: fired when item removed from cart with item details
- [ ] `view_item_list` event on category/listing pages with items array
- [ ] `select_item` event: fired when user clicks a product from a list
- [ ] `begin_checkout` → `add_shipping_info` → `add_payment_info` → `purchase` funnel
- [ ] `search` event with `search_term`; `view_search_results` with result count
- [ ] Event parameter completeness: each event includes `currency`, `value`, `items[]` with `item_id`, `item_name`, `price`, `quantity`
- [ ] Verify via DevTools console: `window.dataLayer` entries
- [ ] Verify via Network tab: GA4 collect endpoint requests
- [ ] SPA navigation: no duplicate `page_view` or ecommerce events on client-side route change

## 17. Anonymous Flow
- [ ] Browse catalog without sign-in: product listing, PDP, search all functional for anonymous users
- [ ] Add to cart as anonymous: items persist in cart across page navigation
- [ ] Anonymous cart persistence: cart survives browser refresh (cookie/localStorage-based)
- [ ] Guest checkout: complete purchase without registration — email-only identification, order confirmation
- [ ] Login prompt at checkout: anonymous user prompted to sign in or continue as guest at checkout step
- [ ] Anonymous → registration: user can register during checkout, cart preserved after account creation
- [ ] Anonymous session expiry: cart cleared after session timeout, no stale anonymous carts
- [ ] Anonymous user restrictions: cannot access account pages, order history, saved lists, or company features

## 18. Cart Merge
- [ ] Sign-in with existing anonymous cart: anonymous items merged into authenticated user's cart
- [ ] Quantity merge: same product in both carts → quantities summed (respecting max stock limits)
- [ ] No item loss: all anonymous cart items appear in merged cart, none silently dropped
- [ ] Promo codes preserved: coupon applied in anonymous cart carried over after sign-in
- [ ] Price update on merge: merged cart reflects authenticated user's pricing (tier/org-specific), not anonymous prices
- [ ] Cart merge with org context: B2B user sign-in → anonymous items merge into active org's cart (not personal)
- [ ] Merge conflict handling: out-of-stock items in anonymous cart flagged after merge, not silently removed

## 19. BOPIS (Pickup)
- [ ] Select "Pickup" delivery → location selector opens (map + list)
- [ ] Browse/search pickup locations by zip code or city → results sorted by distance
- [ ] Select store → verify address, hours, and pin highlighted on map
- [ ] Mixed cart: pickup-eligible item shows pickup option, delivery-only item shows delivery only
- [ ] Change pickup location during checkout → address and pricing update
- [ ] Pickup map modal: resize, responsive layout, touch targets (44x44px min on mobile)
- [ ] Order confirmation shows pickup location details and instructions
- [ ] Inactive location hidden: locations with `isActive: false` do not appear in storefront selector
- [ ] Working hours display: formatted hours (e.g., "Mon - Sun: 9 - 18") rendered correctly per location
- [ ] Contact info display: location `contactEmail` and `contactPhone` shown to customer
- [ ] Product-level pickup availability: per-product availability at each location (InStock/LowStock/BackOrder) with quantity
- [ ] Location pagination: stores with many (10+) pickup locations support scrolling/load-more in selector

## 20. B2B Quotes & RFQ
- [ ] Create quote from cart: `createQuoteFromCart` with optional comment, cart items become quote line items
- [ ] Empty cart quote creation blocked: error when attempting to create quote from empty cart
- [ ] Quote negotiation: Admin responds with pricing → storefront shows quote received
- [ ] Accept quote → converts to order with quoted prices (not catalog prices)
- [ ] Decline quote: `declineQuoteRequest` → status "Declined" → Admin sees rejection with reason
- [ ] Quote expiry: expired quote shows "Expired", cannot convert to order (BL-B2B-003)
- [ ] Quote comment thread: add/edit comments during negotiation visible to both buyer and Admin
- [ ] Quote line items preserve tier pricing: `selectedTierPrice` (quantity + price) carried over from cart, listPrice/salePrice visible per item
- [ ] Quote substitutions: Admin offers alternate product on a line — buyer reviews substitution, accepts/rejects per line
- [ ] Quote detail page (`/account/quotes/{id}`): line items, prices, status, comments, actions
- [ ] Quote history (`/account/quotes`): list view, filter by status, pagination, sort by date
- [ ] Approve workflow: `approveQuoteRequest` mutation for admin approval before conversion
- [ ] Admin: Quotes blade → status transitions, line items, pricing, discussion history

## 21. B2B Lists & Quick Order
- [ ] Create list → name it → add products from catalog → manage items (qty, remove)
- [ ] List rename / delete: edit list name, delete list with confirmation prompt
- [ ] Add to cart from list: select items or "Select All" → verify cart totals
- [ ] Shared list (`scope: "organization"`): visible to other org members, sharing permissions (who can edit items)
- [ ] Private list (`scope: "user"`): scoped to creator, not visible to other org members
- [ ] Bulk add to cart from list: `addBulkItemsCart` mutation — multiple SKUs/qty in one request, partial-success handling (some lines OK, some invalid)
- [ ] Quick Order page: enter SKU directly → autocomplete/suggestions, product image preview → set qty → "Add All to Cart"
- [ ] Wishlist: add from PDP (heart icon) → manage in Account → move to cart
- [ ] Bulk order page (`/bulk-order`): multi-row entry, paste from spreadsheet, error handling for invalid SKUs
- [ ] Saved for Later (`/account/saved-for-later`): view items saved from cart, move back to cart, remove, empty state
- [ ] Back-in-stock list (`/account/back-in-stock`): subscribe from PDP when out of stock, notification on restock, unsubscribe
- [ ] List pagination: large lists with many items support scroll/load-more
- [ ] Move items between lists

## 22. Localization & i18n
- [ ] Language switch → UI labels translated → persist preference across pages and refresh
- [ ] Multi-currency: switch to EUR → prices in EUR → cart totals in EUR → order in EUR
- [ ] All 14 languages: homepage, cart, and checkout labels render correctly per locale
- [ ] Localized URLs: `/{lang}/` prefix (e.g., `/de/catalog`, `/fr/catalog`)
- [ ] Date/number formatting per locale (decimal separator, date order)
- [ ] RTL layout support (Arabic/Hebrew if enabled): text alignment, navigation mirrors
- [ ] Admin: verify order shows correct currency and language in back-office

## 23. Notifications
- [ ] Order confirmation email: sent exactly once after successful order placement (BL-NOTIF-001)
- [ ] Email content: order number, items, quantities, prices, totals match actual order (BL-NOTIF-002)
- [ ] Notification activity feed in Admin: sent/pending/failed status visible per notification
- [ ] Failed notification does not block order placement — order created, email queued for retry (BL-NOTIF-003)
- [ ] Notification templates: personalization tokens resolved (no `{{customerName}}` or blanks in sent email)
- [ ] Registration confirmation email: sent after personal/org registration with activation link
- [ ] Password reset email: sent on request, contains valid reset link with expiry, expired link shows error
- [ ] Order status change emails: notification sent when order transitions (Processing, Shipped, Completed)
- [ ] Quote notification emails: buyer notified when Admin responds to RFQ; Admin notified on accept/reject
- [ ] Locale-aware email content: email rendered in user's preferred language, not store default
- [ ] Admin → Notifications blade: template list, preview, edit, enable/disable per event type
- [ ] Push messages (if enabled): create draft, send to user/role, delivered status in Admin (suite 33)

## 24. White Labeling
- [ ] Resolution chain: user-level override → organization override → store default (BL-B2B-006)
- [ ] Store default theme applied when White Labeling feature is disabled (org overrides ignored)
- [ ] Organization override: custom logo, favicon, theme preset applied for org members on storefront
- [ ] Secondary logo (`secondaryLogoUrl`): footer logo distinct from primary header logo, correct URL, loads without 404
- [ ] Multi-device favicons: `favicons` array with `rel`, `type`, `sizes`, `href` for apple-touch-icon, 32x32, 16x16 etc.
- [ ] Admin → White Labeling blade: upload logo/favicon, select theme preset, assign to org, image upload validation (valid formats accepted, invalid rejected)
- [ ] Main menu & footer links: customizable per organization, nested `childItems` render correctly with valid URLs
- [ ] Locale-aware footer links: `cultureName` parameter returns language-specific footer link content
- [ ] CSS design tokens: theme preset applies full color palette via CSS custom properties (primary, secondary, accent, neutrals, warning, danger, success, info)
- [ ] `data-theme` attribute: `<html>` element has correct `data-theme` value, switching preset changes attribute and all CSS variables
- [ ] Responsive: custom branding renders correctly on desktop, tablet, and mobile viewports
- [ ] Cross-browser: branding consistent across Chrome, Firefox, and Edge
- [ ] Page context: custom branding persists across navigation (catalog, cart, checkout, account pages)

## 25. Account Management
- [ ] Profile page (`/account/profile`): view and edit first name, last name, email with validation (required fields, email format)
- [ ] Profile save: success confirmation, error handling for invalid input
- [ ] Change password (`/account/change-password`): old password required, new password validation (min length, complexity), confirm password match
- [ ] Change password success: confirmation message, session remains active (or forced re-login per policy)
- [ ] Dashboard (`/account/dashboard`): latest orders displayed, monthly spend report accuracy
- [ ] Saved Credit Cards (`/account/saved-credit-cards`): list saved cards, delete a card, default card indicator
- [ ] Coupons & Promotions (`/account/coupons`): coupon cards with code, description, expiry date, expired coupon visual treatment
- [ ] Account sidebar navigation: correct links for all sections, active state highlighting on current page
- [ ] Personal vs corporate account differences: "Addresses" link visible only for personal accounts (not org users)
- [ ] Personal addresses (`/account/addresses`): add, edit, delete address, set default, form validation
- [ ] Account menu redesign: dropdown with user info + organizations list (radio buttons + search), no account nav links in dropdown
- [ ] Loyalty Points History (`/account/points-history`): current balance, earned/redeemed transactions per order with date and amount, pagination, filter by `operationType` (Earned, Redeemed) — link displayed only when loyalty program is enabled
- [ ] Empty states: each account page handles zero-data gracefully (no orders, no cards, no coupons)

## 26. Storefront Push Messages
- [ ] Notifications page (`/account/notifications`): list of received notifications, pagination for older items
- [ ] Read/unread state: unread notifications visually distinct, mark as read on click (`markPushMessageRead` mutation)
- [ ] Mark as unread: toggle read notification back to unread state (`markPushMessageUnread` mutation)
- [ ] Notification badge: unread count indicator in header or account sidebar
- [ ] Mark all as read: bulk action via `markAllPushMessagesRead` mutation
- [ ] Mark all as unread: bulk action via `markAllPushMessagesUnread` mutation
- [ ] Clear all notifications: `clearAllPushMessages` mutation removes all messages, confirmation prompt before action
- [ ] Notification detail: full message content displayed on click/expand
- [ ] Notification link/action: notification links to related entity (order, quote, shipment)
- [ ] Push message targeting: user receives only messages sent to their user/role, not other roles
- [ ] Real-time delivery: `pushMessageCreated` subscription delivers new messages without page refresh (WebSocket/SSE)
- [ ] Empty state: "No notifications" message when inbox is empty

## 27. Coupons & Promotions
- [ ] Coupons page (`/account/coupons`): authenticated access, page loads with list of available coupons/promotions
- [ ] Coupon card display: code, description, expiry date, discount value/percentage, status (active/expired/used)
- [ ] Expired coupon visual treatment: greyed out or strikethrough, cannot be applied
- [ ] Apply coupon in cart: enter valid coupon code → discount applied → totals recalculate
- [ ] Invalid coupon: enter non-existent or expired code → error message displayed, totals unchanged
- [ ] Remove coupon: applied coupon removable from cart, totals revert to original
- [ ] Automatic promotions: catalog-level promotions (e.g., "Buy 2 Get 10% Off") applied without code entry
- [ ] Promotion stacking rules: verify whether multiple promotions/coupons can combine or if best-reward-only policy applies (BL-PRICE-001)
- [ ] Promotion conditions: minimum order amount, specific product/category, date range — verified at cart evaluation
- [ ] Admin → Marketing → Promotions: create, edit, enable/disable promotion with conditions and rewards
- [ ] Admin → Marketing → Coupons: generate coupon codes, set usage limits, assign to promotions
- [ ] Storefront ↔ Admin consistency: promotion visible in storefront matches Admin configuration (discount amount, conditions)

## 28. Security
- [ ] PCI compliance: payment card fields rendered in isolated iframes, card data not in DOM/localStorage/network requests
- [ ] XSS prevention: user-generated content (search queries, addresses, product reviews) sanitized — no script execution
- [ ] CSRF protection: state-changing requests include anti-forgery tokens
- [ ] Authentication token handling: JWT/bearer tokens stored securely, not in URL parameters or localStorage (prefer httpOnly cookies)
- [ ] Session management: session expires after inactivity timeout, forced logout clears all tokens
- [ ] HTTPS enforcement: all pages served over HTTPS, mixed content blocked
- [ ] API authorization: unauthenticated requests to protected endpoints return 401, unauthorized roles return 403
- [ ] Rate limiting: login endpoint, password reset, and API endpoints enforce rate limits (429 on abuse)
- [ ] Input validation: form fields enforce max length, type constraints, reject SQL/NoSQL injection patterns
- [ ] Sensitive data exposure: no PII (emails, addresses, card data) leaked in error messages, logs, or network responses to unauthorized users

## 29. Accessibility
- [ ] Keyboard navigation: all interactive elements (links, buttons, inputs, modals) reachable and operable via Tab/Shift+Tab/Enter/Space
- [ ] Focus management: focus trapped inside open modals/dialogs, returns to trigger element on close
- [ ] Focus indicators: visible outline/ring on focused elements (WCAG 2.4.7)
- [ ] ARIA landmarks: `main`, `nav`, `banner`, `contentinfo` regions defined for screen readers
- [ ] Alt text: all informational images have descriptive `alt` attributes, decorative images have `alt=""`
- [ ] Color contrast: text meets WCAG 2.1 AA minimum contrast ratio (4.5:1 normal, 3:1 large text)
- [ ] Form labels: every input has an associated `<label>` or `aria-label`, error messages linked via `aria-describedby`
- [ ] Screen reader announcements: dynamic content changes (toast notifications, cart updates, validation errors) announced via `aria-live` regions
- [ ] Skip navigation: "Skip to main content" link present and functional as first focusable element
- [ ] Touch targets: interactive elements meet minimum 44x44px touch target size on mobile viewports

## 30. Performance
- [ ] Page load time: homepage, category page, PDP load within acceptable thresholds (LCP < 2.5s on 4G)
- [ ] Core Web Vitals: LCP, FID/INP, CLS measured and within "Good" thresholds per Google guidelines
- [ ] API response time: xAPI GraphQL queries (products, cart, checkout) respond within 2s under normal load
- [ ] Image optimization: product images served in modern formats (WebP/AVIF), lazy-loaded below fold
- [ ] Bundle size: JavaScript bundle size within budget, no unnecessary vendor code shipped to client
- [ ] Search performance: autocomplete dropdown responds within 300ms of keystroke, full search results within 2s
- [ ] Cart operations: add/remove/update cart items reflected in UI within 1s
- [ ] Pagination performance: "Load More" / next page renders within 1.5s, no layout shift during load

## 31. Browser Compatibility
- [ ] Chrome (latest): all critical flows (auth, catalog, cart, checkout, payment) work correctly
- [ ] Firefox (latest): layout, functionality, and payment forms render and function identically to Chrome
- [ ] Edge (latest): all flows work correctly, Edge-specific rendering verified
- [ ] Safari (macOS/iOS): layout and functionality verified on WebKit engine (if applicable to target audience)
- [ ] Mobile browsers (Chrome Android, Safari iOS): responsive layout, touch interactions, viewport scaling correct
- [ ] CSS consistency: fonts, colors, spacing, grid layouts render consistently across browsers
- [ ] JavaScript compatibility: no browser-specific JS errors in console across supported browsers

## 32. B2C Features
- [ ] B2C product variations: inline variant selection on product cards (color/size swatches visible in listing)
- [ ] B2C cart layout: simplified cart without B2B-specific elements (no org switcher, no quote option)
- [ ] Wishlist: add product from PDP (heart icon), view in `/account/wishlist`, move to cart, remove
- [ ] Compare list: add products to compare, view side-by-side comparison of specs/prices, remove items
- [ ] Guest checkout: complete purchase without account registration (if enabled), email-only identification
- [ ] Social login: sign in via Google/Facebook/Apple (if configured), account linking
- [ ] Product reviews: submit star rating + text review on PDP, moderation workflow, average rating display
- [ ] Recently browsed: recently viewed products section on homepage/cart/PDP sidebar
- [ ] Promotional banners: homepage hero banners, category-level promotions render with correct links
- [ ] Single-user account: personal account without organization context, "Addresses" link visible in sidebar

## 33. Subscriptions & Recurring Orders
> Applies only when the **Subscription** module is enabled for the store. Skip this section in environments without subscriptions configured.
- [ ] Create subscription from cart/order: convert eligible items into a recurring schedule (interval, count or end-date)
- [ ] Subscription detail page (`/account/subscriptions/{id}`): items, schedule, next run date, status (Active, Paused, Cancelled)
- [ ] Subscriptions list (`/account/subscriptions`): pagination, filter by status, sort by next run date
- [ ] Pause subscription → next recurring order skipped, status reflected; resume restores schedule
- [ ] Cancel subscription → no future orders generated, history preserved; cancellation reason captured (if configured)
- [ ] Edit subscription items: change quantity / remove line / add line; new schedule recalculates totals
- [ ] Edit schedule: change interval (daily/weekly/monthly), end date, or recurrence count; validation on minimum/maximum interval
- [ ] Recurring order generation: Admin job creates child order on next run date with current pricing; failure (e.g. payment decline, out-of-stock) handled per policy
- [ ] Subscription notifications: email/push when child order is created, when payment fails, when subscription is about to expire
- [ ] Permissions: only the subscription owner (or org maintainer for org-scoped subs) can pause/cancel/edit; other roles see read-only

---

## BF. Bug Fix Verification

> **Cross-domain checklist. Used by qa-lead-orchestrator (Workflow 5) when delegating bug fix verification to test-management-specialist.** Combine with the affected domain's checklist (#1-32) and/or `backend-admin-checklists.md` (A1-A27) for full coverage.

**Fix Confirmation (always):**
- [ ] Original bug reproduced first (STR from ticket), then verify fix resolves the exact reported issue
- [ ] Root cause addressed — not just the symptom (e.g., null check vs data source fix)
- [ ] All acceptance criteria / fix description from the ticket satisfied

**Regression Scope (always):**
- [ ] Adjacent features in the same domain still work (pull 2-3 items from domain checklist #1-32 or admin checklist A1-A27)
- [ ] Related domains unaffected (e.g., cart fix → checkout still works, payment still processes)
- [ ] No new console errors or failed network requests introduced by the fix

**Cross-Layer Verification (when fix modifies data):**
- [ ] Storefront reflects the corrected behavior
- [ ] API returns expected response (check via DevTools Network tab or direct xAPI call)
- [ ] Admin shows correct data (if the fix touches persisted entities)

**Edge Cases (pick applicable):**
- [ ] Boundary values around the fix (min/max qty, empty input, special characters — whatever triggered the original bug)
