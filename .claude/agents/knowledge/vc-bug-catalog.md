# VC Bug Catalog — Where Virto Commerce Historically Breaks

Curated reference of failure modes seen in this Virto Commerce deployment. Use as a **"Familiar Problems"** oracle (HICCUPPS-F) and to seed Bad Neighborhood Tours (`adversarial-heuristics.md`). When exploring a domain, scan this file for the relevant section first — known soft spots reveal themselves faster than fresh exploration.

This file is the **index of VC-specific historical patterns**. Generic e-commerce patterns live in [`e-commerce-edge-cases-library.md`](e-commerce-edge-cases-library.md). Testable invariants live in [`business-logic.md`](business-logic.md). Project-specific lessons in chronological form live in `~/.claude/projects/.../memory/MEMORY.md`.

### How to use

1. Identify the target domain (Cart, Catalog, Promotions, etc.)
2. Scan the relevant section below
3. For each entry, read the "Detection probe" — that's the test idea you want to run during your session
4. Cross-reference the BL/ECL/MEMORY link for full context

### How to maintain

- Add a new entry when a production or QA bug reveals a pattern likely to recur
- Each entry: pattern → past incident → detection probe → cross-ref
- When a pattern is fixed for good (verified across 3+ sprints), move it to an archive section at the bottom
- Keep entries terse; full incident reports live elsewhere

---

## VC-CART — Cart & Apollo State

### VC-CART-001 — Apollo cache stale after `addItem`
- **Pattern:** `data.addItem.items[]` returns empty due to async cart-projection settle; UI may show stale cart count
- **Detection probe:** Add an item; immediately read `cart()` query response and Apollo cache. Items should appear within 1–2 follow-up reads.
- **Cross-ref:** `reference_additem_async_settle` in MEMORY; canonical capture pattern is via follow-up mutation response, NOT addItem response itself

### VC-CART-002 — B2B line-item consolidation
- **Pattern:** B2B store consolidates same `productId` added twice into ONE line item with summed quantity (consumer store would create two)
- **Detection probe:** Add product X with qty 2. Add product X again with qty 3. Verify cart shows ONE line item with qty 5 (NOT two lines).
- **Cross-ref:** `reference_b2b_lineitem_consolidation` in MEMORY. Use `subTotal` arithmetic for multi-add assertions, NOT `itemsCount`.

### VC-CART-003 — ApolloError on cart shipment is stale legacy-cart data
- **Pattern:** `addOrUpdateCartShipment` returns ApolloError on `/cart` for users with a legacy-cart record; this is data-state, not a code bug
- **Detection probe:** Reproduce with `removeCart` + fresh-cart reload before filing. If the error vanishes on a fresh cart, the legacy cart is the cause.
- **Cross-ref:** `feedback_apollo_cart_shipment_stale_data` in MEMORY

### VC-CART-004 — xAPI `addItem` silent no-op on disabled inventory
- **Pattern:** Adding a product whose `InventoryStatus = Disabled` returns success with `itemsCount = 0`; no error
- **Detection probe:** Check `/api/inventory/products/{id}` before debugging cart-layer issues. If status is Disabled/Ignored, the cart layer is fine — inventory is the cause.
- **Cross-ref:** `feedback_xapi_additem_silent_disabled` in MEMORY; `reference_inventory_admin_api`

### VC-CART-005 — Cart total drift across rapid edits
- **Pattern:** Multiple quick adds/removes can leave the visible total out of sync with the server total for 1–2 seconds during async settle
- **Detection probe:** Add 5 items in rapid succession; verify `subTotal` after a 2-second wait equals server-recomputed total. Use Obsessive-Compulsive Tour.
- **Cross-ref:** ECL §1.3 stale-cart-total

