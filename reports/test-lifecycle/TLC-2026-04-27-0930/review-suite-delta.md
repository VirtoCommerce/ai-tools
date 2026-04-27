# 050f Suite Review — Post-Update Delta (TLC-2026-04-27-0930 supplement)

**Reviewed:** 2026-04-27 10:46 UTC (after adding pageContext concrete-args probes)
**Scope:** Full suite re-review after GQL-123 rewrite + GQL-126 addition
**Verdict:** **APPROVED with 1 known limitation** (env-resilience on GQL-123/126)

## What Changed Since First Review

| Case | Before | After |
|------|--------|-------|
| GQL-123 | `pageContext` smoke (storeId only, 2 assertions) | Homepage probe with concrete `domain` + `userId` + `permalink: "/"`, 5 assertions including slugInfo.entityInfo.objectType |
| GQL-126 | (did not exist) | New — Catalog page probe with `permalink: "/catalog"`, 6 assertions including `entityInfo.semanticUrl = catalog` |

Suite count: 12 → **13 cases**.

## Static Review (7 dimensions)

| Dim | Result | Notes |
|-----|:------:|-------|
| 1. Structure | PASS | 13 rows × 15 cols; no duplicate IDs; CSV parses via `csv-parse/sync` |
| 2. Determinism | PASS | All cases use runner-native `[GQL-OP]/[GQL-EXEC]/[GQL-CAPTURE]` |
| 3. Completeness | PASS | 13/13 have `[DATA … is non-null]`; 10/13 have explicit `[ERRORS] errors[] empty`; 3 negatives (GQL-116/122/125) intentionally use disjunction `data is non-null or errors[] is non-empty` (graceful-handling contract) instead of separate `[ERRORS]` check — by design, not a gap |
| 4. Testability | PASS | All predicates evaluatable by `graphql-assertions.ts`; new GQL-123/126 use `is non-null` + `is non-empty GUID` + literal-equality on stable schema fields (objectType, semanticUrl) |
| 5. Data Validity (DV-006…DV-011) | PASS | 13/13 schema-valid against live introspection. **Limitation:** GQL-123 & GQL-126 contain hardcoded vcst-qa values (`vcst-qa-storefront.govirto.com`, userId GUID `42765f34…`). Documented in each case's Preconditions with a "future: lift to {{TEST_USER_ID}} + derive domain from FRONT_URL host" note. Per env-resilience policy: Acceptable as known limitation since (a) values are concrete-test inputs supplied by user, (b) other-env runs would need to override these regardless. Tracked as F-3 below. |
| 6. BL/ECL Coverage | PASS | 13/13 have BL ref + ECL ref. BL-GQL-001/002 still in proposed-not-promoted state (cross-suite F-2 from prior review) |
| 7. Duplication | PASS | GQL-123/126 are intentional pair (homepage vs catalog — different permalinks; different entity-resolution); GQL-115/116, 121/122 also intentional happy/negative pairs |

## Live Execution

```
13/13 PASS  ::  38/38 assertions  ::  17 HTTP calls all 200 OK  ::  0 GraphQL errors
```

| ID | Verdict | Assertions | HTTP elapsed (ms) |
|----|--------|-----------:|-----:|
| GQL-014 | PASS | 3/3 | ~570 |
| GQL-115 | PASS | 4/4 | 230 + 220 |
| GQL-116 | PASS | 1/1 | 215 |
| GQL-117 | PASS | 4/4 | 220 + 180 |
| GQL-118 | PASS | 2/2 | 240 |
| GQL-119 | PASS | 3/3 | 250 |
| GQL-120 | PASS | 2/2 | 305 |
| GQL-121 | PASS | 3/3 | 220 + 240 |
| GQL-122 | PASS | 1/1 | 200 |
| **GQL-123** | **PASS** | **5/5** | 660 (cold first call) |
| GQL-124 | PASS | 3/3 | 240 |
| GQL-125 | PASS | 1/1 | 215 |
| **GQL-126** | **PASS** | **6/6** | 280 |

