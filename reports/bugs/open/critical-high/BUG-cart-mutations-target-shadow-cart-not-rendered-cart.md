# BUG: Cart mutations target a shadow cart, so every remove control silently no-ops — High

**Env:** vcst-qa @ storefront 2.57.0-pr-2396-5a67-5a677230

## Summary
When an account owns more than one non-`SavedForLater` cart, the storefront **renders one cart but
mutates another**. Every removal control — *Clear cart*, *Remove selected*, per-item *Remove from
cart* — returns HTTP 200 with no GraphQL `errors[]` and leaves the displayed cart untouched across a
full page reload. The customer cannot remove an item they do not want.

## Steps to reproduce
1. Sign in as an account that has a second, named cart alongside its `default` cart.
   (Observed on `AGENT-TEST-vip@test.virtocommerce.com`, which held a stray cart named `probe-ship`.)
2. Go to `/cart` — the page renders the *named* cart's line items and totals.
3. Click **Clear cart** → **Yes**. Reload `/cart`.
4. Click **Remove selected**. Reload `/cart`.
5. Click the per-item **Remove from cart** (×). Reload `/cart`.

## Expected vs Actual
| | |
|---|---|
| **Expected** | Each control removes the line item(s) from the cart the page is showing. |
| **Actual** | All three controls no-op. Cart still shows 2 items / `$20.00` after each, verified by full reload. No error, no toast, no console failure visible to the user. |

## Root cause evidence
`RemoveCartItems` is sent for a line item belonging to the **rendered** cart, but the response body
is a **different, empty** cart:

```
request  lineItemIds: ["1495cb5e-328f-48db-b2aa-8c43a4657fb6"]  userId: 95a30901-…
response HTTP 200, errors: undefined
         data.removeCartItems.id           = 4380384c-14d6-44d0-8748-142d610ab46c
         data.removeCartItems.itemsQuantity = 0
         data.removeCartItems.items         = []
         data.removeCartItems.subTotal      = 0
         validationErrors: [{ errorCode: "ALL_LINE_ITEMS_UNSELECTED", … }]
```

Enumerating the account's carts shows the split:

```
carts(storeId:"B2B-store" userId:"95a30901-…") → totalCount 3
  8723e53e-…  name=probe-ship      qty=2  sub=20   ← RENDERED by the storefront
  ecea7721-…  name=Saved for later qty=1  sub=150
  4380384c-…  name=default         qty=0  sub=0    ← TARGETED by every mutation
```

The same signature appears on `AddOrUpdateCartShipment`: the shipping address the user picks is
written to `default` while the page keeps showing `probe-ship`, so the address field stays on
*"Please select a shipping address"* and **Place Order never enables**. Three unhandled
`ApolloError: Error trying to resolve field 'addOrUpdateCartShipment'` accompany this — a GraphQL
error delivered inside an HTTP 200.

Deleting the stray cart resolves it completely:
`removeCart(command:{cartId:"8723e53e-…", userId:"95a30901-…"})` → `true`; the storefront then
renders the real `default` cart, the previously "lost" shipping address is present on it, and
checkout proceeds normally.

## Impact
Two distinct customer-visible failures from one cause:
- **Cannot remove items** — the shopper is stuck with the cart contents.
- **Cannot check out** — the shipping address cannot be attached, so *Place Order* stays disabled.

Both fail **silently**: 200 responses, no `errors[]` at the transport layer, no user-facing message.
A shopper has no way to understand or work around it.

## Notes
- `ALL_LINE_ITEMS_UNSELECTED` on the empty `default` cart is a *symptom*, not the cause — an empty
  cart trivially has no selected line items.
- Query-side and mutation-side cart resolution disagree; the fix should make them agree, and a
  mutation whose target cart does not contain the referenced line item should not report success.
- Whatever creates a stray named cart is a separate question; the defect here is that its existence
  silently breaks the default cart's UI.

**Found by:** REG-2026-09-01-2050 (suite 083d, incidental — out of scope of the executed cases)
**Case:** none — discovered while setting up `MSN-E2E-002`
