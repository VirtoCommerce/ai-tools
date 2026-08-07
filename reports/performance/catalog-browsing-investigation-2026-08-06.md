# Catalog browsing & product search — backend work per request

**Scope:** x-catalog storefront browsing (category listing, PDP, keyword search, category nav)
**A/B:** `vcptcore-qa` XCatalog `3.1014.0` → `vcst-qa` XCatalog `3.1016.0-pr-106-3559` (VCST-5637 dedup seam)
**Instrument:** App Insights `requests ⋈ dependencies` on `operation_Id` — dependency **counts**, which transfer across environments
**Date:** 2026-08-06

## Question and answer

*Does catalog browsing do more backend work than it needs to, and did VCST-5637 reduce it?*

**Yes it does, and no VCST-5637 did not — because the redundancy is the wrong shape for that fix.** A
product-listing page issues **one Elasticsearch product search per variation-bearing product in the page**,
on both builds. That is an **N+1**, whose lever is batching; VCST-5637 removes *duplicate identical*
searches, which browsing does not produce.

## 1. A/B — VCST-5637 does not move browsing

Full per-arm table: `reports/tickets/Sprint26-15/VCST-5637/browsing-measurement-report.md`. Summary:

| Arm | Before | After |
|---|---|---|
| Positive control — 4 byte-identical searches in one request | 4 | **1** (−75%) |
| Negative control — 4 distinct-criteria searches | 4 | 4 |
| PLP (zero-variation) · PDP · keyword search · category nav | 1 · 2 · 1–2 · 1 | 1 · 2 · 1 · 1 |
| **PLP (variation-rich)** | **6** | **7** |

The positive control fired in the same telemetry windows, so "browsing unchanged" is a measured null
result, not a blind instrument. **Keyword product search is at the floor (1 call)** — nothing to remove there.

## 2. Residual — the count scales, so it is an N+1

Page size varied, everything else held fixed (same build, same request text, same category), so the claim
is made **within** each environment and does not depend on the two catalogs matching. Predictions were
computed from an independent minimal-field discovery pass **before** measuring; that pass warms only the
listing search, never the per-product variation searches.

| `first:` | 4 | 8 | 12 | 16 | 20 |
|---|---|---|---|---|---|
| **After** — predicted `1 + varProducts` | 2,2,1 | 2,2,1 | 3,4,4 | 6,7,6 | 8,8,8 |
| **After** — measured | 1,2 | 1,2 | 3,4,4 | 6 | 8 |
| **Before** — predicted | 3,3,3 | 5,5,4 | 5,6,5 | 6,6,5 | 8,9,8 |
| **Before** — measured | 3 | 4 | 5 | 5 | 8,8 |

**Every measured value falls inside its predicted set, across all 10 cells.** Slope ≈ **1.0 per
variation-bearing product**, intercept 1. Per-cell n is 1–3 after adaptive sampling; the prediction match
across ten independent cells is what carries the claim, not n within any one cell.

```
ES product searches per request  ≈  1 + (variation-bearing products in the page)
```

## 3. Mechanism — confirmed in source, not inferred

`ProductType.ResolveVariationsFieldAsync` (`vc-module-x-catalog`, `src/VirtoCommerce.XCatalog.Core/Schemas/`):

```csharp
if (context.Source.IndexedVariationIds.IsNullOrEmpty())
    return new List<ExpVariation>();                      // zero-variation product → no query at all
var query = context.GetCatalogQuery<LoadProductsQuery>();
query.ObjectIds = context.Source.IndexedVariationIds;     // ids differ per PARENT product
var response = await context.GetMediator().Send(query);   // one query per parent
```

Three things follow directly, and each matches a measurement:

| Source fact | Measured consequence |
|---|---|
| Resolver runs **per product node**, one `LoadProductsQuery` each | count scales with variation products — §2 |
| Early return when `IndexedVariationIds` is empty | zero-variation PLP stays at **1** |
| `ObjectIds` differ per parent ⇒ **distinct** `SearchRequest`s | VCST-5637's whole-request hash correctly declines to collapse them — the negative control, seen from the other side |

The calls do pass through the seam VCST-5637 modified; they simply never match each other.

## 4. Recommendation

**Batch the variations resolver into a single by-ids load per request.** All parents' `IndexedVariationIds`
can be unioned into one `LoadProductsQuery` and demultiplexed per node — the standard DataLoader shape,
and the one case where a per-node batching layer *is* the right tool (VCST-5637's own description notes a
DataLoader cannot help when load arguments are identical under different node keys; here it is the
converse). The resolver is already `protected virtual`, so the seam exists.

Expected effect at `first:16` on a variation-heavy category: **6–8 calls → 2**. Sibling in spirit to
VCST-5640. **Not filed** — this report ends at a recommendation.

## What is not claimed

- **Cross-environment latency.** Reported in the ticket report for completeness only; the after side is
  *slower* on several arms, driven by catalog size (4 523 vs 2 537 products) and a different ES cluster and
  DB tier. Counts transfer; duration does not.
- **What the surviving calls are.** App Insights records the dependency **URL, not the request body**, so
  the per-call `ObjectIds` were established from source, not from telemetry.
- **Throughput or p95.** No load arm was run; `--load` (k6 L2) would be needed, and only within one env.
- **Any SQL claim.** `totalDeps` was carried as a control and moves with page size as expected; no SQL-side
  conclusion is drawn.

## Appendix

| Layer | What |
|---|---|
| Load generator | `npx tsx scripts/graphql/graphql-runner.ts --case <csv>:<ID> --schema-cache <per-env>` |
| Harnesses | `PERF-BRW-SCALE-{04,08,12,16,20}-{A,B}` (scale) · `PERF-5637-BRW2/BRW3-*` (A/B + controls) |
| Metric | count of `dependencies` whose `name` ends `-product-active/_search`, per request |
| Scale-test window | 2026-08-06 12:22:16–12:22:50Z (10 cells, 30 requests, all PASS) |
| Recipe | `.claude/knowledge/execution/es-call-ab-method.md` |
