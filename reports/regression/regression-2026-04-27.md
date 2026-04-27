# Regression Report — 2026-04-27 (REG-2026-04-27-0919)

## Verdict: FAIL — but NOT a backend regression

| Metric | Value |
|--------|-------|
| Run ID | REG-2026-04-27-0919 |
| Selection | `050i` (single suite) |
| Started | 2026-04-27 09:19 UTC |
| Completed | 2026-04-27 09:23 UTC |
| Suites Pass / Fail | 0 / 1 |
| Cases Pass / Fail | **5 / 7 (41.7%)** |
| Root Cause | Test-infrastructure (runner parser) — backend health intact |
| New Bugs | 2 (1 High tooling, 1 Low test-data) |
| Backend Regression Detected | **No** |

---

## Deploy State (vcst-qa)

| Component | Version | vs Prior Run (REG-2026-04-24-2334) |
|-----------|---------|------------------------------------|
| Platform | 3.1025.0-pr-2987-eb8e-vcst-4710 | ↑ 9f4a → eb8e (PR-2987 advanced) |
| Theme | 2.48.0-pr-2219-d1d4 | unchanged |
| VirtoCommerce.Customer | 3.1007.0-pr-293-8ddd | source changed: alpha.976-vcst-4710 → PR-293 prerelease |
| VirtoCommerce.ProfileExperienceApiModule | 3.1005.0-pr-129-2998 | unchanged |
| VirtoCommerce.Shipping | 3.1003.0-pr-67-ae8e | unchanged |
| **VirtoCommerce.XCatalog** | 3.1004.0 | **unchanged (relevant for 050i)** |
| **VirtoCommerce.XCart** | 3.1009.0 | **unchanged (relevant for 050i)** |
| **VirtoCommerce.Xapi** | 3.1006.0 | **unchanged (relevant for 050i)** |
| **VirtoCommerce.Catalog** | 3.1020.0 | **unchanged (relevant for 050i)** |

The configurable-products GraphQL stack is **unchanged** since the last green run. Mutation-side code paths have not shipped a regression — they were simply not exercised this run because the runner parser blocked them before HTTP dispatch.

---

## Suite Results

| Suite | Name | Priority | Total | Pass | Fail | Pass Rate | Outcome |
|-------|------|----------|------:|-----:|-----:|----------:|---------|
| 050i | GraphQL Configurable Products | P1 | 12 | 5 | 7 | 41.7% | **FAIL** (tooling) |

### 050i — Per-Case Breakdown

| Case | Priority | Result | Notes |
|------|----------|--------|-------|
| CFG-GQL-001 | Critical | ✅ PASS | Happy-path two required Product sections (CFG_LAPTOP) — 7/7 assertions |
| CFG-GQL-002 | High | ✅ PASS | Non-configurable returns empty (CFG_HOODIE) — alias missing `id`, assertions pass coincidentally |
| CFG-GQL-003 | High | ✅ PASS | Zero-GUID graceful empty, no HTTP 500 |
| CFG-GQL-004 | Critical | ✅ PASS | Text section maxLength=30 returned (CFG_RING) — VCST-4806 / PR #2235 intact |
| CFG-GQL-005 | High | ✅ PASS | Conditional sections `dependsOnSectionId` cascade A→B→C+D verified (CFG_CONDITIONAL_BIKE / VCST-4713) |
| CFG-GQL-006 | Critical | ❌ FAIL | RUNNER_PARSER — `[GQL-OP] → [GQL-VARS] → body` ordering leaves OP query empty |
| CFG-GQL-007 | High | ❌ FAIL | RUNNER_PARSER — same root cause |
| CFG-GQL-008 | Critical | ❌ FAIL | RUNNER_PARSER — same root cause; `add_item.items[]` empty during setup (worth follow-up after parser fix) |
| CFG-GQL-009 | Critical | ❌ FAIL | RUNNER_PARSER — same root cause |
| CFG-GQL-010 | High | ❌ FAIL | RUNNER_PARSER — same root cause |
| CFG-GQL-011 | High | ❌ FAIL | RUNNER_PARSER — same root cause |
| CFG-GQL-012 | High | ❌ FAIL | RUNNER_PARSER — same root cause |

---

## Bugs

### BUG-050i-001 — High, tooling (test-infrastructure)

**Title:** `graphql-case-parser` leaves OP query empty when `[GQL-VARS]` immediately follows `[GQL-OP]`; subsequent mutation body lines are unrecognized.

**Affected:** CFG-GQL-006 .. 012 (7 cases blocked before HTTP).

