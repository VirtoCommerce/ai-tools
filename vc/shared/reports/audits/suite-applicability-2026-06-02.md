# Suite Customer Applicability Audit — 2026-06-02

> Auto-classification of all 99 suites in `config/test-suites.json` for customer plugin readiness. Run via `npx tsx scripts/audit-suite-applicability.ts`. Reviewer may override individual classifications by hand-editing `customerApplicability` in the manifest; re-running the script preserves no manual overrides (re-applies rules).

## Summary

| Classification | Count | % |
|----------------|-------|---|
| **universal** — runs as-is on any VC deployment (customer fills @td() data) | 48 | 48.5% |
| **reference** — clone-and-adapt pattern for customer customization | 51 | 51.5% |
| **vcst-specific** — would fail on non-vcst VC deployment; moves to Layer 2 | 0 | 0.0% |
| **Total** | 99 | 100% |

This **replaces the "60–70% universal" estimate** from previous docs (which was a guess). The real measured number is **48.5% universal + 51.5% reference**.

## Layer breakdown

| Layer | Universal | Reference | Vcst-specific | Total |
|-------|-----------|-----------|---------------|-------|
| Frontend | 29 | 18 | 0 | 47 |
| Backend | 19 | 33 | 0 | 52 |

## Universal suites (run as-is on any VC deployment)

These are the suites that the customer plugin can credibly ship as "runs on your VC". Customer fills in @td() data overrides for entities, otherwise no adaptation needed.

