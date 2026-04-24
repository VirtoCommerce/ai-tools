# VCST-4710 — QA Comment (ready to paste into JIRA)

**Subject:** QA verdict on PR #129 — DO NOT MERGE. 2 defects confirmed: 1 blocker (edit-path dedup) + 1 non-blocking UX (checkDuplicateAddress non-functional).

---

### Deploy under test
- Platform: `3.1023.0-pr-2987-9f4a-vcst-4710-9f4aa704`
- Theme: `2.48.0-pr-2219-d5f9-d5f99481`
- `VirtoCommerce.ProfileExperienceApiModule`: `3.1005.0-pr-129-03f6` (PR #129 artifact deployed)
- `VirtoCommerce.Customer`: `3.1007.0-alpha.976-vcst-4710`

### QA Verdict: **FAIL — PR #129 is not mergeable as-is**

One blocker (BL-PROFILE-001 violation on edit path) and one non-blocking UX defect (pre-submit warning query always returns false). Both reproduced end-to-end with full storefront UI + network evidence captured 2026-04-24 from a clean-state BMW-Group org.

---

### BLOCKER — `updateMemberAddresses` edit-path does NOT dedupe post-edit collisions

Local report: `reports/bugs/open/BUG-updateMemberAddresses-Edit-Collision.md`
Evidence: `reports/bugs/open/evidence/storefront-edit-collision-*.png`

**Reproduction (real user flow via storefront `/company/info`):**
1. BMW-Group address book cleared to 0 rows.
2. Via UI, create Row 1: `777 Canonical Ave, TestTown, Washington, 12345, "QA canonical dedup test 2026-04-24"`.
3. Via UI, create Row 2: `123 Different Street, Seattle, California, 98765, "EDIT-TARGET before-edit"`.
4. Click Actions → Edit on Row 2. Overwrite every field to match Row 1 byte-for-byte. Save.

**Expected:** Write-path rejects (`errors[]`) or silently merges — end-state has 1 row.
**Actual:** HTTP 200, no errors. End-state has **2 byte-identical rows** with different `id`s — visible in the Addresses table as two identical lines, both of which appear in the checkout address picker with no way for the user to tell them apart.

**Likely root cause** (please validate in `MemberAggregateRootBase.UpdateAddresses`): the insert branch correctly calls the field-equality dedup comparator — verified working in the same session for byte-identical insert submissions (`totalCount` 0 → 1 → 1). The **update-by-key branch** skips the comparator: it applies the incoming fields to the keyed record without checking whether the post-update state contains two identical rows.

**Suggested fix:** reuse the same comparator on the update branch. Either run it pre-apply ("does the incoming payload match any OTHER row? → reject") or post-apply ("does the collection now contain a duplicate? → reject/merge"). Pseudo-diff in the bug report.

**Business rule impact:** violates BL-PROFILE-001 (no byte-identical duplicates in a member's address book). Every user tidying workflow that edits-to-merge will instead create duplicates.

---

### NON-BLOCKING — `checkDuplicateAddress` resolver returns `isDuplicated: false` for existing rows

Local report: `reports/bugs/open/BUG-checkDuplicateAddress-Non-Functional.md`

With Row 1 saved from the step above, calling `checkDuplicateAddress` with the same 16-field `InputMemberAddressType` payload returns `isDuplicated: false` — even though the row is already stored and the write path (via `updateMemberAddresses`) correctly recognises the same payload as a duplicate on insert.

The two code paths (read-path `CheckDuplicateAddressQueryHandler` and write-path `MemberAggregateRootBase.UpdateAddresses`) are using different matchers. The read path is likely either (a) a stub returning default false, (b) not loading `member.Addresses` before comparing, or (c) comparing by `Id` instead of fields.

**Impact:** the UI pre-submit warning use-case (storefront AC-13) can never trigger. Combined with the BLOCKER above, the user has NEITHER an early warning NOR a write-path safety net on the edit path — the edit-collision scenario silently writes dupes.

**Suggested fix:** reuse the same `AddressDedupComparer` the write path uses. Also require authentication on the resolver (currently reachable anonymously with HTTP 200 + constant-false).

---

### What PR #129 got right (verified 2026-04-24, do NOT regress)

- **`updateMemberAddresses` insert-path dedup — BOTH Contact AND Organization paths** correctly silent-skip byte-identical inserts. Clean-state UI retest on BMW-Group: two byte-identical `UpdateMemberAddresses` mutations sent, `totalCount` stayed at 1 after both. (This supersedes my earlier "Org-path dedup is broken" finding — it was a test-data-pollution artifact. The Organization insert path works for real storefront UI flows.)
- `currentOrganizationAddresses` / `currentCustomerAddresses` — return correctly-scoped results with full field set and `term_facets` for search UX.
- `updateMemberAddresses` input validation — XSS rejection, `NameValidationPattern`, required fields — continues to work.
- `ProfileAuthorizationHandler` refactor — same-org / same-member checks hold on the list queries; no cross-org leak observed.
- `checkDuplicateAddress` required-field validation — missing required → validation error (not silent false).

### What needs fixing before merge

1. `MemberAggregateRootBase.UpdateAddresses` — **edit-branch**: run the field-equality comparator before/after applying the update; reject or silently merge on collision. Unify semantics with the insert branch.
2. `CheckDuplicateAddressQueryHandler` — actually compare against stored addresses using the SAME comparator the write path uses; return correct `isDuplicated` boolean (plus `duplicateId` if the schema supports it); require authentication on the resolver.
3. Unit test coverage:
   - Insert (already working, regression guard): two byte-identical inserts → `Addresses.Count` unchanged.
   - Edit (currently broken): create two distinct addresses → edit one to match the other → expect rejection or count collapse to 1.
   - `checkDuplicateAddress`: happy-path against existing Contact AND Organization addresses → expect `isDuplicated: true`.
4. Re-test against `BUG-ShipTo-Duplicate-Addresses-No-Deduplication` storefront repro before closing that ticket.

### QA regression-suite coverage added this cycle
- `050d-graphql-xprofile.csv` — 4 new cases GQL-056..059 (dedup happy-path, authZ, required-fields). Recommend adding GQL-060 (`checkDuplicateAddress` happy-path against existing address) + GQL-062 (edit-to-collision guard) after the fix.
- `010-b2c-bulk-ship-dashboard.csv` — B2C-SHIP-014 + synced 2 cases
- `006-b2c-organization.csv` — synced B2C-ORG-004 for PR #129 authz refactor regression
- `026-customer-contacts.csv` — CUST-063/064 admin REST regression guard
- `011-checkout-flow.csv` — CHK-087..106 (checkout popup) + CHK-107/108 (journey cases)
- Total: 35 promoted VCST-4710 cases + 2 journey cases + 3 sibling cases synced
- Recommend: add SF-023 journey case for edit-to-collision (user creates 2 addresses via UI, edits one into the other, expects no duplicates persisted).

### Side finding (unrelated to PR #129 — separate ticket recommended)
`updatePersonalData` `NameValidationPattern` rejects Unicode accented characters (`François`, `Müller`) as if they were XSS. Blocks international names. Report: `reports/bugs/open/BUG-updatePersonalData-NameValidation-Rejects-Unicode-Accents.md`. Not in PR #129 scope (owned by VCST-4691 / PR #130).

### Artifacts for reviewers
- Bug reports:
  - `reports/bugs/open/BUG-updateMemberAddresses-Edit-Collision.md` (blocker)
  - `reports/bugs/open/BUG-checkDuplicateAddress-Non-Functional.md` (non-blocker)
- Storefront UI evidence screenshots: `reports/bugs/open/evidence/storefront-*.png` (7 files — clean-state, form-filled, after-save, edit-collision form, edit-collision result)
- GraphiQL session screenshots (root): `graphiql-orgaddr-result.png`, `graphiql-checkdup-*.png`, `graphiql-contact-*.png`
- Lifecycle + regression reports: `reports/test-lifecycle/TLC-2026-04-23-1700/` and `reports/regression/REG-2026-04-23-{1700,2200,2230,2300,2400}/`
