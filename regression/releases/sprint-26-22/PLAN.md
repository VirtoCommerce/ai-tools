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
| WX | Exclusive window — sign-in settings and env-wide cases | 104, 111, 114, 114a, 114b + 35 deferred cases (§WX) | 68 + 35 | 5h 10m + the deferred cases | 2h 0m + the deferred cases |

The sizes of the five sign-in suites are from `regression:plan`; the 35 deferred cases were added on 2026-11-12 (`--update`) from the W1, W3, W4 and W6 ledgers and are not sized.

Claim a wave with `/qa-run sprint:26-22 <wave> --claim`; see who holds what with `/qa-run sprint:26-22 status`.

## WX

WX runs after every other wave, one owner, alone. It holds:

- **Whole suites** 104, 111, 114, 114a, 114b — they flip `MultiFactorAuthentication`, `OtpSignIn.Enabled` and the Passkey store setting.
- **Only these cases** of suites that already ran in a domain wave. Their ledger rows are `ENV_CONFIG` / `NOT_TESTABLE` with follow-up "run in WX"; run them with `npm run suites:filter -- --ids <ids>`:

| From | Suite | Cases | What makes them env-wide |
|---|---|---|---|
| W1 | 031 | AUTH-015, AUTH-019, AUTH-073 | `Stores.EmailVerificationRequired = true` on B2B-store |
| W1 | 033 | AUTH-036, AUTH-037, AUTH-038 | a populated `MembershipRolesWhitelist` on B2B-store; AUTH-037 reads the invite code from the notification journal |
| W1 | 032 | AUTH-075, AUTH-076, AUTH-077 | writes the shared multi-org fixture (REST lock, org pin); re-check the AUTH-076/077 premise after the Customer 3.1033.0 org fallback |
| W1 | 032 | AUTH-063, AUTH-064 | `Authorization.EnablePersistentStorageTokenValidation = true` — an appsettings flag, see below |
| W1 | 044 | SEC-AUTH-004, SEC-PAT-002 | the same appsettings flag; a disposable in-case user, never a shared account |
| W3 | 036 | BOPIS-104, BOPIS-105, BOPIS-106, BOPIS-107 | exactly 50 / 51 / 100 / 101 active pickup locations (115 active now) — deactivate, then restore |
| W3 | 029 | CART-097 | sets a shared product price to $0.00 — restore it in Cleanup |
| W4 | 004 | SRCH-014, SRCH-016 … SRCH-023 | the store barcode-search setting |
| W4 | 005 | SRCH-FSORT-001 … 004, SRCH-FSORT-006 | a Priority-ascending facet (B2B-store is virtual, Color = PriorityDescending) |
| W4 | 002 | CAT-AURL-001 | the B2B-store Store asset URL |
| W6 | 083c | MSNF-004, MSNF-005 | `Loyalty.Missions.Enable` on the store |

**The appsettings flag** (AUTH-063, AUTH-064, SEC-AUTH-004, SEC-PAT-002) is not a store setting: turning it on is a vc-deploy-dev change and a platform restart, merged by a person, and turned off again after the run. Without it these four stay `ENV_CONFIG` and are carried over.

Before WX, record every setting and value the cases change in `waves/WX/report.md`; after WX, each is back to that value.

## Prerequisites

- **Build** (re-pinned 2026-11-12): theme `2.62.0-alpha.2647` (vc-frontend `dev` 0315ecbd, vc-deploy-dev#7097), Platform 3.1097.0, Xapi release 3.1031.0 (vc-deploy-dev#7098, replaced the PR build `3.1031.0-pr-70-108f`), BackgroundJobs 3.1055.0. W0 and the first W2 run were on alpha.2642. Record the build you ran on in your wave's `report.md`; a newer deploy during the freeze goes through `/qa-test-plan 26-22 --update`.
- **Seed profiles:** W2 `npm run seed:sales-rep` and, before every 106 run, `TEST_ENV=vcst npm run seed:sales-rep-tasks`. W6 the loyalty missions fixtures. Other waves use the `@td()` personas.
- **Personas per owner:** two owners never sign in as the same account. Each owner writes the accounts they use into their wave's `state.json` `personas` when claiming.
- **Env settings:** no store or platform setting changes in W0–W6. Only WX changes them (the table in §WX), and it restores each one in Cleanup.

## Not in scope

- Backend suites (§5.1.2 of the plan): listed, not waved (`--frontend`). Add them with `/qa-test-plan 26-22 --update --with-backend`.
- Suite 118 (account dashboard, VCST-6078): the ticket is not Done (vc-frontend#2552 is on alpha.2647).
- VCST-6079, VCST-6698, VCST-6253 and VCST-6254 are **in scope again**: their PRs (#2652, #2642, #2633, #2634) are in alpha.2647, which the domain waves ran on.