| ID | Suite | File | Rationale |
|----|-------|------|-----------|
| 001 | Catalog Navigation | `regression/suites/Frontend/catalog/001-catalog-navigation.csv` | Catalog navigation/PDP/filters — tests platform-level browse mechanics; customer's catalog content routed through @td(). |
| 002 | Product Detail | `regression/suites/Frontend/catalog/002-product-detail.csv` | Catalog navigation/PDP/filters — tests platform-level browse mechanics; customer's catalog content routed through @td(). |
| 003 | Catalog Filters | `regression/suites/Frontend/catalog/003-catalog-filters.csv` | Catalog navigation/PDP/filters — tests platform-level browse mechanics; customer's catalog content routed through @td(). |
| 004 | Search Core | `regression/suites/Frontend/search/004-search-core.csv` | Search core/filters — platform-level search behavior, applies to any VC storefront. |
| 005 | Search Filters & Advanced | `regression/suites/Frontend/search/005-search-filters-advanced.csv` | Search core/filters — platform-level search behavior, applies to any VC storefront. |
| 011 | Checkout Flow | `regression/suites/Frontend/checkout/011-checkout-flow.csv` | Core checkout flow — universal happy-path checkout, assertion data via @td(). |
| 014 | Orders Frontend | `regression/suites/Frontend/orders/014-orders-frontend.csv` | Orders/quotes frontend — universal patterns. Customer's order data via @td(). |
| 015 | Quotes | `regression/suites/Frontend/orders/015-quotes.csv` | Orders/quotes frontend — universal patterns. Customer's order data via @td(). |
| 020 | Platform Users Roles & Settings | `regression/suites/Backend/platform/020-platform-users-roles-settings.csv` | Platform users/roles/dynamic-properties/settings — universal platform features, present in every VC deployment. |
| 021 | Platform Dynamic Properties | `regression/suites/Backend/platform/021-platform-dynamic-properties.csv` | Platform users/roles/dynamic-properties/settings — universal platform features, present in every VC deployment. |
| 028 | Cart Core | `regression/suites/Frontend/cart/028-cart-core.csv` | Cart core/validation/merge — universal cart mechanics; entity data via @td(). |
| 029 | Cart Validation & Persistence | `regression/suites/Frontend/cart/029-cart-validation-persistence.csv` | Cart core/validation/merge — universal cart mechanics; entity data via @td(). |
| 030 | Cart Merge | `regression/suites/Frontend/cart/030-cart-merge.csv` | Cart core/validation/merge — universal cart mechanics; entity data via @td(). |
| 031 | Auth Login & Register | `regression/suites/Frontend/auth/031-auth-login-register.csv` | Auth flow — login, registration, session, RBAC. Universal across VC deployments. |
| 032 | Auth Session & RBAC | `regression/suites/Frontend/auth/032-auth-session-rbac.csv` | Auth flow — login, registration, session, RBAC. Universal across VC deployments. |
| 033 | Auth Company & Account Menu | `regression/suites/Frontend/auth/033-auth-company-account-menu.csv` | Auth flow — login, registration, session, RBAC. Universal across VC deployments. |
| 036 | BOPIS Store Selector | `regression/suites/Frontend/bopis/036-bopis-store-selector.csv` | BOPIS flow — universal pattern. Customer without BOPIS skips via MODULES_ENABLED gate. |
| 037 | BOPIS Cart | `regression/suites/Frontend/bopis/037-bopis-cart.csv` | BOPIS flow — universal pattern. Customer without BOPIS skips via MODULES_ENABLED gate. |
| 038 | BOPIS Checkout | `regression/suites/Frontend/bopis/038-bopis-checkout.csv` | BOPIS flow — universal pattern. Customer without BOPIS skips via MODULES_ENABLED gate. |
| 039 | Payment CyberSource | `regression/suites/Frontend/payment/039-payment-cybersource.csv` | Payment processor integration — universal per-processor pattern. Gated by PAYMENT_PROCESSORS_ENABLED so non-applicable processors skip. |
| 040 | Payment Processors | `regression/suites/Frontend/payment/040-payment-processors.csv` | Payment processor integration — universal per-processor pattern. Gated by PAYMENT_PROCESSORS_ENABLED so non-applicable processors skip. |
| 041 | Payment Cross-Cutting | `regression/suites/Frontend/payment/041-payment-cross-cutting.csv` | Payment processor integration — universal per-processor pattern. Gated by PAYMENT_PROCESSORS_ENABLED so non-applicable processors skip. |
| 042 | Smoke Tests | `regression/suites/Frontend/smoke/042-smoke-tests.csv` | Smoke suite — exercises the universal happy path, asserts shape not vcst-specific values. |
| 043 | Google Analytics | `regression/suites/Frontend/cross-cutting/043-google-analytics.csv` | Cross-cutting concern (smoke / security / a11y / perf / i18n / browser-compat / layout) — tests universal browser-side behavior, not VC-specific business logic. |
| 044 | Security Tests | `regression/suites/Frontend/cross-cutting/044-security-tests.csv` | Cross-cutting concern (smoke / security / a11y / perf / i18n / browser-compat / layout) — tests universal browser-side behavior, not VC-specific business logic. |
| 045 | Accessibility Tests | `regression/suites/Frontend/cross-cutting/045-accessibility-tests.csv` | Cross-cutting concern (smoke / security / a11y / perf / i18n / browser-compat / layout) — tests universal browser-side behavior, not VC-specific business logic. |
| 046 | Localization Tests | `regression/suites/Frontend/cross-cutting/046-localization-tests.csv` | Cross-cutting concern (smoke / security / a11y / perf / i18n / browser-compat / layout) — tests universal browser-side behavior, not VC-specific business logic. |
| 047 | Performance Tests | `regression/suites/Frontend/cross-cutting/047-performance-tests.csv` | Cross-cutting concern (smoke / security / a11y / perf / i18n / browser-compat / layout) — tests universal browser-side behavior, not VC-specific business logic. |
| 048 | Browser Compatibility | `regression/suites/Frontend/cross-cutting/048-browser-compatibility.csv` | Cross-cutting concern (smoke / security / a11y / perf / i18n / browser-compat / layout) — tests universal browser-side behavior, not VC-specific business logic. |
| 048b | Layout Stability | `regression/suites/Frontend/cross-cutting/048b-layout-stability.csv` | Cross-cutting concern (smoke / security / a11y / perf / i18n / browser-compat / layout) — tests universal browser-side behavior, not VC-specific business logic. |
| 049 | Platform API | `regression/suites/Backend/api/049-platform-api.csv` | Platform REST API — universal platform surface. Validates API contracts, not vcst entity values. |
| 050a | GraphQL xCatalog | `regression/suites/Backend/graphql/050a-graphql-xcatalog.csv` | GraphQL xAPI schema coverage — universal platform API surface. Queries verify shape, not vcst-specific values. |
| 050b1 | GraphQL xCart — Basic CRUD & Quantity | `regression/suites/Backend/graphql/050b1-graphql-xcart-basic.csv` | GraphQL xAPI schema coverage — universal platform API surface. Queries verify shape, not vcst-specific values. |
| 050b2 | GraphQL xCart — Item Selection & Coupons | `regression/suites/Backend/graphql/050b2-graphql-xcart-items.csv` | GraphQL xAPI schema coverage — universal platform API surface. Queries verify shape, not vcst-specific values. |
| 050b3 | GraphQL xCart — Shipment, Payment, Merge, Remove | `regression/suites/Backend/graphql/050b3-graphql-xcart-lifecycle.csv` | GraphQL xAPI schema coverage — universal platform API surface. Queries verify shape, not vcst-specific values. |
| 050b4 | GraphQL xCart — Cross-Domain & Schema Coverage | `regression/suites/Backend/graphql/050b4-graphql-xcart-cross-domain.csv` | GraphQL xAPI schema coverage — universal platform API surface. Queries verify shape, not vcst-specific values. |
| 050c | GraphQL xOrder | `regression/suites/Backend/graphql/050c-graphql-xorder.csv` | GraphQL xAPI schema coverage — universal platform API surface. Queries verify shape, not vcst-specific values. |
| 050d | GraphQL xProfile | `regression/suites/Backend/graphql/050d-graphql-xprofile.csv` | GraphQL xAPI schema coverage — universal platform API surface. Queries verify shape, not vcst-specific values. |
| 050e | GraphQL xFrontend (pageContext) | `regression/suites/Backend/graphql/050e-graphql-xfrontend.csv` | GraphQL xAPI schema coverage — universal platform API surface. Queries verify shape, not vcst-specific values. |
| 050f | GraphQL xCMS | `regression/suites/Backend/graphql/050f-graphql-xcms.csv` | GraphQL xAPI schema coverage — universal platform API surface. Queries verify shape, not vcst-specific values. |
| 050g | GraphQL Cross-Cutting | `regression/suites/Backend/graphql/050g-graphql-crosscutting.csv` | GraphQL xAPI schema coverage — universal platform API surface. Queries verify shape, not vcst-specific values. |
| 050h | GraphQL Wishlist | `regression/suites/Backend/graphql/050h-graphql-wishlist.csv` | GraphQL xAPI schema coverage — universal platform API surface. Queries verify shape, not vcst-specific values. |
| 050i | GraphQL Configurable Products | `regression/suites/Backend/graphql/050i-graphql-configurations.csv` | GraphQL xAPI schema coverage — universal platform API surface. Queries verify shape, not vcst-specific values. |
| 050j | GraphQL xMarketing (promotionCoupons) | `regression/suites/Backend/graphql/050j-graphql-xmarketing.csv` | GraphQL xAPI schema coverage — universal platform API surface. Queries verify shape, not vcst-specific values. |
| 050k | GraphQL xPickup | `regression/suites/Backend/graphql/050k-graphql-xpickup.csv` | GraphQL xAPI schema coverage — universal platform API surface. Queries verify shape, not vcst-specific values. |
| 063 | Core Settings | `regression/suites/Backend/platform/063-core-settings.csv` | Platform users/roles/dynamic-properties/settings — universal platform features, present in every VC deployment. |
| 078 | Backend Smoke Tests | `regression/suites/Backend/smoke/078-backend-smoke-tests.csv` | Smoke suite — exercises the universal happy path, asserts shape not vcst-specific values. |
| 082 | Auth Impersonation / Login on Behalf | `regression/suites/Frontend/auth/082-auth-impersonation.csv` | Auth flow — login, registration, session, RBAC. Universal across VC deployments. |