### VC-CART-006 — Quantity stepper as Add-to-Cart on B2B store
- **Pattern:** B2B-store PDP has NO "Add to Cart" button (per feature flag); the qty stepper (+) IS the add-to-cart entry point — for both guests and authenticated users
- **Detection probe:** On B2B-store PDP, verify (+) on the stepper triggers add to cart. Guest carts work and merge on sign-in.
- **Cross-ref:** `feedback_qty_stepper_as_add_to_cart` in MEMORY

---

## VC-CAT — Catalog & Virtual Catalog

### VC-CAT-001 — Virtual catalog root ID drifts after migrations / restores
- **Pattern:** Storefront-facing products live in a B2B virtual catalog; the root ID can change after a catalog migration or restore. Hardcoded GUIDs in tests then 404 silently.
- **Detection probe:** Before running any catalog test, verify `VIRTUAL_CATALOG_B2B.id` in `test-data/aliases.json` matches the live root. Current value: `fc596540864a41bf8ab78734ee7353a3` (2026-05-15 restore).
- **Cross-ref:** `feedback_storefront_virtual_catalog_link` in MEMORY; `project_vcstqa_restore_2026_05_15`

### VC-CAT-002 — Catalog wipe / restore aftermath
- **Pattern:** A catalog wipe (e.g. 2026-05-15) replaces products and categories with restored versions; ~4,537 products and 422 categories differ, ~5 of 28 CFG products keep their GUIDs but with rebuilt sections
- **Detection probe:** When running catalog suites after a restore, expect alias-based tests to pass and hardcoded-GUID tests to 404. Update `aliases.json` first; rerun `validate-td-refs`.
- **Cross-ref:** `project_vcstqa_restore_2026_05_15` in MEMORY

### VC-CAT-003 — Products seeded in physical catalog 404 on storefront until linked
- **Pattern:** Products seeded directly into the physical catalog (`7f840fe0...`) return 404 on the storefront until linked into the B2B virtual catalog. Symptom looks like an indexer issue.
- **Detection probe:** If a freshly seeded product 404s on storefront, check virtual-catalog membership before debugging the search index.
- **Cross-ref:** `feedback_storefront_virtual_catalog_link` in MEMORY

---

## VC-PROMO — Promotions, Coupons, Pricing

### VC-PROMO-001 — BestRewardPromotionPolicy prefers coupon-backed rewards
- **Pattern:** When multiple promotions could apply, `BestRewardPromotionPolicy` selects the coupon-backed reward over automatic ones (by design, but counterintuitive)
- **Detection probe:** Stack an automatic 10% discount with a coupon for 8%; verify the 8% coupon wins. This is correct behavior — don't file a bug.
- **Cross-ref:** `project_promotion_engine` in MEMORY

### VC-PROMO-002 — Promotion evaluation policy is store-wide
- **Pattern:** The choice of evaluation policy (Best vs Combine) is a store-wide setting, not per-promotion
- **Detection probe:** When testing promotion stacking, confirm which policy the store uses before forming expectations
- **Cross-ref:** `project_promotion_engine` in MEMORY

---

## VC-CFG — Configurable Products

### VC-CFG-001 — Text-section `maxLength` only applies to Custom input
- **Pattern:** Text-section validation `maxLength` applies only to user Custom input — NOT to preset option labels. Presets should serialize by `optionId` reference, NOT as `customText`.
- **Detection probe:** Submit a Text section with a preset option whose label exceeds maxLength. It should succeed (preset is by ID, not by raw text). Then submit Custom text exceeding maxLength — should fail.
- **Cross-ref:** `project_configurable_text_section_validation` in MEMORY. VCST-4987 fix pending.

### VC-CFG-002 — `CFG_TEXT_DRIVEN_COND` has null maxLength
- **Pattern:** The `CFG_TEXT_DRIVEN_COND` product's Text section has `maxLength = null`; BVA over-boundary tests need a different product or an Admin SPA-config update first
- **Detection probe:** Before authoring boundary-value tests on this product, check `maxLength` is non-null in the live config
- **Cross-ref:** `reference_cfg_text_driven_cond_no_maxlength` in MEMORY

