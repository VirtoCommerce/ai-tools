# Test Case Lifecycle Report — TLC-2026-04-27-1300

## Summary

- **Input:** `review 050i`
- **Input Type:** direct-scope (suite)
- **Date:** 2026-04-27 13:00 UTC
- **Platform:** 3.1025.0-pr-2987-eb8e-vcst-4710 (vcst-qa)
- **Theme:** 2.48.0-pr-2219-d1d4
- **Module Versions (relevant to configurable products / xCart):**
  - VirtoCommerce.XCatalog — 3.1004.0
  - VirtoCommerce.XCart — 3.1009.0
  - VirtoCommerce.Xapi — 3.1006.0
  - VirtoCommerce.Catalog — 3.1020.0
- **Verdict:** **NEEDS FIXES** (1 backend bug + 1 test-case fragility — neither is a parser issue; parser fix from 2026-04-27 is verified to unlock 5 of 7 previously blocked cases)

## Phase Results

| Phase | Agent | Status | Key Metrics |
|-------|-------|--------|-------------|
| 1. Scope | orchestrator | Done | 1 suite (050i), 12 cases — direct-scope |
| 2. Sync | test-management-specialist | Skipped (direct-scope) | — |
| 3. Analyze & Generate | test-management-specialist | Skipped (review-only) | — |
| 4. Review & Fix | orchestrator (in-line) | Done | 0 Blocker, 0 Critical static; 1 Critical from Phase 5 (CFG-GQL-011), 1 High (CFG-GQL-012) |
| 5. Verify | orchestrator (runner-driven) | Done | **10/12 PASS live** — 5 cases unlocked by parser fix vs prior REG-2026-04-27-0919 |
| 6. Approve | orchestrator | **NEEDS FIXES** | 6/9 required gates pass; 1 backend bug + 1 test fix required |

## Pre-Flight

- **Schema cache:** fresh (`scripts/.graphql-schema.cache.json`, refreshed 2026-04-27 — same as TLC-2026-04-27-0930)
- **Deploy state:** `reports/deploy-state-cache.json` — XCatalog/XCart/Xapi unchanged since prior green run REG-2026-04-24-2334; configurable-products stack stable
- **Duplicate check:** No prior TLC-* run on 050i (this is the first)
- **Context7:** xCart configurationSections + xCatalog productConfiguration verified against `.claude/agents/knowledge/graphql-schema.md` introspection
- **CFG_HOODIE.id alias:** verified present (BUG-050i-002 from prior regression report — already fixed)

## Scope (Phase 1)

| Suite | Cases | Layer | Domain | Priority |
|-------|------:|-------|--------|----------|
| 050i — GraphQL Configurable Products | 12 | backend | catalog-search + cart | P1 |

| Section | Cases |
|---------|-------|
| GraphQL > Configurable Products > Query | CFG-GQL-001..005 (5) |
| GraphQL > Configurable Products > Mutation | CFG-GQL-006..012 (7) |

xAPI surface coverage: `productConfiguration` query, `configurationItems` query, `createConfiguredLineItem`, `addItem` (configurable variant), `addConfigurationItem(s)`, `updateConfigurationItem(s)`, `removeConfigurationItem(s)`, `changeCartConfiguredItem` mutations.

## Phase 4 — 7-Dimension Static Review

| Dim | Result | Notes |
|-----|:------:|-------|
| 1. Structure | **PASS** | 12 rows × 15 cols; no duplicate IDs; CSV parses cleanly |
| 2. Determinism | **PASS** | All cases use runner-native `[GQL-OP]/[GQL-VARS]/[GQL-EXEC]/[GQL-CAPTURE]` blocks. Mutation cases properly chain `[AUTH role=ORG_USER] → me → clearCart → productConfiguration → addItem → mutation under test → read_back → cleanup` |
| 3. Completeness | **PASS** | 11/12 have explicit `[ERRORS] errors[] empty`; CFG-GQL-003 intentionally uses disjunction (graceful handling for invalid GUID). Failure_Signals specific. Cleanup steps inline (`cleanup_post` clears cart) — appropriate for stateful mutation cases. |
| 4. Testability | **PASS** | All assertions evaluatable; one fragility flagged below in Findings (F-2 — order-dependent index assertions in CFG-GQL-012) |
| 5. Data Validity (DV-006…DV-011) | **PASS** | 12/12 schema-valid against live introspection. **Zero hardcoded GUIDs/URLs** — all data flows through `@td(CFG_*.id)` aliases or runtime `[GQL-CAPTURE]`. Excellent env-resilience (contrasts F-3 from 050f review). |
| 6. BL/ECL Coverage | **PASS** | 12/12 have BL ref + ECL ref. References include cross-cutting BL-CART-001, BL-CHK-001, BL-PRICE-001, BL-CAT-006 in addition to BL-GQL-001/002. Strongest BL coverage of any 050* suite. |
| 7. Duplication | **PASS** | No cross-suite overlap. Within-suite: each mutation has a distinct contract under test; CFG-GQL-008/009 share setup chain but assert different mutations (single upsert vs bulk + single replace). |

