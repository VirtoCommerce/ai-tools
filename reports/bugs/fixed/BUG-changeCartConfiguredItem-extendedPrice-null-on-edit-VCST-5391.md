# [Cart] Editing a configurable product's configuration from the cart and saving returns an error and loses the configuration (changeCartConfiguredItem)

## Status: FIXED

## Resolution
- **Fixed in:** PR [vc-module-x-cart#132](https://github.com/VirtoCommerce/vc-module-x-cart/pull/132) (commit `175acb6`) — central stamp in `CartAggregateRepository.SaveAsync` setting `ConfigurationItem.LineItemId` after `SaveChangesAsync`, covering **edit + add-to-cart + moveFromSavedForLater**. **PR OPEN / NOT yet merged** at time of verification.
- **JIRA:** VCST-5391 → Tested (2026-06-29)
- **Verified:** 2026-06-29 on the deployed PR build `XCart 3.1024.0-pr-132-175a` (vcst-qa) — `changeCartConfiguredItem` PASS 3/3 **and** `moveFromSavedForLater` PASS 3/3 (errors[] empty, configurationItems populated, extendedPrice non-null). CI green (ci/SonarQG/auto-tests×3/swagger/cla).
- **Verification method:** /qa-verify-fix VCST-5391 → `tests/Sprint-current/VCST-5391/`
- **Caveat:** PR unmerged — re-confirm + transition to Done after a human merges (`/qa-verify-fix VCST-5391`).

**JIRA:** VCST-5391 (filed 2026-06-29 — Bug / Medium)
**Severity:** Medium (latent/contract — the storefront masks it by re-fetching the cart, so the UI flow looks correct; but the mutation violates its GraphQL contract and any consumer reading config off the Save response sees it as null)
**Env:** vcst-qa storefront — Theme `2.52.0-pr-2353-fa77`, **XCart `3.1023.0`**, Cart `3.1006.0`
**Owning layer:** Layer 3 — GraphQL xAPI (vc-module-x-cart resolver)
**Reproduced:** 2026-06-29 (REG-2026-06-29-1719 suite 072 CFG-EDIT-001/002/003 — 6 runs across 3 section types, 2× each, deterministic)

## Summary

Editing a configurable product's configuration **from the cart** (`/cart` → Components list → "Edit configuration" → change an option → **Update cart**) fires the `changeCartConfiguredItem` mutation, which returns **HTTP 200 with `data` populated but a non-empty top-level `errors[]`**. The error nulls the offending field's parent, so `data.changeCartConfiguredItem.items[0].configurationItems` comes back **`[null]`** in the Save response. Line-item top-level totals are correct, and the storefront re-fetches the full cart (which returns `configurationItems` intact), so the visible cart is correct today — but the mutation contract is violated, and any client reading config directly off the Save response sees the configuration as lost. This is the likely root of the reported "edit configuration from cart loses/breaks the option" symptom.

## Steps to Reproduce

1. Sign in (B2B-store). Add a configurable product with a configuration to the cart — e.g. `@td(CFG_BIKE.id)` (CFG-032), select **Seat (+$15)** → total $365 → Add to cart.
2. Go to `/cart`, expand the line's **Components list**, click **"Edit configuration"** (PDP opens with `?lineItemId=…`, button reads "Update cart").
3. Change the option — e.g. **Seat → Engine ($225)**.
4. Click **Update cart**. Inspect the `changeCartConfiguredItem` GraphQL response (network tab / HAR).

## Expected vs Actual

- **Expected:** `changeCartConfiguredItem` returns `200` with **empty `errors[]`** and `items[0].configurationItems` populated with the new option(s).
- **Actual:** `200` with **`errors[]` non-empty** and `items[0].configurationItems = [null]`:
  ```
  message: "Error trying to resolve field 'extendedPrice'."
  path:    changeCartConfiguredItem.items[0].configurationItems[0].extendedPrice
  code:    ARGUMENT_NULL
  ```
  (Line top-level `extendedPrice`/`subTotal` are correct; only the per-configuration-item `extendedPrice` resolver throws, nulling the parent `configurationItems` entry.)

The functional cart flow is otherwise healthy — line updates **in place** (itemsCount 1→1, same lineItemId, qty preserved, new price applied, no duplicate, no revert). Confirmed across Product / Text / File section types, 2 runs each.

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | PASS (masks it) | UI updates the line in place after a full-cart re-fetch; Components list shows the correct option. The `errors[]` is NOT surfaced in the browser console — it lives only in the mutation response body. |
| 2. Backend Admin | N/A | — |
| 3. GraphQL xAPI | **FAIL** | `changeCartConfiguredItem` → 200 with top-level `errors[]` ("Error trying to resolve field 'extendedPrice'", `ARGUMENT_NULL`) on `items[].configurationItems[].extendedPrice`; `configurationItems` returns `[null]`. Reproduced on all 6 runs. |
| 4. Platform REST | N/A | line totals correct; defect is in the xAPI resolver, not underlying cart data |

**Owning layer:** Layer 3 — GraphQL xAPI. The `ConfigurationItemType.extendedPrice` money-field resolver receives a null argument (`ARGUMENT_NULL`) when resolving a configuration item produced by `changeCartConfiguredItem`, throwing and nulling the parent.

## Root Cause Analysis

The `changeCartConfiguredItem` mutation builds/returns cart line `configurationItems` whose **per-item `extendedPrice`** cannot be resolved — the money resolver is handed a null (currency or amount) argument and raises `ARGUMENT_NULL`. The top-level line `extendedPrice` resolves fine, so the gap is specific to the **configuration-item** price projection on the mutation's return path (vs the `cart`/`fullCart` query path, which resolves the same field correctly — hence the re-fetch masks it). Suspect the mutation's configuration-item mapping doesn't carry the currency/price context onto each `ConfigurationItem` the way the cart-query aggregation does.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 3 — xAPI
- **Suggested repo:** `VirtoCommerce/vc-module-x-cart`
- **repoKind:** module
- **Component / module:** xCart GraphQL — `ConfigurationItemType.extendedPrice` resolver / the `changeCartConfiguredItem` mutation's configuration-item price projection
- **RCA anchor:** search vc-module-x-cart for `ConfigurationItemType` / `extendedPrice` resolver and the `changeCartConfiguredItem` mutation return mapping; compare the configuration-item price/currency wiring against the `cart` query path that resolves it correctly. Error string: `"Error trying to resolve field 'extendedPrice'"` + `ARGUMENT_NULL`.
- **Routing confidence:** HIGH (server-side GraphQL resolver error returned by the mutation; UI/REST both correct)

## References

- REG-2026-06-29-1719 suite 072 CFG-EDIT-001/002/003 (6 runs, 3 section types). Mutation req/resp evidence: `test-results/chrome/cfg-edit-001-run2-resp.json`, `edit002-200-resp.json`, `edit003-134-resp.json`; screenshots `cfg-edit-001-post-save-engine.png`, `cfg-edit-002-text-world2.png`, `cfg-edit-003-file-replaced-fileB.png`.
- Related (distinct): `BUG-cart-configurable-line-summary-shows-wrong-option-label.md` — an add-time vc-frontend summary-header **label rendering** bug (data correct). Different layer (L1 vs L3) and trigger (add vs edit); not a duplicate.
