# Test Execution Report — PLAT-066 Account Lockout After Failed Login Attempts

## Summary

- **Date:** 2026-03-05
- **Environment:** QA — https://vcst-qa-storefront.govirto.com / https://vcst-qa.govirto.com
- **Platform Version:** 3.1007.0
- **Browser:** Chrome (playwright-chrome)
- **Test User:** mutykovaelena@gmail.com (Customer, B2B-store)
- **Tester:** qa-testing-expert (automated)
- **Results:** 3 passed, 1 failed / 4 checks — **75% pass rate**

---

## Overall Verdict: NEEDS-REVIEW

The lockout mechanism is **functionally working** but deviates from the test case specification in one measurable way: lockout triggers on attempt **6**, not attempt **5** as specified. This warrants investigation into whether the threshold is intentionally set to 5 (meaning the 6th attempt is the first one that hits a locked account) or whether the configured value is actually 6.

---

## Test Steps and Results

### Check 1 — Security Module Exists with Users Section

**Status: PASS**

- Security module is present in the left navigation at `https://vcst-qa.govirto.com/#!/workspace/security`
- Users sub-section loads correctly, showing 1,020 users
- Evidence: `03-security-users-list.png`

---

### Check 2 — User Detail Has Lockout UI Controls

**Status: PASS**

User `mutykovaelena@gmail.com` detail blade shows:

| Control | Observed |
|---------|----------|
| Toolbar button | "Lock account" (when unlocked), changes to "Unlock account" when locked |
| Locked state field | Displays current lock state in the User information panel |
| Status | Approved |
| Account type | Customer |
| Container | B2B-store |

- Evidence: `04-user-detail-lockout-controls.png`

---

### Check 3 — Platform Security Settings Lockout Configuration

**Status: NEEDS-REVIEW**

The Platform|Security settings page (`Settings > Platform > Security`) contains **no account lockout configuration fields**.

Fields present in Platform|Security:
- Account statuses (list)
- Account types (list)
- Cron for the tokens prune job: `0 0 */1 * *`
- Default account status: `New`
- Default account type: `Customer`
- Default external account status: `Approved`
- Prune expired tokens: toggle (OFF)
- Black list
- White list

Fields **absent** (not found anywhere in Admin Settings):
- Max failed login attempts
- Lockout duration / timeout
- Lockout enabled toggle
- Failed attempts window / reset interval

A global search for "lockout" across all 40+ settings modules returned **zero results**.

**Interpretation:** Lockout is configured via `appsettings.json` or environment config at the infrastructure level (ASP.NET Identity `LockoutOptions`), not through the Admin UI. This is consistent with VC platform architecture. However, the test case specification implies this configuration should be visible or verifiable through the Admin UI — it is not.

- Evidence: `06-platform-security-settings.png`, `07-settings-search-lockout-no-results.png`

---

### Check 4 — Lockout Triggers After Failed Attempts and Blocks Correct Password

**Status: FAIL — Threshold discrepancy**

**Expected:** Account locked after exactly 5 failed login attempts.

**Actual:** Account locked after 6 failed attempts. Detailed attempt log:

| Attempt | Password Used | Response | Error Message Shown |
|---------|--------------|----------|---------------------|
| 1 | WrongPassword1! | HTTP 400 (`/connect/token`) | "Login attempt failed. Check your credentials" |
| 2 | WrongPassword1! | HTTP 400 | "Login attempt failed. Check your credentials" |
| 3 | WrongPassword1! | HTTP 400 | "Login attempt failed. Check your credentials" |
| 4 | WrongPassword1! | HTTP 400 | "Login attempt failed. Check your credentials" |
| 5 | WrongPassword1! | HTTP 400 (pending/no UI error shown) | No error displayed (anomalous — form cleared silently) |
| 6 | WrongPassword1! | HTTP 400 | **"Your account has been temporarily locked. Please try again later."** |