## Reference suites (clone-and-adapt patterns)

Customers will clone these into `regression/suites/customer/` and adapt for their specific customizations. The original suite remains in the plugin as a reference pattern.

| ID | Suite | File | Rationale |
|----|-------|------|-----------|
| 006 | B2C Organization | `regression/suites/Frontend/b2c/006-b2c-organization.csv` | B2B org / list / member / variations features — customer applies if storefrontProfile matches, but specific tests assume vcst data shape. Clone-and-adapt for customer's exact org/members/lists workflow. |
| 007 | B2C Lists & Shared | `regression/suites/Frontend/b2c/007-b2c-lists-shared.csv` | B2B org / list / member / variations features — customer applies if storefrontProfile matches, but specific tests assume vcst data shape. Clone-and-adapt for customer's exact org/members/lists workflow. |
| 008 | B2C Members | `regression/suites/Frontend/b2c/008-b2c-members.csv` | B2B org / list / member / variations features — customer applies if storefrontProfile matches, but specific tests assume vcst data shape. Clone-and-adapt for customer's exact org/members/lists workflow. |
| 009 | B2C Variations & Configs | `regression/suites/Frontend/b2c/009-b2c-variations-configs.csv` | B2B org / list / member / variations features — customer applies if storefrontProfile matches, but specific tests assume vcst data shape. Clone-and-adapt for customer's exact org/members/lists workflow. |
| 010 | B2C Bulk Ship Dashboard | `regression/suites/Frontend/b2c/010-b2c-bulk-ship-dashboard.csv` | B2B org / list / member / variations features — customer applies if storefrontProfile matches, but specific tests assume vcst data shape. Clone-and-adapt for customer's exact org/members/lists workflow. |
| 012 | Checkout Guest | `regression/suites/Frontend/checkout/012-checkout-guest.csv` | Checkout variant (guest / B2B / address-popup) — universal pattern but assertion details vary by storefront customization. Clone-and-adapt for customer's flow. |
| 013 | Checkout B2B | `regression/suites/Frontend/checkout/013-checkout-b2b.csv` | Checkout variant (guest / B2B / address-popup) — universal pattern but assertion details vary by storefront customization. Clone-and-adapt for customer's flow. |
| 017 | Orders Admin Management | `regression/suites/Backend/orders/017-orders-admin-management.csv` | Backend module admin (orders) — universal pattern but tests customer-specific entities, role names, and module configurations. Customer adapts to their module setup. |
| 018 | Orders Admin Payments | `regression/suites/Backend/orders/018-orders-admin-payments.csv` | Backend module admin (orders) — universal pattern but tests customer-specific entities, role names, and module configurations. Customer adapts to their module setup. |
| 019 | Orders Admin Shipments | `regression/suites/Backend/orders/019-orders-admin-shipments.csv` | Backend module admin (orders) — universal pattern but tests customer-specific entities, role names, and module configurations. Customer adapts to their module setup. |
| 023 | Marketing Promotions | `regression/suites/Backend/marketing/023-marketing-promotions.csv` | Backend module admin (marketing) — universal pattern but tests customer-specific entities, role names, and module configurations. Customer adapts to their module setup. |
| 024 | Marketing Content | `regression/suites/Backend/marketing/024-marketing-content.csv` | Backend module admin (marketing) — universal pattern but tests customer-specific entities, role names, and module configurations. Customer adapts to their module setup. |
| 025 | Marketing Coupons & API | `regression/suites/Backend/marketing/025-marketing-coupons-api.csv` | Backend module admin (marketing) — universal pattern but tests customer-specific entities, role names, and module configurations. Customer adapts to their module setup. |
| 026 | Customer Contacts | `regression/suites/Backend/customer/026-customer-contacts.csv` | Backend module admin (customer) — universal pattern but tests customer-specific entities, role names, and module configurations. Customer adapts to their module setup. |
| 027 | Customer Orgs & Invites | `regression/suites/Backend/customer/027-customer-orgs-invites.csv` | Backend module admin (customer) — universal pattern but tests customer-specific entities, role names, and module configurations. Customer adapts to their module setup. |
| 034 | Store Management | `regression/suites/Backend/store/034-store-management.csv` | Backend module admin (store) — universal pattern but tests customer-specific entities, role names, and module configurations. Customer adapts to their module setup. |
| 035 | Store Rounding & Email | `regression/suites/Backend/store/035-store-rounding-email.csv` | Backend module admin (store) — universal pattern but tests customer-specific entities, role names, and module configurations. Customer adapts to their module setup. |
| 051 | Catalog Admin Products | `regression/suites/Backend/catalog/051-catalog-admin-products.csv` | Backend module admin (catalog) — universal pattern but tests customer-specific entities, role names, and module configurations. Customer adapts to their module setup. |
| 052 | Configurable Products Admin | `regression/suites/Backend/configurable-products/052-configurable-products-admin.csv` | Backend module admin (catalog) — universal pattern but tests customer-specific entities, role names, and module configurations. Customer adapts to their module setup. |
| 053 | Catalog Admin Categories | `regression/suites/Backend/catalog/053-catalog-admin-categories.csv` | Backend module admin (catalog) — universal pattern but tests customer-specific entities, role names, and module configurations. Customer adapts to their module setup. |
| 054 | Pricing Logic | `regression/suites/Backend/pricing/054-pricing-logic.csv` | Backend module admin (pricing) — universal pattern but tests customer-specific entities, role names, and module configurations. Customer adapts to their module setup. |
| 055 | Pricing Management | `regression/suites/Backend/pricing/055-pricing-management.csv` | Backend module admin (pricing) — universal pattern but tests customer-specific entities, role names, and module configurations. Customer adapts to their module setup. |
| 056 | Inventory | `regression/suites/Backend/inventory/056-inventory.csv` | Backend module admin (inventory) — universal pattern but tests customer-specific entities, role names, and module configurations. Customer adapts to their module setup. |
| 057 | Notifications Templates | `regression/suites/Backend/notifications/057-notifications-templates.csv` | Backend module admin (notifications) — universal pattern but tests customer-specific entities, role names, and module configurations. Customer adapts to their module setup. |
| 058 | Notifications Triggers | `regression/suites/Backend/notifications/058-notifications-triggers.csv` | Backend module admin (notifications) — universal pattern but tests customer-specific entities, role names, and module configurations. Customer adapts to their module setup. |
| 059 | CMS Page Management | `regression/suites/Backend/cms/059-cms-page-management.csv` | Backend module admin (cms) — universal pattern but tests customer-specific entities, role names, and module configurations. Customer adapts to their module setup. |
| 060 | CMS Design & Content | `regression/suites/Backend/cms/060-cms-design-content.csv` | Backend module admin (cms) — universal pattern but tests customer-specific entities, role names, and module configurations. Customer adapts to their module setup. |
| 061 | Search Indexing Admin | `regression/suites/Backend/search/061-search-indexing-admin.csv` | Backend module admin (search) — universal pattern but tests customer-specific entities, role names, and module configurations. Customer adapts to their module setup. |
| 062 | Assets | `regression/suites/Backend/assets/062-assets.csv` | Backend module admin (assets) — universal pattern but tests customer-specific entities, role names, and module configurations. Customer adapts to their module setup. |
| 064 | CSV Import Export | `regression/suites/Backend/import-export/064-csv-import-export.csv` | Backend module admin (import-export) — universal pattern but tests customer-specific entities, role names, and module configurations. Customer adapts to their module setup. |
| 065 | Shipping | `regression/suites/Backend/shipping/065-shipping.csv` | Backend module admin (shipping) — universal pattern but tests customer-specific entities, role names, and module configurations. Customer adapts to their module setup. |
| 066 | SEO | `regression/suites/Backend/seo/066-seo.csv` | Backend module admin (seo) — universal pattern but tests customer-specific entities, role names, and module configurations. Customer adapts to their module setup. |
| 067 | Whitelabeling Admin | `regression/suites/Backend/whitelabeling/067-whitelabeling-admin.csv` | Backend module admin (whitelabeling) — universal pattern but tests customer-specific entities, role names, and module configurations. Customer adapts to their module setup. |
| 068 | Push Messages | `regression/suites/Backend/push-messages/068-push-messages.csv` | Backend module admin (push-messages) — universal pattern but tests customer-specific entities, role names, and module configurations. Customer adapts to their module setup. |
| 069 | Image Tools | `regression/suites/Backend/image-tools/069-image-tools.csv` | Backend module admin (image-tools) — universal pattern but tests customer-specific entities, role names, and module configurations. Customer adapts to their module setup. |
| 070 | Whitelabeling Storefront | `regression/suites/Frontend/whitelabeling/070-whitelabeling-storefront.csv` | Whitelabeling storefront — pattern is universal but assertions tie to vcst's Coffee theme. Customer clones for their branded theme. |
| 071 | Whitelabeling Branding | `regression/suites/Frontend/whitelabeling/071-whitelabeling-branding.csv` | Whitelabeling storefront — pattern is universal but assertions tie to vcst's Coffee theme. Customer clones for their branded theme. |
| 072 | Configurable Products UI | `regression/suites/Frontend/configurable-products/072-configurable-products-ui.csv` | Configurable-products flow — universal mechanics but tests assume vcst's specific CFG products (CFG_LAPTOP, CFG_RING, etc.). Customer either has matching CFG products or clones the pattern for theirs. |
| 072b | Configurable Products E2E | `regression/suites/Frontend/configurable-products/072b-configurable-products-e2e.csv` | Configurable-products flow — universal mechanics but tests assume vcst's specific CFG products (CFG_LAPTOP, CFG_RING, etc.). Customer either has matching CFG products or clones the pattern for theirs. |
| 072c | Configurable Products Cross-Cutting | `regression/suites/Frontend/configurable-products/072c-configurable-products-cross.csv` | Configurable-products flow — universal mechanics but tests assume vcst's specific CFG products (CFG_LAPTOP, CFG_RING, etc.). Customer either has matching CFG products or clones the pattern for theirs. |
| 072d | Configurable Products File & Text Sections | `regression/suites/Frontend/configurable-products/072b-file-text-section-cases.csv` | Configurable-products flow — universal mechanics but tests assume vcst's specific CFG products (CFG_LAPTOP, CFG_RING, etc.). Customer either has matching CFG products or clones the pattern for theirs. |
| 073 | Returns | `regression/suites/Backend/returns/073-returns.csv` | Backend module admin (returns) — universal pattern but tests customer-specific entities, role names, and module configurations. Customer adapts to their module setup. |
| 074 | Contracts | `regression/suites/Backend/contracts/074-contracts.csv` | Backend module admin (contracts) — universal pattern but tests customer-specific entities, role names, and module configurations. Customer adapts to their module setup. |
| 075 | Loyalty | `regression/suites/Backend/loyalty/075-loyalty.csv` | Backend module admin (loyalty) — universal pattern but tests customer-specific entities, role names, and module configurations. Customer adapts to their module setup. |
| 076 | Channels | `regression/suites/Backend/channels/076-channels.csv` | Backend module admin (channels) — universal pattern but tests customer-specific entities, role names, and module configurations. Customer adapts to their module setup. |
| 077 | Coupons & Promotions Storefront | `regression/suites/Frontend/marketing/077-coupons-promotions-storefront.csv` | Coupon redemption pattern — universal mechanics, but specific coupon codes/promotions are vcst's. Customer adapts to their promotion catalog. |
| 077b | Coupons & Promotions — Cart Sidebar (VCST-4896) | `regression/suites/Frontend/marketing/077-smoke-cart-sidebar.csv` | Coupon redemption pattern — universal mechanics, but specific coupon codes/promotions are vcst's. Customer adapts to their promotion catalog. |
| 079 | xMarketing Admin & REST | `regression/suites/Backend/xmarketing/079-xmarketing.csv` | Backend module admin (marketing) — universal pattern but tests customer-specific entities, role names, and module configurations. Customer adapts to their module setup. |
| 080 | Full Regression Release | `regression/suites/_release/080-full-regression-release.csv` | Default classification — review manually. |
| 081 | Select Shipping Address Popup | `regression/suites/Frontend/checkout/081-select-shipping-address-popup.csv` | Checkout variant (guest / B2B / address-popup) — universal pattern but assertion details vary by storefront customization. Clone-and-adapt for customer's flow. |
| 083 | Loyalty Catalog Browsing | `regression/suites/Frontend/loyalty/083-loyalty-catalog.csv` | Loyalty catalog — customer's loyalty program structure may differ. Clone-and-adapt. |

