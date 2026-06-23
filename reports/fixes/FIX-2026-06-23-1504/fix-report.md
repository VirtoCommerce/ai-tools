# FIX-2026-06-23-1504 — VCST-5202 (Skyflow per-brand CVV validation)

**Ticket:** VCST-5202 (Bug, Low/P3-ux) · **Repo:** VirtoCommerce/vc-frontend (frontend) · **Branch:** `claude/qa-autofix/VCST-5202`
**PR:** https://github.com/VirtoCommerce/vc-frontend/pull/2349 (open — DO NOT auto-merge) · **Commit:** `493a2e25`

## Outcome
PR open for human review. All automated gates green; merge + post-deploy live verification are the remaining human/`/qa-verify-fix` steps.

## Root cause
`payment-processing-skyflow.vue` used a brand-agnostic CVV rule `^[0-9]{3,4}$`, so a 3-digit CVV on Amex (needs 4) passed client validation and enabled Place order (mirror: 4-digit on Visa/MC). Saved-card path also affected.

## Fix (5 files, +158/−26)
- `utils/skyflow-cvv-validation.ts` (new) — `getCvvValidation(cardScheme)`: Amex → `^[0-9]{4}$`/"1111", others → `^[0-9]{3}$`/"111".
- `payment-processing-skyflow.vue` — drop static `CVV_REGEX`; new-card CVV updated live via `ComposableElement.update()` on brand detection; saved-card derives rule from `cardScheme ?? cardType`.
- `getSkyflowCardsQuery.graphql` — select `cardScheme`/`cardType` (saved-card path was a silent no-op without it).
- `core/api/graphql/types.ts` — codegen output of the `.graphql` change (not hand-edited).
- `utils/skyflow-cvv-validation.test.ts` (new) — 5 cases, RED→GREEN.

## Gate results
| Gate | Result |
|------|--------|
| G0 eligibility | PASS |
| G1 single repo (vc-frontend, frontend) | PASS |
| G2 reproduce (RED) | PASS |
| G3 fix (GREEN, existing tests unchanged) | PASS |
| G4 code review (frontend-reviewer) | PASS — 1 blocking finding (saved-card no-op) fixed in iter 1, then APPROVE |
| G5 CI: ci ✅ · SonarCloud QG ✅ · auto-tests ×3 ✅ · deploy ✅ · license/cla ✅ | PASS |
| G6 E2E (live) | DEFERRED — live verification opted out (unit-only); PR labeled needs-deploy-verification; closes post-merge via `/qa-verify-fix` (new + saved Amex, PAY-SKY-015) |
| G7 human review | STOP — PR open, never merged |

## Notes
- Sibling bug (same class, different component) found: `bank-card-form.vue` (Authorize.Net processor) has no brand detection. Draft filed: `reports/bugs/open/BUG-bankcard-authnet-cvv-no-per-brand-validation.md` (separate ticket / `/qa-fix` run).
- Local full vitest had a pre-existing unrelated catalog/nav hook-timeout flake (passes in isolation); not a regression.

**Confidence:** HIGH.
