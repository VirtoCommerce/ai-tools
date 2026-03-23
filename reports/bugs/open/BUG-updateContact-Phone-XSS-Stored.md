# BUG: updateContact Mutation Accepts HTML/XSS in Phone Fields (Stored XSS)

**Severity:** Critical
**Component:** Profile / Contact Management
**Browser:** N/A (GraphQL API)
**Environment:** QA (`BACK_URL`)
**USER_EMAIL:** .env
**USER_PASSWORD:** .env
**Date:** 2026-03-21
**Reported By:** QA Agent (automated regression — SYNC-2026-03-21-1600)

## Steps to Reproduce

1. Authenticate as a registered user via `POST {BACK_URL}/connect/token`
2. Execute the following GraphQL mutation against `{BACK_URL}/graphql`:

```graphql
mutation {
  updateContact(command: {
    id: "<contact-id>"
    firstName: "Test"
    lastName: "User"
    phones: ["<img src=x onerror=alert('xss')>"]
  }) {
    id
    phones
  }
}
```

3. Observe that the mutation succeeds — phone value is stored with the HTML/XSS payload
4. Query the contact back — the malicious payload is persisted in the `phones` array

## Expected Result

The `updateContact` mutation should reject HTML tags and script injection patterns in phone fields, returning a validation error (HTTP 400 / `errors[]`), consistent with the new `InputValidationOptions` behavior introduced in PR #130.

## Actual Result

The mutation accepts and stores arbitrary HTML/XSS payloads in the `phones` array. The value `<img src=x onerror=alert('xss')>` is persisted without any validation. If this phone value is rendered in the storefront or admin UI without proper output encoding, it results in **Stored XSS**.

## Evidence

- **Regression test:** GQL-031 (`updateContact` Mutation Rejects HTML in Phone/Address) — FAIL
- Console errors: N/A (API-level issue)
- Network errors: None — mutation returns 200 OK with stored payload
- HAR file: Not applicable (GraphQL mutation via API)

## Root Cause Analysis

- **Source file:** `VirtoCommerce/vc-module-profile-experience-api` → `src/VirtoCommerce.ProfileExperienceApiModule.Web/Validators/NewContactValidator.cs`
- **Suspected cause:** `NewContactValidator` only validates `FirstName` and `LastName` with `MatchesNamePattern()`. There are **no validation rules** on the `phones` array — no `NoHtmlTags()`, no `NoScriptInjection()`, no format validation.
- **Relevant code (NewContactValidator.cs):**
  ```csharp
  RuleFor(x => x.FirstName).NotNull().NotEmpty().MaximumLength(128);
  RuleFor(x => x.LastName).NotNull().NotEmpty().MaximumLength(128);
  When(_ => hasNamePattern, () => {
      RuleFor(x => x.FirstName).MatchesNamePattern(options.NameValidationPattern);
      RuleFor(x => x.LastName).MatchesNamePattern(options.NameValidationPattern);
  });
  // No rules for phones[]
  ```
- **Contrast:** `AddressValidator.cs` correctly applies `NoHtmlTags()` on the address `Phone` field — but that's the address-level phone, not the contact's `phones` array.
- **Recent changes:** PR #130 (`VirtoCommerce/vc-module-profile-experience-api`) added `InputValidationOptions` but missed the `phones` property on contacts.
- **App Insights:** No server-side errors (mutation succeeds — the problem is the **absence** of validation).

## Impact

- **Stored XSS** — malicious HTML/JavaScript persisted in contact phone fields
- **Blast radius:** Any UI rendering the contact's phone (admin contact details, storefront profile, order confirmation emails, etc.) is vulnerable if output encoding is insufficient
- **OWASP A03:2021 — Injection** / **A07:2021 — XSS**
- **Affected users:** All users who can call `updateContact` mutation (authenticated storefront users, admin users)

## Suggested Fix

Add `NoHtmlTags()` validation to the `phones` array in `NewContactValidator.cs`:

```csharp
When(_ => options.EnableNoHtmlTagsValidation, () => {
    RuleForEach(x => x.Phones).NoHtmlTags();
});
```

## References

- JIRA: [VCST-4803](https://virtocommerce.atlassian.net/browse/VCST-4803)
- PR #130: https://github.com/VirtoCommerce/vc-module-profile-experience-api/pull/130
- Sync run: SYNC-2026-03-21-1600
- Related test cases: GQL-031, SEC-INPUT-002
