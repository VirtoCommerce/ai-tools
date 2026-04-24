# Pre-Regression Quality Review — VCST-4710 Test Cases
**TLC Run:** TLC-2026-04-23-1700 (afternoon promotion)  
**Review Date:** 2026-04-23  
**Reviewer:** test-management-specialist  
**Scope:** 38 cases across 5 suites (CHK-087..106, GQL-048..059, CUST-063..064, B2C-SHIP-001/002/014, B2C-ORG-004)  
**Evidence base:** phase-5-results.json (live verification) + REG-2026-04-23-1700/summary.json (regression outcomes)

---

## Overall Verdict: READY_WITH_NOTES

No Blocker or Critical findings. The suite is executable as-is. Two High findings — GQL-055 missing postalCode and GQL-058 ambiguous foreign memberId — are quick fixes that should be applied before the next regression run to prevent a repeat skip and ensure the security test is reliable. The remaining findings are BL reference corrections and format nits.

The suite has already proven its value: REG-2026-04-23-1700 caught **3 real bugs and 1 Security finding** using cases from this batch.

---

## Dimension Summary

| Dimension | Status | Findings | Max Severity |
|-----------|--------|----------|-------------|
| G1 Structure | WARN | 3 | High |
| G2 Determinism | WARN | 4 | High |
| G3 Completeness | WARN | 3 | High |
| G4 Testability | WARN | 2 | Medium |
| G5 Data Validity | WARN | 5 | High |
| G6 BL/ECL Coverage | WARN | 4 | Medium |
| G7 Duplication | PASS | 1 | Informational |
| G8 Environment Verification | PASS | 0 | — |

---

## High-Value Cases (caught real bugs in REG-2026-04-23-1700)

