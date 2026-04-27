# Regression Report — 2026-04-24 (GraphQL xProfile + xFrontend)

**Runs on this date:**
- REG-2026-04-24-2327 — suite `050e` GraphQL xFrontend (pageContext) → 6/6 PASS (100%)
- REG-2026-04-24-2334 — suite `050d` GraphQL xProfile → 23/23 executed PASS (100%), 3 skipped (Draft)

**Mode:** Standard (script-based GraphQL runner — no browser slot)
**Environment:** https://vcst-qa.govirto.com (backend) · https://vcst-qa-storefront.govirto.com (storefront)

**Combined verdict:** ✅ **GO** — 29/29 executed cases pass, 2 open 050d bugs (Unicode + authZ bypass) confirmed **RESOLVED** at ProfileExperienceApiModule `3.1005.0-pr-129-2998`.

---

# Part 1 — REG-2026-04-24-2327 — suite 050e

**Selection:** `050e` (GraphQL xFrontend / pageContext)
**Started:** 2026-04-24T21:27:39Z
**Completed:** 2026-04-24T23:29:26Z

---

## Executive Summary

| Metric | Value |
|--------|-------|
| Suites | 1 / 1 passed |
| Test cases | 6 / 6 passed |
| **Pass rate** | **100.0%** |
| Failed | 0 |
| Blocked | 0 |
| Bugs filed | 0 |
| Duration | ~24s (runner) |

**Verdict:** ✅ GO — all `pageContext` schema invariants hold on current deploy. No open bugs, no regressions vs. knowledge/graphql-schema.md.

---

## Deploy State (vcst-qa)

| Component | Version | Change vs. REG-2026-04-23-2230 |
|-----------|---------|-------------------------------|
| Platform | `3.1023.0-pr-2987-9f4a-vcst-4710-9f4aa704` | unchanged |
| Theme | `2.48.0-pr-2219-d1d4-d1d4b74c` | d5f9 → **d1d4** |
| VirtoCommerce.Customer | `3.1007.0-alpha.976-vcst-4710` | unchanged |
| VirtoCommerce.ProfileExperienceApiModule | `3.1005.0-pr-129-2998` | pr-129-03f6 → **pr-129-2998** |
| VirtoCommerce.Shipping | `3.1003.0-pr-67-ae8e` | **new in vcst-qa** |
| VirtoCommerce.XFrontend | `3.1000.0` | stable |
| VirtoCommerce.WhiteLabeling | `3.1001.0` | stable |

---

## Suite Results

| ID | Name | Priority | Tests | Pass | Fail | Browser | Result |
|----|------|----------|-------|------|------|---------|--------|
| 050e | GraphQL xFrontend (pageContext) | P1 | 6 | 6 | 0 | none (runner) | ✅ PASS |

### Per-case results

| Case | Title | Priority | Result | Assertions | Note |
|------|-------|----------|--------|------------|------|
| GQL-052 | Homepage Slug Resolution | Critical | ✅ PASS | 4/4 | Store metadata populated (B2B-store, catalog fc596540…); empty permalink → entityInfo null (acceptable) |
| GQL-053 | CMS Permalink Resolution | Critical | ✅ PASS | 3/3 | `/search` permalink returns slugInfo structure; entityInfo null (pure route) acceptable |
| GQL-054 | Store Settings in Response | High | ✅ PASS | 4/4 | defaultLanguage=en-US, defaultCurrency=USD, availableLanguages/Currencies populated |
| GQL-055 | Anon vs Auth User Context | High | ✅ PASS | 4/4 | ORG_USER id=user-acme-store-maintainer-1, contact.firstName=François; anon differs |
| GQL-056 | Invalid Permalink | High | ✅ PASS | 2/2 | Bogus permalink → HTTP 200, entityInfo=null, no stack trace (BL-GQL-001 holds) |
| GQL-057 | Org-Scoped White Labeling | High | ✅ PASS | 3/3 | whiteLabelingSettings resolves; themePresetName=Coffee; logos null (no org WL config — acceptable) |

---

## Business Rule Coverage

