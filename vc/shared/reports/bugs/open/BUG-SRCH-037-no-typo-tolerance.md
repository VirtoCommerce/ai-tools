# BUG-SRCH-037 — Storefront does not enable fuzzy matching; misspelled queries return zero results

## Summary

Misspelled queries (e.g. `laptp`, `lapptop`, `hoddie`, `bikee`) on the storefront search page return zero results and a generic "Sorry, ... didn't return any results" empty state, instead of typo-tolerant results or a "Did you mean..." suggestion. The empty state is graceful (no crash / layout break), but the product behavior is significantly worse than what the xAPI already supports.

Root cause confirmed at source level: **the storefront never sends `fuzzy: true` to the xAPI**. The xAPI fully supports fuzzy matching and returns high-quality results when the flag is set.

## Severity

**Low-Medium (enhancement / config gap).** Not a regression — this code path has never shipped typo tolerance. BL-SRCH-002 treats "Did you mean..." as *optional* (`[P2-ux]`), so the storefront is arguably compliant with the hard parts of the invariant. However, the fix is a one-line change with high UX upside, so it is worth filing.

Suggested JIRA classification: **Story / Enhancement, component "Storefront → Search"**.

## Verdict Matrix Applied

- Configuration oversight (one-line fix)? **Yes — frontend side.**
- Missing product feature needing dev work? **Partially — proper "Did you mean..." UI with query re-suggestion is a separate, larger feature.**
- Aspirational CSV spec beyond intended capability? **No — xAPI already supports it. Test assertion only over-strict re: `[ASSERT] 'Did you mean' suggestion` text.**

**Resolution:** file as a low-severity enhancement for the simple fuzzy-default fix. Defer any actual "Did you mean..." UX feature to a separate feature request.

## Environment

- URL: `https://vcst-qa-storefront.govirto.com`
- Storefront build: `2.47.0-pr-2225-130fb04d` (homepage footer) / `2.47.0-alpha.2310` (search page footer)
- Store: `B2B-store`, culture `en-US`, currency `USD`
- Virtual catalog subtree: `fc596540864a41bf8ab78734ee7353a3`
- Session: authenticated (`Agent Chrome`, slot 1) + repeated anonymously via direct `POST /graphql` — same results
- Browser: Chromium 147 via `playwright-chrome`, viewport 1920x1080

## Steps to Reproduce

1. Navigate to `https://vcst-qa-storefront.govirto.com/search?q=laptp`
2. Observe heading: `Your search for laptp returned the following` / `There are no results found`
3. Navigate to `https://vcst-qa-storefront.govirto.com/search?q=laptop` (correct spelling)
4. Observe 158 results
5. Compare — the two queries differ by one deleted character, yet one shows 158 hits and the other shows zero.

## Typo Query Matrix

Live via `POST /graphql` with the storefront's `SearchProducts` query, same filter string as the real storefront request:

| Query | Band | `noFuzzy` totalCount (storefront default) | `fuzzy=true level=1` totalCount | `fuzzy=true level=2` totalCount | Fuzzy L1 top hit |
|-------|------|------------------------------------------:|--------------------------------:|--------------------------------:|------------------|
| `laptop` | baseline correct | **158** | 158 | 165 | HP LaserJet Pro ... |
| `laptp` | 1-char deletion | **0** | **158** | 484 | HP LaserJet Pro ... |
| `lapptop` | 1-char duplication | **0** | **158** | 158 | HP LaserJet Pro ... |
| `bike` | baseline correct | 96 | 142 | 543 | Waterproof Bicycle Phone Holder |
| `bke` | 1-char deletion | **0** | 852* | 1026* | Cold Brew Coffee Machine (noisy) |
| `bikee` | 1-char duplication | **0** | **96** | 317 | XLC Beluga, E-Bike rack |
| `byke` | phonetic (2-char) | **0** | 103 | 828 | AGENT-TEST-Config-Bike-... |
| `chair` | baseline correct | 399 | 753 | 818 | Kneeling Chair YDM-1457 |
| `chai` | 1-char deletion | **457** | 2867 | 2887 | (already matches as substring) |
| `hoodie` | baseline correct | 4 | 4 | 105 | Vintage Colorado Hoodie |
| `hoddie` | 1-char swap | **0** | **4** | 124 | Vintage Colorado Hoodie |
| `stok` | phonetic (→ stock) | **0** | 220 | 637 | TEST stock < min |
| `zzzzzzz` | garbage | 0 | **0** | **0** | (correctly empty) |
| `qwxcvb` | garbage | 0 | **0** | **0** | (correctly empty) |

`*` 3-char inputs at fuzzy level 1-2 over-match because Damerau-Levenshtein ≤ 2 on a 3-char token subsumes most short tokens. The frontend should clamp fuzzy-level by query length to avoid this (e.g. fuzzy=1 only when `query.length ≥ 4`).

Autocomplete dropdown behavior (typing `laptp` into the search box):
- Main body: "Nothing was found for your query. Try adjusting your search." + `CHECK ALL PRODUCTS` button.
- "HINTS" section shows `laptop`, `printer` — but these are NOT "Did you mean..." suggestions; they are **the authenticated user's own search history** (GraphQL `searchHistory` query, auth-only). Typing `zzzzzzz` shows the exact same hints, which proves they are unrelated to the current query. An anonymous visitor with no search history would see nothing useful.

Evidence screenshots:
- `reports/regression/REG-2026-04-20-1000/invest-evidence/invest-SRCH-037-01-laptp-empty-state.png` — full-page empty state for `/search?q=laptp`
- `reports/regression/REG-2026-04-20-1000/invest-evidence/invest-SRCH-037-02-laptp-autocomplete-dropdown.png` — autocomplete dropdown for `laptp`
- `reports/regression/REG-2026-04-20-1000/invest-evidence/invest-SRCH-037-03-zzzzzzz-autocomplete.png` — identical dropdown for `zzzzzzz`, proving the HINTS are search-history, not query suggestions

