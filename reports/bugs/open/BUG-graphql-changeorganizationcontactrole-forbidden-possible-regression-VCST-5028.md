# BUG — `changeOrganizationContactRole` / `lockOrganizationContact` / `unlockOrganizationContact` return Forbidden for an org-maintainer token — possible regression of the fixed VCST-5028 permission bug · High

**Env:** vcst-qa @ Platform 3.1051.0 · ProfileExperienceApi 3.1015.0-pr-141-d7d8
**Found by:** `/qa-regression` REG-2026-07-30-1040, suite 050d (PRF-GQL-066, 067, 068, 069) · triaged `REAL_BUG`

## Summary

All four org-scoped member-management mutations exercised in this batch — `changeOrganizationContactRole`
(happy path + org-scope guard) and `lockOrganizationContact`/`unlockOrganizationContact` — return
`Forbidden`/"Access denied." for a `TECHFLOW_ADMIN` token that, per the case's own setup, holds
`xapi:my_organization:edit` among 11 granted permissions.

## Evidence (all four cases, identical signature)

```json
{"data":{"changeOrganizationContactRole":null},
 "errors":[{"message":"Access denied.","extensions":{"code":"Forbidden"}}]}
```
Same shape for `lockOrganizationContact`/`unlockOrganizationContact` (PRF-GQL-068/069). Each case's schema
validation passes (`schemaValid:true`) — the mutation is well-formed; the rejection is authorization, not
coercion.

## Why this looks like a regression, not a fresh defect

`reports/bugs/fixed/BUG-org-scoped-maintainer-perms-not-honored-VCST-5028.md` (Status: FIXED, verified
2026-06-19 on `ProfileExperienceApi 3.1008.0-pr-135-402e`) documented this **exact** signature — TechFlow
org-maintainer, JWT carrying `xapi:my_organization:edit`, `changeOrganizationContactRole`/
`lockOrganizationContact` → `Forbidden`, root-caused to `ProfileSchema.CheckAuthAsync` and the `me`/
`GetPageContext` permission resolver not deriving permissions from `OrganizationMembership` roles. That fix
shipped on PR #135. This run's build is `ProfileExperienceApi 3.1015.0-pr-141-d7d8` — a **different** PR
branch. Given the byte-identical symptom on a different branch, the most likely explanations are (a) PR
#141 was cut from a point before #135 merged and doesn't carry the fix, or (b) the fix regressed. Both
point to the same next step.

## Expected vs actual

**Expected:** `errors[]` empty, `succeeded:true` (change-role) / `id` returned (lock/unlock) — as verified
fixed on `pr-135-402e`.

**Actual:** `Forbidden` on all four, on `pr-141-d7d8`.

## Fix Routing

- **Layer:** L3 GraphQL xAPI — `ProfileSchema.CheckAuthAsync` + the `me`/`GetPageContext` permissions resolver
- **Repo:** `vc-module-profile-experience-api`
- **Suggested fix:** diff `pr-141-d7d8` against the `pr-135-402e` fix commit (`UserType.permissions` from
  JWT claims; `GetUserQueryHandler.ApplyOrganizationRolesAsync`; `ProfileSchema.CheckAuthAsync` against the
  JWT principal) to confirm whether #141 branched before or after #135, and whether the fix is present.
- **Routing confidence:** HIGH on the symptom match; the regression-vs-not-yet-merged distinction needs a
  source diff to confirm — recommend `/qa-verify-fix` re-running the original VCST-5028 BUG-A repro on this
  exact build as the fastest confirmation.
- Do NOT auto-merge — human review required.
