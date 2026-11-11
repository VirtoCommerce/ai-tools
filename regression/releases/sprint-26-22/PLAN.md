# Sprint 26-22 regression — waves

The plan, scope, risk and test approach: [`docs/Sprint plans/sprint-26-22-test-plan.md`](../../../docs/Sprint%20plans/sprint-26-22-test-plan.md).
This file only says how the run is split.

## Waves

W0 runs first and alone. W1–W6 depend on W0 only and run in parallel, one owner each. WX runs last and alone.
Sizes from `npm run regression:plan -- <suites>` on 2026-11-11.

| Wave | Domain | Suites | Cases | Work | Wall clock (3 lanes) |
|------|--------|--------|-------|------|----------------------|
| W0 | Smoke gate | 042 | 34 | 18m | 18m |
| W1 | Authentication — sign-in, session, security | 031, 032, 033, 082, 044 | 159 | 2h 1m | 50m |
| W2 | Sales Rep hub | 089, 090, 091, 091c, 093, 093b, 097, 106, 112 | 384 | 6h 59m | 2h 31m |
| W3 | Cart, checkout & addresses | 011, 013, 028, 029, 030, 081, 015, 036 | 304 | 3h 33m | 1h 15m |
| W4 | Catalog, search, compare & analytics | 001, 002, 004, 005, 098, 043 | 293 | 2h 2m | 42m |
| W5 | Company & organization | 006, 008, 011b | 141 | 3h 3m | 2h 10m |
| W6 | UI kit, design tokens, a11y & i18n | 083c, 045, 046, 048c, 070, 071 | 283 | 2h 44m | 1h 15m |
| WX | Exclusive window — sign-in settings | 104, 111, 114, 114a, 114b | 68 | 5h 10m | 2h 0m |

Claim a wave with `/qa-run sprint:26-22 <wave> --claim`; see who holds what with `/qa-run sprint:26-22 status`.

## Prerequisites

- **Build:** theme `2.62.0-alpha.2642`, Platform 3.1097.0, Xapi PR build `3.1031.0-pr-70-108f` (vc-module-x-api#70, VCST-4717). Record the build you ran on in your wave's `report.md`; a newer deploy during the freeze goes through `/qa-test-plan 26-22 --update`.
- **Seed profiles:** W2 `npm run seed:sales-rep` and, before every 106 run, `TEST_ENV=vcst npm run seed:sales-rep-tasks`. W6 the loyalty missions fixtures. Other waves use the `@td()` personas.
- **Personas per owner:** two owners never sign in as the same account. Each owner writes the accounts they use into their wave's `state.json` `personas` when claiming.
- **Env settings:** `MultiFactorAuthentication`, `OtpSignIn.Enabled` and the Passkey store setting stay at their defaults in W0–W6. Only WX changes them, and it restores them in Cleanup.

## Not in scope

- Backend suites (§5.1.2 of the plan): listed, not waved (`--frontend`). Add them with `/qa-test-plan 26-22 --update --with-backend`.
- Suite 118 (account dashboard, VCST-6078): the ticket is not Done and vc-frontend#2552 is not deployed.
- Cases for VCST-6079, VCST-6698 (front end), VCST-6253 and VCST-6254: their PRs are not in alpha.2642. They report `NOT_DEPLOYED`.
