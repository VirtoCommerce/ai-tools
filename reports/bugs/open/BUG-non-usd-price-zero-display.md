# PDP shows literal `€0.00` / `£0.00` for products with no target-currency price list — P2

**Env:** vcst-qa @ Platform 3.1043.0, Theme 2.53.0-pr-2368

## Summary
When the storefront currency is switched to EUR or GBP, products that have no price list in the target currency render a literal `€0.00` / `£0.00` on the PDP with no guard or warning. The **cart is correctly guarded** (shows "The product is no longer available for purchase", disables the qty stepper and Place order) — the defect is specifically the **PDP**, which is unguarded and misleadingly presents the item as free.

## STR
1. Sign in and open any product PDP that only has a USD price list.
2. Switch storefront currency to EUR (or GBP — the store has no GBP price list at all).
3. Observe the PDP price field.

## Expected vs Actual
- **Expected:** PDP hides the price / shows "price on request" / "unavailable in this currency" — consistent with the cart guard.
- **Actual:** PDP shows `€0.00` (or `£0.00`) as a real price, with no warning. (Cart, by contrast, is correctly guarded.)

## Evidence
![PDP EUR zero price](screenshots/CART-050-pdp-eur-zero-price.png)

## Refs
BL-CART-004, BL-PRICE-005. A missing target-currency price must not fall back to a zero literal on the customer-facing price display.

## Root cause — corrected 2026-08-06, the fix is probably NOT in the theme

Earlier text (kept for history): *"PDP price component renders the numeric amount unconditionally; the missing-price condition that the cart already handles is not applied at the PDP price display."* That is **wrong about where the defect lives.**

The UI-kit price atom already guards correctly — `client-app/ui-kit/components/atoms/price-display/vc-price-display.vue` is:

```vue
<span>{{ value?.formattedAmount ?? "N/A" }}</span>
```

The `"N/A"` fallback fires only when the Money object is **nullish**. But the xAPI returns a **present** Money with `amount = 0` for a product with no price in the requested currency — verified live: `products(currencyCode:"EUR", query:"laptop")` returns `totalCode=149` with `price.list.amount = 0`. So `value?.formattedAmount` is the string `"€0.00"`, never nullish, and the guard is **unreachable**.

This also explains the mixed widget rendering: `MAMMOET SHOT GLASS → From N/A` is a product whose price object is genuinely **null** (in no price list at all), while the four `€0.00` items are in a *USD* price list and get a zero-amount Money resolved in EUR.

**So the likely fix is upstream:** return `null` (or omit the price) rather than a zero-amount Money when no price list covers the requested currency — the theme then renders `N/A` with no change at all. Deciding this needs a product call on the API contract (null vs zero Money), which is why routing is now ambiguous rather than confidently `vc-frontend`.

Not yet checked: whether an EUR **price list assignment** (priority / catalog-vs-store scope / conditions) covers these products — per the Pricing troubleshooting guide, assignment is what selects the applicable list. Worth confirming before assigning the fix, since a mis-scoped assignment would be configuration rather than code.

## Still reproducing — re-confirmed 2026-08-06 (REG-2026-08-06-0937, case CAT-054)

Unfixed **two platform versions later**: originally filed against Platform 3.1043.0 / Theme 2.53.0-pr-2368, still present on **Platform 3.1057.0-pr-3095 / Theme 2.55.0-pr-2417**. Regression suite 002 has failed on this signature in **3 runs across ~3 weeks** (REG-2026-07-14-0018, REG-2026-07-24-2121, REG-2026-08-06-0937) and has never passed — it is persistent, not flaky.

Re-confirmed live on `ALCE0128` ("Animal Crossing New Horizons", USD-only): USD `$59.99` → switch to EUR → `Price: €0.00`, while the stock chip still reads `In stock 462`.

**The purchase guard holds — severity stays P2, not Critical.** In EUR all three qty controls are disabled (`Decrease quantity`, `Product quantity`, `Increase quantity` — the stepper *is* add-to-cart on this PDP; there is no separate button), so nothing reaches the cart. A/B control proving the gating is price-driven and not guest-session-driven: Canon Imageclass (`€78.00`, real EUR price) renders an **enabled** stepper in the same EUR session.

**New evidence — the correct rendering already exists in the codebase.** In the EUR "Customers bought together" widget on this same PDP, one item renders `From N/A` while four render `€0.00`:

```
MAMMOET SHOT GLASS …      From N/A     ← correct path
Vintage Colorado Hoodie   €0.00
Configurable Hat          From €0.00
AGENT-TEST-Ring-Txt-Cfg   From €0.00
Custom T-shirt            From €0.00
```

![EUR widget: €0.00 vs the correct From N/A](screenshots/BUG-non-usd-price-zero-vs-NA-widget.png)

So the fix is to route the PDP (and widget) price display through the same missing-price path that already produces `N/A` — this is inconsistent rendering, not a missing capability. The `€0.00` is **widespread across widgets**, not confined to `ALCE0128`.

**Better oracle anchors than the ones cited above:** **BL-PRICE-006** ("No prices should fall back to $0 — they should show as 'Unavailable' or hide the Add to Cart button") and **BL-CROSS-001** (violation signal: "Product displays `$0.00`"). Note BL-CROSS-001's other two violation signals — "Add to Cart remains active" and "order can be placed for $0" — do **not** apply here; only the display half is violated.

**Scope sharpened (2026-08-06) — the hide-path works everywhere EXCEPT the PDP.** A same-session observation that search/listing returns "0 results" in EUR was initially mistaken for a search defect. It is not: the xAPI `products` query returns **`totalCount=149` in both USD and EUR** for the same keyword, with EUR rows carrying `price.list.amount = 0`. The storefront then correctly **hides** unpriced products from listing and search — which is exactly BL-PRICE-005's "products without prices in the new currency disappear". `laptop` matches only USD-only products (LT-001, AGENT-TEST-CFG-013, ALCOE2497 …), so 0 *visible* results is correct behaviour, and the store does have 15 EUR price lists whose products (Canon `€78.00` etc.) do appear.

That makes this bug **narrower and better-evidenced**: the missing-price guard is applied on listing/search (hide) and in the cart (block), but **not on the PDP reached by direct navigation**, which renders the `€0.00` literal instead. Every other surface handles it; only the PDP leaks the zero.

## Fix Routing
- **Repo:** **ambiguous** — most likely `vc-module-x-catalog` / the pricing resolution that builds the price object (return `null`, not a zero-amount Money, when no price list covers the requested currency). `vc-frontend` is the fallback if the API contract is deliberately "always return a Money", in which case the PDP needs its own `amount === 0` guard rather than relying on the nullish one.
- **Kind:** module (backend) — pending the contract decision above
- **Confirm first:** whether an EUR price-list **assignment** covers these products (config axis), and whether the zero-amount Money is intended API behaviour.
