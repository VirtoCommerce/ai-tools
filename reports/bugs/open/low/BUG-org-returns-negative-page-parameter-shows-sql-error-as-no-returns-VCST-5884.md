# Organization returns: `?page=-1` sends `after:"-20"`, the SQL error is shown as "There are no returns yet" — **P3**

## Status: CONFIRMED — BELOW SEVERITY FLOOR (Low/P3): draft kept, NOT filed in the tracker
**Found by:** agent — testing VCST-5884
**Tracker:** none (below the 5-file floor Critical/High/Medium); named in the VCST-5884 QA-Complete comment under "Not filed (below severity floor)"
**Oracle:** none written. Discovery finding: an input error must not be presented as an empty result, and a database error must not surface.
**Provenance:** unclear whether it pre-dates the list refactor in PR #2523 (the own list before the refactor was not checked); per the
triage rule an unclear provenance is treated **IN-SCOPE** (fail-safe). The own list (`/account/returns?page=-1`) does the same.
**Backend half:** `after: "-20"` reaches the Return module paging unvalidated. Lane B saw the same family on the own `returns` query:
`first:-1` returns 1 item and an unknown sort field is accepted silently — PRE-EXISTING, low.

## Environment
- Storefront theme `2.60.0-pr-2523-9e4e-9e4e67ef` (vc-frontend PR #2523 @ 9e4e67e), Return `3.1005.0-pr-28-62f9`, Platform 3.1076.0, env vcst

## Steps to reproduce
1. Sign in as the holder `@td(ORG_RET_HOLDER_GLOBAL.email)`.
2. Open `/account/returns?scope=organization&page=-1` (the URL edited by hand).

## Expected
The client clamps to page 1 (it already moves a page past the END back to the last one), or the server answers a validation error.

## Actual
The request sends `after:"-20"`; the response is `errors[0].extensions.code:"SQL"` with `organizationReturns:null`. The page shows the
empty state "There are no returns yet" plus a generic toast "Something went wrong. Please try again later." — a database error
presented as an empty result.

![page=-1: SQL error shown as an empty result](../../screenshots/org-returns-negative-page-parameter-shows-sql-error-as-no-returns-VCST-5884/A15-org-tab-page-minus1-sql-error-shown-as-no-match.png)

## Layer Validation
| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront Frontend | **FAIL (symptom)** | no clamp of a negative page; the error is rendered as an empty state |
| 2. Backend Admin | N/A | not involved |
| 3. GraphQL xAPI | **FAIL (cause)** | `after:"-20"` accepted unvalidated -> `extensions.code:"SQL"`, `organizationReturns:null` |
| 4. Platform REST API | N/A | not involved |

**Owning layer:** 3 — vc-module-return paging validation, with a 1 — vc-frontend clamp as the cheaper guard.

## Impact / severity — P3, Low
Reachable only by editing the URL; no data exposure. The cost is a misleading empty state and a raw database error code in the response.

## Fix Routing
Repo `vc-frontend` (clamp the page to >= 1, as is already done past the last page) and/or `vc-module-return` (validate `after`/`first`
and answer a validation error). Not a breaking change.
