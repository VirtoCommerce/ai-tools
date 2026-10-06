# VCST-6116 — Verification report

**Verdict:** VERIFIED · **STR:** 3/3 · **Checks:** 38/38 PASS · **Date:** 2026-10-05
**Env:** vcptcore-qa (`BACK_URL` from `.env.vcptcore`) · Platform 3.1076.0 · **XCart 3.1038.0-pr-141-b404** (PR #141 head `b40455e`, fix commit `cae453d`) · Cart 3.1011.0-pr-194-8331
**Layer:** GraphQL xAPI (`addWishlistItem`, `updateWishListItems`). Executed directly via xAPI + admin REST, no browser.

## Bug
`addWishlistItem` and `updateWishListItems` ran `Send(command)` (which persists) before `AuthorizeByListIdAsync`. A refused caller got `Access denied`, but the change was still written. Fix: authorize before `Send` in both resolvers.

## Before → after
| | RED: pre-fix, XCart `pr-141-fb27`, 2026-09-29 | GREEN: XCart `pr-141-b404`, 2026-10-05 |
|---|---|---|
| Read reader (AcmeCorp) `addWishlistItem` qty 1 | `Access denied`, owner qty 3 → 4 (persisted) | `Forbidden`, owner qty stays 2 |
| No-access user (TechFlow member) `addWishlistItem` | `Access denied`, qty keeps growing | `Forbidden`, qty 2 |
| Anonymous | `Anonymous access denied`, qty grew to 6 | `Unauthorized`, qty 2 |
| `updateWishListItems` qty 50 (all 3 actors) | from source only | refused, qty 2 |
| New product line (all 3 actors) | not verified | refused, still 1 line |
| Storage read (admin REST `/api/carts/{id}`, uncached) | qty 6 persisted | 1 line, qty 2 |

RED baseline: `reports/tickets/Sprint26-19/VCST-5707/screenshots/4a-be-BUG-refused-addWishlistItem-persists.json`, `4a-be-E10-refused-add-quantity.json` (the /qa-test VCST-5707 run that found this bug).

## STR (×3, fresh list each run)
1. Rep `@td(SR_REP_PRIMARY)` creates `AGENT-TEST-6116-rN`, adds the baseline product with qty 2, then shares the list (Customer scope) with AcmeCorp.
2. Reader `@td(ACME_BUYER)` (org grant), a TechFlow member `@td(SR_REP_EXCLUSIVE_TECHFLOW)` and an anonymous caller each call `addWishlistItem` (same product, qty 1), `updateWishListItems` (qty 50) and `addWishlistItem` (another buyable product).
3. The owner re-reads the list after every call, and storage is read through admin REST.

Result: every refused call left the list unchanged in all 3 runs.

## Checklist
| # | Item | Result |
|---|---|---|
| 1 | Original bug reproduced (RED on record) | PASS: baseline cited above |
| 2 | Refused add / update / new line do not persist (3 actors × 3 runs) | PASS 27/27 |
| 3 | Root cause addressed: storage unchanged on an uncached read, plus a ~10-min delayed re-read | PASS: see `phaseB-delayed-reread.json` |
| 4 | Reader still reads the shared list (`sharedWishlist`, access=Read) | PASS 3/3 |
| 5 | Owner can still add (2→3) and update (3→2) | PASS |
| 6 | Adjacent mutations by the reader stay refused and do not persist: `addWishlistItems`, `removeWishlistItem`, `changeWishlist` (rename) | PASS |
| 7 | Error codes: authenticated → `Forbidden`, anonymous → `Unauthorized`, `data: null` | PASS |
| 8 | No 5xx / unexpected GraphQL errors in the run | PASS |

Business rules: no list-sharing `BL-*` exists. Expected behaviour comes from the ticket (`{SPEC}`).

## Evidence
- `phaseB-green-calls.json`: every request and response of the GREEN run (bearer redacted), with per-check results
- `phaseB-delayed-reread.json`: storage state ~10 min later
- `evidence.html`: before → after page

## Notes
- Test lists `AGENT-TEST-6116-r1..r3` are removed after the delayed re-read.
- `SR_REP_PASSWORD` lives only in `.env.playwright.local`, which `config.js` does not load. A Node xAPI run has to read it from there.
