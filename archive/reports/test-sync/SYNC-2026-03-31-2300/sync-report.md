# Test Sync Report — SYNC-2026-03-31-2300

## Summary
- **Source:** PR #2226 (VirtoCommerce/vc-frontend) + JIRA VCST-3902
- **Date:** 2026-03-31 23:00
- **Changed modules:** vc-frontend (configurable products UX)
- **Affected suites:** 072, 072b, 072c
- **PR Status:** Open (in Testing) | Branch: `feat/VCST-3902-quantity-stepper` → `dev`
- **Artifact:** `vc-theme-b2b-vue-2.45.0-pr-2226-1bdb`

## Change Inventory

| Module | Layer | Files Changed | Breaking | New Features |
|--------|-------|--------------|----------|-------------|
| vc-frontend / cart | storefront | add-to-cart.vue (+76/−21) | Quantity stepper removed for configurable products | Dedicated Add/Update cart button |
| vc-frontend / catalog | storefront | product-configuration.vue, product-price-block.vue, product-price.vue, count-in-cart.vue | `getUrlSearchParam` → reactive composable | `useConfigurableLineItemId` composable; "Create new configuration" link |
| vc-frontend / catalog | storefront | useConfigurableProduct.ts | — | `markConfigurationAsSaved()` method |
| vc-frontend / common | storefront | configuration-items.vue | — | BEM CSS refactor with `--vc-radius` |
| vc-frontend / static-content | storefront | product-info.vue (−18 lines) | Old "Create your own config" button removed | — |
| vc-frontend / locales | storefront | 12 locale files | Label rename | "Create your own configuration" → "Create new configuration" |

### Key Behavioral Changes

1. **Quantity stepper removed** — configurable products on PDP now use a dedicated `VcButton` ("Add to cart" / "Update cart") instead of `QuantityControl` stepper
2. **lineItemId in URL** — after adding, `lineItemId` query param is written to URL via `router.replace`; drives edit-from-cart context reactively
3. **"Create new configuration" link** — replaces old button; appears in price block only when `lineItemId` is present; clears param + resets config
4. **Button state changes** — "Add to cart" (outline) → "Update cart" (solid) after adding; reverts on "Create new configuration"
5. **CountInCart badge** — only shown when `lineItemId` is present for configurable products
6. **Mutation split** — new items use `addItem`; updates use `changeCartConfiguredItem` (no longer batched)

## Impact Matrix

| Suite | Total Cases | Updated | New Added | Bulk-Fixed (set qty) | Valid |
|-------|------------|---------|-----------|---------------------|-------|
| 072 (UI) | 68 | 8 | 6 | 6 | 48 |
| 072b (E2E) | 57 | 2 | 2 | ~20 | 33 |
| 072c (Cross) | 25 | 0 | 0 | 5 | 20 |
| **Total** | **150** | **10** | **8** | **~31** | **101** |

## Cases Updated (Targeted Rewrites)

| Case ID | Suite | Change Type | What Changed |
|---------|-------|-------------|-------------|
| CFG-PDP-001 | 072 | STALE | Removed stepper assertions; added dedicated button + CountInCart badge checks |
| CFG-PDP-005 | 072 | BROKEN→Rewritten | Full rewrite: "Quantity Stepper" → "Dedicated Add to Cart Button" with variant/lineItemId checks |
| CFG-PDP-006 | 072 | STALE | Removed stepper steps; added post-add state (Update cart, lineItemId, CountInCart) |
| CFG-PDP-011 | 072 | STALE | "set qty to 1" → "click Add to cart"; clarified cart-only stepper |
| CFG-PDP-017 | 072 | BROKEN→Rewritten | Full rewrite: old button → new link in price block; added reset behavior, lineItemId removal |
| CFG-EDIT-001 | 072 | INCOMPLETE | Added "Update cart" button label assertion; mutation → `changeCartConfiguredItem` |
| CFG-EDIT-002 | 072 | INCOMPLETE | Added "Update cart" button label assertion |
| CFG-EDIT-003 | 072 | INCOMPLETE | Added "Update cart" button; removed "Set qty 1" step |
| CFG-E2E-012 | 072b | STALE | Fixed: add at minQty on PDP, qty changes in cart only; strengthened config preservation |
| CFG-E2E-046 | 072b | STALE | Rewrote: stock enforcement now tested via cart stepper (not PDP stepper) |

