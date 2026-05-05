# BUG-030-001 — Configurable product different configs may collapse to single line after cross-cart merge

**Status:** Preliminary — confirmed: false
**Severity:** Medium
**Priority:** P2
**Run:** REG-2026-05-04-1527
**Suite:** 030 — Cart Merge
**Test Case:** CART-073
**Browser:** playwright-firefox (Firefox)
**Build:** Ver. 2.48.0-pr-2274-0307-0307f38b
**Date:** 2026-05-05
**Reporter:** qa-frontend-expert
**Environment:** https://vcst-qa-storefront.govirto.com (B2B-store)
**User:** test-emily.johnson-20260310@test-agent.com (slot 2 B2B, TechFlow org)

## Business Rule

- **BL-CART-006** — Cart merge on sign-in
- **BL-CART-007** — Configurable products with different configurations should create separate cart lines (exception to duplicate-SKU summing)

## Edge Case References

- ECL-7.1 — Configurable product cart line distinctness
- ECL-7.3 — Cart merge invariants
- ECL-14.1 — Sign-in cart merge

## Steps to Reproduce

1. Sign in as user (any registered user with empty cart).
2. Clear cart if not empty (CLEAR CART → YES confirmation).
3. Navigate to Configurable Hat PDP: `/products-with-options/configurable-caps-shirts/configurable-hat`.
4. In the "SELECT YOUR FAV COLOR" Product-section, click the **Black hat** option (option A). PDP "Price:" shows **$10.00** (Black is the base-priced option, $0 surcharge).
5. Click **ADD TO CART**. Cart badge shows 1.
6. Click user name in top header → Logout button in popup (data-testid `main-layout.top-header.account-menu.sign-out-button`).
7. As guest, reopen the same Configurable Hat PDP.
8. Click the **Green hat** option (option B) — different from option A. PDP "Price:" updates to **$28.00** ($10 base + $18 Green surcharge).
9. Click **ADD TO CART**. Guest cart badge shows 1.
10. Sign in with the same user credentials (triggers anonymous → user cart merge).
11. Navigate to `/cart`.

## Expected Result

Cart shows **exactly 2 distinct line items** for Configurable Hat, both pointing to the same base product:

- Line 1: Black hat configuration (option A), unit price $10.00, line total $10.00
- Line 2: Green hat configuration (option B), unit price $28.00, line total $28.00
- Cart subtotal: $38.00
- Cart badge: 2

Per **BL-CART-007** exception, different configurations of the same configurable base product should remain as separate lines after a cross-cart merge — they should not collapse or quantity-sum together.

## Actual Result

Cart shows **ONLY 1 line item** for Configurable Hat:

- Single line, qty=2 (the qtys appear to have been summed)
- Unit price: $10.00
- Line total: $20.00 (= $10 × 2)
- Cart subtotal: $20.00
- Cart badge: 2

The two distinct configurations (Black + Green) appear to have collapsed into a single line item. The Green configuration ($28 total) is no longer visible as a separate line.

## Evidence

- Screenshot: `cart-073-after-merge.png` (full page) showing single Configurable Hat line with qty=2 and $20.00 subtotal
- HAR: captured per playwright-firefox isolated context (auto-saved)
- Console: 0 errors, 6 warnings (no JS exceptions during merge)
- Network: cart fetch and merge mutation HTTP 200, no 4xx/5xx

## Cross-layer

- **STOREFRONT:** Cart UI shows only 1 line — both configurations apparently collapsed
- **CONSOLE:** No JS errors
- **NETWORK:** No 4xx/5xx
- **API:** mergeCart mutation returns 200 (errors[] not directly inspected in this run; recommend qa-testing-expert investigate via GraphiQL)

## Possible Alternative Explanation (NOT YET RULED OUT)

The user-side Black hat radio click may not have actually applied:

- "Black hat" option has $0 surcharge over base, so PDP price stays $10.00 whether "Black" OR "None" (default) is selected.
- If my `label.click()` on user side did not register a true radio change, the user-side add may have actually been "None" (default empty configuration).
- The guest-side Green hat click was confirmed via radio.click() showing PDP $28.
- If user-side Black actually = guest-side Green collapsed to one line at $10/unit, the merge would be incorrect — but if both adds were truly identical "None"/default, the merge correctly collapsed (no bug).

**To confirm whether this is a real merge bug**, qa-testing-expert should:

1. Re-run the test using explicit `radio[name=f8004e62-...].click()` for the user-side Black hat (skip label clicks).
2. Capture the `configurationItems` field via `getCart` GraphQL query before sign-in (user side) and after sign-in (merged) to verify the option IDs stored.
3. If user-side line has a different `configurationItems` snapshot than guest-side line BUT they collapsed post-merge, this IS a BL-CART-007 violation.
4. If both lines had identical `configurationItems` (e.g., empty/none), the collapse is correct behavior.

## Reproduction Reliability

1/1 (single attempt). Needs re-verification with cleaner radio-selection methodology.

## Suggested Investigation Path

1. `qa-testing-expert` to re-run CART-073 with explicit radio selectors on both sides.
2. Inspect `mergeCart` mutation request payload and `getCart` response in HAR.
3. Compare `configurationItems` arrays before and after merge.
4. If bug confirmed, file as JIRA VCST-* with severity Medium (cart-merge integrity).
5. If user-side radio selection issue confirmed, this becomes a test-execution improvement — not a product bug — and CART-073 should be re-run.

## Cross-Run References

- CART-072 PASS (this run): Same configuration sums correctly across user+guest carts → 1 line qty=3 ✓
- CART-058 PASS (this run): Simple SKU merge sums correctly → 1 line qty=3 ✓

The merge mechanism for **identical** configurations works (CART-072 PASS). The question is whether **distinct** configurations preserve their separateness on cross-cart merge.

## Owner / Next Action

- Owner: qa-testing-expert (interactive re-verification)
- Next Action: Re-run with explicit radio selectors and GraphQL configurationItems inspection
