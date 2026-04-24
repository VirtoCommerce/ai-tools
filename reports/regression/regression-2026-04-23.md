# Regression Test Report — REG-2026-04-23-1700

## Executive Summary

| Field | Value |
|-------|-------|
| Run ID | REG-2026-04-23-1700 |
| Date | 2026-04-23 |
| Environment | https://vcst-qa-storefront.govirto.com |
| Backend | https://vcst-qa.govirto.com |
| Selection | 050d, 010, 006 (targeted: TLC-2026-04-23-1700 address management) |
| Deploy State | Platform 3.1023.0-pr-2987-9f4a-vcst-4710-9f4aa704 / Theme 2.48.0-pr-2219-d5f9-d5f99481 / Customer 3.1007.0-alpha.976-vcst-4710 / ProfileExperienceApiModule 3.1005.0-pr-129-03f6 |
| Total Suites | 3 (0 passed / 2 failed / 1 blocked) |
| Total Cases | 103 (54 passed / 4 failed / 10 skipped / 40 blocked) |
| Executable Cases | 63 (54 passed / 4 failed / 5 skipped, excluding 40 blocked by test data gap) |
| Executable Pass Rate | 93% (54/58 non-skipped executable) |
| Overall Pass Rate | 52% (54/103 — depressed by 40 blocked due to missing multi-org test data) |
| Quality Gate | Sprint Release Gate |
| Verdict | **BLOCKED** |

---

## Suite Results

| Suite | Name | Browser | Total | Pass | Fail | Skip | Block | Pass Rate | Attempts | Result |
|-------|------|---------|-------|------|------|------|-------|-----------|----------|--------|
| 050d | GraphQL xProfile | playwright-edge | 26 | 19 | 3 | 2 | 2 | 73% | 1 | FAILED |
| 010 | B2C Bulk Ship Dashboard | playwright-edge* | 38 | 33 | 1 | 8 | 1 | 87% | 1 | FAILED |
| 006 | B2C Organization | playwright-edge* | 39 | 2 | 0 | 0 | 37 | 100% (2/2 exec) | 1 | BLOCKED |

*playwright-chrome unavailable (user data dir conflict) — both suites executed on playwright-edge fallback per browser fallback chain rules.

---

## Bugs Found

| Bug ID | Suite | Case | Severity | Title | Business Rule |
|--------|-------|------|----------|-------|---------------|
| BUG-050d-001 | 050d | GQL-056 | High | updateMemberAddresses does NOT silently skip duplicate addresses — inserts duplicate instead | BL-PROFILE-001 |
| BUG-050d-002 | 050d | GQL-058 | High | checkDuplicateAddress allows cross-member authZ bypass — no error for foreign memberId | BL-B2B-001 |
| BUG-050d-003 | 050d | GQL-054 | Medium | checkDuplicateAddress returns isDuplicated=false for addresses that DO exist in the address book | — |
| BUG-010-001 | 010 | B2C-SHIP-014 | High | Addresses page: duplicate address silently inserted instead of skipped (cross-ref BUG-050d-001) | BL-PROFILE-001 |

**Bug summary: 3 High, 1 Medium. 0 P0. All 4 are P1.**

### Bug Details

**BUG-050d-001 / BUG-010-001 (cross-layer):** PR #129 `MemberAggregateRootBase.UpdateAddresses` duplicate-skip behavior is not working. Submitting an identical address via `updateMemberAddresses` inserts a second copy instead of silently skipping. `totalCount` increments (1→2), two identical entries appear in `items[]`, `errors[]` is empty. Affects both direct GraphQL API path (GQL-056) and storefront UI path (B2C-SHIP-014) — same server-side handler. Deploy: Customer 3.1007.0-alpha.976-vcst-4710 / ProfileExperienceApiModule 3.1005.0-pr-129-03f6.

**BUG-050d-002:** PR #129 `ProfileAuthorizationHandler` same-member check is not enforced on `checkDuplicateAddress`. Any authenticated user can pass a foreign `memberId` and probe another member's address data. Returns `isDuplicated=false` with no `errors[]`. SECURITY finding — cross-member data exposure. Deploy: ProfileExperienceApiModule 3.1005.0-pr-129-03f6.

**BUG-050d-003:** `checkDuplicateAddress` returns `isDuplicated=false` for an address that definitively exists in the address book (confirmed by GQL-041 update). Duplicate detection logic is non-functional — does not correctly identify existing addresses. Deploy: ProfileExperienceApiModule 3.1005.0-pr-129-03f6.

---

## Retry Log

No retries executed. All suites completed on first attempt (browser fallback from chrome to edge was used for suites 010 and 006, but this is a pre-dispatch assignment, not a retry).

---

## Test Data Gaps

