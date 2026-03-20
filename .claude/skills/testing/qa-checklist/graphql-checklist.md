# GraphQL Queries & Mutations — Test Case Writing Checklist

> Domain checklist #23 for `test-management-specialist` agent and `/qa-checklist` skill. Covers xAPI GraphQL endpoint testing across all modules: xCatalog, xCart, xOrder, xProfile, xCMS, xFrontend, xQuote, xPushMessages, xMarketing.

**46 items | Related suites: 15 (GraphQL xAPI), 41 (Coupons & Promotions) | E2E Catalog: E2E-GQL**

**Scope:** `POST {BACK_URL}/graphql` — all xAPI domains. Requires `Authorization: Bearer {token}` for protected operations. Store context: `storeId`, `cultureName`, `currencyCode` on most queries.

---

## xCatalog — Products, Categories & Inventory

- [ ] Product search: `products` query returns `totalCount`, `items[]` with id/name/code/price/images; keyword, facet, and filter parameters narrow results correctly
- [ ] Product detail: `product(id)` returns full entity — descriptions, properties, variations with per-variant pricing, availability, and images
- [ ] Categories: `categories` returns hierarchy with `childCategories[]`, slugs are URL-safe, `totalCount` matches `items[]` length
- [ ] Inventory & fulfillment centers: `products.availabilityData.inventories` returns per-fulfillment-center stock (`fulfillmentCenterId`, `fulfillmentCenterName`, `inStockQuantity`); `fulfillmentCenters` query lists active locations

## xCart — Cart Lifecycle & Checkout

- [ ] Cart CRUD: `addItem` → `changeCartItemQuantity` → `removeItem` → `clearCart` — each mutation returns updated cart state with `errors[]` present and empty on success
- [ ] Item selection (partial checkout): `selectCartItems` / `unselectCartItems` / `selectAllCartItems` / `unselectAllCartItems` — selected items included in checkout totals, unselected excluded
- [ ] Checkout setup: `addOrUpdateCartShipment` (address + method) → `addOrUpdateCartPayment` → cart `isValid` = true with no `validationErrors`
- [ ] Cart address: `addCartAddress` mutation saves address fields; address type (shipping/billing) correct; field-level validation on countryCode, postalCode, phone
- [ ] Coupon: `addCoupon` with valid code → `isAppliedSuccessfully` = true, `discountTotal > 0`; invalid code → structured error or `isAppliedSuccessfully` = false (not HTTP 500); `removeCoupon` clears discount; `validateCoupon` query validates without applying
- [ ] Cart merge: `mergeCart` combines anonymous cart into authenticated user cart after login — items, quantities, and coupons transferred; no duplicates or lost items
- [ ] Cart comments: `changeComment` (cart-level) and `changeCartItemComment` (line-item-level) — text saved, retrievable on cart query, empty string clears comment
- [ ] Dynamic properties: `updateCartDynamicProperties` / `updateCartItemDynamicProperties` / `updateCartShipmentDynamicProperties` / `updateCartPaymentDynamicProperties` — custom properties saved and returned on subsequent queries
- [ ] Multi-cart: `carts` query returns list of user carts; each cart isolated by type/name

## xCart — Configurable Products

- [ ] Product configuration: `productConfiguration` query returns available sections and options; `configurationItems` returns current configuration state
- [ ] Configured line items: `createConfiguredLineItem` creates item with selected options → `changeCartConfiguredItem` updates configuration — cart price reflects configured total

## xCart — Wishlists & Saved for Later

- [ ] Wishlists: `wishlist(listName)` / `wishlists` queries return items with product details; `addWishListBulkItem` adds multiple products in one call
- [ ] Saved for later: `moveToSavedForLater` removes item from active cart → appears in `getSavedForLater` query; `moveFromSavedForLater` restores item to cart with current price

## xOrder

- [ ] Order list & detail: `orders` query supports filter/sort/pagination; single order query returns line items, addresses, payment, shipping, and totals that match Admin
- [ ] Order creation: `createOrderFromCart` returns order id/number/status; cart invalidated after order (mutations on converted cart fail gracefully); duplicate call is idempotent (no second order created)

## xProfile — User, Organization & Registration

- [ ] Current user: `me` query returns id, userName, email, contact, organizationId; `organization(id)` returns name and members list
- [ ] Registration: `requestRegistration` with organization → company + contact + account created (Organization maintainer role assigned); without organization → personal customer created; `result.succeeded` = true
- [ ] Invitation registration: `registerByInvitation` with valid token → account created, `succeeded` = true; expired/invalid token → `succeeded` = false with error code/description
- [ ] Profile update: `updateContact` mutation modifies firstName, lastName, fullName, addresses; changes reflected in `me` query and Admin contact blade
- [ ] Role management: `changeOrganizationContactRole` assigns new roleIds to org contact; role change reflected immediately in member permissions
- [ ] Account security: `lockOrganizationContact` blocks sign-in; `unlockOrganizationContact` restores access; `changePassword` requires old password, enforces store password policy; `sendVerifyEmail` sends verification link
- [ ] Member addresses: `deleteMemberAddresses` removes addresses by ID; deleted address no longer returned in contact query; cannot delete last address if policy requires minimum one

