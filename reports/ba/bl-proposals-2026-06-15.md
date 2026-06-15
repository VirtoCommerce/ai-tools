# Business Logic Proposals — BA-2026-06-15

> ✅ **PROMOTED 2026-06-15** — all 5 new invariants and both stale revisions below were approved by the user ("I accept BL") and applied to `.claude/agents/knowledge/business-logic.md`: BL-AUTH-012, BL-AUTH-013, BL-B2B-007, BL-B2B-008, BL-B2B-009 (new); BL-AUTH-003 (narrowed) + BL-B2B-005 (data-path revised). The Invariant Coverage Summary table was intentionally left unchanged. This file is now historical.

> **(original draft notice)** These are drafts. They are NOT applied to `.claude/agents/knowledge/business-logic.md`.
> Promotion requires **explicit user approval per proposal**. Review, edit as needed,
> approve individual entries, assign final `BL-*` IDs, then direct Claude to promote
> only the approved entries. Claude will never modify `business-logic.md` on its own.
>
> Source: `/ba-analyze VCST-5028` run `2026-06-15` — see `reports/ba/ba-report-VCST-5028-2026-06-15.md`.
> Existing IDs to avoid colliding with: BL-AUTH-001..011, BL-B2B-001..006.

---

## New Invariants Proposed

### PROPOSED-BL-AUTH-012: Org-scoped lockout does not touch the global account `[P0-revenue]`

- **Rule:** Setting `OrganizationMembership.IsLocked = true` for (userId, orgX) MUST NOT set `ApplicationUser.LockoutEnd`. `GET /api/platform/security/users/{userId}/locked` MUST stay `{"locked": false}`, and the user MUST still authenticate into any other org whose membership is unlocked.
- **Verify:**
  - Lock membership in org X via `POST /api/customer/organization-memberships/{id}/lock`.
  - `GET /api/platform/security/users/{userId}/locked` → `locked: false`.
  - `/connect/token` with `organization_id=X` → HTTP 400, `code: user_is_locked_in_organization`.
  - `/connect/token` with `organization_id=Y` (same user, unlocked) → HTTP 200.
- **Violation signal:** Global `locked: true` after an org-scoped lock, OR login to a non-locked org fails with the same credentials.
- **Agents:** qa-backend-expert
- **Source:** `LockOrganizationContactCommandHandler.cs` PR#135 (calls `IOrganizationMembershipService.LockAsync(membership.Id)`, NOT `IAccountService.LockAccountByIdAsync`); `OrganizationMembership.cs` PR#300 `IsLocked`/`LockoutEnd`; live evidence `tests/Sprint26-11/VCST-5028/test-execution-report-backend.md` AC3-B-02 PASS.
- **Triggered by:** This is the exact regression the feature exists to prevent (the old handler globally locked the shared user).

### PROPOSED-BL-AUTH-013: Org-scoped lockout error is distinct from global lockout `[P1-data]`

- **Rule:** When membership in org X is locked, `/connect/token` with `organization_id=X` MUST return HTTP 400, `error: invalid_grant`, `code: user_is_locked_in_organization` — never the global codes (`user_is_locked_out` / `user_is_temporary_locked_out`). The storefront sign-in form AND the org switcher MUST surface org-specific copy ("…access to this organization has been blocked…"), not the generic global-lockout message.
- **Verify:**
  - Lock membership for org X; `/connect/token` org X → assert `code == "user_is_locked_in_organization"`.
  - Storefront `/sign-in` (or org-switch) into locked org → assert org-specific copy is shown (distinct from suite-031 global-lockout copy).
- **Violation signal:** Token endpoint returns a global lockout code for an org-scoped lock; storefront shows the generic lockout message.
- **Agents:** qa-frontend-expert, qa-backend-expert
- **Source:** `identity-errors.enum.ts` + `isLockoutError()` PR#2315; live copy "Your access to this organization has been blocked. Please contact your organization administrator." — `test-execution-report-frontend.md` AC3-F-02 PASS.
- **Triggered by:** Suite 031 covers only global-lockout copy; org-scoped path is new.
- **Note:** Supersedes the story-writer's mis-numbered `PROPOSED-BL-AUTH-007` (which collided with the existing logout-UX BL-AUTH-007) — same concept, correct number here.

### PROPOSED-BL-B2B-007: Per-org JWT permission set is strictly org-scoped, and pageContext must match it `[P0-revenue]`

- **Rule:** A JWT issued for org X MUST carry only the `permission[]` derived from `OrganizationMembership.Roles` for (userId, orgX); permissions from other orgs MUST NOT appear. `pageContext.user.permissions` (the `me`/GetPageContext projection) MUST equal the active-org JWT `permission[]`.
- **Verify:**
  - User is org-maintainer in X, org-employee in Y. Switch to X → decode JWT → maintainer set present, employee-only set absent. Switch to Y → only employee set.
  - For each org, `GetPageContext` → assert `user.permissions` matches the decoded JWT for that org.
