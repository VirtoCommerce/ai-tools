# Active carts widget doubles a customer's item count after a storefront currency switch — P2

**Env:** vcptcore-qa @ Theme `2.56.0-pr-2416-efad-efadb479`, SalesRep `3.1004.0-pr-10-c9f8`, Cart `3.1009.0`, Xapi `3.1016.0`
**Related:** VCST-5588 · [vc-frontend#2416](https://github.com/VirtoCommerce/vc-frontend/pull/2416) · [vc-module-sales-rep#10](https://github.com/VirtoCommerce/vc-module-sales-rep/pull/10)

## Summary

Switching the storefront currency — with no change to any cart — doubles the **Active carts** figure on the sales rep's customer page and on the Hub dashboard. Six units held by one customer are reported as twelve. The switch writes the cart lines into the cart of the new currency and leaves the old cart populated, and the metric sums quantities across carts of **all** currencies, so the same line is counted once per currency.

## STR

1. Sign in as a sales rep (`SR_REP_PRIMARY` / agent-test-sr-primary@example.com) in the context of a served organization (ORG-005 / `AGENT-TEST-Org-BuildRight-20260310`). Make sure their cart is empty.
2. Set the storefront currency to **EUR** and add **6** units of SKU `261082` (a product with a EUR price; `151349` fails with "Price is invalid").
3. Open that customer's page `/company/my-customers/23525b44-f0d0-43a4-b45e-b162080a4d29`.
   → **Active carts = 6 items / 0 not for checkout / 6 items this week.** Correct.
4. Switch the header currency to **USD**. Change nothing else — do not open the cart, do not add or remove anything.
5. Reload the same customer page.

## Expected vs actual

| | Expected | Actual |
|---|---|---|
| Customer page, Active carts | `6 items` (unchanged — the customer still holds 6 units) | **`12 items`** |
| `…this week` delta | `6 items this week` | **`12 items this week`** |
| `count` in the same payload | `1` cart | **`2`** carts |
| Dashboard roll-up (all served orgs) | `10 items` | **`16 items`** |

`salesRepCustomerCartStatistics` returns the inflated figure for **both** `currencyCode: "USD"` and `currencyCode: "EUR"`, so the storefront is reporting the API faithfully.

## Root cause

The currency switch duplicates the cart lines instead of moving them:

```
POST /api/carts/search — organizationId = BuildRight
cartId 3a3b5148   cur EUR   sku 261082   qty 6   selected true   modified 08:56:52
cartId c6374396   cur USD   sku 261082   qty 6   selected true   modified 08:57:38   <- written by the switch
```

Combined with a currency-agnostic quantity sum in the statistics resolver, the one line is counted twice.

## Isolation

| Question | Test | Result |
|---|---|---|
| Is the count currency-scoped at all? | EUR cart = 6 units, USD cart empty; read both currency views | USD view **6 items** / $40.92, EUR view **6 items** / €33.00 — quantity is currency-agnostic, only the money converts |
| Is this the statistics cache? | every reading taken on an unused cache key | Ruled out — the inflated value holds for minutes and survives cold keys |
| Does it keep growing? | switch a second time, USD → EUR | Stays doubled — the target cart is overwritten, not appended; the ceiling is the number of store currencies |
| Does it heal on its own? | re-read with no user action | No — the duplicate line persists in the data until something clears it |
| Is it storefront-only? | compare the card against the GraphQL payload | Identical in both currencies — the figure arrives inflated |

## Which layer owns the fix

Two defensible readings; the call belongs with the module author, not QA:

1. **Cart layer** — a currency switch should *move* the lines, not copy them. Any consumer that walks a customer's carts double-counts; this widget is just where it surfaced first.
2. **Statistics resolver** — the query already takes `currencyCode`. If it filtered carts by it rather than only converting the money, the duplicate would be invisible and each currency view would describe the cart the rep can actually see.

By the letter of the PR's definition ("summed Quantity of the cart lines with `SelectedForCheckout = true`, across the carts in scope") **12 is arithmetically correct for the data as it stands** — which is why the fix has to be chosen deliberately rather than patched at the display layer.

## Evidence

- `reports/tickets/Sprint26-15/VCST-5588/screenshots/cust-1-buildright-eur-6items.png` — customer page, EUR, 6 items
- `reports/tickets/Sprint26-15/VCST-5588/screenshots/cust-2-buildright-usd-12items.png` — same page, USD, 12 items
- `reports/tickets/Sprint26-15/VCST-5588/screenshots/cur-1-cart-eur.png` / `cur-4-cart-usd-same-line.png` — the two carts holding the same line
- `reports/tickets/Sprint26-15/VCST-5588/screenshots/cur-2-dashboard-eur-10items.png` / `cur-3-dashboard-usd-16items.png` — the dashboard roll-up
- Evidence page: https://claude.ai/code/artifact/3e99a3f0-1850-49d5-b79b-bc7c493e6b93

## Fix Routing

- **Repo:** `vc-module-sales-rep` (statistics resolver) and/or `vc-frontend` + Cart module (currency-switch cart handling) — decide per the ownership question above.
- **Layer:** xAPI L3 (`salesRepCustomerCartStatistics`) / storefront L1 currency switch.
- **Not auto-fixable:** the correct behaviour is a product decision, not a localized defect. Cross-repo.

## Resolution

**Fixed** in `vc-module-sales-rep` PR [#10](https://github.com/VirtoCommerce/vc-module-sales-rep/pull/10), commit `e12a9074` "Cart per-currency filtering" — artifact `VirtoCommerce.SalesRep_3.1004.0-pr-10-e12a`.

`currencyCode` on `salesRepCustomerCartStatistics` became a **scope filter** rather than only a conversion target: a cart held in a currency other than the requested one no longer contributes to any figure. The storefront's mirror-on-switch behaviour (`ChangeCartCurrencyCommandHandler`) is unchanged by design — the duplicate cart still exists, it is simply no longer counted twice.

- **Verified:** 2026-08-19 on **vcst-qa** @ Theme `2.56.0-pr-2416-efad-efadb479`, SalesRep `3.1004.0-pr-10-e12a` (live version confirmed against the `vc-deploy-dev@vcst-qa` manifest pin).
- **Method:** RED→GREEN. RED = this report's own reproduction on `pr-10-c9f8` (vcptcore-qa, 6 → 12 items). GREEN = same STR on the fixed build, **3/3 consecutive** currency switches, the customer-page figure held at 7 items (pre-fix it would have read 14); per-currency API scoping confirmed with a filled EUR cart against an empty USD cart (EUR 7 / USD 0); dashboard roll-up 7 in both currencies.
- **Regression:** unselecting a line still moves units to "not for checkout" (0 items / 6 not for checkout), both surfaces agree, 0 console errors.
- **Evidence:** `reports/tickets/Sprint26-15/VCST-5588/evidence.html`
- **JIRA:** VCST-5588 → Tested

Known consequence, documented in the PR and not a defect: per-currency selection states can diverge, so a rep viewing in currency X sees that customer's X mirror, which only refreshes when the customer switches into X.

## Status: FIXED
