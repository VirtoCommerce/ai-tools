# A buyer refused by membership status sees a raw English server message with the internal organization ID — **P3**

## Status: CONFIRMED (live: 3x chrome, 4a chrome row 10, C1 REG-2026-10-20-0125 OTP-036)
**Found by:** agent, testing VCST-6132 (`/qa-test` FULL, 2026-10-20)
**Tracker:** not filed. It is below the severity floor (Low) and is named in the VCST-6132 QA comment.
**Archetype:** `FALLBACK` · **Provenance:** PRE-EXISTING. The sign-in forms have no locale key for this code. PR #321 only changes when this refusal is reached.

**Env:** vcptcore_qa1 · theme `2.61.0-pr-2575` · Customer `3.1030.0-pr-321-c54f`.

## STR
A buyer belongs to Org A and Org B, and both memberships have Invite status **Rejected**. On `/sign-in` they enter their email and then the code.

## Actual
`/connect/token` returns 400 `invalid_grant` with code `user_is_rejected_in_organization` and one `errors[]` entry, which is correct. The code step then shows the server's English description word for word:
"Your access to organization '9d2d7e5d-02f8-4a35-8134-26cfe1cb4d93' has been rejected. Please contact your organization administrator."
The buyer sees a GUID where the company name should be, and only one of the two rejected organizations is mentioned.
Evidence:
- `reports/tickets/Sprint26-21/VCST-6132/screenshots/4a-ui-10-both-rejected-raw-guid.png`
- `…/3x-S4b-both-rejected-verify-step-raw-guid.png`

## Expected
An organization-specific, localized message with no internal identifiers `{BL}` (BL-AUTH-013: "the storefront sign-in form … MUST surface org-specific copy"). The same applies to `user_invitation_pending_in_organization`, `user_is_removed_from_organization` and `invalid_organization_id`.

## Note
In `locales/en.json`, `shared.account.sign_in_form.errors` has a key only for `user_is_locked_in_organization`. For the other codes `translate()` falls back to the server description.

## Cases holding the expectation
`OTP-036` (suite 104, Draft, `Catches:suspect-3x-S2`).

## Fix Routing
`VirtoCommerce/vc-frontend` · `locales/*.json` `shared.account.sign_in_form.errors` + `otp-email-verify-form.vue` / the password sign-in form. Also consider the server description in vc-module-customer, which embeds the org ID.
