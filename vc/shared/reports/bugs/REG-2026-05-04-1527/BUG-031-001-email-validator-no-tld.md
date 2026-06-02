# BUG-031-001 — Email format validator accepts addresses without TLD on /sign-up

**Severity:** Low
**Status:** Open (preliminary, unconfirmed)
**Run:** REG-2026-05-04-1527
**Suite:** 031 — Auth Login & Register
**Test case:** AUTH-010 (Validation - Email Format)
**Browser:** playwright-edge (Microsoft Edge)
**Environment:** https://vcst-qa-storefront.govirto.com
**Date:** 2026-05-05

## Summary

The email-format validator on the storefront `/sign-up` page accepts an email address with an `@` and a domain label but no TLD (e.g. `missing@domain`) without showing the format error. Inputs without `@` or with `@` at the start are correctly rejected.

## Business Rule

`BL-AUTH-001` — Registration input validation must reject malformed emails before submit.

## Steps to Reproduce

1. Navigate to `https://vcst-qa-storefront.govirto.com/sign-up`
2. Select Personal account (default)
3. Fill `Email` = `missing@domain` (no TLD)
4. Click Sign up

## Expected

Inline email-format error `Enter a valid email address, e.g. johndoe@gmail.com` shown under the Email field; the email is treated as syntactically invalid.

## Actual

No format error is shown for the Email field. Only the other fields show `This field is required`. The email value `missing@domain` is treated as syntactically valid.

## Comparison with sibling inputs

| Email value | Format error shown |
|-------------|-------------------|
| `notanemail` | YES — correct |
| `missing@domain` | NO — bug |
| `@nodomain.com` | YES — correct |
| `valid@example.com` | NO error (correct) |

## Evidence

- Screenshot: `reports/regression/REG-2026-05-04-1527/031-evidence/AUTH-010-no-tld-accepted.png`
- HAR: included in playwright-edge run output

## Cross-reference

This corroborates **BUG-012-001** filed against suite 012 (Frontend/checkout) — same root-cause class (email validator does not enforce TLD). Recommend consolidating into a single defect or marking this one as a duplicate.

## Impact

- Severity Low because:
  - Form submission is still blocked by the surrounding required-field errors in the empty form scenario.
  - Backend likely re-validates and rejects on registration POST.
  - The user is only annoyed by inconsistent client-side feedback, not by data corruption.
- However, this *is* visible to users and undermines confidence in form validation.

## Notes

- No console TypeError observed.
- No 4xx/5xx network errors observed (no submission was attempted by the client).
- `confirmed: false` — preliminary; recommend a `qa-testing-expert` triage to consolidate with BUG-012-001.
