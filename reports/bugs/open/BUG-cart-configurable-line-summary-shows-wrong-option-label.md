# [vc-frontend] Cart configurable line-item summary header shows wrong selected-option label (data correct, rendering wrong)

## Status: CONFIRMED

**Severity:** Medium (display/UX — misleads the customer about what they configured; data + totals are correct)
**Env:** vcst-qa storefront — Theme `2.51.0-pr-2310`, Platform `3.1035.0`, XCart `3.1019.0-pr-124-89a6`
**Owning layer:** Layer 1 — vc-frontend (line-item configuration summary rendering)
**Reproduced:** 2026-06-11 (REG-2026-06-11-1423, suite 030 CART-071 + CART-073, 2× confirmed)

## Summary

On `/cart`, a configurable product line's **summary header** shows the wrong selected-option value (e.g. always "Color: Emerald green / Size: S") regardless of the actual configuration. The line's expandable **Components list** correctly shows the real selection (e.g. "Black hat"), and lineItemId / per-line totals / quantities are all correct. So the data is right; only the collapsed summary-header label is mis-rendered.

## Steps to Reproduce

1. Sign in; add a configurable product (e.g. the Configurable Hat) to the cart with a specific option — **Variant A: Black**.
2. Add the same configurable product again with a **different** option — **Variant B: Green** (distinct line).
3. Go to `/cart` and read each line's **summary header** vs its expanded **Components** list.

## Expected vs Actual

- **Expected:** each line's summary header reflects that line's actual selected option (Black line shows Black; Green line shows Green).
- **Actual:** both lines' summary headers show the **same wrong** value (e.g. "Emerald green") while the Components list and totals are correct per line.

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | **FAIL** | summary header label wrong; Components list + totals + lineItemIds correct |
| 2. Backend Admin | N/A | — |
| 3. GraphQL xAPI | PASS | cart line `configurationItems[]` / components return the correct per-line option (Components list renders them correctly) |
| 4. Platform REST | N/A | — |

**Owning layer:** Layer 1 — vc-frontend. The summary-header binding reads the wrong source (likely a shared/first-config value or a wrong index) while the Components renderer reads the correct per-line `configurationItems`.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** `VirtoCommerce/vc-frontend`
- **repoKind:** frontend
- **Component / module:** cart line-item configurable-summary component (the collapsed config header on `/cart`)
- **RCA anchor:** the line-item config-summary binding (search vc-frontend for the cart line configuration summary/label render vs the components list); confirm it reads per-line `configurationItems` not a shared value
- **Routing confidence:** HIGH (data correct at xAPI, defect is purely the storefront summary rendering)

## References
- REG-2026-06-11-1423 suite 030 CART-071, CART-073 — evidence `screenshots/CART-071-FAIL-config-summary-label-mismatch.png`, `CART-073-FAIL-config-summary-label-mismatch.png`
