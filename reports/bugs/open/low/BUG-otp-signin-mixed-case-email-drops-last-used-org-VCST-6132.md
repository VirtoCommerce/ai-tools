# Code sign-in with the email typed in a different letter case does not send the last-used organization — **P3**

## Status: CONFIRMED (live: 3x chrome, 4a chrome row 24, C1 REG-2026-10-20-0125 OTP-041)
**Found by:** agent, testing VCST-6132 (`/qa-test` FULL, 2026-10-20)
**Tracker:** not filed. It is below the severity floor (Low) and is named in the VCST-6132 QA comment.
**Archetype:** `STALE` · **Provenance:** PRE-EXISTING. The storefront code came in with VCST-5748 (vc-frontend #2477); PR #321 does not touch it.

**Env:** vcptcore_qa1 · theme `2.61.0-pr-2575` · Customer `3.1030.0-pr-321-c54f` · `{{STORE_ID}}`.

## STR
1. A buyer who belongs to Org A and Org B, with userName = email in lowercase, signs in and switches to Org A in the header, then signs out.
2. On `/sign-in` (the code view), type the same email with a capital first letter (`Agent-test-…`), then press Continue and enter the code.

## Actual
`POST /connect/token grant_type=otp_email` is sent **without** `organization_id`. The buyer lands in the server's current organization, not in Org A. In 4a this was claim B with header B.
Evidence:
- `reports/tickets/Sprint26-21/VCST-6132/screenshots/4a-ui-24-mixed-case-email-lands-B.png`
- `reports/tickets/Sprint26-21/VCST-6132/screenshots/3x-20-mixed-case-email-lands-B.png`

## Expected
The buyer lands in the organization they last switched to, whatever letter case the email is typed in `{SPEC}` (VCST-6132 Context: "the storefront sends the organization the user last switched to"). The lowercase control in the same state sent Org A and landed in Org A.

## Note
Sign-in reads `localStorage["organization-id-<email as typed>"]`. The switcher writes `organization-id-<userName>`. The password form reads the typed username the same way, so the same gap probably applies there too (not checked).

## Cases holding the expectation
`OTP-041` (suite 104, Draft, `Catches:suspect-3x-S1`).

## Fix Routing
`VirtoCommerce/vc-frontend` · `client-app/shared/account/composables/useAuth.ts` (read key) vs `useUser.ts` `switchOrganization` (write key).
