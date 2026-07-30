# BUG — Existing-user org-invite notification silently drops `urlSuffix` (and all identifying params) · High

**Env:** vcst-qa @ Platform 3.1051.0 · Customer 3.1021.0-pr-312-2257 · ProfileExperienceApi 3.1015.0-pr-141-d7d8
**Found by:** `/qa-regression` REG-2026-07-30-1040, suite 027 (CUST-090) · triaged `REAL_BUG`
**BL:** BL-B2B-009

## Summary

`inviteUser` accepts an optional `urlSuffix` on the mutation, but it is honored only on the **new**-user
notification branch. On the **existing**-user branch it is silently discarded, and the link the invitee
receives carries no `userId`/`email`/`token`/`organizationId` at all.

## Steps to reproduce

1. As an org maintainer, call `inviteUser(command:{storeId, organizationId, emails:[<existing user's email>], urlSuffix:"/confirm-invitation"})`.
2. Read the resulting `OrganizationInviteExistingUserEmailNotification` email body.
3. As a control, repeat step 1 with a **new** email address and read the resulting
   `OrganizationInviteNewUserEmailNotification` body.

## Expected vs actual

**Expected:** both notification types honor `urlSuffix` and carry identifying query parameters.

**Actual:**
- Existing-user link: `{{FRONT_URL}}/account/dashboard` — no query string, `urlSuffix` ignored.
- New-user (control) link: `{{FRONT_URL}}/confirm-invitation?userId=...&email=...&token=...&organizationId=...` —
  `urlSuffix` honored, fully parameterised.

REST cross-check: the membership row is created correctly (`status="Invited"`) regardless — this is a
notification-rendering defect, not a membership-creation defect.

## Related — read before triaging as identical to VCST-5281's invite-lockout item

`COMP-E2E-026` (same run, suite 011b) probed the same notification type on a later build/fixture and found
the existing-user template **intentionally** targets `/account/dashboard` with no query string — "because
you already have an account, there's nothing new to set up" — landing the user straight at the
`pending-invites-widget`, which resolves the invite from the authenticated session, not the URL. That
supports the *destination* being by-design. It does **not** explain why the accepted `urlSuffix` parameter
is silently ignored on this branch when it is honored on the new-user branch — that inconsistency in the
mutation's own parameter handling is the defect being filed here, independent of whether the dashboard
target itself is correct. (Separately, `COMP-E2E-026` shows that dashboard is often unreachable due to the
VCST-5281 org-pinning defect — see `BUG-invite-to-second-org-locks-out-entire-storefront-VCST-5281.md` —
which is the actual reason "the invite can never be accepted," not this URL gap by itself.)

## Fix Routing

- **Layer:** L3 xAPI (notification templating) — `OrganizationInviteExistingUserEmailNotification` build path
- **Repo:** `vc-module-profile-experience-api` or `vc-module-customer` (wherever `urlSuffix` is applied per notification type)
- **Suggested fix:** apply `urlSuffix` (and the same identifying params used on the new-user branch) uniformly
  across both existing-user and new-user invite notification builders, or document why the existing-user
  branch intentionally omits both and remove the unused parameter from that path.
- Do NOT auto-merge — human review required.
