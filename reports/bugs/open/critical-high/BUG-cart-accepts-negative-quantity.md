# Cart xAPI accepts a negative line quantity `[P1]` `[BL-CART-001]`

**Env:** vcst-qa @ Platform 3.1043.0, Theme 2.53.0-pr-2368
**Re-confirmed:** 2026-08-26 on Platform `3.1061.0` (backlog triage, xAPI probe) — **still reproduces**. `changeCartItemQuantity(quantity: -1)` returns `200` with the line item echoed at **`quantity: -1`** and only a soft `validationErrors[{errorCode:"PRODUCT_MIN_QTY", errorMessage:"Product quantity -1 is less than minimum 0"}]` — the mutation is *not* rejected. Caveat: this probe ran on the **anonymous** cart path (the token resolved `me.userName: "Anonymous"`), so the authenticated path in the original STR was not re-exercised. Not filed to the tracker.
**Case:** CART-036 (suite 028) — split from the former combined CART-036 into CART-036/CART-065/CART-066 (one invalid-input class each); this defect is carried by the negative-quantity case, CART-036 (renumbered from CART-036a to keep lineage with this trace/report)

## Summary
`changeCartItemQuantity` accepts `quantity: -1` and persists it: HTTP 200, **no top-level `errors[]`**, and a follow-up cart read confirms the line quantity is stored as `-1`. Only a soft `validationErrors[]` entry (`PRODUCT_MIN_QTY`) is returned, and totals still price the line as if quantity were 1. A negative quantity below the product minimum must be hard-rejected server-side.

## Steps to Reproduce
1. Authenticate (`@td(USER_DEFAULT)`); ensure a cart with one line item exists (`live-discover` first available product, or `@td` a known SKU).
2. Send:
   ```graphql
   mutation {
     changeCartItemQuantity(command: { lineItemId: "<lineItemId>", quantity: -1 }) {
       items { id quantity }
       validationErrors { errorCode }
     }
   }
   ```
3. Read the response, then re-query the cart to confirm the persisted quantity.

## Expected vs Actual
- **Expected:** A quantity below the minimum (and any `quantity < 1`) is **hard-rejected** — the mutation returns a blocking error and the stored quantity is left unchanged. Per BL-CART-001, out-of-range quantity must be rejected or capped, not silently accepted.
- **Actual:** HTTP 200, no top-level `errors[]`; the line persists with `quantity = -1` (confirmed on re-read); only a **soft** `validationErrors[]{ errorCode: PRODUCT_MIN_QTY }` is present and totals price the line as quantity 1.

![Invalid quantity accepted, display not reverted](screenshots/CART-036-FAIL-invalid-qty-display-not-reverted.png)

## Impact
Data-integrity defect at the cart write boundary. A `-1` line corrupts cart state and downstream calculations (a negative unit can offset legitimate totals), and the soft-only signal means no client is forced to correct it. P1 because it is a P0-revenue invariant (BL-CART-001) violated at the API layer.

## Root cause (hypothesis)
`changeCartItemQuantity` treats the minimum-quantity check as a non-blocking `validationErrors` warning rather than a mutation-failing guard, and applies no floor on the quantity value. The handler should reject (or clamp to the minimum) any `quantity < min` before persisting the line.

## Fix Routing
- **Repo:** `vc-module-x-cart` (xAPI cart mutations) — `changeCartItemQuantity` command handler / cart validation.
- **Layer:** backend (GraphQL xAPI). Reproduce at the mutation + a follow-up cart read; a green fix returns a blocking error (or clamps) and leaves no negative quantity persisted. Preserve BL-CART-001.
