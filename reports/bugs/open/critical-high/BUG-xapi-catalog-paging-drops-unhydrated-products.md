# Catalog listing shows 3 products out of 3,569 — xAPI drops unhydrated index documents from each page without back-filling

## Status: CONFIRMED
**Found by:** manual · — none (not case-attributable) · reported by the frontend team, reproduced at xAPI + live storefront
**Archetype:** SILENT-DATA-LOSS

**Env:** vcst-qa @ Platform `3.1063.0`, XCatalog `3.1018.0`, Catalog `3.1042.0`, ElasticSearch8 `3.1007.0`, Theme `2.57.0-pr-2452-d1e4`

## Summary

On the default ("Featured") sort, the catalog listing renders **3 product cards under a heading that reads "Catalog 3,569 results"**, and infinite scroll then stops forever. xAPI returns 3 items for `first:16 after:"0"`, then **0 items** for `after:"16"`; the storefront correctly reads the empty batch as end-of-list and retires the scroll observer, so the rest of the catalogue is unreachable through the UI.

The cause is in xAPI, not the frontend. `RemoveNullCatalogProductsMiddleware` strips index documents that failed to hydrate from *each page after it has been cut*, and decrements `totalCount` by the same amount — it never back-fills the page. Switching the sort to Name A–Z returns a full 16/16 on every batch, because the affected documents no longer cluster at the top.

## Steps to Reproduce

**Storefront:** open the main nav → **SEE ALL PRODUCTS** (`/catalog`), anonymous, default sort. Observe 3 cards under "Catalog 3,569 results"; scroll to the footer — nothing further loads.

**xAPI (anonymous, no auth):**
```graphql
POST {{BACK_URL}}/graphql
query { products(storeId:"B2B-store" cultureName:"en-US" currencyCode:"USD"
                 first:16 after:"0") { totalCount items { id code } } }
```
Repeat with `after:"16"`, `"32"`, `"48"`. Then re-run `after:"32"` ten times.

## Actual Result

Live storefront network capture — the filter string is **identical** across all three runs; sort is the only variable:

| Run | `first` | `after` | `sort` | `totalCount` | items |
|---|---|---|---|---|---|
| A1 | 16 | `"0"` | *(Featured)* | 3572 | **3** |
| A2 | 16 | `"16"` | *(Featured)* | 3569 | **0** → observer retires, no further calls ever |
| C1 | 16 | `"0"` | `name-ascending` | 3585 | **16** |
| C2 | 16 | `"16"` | `name-ascending` | 3585 | **16** |

- **Rendered:** 3 cards on default sort (both loads); 32 cards after two batches on Name A–Z, still paging.
- **The sidebar contradicts the grid** — Accessories 2,985 · Security And Protection 551 · Phones 446, each individually larger than the entire visible listing.
- **`totalCount` is unstable within one page load** — 3572 then 3569 for one unchanged filter.
- **The same request is non-deterministic.** Ten identical `after:"32"` calls returned exactly **two** distinct result sets (6× `0 items / total 4610`, 4× `9 items / total 4619`) — ES round-robining two index copies.
- Console clean; no JS error. The stall is not a client-side crash.

## Expected Result

A page requesting `first: N` receives `N` items whenever `totalCount` says at least `N` remain, with a stable `totalCount`, so infinite scroll walks the whole catalogue.

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | PASS | Renders and paginates correctly; retiring the observer on an empty batch is right behaviour given a wrong response |
| 2. Backend Admin | N/A | Not an admin surface |
| 3. GraphQL xAPI | **FAIL** | 3/16 then 0/16; middleware drops items post-paging (below) |
| 4. Platform REST API | PASS | `POST /api/catalog/search/products` `{skip,take}` → **16/16 at every offset**, `take:64` → 64/64, `totalCount` stable at 4830. REST loads products from the DB by id, so it never sees the null hydration |

**Owning layer:** Layer 3 — GraphQL xAPI (xCatalog)

## Root Cause Analysis

**The dropper —** `vc-module-x-catalog` → `src/VirtoCommerce.XCatalog.Data/Middlewares/RemoveNullCatalogProductsMiddleware.cs`, in full:

```csharp
var missingItems = parameter.Results
    .Where(expProduct => expProduct.IndexedProduct is null)
    .ToArray();

foreach (var missingItem in missingItems)
    parameter.Results.Remove(missingItem);

parameter.TotalCount -= missingItems.Length;
```

