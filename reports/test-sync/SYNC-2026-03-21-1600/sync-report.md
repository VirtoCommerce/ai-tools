# Test Sync Report — SYNC-2026-03-21-1600

## Summary
- **Source:** PR #130 (VirtoCommerce/vc-module-profile-experience-api)
- **JIRA:** VCST-4691, VCST-4713
- **Date:** 2026-03-21
- **Changed modules:** Profile Experience API (xProfile)
- **Affected suites:** 02, 04b, 08, 15

## Change Inventory

| Module | Layer | Files Changed | Breaking | New Features |
|--------|-------|--------------|----------|-------------|
| ProfileExperienceApiModule | Backend (validators, command handlers) | 25 | Name fields validated by NameValidationPattern; HTML tags rejected in non-name fields; Script injection patterns rejected in free-text fields | Configurable InputValidationOptions (FrontendSecurity:InputValidation) with 4 toggleable settings |

### Affected Mutations
- `createOrganization` — org name validated against OrganizationNameValidationPattern
- `updateOrganization` — org name validated
- `updateContact` — contact fields validated (phone, address: no HTML tags)
- `updateMemberAddresses` — address fields validated (city, line1: no HTML tags)
- `updatePersonalData` — name fields validated against NameValidationPattern
- `registerByInvitation` — registration fields validated

### Validation Rules
| Setting | Default | Scope |
|---------|---------|-------|
| `NameValidationPattern` | `^[\p{L}\p{M}\s'\-\.]+$` | firstName, lastName, fullName |
| `OrganizationNameValidationPattern` | `^[\p{L}\p{M}\p{N}\s'\-\.&#/,()]+$` | organization name |
| `EnableNoHtmlTagsValidation` | `true` | username, phone, address lines, city |
| `EnableScriptInjectionValidation` | `true` | description, about (free-text) |

## Impact Matrix

| Suite | Total Cases | Stale | Incomplete | New Needed | Valid |
|-------|------------|-------|------------|------------|-------|
| 02 (Auth) | 65 | 0 | 0 | 3 | 65 |
| 04b (Checkout) | 80 | 0 | 1 | 0 | 79 |
| 08 (Security) | 30 | 3 | 0 | 2 | 27 |
| 15 (GraphQL xAPI) | 29 | 0 | 0 | 4 | 29 |
| **Totals** | **204** | **3** | **1** | **9** | **200** |

## Cases Updated (STALE)

| Case ID | Suite | Change Type | What Changed |
|---------|-------|-------------|-------------|
| SEC-INPUT-002 | 08 | STALE → updated | **Before:** Expected XSS in name field to be "sanitized/escaped" on display. **After:** Server-side NameValidationPattern rejects at submission (HTTP 400/errors[]). Assertions now expect validation rejection, not stored+escaped display. |
| SEC-XSS-001 | 08 | STALE → updated | **Before:** Expected XSS in address street to be "HTML-escaped" in display. **After:** EnableNoHtmlTagsValidation rejects HTML tags in address fields at submission. Assertions now expect server-side rejection. |
| SEC-XSS-004 | 08 | STALE → updated | **Before:** Expected SVG payload in profile name to be "escaped" on display. **After:** NameValidationPattern rejects <, >, = characters entirely. Assertions now expect validation rejection, not stored display. |

## Cases Updated (INCOMPLETE)

| Case ID | Suite | What Changed |
|---------|-------|-------------|
| CHK-077 | 04b | Added umlaut test (Müller), explicit NameValidationPattern assertion, Cross_Layer_Check for updateMemberAddresses mutation, and Failure_Signal for InputValidationOptions false-positive. |

## Cases Valid (no change needed)

| Case ID | Suite | Reason |
|---------|-------|--------|
| AUTH-056 | 02 | Tests O'Brien and Muller — both pass NameValidationPattern. Well-designed to catch false-positive rejections. |
| AUTH-002 | 02 | Standard personal registration — valid names pass regex. |
| AUTH-004 | 02 | Standard org registration — valid names pass regex. |

## New Cases Generated

| Case ID | Suite | Title | Layer | Priority |
|---------|-------|-------|-------|----------|
| AUTH-066 | 02 | Registration - HTML Tags Rejected in Personal Name Fields | Frontend | High |
| AUTH-067 | 02 | Registration - Org Name Allows Business Characters (3M, AT&T, H&M) | Frontend | High |
| AUTH-068 | 02 | Registration - HTML/Script Tags Rejected in Org Name | Frontend | High |
| SEC-VALIDATION-001 | 08 | Server-Side Name Field Validation (NameValidationPattern) | Frontend | Critical |
| SEC-VALIDATION-002 | 08 | Script Injection Validation in Free-Text Fields (EnableScriptInjectionValidation) | Frontend | Critical |
| GQL-030 | 15 | xProfile - createOrganization Mutation Validates Org Name | Backend | High |
| GQL-031 | 15 | xProfile - updateContact Mutation Rejects HTML in Phone/Address | Backend | High |
| GQL-032 | 15 | xProfile - updateMemberAddresses Rejects Script Injection | Backend | High |
| GQL-033 | 15 | xProfile - updatePersonalData Validates Name Fields | Backend | Medium |

## Quality Gate

| Check | Status |
|-------|--------|
| All STALE cases updated | PASS |
| All INCOMPLETE cases addressed | PASS |
| New behavior has coverage | PASS |
| No ID conflicts | PASS |
| CSV structure valid (15-column format) | PASS |
| testCount updated in manifest | PASS |

## Files Modified

- `regression/suites/Frontend/02-authentication-tests.csv` — 3 new cases (AUTH-066..068)
- `regression/suites/Frontend/04b-checkout-tests.csv` — CHK-077 updated
- `regression/suites/Frontend/08-security-tests.csv` — 3 cases updated (SEC-INPUT-002, SEC-XSS-001, SEC-XSS-004) + 2 new (SEC-VALIDATION-001..002)
- `regression/suites/Backend/15-graphql-xapi-tests.csv` — 4 new cases (GQL-030..033)
- `config/test-suites.json` — testCount updated for suites 02 (65→68), 08 (30→32), 15 (29→33)

## Recommended Next Steps
- [ ] Review updated cases: `git diff regression/suites/`
- [ ] Run `/qa-test-lifecycle suite 02,08,15 --skip-generate` to validate updated cases
- [ ] Run `/qa-regression 02,04b,08,15` to verify on environment once PR is deployed to QA
- [ ] Verify deployment: confirm vc-module-profile-experience-api 3.1002.0+ is installed on QA