- **Violation signal:** JWT carries another org's permissions; OR `pageContext.user.permissions` diverges from the JWT (**currently true — BUG-A**).
- **Agents:** qa-frontend-expert, qa-backend-expert
- **Source:** `test-execution-report-frontend.md` AC1 oracle (TechFlow=8 perms, BuildRight=2 perms, same `sub`); BUG-A (`GetPageContext` returns `permissions:[]` while JWT has 8).
- **Triggered by:** AC1 isolation PASS + BUG-A divergence.

### PROPOSED-BL-B2B-008: Org-scoped role change mutates only the target org's membership `[P1-data]`

- **Rule:** Changing a member's role in org X (`changeOrganizationContactRole` or REST `PUT /{id}`) MUST update only the (userId, orgX) `OrganizationMembership.Roles`. Other orgs' membership records and the global `ApplicationUser.Roles` MUST be unchanged.
- **Verify:**
  - Member is employee in X, manager in Y. Change X → manager.
  - `POST /search {userId}` → X role = manager, Y role still manager.
  - `GET /api/platform/security/users/{userId}` → global `roles[]` unchanged/empty.
- **Violation signal:** Role change in X also alters Y's membership or the global account roles.
- **Agents:** qa-backend-expert
- **Source:** `ChangeOrganizationContactRoleCommandHandler.cs` PR#135 (saves the single membership via `IOrganizationMembershipService.SaveChangesAsync([membership])`, not `userManager.UpdateAsync`); `test-execution-report-backend.md` AC2-B-01 (org-scoped update confirmed via REST; BuildRight unchanged).
- **Triggered by:** Old handler replaced global roles — this guards the regression.

### PROPOSED-BL-B2B-009: Inviting a member creates a per-org membership, not a global role `[P1-data]`

- **Rule:** Inviting a user into org X with a role MUST create an `OrganizationMembership` for (newUserId, orgX) with that role; the global `ApplicationUser.Roles` MUST NOT be modified. After acceptance, `GET /api/customer/organization-memberships/user/{userId}/count` ≥ 1.
- **Verify:**
  - Invite a new user into X as employee; after acceptance, `POST /search {userId}` → contains org X with role employee.
  - `GET /api/platform/security/users/{userId}` → global `roles[]` empty / no org-specific role.
- **Violation signal:** No membership record after invite acceptance; or the invite writes a global role.
- **Agents:** qa-backend-expert, qa-frontend-expert
- **Source:** `InviteUserCommandHandler.cs` PR#135 (new `AssignUserRoles(user, roleIds, organizationId)` creates a membership when `organizationId != null`; old path called `userManager.AddToRolesAsync`).
- **Triggered by:** Invite-flow analysis; gap in `testing-checklist.md`.

---

## Stale BL-* Flagged

### BL-AUTH-003: Account lockout after N failed attempts
- **Current Rule:** After N failed login attempts the account is locked globally; `ApplicationUser.LockoutEnd` is set; login rejected platform-wide.
- **Observed behavior:** VCST-5028 adds a parallel **org-scoped** lockout (`OrganizationMembership.IsLocked`) that deliberately does NOT set `LockoutEnd`; login to the locked org returns `user_is_locked_in_organization` while other orgs still work. The authentication-failure global lockout still exists.
- **Source:** `LockOrganizationContactCommandHandler.cs` PR#135; `test-execution-report-backend.md` AC3-B-02.
- **Suggested action:** **narrow scope** — qualify BL-AUTH-003 as authentication-failure lockout only; cross-reference PROPOSED-BL-AUTH-012 for administrative org-scoped lockout.

### BL-B2B-005: Member role determines feature visibility
- **Current Rule:** Member's org role determines which storefront features are visible; maintainer sees management actions, employee read-only.
- **Observed behavior:** Visibility is now driven by `pageContext.user.permissions`, which must be projected from `OrganizationMembership.Roles` after org-switch (no longer `ApplicationUser.Roles`). BUG-A shows the intent holds but the projection is broken (JWT correct, pageContext empty).
- **Source:** `members.vue` PR#2315 gates on `checkPermissions` reading `pageContext.user.permissions`; `test-execution-report-frontend.md` BUG-A.
- **Suggested action:** **revise** — specify the data path: permission-gated features read `pageContext.user.permissions`, which MUST be populated from the active `OrganizationMembership.Roles`; the global role set is no longer the source of truth for org-scoped visibility.

---

## Application Notes

1. Assign final IDs by reading `.claude/agents/knowledge/business-logic.md` for the next available `BL-AUTH-NNN` (currently 011) and `BL-B2B-NNN` (currently 006).
2. Replace the `PROPOSED-` prefix with the final ID.
3. Paste the edited entry into the correct domain section of `business-logic.md` (body only — do NOT touch the Invariant Coverage Summary table; per `feedback_bl_promotion_table_separately`).
4. After an entry lands, re-run related `/qa-review-tests suite <ID> --verify` so test cases gain their `Business_Rule` mapping.