It runs in the response pipeline *after* `SearchProductQueryHandler` has already cut the page (`:225` `result.Results = ConvertProducts(searchResult)`, `:226` `result.TotalCount = searchResult.TotalCount`, `:228` `await _pipeline.Execute(result)`). So a page of 16 that contains R unhydratable documents yields `16 − R` items — **the removed slots are never refilled from the next hits.**

The arithmetic matches every measurement exactly. With base total 4626, `returned = 16 − R` and `totalCount = 4626 − R` — and R agrees from both sides on every sample: `0 items/4610` → R=16,16 · `9 items/4619` → R=7,7 · `4 items/4614` → R=12,12. The page-size sweep at `after:0` obeys the same law: `first:8` → 4/4622 · `first:16` → 4/4614 · `first:32` → 4/4598 · `first:64` → 18/4580.

**The amplifier —** `src/VirtoCommerce.XCatalog.Data/Index/IndexSearchRequestBuilder.cs`:

```csharp
// :46  default sort — ONE clause, no unique tiebreaker
SearchRequest.Sorting = [new SortingField(ScoreSortingFieldName, true)];
// :78  WithPaging(skip, take) — straight from/size over that ordering
// :400 a caller-supplied sort REPLACES Sorting wholesale, also with no tiebreaker
if (sortFields.Count != 0) { SearchRequest.Sorting = sortFields; }
```

The default is `score:desc`, and on a match-all catalog browse **every document scores identically** — one total tie across the corpus. With no tiebreaker and two index copies, *which* documents land on a given page changes per request, which is why the same call alternates between 0 and 9 items.

**Why the sort matters:** the unhydratable documents cluster at the top of the tied default order. `name:asc` maps to the near-unique `name_{culture}` field (`:418`), scattering them across 3,585 positions — measured over 6 pages × 16: `name:asc` **96/96 lost 0** · default 43/96 · `priority:desc` 59/96 · `createddate:desc` 24/96. A keyword query (real varying scores) also pages perfectly.

