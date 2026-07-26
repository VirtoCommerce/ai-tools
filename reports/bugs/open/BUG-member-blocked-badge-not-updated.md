# Members list keeps showing "Active" badge after a member is blocked — P2

**Env:** vcst-qa @ Platform 3.1043.0, Theme 2.53.0-pr-2368

## Summary
After blocking an organization member, the `/company/members` Active-column badge continues to render "Active" even after a full page reload. Block enforcement itself works (the blocked user's login is rejected) and the Actions dropdown correctly flips to "Unblock user" — so the client has the blocked state; only the status badge fails to reflect it.

## STR
1. Sign in as an org admin (AcmeCorp) and open `/company/members`.
2. Open the Actions dropdown for a member (Sarah Chen) and choose "Block user".
3. Confirm the dropdown now shows "Unblock user".
4. Reload the page and read the member's Active-column badge.

## Expected vs Actual
- **Expected:** The status badge shows "Blocked" (or equivalent), consistent with the "Unblock user" action and the enforced login rejection.
- **Actual:** The badge still renders "Active" after a full reload, contradicting the actual blocked state.

## Evidence
![Blocked badge stays Active](screenshots/B2C-MBR-012-CONFIRMED-blocked-badge-stays-active.png)

## Root cause (suspected)
The Active-column badge is derived from a stale/wrong field — the members-list row reads a status source that isn't the one flipped by block, even though the same record's blocked flag drives the Actions dropdown and login enforcement correctly.

## Fix Routing
- **Repo:** vc-frontend (members list status badge read/mapping)
- **Kind:** frontend
