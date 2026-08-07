# Keyword search returns ZERO results for every query while currency is EUR — P1

**Env:** vcst-qa @ Platform 3.1057.0-pr-3095 + XCatalog 3.1016.0-pr-106-3559, Theme 2.55.0-pr-2417

## Summary
With the storefront currency set to **EUR**, keyword search returns *"didn't return any results"* for every query tried — including queries that return plentiful results in USD. Catalog **browse** on the same EUR session works correctly and shows real EUR prices, so this is specific to the keyword-search path, not to EUR pricing as a whole. Search is a Critical Revenue Flow, and this makes it unusable for any non-USD shopper.

## STR
1. Open the storefront as a guest (no sign-in needed).
2. Search `laptop` in the header search — note the result count.
3. Switch storefront currency to **EUR** via the header switcher.
4. Search `laptop` again.

## Expected vs Actual
- **Expected:** the same (or a currency-filtered subset of) matching products; EUR-priced products certainly appear, since browse shows them.
- **Actual:** `Sorry, your search for … didn't return any results` — **0 results**, for every keyword tried.

| Currency | Query | Result |
|---|---|---|
| USD | `laptop` | **123 results** |
| EUR | `laptop` | **0 results** |
| EUR | `Animal Crossing New Horizons` | **0 results** |
| EUR | `/catalog` browse (control) | **works** — real EUR prices: €78.00, €455.00, €59.00, €22.49, €3.19 |

![EUR search returns zero results](screenshots/BUG-search-eur-zero-results.png)

## Root cause (suspected — needs backend confirmation)
The search path likely applies a currency-scoped price filter/sort against the search index, which holds no (or no EUR-currency) price documents, so every candidate is filtered out — while the browse path resolves prices at read time and is unaffected. **Not yet confirmed**; the deciding check is an xAPI `products` query with `currencyCode: "EUR"` plus a keyword vs the same query without the keyword. Confirm before assigning a repo — it could sit in `vc-module-x-catalog` (query building) or in the index/price-document population rather than in the storefront.

## Scope note
Discovered incidentally during `/qa-triage-results REG-2026-08-06-0937` while verifying CAT-054 — **no test case asserts it**. Suite 002 is a Product Detail suite; the search suites (004, 005, 061) exercise search only in the default currency. This is therefore also a **coverage gap**: no case covers search under a non-default currency.

## Confidence
**Live-reproduced with a USD/EUR A/B control on one session**, so the symptom is solid. Breadth is based on 2 keywords + 1 browse control — worth widening (more keywords, another non-USD currency such as GBP) before filing to the tracker.

## Refs
Related: `BUG-non-usd-price-zero-display.md` (PDP renders `€0.00` for products with no EUR price) — plausibly a shared root cause in currency-scoped price resolution; triage together.

## Fix Routing
- **Repo:** ambiguous — `vc-module-x-catalog` (search query / currency filter) or the search-index price population. Confirm root cause first.
- **Kind:** module (backend)
