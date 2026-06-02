# BUG: `updateMemberAddresses` Edit-Path Creates Duplicate Rows When User Edits An Address Into An Existing Row

**Severity:** High (durable data corruption — duplicate rows persisted to DB under normal user actions)
**Priority:** P1 — Blocker for PR #129 merge
**Component:** `vc-module-profile-experience-api` — `MemberAggregateRootBase.UpdateAddresses` (edit/update branch) / storefront `useMemberAddresses` composable
**Module Version:** `VirtoCommerce.ProfileExperienceApiModule 3.1005.0-pr-129-03f6`
**PR:** [VirtoCommerce/vc-module-profile-experience-api #129](https://github.com/VirtoCommerce/vc-module-profile-experience-api/pull/129)
**JIRA:** VCST-4710
**Environment:** `{{BACK_URL}}` (QA) — `https://vcst-qa.govirto.com`
**Platform Version:** `3.1023.0-pr-2987-9f4a-vcst-4710-9f4aa704`
**Discovered By:** User feedback + interactive storefront UI retest 2026-04-24
**Reported By:** Agentic QA

---

## Summary

When a user **edits** an existing saved address and changes enough fields that the edited row becomes byte-identical to another already-saved address on the same member, the server accepts the update without any collision check. Result: two byte-identical rows coexist in the member's address book, each with its own distinct `id`.

This bypasses the silent-dup-skip invariant (BL-PROFILE-001) that PR #129 ships for the **insert** path. The invariant does hold for inserts (verified via clean-state UI retest on the same day — two byte-identical `UpdateMemberAddresses` mutations sent, `totalCount` stayed at 1). But it does **not** hold on the **edit / update-by-key** path.

## Concrete Reproduction (clean-state storefront UI, 2026-04-24)

### Pre-conditions
- BMW-Group organization (`9d32a961-fe81-4243-a2d1-f6c9a317e5d3`) address book cleared to 0 rows.
- Signed in as `mutykovaelena@gmail.com`, active org = BMW-Group.

### Steps

**Seed two distinct addresses via `/company/info` → Add new address:**

| # | Line 1 | City | State | ZIP | Description |
|---|--------|------|-------|-----|-------------|
| Row 1 | `777 Canonical Ave` (Apt 42) | TestTown | Washington | 12345 | QA canonical dedup test 2026-04-24 |
| Row 2 | `123 Different Street` | Seattle | California | 98765 | EDIT-TARGET before-edit |

Both saves succeeded; `GetCurrentOrganizationAddresses` → `totalCount: 2`.

**Edit Row 2 to match Row 1 byte-for-byte:**
1. Click Row 2 Actions → Edit
2. Overwrite every field with Row 1's values: `line1=777 Canonical Ave`, `line2=Apt 42`, `city=TestTown`, `state=Washington`, `postalCode=12345`, `description=QA canonical dedup test 2026-04-24` (country already USA).
3. Click Save.

### Observed network mutation on Save

The storefront sends an `UpdateMemberAddresses` with a `key` field (the edited row's existing id):

```json
{
  "command": {
    "memberId": "9d32a961-fe81-4243-a2d1-f6c9a317e5d3",
    "addresses": [{
      "firstName": "", "lastName": "", "email": "", "organization": "",
      "postalCode": "12345",
      "countryCode": "USA", "countryName": "United States of America",
      "regionId": "WA", "regionName": "Washington",
      "city": "TestTown",
      "line1": "777 Canonical Ave", "line2": "Apt 42",
      "phone": "", "description": "QA canonical dedup test 2026-04-24",
      "name": "USA, Washington, TestTown, 777 Canonical Ave",
      "addressType": 3,
      "key": "109532d0-ac1a-4be4-98cb-d481a850334c"   // <-- present on edit, absent on insert
    }]
  }
}
```

Server response: HTTP 200, no `errors[]`, no validation warning.

### Observed result

`GetCurrentOrganizationAddresses` now returns `totalCount: 2` with **two byte-identical rows**:

```
Row A: 777 Canonical Ave, TestTown, Washington / 12345 / "QA canonical dedup test 2026-04-24"  (id = existing Row 1's id)
Row B: 777 Canonical Ave, TestTown, Washington / 12345 / "QA canonical dedup test 2026-04-24"  (id = 109532d0-...)
```

Storefront screenshot: `reports/bugs/open/evidence/storefront-edit-collision-2-duplicate-rows.png` — two identical lines in the Addresses table.

## Expected Result

On the edit/update path, the server MUST apply the same collision check as the insert path:

Option A (recommended — explicit error):
- Detect that the post-update state would have two rows with identical `InputMemberAddressType` field values.
- Reject the mutation with a validation error, e.g. `"DuplicateAddress"` / `"Another saved address already has these values"`.
- `errors[]` non-empty; storefront can surface a toast "This address is identical to another saved address. Please delete the other one first, or change a field."

Option B (silent merge — matches insert-path semantics):
- Detect the collision server-side.
- Delete the OTHER identical row (or keep only one), return `totalCount` reduced accordingly.
- No explicit error; storefront refreshes and shows one row.

Both options preserve BL-PROFILE-001 (no byte-identical duplicates in a member's address book after any write mutation). Option A is cleaner because it does not silently discard user-visible state.

## Actual Result

The update-by-key path applies the incoming values directly to the keyed record. It does not re-run the collision comparator after applying the update. The two byte-identical rows persist.

## Root-Cause Hypothesis

`MemberAggregateRootBase.UpdateAddresses` likely has two code paths:

1. **Insert path** — when incoming address has no `key` / `id` → check against existing addresses via field-equality comparator → skip insert if match. **This works** (BL-PROFILE-001 insert-path verified 2026-04-24 same session).
2. **Update path** — when incoming address has a `key` matching an existing row's id → replace the existing row's fields with the incoming values. **This does NOT run the collision comparator** against the OTHER rows after applying the update.

The fix is to run the collision comparator either (a) before applying the update — verify the incoming values don't match any *other* row — or (b) after applying the update — verify no two rows in the collection are now byte-identical. The existing comparator used by the insert path can be reused; the logic is "does the updated state of `Addresses` contain a duplicate".

## Illustrative Fix (pseudo-diff — validate against actual code)

```csharp
// MemberAggregateRootBase.cs (conceptual)
protected virtual void UpdateAddresses(IEnumerable<Address> incoming)
{
    foreach (var input in incoming)
    {
        if (!string.IsNullOrEmpty(input.Key))
        {
            var existing = Addresses.FirstOrDefault(a => a.Id == input.Key);
            if (existing == null) { /* treat as insert */ continue; }

            // Apply the update tentatively
            ApplyFields(existing, input);

            // NEW — verify no OTHER row now matches
+           var collision = Addresses
+               .Where(a => a.Id != existing.Id)
+               .FirstOrDefault(a => AddressDedupComparer.AreEqual(a, existing));
+           if (collision != null)
+           {
+               throw new ValidationException(
+                   $"Address update would duplicate existing address {collision.Id}");
+           }
        }
        else
        {
            // Insert path — existing silent-dup-skip behaviour
            if (Addresses.Any(a => AddressDedupComparer.AreEqual(a, input))) continue;
            Addresses.Add(input);
        }
    }
}
```

Reusing the same `AddressDedupComparer.AreEqual` keeps both paths consistent with BL-PROFILE-001.

## Evidence
- `reports/bugs/open/evidence/storefront-addresses-clean-state-0rows.png` — clean-state start.
- `reports/bugs/open/evidence/storefront-form-filled-submit-1.png` — Row 1 before first save.
- `reports/bugs/open/evidence/storefront-after-submit-2-dedup-worked.png` — insert-path dedup confirmed, still 1 row after 2nd byte-identical insert.
- `reports/bugs/open/evidence/storefront-edit-collision-form-filled.png` — edit form ready with Row 1's values.
- `reports/bugs/open/evidence/storefront-edit-collision-2-duplicate-rows.png` — result: 2 byte-identical rows.
- Full network trace captured in this session's Playwright log.

## Impact

- **User experience:** A user editing an address into an existing address silently ends up with duplicate entries in their address book. On checkout, the duplicate appears in the shipping/billing address selector as two identical options, with no way for the user to tell which is which (same `name`, same line, same description).
- **Data integrity:** Violates BL-PROFILE-001 (no byte-identical duplicates on a member's address book). Every user workflow that "tidies up" by editing-to-merge ends up creating duplicates instead.
- **Business rule:** BL-PROFILE-001 as currently written assumes the invariant holds after all write mutations. Either the invariant needs to be tightened to cover both insert and update paths (preferred), or the BL rule needs to be narrowed to insert-only (not preferred — duplicates still leak in).

## Related Bugs / Reports

- `BUG-checkDuplicateAddress-Non-Functional.md` — read-path pre-submit warning also non-functional. Together, this means users have NEITHER a pre-submit warning NOR a write-path safety net against the edit-collision case.
- `BUG-ShipTo-Duplicate-Addresses-No-Deduplication.md` (2026-03-03) — PR #129 partially fixed this for the insert path. This bug shows the edit path still leaves the door open.

## Suggested Tests After Fix

- **GQL-062** `updateMemberAddresses` Edit-To-Collision (Organization) — create 2 distinct addresses, edit one to byte-match the other, expect either `errors[]` non-empty OR `totalCount` stays at 1 (depending on chosen semantics). Storefront assertion: after Save, only 1 row visible.
- **GQL-063** `updateMemberAddresses` Edit-To-Collision (Contact) — same scenario on a Contact member.
- **GQL-064** `updateMemberAddresses` Edit Without Collision (regression guard) — edit one field of an address such that no other row matches; expect success and 1 row updated (not 2).
- **SF-023** Storefront edit-to-collision journey case — user creates 2 addresses, tries to edit one into the other, storefront shows error OR collapses to 1 row. No duplicates persisted in `currentOrganizationAddresses`.
