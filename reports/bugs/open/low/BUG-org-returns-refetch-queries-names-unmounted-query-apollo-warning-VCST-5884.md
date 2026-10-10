# Submit / cancel return logs Apollo error 43: `refetchQueries` names queries that are not mounted — **P3**

## Status: CONFIRMED — BELOW SEVERITY FLOOR (Low/P3): draft kept, NOT filed in the tracker
**Found by:** agent — testing VCST-5884
**Tracker:** none (below the 5-file floor Critical/High/Medium); named in the VCST-5884 QA-Complete comment under "Not filed (below severity floor)"
**Oracle:** none written — discovery check "a clean console".
**Provenance (per warning):**
- `GetOrganizationReturns` — **IN-SCOPE**: named in `client-app/modules/returns/api/graphql/mutations/submitReturn/index.ts:10` and
  `cancelReturn/index.ts:8-13` by PR #2523, but the organization list is not mounted while those mutations run.
- `GetReturns` and `GetReturnableItems` — **PRE-EXISTING** (the same warnings pre-date this ticket).
The prior QA round reported it at the older head too.

## Environment
- Storefront theme `2.60.0-pr-2523-9e4e-9e4e67ef` (vc-frontend PR #2523 @ 9e4e67e), Return `3.1005.0-pr-28-62f9`, Platform 3.1076.0, env vcst

## Steps to reproduce
1. As the buyer `@td(ORG_RET_BUYER.email)` open a Completed order, create a return, submit it, then cancel it (browser console open).
2. Read the console after each mutation. Seen in lane A and lane V.

## Expected
A clean console.

## Actual
Apollo error 43 ("unknown query in refetchQueries") on 9e4e67e:
- create -> `GetReturns`
- submit -> `GetReturns` + `GetOrganizationReturns`
- cancel -> `GetReturns` + `GetOrganizationReturns` + `GetReturnableItems`

No console ERRORS and no functional effect: both lists reload from the server when the page is shown again (`cache-and-network`).

Evidence (console logs, same folder `reports/bugs/screenshots/org-returns-refetch-queries-names-unmounted-query-apollo-warning-VCST-5884/`):
`A17-console-create-submit-refetch-warnings.log`, `A17-console-cancel-after-submit-refetch-warnings.log`.

## Layer Validation
| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront Frontend | **FAIL** | warnings on create / submit / cancel (see logs) |
| 2. Backend Admin | N/A | not involved |
| 3. GraphQL xAPI | PASS | mutations succeed; only the client refetch list is wrong |
| 4. Platform REST API | N/A | not involved |

**Owning layer:** 1 — vc-frontend, `submitReturn/index.ts:10`, `cancelReturn/index.ts:8-13`.

## Impact / severity — P3, Low
Console noise only; no user-visible or functional effect.

## Fix Routing
Repo `vc-frontend`. Drop `GetOrganizationReturns` from `refetchQueries` (or pass the active-only form), as the PR's own note says
neither list is mounted. The pre-existing `GetReturns` / `GetReturnableItems` entries can be handled in the same change. Not breaking.
