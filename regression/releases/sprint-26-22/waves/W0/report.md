# Sprint 26-22 · W0 Smoke gate — report

**Owner:** Elena Kutasina · **Sub-task:** VCST-6796 · **Run:** REG-2026-11-11-1825-W0 · **Env:** vcst
**Build:** Platform 3.1097.0 · theme 2.62.0-alpha.2642 · Xapi 3.1031.0-pr-70-108f (vc-module-x-api#70) · ApplicationInsights 3.1007.0

## Verdict

**Smoke gate green.** 34 cases: 27 PASS · 0 FAIL · 2 BLOCKED (test data) · 5 SKIPPED (manual-only). W1–W6 may start.

| Suite | Cases | Pass | Fail | Blocked | Skipped |
|-------|-------|------|------|---------|---------|
| 042 Smoke Tests | 34 | 27 | 0 | 2 | 5 |

## BLOCKED — causes and fixes

| Case | Cause | Fix |
|------|-------|-----|
| SMK-020 | Multi-org account holds 5 "default" carts (FIXTURE-protected); the competing-cart guard refused | Decide on the FIXTURE carts and `npm run carts:sweep`, or give the guard an organization dimension if one cart per organization is by design |
| SMK-034 | Lane account has no saved card 0015; USER_EMAIL holds 2 "default" carts | Re-seed PAY-SKY-009 for USER_DEFAULT, sweep the surplus cart, sign the case in as the card holder |

## SKIPPED

SMK-009, 018, 019, 029, 030 are `Automation_Status=Manual`: never run by an agent. Run them by hand for the release, or promote them after a live run.

## Real bugs (not filed yet)

| Ledger row | Defect | New in release |
|------------|--------|----------------|
| OBS-BUG_042_001 | Pick points radiogroup accessible name is a raw i18n key | unknown |
| OBS-BUG_042_002 | Profile Last name / Email placeholders read "Enter your first name" | unknown |
| OBS-BUG_042_004 | Reloading /checkout/completed drops the order number and Show order link (KB-65D34B0B) | no |

**Pending decision:** OBS-BUG_042_003 — cart totals stale 15–35 s after a quantity change; possibly caused by the competing-cart fixtures. Repro on a single-cart account before filing.

## Build notes

CyberSource authorization succeeded and the order appeared in history at once; the Skyflow card form loads; no GraphQL errors on the Xapi PR build. `/sign-in` now opens on the one-time-code form, with password sign-in behind "Sign in with a password instead".

## Closed (2026-11-12)

W0 set to **DONE** by the owner's decision. Deferred, not done: the SMK-020 / SMK-034 / SMK-010 data repairs (FIXTURE carts on MULTI_ORG_USER and USER_EMAIL, the 0015 card for USER_DEFAULT), the five manual smoke cases, and **a re-run of 042 on theme 2.62.0-alpha.2647** — the smoke gate ran on alpha.2642; the theme moved to alpha.2647 mid-W4 (vc-deploy-dev#7097). Every deferred item is marked `DEFERRED` in `ledger.csv`. Filed: VCST-6805, VCST-6806; duplicate: VCST-6543.
