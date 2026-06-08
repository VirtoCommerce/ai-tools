# BUG — `GET /api/search/indexes/tasks/{id}/cancel` 500 KeyNotFoundException ('ServerName') in `IndexingJobs.CancelIndexation`

## Status: READY_TO_SUBMIT — filed as [VCST-5218](https://virtocommerce.atlassian.net/browse/VCST-5218)

**Severity:** Medium — cancelling a just-started indexation can 500 (intermittent, SqlServer Hangfire storage only). The Admin "Cancel" action fails; user must retry. Not a data-corruption or revenue-flow bug.

**Env:** `vc-module-search` dev Module CI — run [27137824764](https://github.com/VirtoCommerce/vc-module-search/actions/runs/27137824764) (PR #138 branch), platform image `local-latest`, Hangfire **SqlServer** storage. Reproduced sqlserver-only; mysql + postgres green. Code present on `vc-module-search` `dev`.

## Summary
`IndexingJobs.CancelIndexation()` → `CancelJob()` enumerates **all** Hangfire processing jobs via `JobStorage.Current.GetMonitoringApi().ProcessingJobs(0, int.MaxValue)`. When a job was **just started** and its SqlServer Hangfire state row hasn't fully written the `ServerName` key yet, Hangfire's `ProcessingJobs` deserialization does `stateData["ServerName"]` → `KeyNotFoundException`, which bubbles up as a 500 on the cancel endpoint.

## Steps to Reproduce
1. `POST /api/search/indexes/index` with `[{"documentType":"Product"}]` → returns a `task_id`.
2. **Immediately** `GET /api/search/indexes/tasks/{task_id}/cancel` (race the Hangfire state write).
3. Endpoint returns `500 {"message":"The given key 'ServerName' was not present in the dictionary."}`.

Exercised by `tests/restapi/search/test_search.py::test_index_cancel` — `1 failed, 247 passed` (sqlserver only).

## Expected vs Actual
- **Expected:** cancel returns 2xx (job cancelled or already-gone treated as success); a processing job with incomplete state data is skipped, not fatal.
- **Actual:** 500 KeyNotFoundException; the whole cancel request fails.

## Server stack trace
```
System.Collections.Generic.KeyNotFoundException: The given key 'ServerName' was not present in the dictionary.
   at System.Collections.Generic.Dictionary`2.get_Item(TKey key)
   at System.Collections.Generic.List`1..ctor(IEnumerable`1 collection)
   at VirtoCommerce.SearchModule.Data.BackgroundJobs.IndexingJobs.CancelIndexation() in IndexingJobs.cs:line 89
```

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | N/A | admin/API feature |
| 2. Backend Admin | FAIL (inherited) | Search → Indexation "Cancel" calls this endpoint |
| 3. GraphQL xAPI | N/A | not xAPI |
| 4. Platform REST API | **FAIL** | `GET /api/search/indexes/tasks/{id}/cancel` → 500, CI run 27137824764 |

**Owning layer:** Layer 4 — Platform REST API (Search module).

## Root Cause Analysis
[`IndexingJobs.cs`](https://github.com/VirtoCommerce/vc-module-search/blob/dev/src/VirtoCommerce.SearchModule.Data/BackgroundJobs/IndexingJobs.cs) `CancelJob` (called from `CancelIndexation`):

```csharp
var processingJobs = JobStorage.Current.GetMonitoringApi().ProcessingJobs(0, int.MaxValue);  // line 89 (via CancelJob)
var (jobId, _) = processingJobs.FirstOrDefault(x => ...);
```

`MonitoringApi.ProcessingJobs` (Hangfire **SqlServer** storage) constructs each `ProcessingJobDto` by reading `stateData["ServerName"]` directly. A job in `Processing` state whose state row is mid-write lacks that key → `KeyNotFoundException` during enumeration (`List<>..ctor(IEnumerable)` materializing the lazy result). The cancel path has no guard around the enumeration.

**Pre-existing — NOT introduced by PR #138 (VCST-5091).** The PR diff (`Start`/`RunIndexJobAsync`/`Finish` notification-seal fix) leaves `CancelJob`/`CancelIndexation` byte-identical to `dev`.

**Historical precedent:** [VP-7752](https://virtocommerce.atlassian.net/browse/VP-7752) (2021) — same `IndexingJobs.CancelIndexation` failure (NRE then) explicitly tied to Hangfire **SqlServer** storage ("when it's set to SQL server this is when this exception occurs"). Same fragile path, new manifestation.

**Suggested fix:** make the cancel path tolerant of Hangfire storage state — e.g. wrap the `ProcessingJobs` enumeration in try/catch (treat a deserialization failure as "no matching job"), or page/iterate defensively so one job with incomplete state data doesn't fail the whole call. No public contract change.

## Notes
- Intermittent / timing-dependent → re-run will likely pass (mysql + postgres already green this run). A re-run of run 27137824764 is in flight to confirm.
- Distinct from VCST-5091 (notification seal) and VCST-5212 (platform `IconFileExists` NRE).

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 4 — REST
- **Suggested repo:** VirtoCommerce/vc-module-search
- **repoKind:** module
- **Component / module:** Search — `IndexingJobs.CancelIndexation` / `CancelJob` (Hangfire SqlServer storage)
- **RCA anchor:** `IndexingJobs.CancelJob` → `ProcessingJobs(0, int.MaxValue)` (`IndexingJobs.cs:89`)
- **Routing confidence:** HIGH
