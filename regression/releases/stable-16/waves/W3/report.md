# W3 — Purchase flow · Stable 16

**Run:** REG-2026-10-15-W3 · **Owner:** Elena Kutasina · **Env:** vcptcore-regression (Platform 3.1076.1, Theme 2.59.0) · **Plan:** [../../PLAN.md](../../PLAN.md)
**Status:** RUN_DONE — stopped at the usage limit. 82 cases not run (see [state.json](state.json) `notRun`); admin FAILs triaged, machine-lane repairs not yet committed.

## Result
817 of 900 planned cases executed: **498 PASS · 95 FAIL · 221 BLOCKED · 3 SKIPPED**. 82 not run (one of them a manual case). 29 FAILs — mostly machine-lane — have no verdict yet.

| Suite | PASS | FAIL | BLOCKED | Suite | PASS | FAIL | BLOCKED |
|---|---|---|---|---|---|---|---|
| 007 | 29 | 3 | 42 | 050b1 | 17 | 1 | 1 |
| 014 | 44 | 4 | 17 | 050b2 | 14 | 0 | 0 |
| 017 | 43 | 5 | 2 | 050b3 | 7 | 15 | 0 |
| 017b | 30 | 4 | 3 | 050b4 | 12 | 1 | 10 |
| 018 | 12 | 9 | 1 | 050b5 | 10 | 2 | 0 |
| 019 | 8 | 3 | 0 | 050c | 3 | 5 | 0 |
| 028 | 47 | 3 | 2 | 050h | 22 | 6 | 15 |
| 029 | 15 | 0 | 19 | 050k | 6 | 6 | 0 |
| 030 | 3 | 1 | 15 | 054 | 21 | 4 | 0 |
| 036 | 22 | 0 | 31 | 055 | 27 | 5 | 1 |
| 037 | 27 | 3 | 18 | 072 | 34 | 13 | 10 |
| 038 | 4 | 2 | 4 | 072e | 39 | 0 | 17 |
| 041 | 2 | 0 | 13 | 056, 065 | not run | | |

## Two new Stable 16 regressions (not filed yet)
1. **Order price protection leaks amounts** (Orders 3.1018, VCST-3912) — a user without `order:read_prices` still gets capture/refund amounts through `childrenOperations`, and the Admin operations tree shows them. Cases ORDA-104, ORDA-113.
2. **Generic Export never completes** — `ExportJob` cannot deserialize the abstract `ExportDataQuery` under BackgroundJobs; the same request finishes in under a second on Stable 15. Same pattern as VCST-6286. Cases PRICE-008, PRICE-031, PRICE-055.

Pre-existing bugs awaiting filing (same on Stable 15): a refund beyond the captured amount is accepted and a refunded payment can be refunded again (ORDA-081/083); invalid currency or date on order `PUT` returns 500 (ORDA-076). Whether a full refund should move the payment to `Refunded` (ORDA-068) waits for a product decision. Filed from this wave: VCST-6374, VCST-6375 (storefront cart).

## What else the FAILs were
Verdict per case: [ledger.csv](ledger.csv). Most are **stale cases** (admin steps the UI no longer has, assertions written for the tax-free vcst env) and **data** (fixtures that existed only on vcst — configurable variations, the BOPIS location pool, buyable products). Fixes are in progress on branch `claude/vcst-6042-w3-case-repairs`, **not pushed yet** — it exists only on Elena Kutasina's machine until she pushes it; 072 CFG-VAR-001…004 still need repointing to `CFG_VARIATION_OPTIONS`.

## BLOCKED — main causes
| Cause | Approx. cases | Fix |
|---|---|---|
| Sales-rep module not installed (wishlist sharing scope, sales-rep personas) | 49 | install the module, or accept as not testable here |
| Google Maps for BOPIS off (pickup map flows 036–038, 041) | 33 | enable the Maps key on the env |
| Missing fixtures / personas | 35 | seeders (in progress) |
| Permission policy refused a write | 17 | allow writes to vcptcore-regression for the run |
| Payment providers not configured (Skyflow inactive, Authorize.Net sandbox) | 16 | configure, or not testable here |
| Guest checkout store missing | 8 | env config |
| CustomerOrder index stalled since 2026-10-13 (leaked Hangfire lock) | 5 + order lists | needs someone with SQL access |
| `products(first:N)` returns N-1 (orphan index entry) | several | reindex Product |

## Before the next owner continues
1. Run 056 and 065, then the browser lane of 050b*/050c.
2. Push and commit the W3 repairs, re-run the repaired machine cases on the seeded data, and triage the 29 FAILs that have no verdict (`untriaged` in state.json).
3. File the two new regressions and decide on the pre-existing batch (see PROGRESS.md *Real bugs awaiting filing*).