## Phase 5 — Live Verification

Executed all 12 cases via `npx tsx scripts/graphql-runner.ts --case <csv>:<ID>` against `https://vcst-qa.govirto.com/graphql`.

| ID | Verdict | Assertions | Notes |
|----|--------|-----------:|-------|
| CFG-GQL-001 | **PASS** | 7/7 | Happy path — productConfiguration returns 2 required Product sections (CFG_LAPTOP) |
| CFG-GQL-002 | **PASS** | 3/3 | CFG_HOODIE returns empty configurationSections (was passing-by-coincidence before BUG-050i-002 fix; now genuinely passing) |
| CFG-GQL-003 | **PASS** | 1/1 | Zero-GUID graceful empty (no HTTP 500) |
| CFG-GQL-004 | **PASS** | 6/6 | Text section maxLength=30 returned (VCST-4806 / PR #2235 contract intact) |
| CFG-GQL-005 | **PASS** | 2/2 | Conditional cascade A→B→C+D (CFG_CONDITIONAL_BIKE / VCST-4713 dependsOnSectionId) |
| **CFG-GQL-006** | **PASS** | **5/5** | **NEW PASS** — was blocked by parser bug in prior run; createConfiguredLineItem preview happy path |
| **CFG-GQL-007** | **PASS** | **4/4** | **NEW PASS** — empty required sections returns draft id=null (soft-reject contract verified) |
| **CFG-GQL-008** | **PASS** | **10/10** | **NEW PASS** — addConfigurationItem upsert + configurationItems read-back verified |
| **CFG-GQL-009** | **PASS** | **10/10** | **NEW PASS** — bulk addConfigurationItems + updateConfigurationItem replace |
| **CFG-GQL-010** | **PASS** | **2/2** | **NEW PASS** — updateConfigurationItems bulk update |
| CFG-GQL-011 | **FAIL** | 7/9 | **Backend bug** (see F-1) — `removeConfigurationItem`/`removeConfigurationItems` mutations silent no-op (return success but config not removed) |
| CFG-GQL-012 | **FAIL** | 7/11 (isolated) | **Test fragility** (see F-2) — read-back assertions order-dependent; backend returns configurationItems in different order than mutation response |

Aggregate: **10/12 PASS, 56/72 assertions PASS**. Parser fix verified — 5 cases unlocked vs prior regression.

### Delta vs prior regression run (REG-2026-04-27-0919)

| Case | Before (REG-2026-04-27-0919) | After (TLC-2026-04-27-1300) | Reason |
|------|------------------------------|------------------------------|--------|
| CFG-GQL-001..005 | 5 PASS | 5 PASS | unchanged |
| CFG-GQL-006 | FAIL (parser) | **PASS** | parser fix shipped |
| CFG-GQL-007 | FAIL (parser) | **PASS** | parser fix shipped |
| CFG-GQL-008 | FAIL (parser) | **PASS** | parser fix shipped |
| CFG-GQL-009 | FAIL (parser) | **PASS** | parser fix shipped |
| CFG-GQL-010 | FAIL (parser) | **PASS** | parser fix shipped |
| CFG-GQL-011 | FAIL (parser, masked) | **FAIL (real bug)** | parser fix exposed real backend bug |
| CFG-GQL-012 | FAIL (parser, masked) | **FAIL (test fragility)** | parser fix exposed order-dependence |

Net pass-rate: 41.7% → **83.3%** (+41.6 pts). The parser fix landed cleanly; the remaining 2 failures are independent issues that the parser bug had been hiding.

## Findings

### F-1 — Critical (backend bug — needs JIRA ticket)

**Title:** xAPI `removeConfigurationItem` / `removeConfigurationItems` mutations silent no-op — return HTTP 200 with no errors but configuration sections persist on the line item.

**Reproduction (CFG-GQL-011):**
1. `addItem` CFG_LAPTOP with both required sections (RAM=BASE, Storage=BASE) — confirmed succeeds, line item has 2 configurationItems
2. `removeConfigurationItem` for the RAM section — returns 200 OK, errors=[], response shape contains both sections still
3. `configurationItems` read-back query — confirms BOTH sections are still on the line item (RAM not removed)
4. `removeConfigurationItems` for both sections — returns 200 OK, errors=[], same silent no-op
5. `configurationItems` read-back — confirms both sections still present

**Evidence:**
- [reports/test-lifecycle/TLC-2026-04-27-1300/live-runs.txt](reports/test-lifecycle/TLC-2026-04-27-1300/live-runs.txt)
- [reports/regression/graphql-evidence/CFG-GQL-011-*.json](reports/regression/graphql-evidence/) (latest)

**Severity:** **High / Data integrity.** The mutations claim success but don't mutate. Storefront/admin code that relies on these would think a config section was removed when it wasn't. Affects line item lifecycle management for configurable products.

**Recommended action:** File JIRA bug against `vc-module-x-cart` (or wherever xAPI removeConfiguration* is implemented). Test case CFG-GQL-011 is correct as-written and is detecting a real regression — keep it as-is.

**Cross-check:** The PRIOR regression run (REG-2026-04-27-0919) couldn't detect this because the parser bug short-circuited execution before HTTP send. This is the first run where the test reaches the backend — so the backend bug may have existed for some time, just gone undetected.

### F-2 — High (test-case fragility)

**Title:** CFG-GQL-012 read-back assertions are order-dependent; backend `configurationItems` query returns items in different order than the `changeCartConfiguredItem` mutation response.

**Detail:** The test asserts:
```
[DATA] data.configurationItems.configurationItems.0.sectionId = {{SECTION_RAM_ID}}
[DATA] data.configurationItems.configurationItems.0.productId = {{OPT_RAM_UPGRADE_ID}}
[DATA] data.configurationItems.configurationItems.1.sectionId = {{SECTION_STORAGE_ID}}
[DATA] data.configurationItems.configurationItems.1.productId = {{OPT_STORAGE_UPGRADE_ID}}
```

But the live response orders Storage at index 0 and RAM at index 1. The mutation response (`changeCartConfiguredItem.items.0.configurationItems`) has them in RAM-first order, so a backend ordering mismatch between mutation result and query result.

The `changeCartConfiguredItem` mutation itself works correctly (atomic update applied — quantity=3, both upgraded). The test fails on order-sensitive read-back assertions.

**Recommended fix (proposed, awaiting your approval):** Either
- (a) Drop the order-sensitive index reads on `read_back` and rely on `[COUNT] length = 2` + the deterministic mutation-response assertions, OR
- (b) Add ordering-tolerant assertion semantics to `graphql-assertions.ts` (`contains`/`includes` predicate)

(a) is faster and matches CFG-GQL-009's working pattern (which doesn't fail because backend happens to return RAM-first there — but is equally fragile in principle). (b) is the correct long-term fix but requires runner changes.

