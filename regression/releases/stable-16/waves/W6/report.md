# W6 — Theme cross-cutting · Stable 16

**Runs:** REG-2026-11-04-1505-W6 (cut short), REG-2026-11-05-0023-W6R (full wave), then re-runs of the cases the first triage left blocked or repaired: REG-2026-11-06-1345-W6R2 (044 + 045), REG-2026-11-06-1410-W6R3 (048c), REG-2026-11-09-W6R4 (repointed and rewritten cases), REG-2026-11-09-W6R5 (after the env-config deploy) · **Owner:** Aleksandra Mitricheva · **Env:** vcptcore_regression (Platform **3.1076.8**, Theme 2.59.0) · **Plan:** [../../PLAN.md](../../PLAN.md)
**Status:** TRIAGED — every FAIL and BLOCKED case has a ledger row ([ledger.csv](ledger.csv)). A re-run adds its own rows; the first run's rows stay as history.

**Hotfix on the stand:** `release.json` records Platform 3.1076.1; the stand ran **3.1076.8** throughout. No W6 finding depends on the platform version.

**Scope:** suites 044, 045, 046 and 048c. The PLAN.md §6 gap sessions are **not** in this wave (the owner's claim note on VCST-6410).

## Result
All 144 planned cases executed. Latest status per case: **72 PASS · 14 FAIL · 6 BLOCKED · 52 SKIPPED** (first run: 42 · 14 · 38 · 50).
48 SKIPPED are `Automation_Status=Manual`; 4 are 044 rows deprecated as merges (not run).

| Suite | PASS | FAIL | BLOCKED | SKIPPED |
|---|---|---|---|---|
| 044 Security | 24 | 2 | 4 | 4 (deprecated) |
| 045 Accessibility | 4 | 4 | 0 | 22 (manual) |
| 046 Localization | 5 | 0 | 0 | 26 (manual) |
| 048c Layout stability | 39 | 8 | 2 | 0 |

**Sign-in:** browser cases ran as the lane accounts `qa-agent-slot1/2/3` (USER_DEFAULT / TECHFLOW_BUYER passwords are not declared for this env). SEC-AUTH-004 used ACME_BUYER as its row says; its password was changed and restored, and sign-in was verified after.

## Real bugs — storefront theme (vc-frontend 2.59.0), filed 2026-11-05, assigned to the owner
**VCST-6710** (home CLS, related VCST-6659) · **VCST-6712** (catalog CLS) · **VCST-6713** (VcInput forms, related VCST-6467) · **VCST-6709** (logo) · **VCST-6708** (results count) · **VCST-6711** (category title). Each Relates VCST-6042, labelled `found-by-agent` + `found-in-regression`, Need hotfixes set. Evidence: owner's `reports/regression/REG-2026-11-05-0023-W6R/evidence/`. `new_in_release` is `unknown` (no stable-15 baseline).
No new product bug came out of the re-runs.

## Still FAIL / BLOCKED
| Verdict | Cases | Cause / next step |
|---|---|---|
| REAL_BUG | LAYOUT-CLS-001/002, IMG-001, COMP-VCINPUT-002, STR-001 | the five filed bugs above |
| DUPLICATE | A11Y-SORT-001…003 | VCST-6606 (sort cycle inverted; aria-sort=none on non-sortable headers) |
| DUPLICATE | A11Y-VCP-001 | VCST-6174 — selected variant option exposes no aria-checked/selected/pressed |
| TEST_DEFECT | LAYOUT-TGT-001/002, COMP-HEADER-003 | after the `touchTargetAudit` repair `belowAA`=0; only BL-UI-006's own 8 px gap rule fails, stricter than WCAG 2.5.8 — `/qa-review-oracles bl` |
| PENDING_DECISION | SEC-AUTH-005 | no "other sessions will be signed out" notice; with persistent validation on, a password change really does end every session (KB-E493006D). Ticket or case rewrite — owner decides |
| PENDING_DECISION | SEC-SESSION-001 | after an admin ends the session, `/checkout` lands on `/cart` as a guest with no sign-in prompt; theme `broadcast.ts:97-107` intends a sign-in redirect. Unconfirmed — reproduce with `/vc-fix:qa-investigate` before filing |
| TEST_DEFECT | SEC-PCI-005 | reading browser storage needs `browser_evaluate`, which the real-user hook blocks; needs an allowed probe |
| ENV_CONFIG | SEC-AUTH-003 | no dedicated lockout account (`LOCKOUT_TEST_*`) for this env |
| ENV_CONFIG | SEC-SENSITIVE-001 | browser half PASS; App Insights half has no access on this env |
| DATA | SEC-SESSION-003 | server half PASS; the UI Place-order half needs a persona with complete checkout data |
| ENV_CONFIG | LAYOUT-COMP-VCBUTTON-005/006 | no Storybook host for vcptcore_regression |

**Observed, unconfirmed, not filed** (ledger `OBS-*`, owner decides): `authorizePayment` answers `NULL_REFERENCE` to a tampered CyberSource token (SEC-PCI-007 itself PASS); the cart shipping address stores `<script>` verbatim while the address book rejects it; a rejected profile-name save keeps showing the rejected name.

## What changed between the first run and the re-runs
- **Env (owner-approved):**
  - B2B-store gained `pt-PT`, `PTS` and `CZK`, and CyberSource is active in Sandbox mode. The before-state was saved for rollback.
  - vc-deploy-dev [#7050](https://github.com/VirtoCommerce/vc-deploy-dev/pull/7050) added the CyberSource merchant secrets as Key Vault references and `EnablePersistentStorageTokenValidation: true`. Before opening it, the three secrets were checked to exist in the vault the stand reads. The owner merged it, and it was verified live: a revoked token gets 401.
- **Data:**
  - New seeders, both idempotent, each with a teardown:
    - `seed:variant-picker`: a master product with 4 variations whose Color and Size are real Variation properties, plus `VirtoFrontend_UI_Layout=B2C`. The picker renders.
    - `seed:locale-slug`: a top-level category with the same slug in en, de, fr and pt. `/de/destinations-agent-test` renders.
  - The aliases are `VARIANT_PICKER_MASTER` and `L10N_COLLISION_CATEGORY`. `td:validate:variant-picker` and `td:validate:locale-slug` act as the drift guards.
- **Cases:**
  - **048c:**
    - CNT-006 and STR-003 now add their own cart line and clear the cart afterwards. The runner has no cleanup-on-error, so a step error leaves the line in the cart.
    - All 7 pt/PTS/CZK and cart cases PASS.
  - **045 and 046:**
    - A11Y-VCP-001 now points at the seeded product.
    - L10N-ROUTE-001/002 use the seeded slug and keep discovery as a fallback. Both PASS.
  - **044:**
    - SEC-SESSION-001/003 now end the session through the platform session API instead of reading a token.
    - SEC-PAT-002 now reads the flag from the deploy config. The settings API does not expose it.
    - **SEC-AUTH-004:** the first FAIL was a probe defect. `/currentuser` is `[AllowAnonymous]`, and xAPI `me` returns an id for a rejected token too. The case now probes `/api/platform/security/users`, which answers 403 when the token is accepted and 401 when it is rejected. Result: PASS, and both tokens end at once.
- **Pre-flight:** `config/suite-requirements.json` now records CyberSource active, the three merchant secrets and persistent token validation (044), and `pt`, `PTS` and `CZK` (048c).

## Repairs from the first triage (commit b1d3a29c1, unchanged)
- `touchTargetAudit` models the WCAG 2.2 SC 2.5.8 exceptions, and its two copies are one generator.
- The `storeLanguage` / `storeCurrency` requirement kinds were added.
- 23 stub rows of 044 were authored, 4 of them deprecated as merges.
- 045 SORT steps and the CPN network check were fixed.
- 048c bug citations were added.
- Side effect: while grounding the 044 rows, the author wrote to `qa-agent-slot1`, which W7 was using at the same time. All of it was restored except the cart comment, which went from `null` to `""`.

## Before the next owner continues
- Decide SEC-AUTH-005 and SEC-SESSION-001. The SEC-SESSION-001 decision needs a reproduction first.
- Provide a lockout account for SEC-AUTH-003 and a Storybook for VCBUTTON-005/006.
- Give SEC-PCI-005 an allowed probe for browser storage.
- Decide the three `OBS-*` rows.
- The seeded fixtures stay on the stand. Teardown: `TEST_ENV=vcptcore_regression npm run seed:variant-picker:teardown` and `npm run seed:locale-slug:teardown`.
