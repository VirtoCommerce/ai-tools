# BUG — Org-scoped maintainer permissions reach the JWT but are not honored by xAPI (member-management blocked) `[High / P1]`

## Status: CONFIRMED

**Env:** vcst-qa @ Platform 3.1037.0 · ProfileExperienceApi `3.1008.0-pr-135-cb12` (PR#135) · Customer `3.1010.0-pr-300-fa2a` (PR#300) · theme `2.51.0-pr-2315-c85b` (PR#2315)
**Feature:** VCST-5028 — per-organization roles & access control. **Related:** VP-9137 (Feature Bug, In Progress — likely already tracks this), VCST-5239.

## Summary
An organization maintainer's per-org role grants `xapi:my_organization:edit`, and this permission **is correctly injected into the storefront JWT** (`OrganizationIdClaimProvider` works — AC1 verified). But the xAPI permission *resolution* does not derive permissions from the user's `OrganizationMembership` role: the `me`/`GetPageContext` projection returns `permissions: []` for an org-active maintainer, and the xAPI authorization handler rejects the org-management mutations as `Forbidden`. Net effect: **an org maintainer cannot govern their organization** — neither from the storefront UI nor via the API. This breaks the ticket's primary user story (AC2).

## Steps to Reproduce
**Fixture:** `agent-test-multiorg-20260615@yopmail.com` / `Password1!` — TechFlow org = `org-maintainer`, BuildRight = `org-employee` (alias `MULTI_ORG_TF_BR`).

**Path A — storefront (user-visible):**
1. Sign in on the storefront; switch active org to **TechFlow** (where this user is org-maintainer).
2. Decode the bearer (localStorage / Authorization header) → `permission[]` contains all 8 maintainer perms incl. `xapi:my_organization:edit`. ✅ JWT is correct.
3. Go to `/company/members`.
4. **Expected:** as maintainer, see Invite + per-row Change-role / Block actions.
5. **Actual:** no Invite button, no row actions — the member list is effectively read-only. The gating `checkPermissions()` reads `pageContext.user.permissions`, and the `GetPageContext` xAPI response returns `permissions: []`, `roles: []` for this maintainer (network capture), **despite** the JWT carrying the perms and `GetOrganizationContacts` returning `rolesInOrganization: org-maintainer`.

**Path B — xAPI (same root, direct):**
1. With the TechFlow-maintainer storefront bearer, `POST {BACK_URL}/graphql`:
   `mutation { changeOrganizationContactRole(command:{ memberId:"<TF member>", roleIds:["org-manager"] }) { succeeded errors{ code description } } }`
2. **Expected:** `succeeded: true`.
3. **Actual:** top-level `errors[]` = `Forbidden` — *"User doesn't have the required permission 'xapi:my_organization:edit'."* Same for `lockOrganizationContact`. Reproduced across **2 maintainer identities** and **2 endpoints**, both mutations. The negative case (org-employee → Forbidden) behaves correctly, so the handler runs — it just doesn't recognize the maintainer's *granted* org-scoped permission on the positive path.

## Expected vs Actual
- **Expected:** org maintainer's `OrganizationMembership` role permissions are honored by xAPI permission resolution (both `me`/pageContext projection and authorization), so member management works in UI + API for the org they maintain.
- **Actual:** permissions exist only in the JWT claim; the xAPI re-resolves effective permissions from a source that excludes org-membership roles → empty perms / Forbidden.

## Evidence
- `tests/Sprint26-11/VCST-5028/screenshots/AC2-FAIL-no-invite-no-actions-maintainer.png` (no controls as maintainer)
- `AC1-B-01-org-memberships-widget.png` (admin shows correct per-org roles — data is stored correctly)
- App Insights (test window, vcst-qa backend): `VirtoCommerce.Xapi.Core.Security.Authorization.AuthorizationError @ VirtoCommerce.ProfileExperienceApiModule.Data.Schemas.ProfileSchema+<CheckAuthAsync>` on `POST graphql/` ×2 — *"User doesn't have the required permission 'xapi:my_organization:edit'."*
- Console/network: `GetPageContext` → `permissions: []`; `changeOrganizationContactRole` → `errors[0].code = Forbidden`.

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | FAIL (inherited) | `/company/members` hides all member-mgmt controls because `pageContext.user.permissions = []`. Screenshot above. |
| 2. Backend Admin | PASS | "Organization memberships" widget shows TechFlow=maintainer / BuildRight=employee correctly. |
| 3. GraphQL xAPI | **FAIL (owning)** | `me`/`GetPageContext` returns `permissions:[]` for org-maintainer; `changeOrganizationContactRole`/`lockOrganizationContact` → `Forbidden`. App Insights pins `ProfileSchema.CheckAuthAsync`. |
| 4. Platform REST API | PASS | `OrganizationMembershipController` stores/returns per-org roles correctly (REST PUT role-change works; AC1-B-02 PASS). Entity logic sound. |

**Owning layer:** Layer 3 — GraphQL xAPI (the storefront Layer-1 failure is inherited from the empty `me.permissions` projection).

## Root Cause Analysis
`OrganizationIdClaimProvider` (vc-module-customer) correctly writes org-scoped role permissions into the issued JWT (AC1 proves per-org permission sets differ and are correct). However, the xProfile xAPI does **not** read effective permissions from the caller's `OrganizationMembership` role for the active org:
- the `me` / `GetPageContext` permissions resolver projects an empty `permissions[]`/`roles[]` for an org-scoped maintainer, and
- `ProfileSchema.CheckAuthAsync` (the xAPI authorization gate) evaluates `xapi:my_organization:edit` against the same org-membership-blind permission source and returns `Forbidden`.

Both consume a permission-resolution path that derives only global-role permissions, missing the new `OrganizationMembershipRole` permissions introduced by PR#300. The fix is to make xProfile permission resolution (pageContext projection + `CheckAuthAsync`) include the active org's membership-role permissions — i.e. resolve from the same org-scoped source the claim provider already uses. (Alternative the team may choose: have the storefront trust the JWT `permission[]` claim directly rather than the pageContext projection — a vc-frontend change — but the authoritative fix is the xAPI projection.)

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 3 — xAPI
- **Suggested repo:** VirtoCommerce/vc-module-profile-experience-api (xProfile)
- **repoKind:** module
- **Component / module:** xProfile — `ProfileSchema.CheckAuthAsync` + the `me`/`GetPageContext` permissions resolver
- **RCA anchor:** `VirtoCommerce.ProfileExperienceApiModule.Data.Schemas.ProfileSchema.CheckAuthAsync` (App Insights stack) + the `me` query `permissions`/`roles` field resolver; error string `"User doesn't have the required permission 'xapi:my_organization:edit'."`
- **Routing confidence:** HIGH for the xAPI owning layer (App Insights pins the exception to `ProfileSchema.CheckAuthAsync`; FE confirms `GetPageContext.permissions=[]`). NOTE: a complete fix may also touch vc-frontend if the team decides the storefront should read perms from the JWT claim instead of the pageContext projection — so the *fix* could span 2 repos even though the *root cause* is the xAPI projection. Flagging so `/qa-fix` Gate 0/1 can weigh the cross-repo aspect.

## Impact
Breaks AC2 and the ticket's primary user story (US1/US2 — "as an Org Maintainer/Admin I want to govern my org"). Org maintainers cannot invite, change roles, or block members via storefront or API. Fails safe (over-restrictive, no data loss / no escalation), hence High/P1 rather than P0. AC1 (per-org JWT roles) and AC3 (org-scoped lockout, incl. global-lockout-not-set guard) are unaffected and pass.

## Notes
- A second, separate defect was found in the same feature (membership-create input validation: missing `userId` → HTTP 500 leaking DB name `vcst-qa-platform_restored`; empty `userId` → orphan membership persisted). That is a distinct bug in **vc-module-customer** `OrganizationMembershipController` and should be filed separately (draft available; not yet written to a report).
