# BUG: `checkDuplicateAddress` Resolver Returns `isDuplicated: false` for Real UI Payloads — Pre-Submit Duplicate Warning Never Fires

**Severity:** Medium (UX degradation — no data leak or persistence hazard)
**Priority:** P2 — Non-blocking for PR #129 merge. Write-path dedup works (see "What Also Works" below) and provides the durable safety net. `checkDuplicateAddress` is a UX convenience, not a safety guard.
**Component:** `vc-module-profile-experience-api` — `CheckDuplicateAddressQuery` / `CheckDuplicateAddressQueryHandler`
**Module Version:** `VirtoCommerce.ProfileExperienceApiModule 3.1005.0-pr-129-03f6`
**PR:** [VirtoCommerce/vc-module-profile-experience-api #129](https://github.com/VirtoCommerce/vc-module-profile-experience-api/pull/129)
**JIRA:** VCST-4710
**Environment:** `{{BACK_URL}}` (QA) — `https://vcst-qa.govirto.com`
**Platform Version:** `3.1023.0-pr-2987-9f4a-vcst-4710-9f4aa704`
**Reported By:** Agentic QA — clean-state UI retest 2026-04-24

---

## Summary

`checkDuplicateAddress(memberId, address)` returns `isDuplicated: false` for storefront-format payloads even when a byte-identical address already exists on the member. The resolver is using a matcher that does not successfully recognise the real storefront payload as a duplicate.

The storefront would use this query to warn the user *before* they click Save ("You already have this address"). Because it always reports "not a duplicate", the warning never fires — the user clicks Save, and the write path's own dedup (`MemberAggregateRootBase.UpdateAddresses`) silently skips the insert. Net effect:
- No duplicate row is created (write-path dedup catches it — see BL-PROFILE-001, verified 2026-04-24).
- But the user gets no pre-submit warning.
- No data exposure, no persistence corruption.

## Concrete Reproduction (clean-state UI retest 2026-04-24)

### Pre-conditions
- BMW-Group organization (memberId `9d32a961-fe81-4243-a2d1-f6c9a317e5d3`) address book cleared to 0 rows via storefront UI delete.
- Signed in as `mutykovaelena@gmail.com` (memberId `eaa3cc59-...`), active org = BMW-Group.

### Step 1 — Create one canonical address via storefront UI
`/company/info` → Add new address → fill:
- Description: `QA canonical dedup test 2026-04-24`
- Country: `United States of America`, ZIP `12345`, State `Washington`, City `TestTown`
- Address `777 Canonical Ave`, Apt `Apt 42`
- Save.

Network payload sent (`UpdateMemberAddresses`):
```json
{
  "command": {
    "memberId": "9d32a961-fe81-4243-a2d1-f6c9a317e5d3",
    "addresses": [{
      "firstName": "", "lastName": "", "email": "",
      "organization": "", "postalCode": "12345",
      "countryCode": "USA", "countryName": "United States of America",
      "regionId": "WA", "regionName": "Washington",
      "city": "TestTown",
      "line1": "777 Canonical Ave", "line2": "Apt 42",
      "phone": "", "description": "QA canonical dedup test 2026-04-24",
      "name": "USA, Washington, TestTown, 777 Canonical Ave",
      "addressType": 3
    }]
  }
}
```
Result: `totalCount` 0 → 1. Evidence: `reports/bugs/open/evidence/storefront-after-submit-2-dedup-worked.png`.

### Step 2 — Query `checkDuplicateAddress` with the SAME payload (16 fields, InputMemberAddressType)
Using authenticated GraphiQL (Elena's JWT), same memberId, all fields identical:

```graphql
query CheckDupAgainstExisting {
  checkDuplicateAddress(
    memberId: "9d32a961-fe81-4243-a2d1-f6c9a317e5d3"
    address: {
      firstName: "", lastName: "", email: "",
      organization: "", postalCode: "12345",
      countryCode: "USA", countryName: "United States of America",
      regionId: "WA", regionName: "Washington",
      city: "TestTown",
      line1: "777 Canonical Ave", line2: "Apt 42",
      phone: "", description: "QA canonical dedup test 2026-04-24",
      name: "USA, Washington, TestTown, 777 Canonical Ave",
      addressType: 3
    }
  ) {
    isDuplicated
  }
}
```

**Expected:** `isDuplicated: true` — the stored row is byte-identical.
**Actual:** `isDuplicated: false`.

### Step 3 — Confirm dedup lives in the write path, not the query
Repeating the exact `/company/info → Add new address` flow a second time with byte-identical form input sends a second `UpdateMemberAddresses` mutation with a byte-identical 16-field payload. The server accepts it (HTTP 200) but stored address count stays at **1**, not 2. Write-path dedup works (BL-PROFILE-001 verified).

So the same InputMemberAddressType payload that the WRITE path successfully deduplicates is **not** being recognised as a duplicate by the READ-only `checkDuplicateAddress` resolver. The two code paths are not using the same matcher.

## Evidence
- `reports/bugs/open/evidence/storefront-addresses-clean-state-0rows.png` — BMW-Group clean state.
- `reports/bugs/open/evidence/storefront-form-filled-submit-1.png` — filled form before 1st Save.
- `reports/bugs/open/evidence/storefront-form-filled-submit-2.png` — byte-identical form before 2nd Save.
- `reports/bugs/open/evidence/storefront-after-submit-2-dedup-worked.png` — single row remains after 2nd Save (write-path dedup proven).
- Earlier GraphiQL screenshots showing `isDuplicated: false` against existing rows: `graphiql-checkdup-org-result.png`, `graphiql-checkdup-full-fields-response.png`, `graphiql-contact-existing-check-done.png`.

## Affected Query Schema (callable; semantics wrong)

```graphql
checkDuplicateAddress(
  memberId: String!
  address: InputMemberAddressType!
): AddressDuplicatedResultType   # returns { isDuplicated: Boolean! [, duplicateId: String?] }
```

## Root-Cause Hypothesis

The write path (`MemberAggregateRootBase.UpdateAddresses`) and the query path (`CheckDuplicateAddressQueryHandler`) are using different duplicate-detection logic. The write path's comparator correctly recognises byte-identical `InputMemberAddressType` inputs; the query path's does not.

Most likely causes (in priority order):

1. **Handler short-circuits to default `false`** — `IMemberAddressService.CheckDuplicateAsync(memberId, address)` may not be implemented, or may swallow an exception and return `new AddressDuplicatedResultType { IsDuplicated = false }`.
2. **Handler loads an empty collection** — if the member fetch doesn't include `MemberResponseGroup.WithAddresses`, then `member.Addresses` is empty or null, and the comparator has nothing to match against.
3. **Comparator keys off `Id` instead of field-equality** — the stored rows have server-assigned `Id` values; the incoming `InputMemberAddressType` has no `id` field in the query. If the matcher compares by `Id`, every incoming address is novel.

The productive next step is to add a log/breakpoint in `CheckDuplicateAddressQueryHandler.Handle(...)` and confirm: (a) is `_memberAddressService.CheckDuplicateAsync` actually called, (b) does it load the member's addresses, (c) what matcher does it use.

## Illustrative Fix (pseudo-diff — validate against actual code)

Reuse the SAME dedup comparator that `MemberAggregateRootBase.UpdateAddresses` uses on the write path, so the two code paths stay consistent.

```csharp
public async Task<AddressDuplicatedResultType> Handle(
    CheckDuplicateAddressQuery request,
    CancellationToken cancellationToken)
{
    // 1) Authorize: caller must be same member OR member of the target org
    var authResult = await _authorizationService.AuthorizeAsync(
        request.Principal,
        new ProfileAuthorizationRequirement(ProfileOperation.Read, request.MemberId));
    if (!authResult.Succeeded)
    {
        throw new AuthorizationException(
            $"Not authorized to check duplicates on member {request.MemberId}");
    }

    // 2) Load the member WITH addresses — not just the skeleton
    var member = await _memberService.GetByIdAsync(
        request.MemberId,
        MemberResponseGroup.WithAddresses.ToString());

    if (member == null || member.Addresses == null || member.Addresses.Count == 0)
    {
        return new AddressDuplicatedResultType { IsDuplicated = false };
    }

    // 3) Use the SAME field-equality comparator the write path uses
    var match = member.Addresses.FirstOrDefault(stored =>
        AddressDedupComparer.AreEqual(stored, request.Address));

    return new AddressDuplicatedResultType
    {
        IsDuplicated = match != null,
        DuplicateId = match?.Id,  // if the schema exposes duplicateId
    };
}
```

The critical change is that `AddressDedupComparer.AreEqual(...)` must be the identical static method / class used by `MemberAggregateRootBase.UpdateAddresses` for its `distinct` check. Single source of truth ensures the read path and write path agree on what "duplicate" means.

## Additionally — resolver is reachable unauthenticated

A side observation (same session): calling `checkDuplicateAddress` with no `Authorization` header returns HTTP 200 + `isDuplicated: false` rather than 401. Because the answer is constant-false, no information leaks — but anonymous probing should be blocked at the authentication boundary. Suggest requiring authentication on this resolver.

## What Also Works (do NOT regress)

The following behaviours were verified working in the same 2026-04-24 session and must stay working after the fix:

- **`updateMemberAddresses` silent-dup-skip (BL-PROFILE-001)** — both Contact path AND Organization path correctly skip byte-identical inserts. Clean-state retest on BMW-Group org: two identical `UpdateMemberAddresses` mutations sent, totalCount stayed at 1.
- **`currentCustomerAddresses` / `currentOrganizationAddresses`** — return the correct scoped rows.
- **`ProfileAuthorizationHandler` refactor** — same-org / same-member checks hold on the list queries.
- **Required-field validation on `checkDuplicateAddress`** — missing required fields produce a validation error (not silent false).

## Related Bugs / Cleanup

- `BUG-updateMemberAddresses-Single-Append-Dedup-Miss.md` — **supersede/close.** Earlier write-path "Org dedup fails" finding is now explained as test-data pollution: the curl-seed payloads had different `addressType` / empty `name` / different firstName-lastName than the storefront UI's 16-field payload, so strict field-equality correctly treated them as different records. Clean-state UI retest 2026-04-24 proves Organization write-path dedup works for real user flows.
- `BUG-ShipTo-Duplicate-Addresses-No-Deduplication.md` (2026-03-03) — PR #129's fix to this bug holds for the Organization path under the real storefront UI flow. Close pending storefront repro re-check.

## Suggested Test After Fix

- Add GQL-060 `checkDuplicateAddress` Happy Path Against Existing Contact Address → expect `isDuplicated: true`. (Currently FAIL.)
- Add GQL-061 `checkDuplicateAddress` Happy Path Against Existing Organization Address → expect `isDuplicated: true`. (Currently FAIL.)
- Keep GQL-056 (Contact write-path dedup) and add GQL-056b (Org write-path dedup) — both should PASS. (Org-branch test currently also PASSes — see BL-PROFILE-001 UI verification.)
- Keep GQL-059 (`checkDuplicateAddress` required-fields validation) — continues to work.
- Tighten GQL-058: the query should require authentication. Currently passes unauthenticated with constant-false response.
