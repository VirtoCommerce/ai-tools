# W0 — Smoke gate · REG-2026-11-26-0225-W0 + REG-2026-11-26-0805-W0R

Owner Elena Kutasina · vcst · Platform 3.1101.0 · theme 2.63.0-alpha.2681 · persona set S1.

| Suite | Planned | Pass | Fail | Blocked | Skipped |
|---|---|---|---|---|---|
| 042 Smoke Tests | 34 | 29 | 0 | 0 | 5 (manual) |

**Gate: GREEN.** Status DONE — nothing open in this wave.

## Runs
- **REG-2026-11-26-0225-W0** (night): 28 pass, 1 BLOCKED — SMK-034, the S1 clone had no saved Skyflow card.
- **REG-2026-11-26-0805-W0R** (re-run of SMK-002, SMK-003, SMK-034): 3 pass. The S1 clone got a shipping address and a saved card (one /cart Skyflow payment with "Save card for future payments" ticked, order CO261126-00007; KB-2A76DF9E); SMK-034 then paid with it (CO261126-00008).

## Repairs (this PR)
- **SMK-002 / SMK-003** were stale: sign-up always lands on `/successful-registration` unauthenticated (vc-frontend `sign-up.vue` pushes `Welcome`). The cases now sign in explicitly, branch on the store's `emailVerificationRequired` (not required on vcst → signed in, KB-AC4B6E46; required → refused until confirmed), fill Confirm password and switch the one-time-code sign-in form to password. Promoted Draft → Automated from W0R.
- **SMK-034** precondition says how the card and the address get there.
- **Pre-flight:** the wave ran without `--release` because `release:delivery` read support-line backports (VCST-6935) and a CI-only PR (VCST-6129) as missing — fixed in `scripts/preflight/delivery.ts` (`OTHER_LINE`, `CI_ONLY`).

## Observed, investigated separately
- The SalesRep chunk 404 banner of the night run (KB-4358B2EC) did not recur in W0R or in W4.
- After the W0R setup order an `UpdateShortCartItemQuantity` call went out with the just-ordered cart's id and hung; the retry worked — under investigation (`reports/regression/REG-2026-11-26-0805-W0R/evidence/cart-after-order/`).

## Cleanup left on vcst
Orders CO261125-00012, CO261126-00007, CO261126-00008; AGENT-TEST-smk002/003 registrations and their org; the S1 clone keeps its saved card and address (SMK-034 needs them).
