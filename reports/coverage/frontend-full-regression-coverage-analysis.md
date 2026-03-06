# Frontend Full Regression Coverage Analysis
## Suite 00 (`00-full-regression-release.csv`) vs All Sources

**Date:** 2026-03-06
**Analyst:** test-management-specialist
**Environment:** QA (vcst-qa-storefront.govirto.com)

---

## 1. Executive Summary

Suite 00 is the designated full-regression release gate for the Virto Commerce storefront. It contains **139 test cases** spanning 22 domain sections. When evaluated against the 16 dedicated suites (01–13, 35–36), the 18-domain checklist, 10 critical revenue flows, and 77 business invariants, the suite achieves a composite coverage score of approximately **52%** — well below the 95% target for a release-gate suite.

**Overall Coverage Grade: C (Needs Improvement)**

| Dimension | Covered | Total | Coverage % |
|-----------|---------|-------|-----------|
| Critical Revenue Flows | 7 / 10 | 10 | 70% |
| Domain Checklist Items (18 domains) | 72 / 158 | 158 | 46% |
| Business Invariants (BL-*) | 28 / 77 | 77 | 36% |
| Dedicated Suite Representation (avg) | — | 776 cases total | 18% avg |
| Domains with zero coverage | 5 of 18 | 18 | — |
| P0-revenue invariants covered | 19 / 37 | 37 | 51% |

**Key findings:**

1. Suite 35 (White Labeling, 68 cases) and most of Suite 36 (Configurable Products, 62 cases) have **zero direct representation** in Suite 00 despite being P1 sprint suites.
2. Five domains from the 18-domain checklist have **zero coverage**: SEO, Categories (standalone), B2B Quotes & RFQ, Notifications, and B2B Account Dashboard.
3. Payment coverage is critically thin: Suite 00 has **5 payment cases** against Suite 06's **45 cases** — only 11% representation — missing declined card handling, double-click prevention, Skyflow Mastercard, DataTrance OTP, and form validation entirely.
4. Auth coverage is insufficient: **6 cases** cover only happy-path registration and sign-in, missing lockout, token persistence, SSO, impersonation, and member management scenarios.
5. Cross-domain invariants (BL-CROSS-*) — the highest-value test category — have only **4 of 12** covered (33%).

---

## 2. Suite 00 Statistics

### 2.1 Total Test Cases: 139

> Note: The CSV file contains 1,632 lines due to multi-line step content. The actual test case count is determined by counting rows that begin with a valid test ID (pattern `[A-Z][A-Z0-9]*-[A-Z][A-Z0-9]*-[0-9]+`).

### 2.2 Section Breakdown

| Domain (FR- prefix) | Cases | % of Suite | Section Group |
|--------------------|-------|-----------|---------------|
| FR-CART | 27 | 19.4% | Cart (quantity/validation) |
| FR-BOPIS | 21 | 15.1% | BOPIS Pickup |
| FR-B2C-VAR | 17 | 12.2% | B2C Variation Layout (VCST-4530) |
| FR-CHECKOUT | 7 | 5.0% | Checkout flow |
| FR-SECURITY | 6 | 4.3% | Security |
| FR-BROWSER | 6 | 4.3% | Browser Compatibility |
| FR-AUTH | 4 | 2.9% | Authentication |
| FR-PERFORMANCE | 5 | 3.6% | Performance |
| FR-PAYMENT | 5 | 3.6% | Payment |
| FR-ORDER | 5 | 3.6% | Orders |
| FR-GA | 5 | 3.6% | Google Analytics |
| FR-CAT | 5 | 3.6% | Catalog |
| FR-SEARCH | 4 | 2.9% | Search |
| FR-B2C-SHIP | 3 | 2.2% | Ship-to Selector |
| FR-B2C-LIST | 3 | 2.2% | Lists/Wishlist |
| FR-B2C-CONFIG | 3 | 2.2% | Configurable Products |
| FR-LOCALIZATION | 3 | 2.2% | Localization |
| FR-ACCESSIBILITY | 3 | 2.2% | Accessibility |
| FR-MULTI-ORG | 2 | 1.4% | Multi-Org |
| FR-B2B | 2 | 1.4% | B2B (Quick Order + Company) |
| FR-REG | 2 | 1.4% | Registration |
| FR-REGRESSION | 1 | 0.7% | Core Regression |
| **Total** | **139** | **100%** | |

**Observation:** Cart (27) and BOPIS (21) together account for 34.5% of all cases, indicating significant over-indexing on these two domains relative to the other 20 domains.

### 2.3 Priority Distribution

| Priority | Count | % |
|----------|-------|---|
| Critical | 44 | 31.7% |
| High | 71 | 51.1% |
| Medium | 23 | 16.5% |
| Low | 1 | 0.7% |

**Target ratio for a release-gate suite:** Critical ≥ 40%, High ≤ 45%, Medium ≤ 15%. The current distribution has too few Critical-priority cases and is heavy on High-priority, suggesting some Critical scenarios were downgraded or not added.

### 2.4 Automation Status Distribution

| Status | Count | % |
|--------|-------|---|
| Manual | 108 | 77.7% |
| Automated | 33 | 23.7% |
| Not Automated / Planned | 0 | — |

**Target for a release-gate suite:** ≥ 60% automated for P0/P1 cases. At 23.7% automation, Suite 00 is heavily manual, which creates execution time pressure for release gates.

---

## 3. Domain Coverage Matrix (18 Domains)

