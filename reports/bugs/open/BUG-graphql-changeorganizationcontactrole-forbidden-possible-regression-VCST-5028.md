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