Note that products fetched by `productIds` all resolve fine (20/20 for REST's store-catalog positions 0–19) — that is a *different* document set from the ones the score-sorted browse drops, so it is not evidence against the null hydration.

**Why `IndexedProduct` is null — documented prerequisite, not a mystery.** The xAPI Getting Started guide lists a required presetting: *Settings → Catalog → Search → **"Store serialized catalog objects in index"** → Rebuild the index* ([docs](https://docs.virtocommerce.org/platform/developer-guide/GraphQL-Storefront-API-Reference-xAPI/getting-started)). `IndexedProduct` is that serialized object. A document indexed without it hydrates to null and is silently stripped by the middleware. Consistent with the timeline: the Product index was rebuilt **2026-09-03T15:00:10Z** (`VirtoCommerce.Search.IndexingJobs.IndexationDate.Product`) and holds 5,002 documents, while scheduled indexing is **off** (`IndexingJobs.Enable = false`) — so that was a manual run. Not every document is affected (3–4 hydrate at the top, and `name:asc` returns a full 16/16), so this is a **partial** condition — some documents carry the serialized object and some do not — rather than the setting being globally off. Confirming the setting's current value needs the Catalog module's own settings endpoint; it is not in `/api/platform/settings`.

**This does not make it a config bug.** A misconfigured or half-built index should surface as an error or an empty result, not as a catalog that silently truncates itself to 3 products while reporting 3,569. The two code defects are what convert a recoverable index condition into invisible data loss.

## When was this introduced — no release broke it

Both defects are present in the module's **first commit**, `604273c8` "VCST-1352: add XCatalog module (#1)", **2024-07-17**, module manifest version **3.800.0**, first public release **3.807.0 (2024-08-29)**.

- `RemoveNullCatalogProductsMiddleware.cs` has **exactly one commit in its entire history** — the original one. Never modified.
- `IndexSearchRequestBuilder.cs`'s default-sort line is byte-identical from that first commit through today (verified at `604273c8`, `8d35c028`, `4912ccd4`, `a9486d7f`); the tiebreaker has never existed. None of the 14 commits on that file added or removed one.

So this is **latent-by-construction since the module was extracted, not a regression** — no build or release introduced it, and bisecting will not find one. `a9486d7f` "dedup identical product searches within one request" (2026-08-07, shipped in **3.1016.0**, included in the deployed 3.1018.0) rewrote the surrounding handler and was the obvious suspect, but it did not touch either defect.

What changed is the **data**: the symptom appears once the index acquires documents that fail to hydrate, and worsens as they cluster near the top of the default tied sort. That makes it environment-triggered and, on any deployment, a latent time-bomb rather than a version to avoid.

## Impact

**Critical.** On the default sort — what every shopper hits first — the primary catalog listing exposes **3 products out of 3,569**, then silently declares itself complete. There is no error, no empty state, no spinner; the grid simply looks like the whole catalogue. The only escape is for the shopper to notice the sort control and change it. Catalog browse is a critical revenue flow.

Deeper pages proven to exist at the xAPI layer (`after:32` → 9 items, `after:48` → 14) are **unreachable through the UI**, because the storefront correctly stops at the empty second batch.

## Regression Test Coverage — nothing we have can catch this

Scoped with `npm run tc:scope -- --domain catalog-search` (19 suites, 732 rows). Suite `050a` (GraphQL xCatalog, 808 rows) carries pagination cases, and **every one passes against the broken build**:

| Existing shape | Result | Catches it? |
|---|---|---|
| `CAT-GQL-098` cursor pagination, `first:2` + category filter | 2/2 | No |
| Cases at `first:1` / `first:3` | 1/1, 3/3 | No |
| Cases at `first:5` / `first:10` | 4/5, 4/10 — genuinely under-filled | No — assertions read `items.length >= 1`, and 4 ≥ 1 |

Three structural gaps, corpus-wide:

1. **No case asserts a page is FULL.** `grep` for `items.length = <page size>` across `regression/suites/` returns nothing; every pagination assertion is `>= 1`/`>= 2` — the presence-only shape `T-006` exists to reject.
2. **No case uses the storefront's real page size.** `first:16` appears once, in an unrelated B2B suite; catalog cases use 1–10, and the loss grows with page size.
3. **No case walks pages and reconciles the union against `totalCount`**, which is the only shape that detects loss rather than under-fill.

Recommended additions (`Technique:FLOW`, `Archetype:SILENT-DATA-LOSS`), literal-free, each run across `sort` ∈ {default, `priority:desc`, `createddate:desc`}:

- **Page fill** (`INV`): `products(first:16 after:"0")`, no sort → `items.length = 16` while `totalCount > 16`.
- **Page-walk reconciliation** (`REL`): walk `after` 0→160 at `first:16` → 176 distinct ids, no repeats.
- **`totalCount` stability** (`REL`): same query at `first:8/16/32/64` → identical `totalCount`.
- **Storefront journey** (`REL`): default-sort `/catalog`, scroll to exhaustion, rendered cards reconcile with the displayed result count — the one that catches the retired observer.

## Evidence

`reports/bugs/screenshots/BUG-catalog-paging-*.png` — `default-initial-3of3569` ("3,569 results" above 3 cards), `default-stalled-bottom` (footer reached, grid stalled), `name-sort-healthy` (Name A–Z, full grid, still paging).

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 3 — xAPI
- **Suggested repo:** `VirtoCommerce/vc-module-x-catalog`
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** XCatalog `3.1018.0` — response pipeline + index search request construction
- **RCA anchor:**
  - `src/VirtoCommerce.XCatalog.Data/Middlewares/RemoveNullCatalogProductsMiddleware.cs` — removes items and decrements `TotalCount` after the page is cut, with no back-fill. **Primary fix:** either over-fetch and refill to `Take`, or exclude unhydratable documents in the search request so paging never sees them.
  - `src/VirtoCommerce.XCatalog.Data/Index/IndexSearchRequestBuilder.cs:46` and `:400` — no unique tiebreaker on either sort path. **Secondary fix:** append the document id as a final `SortingField` so every sort is a total order.
  - `src/VirtoCommerce.XCatalog.Data/Queries/SearchProductQueryHandler.cs:225-228` — where the page is cut before the pipeline runs.
- **Routing confidence:** HIGH — REST clean vs xAPI broken isolates the layer; the middleware source matches the observed arithmetic exactly on every data point.

**Blast radius beyond this ticket:** `IndexSearchRequestBuilder` is shared by every paged xCatalog index query (`SearchBrandQueryHandler` uses the same sorting path), so other surfaces paging on a tied sort are likely losing items the same way. Not measured — worth scoping before the fix is narrowed to the products connection.
