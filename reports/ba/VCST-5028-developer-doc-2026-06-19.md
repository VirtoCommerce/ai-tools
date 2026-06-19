# Per-Organization Roles & Access Control — Developer Guide & Change Summary (VCST-5028)

**Status:** 3 open PRs (base `dev`), read from source 2026-06-19.

| Repo | PR | Head | Prerelease artifact |
|------|----|------|---------------------|
| vc-module-customer | [#300](https://github.com/VirtoCommerce/vc-module-customer/pull/300) | `b4467c9` | `VirtoCommerce.Customer_3.1010.0-pr-300-b446` |
| vc-module-profile-experience-api | [#135](https://github.com/VirtoCommerce/vc-module-profile-experience-api/pull/135) | `402ef8e` | `…ProfileExperienceApiModule_3.1008.0-pr-135-402e` |
| vc-frontend | [#2315](https://github.com/VirtoCommerce/vc-frontend/pull/2315) | `059c36f` | `vc-theme-b2b-vue-2.52.0-pr-2315-059c` |

> ⚠️ The QA defect **BUG-A** was observed on the older `pr-135-**cb12**` build. The current branch (`402e`, pushed 2026-06-18) contains targeted fixes for all three BUG-A symptoms (see §9). Re-verify on `402e`+.

---

## 1. What changed (old → new)

| Aspect | Before (global) | After (VCST-5028) |
|--------|-----------------|-------------------|
| Role storage | `ApplicationUser.Roles` (one set, all orgs) | `OrganizationMembership.Roles` — one row per (UserId × OrganizationId) |
| Lockout | `IAccountService.LockAccountByIdAsync` → global `ApplicationUser.LockoutEnd` | per-membership `OrganizationMembership.IsLocked` (+ optional timed `LockoutEnd`); global account untouched |
| Token (JWT) | global role permissions only | `organization_id` claim **+ org-scoped permission claims** merged at mint (`OrganizationIdClaimProvider`) |
| `me.permissions` | from DB `Roles` | from **JWT permission claims** (`UserType.permissions`), falls back to DB for internal calls |
| Storefront permission set | `storefront:*` enum | **removed** → `xapi:my_organization:{edit,user:invite,order:view}` |
| Role-change mutation input | `userId` | `memberId` (org from JWT session) |
| Role-change semantics | `userManager.UpdateAsync` (global) | updates the single `OrganizationMembership` row |
| Membership change | — | raises `OrganizationMembershipChangedEvent` → reindex + **token revocation** when locked |

---

## 2. What was delivered (by PR)

- **vc-module-customer #300 (30+ files):** `OrganizationMembership` domain + EF entities (`OrganizationMembershipEntity`, `…RoleEntity`), `IOrganizationMembershipService`, **`OrganizationMembershipController`** REST, SqlServer/PostgreSql/MySql migrations (`AddOrganizationMembership`), cache region, OpenIddict `OrganizationIdClaimProvider` + `OrganizationIdRequestValidator` + `ErrorDescriber`, and 3 event handlers (delete-cascade, reindex, **token-revoke**).
- **vc-module-profile-experience-api #135 (27 files):** xAPI `ContactType` fields + 3 mutations + `GetUserQueryHandler`/`UserType` projection changes + `ProfileSchema`/`ProfileAuthorizationHandler` auth changes + 2 new permissions; **5 new xUnit test classes** (ChangeRole/Lock/Unlock/Register/SearchMembers handlers).
- **vc-frontend #2315 (30+ files):** rewritten permission enums, `/company/members` per-org actions, `useOrganizationSwitcher`, org-scoped lockout error, GraphQL query/types, 9 locale files.

---

## 3. Data model — `OrganizationMembership` (Customer.Core)

```csharp
class OrganizationMembership : AuditableEntity, ICloneable {
  string UserId;                 // security-account id (platform user), NOT contact/member id
  string OrganizationId, OrganizationName;
  bool   IsLocked;  DateTime? LockoutEnd;
  bool   IsCurrentlyLocked => IsLocked && (!LockoutEnd.HasValue || LockoutEnd > UtcNow);  // timed lock
  IList<OrganizationMembershipRole> Roles;   // { RoleId, RoleName }
}
```
One row per `(UserId, OrganizationId)`. EF entity + migration `AddOrganizationMembership` (all 3 providers). `IOrganizationMembershipService` : `ICrudService` + `ISearchService` + `GetByUserAndOrgAsync`, `GetLockedOrganizationIdsAsync`, `CountByUserIdAsync`, `LockAsync(id, lockoutEnd?)`, `UnlockAsync(id)`.

---

## 4. REST surface — `OrganizationMembershipController`

Route `api/customer/organization-memberships`, class-level `[Authorize]`. Permissions: `customer:organization-membership:{read,create,update,delete}`.

| Method | Path | Permission | Body / params | Notes |
|--------|------|-----------|---------------|-------|
| GET | `/user/{userId}/count` | read | — | `{ count }` for widget counter |
| POST | `/search` | read | `OrganizationMembershipSearchCriteria` (`userId`, paging) | → `SearchResult` |
| GET | `/user/{userId}/org/{organizationId}` | read | — | membership or 404 |
| GET | `/{id}` | read | — | membership or 404 |
| POST | `/` | create | full `OrganizationMembership` | forces `Id=null`, saves, **re-fetches** |
| PUT | `/{id}` | update | full `OrganizationMembership` | **returns the input echo, not re-fetched** |
| POST | `/{id}/lock` | update | `LockMembershipRequest{ lockoutEnd? }` | timed lock supported here (xAPI lock has no timing) |
| POST | `/{id}/unlock` | update | — | — |
| DELETE | `/` | delete | `?ids=…&ids=…` | 204 |

> **No input validation on `POST /`** (`membership.Id=null; SaveChangesAsync`). Missing `userId` → 500 (+ DB-name leak); empty `userId` → 200 orphan. **BUG-B is real and present on this branch** — both should be 400. `Search` filters by `userId` only (no `organizationId` filter).

---

## 5. xAPI (GraphQL) surface — `ContactType` + mutations

**Read fields (Profile `ContactType`)** — resolve via `GetByUserAndOrgAsync(SecurityAccounts[0].Id, organizationId)`; null arg → `false`/`null`:
- `isLockedInOrganization(organizationId: String): Boolean`
- `rolesInOrganization(organizationId: String): [RoleType]`
- There is **no** `ContactType.organizationMemberships` field.

**Mutations** (`ProfileSchema`) — `OrganizationId` is injected server-side from the JWT (`context.GetCurrentOrganizationId()`), never a client arg:
| Mutation | Input | Permission | Returns |
|----------|-------|-----------|---------|
| `changeOrganizationContactRole` | `InputChangeOrganizationContactRoleType{ memberId: String!, roleIds: [String!] }` | `xapi:my_organization:edit` | `CustomIdentityResultType` |
| `lockOrganizationContact` | `…{ memberId: String! }` | `xapi:my_organization:edit` | `ContactType` |
| `unlockOrganizationContact` | `…{ memberId: String! }` | `xapi:my_organization:edit` | `ContactType` |
| `inviteUser` | `InviteUserCommand` | **`xapi:my_organization:user:invite`** (was unauthenticated‑any) | `…` |

`SearchOrganizationsQuery` now sets `UserId` from the principal so the org switcher hides orgs the user is locked out of.

---

## 6. Auth & permission model

**Permissions** (`ProfileExperienceApiModule` `ModuleConstants`): `xapi:my_organization:edit`, `xapi:my_organization:user:invite`, `xapi:my_organization:order:view`.

**Per-org token minting** (`OrganizationIdClaimProvider.SetClaimsAsync`): sets the `organization_id` claim, then `AddOrgScopedPermissionsAsync` loads the `(user, org)` membership and — **only if it is not currently locked and has roles** — resolves each role's permission claims via `RoleManager` and adds them to the access token (de-duped against global-role permissions). So the JWT = global-role permissions **+** the active org's membership-role permissions.

**`me` projection (the BUG-A fix area, #135):**
- `UserType.permissions` resolves from the **JWT permission claims** (`PermissionClaimType`), falling back to DB roles only for internal/no-auth calls.
- `GetUserQueryHandler.ApplyOrganizationRolesAsync` reads `organization_id` from the HTTP-context principal, looks up the membership, and **merges its roles into `user.Roles`**.
- `ProfileSchema.CheckAuthAsync` now authorizes against the **JWT/HTTP-context principal** (not the DB-reconstructed one) — org-scoped permissions live in the token, not in DB roles.

---

## 7. Lockout & token lifecycle

**At the token endpoint** (`OrganizationIdRequestValidator`, priority 50) — precedence:
1. **Global lockout** (`ApplicationUser.LockoutEnd > now`) → `ErrorDescriber.UserIsLockedOut()` (code `user_is_locked_out`) — highest priority.
2. Requested org not in the user's available orgs → on **password** grant, silently fall back to the default/first org; otherwise `invalid_organization_id`.
3. Membership `IsCurrentlyLocked` → `ErrorDescriber.UserIsLockedInOrganization(orgId)` → HTTP 400 `invalid_grant`, code **`user_is_locked_in_organization`**, message *"Your access to organization '…' has been blocked. Please contact your organization administrator."*

**On membership change** (`OrganizationMembershipChangedEvent`): `RevokeTokenOrganizationMembershipChangedEventHandler` calls `TerminateAllUserSessions(userId)` when an added/modified membership is `IsCurrentlyLocked`. **Locking revokes the user's live sessions immediately** (not "valid until expiry"); the user can still re-authenticate into any non-locked org. The global `ApplicationUser` account is never locked by an org lock (BL-AUTH-012).

---

## 8. Breaking changes for integrators

1. **GraphQL input `userId` → `memberId`** on `changeOrganizationContactRole` (now `String!`). No deprecation alias — clients sending `userId` break.
2. **`changeOrganizationContactRole` semantics** changed from global-role update to org-membership update.
3. **Storefront permission strings removed.** The `storefront:organization:*` / `storefront:user:*` / `storefront:order:*` enum is gone; gate on `xapi:my_organization:{edit,user:invite,order:view}` instead. Front-end `ORGANIZATION_EMPLOYEE`/`PURCHASING_AGENT`/`STORE_*` now carry **no** static permissions (permissions come from the token).
4. **No `ContactType.organizationMemberships` field** — use the two argument-scoped fields.
5. **`OrganizationMembership.UserId` is the security-account id**, not the contact/member id (the xAPI mutations take `memberId` and resolve the user internally).
6. **Migration note:** legacy users with global roles but no `OrganizationMembership` row get no org-scoped permissions after switch — they must be back-filled with memberships.

---

## 9. Frontend integration points (#2315)

- `core/enums/permissions.enum.ts`: `StorefrontPermissions` → split into `PlatformPermissions{ CanImpersonate }` + `XApiPermissions{ CanEditOrganization, CanInviteUsers, CanViewOrganizationOrders }`.
- `core/constants/security.ts`: `ORGANIZATION_MAINTAINER` = `[CanInviteUsers, CanEditOrganization, CanViewOrganizationOrders]`; `ORGANIZATION_EMPLOYEE` = `[]`.
- `pages/company/members.vue`: Invite gated on `xApi.CanInviteUsers`; role-change sends `memberId: contact.id` (was `userId`); status shows `isLockedInOrganization ? Locked : status`; lock/unlock wrapped in try/catch with toast.
- `shared/account/composables/useUser.ts`: `switchOrganization` now returns `boolean`; removed role-name-based `isOrganizationMaintainer` (now permission-based).
- `shared/account/composables/useOrganizationSwitcher.ts` (new): `trySwitch` surfaces a `switchError` via `isLockoutError`.
- `core/enums/identity-errors.enum.ts` + `core/utilities/identity-errors`: `USER_IS_LOCKED_IN_ORGANIZATION` + `isLockoutError()` (covers global + org).
- `getOrganizationContactsQuery.graphql`: selects `isLockedInOrganization`/`rolesInOrganization`.

---

## 10. Enforced invariants & current status

**Invariants** (`.claude/agents/knowledge/business-logic.md`): BL-AUTH-012 (org lock ≠ global lock), BL-AUTH-013 (`user_is_locked_in_organization` distinct error), BL-B2B-007 (per-org JWT = pageContext), BL-B2B-008 (role change isolated to one org), BL-B2B-009 (invite/register create a membership, not a global role).

**Verified working (live, `pr-300-b446` / `cb12`):** REST CRUD + lock/unlock (CUST-088 PASS), Admin SPA "Organization memberships" widget, per-org JWT isolation, org-scoped lockout error + global-account guard.

**Open / needs action:**
- **BUG-A (was High on `cb12`): code-fixed on the current branch.** §6 shows the three targeted fixes (`UserType.permissions` from JWT, `GetUserQueryHandler` role merge, `CheckAuthAsync` JWT principal) + the claim-mint path. **Re-verify on `pr-135-402e`+** — the prior failure should no longer reproduce.
- **BUG-B (Med–High): still present** — `OrganizationMembershipController.Create` has no `userId`/`organizationId` validation (500 + DB-name leak / orphan). Add a guard returning 400.
- **API gaps:** `PUT /{id}` returns the request echo, not a re-fetch; `Search` lacks an `organizationId` filter; xAPI lock has no timed-lock parity with REST.

- Full BA analysis: `reports/ba/ba-report-VCST-5028-2026-06-15.md`

*Sources: live PR code read 2026-06-19 — vc-module-customer#300 (`OrganizationMembershipController.cs`, `OrganizationMembership.cs`, `ModuleConstants.cs`, `OrganizationIdClaimProvider.cs`, `OrganizationIdRequestValidator.cs`, `ErrorDescriber.cs`, `RevokeToken…Handler.cs`) · profile-experience-api#135 (`ContactType.cs`, `UserType.cs`, `GetUserQueryHandler.cs`, `ProfileSchema.cs`, `InputChangeOrganizationContactRoleType.cs`, `ModuleConstants.cs`) · vc-frontend#2315 (`permissions.enum.ts`, `security.ts`, `members.vue`, `useUser.ts`, `useOrganizationSwitcher.ts`, `identity-errors`).*
