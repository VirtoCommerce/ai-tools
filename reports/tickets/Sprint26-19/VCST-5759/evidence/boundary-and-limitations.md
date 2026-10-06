# Boundary probes — the fix's declared limits, verified

The PR states two limitations explicitly. Both were exercised rather than taken on trust.

## L1. Other contact writers can still produce a nameless contact — CONFIRMED, as declared

On the **fixed** build (vcptcore-qa, SalesRep `3.1011.0-pr-17-47fb`), against the rep created in B3:

| Step | Result |
|---|---|
| `GET /api/members/a42a16b5-…` | `firstName='Green'  lastName='Verified'  fullName='Green Verified'` |
| `PUT /api/members` with `firstName=null, lastName=null` | **HTTP 204 — accepted** |
| `GET /api/members/a42a16b5-…` | `firstName=None  lastName=None  fullName='Green Verified'` |
| storefront `query { me { contact { firstName lastName } } }` | `INVALID_OPERATION` on both fields, `contact: null` — **locked out again** |

Two observations worth recording:

1. The validator guards **only** the `/api/sales-rep` aggregate save path, exactly as the PR says. The
   Contacts blade, `POST/PUT /api/members`, customer import and the storefront's own `updatePersonalData`
   all remain uncovered, and each can re-create the reported symptom on a rep.
2. **`fullName` is not recomputed by the `/api/members` write** — it kept the stale value `Green Verified`
   while `firstName`/`lastName` went null. Pre-existing behaviour of that endpoint, unrelated to this PR,
   but it means a nameless contact can still present a plausible-looking `fullName`.

State was restored via `PUT /api/sales-rep` (names back to `Green` / `Verified`, HTTP 200, re-read confirmed).

## L2. Existing nameless reps are not repaired — no live instance on this stand

Scanned **all 23** sales reps on vcptcore-qa (`/api/sales-rep/search` → per-id `GET`):
**0 have an empty first or last name.** So the "existing data stays locked out" limitation has nothing to
repair here and could not be exercised on vcptcore-qa. It *was* exercised on vcptcore-qa1, where the
pre-fix rep created for the Phase A baseline is still nameless and still locked out — which is the
documented behaviour, not a regression.
