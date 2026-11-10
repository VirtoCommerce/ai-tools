# VCST-5928: local proof of PR vc-module-elastic-search-8#47 (GetMapping guard)

**Head** `d205e1ac` (merge commit; the PR diff is +6 lines in `ElasticSearch8Provider.LoadMappingAsync`) · **Base** `3464de37` (`origin/dev` = merge-base = second parent of d205) · 2026-11-03
**Harness:** a throwaway xunit file `tests/VirtoCommerce.ElasticSearch8.Tests/Unit/GuardProofScratchTests.cs`, kept only in `.fix-workspace/vc-module-elastic-search-8-pr47`. It runs a real `ElasticSearch8Provider` with the real Elastic transport against a scripted local `HttpListener` fake ES that returns: `HEAD <index>` → 200 (or 404), and `GET <index>/_mapping` → each scripted step in order. It uses a 503 `{}` response, a TCP reset (`Response.Abort()`), a 4 s delay with a 1 s `RequestTimeout`, a 200 with an empty mapping, and a 200 with a real mapping. Debug mode was off (the default).
**Base run:** the base version of `ElasticSearch8Provider.cs` was checked out over head, the same 10 cases were re-run, and the file was restored. The existing `Category=Unit` suite still passes on head (72/72).

## Verdicts

| # | Claim / suspicion | Verdict | Head (d205) | Base (3464de3) |
|---|---|---|---|---|
| 1 | 503 `{}` throws, does not cache an empty mapping, and recovers without a restart | **PASS** | Call 1: `SearchException`. Call 2 (server back to 200): returns 2 properties (`name`, `code`). Both calls reach the server (2 `_mapping` requests) | Call 1 returns 0 properties with no exception. Call 2 returns the **cached empty** mapping (0 properties) and never reaches the server (1 `_mapping` request), so the empty mapping stays until restart |
| 2a | A connection reset throws `SearchException`, not NRE, with the transport exception as inner | **PASS** | `SearchException`, inner `System.Net.Http.HttpRequestException` (→ IOException → SocketException 10054) | `NullReferenceException` at `LoadMappingAsync` line 775, inner null |
| 2b | A timeout throws `SearchException`, not NRE | **PASS** | `SearchException`, inner `TaskCanceledException` ("HttpClient.Timeout of 1 seconds elapsing") | `NullReferenceException` at line 775, inner null |
| 3 | A valid 200 with no properties still caches an empty mapping | **PASS** | Returns 0 properties; the second call is served from cache (1 `_mapping` request) | Same |
| 4 | `IndexAsync` / `CreateIndexAsync` throw `SearchException` where they threw NRE | **PASS, with a correction** | Reset: `SearchException` on both paths. 503 `{}`: `SearchException` on both; `IndexAsync` stops before `_bulk` | Reset: `NullReferenceException` on both. **503 `{}`: no exception at all.** `IndexAsync` went on to `POST _bulk` + `_refresh` with an empty mapping; `CreateIndexAsync` returned normally |
| S-3 | On a 503 `{}` with no transport exception, building the exception dereferences null and throws NRE | **DISPROVED** | See note S-3 below | n/a |
| S-2 | The message carries the host / URL | **CONFIRMED (host appears twice; not new in this PR)** | See the message shape below | n/a |
| M | A missing index (HEAD 404) never reaches the guard | **CONFIRMED** | Returns an empty mapping. Only `HEAD` was sent; 0 `_mapping` requests, so the guard is never reached | Same |

**Correction to claim 4:** for the error-status case (503 `{}`), the base code did not throw a `NullReferenceException`. It failed **silently**: it cached the empty mapping and indexed against it. The NRE only happened on a transport failure (reset or timeout). The PR fixes both cases.

**S-3 note:** for a 503, `ApiCallDetails` is set and `OriginalException` is not null. The client creates an `Elastic.Transport.TransportException` ("Request failed to execute. Call: Status code 503 from: GET /<index>/_mapping"), and that becomes the inner exception. The guard also uses `ApiCallDetails?.OriginalException`, so it is null-safe either way. Raw response: `IsValidResponse=False`, `HttpStatus=503`, `Mappings.Count=0`, `ElasticsearchServerError=null`.

## Literal message shape (head, 503 `{}`; host redacted, line breaks shown as ⏎)

```
Mapping load failed for index: test-core-product-active. Invalid Elasticsearch response built from a unsuccessful (503) low level call on GET: /test-core-product-active/_mapping ⏎ Exception: Request failed to execute. Call: Status code 503 from: GET /test-core-product-active/_mapping ⏎⏎ # Audit trail of this API call: ⏎ - [1] BadResponse: Node: http://<host>/ Took: 00:00:00.0005464 ⏎ # OriginalException: Elastic.Transport.TransportException: Request failed to execute. Call: Status code 503 from: GET /test-core-product-active/_mapping ⏎ # Request: ⏎ <Request stream not captured …> ⏎ # Response: ⏎ {} ⏎ . URL:http://<host>/, Scope: test-core
```

- **Host:** the host appears twice. `DebugInformation` names it in the audit trail (`Node: http://<host>/`), and the pre-existing `ThrowException` appends `URL:<ServerUrl>, Scope:` to every `SearchException` in this provider.
- **Credentials:** no Basic-auth user or password, and no `Authorization` header, appeared in any captured message (grep over all 10 cases found 0 matches).
- **Transport failures:** for a reset or timeout, `DebugInformation` also embeds the full .NET inner-exception stack trace in `Message`, so the message runs to about 20 lines.
- **Response body:** the error response body (`{}`) is echoed into the message. With `EnableDebugMode` on, request bodies would be captured as well. Mapping GETs have no body.

## Commands run

```
git clone https://github.com/VirtoCommerce/vc-module-elastic-search-8 .fix-workspace/vc-module-elastic-search-8-pr47
git checkout d205e1ac826e4505872c260b1851a022169e4294
GUARD_OUT=…/guard-head.txt dotnet test tests/VirtoCommerce.ElasticSearch8.Tests --filter "Category=GuardProof"   # 10/10 run (observational)
git checkout 3464de37 -- src/VirtoCommerce.ElasticSearch8.Data/Services/ElasticSearch8Provider.cs
GUARD_OUT=…/guard-base.txt dotnet test tests/VirtoCommerce.ElasticSearch8.Tests --filter "Category=GuardProof"
git checkout HEAD -- src/…/ElasticSearch8Provider.cs
dotnet test tests/VirtoCommerce.ElasticSearch8.Tests --no-build --filter "Category=Unit"                    # 72/72 pass
```

Raw outputs are in the clone: `guard-head.txt` and `guard-base.txt`. Nothing was pushed, branched or commented on GitHub.
