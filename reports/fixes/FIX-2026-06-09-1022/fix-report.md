# FIX-2026-06-09-1022 — VCST-4767

**Bug:** [Marketing] Admin SPA coupon code field accepts special characters despite "alphanumeric only" hint text.
**Repo:** VirtoCommerce/vc-module-marketing (kind `module`) · **Branch:** `claude/qa-autofix/VCST-4767` · **Scope:** client-side only (non-breaking)

## Gate results
| Gate | Verdict | Note |
|------|---------|------|
| G0 Eligibility | ✅ PASS | Simple, localized, non-breaking (client-only scope chosen by user). |
| G1 Single repo | ✅ PASS | `vc-module-marketing` → `fullstack-backend`. |
| G2 Reproduce (RED) | ✅ PASS | Node scratch harness: 6 special-char codes bypassed validation. |
| G3 Fix (GREEN) | ✅ PASS | One-line `ng-pattern="/^[a-zA-Z0-9]+$/"`; harness green; build OK; no existing tests modified. |
| G4 Review | ✅ APPROVE | `backend-reviewer`: `$valid` propagation correct, regex matches hint, applies to create+edit. |
| G5 CI | ✅ GREEN | `ci` (6m18s), auto-tests ×3 (mysql/postgres/sqlserver), SonarCloud, CLA all pass. |
| G6 E2E | ⏳ Deferred | Backend static-only pre-deploy; "needs deploy verification". Deploy PR opened (below). |
| G7 Human review | ⏸ STOP | Fix PR open, never merged. |

## Fix
`src/VirtoCommerce.MarketingModule.Web/Scripts/promotion/blades/coupon-detail.tpl.html` — added `ng-pattern="/^[a-zA-Z0-9]+$/"` to the coupon Code input. The existing `ng-disabled="!isValid()"` (→ `formCoupon.$valid`) now blocks creation/save of non-alphanumeric codes, matching the rendered hint. `required` already covers empty.

## Artifacts
- **Fix PR:** https://github.com/VirtoCommerce/vc-module-marketing/pull/268 (commit `f9dd883`; labels `bug`, `deploy-qa`) — **DO NOT MERGE until human review.**
- **Prerelease artifact:** `vc3prerelease` blob `VirtoCommerce.Marketing_3.1005.0-pr-268-f9dd.zip`.
- **QA deploy PR:** https://github.com/VirtoCommerce/vc-deploy-dev/pull/5932 (base `vcst-qa`) — re-pins Marketing to the prerelease blob. **Merge to deploy to vcst-qa; a human merges (no auto-merge).** Revert the manifest entry after verification.

## Notes
- The `deploy-qa` auto-flow (`deploy-pr.yml`) failed at "Read deployment config" — the shared `get-deploy-param` action looked for `argoDeploy.json` at repo root (actual: `.deployment/module/argoDeploy.json`). Worked around by hand-authoring the deploy PR. (Shared-action bug, not this fix.)
- Post-merge verification: `/qa-verify-fix VCST-4767`.