### VC-CFG-003 — Configurable bike alias storefront URL/slug 404 stale
- **Pattern:** `CFG_BIKE` alias storefront URL/slug 404s live even though GUID is correct; `validate-td-refs` passes but suite 072 fails live until `aliases.json` is fixed
- **Detection probe:** If a configurable-product suite passes alias validation but live test 404s, check storefront URL/slug separately from GUID
- **Cross-ref:** `feedback_cfg_bike_alias_url_stale` in MEMORY

### VC-CFG-004 — `POST /api/catalog/products/configurations` silent field-name acceptance
- **Pattern:** Body field is `sections` (NOT `configurationSections`) and must include `isActive: true`. Wrong field name silently saves empty `sections: []` and auto-deactivates, returns 200.
- **Detection probe:** After creating a configuration via API, GET it back and verify `sections.length > 0` and `isActive === true`. Don't trust the 200.
- **Cross-ref:** `reference_configurations_post_body` in MEMORY

---

## VC-B2B — B2B Multi-Org & Permissions

### VC-B2B-001 — "Addresses" sidebar link visible only for personal accounts
- **Pattern:** The "Addresses" link in the account sidebar is hidden for B2B/Org users (by design). Filing it as a missing-feature bug for an Org user is incorrect.
- **Detection probe:** Verify user type (personal vs Org) before reporting a missing Addresses link
- **Cross-ref:** MEMORY § Storefront Business Logic

### VC-B2B-002 — Permissions live on Roles, not on Users
- **Pattern:** To grant a permission, edit the Role (Admin SPA → Security → Roles), then assign the role to the user. Permissions cannot be granted directly on a user record.
- **Detection probe:** When validating a permission grant, change the Role and verify all users assigned that Role receive the change without a re-login
- **Cross-ref:** `feedback_admin_permissions_via_roles` in MEMORY

### VC-B2B-003 — Admin user is back-office-only; cannot sign into storefront
- **Pattern:** The `admin` Administrator-type user cannot authenticate against the storefront. Storefront-side flows (e.g. `/account/impersonate`) require a Customer-typed user (e.g. SUPPORT_AGENT / John Mitchell)
- **Detection probe:** If a storefront sign-in fails for `admin`, that's expected — not a bug. Use the seeded Customer-type users instead.
- **Cross-ref:** `reference_admin_backoffice_only` in MEMORY

### VC-B2B-004 — Impersonation permission has dual naming
- **Pattern:** Admin SPA key `platform:security:loginOnBehalf` ≡ code-side `CanImpersonate` / `StorefrontPermissions.CanImpersonate`. Same gate, different surface names — easy to mis-search.
- **Detection probe:** Use both names when searching code or admin UI for impersonation-related issues
- **Cross-ref:** `reference_impersonation_permission_naming` in MEMORY

---

## VC-LIST — Lists & Wishlists

### VC-LIST-001 — Create-List button disable at `listsLimit` is by design
- **Pattern:** When user reaches `listsLimit`, the "Create List" button is disabled. Settings view is read-only from the detail-page entry; Share URL lives inside the Settings dialog.
- **Detection probe:** Don't file these as bugs. Confirmed by user 2026-05-19.
- **Cross-ref:** `project_lists_feature_design_intent` in MEMORY

---

## VC-AUTH — Authentication & Sessions

### VC-AUTH-001 — No sign-out page; sign-out is an action
- **Pattern:** There is no dedicated sign-out page — sign-out is an action/link only. Tests should not expect a "/sign-out" URL.
- **Detection probe:** Verify sign-out via observable side effects (token cleared, redirect to home or sign-in)
- **Cross-ref:** `feedback_no_signout_page` in MEMORY

### VC-AUTH-002 — "Remember Me" checkbox is vestigial
- **Pattern:** The Remember Me checkbox on `/sign-in` has no backend contract — it's a UI artifact. Don't file bugs against it. Mark AUTH-050/051 as N/A.
- **Detection probe:** Don't expect a behavior difference based on the checkbox state
- **Cross-ref:** `project_no_remember_me` in MEMORY