### F-3 — Advisory (not blocking, repeated from 050f review)

`BL-GQL-001/002` are still in proposed-not-promoted state in `business-logic.md`. Same status as other 050* suites; cross-suite `--update-bl` pass deferred.

## Quality Gates

| Gate | Status | Detail |
|------|:------:|--------|
| G1 Structure | **PASS** | 12×15, no dup IDs |
| G2 Determinism | **PASS** | All runner-native |
| G3 Completeness | **PASS** | 11/12 [ERRORS] checks; 1 disjunctive negative by design |
| G4 Testability | **WARN** | F-2: order-dependence in CFG-GQL-012 |
| G5 Data Validity | **PASS** | Zero hardcoded literals; 12/12 schema-valid |
| G6 Coverage | **WARN** | F-3 BL promotion deferred |
| G7 Duplication | **PASS** | No duplicates |
| G8 Environment | **FAIL** | F-1: real backend bug in remove* mutations |
| G9 Sync | N/A | Direct-scope |

6/9 required gates PASS; 1 FAIL (G8 due to F-1), 2 WARN.

## Verdict

**NEEDS FIXES** — quality of the suite itself is high (the parser-fix + alias-fix have done their job), but two distinct issues require action:

1. **F-1 is a real backend bug** — should be filed as a JIRA ticket. The test case is doing its job by detecting it.
2. **F-2 is a test-fragility fix** — proposed approach (a) above; awaiting your go/no-go before editing CFG-GQL-012.

Once F-1 has a tracking ticket and F-2 is patched, 050i is regression-ready.

## Files

- [regression/suites/Backend/graphql/050i-graphql-configurations.csv](regression/suites/Backend/graphql/050i-graphql-configurations.csv) — 12 cases
- [reports/test-lifecycle/TLC-2026-04-27-1300/live-runs.txt](reports/test-lifecycle/TLC-2026-04-27-1300/live-runs.txt) — full runner stdout (all 12)
- 12 per-case JSON evidence files at [reports/regression/graphql-evidence/](reports/regression/graphql-evidence/)
- Per-case evidence with mutation/read-back response bodies (used to diagnose F-1 and F-2)

## Next Steps

- [ ] **F-1 (must)** — File JIRA bug for silent no-op on `removeConfigurationItem` / `removeConfigurationItems`. Reference CFG-GQL-011 as repro case.
- [ ] **F-2 (must, awaiting your call)** — Patch CFG-GQL-012 read-back assertions per proposed approach (a) — drop the order-sensitive `.0.sectionId` / `.1.sectionId` rows; keep COUNT + mutation-response asserts.
- [ ] **F-3 (deferred)** — Cross-suite `--update-bl` pass to promote BL-GQL-001/002.
- [ ] After F-1 + F-2: re-run `npm run ci:regression -- 050i` to confirm 11/12 (10 pass + CFG-GQL-011 expected-fail under known bug, OR 12/12 if F-1 lands fix simultaneously).
