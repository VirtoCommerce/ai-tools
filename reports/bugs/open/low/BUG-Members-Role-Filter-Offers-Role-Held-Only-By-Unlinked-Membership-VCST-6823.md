# BUG: Company members Role filter offers a role that matches no member (role held only by an unlinked membership)

## Status: READY_TO_SUBMIT
**Found by:** agent — regression REG-2026-11-12-0914-W5c

**Severity:** Low (P4) · **Tracker:** VCST-6823 · **Related:** VCST-6644 (Sprint 26-22 regression), VCST-5450 (dynamic role facet), VCST-1168 (old static-list request, Cancelled)
**Supersedes:** `reports/bugs/open/medium/BUG-members-role-facet-static-list.md` (blamed a static vc-frontend list, which no longer exists)

## Environment
- Stand `vcst` (store `B2B-store`), Platform 3.1097.0, VirtoCommerce.ProfileExperienceApiModule 3.1024.0,
  VirtoCommerce.Customer 3.1033.0, VirtoCommerce.Xapi 3.1031.0, theme 2.62.0-alpha.2647 — matches
  `vc-deploy-dev@vcst-qa` `backend/packages.json`.
- Deterministic (server-side data path). Trace `47a4b2efa96d45efbf9d82bf1f218f49`.
- App Insights trace: N/A for this env (no API key / Azure MCP in the session) — every call 200, no `errors[]`.

## Summary
`organization.contactRoles` (the source of the Role filter on `/company/members`) aggregates the roles of **every**
OrganizationMembership row of the org, while `organization.contacts` (the list the filter narrows) returns only
contacts **linked** to the org. A role held only through a membership whose contact is not linked to the org becomes a
filter option that can never match: applying it alone always shows "There are no results found".

## Steps to reproduce
1. Sign in to the storefront as a TechFlow organization maintainer and open **/company/members** (43 members).
2. Click **Filters**: the Role list shows **Store manager** · Organization employee · Purchasing agent ·
   Organization maintainer · Sales Representative.
3. Tick only **Store manager**, click **Apply**.

From a clean org (developer):
1. `POST /api/members` a Contact with **no** `organizations`.
2. `POST /api/platform/security/users/create` with `memberId` = that contact.
3. `POST /api/customer/organization-memberships` `{userId, organizationId:<org>, roles:[{roleId:<role nobody in the
   org holds>, roleName:<its name>}]}`.
4. As the org's maintainer: `organization(id){contactRoles{id}}` lists the role; `organization(id){contacts(roleIds:
   [<role>]){totalCount}}` = **0**; on `/company/members` the filter offers it and Apply shows no results.

## Actual
- `GetOrganizationContactRoles` → `contactRoles` starts with `store-manager`.
- `GetOrganizationContacts {roleIds:["store-manager"], first:16}` → `totalCount: 0`.
- On TechFlow 9 of 29 membership rows belong to users whose contact has `organizations: []`; the only holder of
  `store-manager` is one of them (a leftover test contact).

![Role filter offers Store manager](../../screenshots/Members-Role-Filter-Offers-Role-Held-Only-By-Unlinked-Membership/02-role-facet-offers-store-manager.png)
![Empty result](../../screenshots/Members-Role-Filter-Offers-Role-Held-Only-By-Unlinked-Membership/03-store-manager-filter-empty-state.png)

## Expected
- The Role filter lists only roles held by members the list can show — VCST-5450 / vc-frontend PR #2426: the facet
  shows "roles actually assigned within the organization".
- Every offered role returns at least one member.

## Layer Validation
| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront Frontend | PASS (renders xAPI list as-is) | `screenshots/02-…`, `03-…`; `spec/useOrganizationContactsFilterFacets.master.ts` |
| 2. Backend Admin | N/A — not probed by the investigation | — |
| 3. GraphQL xAPI | **FAIL** | `network/GetOrganizationContactRoles.response.json`, `network/GetOrganizationContacts-roleIds-store-manager.response.json` |
| 4. Platform REST API | PASS (data as stored) | `network/admin-membership-roles-by-visibility.json` |

**Owning layer:** Layer 3 — xAPI.

## Root Cause Analysis
- `GetOrganizationContactRolesQueryHandler.Handle` (PEA 3.1024.0, lines 43–46) reads memberships with
  `OrganizationMembershipSearchCriteria { OrganizationId }` (no contact-link filter) and contacts with
  `MembersSearchCriteria { MemberId = orgId }` — two different populations.
- No storefront or Admin flow on this build creates the trigger: storefront Delete / Block / declined and revoked
  invites keep the contact linked, Admin removal of the org deletes the membership
  (`flows-membership-lifecycle.md`). Only a direct membership POST for an unlinked contact does
  (`OrganizationMembershipService.BeforeSaveChanges` checks duplicates only).
- Introduced with the dynamic facet: PEA PR #143 (VCST-5450), vc-frontend PR #2426.
- Package: `reports/regression/REG-2026-11-12-0914-W5c/evidence/B2C-MBR-025/` (`root-cause.md`, `flows-membership-lifecycle.md`).

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 3 — xAPI
- **Suggested repo:** VirtoCommerce/vc-module-profile-experience-api
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** Profile xAPI — `organization.contactRoles`
- **RCA anchor:** `src/VirtoCommerce.ProfileExperienceApiModule.Data/Queries/GetOrganizationContactRolesQuery/GetOrganizationContactRolesQueryHandler.cs:43-46` — aggregate membership roles only over memberships whose user's `MemberId` is among the org's contacts
- **Routing confidence:** HIGH
- Optional hardening (separate decision): `vc-module-customer` `OrganizationMembershipService.BeforeSaveChanges` rejects or links a membership for an unlinked contact.
