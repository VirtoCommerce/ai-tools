# A failed organization switch signs the buyer out with no message and is still saved as their last-used organization — **P3**

## Status: CONFIRMED (live: 4a chrome row 18, VCST-6132)
**Found by:** agent, testing VCST-6132 (`/qa-test` FULL, 2026-10-20)
**Tracker:** not filed. It is below the severity floor (Low) and is named in the VCST-6132 QA comment.
**Archetype:** `SILENT` · **Provenance:** PRE-EXISTING (storefront theme). PR #321's fallback hides the effect on the next sign-in.

**Env:** vcptcore_qa1 · theme `2.61.0-pr-2575` · Customer `3.1030.0-pr-321-c54f`.

## STR
1. A buyer in Org A and Org B, both active, is signed in with the account menu's Organizations list open.
2. An admin locks the buyer's membership in Org B, or removes Org B from the contact.
3. The buyer clicks Org B, which is still shown as enabled in the open menu.

## Actual
- `refresh_token` with `organization_id=B` → 400 `invalid_grant` "The specified refresh token is no longer valid." (ID2018). Membership changes revoke the user's tokens by design: `RevokeTokenOrganizationMembershipChangedEventHandler`, kb KB-D1D30720.
- The buyer is **signed out silently**: the header shows "Sign in / Sign up now" and there is no message.
- `localStorage["organization-id-<userName>"]` is still set to **B**, so the next code sign-in sends the refused organization (kb KB-D59DDAAD).

Evidence:
- `reports/tickets/Sprint26-21/VCST-6132/screenshots/4a-ui-18-switch-to-locked-B-signed-out.png`
- The removed-org variant behaved the same (400 on refresh, silent sign-out); its frame was not captured.

## Expected
The switch is refused with a message, and the refused organization is not stored as the last-used one `{HYPOTHESIS}` (UX expectation; no written spec). If a sign-out is unavoidable after token revocation, it should say why.

## Related (same surface, Low)
In the switcher, the locked option's accessible name is just the org name plus "disabled". The reason ("This organization is locked…") exists only in the `title` tooltip, so screen-reader users do not hear it (BL-A11Y name/role/value).

## Note
`useUser.switchOrganization` awaits `useAuth.refresh()`, which swallows the error (it resets the tokens and emits unauthorized, with no rethrow). After that, `localStorage.setItem("organization-id-<userName>", target)` still runs.

## Fix Routing
`VirtoCommerce/vc-frontend` · `client-app/shared/account/composables/useUser.ts` (`switchOrganization`) and `useAuth.ts` (`refresh`).
