# Domain Test Case Writing Checklists

> Reference file for `test-management-specialist` agent and `/qa-checklist` skill. Read on-demand when writing test cases for a specific domain.

**18 domains + 1 cross-domain checklist | 158 checklist items** — every checked item should map to at least one test case.

## Summary

| # | Domain | Items | E2E Catalog | Related Suites |
|---|--------|-------|-------------|----------------|
| 1 | Auth | 8 | E2E-AUTH | 01, 02, 08 |
| 2 | Catalog | 8 | E2E-CAT | 01, 03, 16 |
| 3 | Categories | 6 | E2E-CAT | 03, 16 |
| 4 | SEO | 7 | E2E-CAT | 31 |
| 5 | Add to Cart | 9 | E2E-CART | 01, 04 |
| 6 | Search | 8 | E2E-SEARCH | 03, 26 |
| 7 | Ship-to Selector | 6 | E2E-CHK | 04 |
| 8 | Cart/Checkout | 11 | E2E-CHK | 04, 06 |
| 9 | Payment | 8 | E2E-PAY | 06 |
| 10 | Orders | 7 | E2E-ORD | 01, 20 |
| 11 | Company Members | 7 | E2E-MEMBER | 02, 21 |
| 12 | Multi-Org | 7 | E2E-ORG | 02, 21 |
| 13 | Product Configurations & Variations | 14 | E2E-CONFIG | 36 |
| 14 | Google Analytics | 6 | E2E-GA | 07 |
| 15 | BOPIS (Pickup) | 7 | E2E-BOPIS | 05, 30 |
| 16 | B2B Quotes & RFQ | 8 | E2E-QUOTE | 20 |
| 17 | B2B Lists & Quick Order | 7 | E2E-LIST | 13 |
| 18 | Localization & i18n | 7 | E2E-L10N | 10 |
| **BF** | **Bug Fix Verification** | **10** | *cross-domain* | *per bug* |

---

## 1. Auth
- [ ] Personal registration (form validation, confirmation, first sign-in)
- [ ] Organization registration (company details, B2B features unlocked)
- [ ] Sign-in / Sign-out (session persistence across pages, refresh, redirect)
- [ ] Password reset (email link, new password works, old rejected)
- [ ] Invalid login attempts (lockout after N failures, recovery)
- [ ] Remember me / session expiry / token refresh
- [ ] Concurrent sessions (two browsers, sign-out isolation)
- [ ] Registration validation (duplicate email, weak password, mismatched confirm)

## 2. Catalog
- [ ] Category navigation → product grid → PDP → breadcrumbs round-trip
- [ ] Faceted filtering: brand, price range, color, size, availability, type
- [ ] Filter chips: display, remove one, "Clear All"
- [ ] Sorting: price asc/desc, name A-Z, relevance
- [ ] Pagination / "Load More" / page count
- [ ] PDP: name, price, SKU, image gallery (thumbnails switch main), specs, reviews
- [ ] In-stock / out-of-stock filter, "Purchased Before" (B2B)
- [ ] SEO-friendly URLs, canonical links, meta title/description

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

## 6. Search
- [ ] Search input: type, autocomplete dropdown with product previews (image, name, price)
- [ ] Clear input (X button), empty state
- [ ] Global search → results page → result count → click product → back to results
- [ ] Within-category search (scoped results)
- [ ] Search history: recent queries shown, click to re-search, clear history
- [ ] No results: "No results" message, suggested categories/popular products
- [ ] Typo tolerance / fuzzy matching / "Did you mean...?"
- [ ] "View All Results" link from dropdown

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

## 9. Payment
- [ ] Skyflow Visa: card entry → tokenization → payment success → order status "Paid"
- [ ] Skyflow Mastercard: card type detected, payment success
- [ ] CyberSource: card entry, 3DS challenge (if applicable), order confirmed
- [ ] Authorize.Net: card entry, transaction ID in confirmation, Admin captured
- [ ] DataTrance: card + expiry + CVV → OTP prompt → enter OTP → verify payment
- [ ] Declined card: error message, retry with different card, success
- [ ] Form validation: required fields, card format, expiry format, CVV length
- [ ] PCI: card in iframe/tokenized, not in network requests or localStorage

## 10. Orders
- [ ] Order detail page: items, quantities, prices, addresses, payment, shipping, status
- [ ] Order history table: list view, pagination
- [ ] Filters: date range, status (New, Processing, Shipped, Completed, Cancelled)
- [ ] Search by order number
- [ ] Reorder: items added to cart with correct qty, current prices (may differ)
- [ ] Order status lifecycle: Admin updates status → storefront reflects
- [ ] Tracking number visible when shipped

## 11. Company Members
- [ ] Invite member: enter email, assign role (Buyer/Admin), send
- [ ] Invited user registers via link → appears in list with correct role
- [ ] Edit role: Buyer → Admin (gains invite/manage permissions)
- [ ] Block member → cannot sign in; Unblock → can sign in, data preserved
- [ ] Filter by role (Buyer, Admin), filter by status (Active, Blocked)
- [ ] Search members by name
- [ ] Delegated purchasing: Buyer places order → requires approval → Admin approves

