# Sprint 26-23 regression — waves

The plan, scope, risk and test approach: [`docs/Sprint plans/sprint-26-23-test-plan.md`](../../../docs/Sprint%20plans/sprint-26-23-test-plan.md).
This file only says how the run is split. Regression ticket: VCST-6853. Build: Platform 3.1101.0, theme `2.63.0-alpha.2681` (green dev alpha, `vc-frontend` `dev` @ `5d7c54b0`), deployed by vc-deploy-dev#7158.

## Not delivered

`npm run release:delivery -- sprint-26-23 --write` on 2026-11-26 (theme alpha.2681 = `dev` @ `5d7c54b0`): **NOT READY** as printed; reviewed per ticket below (`delivery.json` holds the raw result).

**Really not on vcst — affects the waves:**

- **Subscriptions storefront — VCST-6861, 6862, 6867, 6909, 6910, 6913.** Every storefront PR (#2669, #2671, #2673, #2700) merged into the feature branch `feat/VCST-6507`; its PR into `dev` (vc-frontend #2602) is still open, so none of it is in alpha.2681. The module half (product-subscription#3) is deployed. **W2 runs 124 and the subscription rows of 002/011/028/014 as `NOT_DEPLOYED`, never FAIL**, until #2602 merges and a green alpha is deployed; then `--update` and re-run them. Until then the storefront part is tested only where the feature branch is deployed (vcptcore_qa1).
- **VCST-7006 (Highest, security).** The only fix PR found, profile-experience-api#163, went to `support/3.1009` (release 3.1009.5, bundles v9/v14/v15 via vc-modules#122). No `dev` PR names it; vcst runs ProfileExperienceApiModule 3.1028.0, which carries VCST-6974’s strict authorization (#155). Whether that already refuses `inviteUser` / `changeOrganizationContactRole` with a foreign role is **unproven** — W1 runs GAP-01 as the check, and a refusal that fails is reported against 7006’s delivery, not as a new bug.

- **VCST-5918 compare — found in W1 (2026-11-26): `VirtoCommerce.ProductComparison` is NOT installed on vcst**, while theme alpha.2681 already removed its own `/compare` route (vc-frontend#2635), so `/compare` answers 404 for every user. `release:delivery` cannot see a module that is absent from the manifest. Suite 098 (WX) and AUTH-083/084 are `NOT_DEPLOYED`; the module needs adding to vc-deploy-dev `vcst-qa` (delivery manager).

**Reported, but delivered on vcst (backports / feature-branch PRs):**

- PARTIAL VCST-6935 — admin-angular-js#6 IN; the OUT PRs are `vc-platform` support-line backports (3.1076, 3.1039).
- PARTIAL VCST-6129 — CI pin only (vc-frontend#2682 IN; vc-platform#3170 OUT); no product change.
- INCOMPLETE VCST-6974, 6970 — the `dev` PRs (#155; #153, #154) are IN; OUT are support-line backports (#158, #160, #161) and a feature-branch PR (#156).
- INCOMPLETE VCST-6571, 6255, 6257 — OUT / NOT_MERGED PRs target feature branches that reached the release through a later merge (site-builder#3, sales-rep#36, #48; vc-frontend#2627); the released module and dev theme carry the result.

Since both PARTIALs are backport/CI noise, the waves may start; the two real items above are told to the W0 owner and VCST-6853 before W0.

## Waves

W0 runs first and alone. W1–W6 depend on W0 only and run in parallel, one owner each. WX runs last and alone.
Sizes from `npm run regression:plan -- <suites>` on 2026-11-26.

| Wave | Domain | Suites | Persona set | Cases | Work | Wall clock (3 lanes) |
|------|--------|--------|-------------|-------|------|----------------------|
| W0 | Smoke gate | 042 | S1 | 34 | 18m | 18m |
| W1 | Security & sign-in — session, RBAC, xAPI user and role mutations | 031, 032, 033, 044 | S1 | 114 | 1h 11m | 25m |
| W2 | Subscriptions, cart, checkout & orders (subscription storefront `NOT_DEPLOYED`, §Not delivered) | 124, 028, 011, 014, 120 | S2 | 262 | 2h 53m | 1h 11m |
| W3 | Catalog, search & BOPIS | 001, 002, 003, 004, 005, 036 | S3 | 258 | 2h 4m | 43m |
| W4 | Sales Rep hub | 089, 091, 093, 093b, 116 | — (originals) | 291 | 3h 37m | 1h 24m |
| W5 | Company, members & lists | 006, 007, 008 | — (originals) | 189 | 1h 13m | 28m |
| W6 | UI kit, Bridge soft look, a11y & i18n | 045, 046, 048c, 070, 071 | S4 | 187 | 1h 29m | 36m |
| WX | Exclusive window — OTP, MFA, compare and punchout settings | 098, 104, 107, 109, 111, 114b + 28 `[EXCLUSIVE]` cases (§WX) | any | 166 + 28 | 6h 46m + 19m | 3h 30m + 7m |

Claim a wave with `/qa-run sprint:26-23 <wave> --claim`; see who holds what with `/qa-run sprint:26-23 status`.

## WX

WX runs after every other wave, one owner, alone, and restores every setting it changes in Cleanup. It holds:

- **Whole suites:** 104 and 114b (`OtpSignIn.Enabled`), 111 (`MultiFactorAuthentication`), 098 (`ProductComparison` store settings), 107 and 109 (`Punchout.Enabled`). 114b needs `playwright-chrome`.
- **The 28 `[EXCLUSIVE]` cases the domain waves record as `BLOCKED (exclusive:)`** and do not run, in 002, 004, 005, 036 (W3), 044 (W1), 070, 071 (W6), 089, 093, 093b (W4). Run exactly them with `npm run regression:plan -- <suites> --exclusive`.

## Prerequisites

- **Before W0, once:** `npm run seed:wave-personas -- --fixtures` (persona clones and their orders for S1–S4). Each owner binds their set before the run: `npm run persona:use -- <set> --release sprint-26-23 --wave <W>`, and `--clear` after.
- **W2:** `npm run seed:subscriptions` (subscription plans, products, a subscriber with deliveries) before the run.
- **W4:** `npm run seed:sales-rep` and `seed:sales-rep-call`. Suites 091, 093, 093b and 116 have uncommitted local edits (VCST-6257 lifecycle): land or park them before W4 is claimed, so the wave runs committed CSVs.
- **Store settings at their defaults** (`OtpSignIn.Enabled`, `MultiFactorAuthentication`, `ProductComparison`, `Punchout.Enabled`) for W1–W6. Only WX changes them.
- Nobody re-seeds while another wave is running.

## Not in scope

- §5.1.2 Backend suites (38): listed in the plan, not waved — this is the "only theme" regression.
- The five §5.3 exploratory charters: `/qa-exploratory sprint`, isolated from the regression pool; EXP-04 (Auth) flips OTP/MFA and runs only when no wave is active.
- Proposed new suites (storefront Site Builder, Admin Shell Dashboard Editor) and the §6 new cases: authored per ticket, not run here.
