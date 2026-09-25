# FIX-2026-09-24-1335 — VCST-6083

**Ticket:** VCST-6083, Sales Rep hub Document library widget offers no action for DOC/XLS/ZIP documents
**Route:** VirtoCommerce/vc-frontend (frontend) · anchor `client-app/modules/sales-rep/components/sales-rep-documents.vue:39-49`
**PR:** https://github.com/VirtoCommerce/vc-frontend/pull/2509 · branch `claude/qa-autofix/VCST-6083` → `dev` · commit `83ddc7e` (author Elena Mutykova, Co-Authored-By Claude)
**Ticket state:** In review · close-out comment id 110383

## Gates
- **G0_triage**: PASS
- **G1_route**: PASS (Fix Routing block confirmed, anchor read at sales-rep-documents.vue:39-49)
- **G2_repro**: RED (5 new tests fail on dev)
- **G3_fix**: GREEN (sales-rep module 58 files/664 tests; vue-tsc app+vitest clean; eslint clean; build not run)
- **G4_review**: APPROVE (self-review)
- **G5_ci**: PENDING at report time (license/cla, Semgrep, OSV green; ci in progress)
- **G6_e2e**: delegated to /qa-verify-fix
- **G7**: STOP at In review

## Change
A `v-else` Download button (`downloadFile(document.url, document.name)`) was added next to the gated Open button. It reuses the `sales_rep.documents.details.download` key. The diff and PR body are in this folder (`VCST-6083.patch`, `PR_BODY.md`).

## Proof
Rendered-DOM component tests (vue-test-utils) were added to `sales-rep-documents.test.ts`. Existing tests are unmodified. g2_proxy: false.

## Follow-up
- Watch `ci` and SonarCloud on PR #2509.
- After merge and deploy: `/qa-verify-fix VCST-6083`.
