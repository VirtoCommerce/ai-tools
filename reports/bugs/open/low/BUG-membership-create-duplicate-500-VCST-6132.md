# Creating an organization membership that already exists returns HTTP 500 instead of a 4xx — **P3**

## Status: CONFIRMED (live: 4a chrome setup, VCST-6132)
**Found by:** agent, testing VCST-6132 (`/qa-test` FULL, 2026-10-20), seen during fixture setup
**Tracker:** not filed. It is below the severity floor (Low) and is named in the VCST-6132 QA comment.
**Archetype:** `BOUNDARY` · **Provenance:** PRE-EXISTING (vc-module-customer REST). Not touched by PR #321.

**Env:** vcptcore_qa1 · Customer `3.1030.0-pr-321-c54f`.

## STR
As an admin, `POST /api/customer/organization-memberships` for a user and organization that already have a membership.

## Actual
HTTP **500** with the message "Membership for user … and organization … already exists."

## Expected
A client error (400 or 409) carrying the same message `{BL}` (BL-AUTH-017 spirit: a bad request yields a 4xx, never a 500). A 500 tells API clients and monitoring that the server failed, when the request was the problem.

## Fix Routing
`VirtoCommerce/vc-module-customer` · the organization-memberships controller/service: map the duplicate-membership validation to a 4xx.