### VC-AUTH-003 — Email verification flow uses Admin Notifications
- **Pattern:** In QA, complete the email-verify flow via Admin → Security → User → Resend, then extract the verification link from the Notifications list
- **Detection probe:** Use this path for any email-verify test scenario in QA
- **Cross-ref:** `reference_email_verification_workflow` in MEMORY

---

## VC-CHECKOUT — Checkout & Payment

### VC-CHECKOUT-001 — Payment-flow varies per processor
- **Pattern:** CyberSource embeds the payment form on the cart page. Skyflow, Authorize.Net, and Datatrans all require clicking "Place Order" first, then redirect to `/checkout/payment`.
- **Detection probe:** Expectations differ per processor. Verify which processor is active for the store before writing test steps.
- **Cross-ref:** `feedback_payment_flow_learnings` in MEMORY; CLAUDE.md "Payment flow" section

### VC-CHECKOUT-002 — `/checkout/review` is gated by `checkout_multistep_enabled`
- **Pattern:** When `checkout_multistep_enabled` is off, `/cart` redirects from `/checkout/review`. Not a page-removed bug.
- **Detection probe:** Check the config flag before reporting a missing review page
- **Cross-ref:** `project_checkout_multistep_gate` in MEMORY

### VC-CHECKOUT-003 — Skyflow vault rejects all non-canonical cards
- **Pattern:** Skyflow's test vault accepts only the canonical card from `feedback_payment_flow_learnings`; any other test card will be rejected even if it's a valid Visa/MC test number
- **Detection probe:** Use the canonical card for Skyflow tests; substitute with cards from other processor canon for cross-processor tests
- **Cross-ref:** `feedback_payment_flow_learnings` in MEMORY

---

## VC-ORDERS — Orders & Quotes

### VC-ORDERS-001 — Status vocabulary differs between Admin and Storefront
- **Pattern:** Admin `OrderStatusType` enum ≠ storefront labels. Seeding uses admin values; UI assertions use storefront labels.
- **Detection probe:** When writing order-status tests, document both — admin value used to seed AND storefront label used in UI assertion
- **Cross-ref:** `project_order_status_vocab` in MEMORY

---

## VC-UI — Storefront UI & Theme

### VC-UI-001 — Coffee is the only WCAG-compliant theme
- **Pattern:** Accessibility test pass requires the Coffee theme. Other themes are NOT WCAG-compliant.
- **Detection probe:** Run a11y tests only against the Coffee theme
- **Cross-ref:** `feedback_a11y_coffee_only` in MEMORY

### VC-UI-002 — Mobile hamburger panel re-mounts header controls
- **Pattern:** At ≤500 px, the vc-frontend mobile hamburger re-mounts header controls into the panel. Claiming a control is unreachable without first enumerating the hamburger is incorrect.
- **Detection probe:** Open the hamburger before claiming a control is missing on mobile
- **Cross-ref:** `feedback_mobile_hamburger_inventory` in MEMORY

### VC-UI-003 — VcTable `@row-click` opens in new tab
- **Pattern:** VcTable's row-click handler uses `window.open(_blank)` — opening detail views in a new tab is by design, not a regression
- **Detection probe:** Don't file as bug. Confirmed VCST-4535 (2026-05-06).
- **Cross-ref:** `project_vctable_rowclick_newtab` in MEMORY

### VC-UI-004 — State-dependent layout bugs are NOT duplicates
- **Pattern:** The same element with the same DOM mechanism, but different user-controllable state (checked vs unchecked, expanded vs collapsed) can yield distinct layout bugs. They are NOT duplicates.
- **Detection probe:** Enumerate states before flagging duplicates. File separately and cross-link under "Related".
- **Cross-ref:** `feedback_state_dependent_layout_bugs` in MEMORY

