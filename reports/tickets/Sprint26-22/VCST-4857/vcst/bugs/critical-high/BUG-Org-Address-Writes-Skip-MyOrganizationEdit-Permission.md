# BUG: Organization address writes skip the `xapi:my_organization:edit` permission

## Status: READY_TO_SUBMIT
**Tracker:** VCST-6689
**Found by:** agent — testing VCST-4857

**Severity:** High · **Priority:** High · **Type:** Security / authorization gap (server-side) · **Non-visual:** API-only defect, no screenshot applies.

## Env
- **Stand:** vcst (`vcst-qa`), store B2B-store, xAPI `/graphql`
- **Versions:** Platform 3.1094.0 · VirtoCommerce.ProfileExperienceApiModule 3.1023.0 · VirtoCommerce.Xapi 3.1029.0 · VirtoCommerce.Customer 3.1032.0. The package versions match the deployed `vc-deploy-dev@vcst-qa` manifest.
- **Repro rate:** 1/1 per call in the investigation, and seen on 2 more organizations in the same run (VCST-4857 S-8, S-3). Deterministic: the code path has no check.
- **Not available from this env:** no trace ID (the stand sends no `Request-Id`/`traceparent`), no App Insights (the `vcst-qa` resource is not reachable; the fallback is the source read), no HAR (API-only, no browser lane).

## Summary
An organization member whose permissions lack `xapi:my_organization:edit` can **add and delete the organization's addresses** through `updateMemberAddresses` / `deleteMemberAddresses` (HTTP 200, no `errors[]`, the book changes). The same token is refused on `updateOrganization` with "User doesn't have the required permission 'xapi:my_organization:edit'". The storefront hides **Add new** for this user, so the UI is the only gate. A direct API call, or the quote edit page's empty-book **Add address** branch (VCST-4857 SC-3.3), writes the organization book.

## Steps to reproduce
1. As admin, create an organization and two members in it: role **Organization employee** and role **Organization maintainer**.
2. Sign each in (password grant with `storeId=B2B-store`). The employee's `me.permissions` are `storefront:organization:view`, `storefront:user:view` only.
3. As the employee: `currentOrganizationAddresses(first:50){ totalCount }` returns **0**.
4. As the employee: `updateMemberAddresses(command:{ memberId: <me.contact.organizationId>, addresses:[<one new address>] })` returns **HTTP 200, no errors, totalCount 1**.
5. As the employee: `deleteMemberAddresses(command:{ memberId: <org id>, addresses:[<that address>] })` returns **HTTP 200, no errors**, and the book is back to 0.
6. Contrast, same employee and organization: `updateOrganization(command:{ id:<org id>, name:… })` is refused, `Forbidden`, "User doesn't have the required permission 'xapi:my_organization:edit'."

## Actual
- `updateMemberAddresses` on the own organization by an employee: **200, `errors: null`**, org book 0 → 1 (`investigations/C-11/network/failing-updateMemberAddresses.json`)
- `deleteMemberAddresses` by the same employee: **200, `errors: null`**, org book 1 → 0 (`network/failing-deleteMemberAddresses.json`)
- Controls: a foreign organization gets `Access denied.` `Forbidden` (the membership guard works). Anonymous is refused. An invalid payload on the own organization gets `VALIDATION`, so authorization passed.

## Expected
- An organization address write by a member without `xapi:my_organization:edit` is **refused** (`Forbidden`), the same as `updateOrganization`, which accepts `addresses` and is gated on that permission.
- A member's **own personal** address writes stay allowed.
- **Oracle caveat:** VirtoOZ (Company Info, xProfile mutation pages) names no permission for address writes and never defines what `xapi:my_organization:edit` governs. The expectation rests on the inconsistency inside the module and on the storefront's own gate. **PO to confirm** that members without the permission must not change company addresses.

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | N/A — not probed by the investigation | (the storefront header hides Add new for this user; VCST-4857 S-3) |
| 2. Backend Admin | N/A — not probed by the investigation | admin `GET /api/members/<org>` used only as a read-back |
| 3. GraphQL xAPI | **FAIL** | `investigations/C-11/network/failing-updateMemberAddresses.json`, `failing-deleteMemberAddresses.json` |
| 4. Platform REST API | N/A — no REST endpoint backs these mutations | — |

**Owning layer:** Layer 3 — xAPI (profile xAPI resolver + authorization)

## Root Cause Analysis
- `ProfileSchema.cs:298` (`updateMemberAddresses`) and `:310` (`deleteMemberAddresses`) call `CheckAuthAsync(context, command)` **with no permission**. The sibling organization writes pass `ProfilePermissions.MyOrganizationEdit` (`:322` updateOrganization, `:346`, `:492`, `:505`).
- With no permission argument, the permission test at `:861` is skipped. The only check left is organization membership (`ProfileAuthorizationHandler.cs:115-118`, the `MemberCommand` case).
- Ruled out: data drift (fresh org and users), a stale permission cache (the same token is refused on `updateOrganization`), a setting gate (none on the path), version skew (source read at tag 3.1023.0). Detail: `investigations/C-11/root-cause.md` §3–§5, `source/source-lines.md`.

## Regression
Not a regression: both mutations were ungated at every ref read (2022-06, 2022-10, 2026-06, 3.1023.0). It surfaced while testing VCST-4857 (PR vc-frontend#2424 moved the storefront's add-address gate to the user type).

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 3 — xAPI
- **Suggested repo:** VirtoCommerce/vc-module-profile-experience-api
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** xProfile — `updateMemberAddresses` / `deleteMemberAddresses` authorization
- **RCA anchor:** `src/VirtoCommerce.ProfileExperienceApiModule.Data/Schemas/ProfileSchema.cs:298`, `:310`. Gate only when `command.MemberId` is an organization (`PermissionRequired`, `:900-908`, shows the target-based pattern). Alternative site: `Authorization/ProfileAuthorizationHandler.cs:115-118`.
- **Routing confidence:** HIGH for the location. The expected behaviour needs a PO decision first (no documented rule).

Evidence package: `reports/tickets/Sprint26-22/VCST-4857/vcst/investigations/C-11/` · kb: KB-89E44C00