| Gap | Affected Cases | Impact | Recommendation |
|-----|---------------|--------|----------------|
| No multi-org user in agent pool (`ORG_USER_EMAIL` empty) | B2C-ORG-001 through B2C-ORG-038 (37 cases) | Suite 006 mostly blocked — org switcher, cart isolation, pricing, address scoping across orgs untested | Seed a user belonging to TechFlow + BuildRight orgs; set `ORG_USER_EMAIL` in `.env` |

---

## Suite Details

### Suite 050d — GraphQL xProfile (73% pass rate)

26 cases: 19 passed, 3 failed, 2 skipped, 2 blocked.

**Failed cases:**
- GQL-054: `checkDuplicateAddress` returns `isDuplicated=false` for an existing address → BUG-050d-003
- GQL-056: `updateMemberAddresses` inserts duplicate instead of silently skipping → BUG-050d-001
- GQL-058: `checkDuplicateAddress` authZ bypass — foreign `memberId` accepted without error → BUG-050d-002

**Blocked cases:**
- GQL-035: `updatePersonalData` mutation schema mismatch — test case defect (signature mismatch), not product regression
- GQL-046: `storeId` not a valid argument on `currentCustomerAddresses` — test case defect

**Skipped cases:**
- GQL-055: First attempt failed due to missing `postalCode` in test data (test case defect); re-test passed — marked skipped for defect

**Notable passes (TLC-1700 scope):**
- GQL-057: PR #129 own-org access unbroken — `currentOrganizationAddresses` returns TechFlow org data (totalCount=26) correctly
- GQL-059: `checkDuplicateAddress` required field validation working (missing city/line1/countryCode all return schema validation errors, no 500s)
- GQL-051: Unauthenticated access returns `errors=[{message:'Access denied.'}]` — authZ enforced on `currentCustomerAddresses`
- GQL-053: Non-org-member `currentOrganizationAddresses` returns `totalCount=0` (empty, not 403) — correct

---

### Suite 010 — B2C Bulk Ship Dashboard (87% pass rate)

38 cases: 33 passed, 1 failed, 8 skipped, 1 blocked.

**Failed case:**
- B2C-SHIP-014: Duplicate address inserted instead of skipped → BUG-010-001 (cross-layer evidence from BUG-050d-001 / GQL-056 confirms same server-side handler)

**Blocked case:**
- B2C-BULK-005: SKU 6AF8SM0VPFV6 not in TechFlow virtual catalog — test data gap, not product regression

**Skipped cases (8):**
- B2C-SHIP-006 through B2C-SHIP-013: Out of scope for this targeted address management run

**Notable passes:**
- B2C-DASH-003: Org user (John Mitchell) does NOT see Addresses link in account sidebar — confirmed expected behavior per BL
- B2C-SHIP-001: Personal (no-org) user Mila Müller — /account/addresses loads correctly with 3 addresses
- B2C-SHIP-002: Add new address dialog opens with all required fields present; Create button disabled until required fields filled
- B2C-NOTIF-001 through B2C-NOTIF-011: All notification cases passed (11/11)
- B2C-POINTS-001, B2C-POINTS-002, B2C-LOY-001 through B2C-LOY-003: All loyalty/points cases passed

---

### Suite 006 — B2C Organization (100% of executable cases)

39 cases: 2 passed, 0 failed, 0 skipped, 37 blocked.

**Blocked (37 cases):** Precondition not met — no multi-org user available in agent pool. All cases requiring the org switcher, org search, cart isolation, pricing scoping, and address scoping across orgs are blocked. This is a test data gap, not a product defect. See Test Data Gaps section.

**Passed cases:**
- B2C-ORG-010: Single-org user has no org switcher — CONFIRMED. John Mitchell account menu shows only name + Logout; org name is static text in nav (not clickable). Expected per BL.
- B2C-ORG-039: XSS prevention on company info address form — CONFIRMED PASS. All three injection vectors blocked:
  - Description: `<script>alert(1)</script>` — server rejected, no script execution
  - City: `<img src=x onerror=alert(1)>` — server rejected, no onerror execution
  - Address: `<svg onload=alert(1)> 123 Main St` — server rejected, no onload execution
  - Server returned "Something went wrong. Please try again later." error toast
  - No alert dialog fired at any point; dialog remained open; no new row in table
  - Follow-up clean save (Description=Test Office, City=Beverly Hills, Address=123 Corporate Dr) succeeded; page reload showed table with plain-text addresses only — no XSS strings rendered as HTML

---

## Quality Gate Evaluation — Sprint Release Gate

**Gate: Section 2 — Sprint Release Gate** (≥95% P0+P1 pass rate, 0 open P0 bugs, 0 open P1 bugs)