### VC-UI-005 — Layout-stability invariants (BL-UI-001..006)
- **Pattern:** Six canonical UI layout-stability invariants codified in `business-logic.md` Domain 15. Defect helpers at `scripts/lib/measure-layout.ts`. Coverage by suite `048b-layout-stability.csv`.
- **Detection probe:** When exploring for layout bugs, use the measure-layout helper. Reference the BL-UI-* IDs in any filed bug.
- **Cross-ref:** `reference_layout_stability_artifacts` in MEMORY

---

## VC-API — Platform API & GraphQL xAPI

### VC-API-001 — Members API path uses `/api/members/`, not `/api/customer/members/`
- **Pattern:** Use `/api/members/{id}` for orgs/contacts. `/api/customer/members/{id}` returns 404. 2026-05-18 lesson: wrong path made an audit report claim "all dead" when entities were alive.
- **Detection probe:** Always use `/api/members/` for member operations
- **Cross-ref:** `reference_members_api_endpoints` in MEMORY

### VC-API-002 — `mergeCart` source field is `secondCartId`, not `cartId`
- **Pattern:** The `mergeCart` mutation's source-cart input field is `secondCartId` (required `String!` per `InputMergeCartType`, XCart 3.1013.0). Using `cartId` is a schema error.
- **Detection probe:** Validate against schema before sending mergeCart
- **Cross-ref:** `reference_mergecart_secondcartid` in MEMORY

### VC-API-003 — GraphQL endpoints — canonical paths
- **Pattern:** Runtime POST is `{BACK_URL}/graphql`. GraphiQL UI is `{BACK_URL}/ui/graphiql`. `/xapi/graphql` is NOT valid in this project.
- **Detection probe:** Use the canonical paths only
- **Cross-ref:** `reference_graphql_endpoints` in MEMORY

### VC-API-004 — Storefront products filter requires virtual-catalog subtree
- **Pattern:** xAPI `products()` filter MUST include `category.subtree:@td(VIRTUAL_CATALOG_B2B.id)`. Without it, results may include products outside the storefront's catalog scope.
- **Detection probe:** Verify all `products()` queries include the subtree filter
- **Cross-ref:** `feedback_graphql_products_filter` in MEMORY

### VC-API-005 — Happy-path tests must use full field selection
- **Pattern:** Happy-path GraphQL tests MUST use full field selection. Minimal selection is allowed only for counter probes, roundtrips, or dedicated schema-coverage tests.
- **Detection probe:** Review GraphQL test cases for selection completeness
- **Cross-ref:** `feedback_graphql_full_field_selection` in MEMORY

---

## VC-LOY — Loyalty

### VC-LOY-001 — Loyalty catalog: PTS shows on listing/PDP/deep-link; reverts to USD in cart/checkout/global-search/menu-tree
- **Pattern:** As of theme 2.50.0-pr-2296 (re-confirmed 2026-05-29): PTS shows on listing + PDP + deep-link + namespaced links; cart/checkout, global search, and menu-tree GetCategory revert to USD by design. `loyaltyRoute = null` means theme-driven.
- **Detection probe:** Don't file these reversions as bugs. VCST-5100 partially resolved.
- **Cross-ref:** `project_loyalty_catalog_currency_scope` in MEMORY

### VC-LOY-002 — Per-product loyalty points; per-customer-group gap
- **Pattern:** VCST-5023 (Loyalty 3.1003.0) ships `Product.loyaltyPoints` (MoneyType), `/api/loyalty-program-product-factors`, and Admin "Product Points Loyalty" program type → Product factors blade. Per-product ONLY (no customer-group UI+REST). LOY-029 blocked on per-group gap.
- **Detection probe:** Don't expect customer-group loyalty UI; mark LOY-029 as Blocked
- **Cross-ref:** `project_loyalty_catalog_currency_scope` in MEMORY

---

## VC-CMS — CMS & Content

### VC-CMS-001 — CMS pages appear in search suggestions only
- **Pattern:** CMS pages show up in the search suggestions dropdown, NOT in the main search results grid
- **Detection probe:** Don't expect CMS pages in `/search?q=...` result grids
- **Cross-ref:** `feedback_cms_search_suggestions` in MEMORY

