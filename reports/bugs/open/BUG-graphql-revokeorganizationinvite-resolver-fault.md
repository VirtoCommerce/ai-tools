# BUG — `revokeOrganizationInvite` GraphQL mutation fails to resolve ("Error trying to resolve field") · High

**Env:** vcst-qa @ Platform 3.1051.0 · ProfileExperienceApi 3.1015.0-pr-141-d7d8
**Found by:** `/qa-regression` REG-2026-07-30-1040, suite 050d (PRF-GQL-074) · triaged `REAL_BUG`
**BL:** BL-B2B-009 · vc-module-profile-experience-api#141 `revokeOrganizationInvite(command: InputRevokeOrganizationInviteType!): ContactType`

## Summary

`revokeOrganizationInvite` — schema-valid per PR #141 — returns a GraphQL-layer `INVALID_OPERATION` fault
("Error trying to resolve field 'revokeOrganizationInvite'.") instead of executing, and (per an isolated
follow-up probe) leaves the membership silently unchanged rather than transitioning it to a blocking
status.

## Steps to reproduce

```graphql
mutation {
  revokeOrganizationInvite(command: { memberId: "<invited member id>" }) {
    id
    statusInOrganization
  }
}
```

Precondition: a pending (`Invited`) `OrganizationMembership` for the target member, authenticated as
`ADMIN_DEFAULT`.

## Expected vs actual

**Expected:** `errors[]` empty; `data.revokeOrganizationInvite.statusInOrganization` is one of the four
legal `MembershipStatuses` values and is a member of `BlockingStatuses {Invited, Rejected, Deleted}` — a
revoked invite must not leave the invitee with org access (BL-B2B-009 + `ModuleConstants.BlockingStatuses`).

**Actual:**
```json
{"data":{"revokeOrganizationInvite":null},
 "errors":[{"message":"Error trying to resolve field 'revokeOrganizationInvite'.",
            "path":["revokeOrganizationInvite"],
            "extensions":{"code":"INVALID_OPERATION"}}]}
```
A follow-up isolated probe additionally observed the resolver leaving the membership at `Invited` (a
silent no-op rather than an exception-and-rollback), and inconsistent behavior versus the sibling
`rejectOrganizationInvite` mutation on the same command shape — flagging the whole revoke/reject resolver
pair as needing a robustness pass, not just this one case.

## Fix Routing

- **Layer:** L3 GraphQL xAPI
- **Repo:** `vc-module-profile-experience-api`
- **Component:** the `revokeOrganizationInvite` field resolver (PR #141, `InputRevokeOrganizationInviteType`)
- **Suggested fix:** investigate the resolver binding for `revokeOrganizationInvite` (`INVALID_OPERATION` on
  field resolution suggests a DI/handler wiring gap rather than a business-logic rejection); once resolving,
  confirm it actually transitions `statusInOrganization` into a blocking status and audit
  `rejectOrganizationInvite` for the same class of issue.
- **Routing confidence:** MEDIUM — the resolver fault is directly reproduced; the no-op characterization is
  from a single follow-up probe and should be re-verified before a fix is scoped.
- Do NOT auto-merge — human review required.

## Re-verification attempt 2026-08-26 — BLOCKED on the fixture, not yet re-verified

**Module has moved:** `VirtoCommerce.ProfileExperienceApiModule` is now **3.1016.0** on vcst-qa; the draft
reproduced on the pre-release `3.1015.0-pr-141-d7d8`. So the branch under test has been superseded by a
released build and this draft genuinely needs a fresh run — it may well be fixed.

**Why it could not be run:** the repro needs an **org-scoped org-maintainer token** for `TECHFLOW_ADMIN`
(`test-emily.johnson-20260310@test-agent.com`, `@td(ORG_TECHFLOW.platform_id)`), and that grant could not be
obtained. Root cause was in **this repo's own tooling, now fixed**: `config.js` exported `ORG_USER_EMAIL`
but **not** its matching `ORG_USER_PASSWORD` (the value is present in `.env.local` and in `process.env` —
it simply was not surfaced on the `env` object). Consumers reading `env.ORG_USER_PASSWORD` therefore
authenticated with an **empty password**.

The platform reports that as `400 {"code":"user_cannot_login_in_store","description":"Access denied. You
cannot sign in to the current store"}` — which reads as a store-permission problem, not a missing secret,
so it is easy to misdiagnose as the very `Forbidden`/access defect under test. **Do not mistake this for a
reproduction of the bug.**

> **Fixture impact, self-inflicted:** the repeated empty-password attempts **locked the shared account out**
> (`lockoutEnd 2026-08-26T09:27:49Z`, `accessFailedCount` reset to 0 on lock). The lockout is temporary and
> has since expired, but while it held, any concurrent suite using `ORG_USER` would have failed. Flagged
> rather than left silent. `config.js` now exports the pair symmetrically, so this cannot recur the same way.

**Status: still open, re-verification outstanding.** Not re-confirmed and not cleared.

### CORRECTION (same day) — the lockout was NOT the whole story

Retried **after** the lockout window expired (`lockoutEnd 09:27:49Z`) and **with a correctly resolved
password** (`env.ORG_USER_PASSWORD` now exported): the grant **still fails identically** —
`400 user_cannot_login_in_store`.

So the empty-password bug and the lockout it caused were real, but they were **not** the reason this fixture
is unusable. `TECHFLOW_ADMIN` (`test-emily.johnson-20260310@test-agent.com`) genuinely cannot obtain a
token for `B2B-store` on vcst-qa right now, with valid credentials and no lockout in force. The account
itself reads healthy from the admin API — `status: Approved`, `storeId: B2B-store`,
`lockoutEnabled: true` with the window passed, `roles: []` (expected — org permissions come from
`OrganizationMembership`, not the security account, per VCST-5028).

**That is a fixture/environment problem in its own right**, and it blocks any org-scoped suite using
`ORG_USER`, not just these two drafts. It is plausibly the same family as
`project_org_default_org_not_status_validated` (VCST-5281 — a store-scoped grant refused because the
contact is pinned to an org whose status blocks sign-in). Worth running `td:reconcile` against this env and
checking the contact's org memberships/status before assuming these two drafts are stale.

**Do not read `user_cannot_login_in_store` as a reproduction of the `Forbidden` defect under test** — it
happens before any GraphQL call.
