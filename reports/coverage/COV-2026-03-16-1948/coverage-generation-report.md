# Coverage Generation Report — COV-2026-03-16-1948

## Summary
- **Run date:** 2026-03-16 19:48
- **Scope:** domain AUTH (Suite 02 — Authentication)
- **Gaps analyzed:** 10
- **Test cases generated:** 14 (P0: 1, P1: 9, P2: 4)
- **Test cases validated:** N/A (ci-dry-run — no browser validation)
- **Suites modified:** [02]
- **New suite coverage:** 47 cases -> 61 cases (+29.8%)

## Layer Coverage Matrix
| Layer | Cases Generated | Target Suites | Tags Used |
|-------|----------------|---------------|-----------|
| Storefront UI | 12 | 02 | [NAV]/[ACT]/[DOM]/[STATE] |
| REST API (cross-layer) | 2 | 02 | [HTTP]/[NETWORK]/[API] |
| GraphQL xAPI (cross-layer) | 2 | 02 | [API]/[ERRORS] |

## Generated Test Cases

| ID | Title | Priority | Gap | BL Invariant |
|----|-------|----------|-----|-------------|
| AUTH-048 | Session Expiry During Checkout - Cart Preserved After Re-Auth | Critical (P0) | Session expiry | BL-AUTH-001 |
| AUTH-049 | Concurrent Sessions - Both Active Independently | High (P1) | Concurrent sessions | BL-AUTH-003 |
| AUTH-050 | Remember Me - Session Persistence Across Browser Restart | High (P1) | Remember me | BL-AUTH-003 |
| AUTH-051 | Remember Me - Session Does Not Persist Without Checkbox | Medium (P2) | Remember me (negative) | BL-AUTH-003 |
| AUTH-052 | Password Reset - Forgot Password UI Flow | High (P1) | Password reset | BL-AUTH-002 |
| AUTH-053 | Password Reset - Non-Existent Email | Medium (P2) | Password reset (user enum) | BL-AUTH-002 |
| AUTH-054 | Email Case Sensitivity - Login with Different Case | Medium (P2) | Email handling | BL-AUTH-001 |
| AUTH-055 | Password with Leading and Trailing Spaces | Medium (P2) | Password handling | BL-AUTH-001 |
| AUTH-056 | Special Characters in Name Fields During Registration | Medium (P2) | Data integrity | BL-AUTH-001 |
| AUTH-057 | Token Replay After Logout - API Rejection | High (P1) | Token security | BL-AUTH-003 |
| AUTH-058 | RBAC - Customer Cannot Access Admin API | High (P1) | RBAC enforcement | BL-AUTH-005 |
| AUTH-059 | RBAC - Anonymous Cannot Access Authenticated Endpoints | High (P1) | RBAC enforcement | BL-AUTH-005 |
| AUTH-060 | Protected Route Redirect - Unauthenticated Access | High (P1) | Route protection | BL-AUTH-006 |
| AUTH-061 | Protected Route Redirect - Return to Original Page | High (P1) | Route protection | BL-AUTH-006 |

## Gap Coverage Summary

| # | Gap | Priority | Cases | Status |
|---|-----|----------|-------|--------|
| 1 | Session expiry during checkout | P0 | AUTH-048 | Covered |
| 2 | Concurrent sessions | P1 | AUTH-049 | Covered |
| 3 | Remember Me / session persistence | P1 | AUTH-050, AUTH-051 | Covered |
| 4 | Password reset flow | P1 | AUTH-052, AUTH-053 | Covered |
| 5 | Email case sensitivity | P2 | AUTH-054 | Covered |
| 6 | Password with spaces | P2 | AUTH-055 | Covered |
| 7 | Special characters in names | P2 | AUTH-056 | Covered |
| 8 | Token replay after logout | P1 | AUTH-057 | Covered |
| 9 | RBAC API enforcement | P1 | AUTH-058, AUTH-059 | Covered |
| 10 | Protected route redirect | P1 | AUTH-060, AUTH-061 | Covered |

## Remaining Gaps
- **SSO full flow** (Azure AD / Google OAuth) — requires external IdP credentials; current tests (AUTH-025, AUTH-026) only verify button presence
- **Multi-factor authentication** — not currently implemented in VC storefront; N/A
- **Delegated purchasing approval workflow** — covered in B2B-MEMBERS domain (Suite 02 company members section)

## Files Modified
- `regression/suites/Frontend/02-authentication-tests.csv` — appended 14 cases (AUTH-048 to AUTH-061)
- `config/test-suites.json` — updated testCount: 34 -> 61, estimatedMinutes: 30 -> 45
- `.claude/skills/testing/qa-coverage-gap/feature-domain-map.md` — updated session management status to "Covered"
