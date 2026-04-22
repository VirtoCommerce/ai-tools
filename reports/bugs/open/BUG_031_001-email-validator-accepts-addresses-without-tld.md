# BUG_031_001 — Storefront email-format validator accepts addresses without a TLD (`missing@domain`, `user@localhost`)

**Status:** CONFIRMED (client-only; backend already rejects these values)
**Severity:** **Medium** (P2) — no security/data-integrity impact because the backend GraphQL resolver still rejects invalid emails, but the storefront UX is materially broken: the user is told their email is valid, submits the form, and only then sees a generic server error. Same regex is used on at least two forms (Sign-up, Forgot-password).
**Original Severity (regression report):** Medium
**Test case:** `Frontend/auth/031` AUTH-010 "Validation - Email Format"
**Business rule:** BL-AUTH-001
**Retest date:** 2026-04-21
**Original regression run:** REG-2026-04-20-1000

---

## Environment

| Field | Value |
|-------|-------|
| Storefront | `https://vcst-qa-storefront.govirto.com` |
| Build | Ver. 2.47.0-alpha.2306 |
| Store | B2B-store |
| Browser | Chromium 147.0.7727.15 (playwright-chrome) |
| Viewport | 1920x1080 |

---

## Steps to reproduce (Sign-up form)

1. Navigate to `https://vcst-qa-storefront.govirto.com/sign-up`.
2. Ensure `Personal account` radio is selected (default).
3. In the `Email` field, type `missing@domain` (13 characters).
4. Press `Tab` to blur the field.

**Expected:** Inline error "Enter a valid email address, e.g. johndoe@gmail.com" appears (the same error shown for `notanemail` and `@nodomain.com`).

**Actual:** No inline error. The field is visually clean. If the user fills in First name / Last name / Password / Confirm password and clicks **SIGN UP**, the request is sent to the server, which returns `Invalid email format in the account` as a generic form-level error displayed just above the submit button. The user is forced to diagnose the backend message themselves.

## Steps to reproduce (Forgot-password form)

1. Navigate to `https://vcst-qa-storefront.govirto.com/forgot-password`.
2. Type `missing@domain` in the `Email` field.
3. Blur.

**Actual:** No inline error. Submit button becomes enabled (it is disabled only while the field is empty). The same regex deficiency is present on this form too.

---

## Boundary matrix (real-user typing + blur)

Tested 2026-04-21 on `/sign-up` with a fresh page load per batch.

| # | Value | Client-side format error? | Notes |
|---|-------|---------------------------|-------|
| 1 | `notanemail` | YES (rejected) | baseline control (no `@`) |
| 2 | `@nodomain.com` | YES (rejected) | no local-part |
| 3 | **`missing@domain`** | **NO (accepted — BUG)** | **No TLD; should be rejected** |
| 4 | **`user@localhost`** | **NO (accepted — BUG)** | **No dot in domain; should be rejected** |
| 5 | `user@domain.c` | NO (accepted) | 1-char TLD — RFC permits it; acceptable |
| 6 | `user@domain.verylongtldthatshouldexist` | NO (accepted) | correct |
| 7 | `user@.com` | YES (rejected) | correct |
| 8 | `user@domain..com` | YES (rejected) | correct |
| 9 | `user@domain.com.` | YES (rejected) | trailing dot rejected |
| 10 | `user@[192.168.1.1]` | YES (rejected) | IP literal — RFC valid, commonly rejected; acceptable |
| 11 | `valid@example.com` | NO (accepted) | positive baseline |

**Failing cases:** rows 3 and 4. The common pattern is "`@` followed by a bare token with no `.` in it." The form regex requires `@` but does not require a dot in the domain.

---

## Field metadata

The email input on `/sign-up` is:
```html
<input type="text" name="email" id="input-140"
       maxlength="64" autocomplete="email"
       data-test-id="sign-up-email-input" />
```
It is `type="text"` (not `type="email"`) and has no `pattern` attribute. Validation is entirely Vuelidate/Vue-driven in the Vue SPA.

The email input on `/forgot-password` IS `type="email"` but it still has no `pattern`, and the native browser heuristic for `type=email` accepts `missing@domain` in Chromium too — confirming the validation behaviour matches the `/sign-up` regex-based field.

---

## Server-side behaviour (for severity justification)

With `missing@domain`, the server round-trip is:

```
POST /graphql  { query: checkEmailUniqueness(email:"missing@domain") }
       → 200 { "data":{"checkEmailUniqueness":true} }         # returns true (uniqueness, not format)
POST /graphql  { mutation: requestRegistration(...email:"missing@domain"...) }
       → 200 { errors: [{ code:"...", description:"Invalid email format in the account" }] }
```

So the backend **does** enforce format, meaning there is no risk of a malformed record being stored. The impact is strictly a broken UX contract: the client says the field is valid, then the server says it is not.

---

## Evidence

All files relative to `C:\Users\mutyk\My Projects\vc-mcp-testing-module\`.

| Artifact | Path |
|----------|------|
| Sign-up: `missing@domain` accepted, other required fields show "This field is required" | `reports/regression/REG-2026-04-20-1000/invest-evidence/BUG_031_001-missing-domain-accepted.png` |
| Sign-up: server returns "Invalid email format in the account" after submit | `reports/regression/REG-2026-04-20-1000/invest-evidence/BUG_031_001-server-rejects-client-accepts.png` |
| Forgot-password: `missing@domain` accepted, Submit enabled | `reports/regression/REG-2026-04-20-1000/invest-evidence/BUG_031_001-forgot-password-missing-tld-accepted.png` |
| Original regression screenshot | `reports/regression/REG-2026-04-20-1000/031-AUTH-010-missing-domain-accepted.png` |

---

## Suggested fix direction (for the owning frontend team — NOT verified)

Tighten the email format validator used by the Vue sign-up / forgot-password / any-other email input. A minimal fix is to require at least one `.` in the domain part AND at least two characters after the last `.`:

```
/^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/
```

(Or adopt a library validator such as `validator.js` `isEmail` with `{ require_tld: true }`.)

Also consider switching `type="text"` to `type="email"` on the sign-up field for consistency with other forms and to get baseline browser validation.

---

## Regression checks after fix

- Rows 3 and 4 above are now rejected with the inline "Enter a valid email address…" message.
- Rows 1, 2, 7, 8, 9, 10 remain rejected (no regression).
- Rows 5, 6, 11 remain accepted (no false positives).
- Forgot-password form shares the same validator (or the same message).

---

## JIRA-ready summary

- **Title:** `[Storefront] Sign-up and Forgot-password email validator accepts addresses without a TLD (e.g. "missing@domain", "user@localhost")`
- **Components:** Storefront (Auth forms)
- **Fix version:** next sprint (P2 — UX inconsistency, no data risk)
- **Linked test:** 031 AUTH-010