## Vcst-specific suites

(none — the auto-classifier didn't find any suites that meet the "vcst-specific" bar. This is a strong signal that the @td() resolver discipline already pushed vcst-specifics into the test-data layer. Layer 2 in the product audit plan still contains vcst's actual test data + reports + sprint plans, but the SUITE DEFINITIONS themselves are all customer-usable as either universal or reference.)


## Verification

Auto-classification is a starting point. Human reviewer (you) should spot-check:

1. **Sample 5 universal suites** — actually open the CSV, scan for any vcst-specific assertion that the rule missed.
2. **Sample 5 reference suites** — confirm the "would need adaptation" framing matches what's actually in the file.
3. **Re-classify by hand** where the auto rule is wrong, by editing `customerApplicability` directly in `config/test-suites.json`. Re-running the script will OVERWRITE manual changes — so commit manual overrides + comment out the auto-tagger for that suite in a follow-up.

## Next steps in the product audit plan

- **Workstream #6 (repo split)**: now that we have per-suite tags, the Layer 1 / Layer 2 split has data to drive it.
  - Layer 1 ships: **99 suites** (48 universal + 51 reference)
  - Layer 2 keeps: **0 suites** + test-data + reports + sprint plans
- **Workstream #4 (live smoke on non-vcst VC)**: target the 48 universal suites — expect ≥ 80% pass; failures here mean the auto-classifier was too optimistic.