| Rule | Case(s) | Status |
|------|---------|--------|
| BL-GQL-001 — No HTTP 500 on invalid input | GQL-052, GQL-053, GQL-055, GQL-056 | ✅ Verified |
| BL-GQL-002 — Store metadata invariants | GQL-052, GQL-054, GQL-057 | ✅ Verified |
| BL-GQL-004 — Auth context differentiation | GQL-055 | ✅ Verified |
| BL-B2B-001 — Org-scoped query isolation | GQL-057 | ✅ Verified |

## Edge Case Coverage

- **ECL-2.1** (graceful handling of valid-but-edge inputs) — exercised by GQL-052/053/054/055/057
- **ECL-9.1** (invalid/404-style input) — exercised by GQL-056

---

## Bugs

None. No regressions, no new bugs, no schema drift.

**Context:** Compared to REG-2026-04-23-2230 (suite 050d, 92.3% pass rate with 2 open bugs), this run of 050e is clean. The two open `050d` bugs (BUG-050d-001-v2 Unicode, BUG-050d-002 authz bypass) remain unchanged — outside 050e scope.

---

## Retry Log

No retries needed. All 6 cases passed on first attempt.

---

## Performance

- Total runner time: ~24s for 6 cases
- GraphQL response times: 186–1036ms (first anon call ~1s cold cache; subsequent 186–630ms)
- ORG_USER OAuth token acquisition: ~550–630ms

All within platform-patterns.md thresholds.

---

## Evidence

- Run JSON: `reports/regression/REG-2026-04-24-2327/suite-050e-results.json`
- Per-case evidence: `reports/regression/graphql-evidence/GQL-05{2..7}-*.json`
- Deploy state cache: `reports/deploy-state-cache.json`

---

## Notes

- Suite 050e is fully runner-native (`scripts/graphql-runner.ts`), executed without browser slots. Browser pool was unused for this run.
- No seed data was required; all pageContext queries are read-only against the existing B2B-store.
- Schema validated against cached introspection (`scripts/.graphql-schema.cache.json`) — no drift detected.

---

# Part 2 — REG-2026-04-24-2334 — suite 050d

**Selection:** `050d` (GraphQL xProfile — auth-security)
**Mode:** Standard (script-based GraphQL runner — no browser slot)
**Started:** 2026-04-24T21:34:30Z
**Completed:** 2026-04-24T21:37:08Z
**Duration:** ~2 min 38s (runner: 70s)

## Executive Summary (050d)

| Metric | Value |
|--------|-------|
| Suites | 1 / 1 passed |
| Test cases | 23 / 26 executed, 23/23 passed (3 skipped Draft) |
| **Pass rate (executed)** | **100.0%** (23/23) |
| Pass rate vs prior 050d (REG-2230) | 92.3% → **100.0%** |
| Failed | 0 |
| Blocked | 0 |
| Skipped | 3 (GQL-039, GQL-040, GQL-057 — Draft/MANUAL-BLOCKED in CSV) |
| New bugs | 0 |
| Prior bugs resolved | **2 of 2** (BUG-050d-001-v2, BUG-050d-002) |

**Verdict (050d):** ✅ GO — suite clean at ProfileExperienceApiModule `3.1005.0-pr-129-2998`. Both open bugs from REG-2230 confirmed resolved with fresh evidence.

## Deploy State (same as 050e — unchanged in 7 min window)

- Platform: `3.1023.0-pr-2987-9f4a-vcst-4710-9f4aa704`
- Theme: `2.48.0-pr-2219-d1d4-d1d4b74c` (was d5f9 at REG-2230)
- ProfileExperienceApiModule: **`3.1005.0-pr-129-2998`** (was `pr-129-03f6` at REG-2230)
- Customer: `3.1007.0-alpha.976-vcst-4710`

## Suite Result

| ID | Name | Priority | Tests | Pass | Fail | Skip | Runner | Result |
|----|------|----------|-------|------|------|------|--------|--------|
| 050d | GraphQL xProfile | P1 | 26 | 23 | 0 | 3 | runner-native (no browser) | ✅ PASS |

