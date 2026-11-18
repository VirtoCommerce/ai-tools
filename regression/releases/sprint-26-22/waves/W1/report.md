# Sprint 26-22 · W1 Authentication — sign-in, session, security — report

**Owner:** Elena Kutasina · **Sub-task:** VCST-6797 · **Run:** REG-2026-11-12-0000-W1 · **Env:** vcst
**Build:** Platform 3.1097.0 · theme 2.62.0-alpha.2647 · Xapi 3.1031.0-pr-70-108f · MFA / OTP / Passkey settings at defaults (their suites are in WX)

## Verdict

159 cases: 81 PASS · 5 FAIL · 48 BLOCKED · 25 SKIPPED (manual). **Nothing new in the sprint.** One real bug, pre-existing.

| Suite | Cases | Pass | Fail | Blocked | Skipped |
|-------|-------|------|------|---------|---------|
| 082 Auth Impersonation | 48 | 39 | 1 | 3 | 5 |
| 044 Security Tests | 34 | 7 | 2 | 25 | 0 |
| 031 Auth Login & Register | 37 | 21 | 2 | 3 | 11 |
| 032 Auth Session & RBAC | 20 | 9 | 0 | 8 | 3 |
| 033 Auth Company & Account Menu | 20 | 5 | 0 | 9 | 6 |

## Real bug (pre-existing, not filed yet)

| Ledger row | Defect | Since |
|------------|--------|-------|
| SEC-AUTH-005 (+ AUTH-069) | `/account/change-password` has no notice that other sessions will be signed out (AC of VCST-4531; KB-4BDF14A7) | failed in REG-2026-10-02-2022 |

**By design / configuration:** SEC-AUTH-002 — a revoked access token keeps working until expiry because persistent token validation is off on vcst (KB-7564A9BF).
**Pending decision:** AUTH-009 — no sign-in / reset suggestion on a duplicate email; no AC found behind that assertion.

## BLOCKED — causes and fixes

| Cause | Cases | Fix |
|-------|-------|-----|
| Suite 044 skeleton rows (no Steps / Assertions) | 23 | Author or retire the rows (XSS, INPUT, CSRF, SESSION, VALIDATION worth keeping) |
| Env-wide setting: persistent token validation, email verification required, role whitelist | 11 | Run in **WX** on a stand / window with the setting on |
| Shared multi-org fixture write refused; slot 3 / two contexts held by W2 | 5 | Approved exclusive window, or in-case disposable fixtures; re-run after W2 |
| vc-frontend-next PR #19 cases (AUTH-078…082) | 5 | Not testable on vcst — run on a vc-frontend-next stand |
| Stale / case defects (AUTH-043 org fallback, AUTH-057 missing precondition, IMP-028 loading state) | 3 | Re-base / add precondition / move to a `.spec` |
| Fixtures (IMP-029 multi-org target, IMP-038 missing user) | 2 | Seed via seed-impersonation-targets |

**Test defect:** IMP-012 — the revert lands on `/company/members` (KB-B346C56A, accepted by IMP-049); update the assertion.

## Run notes

- With Customer 3.1033.0, sign-in falls back to an accessible organization; the "Forbidden" landing for a locked last-used org no longer exists (AUTH-043).
- Stand data touched: order CO261111-00015 (IMP-030) and CO261111-00016 (cancelled, SEC-PCI); the "Many Orgs" user's active org moved to BMW-Group (IMP-048); USER_EMAIL has 2 failed sign-ins (AUTH-055); four old pending invites remain in TechFlow.

## Closed (2026-11-12)

W1 set to **DONE** by the owner's decision.
- **No product bug from W1.** SEC-AUTH-005 / AUTH-069 were re-checked: the VCST-4531 AC asks for the success pop-up after a password change, which ships → `TEST_DEFECT`. AUTH-009: the duplicate-email suggestion was never a feature; not revealing whether an email exists is intended (owner's decision) → `TEST_DEFECT`.
- **Deferred** (marked `DEFERRED` in `ledger.csv`): suite 044 skeleton rows, stale / case fixes, fixtures, manual cases, and the env-wide cases that belong in WX (persistent token validation, email verification required, role whitelist) plus the shared-fixture / W2-conflict cases.