### VC-CMS-002 — Designer block workflow uses tune-icon + library
- **Pattern:** Designer blocks: tune icon for context menu (not right-click); must add via library click-through; never use REST API for content authoring
- **Detection probe:** Test block-add via library, not direct API; expect tune-icon menu, not right-click
- **Cross-ref:** `feedback_designer_block_workflow` in MEMORY

---

## VC-ADDR — Addresses

### VC-ADDR-001 — `countryCode` is ISO-3; UK regionId is null; isFavorite is storefront-only
- **Pattern:** Address data: `countryCode` is ISO-3 (USA / CAN / GBR). UK addresses have `regionId = null`. `isFavorite` exists in the storefront xAPI ONLY.
- **Detection probe:** When asserting on address payloads, use these conventions. Reference snapshot at `test-data/addresses/techflow-org-addresses-state-20260423.json`.
- **Cross-ref:** `reference_address_data_conventions` in MEMORY

### VC-ADDR-002 — Advanced address search / facets scoped to checkout popup ONLY
- **Pattern:** VCST-4710 / PR #129 advanced address search and facets are scoped to the checkout address-selection popup ONLY. Not to `/account/addresses` or the ship-to popover.
- **Detection probe:** Don't expect these features in account-addresses or ship-to
- **Cross-ref:** `project_pr_129_scope` in MEMORY

### VC-ADDR-003 — State/Province facet only appears for USA/Canada
- **Pattern:** State/Province facet appears only for USA/Canada addresses; empty `term: []` response hides the facet (by design)
- **Detection probe:** Don't expect the facet outside US/CA
- **Cross-ref:** `project_address_state_facet` in MEMORY

---

## VC-BOPIS — Pickup In Store

### VC-BOPIS-001 — BOPIS and header Ship-To are distinct features
- **Pattern:** BOPIS (cart Pickup, BL-BOPIS-*) and header Ship-To (delivery context, BL-SHIP-001) are different features. Never share a Section or BL refs in test cases.
- **Detection probe:** Don't conflate the two when writing tests. BOPIS-053 is the only intersection (header change clears pickup).
- **Cross-ref:** `feedback_bopis_shipto_distinct` in MEMORY

---

## VC-DEPLOY — Deploy & Build Verification

### VC-DEPLOY-001 — PRs are deployed to QA while still open
- **Pattern:** PRs are deployed to QA before merge. Verify build artifact version in the deploy repo, NOT PR merge status.
- **Detection probe:** Check `vc-deploy-dev` `vcst-qa` branch for the artifact version
- **Cross-ref:** `feedback_pr_deploy_workflow` in MEMORY

### VC-DEPLOY-002 — Do NOT use storefront/image.json for build verification
- **Pattern:** Only `packages.json` + `artifact.json` are valid sources for build version. `storefront/image.json` is misleading.
- **Detection probe:** Stick to packages.json + artifact.json
- **Cross-ref:** `feedback_no_storefront_image` in MEMORY

### VC-DEPLOY-003 — Admin SPA has 4h `max-age` cache
- **Pattern:** After a module hotfix PR with a new artifact, clear Playwright MCP cache (admin SPA has 4h `max-age`); a stale bundle can masquerade as FIX_INCOMPLETE
- **Detection probe:** When verifying a hotfix, force-refresh and confirm asset hash changes before signing off
- **Cross-ref:** `feedback_mcp_browser_cache` in MEMORY

---

## VC-PURCHASE — Purchase Requests / AI Doc Processing

### VC-PURCHASE-001 — `/account/purchase-requests` is an OCR/AI pipeline, NOT an approval workflow
- **Pattern:** `vc-module-ai-document-processing` powers `/account/purchase-requests` — it's a document-to-quote OCR pipeline (upload PDF → extract → match → quote), NOT a buyer/manager approval workflow. Installed on virtostart, NOT on vcst-qa.
- **Detection probe:** Don't expect approval-workflow behavior. Test on virtostart, not vcst-qa.
- **Cross-ref:** `reference_purchase_request_module` in MEMORY