## Bug Status vs REG-2026-04-23-2230

| Bug | Severity | Case | Status at REG-2230 | Status at REG-2334 | Evidence |
|-----|----------|------|--------------------|---------------------|----------|
| BUG-050d-001-v2 | Medium | GQL-033 | FAIL (Unicode rejected) | **✅ RESOLVED** — Unicode accepted; `valid_unicode.succeeded=true`, `errors[]` empty | `graphql-evidence/GQL-033-1777066572888.json` |
| BUG-050d-002 | High | GQL-058 | FAIL (cross-member authZ bypass) | **✅ RESOLVED** — foreign zero-GUID memberId → `isDuplicated=false` (harmless), no leak, no 500 | `graphql-evidence/GQL-058-1777066625893.json` |

Orchestrator can transition both JIRA bug tickets to Verified/Closed with these evidence files.

## Case Diff vs REG-2026-04-23-2230

| Transition | Count | Cases |
|-----------|------:|-------|
| PASS → PASS | 20 | GQL-030, -031, -032, -038, -041, -042, -043, -044, -045, -046, -047, -048, -049, -050, -051, -052, -054, -055, -056, -059 |
| **FAIL → PASS** | **2** | **GQL-033** (Unicode fix), **GQL-058** (authZ fix) |
| **BLOCKED → PASS** | **1** | **GQL-053** (now uses USER2 personal account per CSV update) |
| SKIP → SKIP | 3 | GQL-039, GQL-040, GQL-057 (Draft) |

No regressions. No new bugs.

## Business Rule / Edge Case Coverage

- BL-GQL-001 (no HTTP 500 on invalid input) — verified across GQL-030/031/032/038/041-045/058/059
- BL-GQL-002 (schema invariants, OrganizationType) — GQL-047
- BL-GQL-004 (auth context differentiation) — GQL-030/031/032/033/038
- BL-B2B-001 (org-scoped queries; cross-member isolation) — GQL-047/052/053/058
- BL-AUTH-002 (registration happy path + password strength) — GQL-041/043/045
- BL-AUTH-003 (duplicate email rejected) — GQL-041
- BL-PROFILE-001 (duplicate-address guard) — GQL-054/055/056
- ECL-5.1 / ECL-14.1 / ECL-14.3 / ECL-3.2 / ECL-2.1 — exercised throughout

## Skipped Cases (Draft backlog)

| ID | Reason | Recommended action |
|----|--------|--------------------|
| GQL-039 | Needs runner dynamic-email primitive for personal-account registration | Add `@td(DYN.uuid)` / `@td(DYN.email)` primitive; then un-Draft |
| GQL-040 | Needs runner dynamic-email primitive + admin cleanup for org-account registration | Same as GQL-039 + admin delete post-run |
| GQL-057 | Needs second-org user alias (USER3 / alternate ORG_USER) | Add second org member to agent pool; then un-Draft |

## Retry Log

No retries needed. All 23 executable cases passed on first attempt.

## Evidence

- Run JSON: `reports/regression/REG-2026-04-24-2334/suite-050d-results.json`
- Per-case evidence (23): `reports/regression/graphql-evidence/GQL-0{30..59}-177706656*.json`

---

# Combined Notes

- Today's two GraphQL runs (050e + 050d) validate the current `vcst-qa` deploy across `xFrontend` (pageContext) and `xProfile` (identity, registration, addresses, auth). 29/29 executed cases pass.
- **ProfileExperienceApiModule `pr-129-2998`** resolves two previously-confirmed bugs: Unicode name validation (BUG-050d-001-v2) and cross-member authZ (BUG-050d-002). The earlier `pr-129-03f6` build was ineffective for these code paths; `pr-129-2998` works.
- No seed data required for either run; all cases are read-mostly or target existing ORG_USER/USER2 state from `.env`.
- No schema drift vs `.claude/agents/knowledge/graphql-schema.md`.
- Three 050d cases (GQL-039/040/057) remain Draft pending runner primitives; tracked as follow-up, not regressions.