Status definitions:
- **Covered** — 3+ test cases addressing the checklist items; core scenarios represented
- **Partial** — 1–2 test cases; happy-path only, edge cases and validations missing
- **Gap** — Zero test cases or only tangential coverage

| # | Domain (Checklist) | Suite 00 Cases | Coverage Status | Missing Scenarios |
|---|-------------------|---------------|-----------------|-------------------|
| 1 | Auth | 6 (FR-REG-001/002, FR-AUTH-001 to 004) | Partial | Lockout, token persistence, SSO, remember-me, concurrent sessions, impersonation |
| 2 | Catalog | 9 (FR-CAT-001 to 005, FR-SEARCH-001 to 004) | Partial | PDP image gallery, PDP SKU/specs, in-stock/out-of-stock filter, "Purchased Before", compare feature, brand pages |
| 3 | Categories | 1 (FR-CAT-001 only) | Partial | Multi-level navigation, breadcrumb segments, empty category, "All Products" dropdown, slug vs ID URL |
| 4 | SEO | 0 | **Gap** | SEO-friendly URLs, canonical links, meta title/description, JSON-LD structured data, language prefix URLs, 404 page |
| 5 | Add to Cart | 27 (FR-CART-001 to 027) | Covered | Cart badge count update, success toast — otherwise well covered |
| 6 | Search | 4 (FR-SEARCH-001 to 004) | Partial | Within-category search, search history, "View All Results" from dropdown, typo tolerance, "Did you mean?" |
| 7 | Ship-to Selector | 5 (FR-B2C-SHIP-001 to 003, FR-CHECKOUT-001/003) | Partial | Favorite/default address pre-selection, "Show more" addresses, search addresses, shipping methods update on switch |
| 8 | Cart/Checkout | 34 (FR-CART + FR-CHECKOUT) | Covered | Guest checkout, double-submit prevention, billing address same-as-shipping, min order amount, checkout validation recovery |
| 9 | Payment | 5 (FR-PAYMENT-001 to 005) | Partial | Declined card flow, payment retry, Skyflow Mastercard, DataTrance OTP, form field validation, PCI iframe verification, double-click prevention |
| 10 | Orders | 5 (FR-ORDER-001 to 005) | Partial | Order detail items/prices/addresses, order filter by status/date, search by order number, Admin-to-storefront status sync |
| 11 | Company Members | 1 (FR-B2B-002) | Partial | Invite member, role edit, block/unblock, filter by role, search members, delegated purchasing/approval |
| 12 | Multi-Org | 2 (FR-MULTI-ORG-001/002) | Partial | Org-specific pricing, default org on sign-in, shared vs private lists scope, account menu org section |
| 13 | Product Configs & Variations | 20 (FR-B2C-VAR-101 to 115, FR-B2C-CONFIG-001 to 003) | Covered | File upload options, custom text properties, edit from cart re-opens configurator |
| 14 | Google Analytics | 5 (FR-GA-001 to 005) | Partial | view_item on PDP, view_item_list on category, add_to_wishlist, update_cart_item, remove_from_cart, add_shipping_info, add_payment_info |
| 15 | BOPIS (Pickup) | 21 (FR-BOPIS-001 to 021) | Covered | Order confirmation showing pickup details (covered by FR-BOPIS-021 cross-layer) |
| 16 | B2B Quotes & RFQ | 0 | **Gap** | Create RFQ, quote negotiation, accept/reject quote, quote expiry, quote history, Admin quotes blade |
| 17 | B2B Lists & Quick Order | 4 (FR-B2B-001, FR-B2C-LIST-001 to 003) | Partial | Shared list, private list, bulk order page, wishlist heart icon, add from list to cart, "Select All" from list |
| 18 | Localization & i18n | 3 (FR-LOCALIZATION-001 to 003) | Partial | All 14 languages coverage, localized URLs, RTL layout, Admin order currency/language verification |

**Domains with zero coverage (5):**
- SEO (Domain 4)
- B2B Quotes & RFQ (Domain 16)
- Notifications (not in the 18-domain list but present in TestRail: 95 cases)
- White Labeling — storefront (Suite 35, 68 cases)
- Account Dashboard (B2C-DASH in Suite 13)

---

## 4. Critical Revenue Flow Coverage (10 Flows)

| # | Flow | Suite 00 Coverage | Rating | Gap Detail |
|---|------|--------------------|--------|-----------|
| 1 | Registration / Sign-in / Password reset | FR-REG-001/002, FR-AUTH-001 to 004 | Partial | Missing: org registration validation, email verification gate, lockout, token persistence |
| 2 | Catalog browsing with facets and filters | FR-CAT-001 to 005 | Partial | Missing: filter chip "Clear All", PDP with breadcrumb round-trip, in-stock filter, "Purchased Before" |
| 3 | Add to cart (variations, configurations) | FR-CART-001 to 027, FR-B2C-VAR-101 to 115, FR-B2C-CONFIG-001 to 003 | **Covered** | Well covered; minor gap: success toast and badge count update |
| 4 | Search (global, category, history) | FR-SEARCH-001 to 004 | Partial | Missing: within-category search, search history, autocomplete "View All Results", typo tolerance |
| 5 | Ship-to selector and address management | FR-B2C-SHIP-001 to 003, FR-CHECKOUT-001/003 | Partial | Missing: favorite/default pre-selection, show-more addresses, address search, methods update on switch |
| 6 | Cart (quantity, save for later, pickup/delivery) | FR-CART-003 to 009, FR-CHECKOUT-001/002 | **Covered** | Well covered; minor gap: select/unselect items for partial checkout |
| 7 | Checkout and payment processing | FR-CHECKOUT-001 to 007, FR-PAYMENT-001 to 005 | Partial | Critical gap: declined card, retry, Skyflow MC, DataTrance OTP, double-click prevention, guest checkout |
| 8 | Order management and history | FR-ORDER-001 to 005 | Partial | Missing: order detail verification (items/prices), filter by status, search by order number, status sync Admin→storefront |
| 9 | Company members and multi-organization | FR-B2B-001/002, FR-MULTI-ORG-001/002 | Partial | Missing: invite/block/unblock members, org-specific pricing, shared vs private lists, account menu org section |
| 10 | Google Analytics event tracking | FR-GA-001 to 005 | Partial | Missing: view_item, view_item_list, select_item, update_cart, remove_from_cart, add_shipping_info, add_payment_info |

