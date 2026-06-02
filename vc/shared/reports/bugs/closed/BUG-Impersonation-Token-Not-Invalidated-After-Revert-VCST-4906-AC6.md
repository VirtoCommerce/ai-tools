# BUG-AUTH-IMP-046 (DUPLICATE — superseded by re-verification)

## Status: CLOSED — Duplicate

**Canonical report:** [`reports/bugs/open/BUG-IMP-046-stale-impersonation-token-replay-VCST-4906.md`](../open/BUG-IMP-046-stale-impersonation-token-replay-VCST-4906.md)

**Reason for consolidation:** Two reports were filed for the same root-cause defect across two separate verification sessions on 2026-05-14 (qa-testing-expert Firefox-session reports). Both converge on identical findings:

- VCST-4906 AC#6 ("Previous Token MUST be invalidated") is violated.
- Frontend `useImpersonate.ts::revertImpersonate()` (PR #2280 sha `413bf48`) never calls `/revoke/token`.
- Platform `AuthorizationController.cs` `RevokeCurrentUserToken()` exists but the JWT validator is stateless — even if called, the token would not be rejected at request time.
- Stale `T_imp` returns target user's full identity from `/graphql { me }` and `/api/platform/security/currentuser` for the token's full 30-min `exp` window, including after operator sign-out.

**Re-verified 2026-05-14 17:30 UTC** by qa-backend-expert on playwright-edge (third independent browser engine). Same outcome — stale `T_imp` returns David Kim's identity on `/graphql { me }` 26.3 seconds after revert click. **No stealth fix has landed.**

All scope escalations, source file refs (vc-frontend sha `413bf48` + vc-platform sha `67ff599`), JWT analysis, layer-validation table, and acceptance criteria have been merged into the canonical report. The previous-findings history is preserved in the canonical report's "Previous findings" section.

**Original report content (sister duplicate):** [`reports/bugs/closed/BUG_082_046-impersonation-token-not-invalidated-after-revert.md`](BUG_082_046-impersonation-token-not-invalidated-after-revert.md) — also closed as duplicate. Cross-reference both for the prior-session prose if needed.

**File this report under closed/duplicate status.** No JIRA filing should be opened from this path. Use the canonical report instead.

## Original report content

Original report retained verbatim in git history. See `git log --follow -- reports/bugs/open/BUG-Impersonation-Token-Not-Invalidated-After-Revert-VCST-4906-AC6.md` for full prose.