## Bulk-Fixed Cases (Pattern Replacement)

All cases referencing "Set qty 1; click Add to Cart" or similar PDP stepper patterns for configurable products were updated to "Click Add to cart" since the quantity stepper no longer exists for configurable products.

| Suite | Pattern | Occurrences Fixed |
|-------|---------|-------------------|
| 072 | `[ACT] Set qty 1; click Add to Cart` | 4 (lines 45, 50, 52, 53) |
| 072 | `[ACT] Set qty 1; [ACT] Tap Add to Cart button` | 1 (line 48) |
| 072 | `[ACT] Select option; set qty 1; click Add to Cart` | 1 (line 51) |
| 072b | `[ACT] Set qty to 1; click Add to Cart` | ~8 |
| 072b | `set qty 1; add to cart` / `set qty 1; click Add to Cart` | ~8 |
| 072b | `[ACT] Set quantity to 1; [ACT] Click Add to Cart` | ~4 |
| 072c | `[ACT] Set qty 1; click Add to Cart` | 4 (lines 7, 8, 9, 13) |
| 072c | `[ACT] Set qty 1; [ACT] Click 'Add to Cart'` | 1 (line 25) |

## New Cases Generated

| Case ID | Suite | Title | Priority |
|---------|-------|-------|----------|
| CFG-3902-001 | 072 | Create new config link NOT visible on fresh PDP (no lineItemId) | Critical |
| CFG-3902-002 | 072 | Configuration resets to defaults after clicking Create new configuration | Critical |
| CFG-3902-003 | 072 | Post-add-to-cart state — button changes and lineItemId written to URL | Critical |
| CFG-3902-004 | 072 | Update cart button fires changeCartConfiguredItem (not addItem) | Critical |
| CFG-3902-005 | 072 | Save changes modal when navigating away from unsaved edit | High |
| CFG-3902-006 | 072 | Cart quantity stepper hidden on PDP — only available in cart | High |
| CFG-E2E-056 | 072b | Create new config from edit context creates separate cart line (BL-CART-007) | Critical |
| CFG-E2E-057 | 072b | URL lineItemId state survives page refresh and drives edit context | High |

## Cases Not Modified (VALID)

| Case ID | Suite | Reason |
|---------|-------|--------|
| CFG-E2E-048 | 072b | Tests non-configurable product — stepper still exists for regular products |
| CFG-E2E-047 | 072b | Page refresh test — no stepper reference |
| CFG-ADM-* | 072 | Admin-side cases — unaffected by frontend PDP changes |
| CFG-GQL-* | 072c | GraphQL-level cases — unaffected by UI changes |

## Quality Gate

| Check | Status |
|-------|--------|
| All STALE cases updated | PASS |
| All BROKEN cases rewritten | PASS |
| New behavior has coverage | PASS (8 new cases) |
| No ID conflicts | PASS |
| CSV structure valid (header + data rows) | PASS |
| testCount updated in manifest | PASS (072: 68, 072b: 57) |
| "Create your own configuration" purged from steps/assertions | PASS |
| "Set qty" purged from PDP steps (configurable products only) | PASS |
| "Save or Update" purged from configurable edit flows | PASS |

## Recommended Next Steps

- [ ] Review updated cases: `git diff regression/suites/Frontend/configurable-products/`
- [ ] Deploy PR artifact `vc-theme-b2b-vue-2.45.0-pr-2226-1bdb` to QA
- [ ] Run `/qa-regression 072,072b,072c` to verify updated cases against deployed artifact
- [ ] Verify edge case: same configuration added twice → does backend merge or create separate line items?
- [ ] Track TODO in `add-to-cart.vue` — lineItemId detection workaround (comparing cart before/after)