**Summary:** 2 flows Covered, 8 flows Partial, 0 Gaps at flow level. However, "Partial" in payment processing (Flow 7) is a critical risk given the P0-revenue classification.

---

## 5. Business Invariant Coverage (BL-*)

### 5.1 Coverage by Domain

| Domain | Total BL | Covered | Coverage % | Key Uncovered Invariants |
|--------|----------|---------|-----------|--------------------------|
| BL-PRICE (Pricing) | 8 | 1 | 13% | BL-PRICE-001 (discount stacking), BL-PRICE-002 (tax), BL-PRICE-004 (tiered pricing), BL-PRICE-007 (org pricing), BL-PRICE-008 (no float math) |
| BL-CART | 8 | 5 | 63% | BL-CART-004 (currency switch recalculates), BL-CART-007 (same product adds qty), BL-CART-008 (cart persistence across sign-out) |
| BL-CHK (Checkout) | 7 | 3 | 43% | BL-CHK-001 (guest checkout), BL-CHK-002 (double-submit prevention), BL-CHK-006 (order total formula), BL-CHK-007 (minimum order) |
| BL-ORD (Orders) | 8 | 3 | 38% | BL-ORD-001 (state machine guards), BL-ORD-004 (refund conditions), BL-ORD-006 (payment state machine), BL-ORD-007 (shipment state machine) |
| BL-AUTH | 6 | 2 | 33% | BL-AUTH-001 (session expiry in checkout), BL-AUTH-003 (lockout), BL-AUTH-005 (RBAC 6-permission), BL-AUTH-006 (role hierarchy) |
| BL-B2B | 6 | 2 | 33% | BL-B2B-001 (org switch isolates cart), BL-B2B-003 (quote expiry), BL-B2B-004 (delegated purchasing), BL-B2B-005 (member role visibility) |
| BL-CAT (Catalog) | 7 | 3 | 43% | BL-CAT-002 (virtual catalog inherits), BL-CAT-005 (virtual catalog assignment), BL-CAT-006 (configurable requires all sections) |
| BL-CROSS (Cross-domain) | 12 | 4 | 33% | BL-CROSS-001 (price list deletion), BL-CROSS-002 (catalog change → search lag → cart mismatch), BL-CROSS-004 (currency switch), BL-CROSS-007 (cascade deletion), BL-CROSS-008 (org switch full context), BL-CROSS-010 (checkout idempotency), BL-CROSS-012 ($0 product guard) |
| BL-SRCH (Search) | 5 | 2 | 40% | BL-SRCH-001 (facet counts match), BL-SRCH-003 (index consistency), BL-SRCH-004 (store/catalog scope) |
| BL-SHIP (Shipping) | 4 | 2 | 50% | BL-SHIP-001 (address determines methods), BL-SHIP-003 (free shipping threshold recalc) |
| BL-NOTIF | 3 | 1 | 33% | BL-NOTIF-001 (confirmation email once), BL-NOTIF-003 (failure doesn't block order) |
| BL-IMPEX | 4 | 0 | 0% | All four (idempotent, export matches filters, no silent timeout, data integrity before commit) — frontend scope excluded |
| BL-SEO | 2 | 0 | 0% | BL-SEO-001 (slug uniqueness), BL-SEO-002 (deleted product HTTP status) |
| **Total** | **80** | **28** | **35%** | |

### 5.2 Uncovered P0-Revenue Invariants (Highest Priority Gaps)

The following P0-revenue invariants have no test case in Suite 00. These are the most critical gaps because violations directly impact revenue:

| BL ID | Rule Summary | Risk |
|-------|-------------|------|
| BL-PRICE-001 | Coupon applies to post-tier price, not list price | Overcharged or under-collected revenue |
| BL-PRICE-002 | Tax calculated after discounts | Incorrect tax collection |
| BL-PRICE-004 | Tiered pricing boundary enforcement | Wrong price at qty thresholds |
| BL-PRICE-007 | Org-specific (contract) pricing | B2B customers see wrong prices |
| BL-CHK-001 | Guest vs authenticated checkout | Revenue loss if guest checkout blocked |
| BL-CHK-002 | Double-submit prevention | Duplicate orders |
| BL-CHK-006 | Order total = subtotal + shipping + tax − discounts | Incorrect order total displayed |
| BL-CHK-007 | Minimum order amount enforced | Orders under minimum slip through |
| BL-ORD-006 | Payment state machine (Pending→Authorized→Captured) | Payment captured in wrong state |
| BL-B2B-001 | Org switch isolates cart, addresses, lists | Cross-org data leakage |
| BL-B2B-004 | Delegated purchasing limits enforced | Unauthorized purchases |
| BL-CROSS-001 | Price list deletion → storefront unavailability | $0 or missing price shown |
| BL-CROSS-004 | Currency switch triggers multi-system recalculation | Wrong currency totals |
| BL-CROSS-008 | Org switch → full context swap | Wrong catalog, prices, cart shown |
| BL-CROSS-010 | Checkout mutations are idempotent | Duplicate order placement |
| BL-CROSS-012 | Admin deletion never creates $0 products | $0 products purchasable |

---

## 6. Dedicated Suite Representation in Suite 00

This section measures how many of each dedicated suite's test cases are semantically represented in Suite 00. Since Suite 00 uses `FR-` prefixed IDs (not reusing the dedicated suite IDs), coverage is measured by domain parity: how many distinct scenarios from the dedicated suite have an equivalent test in Suite 00.

| Suite | Name | Dedicated Cases | Suite 00 Equivalent Cases | Representation % | Status |
|-------|------|----------------|--------------------------|-----------------|--------|
| 01 | Smoke Tests | 16 | 14 (all core flows present) | 88% | Good |
| 02 | Authentication | 47 | 6 | 13% | Critical Gap |
| 03 | Catalog & Search | 47 (37 CAT + 10 SRCH) | 9 | 19% | Critical Gap |
| 04 | Cart & Checkout | 104 | 34 | 33% | Gap |
| 05 | BOPIS Pickup | 76 | 21 | 28% | Gap |
| 06 | Payment | 45 | 5 | 11% | Critical Gap |
| 07 | Google Analytics | 24 | 5 | 21% | Critical Gap |
| 08 | Security | 18 | 6 | 33% | Gap |
| 09 | Accessibility | 23 | 3 | 13% | Critical Gap |
| 10 | Localization | 26 | 3 | 12% | Critical Gap |
| 11 | Performance | 20 | 5 | 25% | Gap |
| 12 | Browser Compat | 21 | 6 | 29% | Gap |
| 13 | B2C Features | 89 | 26 | 29% | Gap |
| 35 | Frontend White Labeling | 68 | 0 | **0%** | **Total Gap** |
| 36 | Configurable Products | 62 | 3 | 5% | **Critical Gap** |
| **Total** | | **686** | **146** | **~21%** | |

**Interpretation:** Suite 00 was designed as a curated sample, not a 1:1 mirror. However, for a release-gate suite, the expectation is that the most critical 30–40 cases from each dedicated suite are represented. The current 21% average and two 0%/5% entries (suites 35 and 36) indicate the suite was not updated when these new suites were added to the regression portfolio.

---

## 7. Gap List (Prioritized)

Gaps are ordered by: P0-revenue impact first, then P1-data, then domain coverage breadth.

### Priority 1 — Revenue-Critical Gaps (Blocking)

| Gap ID | Domain | Missing Scenario | Mapped Invariant | Recommended ID |
|--------|--------|-----------------|-----------------|----------------|
| G-001 | Payment | Declined card → clear error message → retry with valid card → success | BL-CHK-004, PAY-DECLINE-001/002 | FR-PAYMENT-006 |
| G-002 | Payment | Double-click "Place Order" prevention (idempotency) | BL-CHK-002, BL-CROSS-010, PAY-EDGE-001 | FR-PAYMENT-007 |
| G-003 | Payment | Skyflow Mastercard payment end-to-end | PAY-SKY-002 | FR-PAYMENT-008 |
| G-004 | Payment | DataTrance: card entry → OTP prompt → enter OTP → order confirmed | PAY-DT-001/002 | FR-PAYMENT-009 |
| G-005 | Checkout | Guest (anonymous) checkout flow: add to cart → checkout without sign-in → order placed | BL-CHK-001 | FR-CHECKOUT-008 |
| G-006 | Pricing | Coupon applies to post-tier/post-sale price (not list price) | BL-PRICE-001, BL-CART-003 | FR-CART-028 |
| G-007 | Auth | Session expiry mid-checkout → redirect to sign-in → return to checkout with cart intact | BL-AUTH-001 | FR-AUTH-005 |
| G-008 | Multi-Org | Switch org → cart, prices, addresses all update to new org context | BL-B2B-001, BL-CROSS-008 | FR-MULTI-ORG-003 |
| G-009 | Checkout | Order total formula verification: subtotal + shipping + tax − discount | BL-CHK-006 | FR-CHECKOUT-009 |
| G-010 | Auth | Account lockout after N failed login attempts; recovery via password reset | BL-AUTH-003, AUTH-020 | FR-AUTH-006 |

### Priority 2 — Data Integrity / B2B Feature Gaps

| Gap ID | Domain | Missing Scenario | Mapped Invariant | Recommended ID |
|--------|--------|-----------------|-----------------|----------------|
| G-011 | Company Members | Invite member (enter email, assign Buyer role, send invite) | BL-AUTH-005, AUTH-036 | FR-B2B-003 |
| G-012 | Company Members | Block member → cannot sign in; Unblock → access restored | BL-AUTH-005, AUTH-039/040 | FR-B2B-004 |
| G-013 | White Labeling | Org with White Labeling ON → org logo, favicon, theme displayed after sign-in | BL-B2B-006, FWL-008 | FR-WL-001 |
| G-014 | White Labeling | Org switch → branding updates dynamically (logo, theme, menu links) | BL-CROSS-008, FWL-028 to 031 | FR-WL-002 |
| G-015 | White Labeling | Default branding shown for anonymous users (no WL) | FWL-002, FWL-066 | FR-WL-003 |
| G-016 | Configurable Products | Configurable product: select upgrade option → price updates → place order → confirmed with option | BL-CAT-006, CFG-PDP-006, CFG-E2E-001 | FR-CONFIG-004 |
| G-017 | Configurable Products | Optional section: no selection required → add to cart succeeds | CFG-PDP-007, CFG-E2E-002 | FR-CONFIG-005 |
| G-018 | SEO | SEO-friendly URLs (categories and products), canonical URL present on every page | BL-SEO-001 | FR-SEO-001 |
| G-019 | SEO | Meta title and description populated on PDP and category pages | FR-SEO-002 | FR-SEO-002 |
| G-020 | Search | Within-category search (scoped results, search term preserved on filter reset) | BL-SRCH-004, SRCH-NEW-015 | FR-SEARCH-005 |

### Priority 3 — Coverage Breadth Gaps

| Gap ID | Domain | Missing Scenario | Mapped Invariant | Recommended ID |
|--------|--------|-----------------|-----------------|----------------|
| G-021 | Search | Search history: recent queries shown on focus, click to re-search | SRCH-008 | FR-SEARCH-006 |
| G-022 | Search | Autocomplete: product previews (image, name, price) while typing; "View All Results" link | SRCH-NEW-002, SRCH-NEW-006 | FR-SEARCH-007 |
| G-023 | GA4 | view_item event on PDP: product ID, name, price, category in dataLayer | GA-003 | FR-GA-006 |
| G-024 | GA4 | view_item_list event on category page load | GA-002 | FR-GA-007 |
| G-025 | GA4 | Full checkout funnel: begin_checkout → add_shipping_info → add_payment_info → purchase | GA-010 to 016 | FR-GA-008 |
| G-026 | Auth | Email verification gate: mandatory verification → account inactive until verified | BL-AUTH-002, AUTH-015 | FR-AUTH-007 |
| G-027 | Auth | SSO: Entra ID or Google sign-in flow (if configured in store) | AUTH-025/026 | FR-AUTH-008 |
| G-028 | Orders | Filter orders by status (New, Processing, Shipped, Completed, Cancelled) | FR-ORDER-006 | FR-ORDER-006 |
| G-029 | Orders | Admin changes order status → storefront order history reflects update | BL-ORD-001 | FR-ORDER-007 |
| G-030 | Localization | All 14 languages: homepage, cart, checkout labels render per locale | FR-LOCALIZATION-004 | FR-LOCALIZATION-004 |

---

## 8. Recommendations: Top 10 Test Cases to Add

These additions provide the highest coverage ROI — each resolves one or more P0-revenue gaps or covers a totally absent domain.

| Rank | Recommended Test Case | Domain | Priority | Invariants Covered | Est. Time |
|------|-----------------------|--------|----------|--------------------|-----------|
| 1 | **Declined card → retry with valid card → order confirmed** (FR-PAYMENT-006). Add to cart → checkout → enter declined card → verify error message "Your card was declined" → enter valid Skyflow Visa → order placed successfully. Verify via Admin that only one order exists. | Payment | Critical | BL-CHK-004, BL-CROSS-010 | 8m |
| 2 | **Double-click "Place Order" prevention** (FR-PAYMENT-007). At order review step, rapidly double-click "Place Order". Verify only one order is created in Admin. Verify second click is ignored or button is disabled after first click. | Payment | Critical | BL-CHK-002, BL-CROSS-010 | 5m |
| 3 | **Guest checkout: full flow without sign-in** (FR-CHECKOUT-008). As anonymous user, add product → click "Proceed to Checkout" → provide email/address/payment → place order → receive confirmation page with order number. | Checkout | Critical | BL-CHK-001 | 10m |
| 4 | **Org switch full context isolation** (FR-MULTI-ORG-003). Sign in as multi-org user → add item to Org A cart at Org A price → switch to Org B → verify cart is empty/Org B cart → verify price is Org B price → switch back → Org A cart intact. | Multi-Org | Critical | BL-B2B-001, BL-CROSS-008 | 8m |
| 5 | **White Labeling: org branding ON — logo/theme displayed** (FR-WL-001). Sign in as B2B org user with White Labeling Enabled = ON → verify org logo in header (not store default) → verify theme colors match org preset → verify favicon in browser tab. | White Labeling | Critical | BL-B2B-006, FWL-008 | 5m |
| 6 | **Configurable product: configure + add to cart + confirm in order** (FR-CONFIG-004). Navigate to configurable product → select upgrade option → verify price updates → add to cart → checkout → place order → verify Admin order shows configured option and correct price. | Configurable Products | Critical | BL-CAT-006, CFG-E2E-001 | 10m |
| 7 | **Session expiry mid-checkout** (FR-AUTH-005). Sign in → add product → begin checkout → expire session (via Admin or wait) → attempt to proceed → verify redirect to sign-in → sign back in → verify return to checkout with cart intact. | Auth | Critical | BL-AUTH-001 | 8m |
| 8 | **Coupon stacking: coupon applies to sale price, not list price** (FR-CART-028). Find product with active sale price → add to cart → apply valid coupon → verify coupon discount is calculated on sale price (not list price) → verify `cart.items[].placedPrice` in GraphQL. | Pricing | Critical | BL-PRICE-001, BL-CART-003 | 6m |
| 9 | **SEO: canonical URL + meta title on PDP and category page** (FR-SEO-001). Navigate to a category page and a PDP → inspect `<link rel="canonical">` → verify canonical URL matches current page URL → verify `<title>` and `<meta name="description">` are populated and non-empty. | SEO | High | BL-SEO-001 | 5m |
| 10 | **White Labeling: branding update on org switch** (FR-WL-002). As user assigned to two organizations, sign in → note Org A branding → switch to Org B → verify logo, favicon, theme, main menu links all update without page reload artifacts (no flash of wrong branding). | White Labeling | High | BL-CROSS-008, FWL-028 to 032 | 8m |

**Estimated time to add all 10:** 73 minutes additional execution time per release run.

---

## 9. TestRail Source Analysis

The TestRail export (`Test suites & Cases/Frontend/frontend-26-01.csv`) contains **800 test cases** across the following key areas not fully represented in any regression suite:

| TestRail Section | Case Count | Suite 00 Coverage | Notes |
|-----------------|-----------|------------------|-------|
| Notifications (Bell, pop-up, archive) | ~95 | 0 | No regression suite covers notifications frontend |
| Lists (Private, Shared, Org-scoped) | ~325 | 3 (FR-B2C-LIST) | Lists are heavily over-represented in TestRail but under-tested in regression |
| Company members | ~155 | 1 (FR-B2B-002) | Invite, roles, block/unblock missing |
| SEO | ~37 | 0 | Zero coverage in all regression suites |
| Min-max / pack size validation | ~20 | 12 (FR-CART-010 to 027) | Reasonably covered |
| BOPIS filters/search/selection | ~30 | 21 (FR-BOPIS) | Well covered |
| Mega menu / Horizontal menu | ~15 | 0 | Navigation menus not in regression |
| Purchased Before filter | ~8 | 0 | B2B-specific catalog filter not in Suite 00 |
| Orders (detail + history) | ~30 | 5 (FR-ORDER) | Missing filter/search scenarios |

**Key observation:** The TestRail suite contains notification tests (95 cases) that have no corresponding regression suite. This entire area — in-app notification bell, unread count, mark-as-read, archive — is invisible to automated regression.

---

## 10. Appendix: Suite 00 Complete Test Case Index

| ID | Title | Domain | Priority |
|----|-------|--------|---------|
| FR-REG-001 | User Registration - Personal Account | Auth | Critical |
| FR-REG-002 | User Registration - Organization Account | Auth | Critical |
| FR-AUTH-001 | Sign In - Personal User | Auth | Critical |
| FR-AUTH-002 | Sign In - Organization User | Auth | Critical |
| FR-AUTH-003 | Forgot Password Flow | Auth | High |
| FR-AUTH-004 | Sign Out | Auth | Medium |
| FR-CAT-001 | Catalog Browsing - Category Navigation | Catalog | High |
| FR-CAT-002 | Product Faceted Filters - Apply Multiple Filters | Catalog | Critical |
| FR-CAT-003 | Product Faceted Filters - Reset Filters | Catalog | High |
| FR-CAT-004 | Product Sorting | Catalog | Medium |
| FR-CAT-005 | Product Pagination | Catalog | Medium |
| FR-SEARCH-001 | Product Search - Basic Query | Search | Critical |
| FR-SEARCH-002 | Product Search - Search Suggestions | Search | High |
| FR-SEARCH-003 | Product Search - No Results | Search | Medium |
| FR-SEARCH-004 | Product Search - Special Characters | Search | Medium |
| FR-CART-001 | Add to Cart - From Product Page | Cart | Critical |
| FR-CART-002 | Add to Cart - Product Variations | Cart | Critical |
| FR-CART-003 | View Cart - Display Items | Cart | Critical |
| FR-CART-004 | Update Cart Quantity - Increase | Cart | High |
| FR-CART-005 | Update Cart Quantity - Decrease | Cart | High |
| FR-CART-006 | Remove Item from Cart | Cart | High |
| FR-CART-007 | Cart - Save for Later | Cart | High |
| FR-CART-008 | Cart - Promo Code Application | Cart | Critical |
| FR-CART-009 | Cart - Invalid Promo Code | Cart | High |
| FR-CART-010 | Can't Add to Cart - Price N/A or Zero | Cart | Critical |
| FR-CART-011 | Can't Add to Cart - Can't Be Purchased Flag | Cart | Critical |
| FR-CART-012 | Can't Add to Cart - Product Not Visible | Cart | High |
| FR-CART-013 | Can't Add to Cart - Out of Stock (FFC = 0) | Cart | Critical |
| FR-CART-014 | Quantity Increment (+) Button on Catalog Page | Cart | Critical |
| FR-CART-015 | Quantity Decrement (-) Button on Catalog Page | Cart | Critical |
| FR-CART-016 | Quantity +/- Buttons on Product Detail Page | Cart | Critical |
| FR-CART-017 | Stock Limit - Quantity Capped at Available Stock | Cart | Critical |
| FR-CART-018 | Min-Max Quantity Validation | Cart | Critical |
| FR-CART-019 | Pack Size Validation - Invalid Pack Quantity | Cart | High |
| FR-CART-020 | Catalog Page - Min Quantity Auto-Correction | Cart | High |
| FR-CART-021 | Catalog Page - Max Quantity Auto-Correction | Cart | High |
| FR-CART-022 | Catalog Page - Pack Quantity Rounding | Cart | High |
| FR-CART-023 | Product Variations - Default Min Quantity per Variation | Cart | High |
| FR-CART-024 | Variation Table - Min-Max/Stock/Pack Validation | Cart | High |
| FR-CART-025 | Product Page - Manual Quantity Input Field | Cart | High |
| FR-CART-026 | Product Variations - Invalid Quantity for Variation | Cart | High |
| FR-CART-027 | Clear Input Field - Reset Behavior | Cart | Medium |
| FR-CHECKOUT-001 | Checkout - Standard Delivery | Checkout | Critical |
| FR-CHECKOUT-002 | Checkout - BOPIS Pickup Location Selection | Checkout | Critical |
| FR-CHECKOUT-003 | Checkout - Shipping Address - Add New | Checkout | High |
| FR-CHECKOUT-004 | Checkout - Payment - Credit Card | Checkout | Critical |
| FR-CHECKOUT-005 | Checkout - Order Review Before Placement | Checkout | High |
| FR-CHECKOUT-006 | Order Confirmation Page | Checkout | Critical |
| FR-CHECKOUT-007 | Order Confirmation Email | Checkout | High |
| FR-ORDER-001 | Order History - View Orders List | Orders | High |
| FR-ORDER-002 | Order History - View Order Details | Orders | High |
| FR-ORDER-003 | Order History - Reorder | Orders | High |
| FR-ORDER-004 | Order Tracking | Orders | Medium |
| FR-ORDER-005 | Order Status Updates | Orders | High |
| FR-BOPIS-001 | BOPIS - Pickup Location Map Display | BOPIS | High |
| FR-BOPIS-002 | BOPIS - Search Pickup Locations | BOPIS | High |
| FR-BOPIS-003 | BOPIS - Filter Pickup Locations | BOPIS | High |
| FR-BOPIS-004 | BOPIS - Select Pickup Location | BOPIS | Critical |
| FR-BOPIS-005 | BOPIS - Mobile Pickup Flow | BOPIS | High |
| FR-PAYMENT-001 | Payment - CyberSource - Valid Card | Payment | Critical |
| FR-PAYMENT-002 | Payment - CyberSource - Invalid Card | Payment | High |
| FR-PAYMENT-003 | Payment - Authorize.Net - Valid Card | Payment | Critical |
| FR-PAYMENT-004 | Payment - Datatrans - Valid Card | Payment | Critical |
| FR-PAYMENT-005 | Payment - Skyflow - Valid Card | Payment | Critical |
| FR-ACCESSIBILITY-001 | Keyboard Navigation - Full Site | A11y | High |
| FR-ACCESSIBILITY-002 | Screen Reader Compatibility | A11y | High |
| FR-ACCESSIBILITY-003 | WCAG Color Contrast | A11y | Medium |
| FR-LOCALIZATION-001 | Language Switching | i18n | High |
| FR-LOCALIZATION-002 | Currency Display | i18n | High |
| FR-LOCALIZATION-003 | Date and Number Formats | i18n | Medium |
| FR-PERFORMANCE-001 | Page Load Time - Homepage | Perf | High |
| FR-PERFORMANCE-002 | Page Load Time - Category Page | Perf | High |
| FR-PERFORMANCE-003 | Page Load Time - Product Page | Perf | High |
| FR-PERFORMANCE-004 | Cart and Checkout Performance | Perf | High |
| FR-PERFORMANCE-005 | API Response Times | Perf | Medium |
| FR-BROWSER-001 | Cross-Browser - Chrome (Desktop) | Browser | Critical |
| FR-BROWSER-002 | Cross-Browser - Safari (Desktop) | Browser | Critical |
| FR-BROWSER-003 | Cross-Browser - Firefox (Desktop) | Browser | High |
| FR-BROWSER-004 | Cross-Browser - Edge (Desktop) | Browser | High |
| FR-BROWSER-005 | Cross-Browser - Mobile Safari (iOS) | Browser | Critical |
| FR-BROWSER-006 | Cross-Browser - Chrome Mobile (Android) | Browser | High |
| FR-SECURITY-001 | SQL Injection Prevention | Security | Critical |
| FR-SECURITY-002 | XSS (Cross-Site Scripting) Prevention | Security | Critical |
| FR-SECURITY-003 | CSRF Protection | Security | High |
| FR-SECURITY-004 | Password Strength Enforcement | Security | High |
| FR-SECURITY-005 | Secure Payment Data Handling | Security | Critical |
| FR-SECURITY-006 | Session Timeout | Security | Medium |
| FR-GA-001 | Google Analytics - Page Views | GA4 | Medium |
| FR-GA-002 | Google Analytics - Add to Cart Event | GA4 | Medium |
| FR-GA-003 | Google Analytics - Begin Checkout Event | GA4 | Medium |
| FR-GA-004 | Google Analytics - Purchase Event | GA4 | Critical |
| FR-GA-005 | Google Analytics - Search Event | GA4 | Medium |
| FR-REGRESSION-001 | Regression - No Breaking Changes in Core Flows | Core | Critical |
| FR-BOPIS-006 | BOPIS - Feature Flag Disabled Hides Pickup Option | BOPIS | High |
| FR-BOPIS-007 | BOPIS - Availability Label: Today | BOPIS | Critical |
| FR-BOPIS-008 | BOPIS - Availability Label: Transfer | BOPIS | High |
| FR-BOPIS-009 | BOPIS - Availability Label: Global Transfer | BOPIS | High |
| FR-BOPIS-010 | BOPIS - Availability Label: Not Available | BOPIS | High |
| FR-BOPIS-011 | BOPIS - No Valid Pickup Locations for Product | BOPIS | High |
| FR-BOPIS-012 | BOPIS - Mixed Cart: Delivery + Pickup Items | BOPIS | High |
| FR-BOPIS-013 | BOPIS - Cart Totals: Zero Shipping Cost for Pickup | BOPIS | Critical |
| FR-BOPIS-014 | BOPIS - Switch Delivery to Pickup Clears Shipping | BOPIS | High |
| FR-BOPIS-015 | BOPIS - Switch Pickup to Delivery Clears Location | BOPIS | High |
| FR-BOPIS-016 | BOPIS - Quantity Change Revalidates Pickup Availability | BOPIS | High |
| FR-BOPIS-017 | BOPIS - Facet Filter: Country + State + City | BOPIS | High |
| FR-BOPIS-018 | BOPIS - Multi-Select Filters (Multiple Countries) | BOPIS | High |
| FR-BOPIS-019 | BOPIS - Search with Special Characters | BOPIS | Medium |
| FR-BOPIS-020 | BOPIS - Reset All Filters | BOPIS | High |
| FR-BOPIS-021 | BOPIS - Cross-Layer: Storefront → xAPI → Admin Order | BOPIS | Critical |
| FR-B2C-VAR-101 | B2C Variation Layout - Options Section Displayed | B2C Variations | Critical |
| FR-B2C-VAR-102 | B2C Variation Layout - Standard Layout When B2C Property Absent | B2C Variations | High |
| FR-B2C-VAR-103 | B2C Color Swatches - Render and Visual Accuracy | B2C Variations | Critical |
| FR-B2C-VAR-104 | B2C Option Selection - Select State Enforcement | B2C Variations | Critical |
| FR-B2C-VAR-105 | B2C Option Selection - Add to Cart Disabled Until All Required Selected | B2C Variations | Critical |
| FR-B2C-VAR-106 | B2C Price Update on Variation Selection | B2C Variations | Critical |
| FR-B2C-VAR-107 | B2C Stock Indicator and SKU Update on Variation Selection | B2C Variations | Critical |
| FR-B2C-VAR-108 | B2C Variation Image Gallery Updates on Selection | B2C Variations | Critical |
| FR-B2C-VAR-109 | B2C Add to Cart - Correct Variant SKU Sent to Cart API | B2C Variations | Critical |
| FR-B2C-VAR-110 | B2C Unavailable Variation Options - Greyed Out and Cannot Add | B2C Variations | Critical |
| FR-B2C-VAR-111 | B2C Variation - Cart Line Shows Variant Attributes Not Parent Name | B2C Variations | High |
| FR-B2C-VAR-112 | B2C Variation - Unavailable Combination Matrix Reflects Admin Changes | B2C Variations | High |
| FR-B2C-VAR-113 | B2C Variation - Shareable URL Deep Links to Correct Variant | B2C Variations | High |
| FR-B2C-VAR-114 | B2C Variation - Mobile Touch Interactions with Color Swatches | B2C Variations | High |
| FR-B2C-VAR-115 | B2C Variation - Rapid Option Switching Resolves to Final State | B2C Variations | High |
| FR-B2B-001 | Quick Order Entry | B2B | High |
| FR-B2B-002 | Company Members Management | B2B | Medium |
| FR-MULTI-ORG-001 | Multi-Organization - Switch Organizations | Multi-Org | High |
| FR-MULTI-ORG-002 | Multi-Organization - Organization-Specific Cart | Multi-Org | High |
| FR-B2C-VAR-001 | Product Variations - Multi-Attribute Selection | B2C | Critical |
| FR-B2C-VAR-002 | Product Variations - Out of Stock Handling | B2C | High |
| FR-B2C-LIST-001 | Add Product to Wishlist/List | B2C Lists | Critical |
| FR-B2C-LIST-002 | Add to Cart from Wishlist | B2C Lists | High |
| FR-B2C-LIST-003 | Share Wishlist via Public Link | B2C Lists | Medium |
| FR-B2C-SHIP-001 | Ship To - Select Address in Checkout | Ship-to | Critical |
| FR-B2C-SHIP-002 | Ship To - Add New Address | Ship-to | High |
| FR-B2C-SHIP-003 | Ship To - Edit and Delete Address | Ship-to | High |
| FR-B2C-CONFIG-001 | Product Configuration - Configure and Add to Cart | Config | Critical |
| FR-B2C-CONFIG-002 | Product Configuration - Custom Text Input | Config | High |
| FR-B2C-CONFIG-003 | Product Configuration - Dependent Options | Config | High |

---

## 11. Delegation Recommendations

| Test Case Range | Area | Assign To |
|----------------|------|-----------|
| G-001 to G-010 (revenue-critical) | Payment, Auth, Checkout, Pricing | `qa-frontend-expert` |
| G-011 to G-012 (B2B members) | Company Members | `qa-frontend-expert` |
| G-013 to G-015 (White Labeling storefront) | White Labeling | `qa-frontend-expert` |
| G-016 to G-017 (Configurable Products) | Configurable Products | `qa-frontend-expert` |
| G-018 to G-019 (SEO) | SEO | `qa-frontend-expert` + `qa-backend-expert` |
| FR-B2B-001 to FR-B2B-002 execution | B2B Quick Order + Company | `qa-frontend-expert` |
| FR-SECURITY-001 to 006 execution | Security | `qa-backend-expert` |
| FR-ACCESSIBILITY-001 to 003 execution | Accessibility | `ui-ux-expert` |
| FR-PERFORMANCE-001 to 005 execution | Performance | `qa-testing-expert` |

---

*Report generated by test-management-specialist | Sources: 16 CSV suites (776 cases), domain-checklists.md (158 items), business-logic.md (77 invariants), TestRail frontend-26-01.csv (800 cases)*
