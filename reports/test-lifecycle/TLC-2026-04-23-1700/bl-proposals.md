# Business Logic Proposals — TLC-2026-04-23-1700

These are drafts. They are NOT applied to `.claude/agents/knowledge/business-logic.md`.
Review, edit as needed, assign the final `BL-*` ID, and commit manually.

Per project memory (`feedback_business_logic_promotion.md`): business-logic.md is never auto-edited; `PROPOSED-BL-*` drafts require explicit per-entry user approval before promotion.

---

## New Invariants Proposed

### PROPOSED-BL-PROFILE-001: Silent duplicate-skip on updateMemberAddresses `[P1-data]` — **PROMOTED 2026-04-23 → BL-PROFILE-001**

> **Status: PROMOTED** to `.claude/agents/knowledge/business-logic.md` as BL-PROFILE-001 under new **Domain 14: Profile & Member Data (BL-PROFILE)**. Current implementation violates the invariant (see `reports/bugs/open/BUG-updateMemberAddresses-Single-Append-Dedup-Miss.md`). The BL represents intended behavior; tests GQL-056 and B2C-SHIP-014 assert it and currently FAIL — correctly catching the code defect.


- **Rule:** When `updateMemberAddresses` (xProfile GraphQL mutation) is called with an address object whose key fields (`line1` + `city` + `countryCode` + `postalCode` + `regionId` + `addressType`) exactly match an already-saved address on the same member, the duplicate address MUST be silently skipped — no new record inserted, no error raised in `errors[]`, and the total address count for the member MUST remain unchanged. The mutation returns success.
- **Verify:**
  1. Query `currentCustomerAddresses(first: 50)` — record `totalCount` = N and pick one address's exact fields.
  2. Call `updateMemberAddresses(command: { memberId: <self>, addresses: [{...identical fields}] })`.
  3. Re-query `currentCustomerAddresses(first: 50)` — assert `totalCount` == N (unchanged).
  4. Assert mutation response `errors[]` is empty.
- **Violation signal:** `totalCount` increases to N+1 after duplicate submission; OR a new address row with identical key fields appears in the list; OR the mutation throws a uniqueness/validation error instead of silently skipping.
- **Agents:** qa-backend-expert (GraphQL layer), qa-frontend-expert (Add Address UX that builds on this invariant).
- **Source:**
  - PR #129 — https://github.com/VirtoCommerce/vc-module-profile-experience-api/pull/129
  - `MemberAggregateRootBase.UpdateAddresses` — file `src/VirtoCommerce.ProfileExperienceApiModule.Data/Aggregates/MemberAggregateRootBase.cs` (+25, -1 in PR #129)
  - Cursor bugbot summary: "updates `MemberAggregateRootBase.UpdateAddresses` to avoid inserting duplicate addresses (based on key address fields), with a new unit test to cover this behavior"
- **Triggered by cases:** GQL-056 (API silent-skip direct assertion), B2C-SHIP-014 (UX integration — duplicate prevention on /account/addresses form)
- **Notes / open questions for reviewer:**
  - The exact set of "key address fields" used for duplicate matching should be confirmed against the PR's unit test (`tests/VirtoCommerce.ProfileExperienceApiModule.Tests/Aggregates/MemberAggregateRootBaseTests.cs`, +80 lines in PR). If the matcher uses a narrower or wider set than assumed, narrow the Rule accordingly.
  - Relationship to new `checkDuplicateAddress` query: the query lets the UI detect duplicates BEFORE submission, but this BL enforces the server-side guarantee that even if UI skips the check, the server will not insert a duplicate. The two are complementary.
  - Consider pairing with a BL for `checkDuplicateAddress` itself (query returns `isDuplicated=true` for matching address). Not proposed here because it's an informational read rather than a state invariant — consult team.

---

## Stale BL-* Flagged

None. PR #129 is a net-add of behavior; no existing BL-* was observed to contradict current behavior.

---

## Reviewer checklist (before promotion)

- [ ] Decide final ID — `BL-PROFILE-001` is proposed (no existing `BL-PROFILE-*` domain found in quick scan). Alternatives: `BL-GQL-003` (if preferred to group with other GraphQL invariants) or `BL-ADDR-001` (new address-management domain).
- [ ] Confirm "key address fields" set by reading the new unit test (`MemberAggregateRootBaseTests.cs` +80 lines).
- [ ] Verify the Rule still holds on main after PR #129 is merged (currently OPEN).
- [ ] If promoted, update `GQL-056` and `B2C-SHIP-014` `Business_Rule` column to the final ID.
