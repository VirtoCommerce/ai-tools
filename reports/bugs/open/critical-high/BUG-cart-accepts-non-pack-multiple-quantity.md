# Cart xAPI accepts a non-pack-multiple quantity `[P1]` `[BL-CART-006]`

**Env:** vcst-qa @ Platform 3.1043.0, Theme 2.53.0-pr-2368
**Case:** CART-055 (suite 028)

## Summary
For a pack product (`packSize = 6`, `minQuantity = 6`), setting `quantity: 7` is accepted verbatim: HTTP 200, quantity stored as `7` (not rounded to 6 or 12), `extendedPrice = 69.93` (= 9.99 × 7), and `validationErrors` **empty**. Pack-size enforcement (BL-CART-006) requires a non-multiple quantity to be rejected or rounded up to the nearest pack multiple.

## Steps to Reproduce
1. Authenticate (`@td(USER_DEFAULT)`).
2. Resolve the live pack product (see test-data note below) and add it to the cart.
3. Send:
   ```graphql
   mutation {
     changeCartItemQuantity(command: { lineItemId: "<lineItemId>", quantity: 7 }) {
       items { id quantity extendedPrice { amount } }
       validationErrors { errorCode }
     }
   }
   ```
4. Read the response and re-query the cart.

## Expected vs Actual
- **Expected:** With `packSize = 6`, quantity `7` is **rejected or rounded up to 12** (nearest valid pack multiple); the stepper increments in packs of 6. BL-CART-006.
- **Actual:** `quantity = 7` accepted verbatim; `extendedPrice = 69.93` (9.99 × 7); `validationErrors` empty — no reject, no round-up, no soft warning.

![Non-multiple quantity accepted](screenshots/CART-055-FAIL-non-multiple-qty-accepted.png)

## Impact
Data-integrity / fulfillment defect: orders can be placed for quantities the product's pack constraint forbids, breaking downstream packing/fulfillment assumptions. P1 per BL-CART-006 (`[P1-data]`), violated at the API write boundary with no signal to any client.

## Root cause (hypothesis)
`changeCartItemQuantity` does not consult the product's pack-size / MOQ metadata when validating the requested quantity; the pack-multiple constraint is not enforced (nor rounded) server-side. The handler should reject or round the quantity to a valid pack multiple before persisting.


## Re-verification 2026-08-26 — still reproduces, identical numbers

Backlog triage, Platform `3.1061.0` (draft: `3.1043.0`). Pack product resolved live by code
(`QA-PACK-001` — `packSize 6`, `minQuantity 6`, $9.99), no hardcoded id.

```
addItem quantity:6                    -> 200, quantity 6, extendedPrice 59.94, validationErrors []
changeCartItemQuantity quantity:7     -> 200, quantity 7, extendedPrice 69.93, validationErrors []
```

Quantity **7** is still stored verbatim against a `packSize 6` product — not rejected, not rounded to 12,
with **no** `validationErrors` and no soft warning. `extendedPrice 69.93` = 9.99 × 7 confirms the
non-multiple quantity is fully priced through, exactly the figures this draft recorded. BL-CART-006 still
unenforced at the xAPI write boundary. Test cart cleared afterwards.

**The test-data note in this draft is now OBSOLETE — the defect is not.** It flagged
`@td(PROD_PACK_SIZE)` as resolving to a stale GUID `49567c47…`; that alias has since been cleaned up and
now resolves by **business key** (`product_id: PROD-103` → SKU `QA-PACK-001`) with no runtime GUID pinned in
the committed base, per the all-envs-own-aliases rule. No cleanup action remains from this draft.

**Still not filed to the tracker.**

## Test-data note (not part of the defect)
`@td(PROD_PACK_SIZE)` resolves to a stale product GUID `49567c47…`; the live pack product during verification was `de380f81…` (QA-PACK-001, packSize 6, unit 9.99). Flag as a `test-data/aliases.<env>.json` cleanup for the pack alias — independent of this bug.

## Fix Routing
- **Repo:** `vc-module-x-cart` (xAPI cart mutations) — `changeCartItemQuantity` quantity validation against product pack-size/MOQ.
- **Layer:** backend (GraphQL xAPI). Reproduce with a pack-size-6 product at qty 7 + follow-up cart read; a green fix rejects or rounds to 12. Preserve BL-CART-006.