### GQL-056 — HIGH-VALUE: Caught BUG-050d-001
- **Result:** FAIL
- **Bug:** `updateMemberAddresses` does NOT silently skip duplicate addresses — inserts duplicate instead
- **Evidence:** `reports/regression/REG-2026-04-23-1700/evidence/GQL-056-FAIL-duplicate-inserted.png` — totalCount went 1→2 after submitting identical address. Two identical '300 QA Lane, Chicago' entries in items[]. errors[] was empty (no server rejection).
- **Business Rule:** PROPOSED-BL-PROFILE-001 (PR #129 MemberAggregateRootBase.UpdateAddresses duplicate-skip not working)
- **Assessment:** Case logic is correct. The failing assertion `[COUNT] totalCount after mutation equals <COUNT_BEFORE>` is exactly the right test. The ambiguity in GQL-058's memberId construction is the only structural issue in this cluster.

### GQL-058 — HIGH-VALUE: Caught BUG-050d-002 (SECURITY)
- **Result:** FAIL
- **Bug:** `checkDuplicateAddress` allows cross-member authZ bypass — personal user token can probe another member's address data without error
- **Evidence:** API response: `isDuplicated=false` with NO `errors[]` when using John Mitchell's memberId (d0f765ba) with slot3 personal token
- **Business Rule:** BL-B2B-001 (org data isolation violated)
- **Assessment:** HIGH priority fix needed on the Step that constructs the foreign memberId. Currently reads "alter the last 2 digits of <OWN_MEMBER_ID> OR use TechFlow org member ID" — this should be pinned to `d0f765ba` from agent-user-pool.csv to guarantee repeatability. Without this, the test may return 'member not found' instead of the authZ bypass.

### B2C-SHIP-014 — HIGH-VALUE: Caught BUG-010-001
- **Result:** FAIL
- **Bug:** Addresses page: duplicate address silently inserted instead of skipped
- **Cross-layer evidence:** Both storefront UI path (B2C-SHIP-014) and direct GraphQL mutation (GQL-056) converge on the same server-side handler. Cross-layer corroboration strengthens confidence in BUG-050d-001 diagnosis.
- **Business Rule:** PROPOSED-BL-PROFILE-001
- **Assessment:** Case structure is sound. Priority `Medium` is appropriate (the underlying behavior is server-side, the UI case tests the integration path). The `PROPOSED-BL-PROFILE-001` reference should be retained as-is per project memory policy.

---

## G1 — Structure

**Status: WARN | 3 findings (all High)**

### Finding G1-001 — B2C-SHIP-001, B2C-SHIP-002, B2C-ORG-004 [High]
Business_Rule references `BL-B2C-003` and `BL-B2C-004` — these domain IDs do not exist in `business-logic.md`. The `BL-B2C` domain is not defined anywhere in the invariant catalog.

- B2C-SHIP-001: `BL-B2C-003` → should be `BL-B2B-001`
- B2C-SHIP-002: `BL-B2C-003` → should be `BL-B2B-001`
- B2C-ORG-004: `BL-B2C-004` → should be `BL-B2B-001`

All three cases test address scoping during org context operations, which is directly governed by BL-B2B-001 ("Org switching isolates cart, addresses, and lists").

---

## G2 — Determinism

**Status: WARN | 4 findings**

### Finding G2-001 — B2C-SHIP-001, B2C-SHIP-002 [High]
Steps use numbered list format (`1. [NAV] ...`, `2. [WAIT] ...`) instead of the required bare tag-prefix format (`[NAV] ...`). The test runner parses tags at line start; a leading number+period prefix may cause tag recognition failure or logging confusion.

### Finding G2-002 — CHK-106 [High]
Precondition contains non-deterministic human-approval gate: "OQ-8 resolved to confirm duplicate-check UI is in scope." There is no observable check an agent can perform to verify OQ-8 status. If the gate condition is unresolved, the case has no fail-fast behavior — it will either silently execute wrong steps or hang.

**Suggested fix:** Replace with concrete observable: "Before running: verify network call to `checkDuplicateAddress` fires during address field entry in popup. If no call observed, mark BLOCKED."

### Finding G2-003 — GQL-058 [High]
Foreign memberId construction is ambiguous: "alter the last 2 digits of <OWN_MEMBER_ID> (e.g. change trailing characters to simulate a foreign UUID) OR use the TechFlow org member ID from seed data." This produces non-deterministic behavior:
- "Altering last 2 digits" of a UUID does not guarantee the resulting ID belongs to a real member
- If the ID does not exist, `checkDuplicateAddress` may return "member not found" — which the test would PASS on (since it expects any error), but the authZ bypass would not be tested

**Suggested fix:** Pin to `d0f765ba` (John Mitchell's confirmed memberId from REG-1700 execution that triggered BUG-050d-002).

### Finding G2-004 — B2C-ORG-004 [Medium]
Step 4 mixes action and wait on the same logical line: `4. [ACT] Switch to Org B using org switcher [WAIT] Wait for org context to update`. These should be separate lines with distinct tags.

---

## G3 — Completeness

**Status: WARN | 3 findings**

### Finding G3-001 — GQL-055 [High]
Missing `postalCode` in the `checkDuplicateAddress` call input. `InputMemberAddressType.postalCode` is required (NonNull per `graphql-schema.md` line 487). This was the direct cause of the REG-1700 first-attempt skip: "failed due to missing postalCode in test data (test case defect). Re-test with postalCode: isDuplicated=false — PASS."

Without this fix the case will skip again in the next regression run.

### Finding G3-002 — CHK-106 [Medium]
`Business_Rule` is empty for a High-priority case. `PROPOSED-BL-PROFILE-001` is the most directly applicable rule (server-side duplicate-skip is the server guarantee that the UI duplicate-check query relies on). `BL-B2B-001` (org address isolation) is also applicable for the org context variant.

### Finding G3-003 — CUST-063, CUST-064 [Low]
`Cleanup` column is empty rather than explicitly `none`. Policy requires explicit declaration per test-case-template.md.

---

## G4 — Testability

**Status: WARN | 2 findings**

### Finding G4-001 — GQL-057 [Medium]
The "cross-org override" step is documentation prose embedded in a Step action rather than an executable instruction: "since currentOrganizationAddresses has no orgId arg (resolves from caller context), verify the response is always scoped to caller's org regardless of any attempt to override via headers."

This text cannot be executed by an agent — it reads as a comment. The assertions correctly verify `<OWN_ORG_COUNT> > 0` and items contain TechFlow data, which ARE testable. The issue is the step line that should either be removed or rewritten as an executable action.

### Finding G4-002 — GQL-058 [Medium]
One assertion path reads: "isDuplicated field returns null (data redacted) — PR #129 ProfileAuthorizationHandler enforces same-member check." Returning `isDuplicated=null` is listed as an alternative acceptable outcome to `errors[] non-empty`. This creates an ambiguous PASS condition: an agent that receives any non-true value for `isDuplicated` (false, null) would PASS the assertion, even though `isDuplicated=false` with no error is actually the BUG (as caught in REG-1700).

The assertion should be exclusive: `errors[] non-empty` is the required outcome; `isDuplicated=null` may only be acceptable IF `errors[]` is also non-empty.

---

## G5 — Data Validity

**Status: WARN | 5 findings**

### Finding G5-001 — GQL-055 [High]
Missing `postalCode` in Step input (same root as G3-001 — cross-cutting structural + data issue). The schema explicitly requires it.

### Finding G5-002 — GQL-046 [High — pre-existing, out of TLC-1700 scope]
Pre-existing defect outside VCST-4710 scope: GQL-046 uses `storeId` as an argument to `currentCustomerAddresses`. Schema (line 111) does not accept `storeId` on this query. The case was SKIPPED in REG-1700 with reason "Unknown argument storeId". This will continue causing skips in suite 050d until fixed. Noting here as it degrades the suite's pass rate.

### Finding G5-003 — GQL-050 [Medium]
Step passes `countryCodes: "US"` (ISO-2). The seed data (`techflow-org-addresses-state-20260423.json`) and live data use ISO-3 codes (`USA`, `GBR`, `HUN`). If `US` is not recognized, the filter returns an empty set — which masks whether the filter works at all. The case returned `totalCount=0` in REG-1700, which could be explained by either "user has no addresses" OR "wrong country code format."

### Finding G5-004 — B2C-SHIP-001, B2C-SHIP-002 [Low]
Hardcoded address values in B2C-SHIP-002 step 3 (`Jane, Doe, 456 New St, Springfield, IL, 62701`). Technically violates "no hardcoded data" rule. Acceptable as a fixed test fixture since these values are non-sensitive and environment-independent; annotation recommended.

### Finding G5-005 — GQL-048 [Medium — DV-012 Thin Field Selection]
The happy-path assertion in GQL-048 does select a broad field set (`id, city, countryCode, countryName, firstName, lastName, line1, line2, postalCode, regionId, regionName, phone, email, addressType, isDefault, isFavorite, description`). However, it omits `organization` field from the query. Per DV-012 policy, happy-path queries should request full field selection. `organization` is listed in the `MemberAddressType` response type. Low risk — the omission is unlikely to mask a bug — but noted for completeness.

---

## G6 — BL/ECL Coverage

**Status: WARN | 4 findings**

### Finding G6-001 — B2C-SHIP-001, B2C-SHIP-002, B2C-ORG-004 [Medium]
BL references are invalid (see G1-001). Same finding — invalid BL IDs degrade both structural and coverage dimensions.

### Finding G6-002 — CHK-087..CHK-106 [Medium]
`BL-CHK-001` is used as the Business_Rule for address popup cases. BL-CHK-001 governs "Guest vs authenticated checkout" — not address selection popup behavior. The reference is a stretch. No more specific BL invariant exists for the popup feature. Acceptable as a broad reference until a dedicated BL-ADDR-* invariant is created post-PR #129 stabilization.

### Finding G6-003 — CHK-106 [Medium]
Empty Business_Rule — see G3-002. PROPOSED-BL-PROFILE-001 is directly applicable and should be added.

### Finding G6-004 — PROPOSED-BL-PROFILE-001 [Tracked, not blocking]
`GQL-056` and `B2C-SHIP-014` both reference `PROPOSED-BL-PROFILE-001`. Per project memory (`feedback_business_logic_promotion.md`), this draft requires explicit per-entry user approval before promotion to `business-logic.md`. The reference is tracked and valid as a proposed ID. Not blocking for regression.

---

## G7 — Duplication

**Status: PASS | 1 Informational finding**

### Finding G7-001 [Informational]
`GQL-056` (GraphQL layer) and `B2C-SHIP-014` (Storefront UI layer) both test the same invariant (PROPOSED-BL-PROFILE-001: server-side duplicate-skip on updateMemberAddresses). This is expected and valuable cross-layer coverage — not a duplicate. DUP-003 pattern. No action needed.

---

## G8 — Environment Verification

**Status: PASS | 0 findings**

Phase 5 verification (TLC-2026-04-23-1700) confirmed:
- `/account/addresses` page loads for personal users with address data
- Add Address modal fields and behavior verified
- Sidebar `Addresses` link visibility correct (personal only, as expected)
- B2B org user redirect to dashboard confirmed (no data leak)
- 0 console errors across all verified targets

REG-2026-04-23-1700 live execution confirmed:
- CHK-* popup smoke cases: PASSED (GQL-048, GQL-049, GQL-050, GQL-051, GQL-052, GQL-053, GQL-057, GQL-059 all PASSED)
- CUST-063/064: PASSED (REST regression guard confirmed working)
- B2C-SHIP-001, B2C-SHIP-002: PASSED
- B2C-ORG-039: PASSED (XSS prevention)
- 3 bugs caught by in-scope cases (GQL-056, GQL-058, B2C-SHIP-014)

---

## Recommended Fixes Ranked by Priority

### Must Fix Before Next Regression

1. **GQL-055** — Add `postalCode: "00000"` to checkDuplicateAddress input in Steps. This caused a regression skip in REG-1700 and will repeat.

2. **GQL-058** — Replace ambiguous foreign memberId construction with explicit seed reference: use `d0f765ba` (John Mitchell from agent-user-pool.csv). Without this, the security test may not reliably reach the authZ bypass code path.

### Should Fix (before sprint release sign-off)

3. **B2C-SHIP-001** — Remove numbered list format from Steps. Fix Business_Rule: `BL-B2C-003` → `BL-B2B-001`.

4. **B2C-SHIP-002** — Same as above.

5. **B2C-ORG-004** — Fix Business_Rule: `BL-B2C-004` → `BL-B2B-001`.

6. **GQL-050** — Change `countryCodes: "US"` to `countryCodes: "USA"` (ISO-3, matching seed data).

7. **CHK-106** — Replace OQ-8 gate with observable precondition. Add `PROPOSED-BL-PROFILE-001` to Business_Rule.

### Nice to Have (track for next lifecycle run)

8. **GQL-046** — Remove invalid `storeId` arg from currentCustomerAddresses query (pre-existing defect, outside VCST-4710 scope, but causes repeated suite 050d skip).

9. **CUST-063, CUST-064** — Set `Cleanup = none` explicitly.

10. **GQL-057** — Move explanatory prose from Steps to References column for determinism compliance.

---

## Blocked Cases — Not Case Faults

| Case | Block Reason | Resolution Path |
|------|-------------|----------------|
| B2C-ORG-004 | No multi-org user in agent pool (ORG_USER_EMAIL = single-org only) | Seed multi-org user; set ORG_USER_EMAIL |
| CHK-094 | VCST-4992 open (column sort not wired) | Execute once VCST-4992 fix deployed |
| CHK-099 | VCST-4993 open (aria-label wrong text) | Execute once VCST-4993 fix deployed |
| CHK-100 | VCST-4994 open (mobile 375px clip) | Execute once VCST-4994 fix deployed |

---

## Go/No-Go Recommendation

**GO WITH NOTES.**

The 35 in-scope cases (excluding 3 VCST-blocked and B2C-ORG-004 test-data-blocked) are safe to execute in regression. Apply the 2 must-fix items (GQL-055 postalCode, GQL-058 memberId pinning) before execution to avoid a repeat skip and ensure the security test is deterministic.

The suite has demonstrated real value: 3 bugs + 1 security finding in the first REG run. The bugs it found (BUG-050d-001/002, BUG-010-001) are blocking the sprint gate — this is the suite working as intended.

Output files:
- `reports/test-lifecycle/TLC-2026-04-23-1700/pre-regression-review.md` (this file)
- `reports/test-lifecycle/TLC-2026-04-23-1700/pre-regression-review.json`