**Root cause:** `scripts/lib/graphql-case-parser.ts:122-164`. The `[GQL-OP]` branch (line 122) absorbs continuation lines as the query body, but stops on any step tag (line 129). Since `[GQL-VARS]` is a step tag (line 142), an OP block authored as `[GQL-OP foo]\n[GQL-VARS foo] {...}\nmutation { ... }\n[GQL-EXEC foo]` ends up with an empty `query` field. The mutation body that follows VARS is then unrecognized and falls through. At `[GQL-EXEC]` time, `graphql-runner.ts:462` reports `has no matching [GQL-OP foo]` — misleading; the OP IS registered, just with empty body.

**Fix options (in preference order):**

1. **Parser fix (preferred):** in the GQL-VARS branch (lines 142-164), if continuation lines follow the inline JSON and the most-recent block is a GQL-OP with empty `query`, append them to that OP's body instead of dropping them.
2. **CSV authoring convention:** require mutation body INSIDE the `[GQL-OP]` block BEFORE `[GQL-VARS]`. Document in `.claude/skills/qa-methodology/qa-test-cases-generator/test-case-template.md` and re-author rows 6–12 of `regression/suites/Backend/graphql/050i-graphql-configurations.csv`.
3. **Better error message:** if OP query is empty at EXEC time, surface "OP block has empty query body — did you put `[GQL-VARS]` before the query body?" instead of the misleading "no matching" message.

**Owner:** scripts owner (parser fix) or test-management-specialist (CSV re-authoring).

**Verification:** Manual schema-validation of the 7 mutation bodies passed against live xAPI introspection — the queries themselves are well-formed. Backend not at fault.

---

### BUG-050i-002 — Low, test-data

**Title:** `CFG_HOODIE` alias is missing the `id` field in `test-data/aliases.json`.

**Affected:** CFG-GQL-002 (currently passing by coincidence).

**Observed:** Runner emitted `[test-data-resolver] Failed to resolve @td(CFG_HOODIE.id): Unknown field id on alias CFG_HOODIE. Available: name, slug, url, price`. The literal string `@td(CFG_HOODIE.id)` was sent as `configurableProductId` — backend treated it as not-found and returned empty `configurationSections`, satisfying the test's empty-sections invariant accidentally.

**Fix:** Add `"id": "product_id_guid"` to the `CFG_HOODIE` entry (currently lines 43-54 and a duplicate at 1018+). Verify against `test-data/products/configurable-products.csv` row CFG-003.

---

## Coverage Status

**Verified this run:**
- BL-GQL-001 (query path: happy / empty / invalid GUID — error contract intact)
- BL-CAT-006 (configurable product structure: required sections, types, options, maxLength, dependsOnSectionId)

**NOT verified this run (blocked by BUG-050i-001):**
- BL-GQL-001 (mutation path)
- BL-CART-001 (cart-bound configuration roundtrip)
- BL-PRICE-001 (configurable product price math: base + options sum)

A re-run of 050i is required after BUG-050i-001 is fixed to close the mutation-path coverage.

---

## Recommendations

1. **Fix BUG-050i-001 first.** Parser-side fix is preferred (re-authoring N CSV rows is fragile and the convention will trip future authors).
2. **Re-run 050i** end-to-end once the parser/CSV is corrected. Pay attention to CFG-GQL-008 setup — the agent observed `add_item.items[]` empty after a successful 200 OK, which may mask a real cart-state issue distinct from the parser bug.
3. **Spot-check 050a..050h** with `/qa-review-tests suite 050x` for the same step-block ordering — at minimum any case that uses GraphQL variables. The same parser pitfall is repo-wide.
4. **Add a parser self-test** (DV-style fixture) that authors `[GQL-OP]` followed immediately by `[GQL-VARS]` and asserts the OP body is preserved, so a regression cannot reach this state unnoticed.
5. **Patch test-data/aliases.json** to give `CFG_HOODIE` an `id` field while we're in the area.

---

## Artifacts

- Per-suite results: `reports/regression/REG-2026-04-27-0919/suite-050i-results.json`
- Status tracker: `reports/regression/test-run-status.json`
- GraphQL evidence (5 passing cases):
  - `reports/regression/graphql-evidence/CFG-GQL-001-1777281651143.json`
  - `reports/regression/graphql-evidence/CFG-GQL-002-1777281656534.json`
  - `reports/regression/graphql-evidence/CFG-GQL-003-1777281657922.json`
  - `reports/regression/graphql-evidence/CFG-GQL-004-1777281666389.json`
  - `reports/regression/graphql-evidence/CFG-GQL-005-1777281667953.json`
- Deploy state cache: `reports/deploy-state-cache.json`