## Root Cause — confirmed at source

**xAPI (unchanged, works as documented):**
The `products` query accepts `fuzzy: Boolean` and `fuzzyLevel: Int` parameters. Confirmed live on `POST /graphql`: passing `fuzzy: true, fuzzyLevel: 1` recovers all typo-affected searches with top-hit matching the correct-spelling baseline.

**Frontend (the defect):** `VirtoCommerce/vc-frontend` branch `dev`
- `client-app/shared/catalog/types/search.ts` — `ProductsSearchParamsType.fuzzy?: boolean; fuzzyLevel?: number;` (optional).
- `client-app/core/api/graphql/catalog/queries/searchProducts/searchProductsQuery.graphql` — declares `$fuzzy: Boolean, $fuzzyLevel: Int` and passes both to `products(...)`.
- `client-app/core/api/graphql/catalog/queries/searchProducts/index.ts` — `searchProducts()` destructures `fuzzy, fuzzyLevel` from params and forwards to the query.
- **No caller in the repo ever sets `fuzzy` or `fuzzyLevel`.** GitHub code-search (`repo:VirtoCommerce/vc-frontend fuzzy:true` and variants) → 0 hits in callers. Grep for "did you mean" / "didYouMean" / "did_you_mean" → 0 hits anywhere.

Network capture from the live storefront (`browser_network_requests`) confirms: the `SearchProducts` operation fires without `fuzzy`/`fuzzyLevel` in the variables block. The xAPI treats missing flags as `fuzzy: false` (default).

## Cross-Check vs. Business Invariant BL-SRCH-002

> "When a search query returns zero results, the storefront must display: (1) a clear 'No results found for [query]' message, (2) **optionally**, spelling suggestions or 'Did you mean...' alternatives, (3) a fallback — popular products or categories." — `knowledge/business-logic.md` § BL-SRCH-002 `[P2-ux]`

| Clause | Status | Note |
|--------|--------|------|
| (1) Clear "No results for [q]" message | ✅ PASS | "Sorry, your search for \"laptp\" didn't return any results" + "There are no results found" |
| (2) Spelling suggestions / Did you mean | ⚠️ missing (explicitly optional) | not implemented anywhere in vc-frontend |
| (3) Fallback — popular products or categories | ⚠️ partial | only a "RESET SEARCH" button; no popular-products fallback |
| Page layout intact, no error/500 | ✅ PASS | |

**BL-SRCH-002 marks (2) as "optionally"**, so strictly speaking the storefront is compliant. The test case `SRCH-NEW-037` has `[ASSERT] Verify results page shows products related to 'laptop' OR a 'Did you mean' suggestion` — which elevates an optional clause in the rule to a hard assertion. Test spec is stricter than the rule.

## Recommended Fix (Low-cost, high UX value)

**Option A (minimal, recommended):** Default `fuzzy=true, fuzzyLevel=1` in the storefront's search-page caller only when `keyword.length >= 4`. One-line change in the composable that invokes `searchProducts()` from the `/search` route. This recovers 1-char typos (`laptp`, `lapptop`, `hoddie`, `bikee`) without noise. Clamping to `length >= 4` avoids the 3-char over-match problem (`bke` → 852 unrelated results).

**Option B (fuller):** Add a post-hoc "Did you mean `<suggestion>`?" UI element on the zero-results page. This requires either a new xAPI suggester endpoint (`productSuggestions` currently returns `[]` for typos — backend work required) or a client-side approach that re-issues the same query with fuzzy on and reads back the dominant matching term.

**Option C (do nothing):** Accept that BL-SRCH-002 says "optionally" and update the test case to a soft assertion. Not recommended because Option A is essentially free.

## Suggested JIRA Ticket

- **Title:** `Storefront search does not send fuzzy parameter — misspelled queries return zero results`
- **Type:** Story / Enhancement (NOT Bug)
- **Priority:** Low-Medium (depends on whether search traffic typo rate is tracked)
- **Component:** `Storefront > Search` (vc-frontend)
- **Labels:** `storefront`, `search`, `fuzzy-matching`, `ux`, `UX-improvement`
- **Not a bug on:** xAPI, vc-module-search, admin settings — all capability exists already.
- **Fix location:** `vc-frontend/client-app/core/api/graphql/catalog/queries/searchProducts/index.ts` or the calling composable in the search page.
- **Affected test case:** `regression/suites/Frontend/search/004-search-core.csv` row `SRCH-NEW-037` — assertion should be softened to match BL-SRCH-002's "optionally" language until/unless this enhancement ships.

## Verification Checklist (once fix is shipped)

- [ ] `POST /graphql SearchProducts` network request contains `"fuzzy": true, "fuzzyLevel": 1` in variables for queries with `length >= 4`
- [ ] `/search?q=laptp` → 158 results (matches baseline `laptop`)
- [ ] `/search?q=hoddie` → returns Hoodie products
- [ ] `/search?q=zzzzzzz` → still 0 results (no false positives)
- [ ] `/search?q=bk` or `/search?q=abc` → fuzzy NOT applied (short-query clamp working)
- [ ] Autocomplete dropdown for typo queries shows inline product previews (stretch goal)

---

**Investigator:** qa-frontend-expert
**Date:** 2026-04-22
**Related tests:** suite-004 (Frontend/search/004-search-core.csv) case SRCH-NEW-037
**Regression run:** REG-2026-04-20-1000
