# BUG: `updatePersonalData` NameValidationPattern Rejects Unicode Accented Characters

**Severity:** High (i18n / data-quality)
**Priority:** P1 — blocks non-ASCII customers from updating their profile name
**Component:** `vc-module-profile-experience-api` — `UpdatePersonalDataCommand` / `NameValidationOptions`
**Module Version:** `VirtoCommerce.ProfileExperienceApiModule 3.1005.0-pr-129-03f6`
**JIRA:** Not yet filed (candidate). Originally tracked under VCST-4691 (PR #130) per case References.
**Environment:** `{{BACK_URL}}` (QA) — `https://vcst-qa.govirto.com`
**Platform Version:** `3.1023.0-pr-2987-9f4a-vcst-4710-9f4aa704`
**Discovered By:** GQL-033 in suite `050d-graphql-xprofile` (FAIL in REG-2026-04-23-2200 and REG-2026-04-23-2230)
**Date:** 2026-04-23
**Reported By:** Agentic QA (qa-backend-expert)

---

## Summary

The `updatePersonalData` GraphQL mutation's `NameValidationPattern` rejects valid international names containing **Unicode accented characters** (e.g. `François`, `Müller`, `O'Brien-Müller`) as if they were XSS payloads. ASCII-only names — even those with apostrophes and hyphens (e.g. `O'Brien-Smith`) — are accepted.

This blocks legitimate users with non-English names from setting or updating their profile name. It is also inconsistent with what the test case asserts (per Assertions column: _"accents (ç, ö), apostrophes, hyphens all permitted"_ — matching the PR's original intent under VCST-4691).

## Affected Mutation

`updatePersonalData(command: InputUpdatePersonalDataType!)`

Validator: `NameValidationPattern` applied to `firstName` / `lastName` fields.

## Steps to Reproduce

### 1. Obtain an auth token for a personal user

```http
POST {{BACK_URL}}/connect/token
Content-Type: application/x-www-form-urlencoded

grant_type=password&scope=offline_access&username=USER_EMAIL&password=USER_PASSWORD&storeId={{STORE_ID}}
```

Paste the `access_token` into the GraphiQL Headers tab as `{"Authorization": "Bearer <token>"}`.

### 2. Send the mutation with Unicode accents

At `{{BACK_URL}}/ui/graphiql`:

```graphql
mutation {
  updatePersonalData(command: {
    personalData: {
      firstName: "François"
      lastName: "O'Brien-Müller"
    }
  }) {
    succeeded
  }
}
```

### 3. Observed response (FAIL)

```json
{
  "data": { "updatePersonalData": null },
  "errors": [
    {
      "message": "Validation failed: FirstName does not match NameValidationPattern",
      "path": ["updatePersonalData"],
      "extensions": { "code": "VALIDATION_ERROR" }
    }
  ]
}
```

- `errors[]` is non-empty.
- The profile name is NOT updated.
- Both `firstName: "François"` (contains `ç`) and `lastName: "O'Brien-Müller"` (contains `ü`) trigger the rejection. Submitting only `ç` or only `ü` in either field reproduces the same error.

### 4. Control — ASCII-only name is accepted

```graphql
mutation {
  updatePersonalData(command: {
    personalData: {
      firstName: "Francois"
      lastName: "O'Brien-Smith"
    }
  }) {
    succeeded
  }
}
```

→ `errors: []`, `data.updatePersonalData.succeeded = true`. The name is saved.

This confirms the issue is **specifically the accented / diacritical characters**, not the apostrophe or hyphen.

## Expected Result

`NameValidationPattern` should accept Unicode letters from the Latin-1 and Latin-Extended blocks (and ideally all `\p{L}` / `\p{M}` letter + mark categories). Specifically:

- Latin Extended: `ç`, `ü`, `ö`, `é`, `è`, `ñ`, `å`, `ø` and the standard set of European diacritics.
- Apostrophe `'` and hyphen `-` (currently accepted).
- Space for compound names.

Only characters that can carry an injection payload should be rejected — `<`, `>`, `&`, `"`, script/SVG/HTML tokens — which is already the case for the XSS control (`<svg onload=alert(1)>` → correctly rejected).

## Actual Result

The current `NameValidationPattern` appears to allow only `[A-Za-z'\- ]` or similar ASCII-restricted range. Accented characters are rejected with the same validation error as XSS payloads, conflating "international name" with "injection attack".

## Root-Cause Hypothesis

The validator likely uses a regex like:

```regex
^[A-Za-z '\-]+$
```

or equivalent. A Unicode-aware alternative that preserves XSS protection:

```regex
^[\p{L}\p{M}'\- ]+$
```

(`\p{L}` = any Unicode letter; `\p{M}` = combining mark. This is the same approach already used by `OrganizationNameValidationPattern` per GQL-030: `^[\p{L}\p{M}\p{N}\s'\-\.&#/|()]+$`.)

Suggested fix location:

- File likely under `src/VirtoCommerce.ProfileExperienceApiModule.Data/Validators/` or a `NameValidationOptions` / `PersonalDataValidator` class.
- Align the regex with `OrganizationNameValidationPattern` used elsewhere in the same module — the org-name validator already handles Unicode correctly.

Illustrative patch:

```csharp
// NameValidationOptions.cs (pseudo-diff)
public class NameValidationOptions
{
-    public string Pattern { get; set; } = @"^[A-Za-z'\- ]+$";
+    // Permit Unicode letters + marks (accents/diacritics), apostrophes, hyphens, spaces.
+    // Use RegexOptions.Compiled | RegexOptions.CultureInvariant when matching.
+    public string Pattern { get; set; } = @"^[\p{L}\p{M}'\- ]+$";
     public int MaxLength { get; set; } = 64;
}
```

## Evidence

- Test case: `regression/suites/Backend/graphql/050d-graphql-xprofile.csv` (GQL-033). Assertions explicitly expect Unicode to pass: _"accents (ç, ö), apostrophes, hyphens all permitted"_.
- Originating ticket / PR: VCST-4691 / PR #130 (per the case's References column — the intended behavior was already specified when the validator was introduced).
- Regression runs confirming failure:
  - REG-2026-04-23-2200 — GQL-033 FAIL
  - REG-2026-04-23-2230 — GQL-033 FAIL (same failure)
- Results JSON: `reports/regression/REG-2026-04-23-2230/suite-050d-results.json` (GQL-033 entry includes exact request/response).

## Business Impact

- **Users blocked:** Anyone whose legal name contains an accent character cannot update their storefront profile name at all. Examples from common European markets: ~40% of French names, most German names with `ä/ö/ü/ß`, ~30% of Spanish names (`ñ`, accents), most Nordic names.
- **Data inconsistency:** Customers may be forced to store an ASCII transliteration in the storefront while their actual name (and the name that appears on orders/invoices from admin) is the correct Unicode version.
- **Regression from intent:** PR #130 (VCST-4691) explicitly claimed to accept Unicode names. This test case has been passing that expectation since promotion; current behavior is a regression relative to the documented intent.

## Relation to PR #129

**Not caused by PR #129.** GQL-033 targets `updatePersonalData` (profile), not the new address queries from PR #129. This defect is a separate pre-existing issue that surfaced during the VCST-4710 regression run on the same suite. It should be filed as an independent JIRA ticket, not as a PR #129 blocker.

## Suggested Test After Fix

- Re-run GQL-033 — both the XSS rejection and Unicode acceptance assertions must pass in the same run.
- Add boundary cases:
  - Purely accent-only name: `Müller` alone.
  - Non-Latin scripts (Cyrillic, Chinese, Japanese): currently unknown whether the validator rejects them; if the intent is broad i18n support, they should also be accepted.
  - Edge: a name starting with a combining mark (`\p{M}`) — should reject (orphan mark) or normalize.