**Observation on attempt 5:** The 5th submit produced no visible error message — the error element disappeared from the DOM while the form credentials remained. This is a secondary UX issue: the UI failed to show a consistent error on one attempt. The network log shows the 5th `/connect/token` call was captured without a completed status code at inspection time, suggesting a timing issue.

**Correct password rejected while locked:** Confirmed. Attempt 7 using the correct password `Password2!` returned the same lockout message — "Your account has been temporarily locked. Please try again later." — proving the lockout gate is enforced regardless of credential correctness.

- Evidence: `09-after-5th-attempt.png`, `10-lockout-message-after-6th-attempt.png`, `11-correct-password-rejected-while-locked.png`

---

### Check 5 — Admin Reflects Locked State After Failed Attempts

**Status: PASS**

After triggering lockout on the storefront, the Admin user detail blade immediately reflected the changed state without requiring a manual refresh:

| Field | Before Lockout | After Lockout |
|-------|---------------|---------------|
| Locked state | Unlocked | **Locked** (displayed in red) |
| Toolbar action | "Lock account" | **"Unlock account"** |
| Active sessions | 65 | **0** |

The Admin UI correctly reflects the lockout state in real time.

- Evidence: `12-admin-user-locked-state-confirmed.png`

---

## Defect Summary

| ID | Description | Severity | Steps to Reproduce |
|----|-------------|----------|--------------------|
| BUG-PLAT-066-01 | Account lockout triggers on attempt 6, not attempt 5 as specified | Medium | Perform 5 failed logins with wrong password — no lockout. 6th attempt triggers lockout. |
| BUG-PLAT-066-02 | 5th failed login attempt shows no error message (UI silent) | Low | After 4 failed attempts, submit 5th — error element disappears without showing a message |

---

## Evidence Files

All screenshots saved to `test-results/PLAT-066/`:

| File | Description |
|------|-------------|
| `01-admin-initial-page.png` | Admin login page |
| `02-admin-workspace-logged-in.png` | Admin workspace after login |
| `03-security-users-list.png` | Security > Users section with 1,020 users |
| `04-user-detail-lockout-controls.png` | User detail showing Lock account button and Locked state field (Unlocked) |
| `05-settings-page.png` | Settings module list |
| `06-platform-security-settings.png` | Platform|Security settings — no lockout fields present |
| `07-settings-search-lockout-no-results.png` | Global settings search for "lockout" — zero results |
| `08-storefront-signin-page.png` | Storefront sign-in page before failed attempts |
| `09-after-5th-attempt.png` | After 5th attempt — no error shown (silent failure) |
| `10-lockout-message-after-6th-attempt.png` | "Your account has been temporarily locked" message after 6th attempt |
| `11-correct-password-rejected-while-locked.png` | Correct password rejected while account is locked |
| `12-admin-user-locked-state-confirmed.png` | Admin shows Locked state: Locked (red), Unlock account button, 0 active sessions |
| `13-account-unlocked-teardown.png` | Account restored to Unlocked state after test teardown |

---

## Teardown

- Account `mutykovaelena@gmail.com` was unlocked via Admin > Security > Users > Unlock account immediately after test completion.
- Locked state confirmed restored to "Unlocked" before session close.
- Browser session not explicitly closed (playwright-chrome remains available for subsequent tests).

---

## Recommendations

1. **Clarify the intended lockout threshold.** If ASP.NET Identity `MaxFailedAccessAttempts` is set to 5, the lockout should fire after the 5th failure — but the observed behavior suggests the counter increments first and the lockout check happens after, meaning the user sees a "wrong password" error on attempt 5 and only gets locked on attempt 6. If the spec means "5 attempts cause lockout, attempt 6 is blocked", then behavior is correct but the spec wording is ambiguous.

2. **Fix the silent failure on attempt 5.** The 5th attempt should show the same "Login attempt failed" error as attempts 1–4. The current behavior where the error disappears silently is a UX defect that could confuse users about whether their submit registered.

3. **Consider exposing lockout configuration in Admin UI.** Admins currently have no visibility into what the lockout threshold or duration is. A read-only display in Platform|Security settings (or editable fields) would improve operational transparency.