---

## VC-EXEC — Test Execution & Tooling

### VC-EXEC-001 — Always use the canonical GraphQL runner
- **Pattern:** NEVER write custom JS scripts to execute GraphQL CSV cases. Always use `npx tsx scripts/graphql-runner.ts --case <csv>:<ID>`. The runner does schema validation, var substitution, evidence capture.
- **Detection probe:** If you see a custom GraphQL JS runner in PR diff, flag it
- **Cross-ref:** `feedback_use_canonical_graphql_runner` in MEMORY

### VC-EXEC-002 — Real-user interaction; never bypass UI with scripts
- **Pattern:** All agents must use browser tools like a real user (click, type, scroll, hover). Never bypass UI with scripts.
- **Detection probe:** Review agent actions; flag any script-bypass of the UI
- **Cross-ref:** `feedback_real_user_interaction` in MEMORY

### VC-EXEC-003 — Never force a disabled/blocked control
- **Pattern:** A disabled Save = validation working, NOT a bug. An API-only repro should NOT be reported as a UI-layer defect. (VCST-5100 false "no client validation" was the cited error.)
- **Detection probe:** Before filing a bug, distinguish between UI-layer validation success vs API-layer behavior
- **Cross-ref:** `feedback_no_force_disabled_controls` in MEMORY

### VC-EXEC-004 — Verify source data before filing a "wrong field mapping" bug
- **Pattern:** Before filing a "wrong field mapping" bug, verify the underlying record's field value. Rendered rows can mask which field holds which value. (VCST-4995 lesson.)
- **Detection probe:** Read the API payload before trusting the visible rendering
- **Cross-ref:** `feedback_verify_source_data_before_bug` in MEMORY

### VC-EXEC-005 — Network-payload bug findings require a second-source repro
- **Pattern:** Network-payload findings (filter strings, GraphQL variables, request/response bodies) from automated exploration MUST be confirmed by a second-source real-user repro with payload capture before being filed. (2026-05-26 false positive: date-picker End-boundary dropped from GQL filter — first repro 3/3, manual repro confirmed both bounds present.)
- **Detection probe:** Before filing payload-bug, run a manual repro and capture payload
- **Cross-ref:** `feedback_verify_payload_bugs_second_source` in MEMORY

### VC-EXEC-006 — Storybook is a production build; DEV-only logs are dead code there
- **Pattern:** Hosted Storybook is `vite build` (production); `import.meta.env.DEV === false`. DEV-only `console.warn` / debug-log gates are dead code there. Verify via local `npm run dev` or unit test that overrides `import.meta.env`, NOT via hosted Storybook.
- **Detection probe:** Don't claim a DEV warning is missing based on hosted Storybook
- **Cross-ref:** `feedback_storybook_is_production_build` in MEMORY

---

## See also

- [business-logic.md](business-logic.md) — Testable invariants (BL-* IDs); each catalog entry cross-refs relevant BL invariants
- [e-commerce-edge-cases-library.md](e-commerce-edge-cases-library.md) — Generic e-commerce patterns (ECL-* IDs); use alongside this catalog
- [../../skills/qa-methodology/qa-sbtm/adversarial-heuristics.md](../../skills/qa-methodology/qa-sbtm/adversarial-heuristics.md) — Uses this catalog as the "Familiar Problems" oracle (HICCUPPS-F) and seeds Bad Neighborhood Tours
- [../../skills/qa-methodology/qa-sbtm/charter-library.md](../../skills/qa-methodology/qa-sbtm/charter-library.md) — Many charters reference specific entries from this catalog
- `~/.claude/projects/.../memory/MEMORY.md` — Source-of-truth chronological project lessons (kept up-to-date by the assistant during sessions)
