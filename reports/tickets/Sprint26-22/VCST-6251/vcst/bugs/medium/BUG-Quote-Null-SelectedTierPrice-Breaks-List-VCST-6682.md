# BUG: A REST-created quote item with no selected tier price breaks the buyer's xAPI quotes list — `[Medium]`

## Status: CONFIRMED
**Found by:** agent — testing VCST-6251
**Tracker:** VCST-6682 (Relates VCST-6251)
**Env:** vcst @ Platform 3.1093.0-pr-3154-4607, Quote 3.1006.0-pr-168-9b3f (also vcptcore, Quote 3.1005.0)

## Summary
`POST /api/quote/requests` accepts items without `proposalPrices`, leaving `selectedTierPrice` null. The totals calculator then throws, so the buyer's `Query.quotes` (every filter), `quote(id)` and admin `GET /api/quote/requests/<id>` all fail — one bad quote hides all the buyer's quotes.

## STR
1. As the buyer, `Query.quotes` → 200, no errors.
2. `POST /api/quote/requests` for that buyer/org with one item and no `proposalPrices` → 200.
3. As the buyer, `Query.quotes` → 200 + `errors[]` NULL_REFERENCE, `data.quotes = null`.
4. `quote(id)` → NULL_REFERENCE; admin GET by id → 500.

## Expected vs Actual
Expected: list resolves (`selectedTierPrice` is nullable in the schema; BL-GQL-001). Actual: as above; 2/2 REST quotes, 0/1 xAPI quotes. Evidence `bugs/evidence/quotes-nullref-1..5-*.json`.

## Layer Validation
| Layer | Result |
|---|---|
| REST | FAIL (create accepts; GET by id 500) |
| xAPI | FAIL (NULL_REFERENCE) |
| Admin / Storefront | not exercised (same GET / same query — inference) |

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 4 — REST/Data (shared totals calculator)
- **Suggested repo:** VirtoCommerce/vc-module-quote · **repoKind:** module · **Ownership hint:** platform
- **RCA anchor:** `QuoteConverter.cs:452` (`EvaluateDiscount`, `x.SelectedTierPrice.Price` with no null check); create path `QuoteModuleController.cs:97-108`
- **Routing confidence:** MEDIUM (repo + site HIGH; fix location — null guard vs REST validation — is the developer's call) · auto-fix labels withheld (API-only repro)
- **Need hotfixes:** not set — vc-module-quote is in neither v15 nor v16