## 12. Multi-Org
- [ ] Org switcher: current org in header, list of assigned orgs, switch
- [ ] Cart isolation: Org A cart ≠ Org B cart, switching preserves each
- [ ] Ship-to per company: addresses scoped to active org, no cross-contamination
- [ ] Org-specific pricing: same product, different price per org
- [ ] Default org on sign-in, full context change on switch (catalog, prices, cart, addresses)
- [ ] Shared lists visible across org members; private lists scoped to creator
- [ ] Account menu dropdown: user section + organizations with radio buttons + search

## 13. Product Configurations & Variations
- [ ] Variation swatches: color, size selectors displayed on PDP
- [ ] Select variation → price updates, image gallery switches to variant images
- [ ] "From $X" price on listing → specific price after variant selection
- [ ] "N variations" link on product card → opens variation selector or separate page
- [ ] Out-of-stock variant: greyed/disabled, "Out of Stock" message, cannot add
- [ ] Unavailable combinations: selecting one option disables incompatible others
- [ ] Stock per variation: inventory shown for selected variant
- [ ] Configurable product: "Customize" CTA → sections (Section 1 → 2 → 3) → running total
- [ ] File upload options (required vs optional) in configurator
- [ ] Custom text properties (Custom1, Custom2, Custom3 fields)
- [ ] Configured product in cart: shows selected options, edit reopens configurator
- [ ] Cart line shows variant details (color, size) not just parent product name
- [ ] B2B vs B2C layout differences for variation products
- [ ] Category `/products-with-options`: 8 configurable + 7 variation products as test data

## 14. Google Analytics
- [ ] `view_item` event on PDP: product ID, name, price, category
- [ ] `add_to_cart` event: item details, quantity, value
- [ ] `begin_checkout` → `add_shipping_info` → `add_payment_info` → `purchase` funnel
- [ ] `search` event with `search_term`; `view_search_results` with result count
- [ ] Verify via DevTools console: `window.dataLayer` entries
- [ ] Verify via Network tab: GA4 collect endpoint requests

## 15. BOPIS (Pickup)
- [ ] Select "Pickup" delivery → location selector opens (map + list)
- [ ] Browse/search pickup locations by zip code or city → results sorted by distance
- [ ] Select store → verify address, hours, and pin highlighted on map
- [ ] Mixed cart: pickup-eligible item shows pickup option, delivery-only item shows delivery only
- [ ] Change pickup location during checkout → address and pricing update
- [ ] Pickup map modal: resize, responsive layout, touch targets (44x44px min on mobile)
- [ ] Order confirmation shows pickup location details and instructions

## 16. B2B Quotes & RFQ
- [ ] Create RFQ: add products, specifications, attachments → submit → status "Processing"
- [ ] Quote negotiation: Admin responds with pricing → storefront shows quote received
- [ ] Accept quote → converts to order with quoted prices (not catalog prices)
- [ ] Reject quote → enter reason → status "Rejected" → Admin sees rejection
- [ ] Quote with substitutions: Admin offers alternate product → buyer reviews
- [ ] Quote expiry: expired quote shows "Expired", cannot convert to order
- [ ] Quote history: list view, filter by status (Processing, Accepted, Rejected, Expired)
- [ ] Admin: Quotes blade → status transitions, line items, pricing, discussion history

## 17. B2B Lists & Quick Order
- [ ] Create list → name it → add products from catalog → manage items (qty, remove)
- [ ] Add to cart from list: select items or "Select All" → verify cart totals
- [ ] Shared list: visible to other org members, members can add items
- [ ] Private list: scoped to creator, not visible to other org members
- [ ] Quick Order page: enter SKU directly → product found → set qty → "Add All to Cart"
- [ ] Wishlist: add from PDP (heart icon) → manage in Account → move to cart
- [ ] Bulk order page (`/bulk-order`): multi-row entry, paste from spreadsheet

## 18. Localization & i18n
- [ ] Language switch → UI labels translated → persist preference across pages and refresh
- [ ] Multi-currency: switch to EUR → prices in EUR → cart totals in EUR → order in EUR
- [ ] All 14 languages: homepage, cart, and checkout labels render correctly per locale
- [ ] Localized URLs: `/{lang}/` prefix (e.g., `/de/catalog`, `/fr/catalog`)
- [ ] Date/number formatting per locale (decimal separator, date order)
- [ ] RTL layout support (Arabic/Hebrew if enabled): text alignment, navigation mirrors
- [ ] Admin: verify order shows correct currency and language in back-office

---

## BF. Bug Fix Verification

> **Cross-domain checklist. Used by qa-lead-orchestrator (Workflow 5) when delegating bug fix verification to test-management-specialist.** Combine with the affected domain's checklist (#1-18) for full coverage.

**Fix Confirmation (always):**
- [ ] Original bug reproduced first (STR from ticket), then verify fix resolves the exact reported issue
- [ ] Root cause addressed — not just the symptom (e.g., null check vs data source fix)
- [ ] All acceptance criteria / fix description from the ticket satisfied

**Regression Scope (always):**
- [ ] Adjacent features in the same domain still work (pull 2-3 items from domain checklist #1-18)
- [ ] Related domains unaffected (e.g., cart fix → checkout still works, payment still processes)
- [ ] No new console errors or failed network requests introduced by the fix

**Cross-Layer Verification (when fix modifies data):**
- [ ] Storefront reflects the corrected behavior
- [ ] API returns expected response (check via DevTools Network tab or direct xAPI call)
- [ ] Admin shows correct data (if the fix touches persisted entities)

**Edge Cases (pick applicable):**
- [ ] Boundary values around the fix (min/max qty, empty input, special characters — whatever triggered the original bug)