Median per-call latency: 230 ms · max: 908 ms (cold first request) · all under 1 s.

### Notable observations from GQL-123/126 live data

- **Homepage** (`/`) → `slugInfo.entityInfo` resolves to `objectType: "ContentFile"` with id `QjJCLXN0b3JlOjpwYWdlczo6L2hvbWVwYWdlLnBhZ2U-` (base64 of `B2B-store::pages::/homepage.page`). Confirms homepage is a Virto Pages content file, not a catalog/category entity.
- **Catalog page** (`/catalog`) → `slugInfo.entityInfo` resolves to `objectType: "Catalog"`, `id: c671b01b-beaa-4e34-97d3-2e61b567355e`, `semanticUrl: "catalog"`. Confirms `/catalog` resolves to the Catalog root entity.
- **`pageContext.user.id` returns a fresh anonymous session GUID per request, NOT the userId arg.** Two consecutive runs returned different IDs (`26d87d72-…` then `5ea95683-…`). The `userId` arg is a session hint to the resolver; to get the real authenticated user back, the request needs an OAuth Bearer token. Documented in GQL-123 Preconditions; assertions adjusted to structural invariants (`is non-empty GUID`).

## Findings

| ID | Severity | Dimension | Issue | Recommended Action | Owner |
|----|---------|-----------|-------|------------|-------|
| F-1 | Medium | Coverage | `builderPage(storeId, pageId)` not exercised | Defer to Page Builder suite (VCST-4872) | test-management-specialist |
| F-2 | Advisory | BL Coverage | `BL-GQL-001/002` referenced but not yet in `business-logic.md` | Cross-suite `--update-bl` pass | (deferred) |
| **F-3** | **Medium (new)** | **Data Validity** | **GQL-123/126 hardcode vcst-qa storefront domain + a specific userId GUID** | Add `TEST_USER_ID` to `.env` (with `42765f34-…` for vcst-qa) and add `FRONT_DOMAIN` derivation; replace hardcoded literals with `{{TEST_USER_ID}}` + `{{FRONT_DOMAIN}}`. Until then, suite is **vcst-qa-bound** for those two cases. | scripts owner |

No Blocker / Critical / High findings. F-3 is documented in each affected case's Preconditions.

## Quality Gates

| Gate | Status | Detail |
|------|:------:|--------|
| G1 Structure | PASS | 13×15, no dup IDs |
| G2 Determinism | PASS | All runner-native |
| G3 Completeness | PASS | All assertions present (3 disjunctive negatives by design) |
| G4 Testability | PASS | All predicates evaluatable |
| G5 Data Validity | **WARN** | F-3 — GQL-123/126 vcst-qa-bound (Medium); 13/13 schema-valid |
| G6 Coverage | WARN | F-1 builderPage deferred; F-2 BL promotion deferred |
| G7 Duplication | PASS | No duplicates |
| G8 Environment | PASS | 13/13 live PASS, 38/38 assertions, 0 HTTP errors, 0 GraphQL errors |
| G9 Sync | N/A | Direct-scope |

7/7 required gates pass; G5 demoted to WARN (was PASS) due to new F-3.

## Verdict

**APPROVED** — suite is regression-ready for vcst-qa. Track F-3 as a follow-up to make GQL-123/126 cross-environment.

## Files

- [regression/suites/Backend/graphql/050f-graphql-xcms.csv](regression/suites/Backend/graphql/050f-graphql-xcms.csv) — 13 cases
- [config/test-suites.json:1094](config/test-suites.json#L1094) — testCount 13
- [reports/test-lifecycle/TLC-2026-04-27-0930/live-runs-final.txt](reports/test-lifecycle/TLC-2026-04-27-0930/live-runs-final.txt) — full runner stdout
- 13 per-case JSON evidence files at [reports/regression/graphql-evidence/](reports/regression/graphql-evidence/)
