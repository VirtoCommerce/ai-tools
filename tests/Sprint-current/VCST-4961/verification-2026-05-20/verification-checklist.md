# VCST-4961 — Verification Checklist (GraphQL CASE A + B)

**Date:** 2026-05-20
**Build under test:**
- Platform: 3.1028.0
- VirtoCommerce.XCart: 3.1015.0-pr-119-6a09 (PR #119 head SHA `6a09301`)
- VirtoCommerce.Cart: 3.1003.0
- Theme: 2.49.0
- Env: https://vcst-qa-storefront.govirto.com

**Method:** Direct GraphQL via `scripts/graphql-runner.ts` (canonical) — fall back to GraphiQL UI on `{BACK_URL}/ui/graphiql` if the runner blocks. Three consecutive end-to-end runs (3x STR per `/qa-verify-fix` policy).

## Fix Confirmation — must pass 3 / 3

1. **CASE A (preserve `true`)** — Build cart with configurable product (use `@td(CFG_LAPTOP.id)` — CFG-013, 2 Product sections RAM + Storage). Confirm baseline config item `selectedForCheckout: true`. Call `changeCartConfiguredItem` with a different option `productId` for one section (simulating Edit-and-Update). Assert that section's `selectedForCheckout` STILL `true` (preserved from old) and the cart `subTotal` reflects the new option price.
2. **CASE B (preserve `false`)** — Same baseline cart. Use `changeCartConfigurationItemSelected` to flip RAM section's `selectedForCheckout` to `false`. Assert flag is `false` AND `lineItem.listPrice` dropped (BL-CART-010). Now call `changeCartConfiguredItem` with a different RAM option `productId`. Assert RAM section's `selectedForCheckout` STILL `false` (preserved) and `lineItem.listPrice` still reflects the deselected state.
3. **Root cause addressed** — Inspect the new `PreserveSelectedForCheckoutFromOldConfiguration` path indirectly: confirm both Type-A (preserve=true) and Type-B (preserve=false) outcomes reproduce on 3 consecutive runs without flakiness.

## Regression — adjacent cart features unchanged

4. **BL-CART-010 (reprice)** — After `changeCartConfigurationItemSelected` deselects RAM, `lineItem.listPrice` MUST decrease by the RAM option's price. After `changeCartConfiguredItem` re-edit, `listPrice` MUST still reflect the deselected state (no silent re-enabling).
5. **BL-CART-013 (no-change short-circuit)** — Send `changeCartConfiguredItem` with sections identical to current state; assert `listPrice` and `selectedForCheckout` are unchanged and no `validationErrors`.
6. **Other cart mutations sane** — Run `addItem` (simple non-configurable product) and `removeCartItem` on the same cart. Assert HTTP 200, no `validationErrors`, no GraphQL `errors[]`, no 5xx.
7. **No console / network errors** — If using GraphiQL, no JS exceptions; if runner, no schema-validation failures, no execution errors.

## Cross-Layer / Schema

8. **Schema introspection** — `ConfigurableProductOptionInput.selectedForCheckout: Boolean` still present on input; `CartConfigurationItemType.selectedForCheckout: Boolean!` still on output. (No schema deprecation expected from this PR.)
9. **New-section path (Issue A original fix)** — Build a fresh configured line item that includes a section the cart never had before; pass `option.selectedForCheckout: false` on input. Assert the resulting `configurationItems[i].selectedForCheckout = false` (no longer silently ignored). This exercises `CreateConfiguredLineItemHandler` → `AddProductSectionLineItem(selectedForCheckout: …)`.

## Edge / Idempotency

10. **3-run idempotency** — Whole CASE A + B sequence repeats 3 times with the same verdict, fresh cart per run (use `clearCart` between runs).

## Decision matrix

| STR (1+2) | Regression (4-7) | Cross-Layer (8-9) | Edge (10) | Verdict |
|---|---|---|---|---|
| 3/3 PASS | All PASS | All PASS | PASS | VERIFIED |
| 3/3 PASS | All PASS | All PASS | PASS but with P3 note | VERIFIED_WITH_NOTES |
| 3/3 PASS | 1+ FAIL | — | — | NEW_REGRESSION (file new bug) |
| Any FAIL | — | — | — | FIX_INCOMPLETE (reopen) |
| 2/3 PASS | — | — | — | INTERMITTENT (reopen) |
| Setup blocked | — | — | — | BLOCKED |

## Live-discovery notes

- `CFG_BIKE` (CFG-005) has shape-drift on vcst-qa per [feedback_storefront_virtual_catalog_link]. Prefer `CFG_LAPTOP` (CFG-013, two required Product sections) — actively verified in suite 050i CFG-GQL-001..010.
- Section IDs (`SECTION_RAM_ID`, `SECTION_STORAGE_ID`) and option IDs (`OPT_RAM_BASE_ID`, `OPT_RAM_UPGRADE_ID`, etc.) must be live-discovered via `productConfiguration` query — they were regenerated in Phase 2 reseed on 2026-05-18.
- Auth via `[AUTH role=ORG_USER]` (uses agent-user-pool slot per [feedback_agents_read_env_creds]). Tear-down with `clearCart` + `unSelectAllCartConfigurationItems` to reset state between runs.