## xQuote — B2B Quotes & RFQ

- [ ] Quote lifecycle: `createQuoteFromCart` converts cart items to quote line items with optional comment; `declineQuoteRequest` sets status "Declined" with reason; `approveQuoteRequest` approves for conversion to order
- [ ] Quote queries: quote detail returns line items, prices, status, comments, attachments; quote list supports filter by status and pagination

## xCMS & xFrontend

- [ ] CMS pages: `pages` query returns page content with relativeUrl; no unescaped HTML/script injection in content
- [ ] pageContext: single aggregated query resolves `slugInfo`, `store`, `whiteLabelingSettings`, `user` — response time < 400ms; invalid `organizationId` returns null fields (not error)

## xMarketing — Promotion Coupons

> Query: `promotionCoupons` — VCST-4590 (PR #14, `vc-module-marketing-experience-api`). Returns active, public, store-scoped promotions that have at least one coupon code. Requires authentication; authorization gated by admin role or matching `user.StoreId`. New type: `PromotionCouponType`. `couponCode` is batch-loaded via DataLoader.

### Schema & Introspection

- [ ] Introspection confirms `promotionCoupons` field on root `Query` type: accepts `storeId: String!`, `userId: String`, `currencyCode: String`, `cultureName: String`, `first: Int`, `after: String` (and/or `skip`/`take`); returns a connection type with `totalCount: Int` and `items: [PromotionCouponType]`
- [ ] Introspection confirms `PromotionCouponType` exposes exactly: `id: String`, `endDate: DateTime` (nullable), `systemName: String`, `label: String`, `name: String`, `description: String`, `couponCode: String`; all field names are camelCase

### Happy Path — Authenticated Requests

- [ ] Minimal required args: `promotionCoupons(storeId: "{{STORE_ID}}", first: 20, after: "0")` with valid bearer token — returns HTTP 200, `errors[]` empty, `totalCount >= 0`, `items[]` contains only active + public promotions with `couponCode` non-null; all returned `endDate` values (when not null) are ISO 8601
- [ ] Full field selection: requesting all seven fields (`id`, `endDate`, `systemName`, `label`, `name`, `description`, `couponCode`) returns a complete response with no null on non-nullable fields; `id` is a valid UUID; `endDate` null is acceptable for open-ended promotions
- [ ] Minimal field selection: requesting only `{ items { id } }` returns without error — partial selection sets work; unrequested fields are not leaked in response
- [ ] `couponCode` batch-loading (DataLoader): querying a page of N promotions results in exactly one `CouponSearchService` call (not N individual calls); response returns one `couponCode` per promotion (the first coupon code found for each promotion)
- [ ] Filter correctness: all returned promotions satisfy `OnlyActive = true` AND `IsPublic = true` AND `Store = storeId` AND `CouponCount >= 1`; deactivated promotions, private promotions, or promotions with no coupons must not appear

### Localization

- [ ] `cultureName: "en-US"` returns English `name`, `label`, `description` values when en-US translations exist; `cultureName: "de-DE"` returns German values when translations exist
- [ ] Missing locale fallback: when a promotion has no translation for the requested `cultureName`, `name` falls back to the promotion's system `Name`; `label` and `description` return null (not an empty string or error)
- [ ] `cultureName` omitted: `label`, `name`, `description` all return null (no default locale applied) — handler reads locale from argument only; `systemName` (the raw `Promotion.Name`) is always returned regardless of `cultureName`

### Pagination

- [ ] `first` + `after` cursor pagination: `first: 5, after: "0"` returns at most 5 items; `totalCount` reflects the full matching set, not just the page; advancing `after` cursor returns the next page without duplicates or gaps
- [ ] `first: 0`: returns empty `items[]`, `totalCount` reflects the full matching count (count-only query is valid)
- [ ] `first` omitted / default page size: query succeeds with a reasonable default take; response is not empty when matching promotions exist
- [ ] `totalCount` consistency: `totalCount` matches the true number of active + public + store-scoped couponed promotions; matches the count visible in Admin marketing promotions list for that store filtered to same criteria

### Authorization — Store-Scoped Access Control

- [ ] Anonymous request (no `Authorization` header): returns `errors[]` with an `UNAUTHORIZED` code or message; HTTP status remains 200 (GraphQL spec); response body contains no promotion data; no stack trace or internal path is leaked
- [ ] Authenticated user whose `user.StoreId` matches `storeId` argument: authorization succeeds, promotions returned; this is the normal storefront buyer scenario
- [ ] Authenticated user whose `user.StoreId` does NOT match `storeId` argument and user is not an admin: `errors[]` contains `FORBIDDEN`-class error; no promotion data returned; HTTP 200
- [ ] Authenticated platform Administrator (system admin role): authorization succeeds for ANY `storeId` regardless of the admin's own `StoreId`; promotions for the specified store are returned
- [ ] Non-admin user with `user.StoreId = null` (user never assigned to a store): authorization fails; `errors[]` contains a forbidden/unauthorized error; no data leaked
- [ ] `storeId` for a store that exists but has no active public couponed promotions: authorization passes (if user matches that store), `items[]` is empty, `totalCount = 0`, `errors[]` empty
- [ ] `storeId` for a non-existent store: authorization check based on string comparison only; if user `StoreId` matches the non-existent string, query returns `items: [], totalCount: 0` (no promotion data); if user `StoreId` does not match, FORBIDDEN error

### Input Validation & Error Handling

- [ ] `storeId` omitted (required field): GraphQL validation returns `errors[]` naming the missing required argument before execution; HTTP 200; no 500
- [ ] `storeId: ""` (empty string): request reaches handler; store-scoped filter with empty storeId returns empty results (no promotions) OR a validation error — either outcome must NOT be a 500; `errors[]` populated appropriately
- [ ] `first: -1` or `after: "invalid_cursor"`: handler returns a validation error in `errors[]` or empty results; no unhandled exception; no 500
- [ ] Unknown field in selection set (e.g., `{ items { nonExistentField } }`): GraphQL returns `errors[]` with location info for the unknown field; no 500; no partial data for valid fields is silently dropped
- [ ] Malformed query syntax: GraphQL parser returns `errors[]` with parse error + location; HTTP 200; no internal error details exposed
- [ ] Extremely large `first` value (e.g., `first: 10000`): query completes without timeout; result capped at actual matching count; no memory/performance crash; response time < 2s

### Cross-Layer Verification

- [ ] Admin → GraphQL round-trip: deactivate a promotion in Admin marketing module → re-query `promotionCoupons` → deactivated promotion no longer appears in `items[]`; `totalCount` decrements accordingly
- [ ] Admin → GraphQL round-trip: mark a promotion as non-public in Admin → re-query → that promotion excluded from results even if `OnlyActive = true`
- [ ] Admin → GraphQL round-trip: remove all coupon codes from a promotion in Admin (`CouponCount = 0`) → re-query → that promotion excluded from `items[]` (handler filters `CouponCount: 1`)
- [ ] Storefront → API consistency: coupon codes displayed on the `/account/coupons` storefront page match the `couponCode` values returned by `promotionCoupons` GraphQL query for the same `storeId`; no stale-cache discrepancy
- [ ] API → Storefront → Cart E2E: `couponCode` value from `promotionCoupons` response can be applied via `addCoupon` mutation and yields a non-zero `discountTotal` on the cart

### Security

- [ ] Response fields contain no internal infrastructure paths, server file paths, stack traces, or SQL fragments regardless of input
- [ ] `userId` parameter is accepted but currently unused by the handler — passing another user's ID does not cause data from that user's context to be returned; the authorization is always based on the token's own identity
- [ ] Concurrent requests from two users in different stores return only their respective store's promotions; no cross-store data bleed

## Cross-Cutting

- [ ] Error handling: malformed query syntax, unknown fields, missing required args — all return `errors[]` with message/locations/path (HTTP 200, not 500); no stack traces or internal paths leaked
- [ ] Authentication & authorization: public queries (products, categories) succeed without token; protected operations (orders, cart mutations, profile) return `UNAUTHORIZED` error without token; role-restricted mutations return `FORBIDDEN` for insufficient role; error messages leak no sensitive data
- [ ] Performance & consistency: product search < 500ms, nested queries < 1s, no N+1 degradation on repeated calls; live price changes reflected in cart (not stale cache); currency switch updates all monetary fields atomically

---

## New Query/Mutation Verification

> Per-change checklist — apply for every new or modified GraphQL query/mutation before closing the ticket.

- [ ] Verify GraphQL schema: new type/field appears in introspection (`__schema`), field names follow camelCase convention, nullable/non-nullable modifiers correct, deprecations annotated with `@deprecated(reason:)`
- [ ] Request data with required fields only: query/mutation with all required arguments returns expected data, no `errors[]`
- [ ] Request data without required fields: omitting each required argument returns a clear validation error in `errors[]` (not HTTP 500), error message names the missing field
- [ ] Request all available data: query with every field in the selection set returns complete response, no null on non-nullable fields, nested objects fully populated
- [ ] Request a single field and multiple fields: minimal selection set (one field) works; broad selection set (all fields) works; partial selection sets return only requested fields
- [ ] Validate response structure and data integrity: field types match schema (String, Int, Float, Boolean, enum values); IDs are valid references; amounts/totals are mathematically consistent; dates are ISO 8601; arrays respect `first`/`after` pagination
- [ ] Check permissions: anonymous user (no token) — public queries succeed, protected operations return `UNAUTHORIZED`; authenticated user without role — role-restricted mutations return `FORBIDDEN`; user with correct role — operation succeeds
- [ ] Generate test cases: derive concrete test cases from the above checks covering happy path, validation errors, boundary values (empty arrays, max pagination, zero amounts), and cross-layer verification (API → storefront → Admin)