| Criterion | Threshold | Actual | Status |
|-----------|-----------|--------|--------|
| Critical path pass rate (P0+P1 executable cases) | ≥95% | 93% (54/58) | FAIL — 2% below threshold |
| Open P0 bugs | 0 | 0 | PASS |
| Open P1 bugs | 0 | 4 (3 High + 1 Medium) | FAIL |
| Sprint ticket acceptance criteria (TLC-1700) | 100% verified | Partial — multi-org address scoping (B2C-ORG-004) not executable due to test data gap | INCOMPLETE |
| Regression suite pass rate | ≥90% | 050d: 73%, 010: 87% | FAIL (050d below threshold) |
| New security vulnerabilities | 0 | 1 (BUG-050d-002: cross-member authZ bypass on checkDuplicateAddress) | FAIL |

**Gate Enforcement Checklist:**

| Step | Action | Status |
|------|--------|--------|
| 1 | All planned suites executed | Yes — 050d, 010, 006 all completed |
| 2 | No skipped cases without documented reason | Yes — all skips documented |
| 3 | Failed cases reviewed — confirmed bugs vs. environment | Yes — 4 confirmed product bugs, 0 environment issues |
| 4 | P0 bug count = 0 | Yes — 0 P0 bugs |
| 5 | P1 bug count within threshold | No — 4 P1 bugs open (threshold: 0 for sprint gate) |
| 6 | Sprint ticket AC coverage | Incomplete — B2C-ORG-004 (address scope post org-switch) blocked by missing multi-org user |
| 7 | Regression suite results reviewed | Yes — 050d 73% (below 90%), 010 87% (below 90%) |
| 8 | Cross-browser testing | N/A — targeted sprint run; all suites on playwright-edge |
| 9 | Performance baseline | N/A — not in scope for targeted run |
| 10 | Security scan | Partial — BUG-050d-002 is a security finding (authZ bypass) |
| 11 | Overall pass rate vs. threshold | Executable: 93% (below 95%) |
| 12 | Verdict documented with evidence | Yes — this report + JSON files |

---

## Verdict: BLOCKED

**PR #129 (`VirtoCommerce.ProfileExperienceApiModule 3.1005.0-pr-129-03f6` + `Customer 3.1007.0-alpha.976-vcst-4710`) is NOT ready for deployment.**

**Blocking conditions:**

1. **BUG-050d-002 (SECURITY — P1 High):** `checkDuplicateAddress` has a cross-member authorization bypass. Any authenticated user can probe another member's address data by passing a foreign `memberId`. `ProfileAuthorizationHandler` same-member check from PR #129 is not enforced on this endpoint. This is a security vulnerability that must be resolved before deployment.

2. **BUG-050d-001 / BUG-010-001 (P1 High — cross-layer):** `updateMemberAddresses` inserts duplicates instead of silently skipping them. `BL-PROFILE-001` duplicate-skip invariant is broken at both the API layer (GQL-056) and storefront UI layer (B2C-SHIP-014). Both paths use the same `MemberAggregateRootBase.UpdateAddresses` handler.

3. **BUG-050d-003 (P1 Medium):** `checkDuplicateAddress` duplicate detection is non-functional — returns `isDuplicated=false` for addresses that exist in the address book.

4. **Suite 050d pass rate 73%** is below the 90% regression suite threshold.

5. **Executable pass rate 93%** is below the 95% sprint gate threshold.

**Incomplete coverage:**
- B2C-ORG-004 (org-switch address scope — TLC-1700 core case) could not be executed due to missing multi-org user in agent pool. Before re-run, `ORG_USER_EMAIL` must be configured with a user belonging to multiple organizations.

**What passed (PR #129 positives):**
- Own-org `currentOrganizationAddresses` access is unbroken (GQL-057 PASS, totalCount=26 for TechFlow)
- Cross-org override vector is absent (no `orgId` param in `currentOrganizationAddresses` schema)
- `currentCustomerAddresses` unauthenticated access returns `Access denied.` (GQL-051 PASS)
- `checkDuplicateAddress` required field validation works correctly (GQL-059 PASS)
- XSS prevention on company info address form works (B2C-ORG-039 PASS)

**Resolution path:**
1. Fix `ProfileAuthorizationHandler` same-member enforcement on `checkDuplicateAddress` (BUG-050d-002)
2. Fix `MemberAggregateRootBase.UpdateAddresses` duplicate-skip logic (BUG-050d-001)
3. Fix `checkDuplicateAddress` duplicate detection logic (BUG-050d-003)
4. Configure multi-org test user (`ORG_USER_EMAIL`) and re-run suite 006 to cover B2C-ORG-004
5. Re-run suites 050d and 010 after fixes; target ≥95% pass rate on executable cases and ≥90% per suite
