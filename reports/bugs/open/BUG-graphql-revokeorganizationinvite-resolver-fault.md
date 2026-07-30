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
