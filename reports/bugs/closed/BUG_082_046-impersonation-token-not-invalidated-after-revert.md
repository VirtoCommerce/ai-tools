# BUG-082-IMP-046 (DUPLICATE — superseded by re-verification)

## Status: CLOSED — Duplicate

**Canonical report:** [`reports/bugs/open/BUG-IMP-046-stale-impersonation-token-replay-VCST-4906.md`](../open/BUG-IMP-046-stale-impersonation-token-replay-VCST-4906.md)

**Reason for consolidation:** Two reports were filed for the same root-cause defect across two separate verification sessions on 2026-05-14. Both converge on identical findings — VCST-4906 AC#6 violated, frontend never calls `/revoke/token`, backend JWT validator is stateless. Sister duplicate: [`reports/bugs/closed/BUG-Impersonation-Token-Not-Invalidated-After-Revert-VCST-4906-AC6.md`](BUG-Impersonation-Token-Not-Invalidated-After-Revert-VCST-4906-AC6.md).

**Re-verified 2026-05-14 17:30 UTC** by qa-backend-expert on playwright-edge (third independent browser engine). Same outcome — stale `T_imp` returns David Kim's identity on `/graphql { me }` 26.3 seconds after revert click. **No stealth fix has landed.**

All findings (root cause refs, source-code links to vc-frontend sha `413bf48` and vc-platform sha `67ff599`, layer-validation table, JWT analysis, acceptance criteria) merged into the canonical report. Previous-session prose preserved in canonical's "Previous findings" section.

**File this report under closed/duplicate status.** No JIRA filing from this path — use the canonical report.

## Original report content

Original report retained verbatim in git history. See `git log --follow -- reports/bugs/open/BUG_082_046-impersonation-token-not-invalidated-after-revert.md` for full prose.
