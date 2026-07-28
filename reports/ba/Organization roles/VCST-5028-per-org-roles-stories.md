# EPIC: Per-Organization Roles & Access Control for B2B Users

**Epic ID:** EPIC-5028
**Linked JIRA:** VCST-5028
**Generated:** 2026-06-15
**Implementations:** vc-module-customer PR#300, vc-module-profile-experience-api PR#135, vc-frontend PR#2315

**Goal:** Replace the global user-lock/role model with an `OrganizationMembership` entity so that B2B platform customers (such as Notions/Luminos Labs, whose personnel routinely belong to multiple supplier organizations) can hold independent roles and independent lock states per organization — closing a privilege-escalation and governance violation where locking a global account unintentionally blocked the user from every other organization they belong to.

**Success Metric:** A member who is org-maintainer at Org A and org-employee at Org B can be blocked in Org A without any effect on their Org B session; and an org-maintainer can invite, reclassify, block, and remove members entirely through the storefront Company Members UI without requiring Admin SPA access.

## Stories in this Epic

| ID | Title | Effort | Priority |
|----|-------|--------|----------|
| EPIC-5028-01 | Org maintainer edits a member's organization role | M | High |
| EPIC-5028-02 | Org maintainer blocks/unblocks a member for one org only | M | High |
| EPIC-5028-03 | Org maintainer invites a new user with an org-scoped role | S | High |
| EPIC-5028-04 | Multi-org member signs in and receives org-scoped permissions | S | High |
| EPIC-5028-05 | User blocked in one org retains full access to other orgs | S | High |
| EPIC-5028-06 | Admin/Support inspects and corrects memberships via Admin SPA | S | Medium |
| EPIC-5028-07 | Org-scoped lockout error UX at sign-in and org-switch | S | High |
| EPIC-5028-08 | Org maintainer removes a member from the organization | XS | Medium |
| EPIC-5028-09 | Org employee sees read-only company member view | XS | Medium |
| EPIC-5028-10 | Locked-membership orgs excluded from header org switcher | S | High |

> **Gap added 2026-06-19:** EPIC-5028-10 closes a coverage gap flagged during AC review. Stories 01–09 cover the full per-org membership lifecycle, and 05/07 govern the *sign-in/selection* path when a locked org is chosen — but none required the header org switcher to *exclude* a locked org from its list in the first place. The `SearchOrganizationsQuery` UserId scoping shipped in PR #135 implements this, but had no AC, no regression home, and no specified edge-case behavior (expired timed lock, all-locked state, cross-principal isolation). EPIC-5028-10 formalizes it.

## Epic Acceptance Criteria

- [ ] The same person can hold different roles in two organizations simultaneously with no cross-org bleed
- [ ] Blocking a user in one org does not set `ApplicationUser.LockoutEnd` (global account stays unlocked)
- [ ] Org-maintainer management UI (Invite, Edit role, Block, Delete) is fully functional for maintainers and hidden for employees
- [ ] Admin SPA "Organization memberships" widget correctly reflects per-org roles and lock state across all memberships for a contact
- [ ] All xAPI mutations (`changeOrganizationContactRole`, `lockOrganizationContact`, `unlockOrganizationContact`) enforce the `xapi:my_organization:edit` permission gate
- [ ] Sign-in to a blocked org returns the org-specific error (`user_is_locked_in_organization`), not the generic global-lockout message

---

## EPIC-5028-01: Org Maintainer Edits a Member's Organization Role

**[VCST-5028 | EPIC-5028-01] Change a member's role within one organization**
**Type:** Feature
**Module:** B2B / Organization — Company Members
**Priority:** High
**Effort:** M (1–2 weeks)
**Sprint:** Sprint26-11
**Business_Rule:** BL-B2B-005, BL-AUTH-005, BL-AUTH-006, BL-B2B-001
**Edge_Case_Refs:** ECL-7.2

### Story Statement

As an Organization Maintainer at a B2B company,
I want to change another member's role within my organization directly from the storefront Company Members page,
So that I can onboard new purchasing agents, promote trusted colleagues to managers, and adjust access without raising a support ticket or requiring Admin SPA intervention.

### Background / Context

Before the `OrganizationMembership` entity was introduced, roles were stored on the global `ApplicationUser` record. Changing a member's role in one organization would unintentionally alter their access at every other organization they belong to — a governance violation for customers like Notions/Luminos Labs where the same individual may be a senior purchasing agent at one supplier and a view-only contact at another. The new `changeOrganizationContactRole` xAPI mutation scopes the role change to one membership record identified by `memberId`; no other org's role is touched. The storefront Company Members page (`/company/members`) must surface a role-edit affordance gated on the caller's `xapi:my_organization:edit` permission.

### Acceptance Criteria

**AC-1: Maintainer changes role — happy path**
Given the user is signed in as an org-maintainer in TechFlow organization (`@td(MULTI_ORG_TF_BR.email)`) and the `/company/members` page is open,
When the maintainer locates a member row for a TechFlow org-employee and opens the role-change control (dropdown or dialog),
Then the role is updated to the new value,
And a success toast is displayed,
And the role column in the members table updates to the new role without a full page reload,
And the `changeOrganizationContactRole` mutation returns `data.changeOrganizationContactRole.succeeded = true` with `errors[]` empty.

**AC-2: Role-change UI is visible only to maintainer, not to employee**
Given the user is signed in as an org-employee in BuildRight organization,
When the user views the `/company/members` page,
Then no role-edit control is visible on any member row (the edit affordance is absent or disabled),
And the "Invite members" button is not rendered,
And the members table is read-only (BL-B2B-005).

**AC-3: Role change does not affect the same user's role in another org**
Given a member belongs to both TechFlow (org-employee) and BuildRight (org-manager),
When the TechFlow org-maintainer changes that member's TechFlow role to org-manager,
Then the member's BuildRight role remains org-manager and unchanged (BL-B2B-001),
And `POST /api/customer/organization-memberships/search` for that userId returns two records with independent role values.

**AC-4: Unauthorized role-change attempt is rejected at the xAPI layer**
Given the user holds an org-employee JWT for TechFlow (no `xapi:my_organization:edit` permission),
When a `changeOrganizationContactRole` mutation is submitted for any TechFlow member,
Then `data` is null,
And `errors[]` is non-empty with a Forbidden code referencing the missing `xapi:my_organization:edit` permission,
And no role change is persisted (BL-AUTH-005, BL-AUTH-006).

**AC-5: Role-change result is cross-verified in Admin SPA**
Given the storefront maintainer has changed a member's TechFlow role to org-manager,
When a support agent opens that contact's blade in Admin SPA (Customers > Contacts) and inspects the "Organization memberships" widget,
Then the TechFlow row shows "org-manager",
And the BuildRight row (if present) shows its original unmodified role.

### Out of Scope

- Self-role-change (a maintainer demoting themselves — demotion-guard UX is a separate story)
- Bulk role assignment for multiple members in one action
- Custom role creation or modification (uses existing org-maintainer/org-employee/org-manager role set)

### Dependencies

**Depends on:** vc-module-customer PR#300, vc-module-profile-experience-api PR#135, vc-frontend PR#2315
**Blocked by:** BUG-1 — `GetPageContext.user.permissions` returns `[]` after org-switch; blocks the storefront UI gate for management affordances
**Enables:** EPIC-5028-02, EPIC-5028-03

### Definition of Done

- [ ] Feature works in Chrome, Firefox, and Edge
- [ ] Role-change control renders and functions correctly at 1920px desktop; degrades gracefully at 768px tablet
- [ ] `changeOrganizationContactRole(command: { memberId, roleIds })` mutation verified against live schema — no `organizationId` arg (org scope comes from caller JWT)
- [ ] Unit tests written and passing (≥ 80% coverage for new vc-frontend composables/components)
- [ ] GraphQL runner test case added to `regression/suites/Backend/graphql/050d-graphql-xprofile.csv`
- [ ] Admin SPA cross-verification step included in E2E test
- [ ] No new console errors or warnings
- [ ] All visible strings use i18n keys
- [ ] BA sign-off; BL-B2B-005, BL-AUTH-005, BL-AUTH-006 mapping recorded

### UI/UX Notes

**Layout:** Role-change affordance is a per-row inline control on `/company/members` — inline dropdown or kebab menu with "Edit role" option. Maintainer-only: the entire actions column is rendered via `v-if="userCanEditOrganization"` which checks `xapi:my_organization:edit` from `checkPermissions()` in `useUser.ts`.

**States to handle:**
- Default: row displays member name, role badge, email, active status
- Maintainer view: actions column visible; "Invite members" button present near H1
- Employee view: no actions column; table is display-only
- Loading: role dropdown shows spinner while mutation is in-flight; row non-editable during save
- Success: toast "Role updated"; role badge updates in-place
- Error: toast with error message if `errors[]` non-empty; role badge reverts to previous value

**Interaction details:**
- Role options: org-employee, org-manager, org-maintainer (sourced from server's allowed role list)
- User cannot change their own role (self-row actions are disabled)
- User stays on `/company/members` after a role change — no redirect

### Technical Notes

**API surface:**
- xAPI mutation: `changeOrganizationContactRole(command: InputChangeOrganizationContactRoleType)` — returns `CustomIdentityResultType { succeeded errors { code parameter description } }`. Input: `memberId: String!`, `roleIds: [String]`. No `organizationId` arg — org from JWT `organization_id` claim (confirmed via live introspection 2026-06-15).
- REST cross-check: `PUT /api/customer/organization-memberships/{id}` with updated roles array
- GraphQL query field: `ContactType.rolesInOrganization(organizationId: String): [RoleType]` — the correct field name (no top-level `organizationMemberships` field on `ContactType` per live introspection)

**VC modules affected:** vc-module-customer PR#300, vc-module-profile-experience-api PR#135, vc-frontend PR#2315

**Security note:** `xapi:my_organization:edit` permission is granted to org-maintainer via the org-claim provider; absent for org-employee. The mutation enforces this server-side. Org scope is determined by the JWT `organization_id` claim — a maintainer in Org A cannot affect Org B members.

**Known defect (do not regress):** `GetPageContext.user.permissions` currently returns `[]` after org-switch. The entity, REST, and xAPI resolver logic is correct — defect is in the `me`/pageContext projection layer.

### Test Scenarios

| Scenario | Input | Expected Output | Test Type | ECL Ref |
|----------|-------|-----------------|-----------|---------|
| Happy path role change | Maintainer org-switched to TechFlow, changes org-employee to org-manager | Success toast; role badge updates; `succeeded = true`; `errors[]` empty | E2E | null |
| Org isolation after change | Same target also belongs to BuildRight as org-employee | BuildRight role unchanged; REST search returns two independent records | E2E | null |
| Unauthorized role change | org-employee JWT sends `changeOrganizationContactRole` | `errors[]` non-empty, Forbidden; `data = null`; no change in REST search | GraphQL (runner-native) | ECL-7.2 |
| Admin SPA cross-check | After storefront role change | Admin SPA widget shows new role for TechFlow, old role for BuildRight | Integration | null |

---

## EPIC-5028-02: Org Maintainer Blocks/Unblocks a Member for One Org Only

**[VCST-5028 | EPIC-5028-02] Block or unblock a member within one organization without affecting other orgs**
**Type:** Feature
**Module:** B2B / Organization — Company Members
**Priority:** High
**Effort:** M (1–2 weeks)
**Sprint:** Sprint26-11
**Business_Rule:** BL-AUTH-003, BL-B2B-001, BL-AUTH-005, BL-B2B-005
**Edge_Case_Refs:** ECL-7.2

### Story Statement

As an Organization Maintainer,
I want to block a member's access to my organization independently of their access to any other organization they belong to,
So that I can suspend a departing contractor or resolve a governance issue in my org without inadvertently locking them out of an entirely different company's account — which was the behavior of the old global lock and was a governance violation in multi-org B2B environments.

### Background / Context

Under the legacy model, calling the global account-lock endpoint set `ApplicationUser.LockoutEnd` to the "infinite lockout" sentinel (`9999-12-31`), blocking the user from signing into any organization. For multi-org enterprise customers this was unacceptable. The new per-membership `isLocked` flag on `OrganizationMembership` resolves this: a lock action calls `POST /api/customer/organization-memberships/{id}/lock`, which flips only that membership record. `GET /api/platform/security/users/{userId}/locked` continues to return `{ "locked": false }`. The storefront Company Members page must surface "Block" and "Unblock" affordances gated on `xapi:my_organization:edit`.

### Acceptance Criteria

**AC-1: Maintainer blocks a member in one org — happy path**
Given the user is signed in as an org-maintainer at TechFlow and `/company/members` is open,
When the maintainer selects "Block" from a member's actions menu and confirms,
Then the `lockOrganizationContact` mutation is submitted,
And the member's row status indicator changes to "Blocked" or "Inactive",
And a success feedback is shown,
And `errors[]` from the mutation is empty.

**AC-2: Block does not set the global account lockout**
Given an org-maintainer has blocked a TechFlow member (as in AC-1),
When `GET /api/platform/security/users/{userId}/locked` is called,
Then the response is `{ "locked": false }` (global account NOT locked — BL-AUTH-003),
And the member can still authenticate into BuildRight organization using the same credentials.

**AC-3: Maintainer unblocks a blocked member**
Given a member is currently blocked in TechFlow,
When the maintainer selects "Unblock" from that member's actions menu and confirms,
Then the `unlockOrganizationContact` mutation is submitted,
And the member's row status indicator returns to "Active",
And `errors[]` from the mutation is empty,
And the member can subsequently authenticate into TechFlow.

**AC-4: Blocked member cannot sign in to blocked org; can sign in to other org**
Given a member is blocked in BuildRight (`isLocked: true` on the BuildRight membership),
When the member attempts to sign in targeting the BuildRight organization,
Then the sign-in form shows an org-scoped lockout error (not the generic global account-locked message),
And the error server code is `user_is_locked_in_organization`,
When the same member attempts to sign in targeting TechFlow (not locked),
Then the sign-in succeeds and a TechFlow-scoped session is established (BL-AUTH-003).

**AC-5: Unauthorized block attempt is rejected**
Given a user holds an org-employee JWT (no `xapi:my_organization:edit` permission),
When a `lockOrganizationContact` mutation is submitted,
Then `data` is null,
And `errors[]` is non-empty with a Forbidden code,
And the target member's `isLocked` state is unchanged.

### Out of Scope

- Temporary (time-limited) blocks with automatic expiry
- Bulk block across multiple members in one action
- Block triggered by failed-login count within a specific org (automated platform behavior)

### Dependencies

**Depends on:** EPIC-5028-01 (same UI surface and permission gate)
**Blocked by:** BUG-1 (same `GetPageContext.user.permissions` empty-array defect)
**Enables:** EPIC-5028-05, EPIC-5028-07

### Definition of Done

- [ ] Feature works in Chrome, Firefox, and Edge
- [ ] Confirmation prompt present before block action executes
- [ ] `lockOrganizationContact(command: { memberId })` and `unlockOrganizationContact(command: { memberId })` mutations verified — no `organizationId` arg (org from JWT)
- [ ] `GET /api/platform/security/users/{userId}/locked` response verified as `{ "locked": false }` after org-lock in automated test
- [ ] GraphQL runner test cases added to `regression/suites/Backend/graphql/050d-graphql-xprofile.csv`
- [ ] Unit tests for lock/unlock state transitions
- [ ] No new console errors or warnings
- [ ] BA sign-off; BL-AUTH-003, BL-B2B-001 mapping recorded

### UI/UX Notes

**Layout:** "Block" and "Unblock" appear in the per-row actions column on `/company/members`, alongside "Edit role" and "Delete." Same `v-if="userCanEditOrganization"` gate as role-edit.

**States:**
- Active row: "Block" action available; status shows "Active"
- Blocked row: "Unblock" available; "Block" hidden; status badge shows "Blocked" in visually distinct color
- Loading: spinner on row; non-interactive during mutation
- Confirmation dialog: "Are you sure you want to block [Name] from [OrgName]?" with "Block" and "Cancel"
- Unblock: no confirmation required (low-risk reversal)
- Blocked row remains in table — not hidden

**Copy note:** Confirmation must reference the specific org name to prevent confusion in the multi-org context.

### Technical Notes

**API surface:**
- `lockOrganizationContact(command: InputLockUnlockOrganizationContactType)` → returns `ContactType`. Input: `memberId: String!`. Org from JWT.
- `unlockOrganizationContact(command: InputLockUnlockOrganizationContactType)` → same input/return.
- `ContactType.isLockedInOrganization(organizationId: String): Boolean` — reads current lock state per org.
- REST guard: `GET /api/platform/security/users/{userId}/locked` → `{ "locked": false }` after org-lock. This is the critical regression guard.
- REST lock/unlock: `POST /api/customer/organization-memberships/{id}/lock`, `POST /api/customer/organization-memberships/{id}/unlock`.

**Security note:** `isLocked` on `OrganizationMembership` is a separate boolean from `ApplicationUser.LockoutEnd`. The org-lock does NOT go through ASP.NET Identity's `UserManager.SetLockoutEndDateAsync`.

**QA note:** `@td(MULTI_ORG_TF_BR)` fixture had BuildRight membership locked during first run (2026-06-15) and subsequently unlocked — fixture is clean. Write tests must use a separate `AGENT-TEST-` member.

### Test Scenarios

| Scenario | Input | Expected Output | Test Type | ECL Ref |
|----------|-------|-----------------|-----------|---------|
| Lock happy path (REST) | `POST /api/customer/organization-memberships/{BR-membership}/lock` | 200; BuildRight `isLocked: true`; TechFlow `isLocked: false` | API (REST) | null |
| Global account not locked after org-lock | `GET /api/platform/security/users/{userId}/locked` | `{ "locked": false }` | API (REST) | null |
| Unlock restores access | `POST /{membership}/unlock` after lock | 200; `isLocked: false`; member can re-authenticate | API (REST) | null |
| Employee cannot lock | org-employee token → `lockOrganizationContact` | `errors[]` non-empty, Forbidden; target `isLocked` unchanged | GraphQL (runner-native) | ECL-7.2 |
| Blocked org rejected at sign-in | Credentials + locked `organization_id` | 400 `invalid_grant`, `code: user_is_locked_in_organization` | E2E | null |

---

## EPIC-5028-03: Org Maintainer Invites a User with an Org-Scoped Role

**[VCST-5028 | EPIC-5028-03] Invite a new user into an organization with a specific org role**
**Type:** Feature
**Module:** B2B / Organization — Company Members / Invite
**Priority:** High
**Effort:** S (1–3 days)
**Sprint:** Sprint26-11
**Business_Rule:** BL-B2B-005, BL-AUTH-005, BL-AUTH-006
**Edge_Case_Refs:** ECL-6.3, ECL-7.2

### Story Statement

As an Organization Maintainer,
I want to invite a new user into my organization and assign them an org-specific role at invitation time,
So that when the invitee accepts and signs in, they have the correct permissions scoped to my organization only — without the invitation inadvertently granting them any global platform role or affecting their memberships at other organizations.

### Background / Context

The invitation flow calls the `inviteUser` xAPI mutation, which now creates an `OrganizationMembership` record tied to the inviting org at the moment of invite creation. The role assigned during invite is stored on that membership — it is not a global role on `ApplicationUser`. An invitee who already has an account with another org receives a new, independent membership record for the inviting org. The "Invite members" button on `/company/members` is gated on the `storefront:user:invite` permission (org-maintainer scope).

### Acceptance Criteria

**AC-1: Invite button is visible only to org-maintainer**
Given the user is signed in as an org-maintainer on `/company/members`,
When the page renders,
Then an "Invite members" button is present near the page heading.
Given the same page is viewed by an org-employee,
When the page renders,
Then the "Invite members" button is not present (BL-B2B-005).

**AC-2: Invite form collects email and role selection**
Given the maintainer clicks "Invite members",
When the invitation form or dialog opens,
Then an email address field is required,
And a role selector offers the available org roles (org-employee, org-manager),
And a "Send invitation" button is present,
And the "Send invitation" button is disabled until a valid email address is entered.

**AC-3: Invitation creates an org-scoped membership record**
Given the maintainer submits a valid invitation for a new email with role "org-employee",
When the `inviteUser` mutation completes successfully,
Then the mutation returns no `errors[]`,
And `POST /api/customer/organization-memberships/search` for the invitee's userId (once they register) shows a membership record for this org with role "org-employee",
And no global role is set on the invitee's `ApplicationUser` record.

**AC-4: Invitation for an existing multi-org user creates a new independent membership only**
Given a user already belongs to BuildRight as "org-manager",
When a TechFlow maintainer invites them to TechFlow with role "org-employee",
Then a new TechFlow membership record is created with role "org-employee",
And the BuildRight membership record is unchanged (BL-B2B-001),
And `POST /api/customer/organization-memberships/search` returns two independent records for this userId.

**AC-5: Duplicate invitation to same org is rejected gracefully**
Given a user already has a pending or active TechFlow membership,
When the maintainer submits a second invitation for the same email to TechFlow,
Then the form shows an inline validation message,
And the "Send invitation" button does not submit the duplicate.

### Out of Scope

- The invitee's registration and email-confirmation flow (covered in auth story suite 031)
- Bulk invitation via CSV upload — deferred
- Invitation expiry and resend — separate story

### Dependencies

**Depends on:** vc-module-profile-experience-api PR#135, vc-frontend PR#2315
**Blocked by:** BUG-1 (Invite button hidden for maintainers due to `GetPageContext.user.permissions` empty)
**Enables:** EPIC-5028-04

### Definition of Done

- [ ] Feature works in Chrome, Firefox, and Edge
- [ ] Email field validates format client-side before submission
- [ ] Role selector defaults to "org-employee" (lowest privilege principle)
- [ ] `inviteUser` mutation verified against live schema; correct `InputInviteUserType` field names used
- [ ] E2E test covers full invite flow through to membership record creation
- [ ] No membership record created for global `ApplicationUser` roles
- [ ] No new console errors; all strings i18n-keyed
- [ ] BA sign-off; BL-B2B-005, BL-AUTH-005 mapping recorded

### UI/UX Notes

**Layout:** Invitation dialog is a modal overlay on `/company/members`; on mobile (375px) renders full-screen.

**States:**
- Default: "Invite members" button near H1
- Dialog open: email input (required, email format validation), role dropdown (defaults to org-employee), "Send invitation" primary + "Cancel" secondary
- Validation: email field shows inline error on blur if format is invalid; button disabled while invalid
- Loading: button disabled with spinner while mutation is in-flight
- Success: dialog closes; toast "Invitation sent to [email]"; invitee row may appear with "Invited" badge
- Error: toast with server message; dialog stays open for correction

**Interaction:** Role dropdown must NOT include org-maintainer for invite (role hierarchy guard BL-AUTH-006 — maintainers cannot create new maintainers via invite).

### Technical Notes

**API surface:**
- `inviteUser(command: InputInviteUserType)` — includes `organizationId`, `email`, `roleIds` (org-scoped). Return type includes `inviteToken` and the created membership record.
- The org-scope of the invite is derived from the mutation's explicit `organizationId` input — unlike lock/role-change which use the JWT org claim.
- REST cross-check: after invite accepted, `POST /api/customer/organization-memberships/search` with the invitee's `userId` returns the new membership.

**QA note:** New GraphQL test case needed: `test-data/graphql/mutations/inviteUser.graphql` and `index.json` entry (no existing fixture as of 2026-06-15).

### Test Scenarios

| Scenario | Input | Expected Output | Test Type | ECL Ref |
|----------|-------|-----------------|-----------|---------|
| Happy path invite | Valid email, role = org-employee | Success toast; `inviteUser.errors[]` empty; membership record created | E2E | null |
| New membership isolated from existing orgs | Invitee already has BuildRight membership | BuildRight membership unchanged; new TechFlow record independent | Integration | null |
| Duplicate invite blocked | Email already a TechFlow member | Inline validation message; no duplicate membership | E2E | ECL-6.3 |
| Employee cannot invite | org-employee session — "Invite" button absent; direct mutation | Button not rendered; mutation returns Forbidden | GraphQL (runner-native) | ECL-7.2 |

---

## EPIC-5028-04: Multi-Org Member Signs In with Org-Scoped Permissions

**[VCST-5028 | EPIC-5028-04] Per-org JWT carries the correct permission set for the selected organization**
**Type:** Feature
**Module:** Auth / B2B / Organization
**Priority:** High
**Effort:** S (1–3 days)
**Sprint:** Sprint26-11
**Business_Rule:** BL-AUTH-005, BL-AUTH-006, BL-B2B-001, BL-B2B-005
**Edge_Case_Refs:** ECL-7.2

### Story Statement

As a registered B2B user who belongs to multiple organizations with different roles at each,
I want the storefront to issue me a JWT scoped to the organization I select at sign-in (or after switching),
So that the features I can see and actions I can take correctly reflect my role at that specific organization — and management affordances I hold at Org A are never visible when I am operating under Org B's context.

### Background / Context

The `OrganizationMembership` entity enables per-org bearer tokens: the `/connect/token` grant carries an `organization_id` claim and a `permission[]` array derived from that org's membership record. A user who is "org-maintainer" at TechFlow receives 8 permissions (including `xapi:my_organization:edit`); the same user switching to BuildRight as "org-employee" receives only 2 permissions. This is the behavioral contract verified live on vcst-qa 2026-06-15 with `@td(MULTI_ORG_TF_BR)`. The permissions gate all storefront affordances through `checkPermissions()` / `$can()` in `useUser.ts`.

### Acceptance Criteria

**AC-1: Sign-in with org-maintainer org yields management-permission JWT**
Given the user `@td(MULTI_ORG_TF_BR.email)` signs in and selects TechFlow organization,
When the bearer token is decoded,
Then `organization_id` in the JWT payload matches `@td(MULTI_ORG_TF_BR.org_techflow_id)`,
And the `permission[]` array includes at minimum `storefront:user:invite`, `storefront:user:edit`, `storefront:user:delete`, `storefront:user:create`, `storefront:organization:edit`, and `xapi:my_organization:edit`,
And the Company Members page at `/company/members` shows the management affordances.

**AC-2: Switching to lower-privilege org yields reduced permission JWT**
Given the user is currently signed in as TechFlow org-maintainer,
When the user switches organization to BuildRight via the account menu,
Then the storefront requests a new bearer scoped to BuildRight,
And the new JWT `organization_id` matches `@td(MULTI_ORG_TF_BR.org_buildright_id)`,
And `permission[]` contains only `storefront:organization:view` and `storefront:user:view`,
And the Company Members page shows no management affordances (BL-B2B-005).

**AC-3: No cross-org permission bleed after org-switch**
Given the user has switched from TechFlow (org-maintainer) to BuildRight (org-employee),
When the user attempts any maintainer-scoped mutation (such as `changeOrganizationContactRole`),
Then the mutation returns Forbidden / `errors[]` non-empty,
And the active JWT contains no TechFlow-scoped management permissions (BL-B2B-001 strict isolation).

**AC-4: Org context is reflected in storefront header/white-label**
Given the user switches between TechFlow and BuildRight,
When the org-switch completes,
Then the header org name and org-specific branding update to reflect the newly selected org,
And the cart, saved addresses, and feature flags reset to the new org's scope (BL-B2B-001).

### Out of Scope

- The org-selection flow during first-ever sign-in (auth story suite 031)
- Token refresh behavior mid-session (EDGE-B-02 in checklist — informational only)
- Single-org users (no org-switch needed)

### Dependencies

**Depends on:** vc-module-profile-experience-api PR#135, vc-platform `/connect/token` org-claim provider
**Blocked by:** BUG-1 — AC-1 assertion that management affordances render correctly is contingent on this fix
**Enables:** All other stories in this epic

### Definition of Done

- [ ] JWT payload assertion test exists (decodes real token from real login, not a mock)
- [ ] Permission-set difference between two orgs for the same user covered in `regression/suites/Frontend/auth/032-auth-session-rbac.csv`
- [ ] BUG-1 tracked as a blocker; story is not fully done until that fix ships
- [ ] No cross-org bleed verified via at least one negative assertion
- [ ] BA sign-off; BL-AUTH-005, BL-B2B-001 mapping recorded

### UI/UX Notes

No new UI component for this story — it is the permission-issuance behavior underlying all other stories. The visible manifestation is the presence or absence of management affordances on `/company/members`.

**Critical UX rule:** During org-switch, management UI must NOT flash visible then disappear (race condition where old permissions briefly render before the new token arrives). The app must request a new token before re-rendering protected components.

### Technical Notes

**Auth mechanism:**
- Token endpoint: `POST /connect/token` with `grant_type=password`, `organization_id=<org_id>`, `storeId=<store>`. The `organization_id` param selects which membership's role/permissions are embedded.
- On org-switch, the storefront calls `/connect/token` again with the new `organization_id` — a new server-issued token is required; this is not a local state change.
- JWT decode for test assertions: `atob(token.split('.')[1])` — permission claim path: `token.permission` (array of strings).
- `GetPageContext` query uses `me(userId)` → `user { permissions roles }` — this projection must read from the current org's membership, not from `ApplicationUser.Roles`. This is the root cause of BUG-1.

**QA reference:** `@td(MULTI_ORG_TF_BR)` verified live on vcst-qa 2026-06-15. TechFlow = 8 perms (org-maintainer), BuildRight = 2 perms (org-employee). Full JWT payloads in `tests/Sprint26-11/VCST-5028/test-execution-report-frontend.md`.

### Test Scenarios

| Scenario | Input | Expected Output | Test Type | ECL Ref |
|----------|-------|-----------------|-----------|---------|
| Maintainer org JWT content | Login `@td(MULTI_ORG_TF_BR.email)` → TechFlow | JWT `permission[]` count ≥ 6; includes `xapi:my_organization:edit`; management UI visible | E2E | null |
| Employee org JWT content | Org-switch to BuildRight | JWT `permission[]` count = 2; no `xapi:my_organization:edit`; management UI absent | E2E | ECL-7.2 |
| Cross-org bleed prevention | After switch to employee org, send `changeOrganizationContactRole` | `errors[]` non-empty, Forbidden; no change persisted | GraphQL (runner-native) | ECL-7.2 |
| Header org context updates | Switch org | Header org name, cart, addresses all reflect new org context | E2E | null |

---

## EPIC-5028-05: User Blocked in One Org Retains Full Access to Other Orgs

**[VCST-5028 | EPIC-5028-05] Org-specific block does not affect memberships at other organizations**
**Type:** Feature
**Module:** Auth / B2B / Organization
**Priority:** High
**Effort:** S (1–3 days)
**Sprint:** Sprint26-11
**Business_Rule:** BL-AUTH-003, BL-B2B-001
**Edge_Case_Refs:** ECL-7.2

### Story Statement

As a registered B2B user who is a member of multiple organizations,
I want a block applied to me by one organization's maintainer to be scoped to that organization only,
So that being suspended from Org A for an internal policy reason does not prevent me from conducting legitimate business at Org B, Org C, or any other organization I belong to — and so that my global platform account remains active.

### Background / Context

This is the central correctness guarantee of the `OrganizationMembership` feature. Previously, `ApplicationUser.LockoutEnd = 9999-12-31` was the only lock mechanism; setting it blocked every org simultaneously and was a governance violation for multi-org enterprise B2B customers. The new per-membership `isLocked` flag is completely independent of `ApplicationUser.LockoutEnd`. Verified live on vcst-qa 2026-06-15: after locking the `@td(MULTI_ORG_TF_BR)` fixture's BuildRight membership via `POST .../lock`, `GET /api/platform/security/users/{userId}/locked` returned `{ "locked": false }` and a TechFlow-scoped token was issued successfully with the same credentials.

### Acceptance Criteria

**AC-1: Blocked member is rejected at sign-in for the blocked org**
Given the user's membership in BuildRight is locked (`isLocked: true`),
When the user attempts to sign in targeting BuildRight (stored active org or explicit selection),
Then the `/connect/token` endpoint returns `400 invalid_grant`,
And the response body contains `code: "user_is_locked_in_organization"`,
And the storefront displays an org-scoped lockout error (not the generic global-account-locked message),
And the user remains on `/sign-in`.

**AC-2: Same user can sign in to a non-blocked org**
Given the BuildRight membership is locked AND the TechFlow membership is unlocked,
When the user signs in targeting TechFlow,
Then `/connect/token` returns `200 OK` with a valid bearer,
And the user reaches an authenticated TechFlow session,
And the session header shows TechFlow context (BL-AUTH-003 org-scoped, BL-B2B-001 isolation).

**AC-3: Global ApplicationUser account remains unlocked**
Given the BuildRight membership is locked,
When `GET /api/platform/security/users/{userId}/locked` is called,
Then the response is `{ "locked": false }` (HTTP 200),
And `ApplicationUser.LockoutEnd` is null or the default minimum date — not the `9999-12-31` global-lockout sentinel.

**AC-4: Blocked org membership is reflected in Admin SPA widget**
Given the BuildRight membership is locked,
When a support agent opens the user's contact blade in Admin SPA and inspects the "Organization memberships" widget,
Then the BuildRight row shows "Locked" status,
And the TechFlow row shows "Active" status.

### Out of Scope

- What happens when a user's GLOBAL account is locked (that is a separate feature)
- Automatic org-unblock after a time period

### Dependencies

**Depends on:** EPIC-5028-02 (block mechanism), EPIC-5028-07 (org-scoped lockout error UX)

### Definition of Done

- [ ] Automated test asserts `GET /api/platform/security/users/{userId}/locked` → `{ "locked": false }` after org-lock (critical regression guard)
- [ ] Both blocked-org rejection and other-org success paths covered as separate test scenarios
- [ ] `code: "user_is_locked_in_organization"` error code captured and asserted
- [ ] BA sign-off; BL-AUTH-003 mapping recorded

### UI/UX Notes

No new UI for this story — the storefront already shows the org-scoped lockout error (vc-frontend PR#2315). The test verifies that the cross-org access path succeeds silently (normal authenticated home page with the correct org header).

### Technical Notes

**Critical test data:** `@td(MULTI_ORG_TF_BR)` — single fixture user with TechFlow (org-maintainer, unlocked) and BuildRight (org-employee, unlocked by default).

**Test automation sequence:**
1. SETUP: `POST /api/customer/organization-memberships/@td(MULTI_ORG_TF_BR.buildright_membership_id)/lock`
2. Assert BuildRight sign-in returns 400 with `user_is_locked_in_organization`
3. Assert TechFlow sign-in returns 200
4. Assert `GET /api/platform/security/users/@td(MULTI_ORG_TF_BR.userId)/locked` → `{ "locked": false }`
5. CLEANUP: `POST .../unlock`

**Auth endpoint behavior:** `/connect/token` checks `OrganizationMembership.isLocked` for the requested `organization_id` before issuing a token. Server-side check — no client-side bypass.

### Test Scenarios

| Scenario | Input | Expected Output | Test Type | ECL Ref |
|----------|-------|-----------------|-----------|---------|
| Blocked org rejects sign-in | Credentials + `organization_id = BuildRight (locked)` | 400, `code: user_is_locked_in_organization` | API (REST) | ECL-7.2 |
| Other org allows sign-in | Same credentials + `organization_id = TechFlow (unlocked)` | 200 OK, valid bearer with TechFlow scope | API (REST) | null |
| Global account not locked | `GET /api/platform/security/users/{userId}/locked` after org-lock | `{ "locked": false }` | API (REST) | null |
| Admin SPA reflects org-scoped status | Admin SPA membership widget | BuildRight = Locked, TechFlow = Active | E2E | null |

---

## EPIC-5028-06: Admin/Support Inspects and Corrects Memberships via Admin SPA

**[VCST-5028 | EPIC-5028-06] Platform administrator views and manages per-org memberships from Admin SPA**
**Type:** Feature
**Module:** Platform Administration — Customer / Contacts
**Priority:** Medium
**Effort:** S (1–3 days)
**Sprint:** Sprint26-11
**Business_Rule:** BL-AUTH-005, BL-B2B-001, BL-AUTH-003
**Edge_Case_Refs:** ECL-7.2

### Story Statement

As a Platform Administrator or Support Engineer,
I want to view all of a contact's organization memberships in a single Admin SPA widget and to lock, unlock, or reclassify any membership directly from the platform backend,
So that I can resolve access issues and governance violations without requiring a storefront org-maintainer to be available — particularly when a maintainer is themselves the subject of the access problem, or when a customer's support request requires immediate remediation.

### Background / Context

The Admin SPA "Organization memberships" widget is added to the Contact blade (Customers > Contacts > [Contact]) via vc-module-customer PR#300. It lists all `OrganizationMembership` records for the contact in a grid showing org name, role, and lock status. Support agents can lock, unlock, or reclassify any individual membership row — all via the same REST `OrganizationMembershipController` endpoints the storefront xAPI layer calls internally. This view is the single authoritative fallback when storefront-level management is unavailable (e.g., during BUG-1 window or when the customer has no active maintainer).

### Acceptance Criteria

**AC-1: "Organization memberships" widget lists all memberships for a contact**
Given a support agent opens a contact blade in Admin SPA for a user who belongs to two organizations,
When the "Organization memberships" section is visible,
Then the widget shows one row per membership,
And each row displays: organization name, role, and lock status (Active / Locked),
And the total count matches `POST /api/customer/organization-memberships/search` for that user's `userId`.

**AC-2: Admin can lock one membership from the widget**
Given the agent selects "Lock" on a specific membership row and confirms,
When the action completes,
Then the row status changes to "Locked",
And `POST /api/customer/organization-memberships/{id}/lock` returns 200,
And other membership rows remain "Active",
And `GET /api/platform/security/users/{userId}/locked` remains `{ "locked": false }` (BL-AUTH-003).

**AC-3: Admin can unlock a locked membership**
Given a membership row shows "Locked",
When the agent selects "Unlock",
Then the row status changes to "Active",
And `POST /api/customer/organization-memberships/{id}/unlock` returns 200.

**AC-4: Admin can change a membership role via the widget**
Given the agent selects a role-edit action for a membership row and saves a new role,
When `PUT /api/customer/organization-memberships/{id}` returns 200,
Then the widget row reflects the new role,
And the corresponding storefront JWT for that user's next session in that org will carry the updated role's permissions.

**AC-5: REST search returns accurate per-org data for support triage**
Given `POST /api/customer/organization-memberships/search` with `{ "userId": "<userId>" }`,
When the response arrives,
Then it returns `totalCount` matching the number of orgs the user belongs to,
And each item contains `organizationId`, `organizationName`, `roles[]`, `isLocked`, and `isCurrentlyLocked` fields.

### Out of Scope

- Creating a new membership from Admin SPA UI wizard (use REST API directly — future enhancement)
- Bulk operations across multiple contacts simultaneously

### Dependencies

**Depends on:** vc-module-customer PR#300 (widget, REST controller)
**Enables:** Support-tier resolution when BUG-1 is present; used as cross-verification surface for all other stories

### Definition of Done

- [ ] Admin SPA widget renders in Contact blade without crashing for 0, 1, or N memberships
- [ ] Lock/Unlock/Role-change actions tested against vcst-qa Platform 3.1037.0
- [ ] `GET /api/platform/security/users/{userId}/locked` regression guard included in DoD test
- [ ] No new admin SPA console errors
- [ ] BA sign-off; BL-AUTH-003, BL-B2B-001 mapping recorded

### UI/UX Notes

**Layout:** "Organization memberships" widget is a collapsible section within the Contact detail blade. Grid columns: Organization Name, Role, Status, Actions.

**States:**
- Empty state (0 memberships): "No organization memberships" placeholder
- Populated: grid with one row per membership; sortable by org name
- Locked row: "Locked" badge (red/amber); row actions show "Unlock"; "Lock" action hidden
- Active row: "Active" badge (green); row actions show "Lock" and role-edit
- Post-mutation: widget grid row refreshes without reloading the entire blade

**Interaction:** Lock action requires inline confirmation (risk of accidental lock on production account is high). Role-change opens inline dropdown within the row.

### Technical Notes

**API surface:**
- `POST /api/customer/organization-memberships/search` — filter by `userId` or `organizationId`
- `GET /api/customer/organization-memberships/{id}` — single membership record
- `PUT /api/customer/organization-memberships/{id}` — update role
- `POST /api/customer/organization-memberships/{id}/lock` / `.../unlock`
- `isLocked` vs `isCurrentlyLocked`: `isLocked` is the stored flag; `isCurrentlyLocked` incorporates active lockout timing.

**Known defect (do not regress):** REST `POST /api/customer/organization-memberships` (create) with missing `userId` returns 500 with a DB name leak. Finding #2 from `test-execution-report-backend.md`. Track separately — not a user story AC.

### Test Scenarios

| Scenario | Input | Expected Output | Test Type | ECL Ref |
|----------|-------|-----------------|-----------|---------|
| Widget shows both memberships | Contact `@td(MULTI_ORG_TF_BR)` | Count = 2; TechFlow = org-maintainer, BuildRight = org-employee | E2E | null |
| Admin lock via widget | Lock BuildRight row | Row = "Locked"; TechFlow unchanged; `GET /users/{userId}/locked` → `{ "locked": false }` | E2E | null |
| REST search per-user | `POST /search { "userId": "@td(MULTI_ORG_TF_BR.userId)" }` | `totalCount: 2`; correct org IDs, roles, `isLocked: false` | API (REST) | null |
| Create with missing userId | `POST /api/customer/organization-memberships` without `userId` | Expected: `400 Bad Request` (currently returns 500 — Finding #2, BLOCKED until fixed) | API (REST) | null |

---

## EPIC-5028-07: Org-Scoped Lockout Error UX at Sign-In and Org-Switch

**[VCST-5028 | EPIC-5028-07] Display a distinct org-scoped error message when a user is blocked from a specific organization**
**Type:** Feature
**Module:** Auth / Storefront UI
**Priority:** High
**Effort:** XS (< 1 day — UI copy and error-code handling implemented in PR#2315; story formalizes UX requirement and regression coverage)
**Sprint:** Sprint26-11
**Business_Rule:** BL-AUTH-003, BL-B2B-005
**Edge_Case_Refs:** ECL-1.2
**proposed_bl:**
- proposedId: PROPOSED-BL-AUTH-007
- rule: "When a sign-in attempt fails because the user's OrganizationMembership.isLocked is true for the requested organization_id, the platform MUST return HTTP 400 with error code `user_is_locked_in_organization` and the storefront MUST display a distinct copy referencing 'this organization' — never the global-account-locked message. The global account lockout error path (ApplicationUser.LockoutEnd sentinel) remains unchanged and is not triggered."
- source: AC-1; confirmed via live STR on vcst-qa 2026-06-15 (test-execution-report-frontend.md §AC3)

### Story Statement

As a B2B user who has been blocked from a specific organization,
I want to see a clear, org-specific error message at sign-in rather than a generic "account locked" message,
So that I understand the block is scoped to one organization and am directed to contact that organization's administrator — not the global platform support team — to resolve the issue.

### Background / Context

Before per-org lockout existed, the only lockout error was the global `AccountLocked` message from ASP.NET Identity, giving no indication of which organization caused the restriction. With `OrganizationMembership.isLocked`, the `/connect/token` endpoint now returns `code: "user_is_locked_in_organization"` when an org-specific block is in effect. vc-frontend PR#2315 added an error handler for this code path; the resulting copy verified live on vcst-qa 2026-06-15 is: "Your access to this organization has been blocked. Please contact your organization administrator [contact the site administrator]." The bracketed content is a hyperlink to `/contacts`.

### Acceptance Criteria

**AC-1: Org-scoped lockout error appears when signing in to a blocked org**
Given the user's `OrganizationMembership.isLocked` is `true` for the requested organization,
When the user submits sign-in credentials targeting that organization,
Then the server returns `400 invalid_grant` with `code: "user_is_locked_in_organization"`,
And the storefront sign-in form displays: "Your access to this organization has been blocked. Please contact your organization administrator",
And the message includes a link to `/contacts`,
And the user remains on `/sign-in` (no redirect to `/account` or `/blocked`).

**AC-2: Org-scoped error copy is distinct from global account-locked copy**
Given the user's org-specific membership is locked but the global account is NOT locked,
When the org-lockout error is displayed,
Then the copy does NOT contain "Your account has been locked" (the generic global-lock message),
And the copy references the organizational context ("this organization"),
And a global `AccountLocked` condition still shows the original global copy with no regression.

**AC-3: Error disappears on switch to an unlocked org**
Given the org-lockout error was shown for BuildRight,
When the user attempts sign-in targeting TechFlow (the unlocked org),
Then no lockout error is shown,
And sign-in succeeds normally.

**AC-4: Org-scoped lockout does NOT display the global /blocked redirect**
Given the user's membership is locked at the org level only,
When the lockout error is shown,
Then the browser does NOT navigate to `/blocked`,
And no session wipe or impersonation-related UI appears.

### Out of Scope

- Org-specific blocked landing page (e.g., `/blocked-from-org`) — current design keeps user on `/sign-in` with inline error
- Admin-side notification to the org maintainer when a blocked sign-in is attempted

### Dependencies

**Depends on:** vc-frontend PR#2315 (error handler for `user_is_locked_in_organization`), EPIC-5028-02
**Enables:** EPIC-5028-05 AC-3

### Definition of Done

- [ ] Test case added to `regression/suites/Frontend/auth/031-auth-login-register.csv` for the `user_is_locked_in_organization` code path
- [ ] Exact error copy asserted (not just "an error appears")
- [ ] Global account-locked copy regression verified (still shows original copy for `AccountLocked` path)
- [ ] `/blocked` redirect NOT triggered verified as a negative assertion
- [ ] BA sign-off; BL-AUTH-003, PROPOSED-BL-AUTH-007 mapping recorded (pending promotion approval)

### UI/UX Notes

**Layout:** Error is an inline message on the `/sign-in` form, in the same position as other auth errors (e.g., wrong password). Not a toast; not a full-page redirect.

**States:**
- Default: sign-in form with email + password
- Org-locked error: inline alert with org-scoped copy + link to `/contacts`
- Global locked error (separate, existing path): inline alert with global-lock copy (unchanged)

**Copy (exact, verified on vcst-qa 2026-06-15):**
"Your access to this organization has been blocked. Please contact your organization administrator [contact the site administrator]."
The bracketed text is an `<a href="/contacts">` link. The org GUID from the server `errorDescription` is NOT shown to the user.

### Technical Notes

**Server error shape (confirmed live):**
`POST /connect/token` → HTTP 400 `{ "error": "invalid_grant", "code": "user_is_locked_in_organization", "errorDescription": "Your access to organization '<org-guid>' has been blocked. Please contact your organization administrator." }`

**Frontend handler:** vc-frontend PR#2315 — `useUser.ts` or identity error handler maps `code: "user_is_locked_in_organization"` to the i18n key for the org-specific copy. The global `AccountLocked` path maps to a different i18n key.

**Test data:** `@td(MULTI_ORG_TF_BR)` with BuildRight locked. Test must lock in SETUP and unlock in CLEANUP.

### Test Scenarios

| Scenario | Input | Expected Output | Test Type | ECL Ref |
|----------|-------|-----------------|-----------|---------|
| Org-locked sign-in error copy | `@td(MULTI_ORG_TF_BR.email)` targeting locked BuildRight | 400 `invalid_grant`; inline copy contains "this organization" + `/contacts` link | E2E | ECL-1.2 |
| Copy is org-specific not global | Same scenario, check message text | Does NOT contain "Your account has been locked"; contains "organization" | E2E | null |
| Unlocked org succeeds same session | After seeing org-locked error, retry with TechFlow | Sign-in succeeds; no lockout copy shown | E2E | null |
| No /blocked redirect | Org-locked sign-in attempt | URL remains `/sign-in`; no navigation to `/blocked` | E2E | null |

---

## EPIC-5028-08: Org Maintainer Removes a Member from the Organization

**[VCST-5028 | EPIC-5028-08] Delete a member's org membership from the Company Members page**
**Type:** Feature
**Module:** B2B / Organization — Company Members
**Priority:** Medium
**Effort:** XS (< 1 day)
**Sprint:** Sprint26-11
**Business_Rule:** BL-B2B-005, BL-AUTH-005, BL-AUTH-003
**Edge_Case_Refs:** ECL-7.2

### Story Statement

As an Organization Maintainer,
I want to remove a member from my organization via the storefront Company Members page,
So that when someone leaves my company or changes supplier relationships, their access to my organization's data and pricing is immediately revoked — without deleting their global platform account or affecting their memberships at other organizations.

### Background / Context

Removing a member from an org deletes the `OrganizationMembership` record for that org. The `ApplicationUser` record and any memberships at other organizations are fully preserved. The pre-existing `removeMemberFromOrganization` xAPI mutation has been repointed to target the `OrganizationMembership` entity. Verified live: after deleting a membership, `GET /api/platform/security/users/{userId}/locked` returned `{ "locked": false }` and the contact entity remained intact (test-execution-report-backend.md §EDGE-B-04).

### Acceptance Criteria

**AC-1: Maintainer deletes a member — confirmation dialog and happy path**
Given the user is signed in as an org-maintainer and `/company/members` is open,
When the maintainer selects "Delete" from a member row's actions menu,
Then a confirmation dialog appears with the member's name and a warning that this removes them from the organization,
And when confirmed, the `removeMemberFromOrganization` mutation is called,
And the member row disappears from the table without a full page reload,
And a success toast is displayed.

**AC-2: Deletion removes only the org membership — global account survives**
Given a member is deleted from TechFlow (the only org they belong to),
When `GET /api/platform/security/users/{userId}` is called after deletion,
Then the user record still exists and is valid,
And `GET /api/platform/security/users/{userId}/locked` returns `{ "locked": false }` (BL-AUTH-003).

**AC-3: Self-delete is blocked**
Given the org-maintainer is viewing their own row on `/company/members`,
When the maintainer examines their row's actions menu,
Then the "Delete" option is absent or disabled for their own row.

**AC-4: Org employee cannot delete members**
Given the user is signed in as an org-employee,
When the user views `/company/members`,
Then the Delete action is not rendered in any row (BL-B2B-005).

### Out of Scope

- Hard-deleting the user's global platform account
- Bulk deletion of multiple members in one action
- Cascading effects on in-progress orders or quotes

### Dependencies

**Depends on:** vc-module-profile-experience-api PR#135, vc-frontend PR#2315
**Blocked by:** BUG-1

### Definition of Done

- [ ] Confirmation dialog present before deletion
- [ ] `removeMemberFromOrganization` mutation verified with correct input fields per schema
- [ ] Post-deletion: contact entity and global account survival verified in automated test
- [ ] E2E test uses `AGENT-TEST-` member, not shared `@td(MULTI_ORG_TF_BR)` fixture
- [ ] BA sign-off; BL-AUTH-003, BL-B2B-005 mapping recorded

### UI/UX Notes

**Confirmation dialog copy:** "Remove [Member Name] from [Org Name]? This will revoke their access to this organization. Their global account and memberships at other organizations will not be affected."

**States:** Loading spinner on deleted row; row fades out on success; success toast "Member removed from organization."

**Self-row protection:** The self-row "Delete" is hidden (not just disabled) to avoid user confusion.

### Technical Notes

**xAPI mutation:** `removeMemberFromOrganization(command: InputRemoveMemberFromOrganizationType)` — input includes `memberId`, `organizationId`. Targets the `OrganizationMembership` record for that (memberId, organizationId) pair.
**REST guard:** `GET /api/platform/security/users/{userId}/locked` → `{ "locked": false }` after removal.
**Test cleanup:** AGENT-TEST member's contact and security account swept by `/qa-seed-data teardown`.

### Test Scenarios

| Scenario | Input | Expected Output | Test Type | ECL Ref |
|----------|-------|-----------------|-----------|---------|
| Happy path delete | Maintainer deletes AGENT-TEST member from org | `removeMemberFromOrganization.errors[]` empty; row removed; contact entity still exists | E2E | null |
| Global account survives | After deletion, `GET /users/{userId}` | User record valid; `{ "locked": false }` | API (REST) | null |
| Self-delete blocked | Maintainer's own row | Delete action absent; no mutation triggered | E2E | ECL-7.2 |
| Employee cannot delete | org-employee session | Actions column not rendered; direct mutation → Forbidden | GraphQL (runner-native) | ECL-7.2 |

---

## EPIC-5028-09: Org Employee Sees Read-Only Company Member View

**[VCST-5028 | EPIC-5028-09] Org employee can view members but not manage them**
**Type:** Feature
**Module:** B2B / Organization — Company Members
**Priority:** Medium
**Effort:** XS (< 1 day)
**Sprint:** Sprint26-11
**Business_Rule:** BL-B2B-005, BL-AUTH-005
**Edge_Case_Refs:** ECL-7.2

### Story Statement

As a registered B2B user with the org-employee role,
I want to view the list of members in my organization on the Company Members page,
So that I can see who my colleagues are and find their contact information — without being exposed to management actions I am not authorized to perform.

### Background / Context

The storefront Company Members page (`/company/members`) is accessible to all authenticated org members with `storefront:user:view` permission (part of the org-employee set). Management affordances (Invite, Edit role, Block, Delete) are hidden behind `xapi:my_organization:edit` / `storefront:user:invite` / `storefront:user:edit` — granted only to org-maintainer and org-manager roles. An org-employee sees the members table with name, role badge, email, and active status, and nothing else.

### Acceptance Criteria

**AC-1: Org employee can access /company/members and see the member list**
Given the user is signed in with an org-employee JWT,
When the user navigates to `/company/members`,
Then the page loads successfully (no 403 or redirect),
And the member table displays rows with name, role, email, and status columns,
And the user's own row is included in the list.

**AC-2: No management affordances are rendered for org-employee**
Given the user is signed in as an org-employee,
When the `/company/members` page renders,
Then the "Invite members" button is absent from the page,
And there is no actions column with Edit role / Block / Delete controls on any row.

**AC-3: Employee cannot escalate privilege via direct GraphQL mutations**
Given the user holds an org-employee JWT with no `xapi:my_organization:edit` permission,
When the user directly submits any of `changeOrganizationContactRole`, `lockOrganizationContact`, `unlockOrganizationContact`, or `inviteUser` mutations,
Then every mutation returns `errors[]` non-empty with a Forbidden authorization error,
And `data` is null for each,
And no state change is persisted in any org (BL-AUTH-005 server-side enforcement).

### Out of Scope

- Employee ability to edit their own profile/contact info
- Employee ability to leave the organization voluntarily

### Dependencies

**Depends on:** EPIC-5028-01, EPIC-5028-04 (permission gate implementation; employee read-only is the natural inverse)

### Definition of Done

- [ ] Test in `regression/suites/Frontend/b2c/008-b2c-members.csv` updated to assert no management affordances for employee role
- [ ] Direct mutation rejection (AC-3) covered as GraphQL runner test
- [ ] BA sign-off; BL-B2B-005 mapping recorded

### UI/UX Notes

**Layout:** Standard members table with 4 columns: Name, Role, Email, Active/Status. No fifth "Actions" column. No floating invite button.

**Empty state:** If the organization has only the employee themselves, table shows one row (self). No "No members" placeholder.

**Role badge:** The employee's own row shows "Organization employee" (locale equivalent) — informational, not editable.

### Technical Notes

**Permission check:** `storefront:user:view` (org-employee set) is sufficient to load `/company/members` and execute `GetOrganizationContacts`. Management affordances are conditionally rendered via `v-if="$can(CanInviteUsers)"` and `v-if="userCanEditOrganization"` — both false for employees.
**GraphQL:** `GetOrganizationContacts` query populates the members table. `ContactType.rolesInOrganization` powers the role badge display.

### Test Scenarios

| Scenario | Input | Expected Output | Test Type | ECL Ref |
|----------|-------|-----------------|-----------|---------|
| Employee page access | org-employee sign-in → `/company/members` | Page loads; member table visible; own row present | E2E | null |
| No management UI | Same session, inspect page | No "Invite members" button; no actions column | E2E | null |
| Mutation escalation blocked | org-employee sends `changeOrganizationContactRole` | `errors[]` non-empty, Forbidden; no state change | GraphQL (runner-native) | ECL-7.2 |

---

## EPIC-5028-10: Org Switcher Lists Only Currently-Unlocked Organizations for the Authenticated User

**[VCST-5028 | EPIC-5028-10] Exclude locked-membership organizations from the header org-switcher list**
**Type:** Feature
**Module:** B2B / Organization — Header Org Switcher
**Priority:** High
**Effort:** S (1–3 days — backend resolver scoping shipped in PR #135; story formalizes the requirement, UX edge cases, and regression coverage)
**Sprint:** Sprint26-11
**Business_Rule:** BL-AUTH-012, BL-AUTH-013, BL-B2B-001
**Edge_Case_Refs:** ECL-7.2
**proposed_bl:**
- proposedId: PROPOSED-BL-B2B-011
- rule: "The org-switcher list (powered by the `organizations` xAPI query / `GetOrganizations` operation) MUST enumerate only organizations where the requesting principal's `OrganizationMembership.IsCurrentlyLocked` is `false` at query time. `IsCurrentlyLocked` is defined as `IsLocked == true AND (!LockoutEnd.HasValue OR LockoutEnd > UtcNow)`. An organization whose timed lock has expired (LockoutEnd in the past) MUST reappear in the list without any manual intervention. The exclusion is principal-scoped: locking user X in Org A MUST NOT alter which organizations appear in user Y's switcher."
- source: AC-1, AC-3, AC-5; implementation confirmed in vc-module-profile-experience-api PR #135 (`SearchOrganizationsQuery` UserId scoping)

### Story Statement

As a registered B2B user who belongs to multiple organizations,
I want the organization switcher in the storefront header to show only the organizations where my membership is currently active,
So that I cannot accidentally attempt to switch into an organization I am locked out of — removing a confusing dead-end flow and ensuring the switcher list is a truthful representation of my accessible organizations.

### Background / Context

The header org switcher (top-right account menu) is powered by the `GetOrganizations` xAPI operation, which calls the `organizations(after, first, searchPhrase, sort)` query. Before the `OrganizationMembership` entity was introduced, this query returned every org the user belonged to regardless of lock state, because there was no per-membership lock — only the global `ApplicationUser.LockoutEnd`. Now that per-membership locks exist, the switcher list must be filtered at the resolver level: `SearchOrganizationsQuery` in vc-module-profile-experience-api PR #135 sets `UserId` from the authenticated principal so that the server returns only memberships where `IsCurrentlyLocked` is false. This story formalizes that contract as a testable requirement and specifies the two edge cases the implementation must handle: an expired timed lock (which must allow the org back into the list automatically) and the all-memberships-locked state (which must produce a defined UX rather than crashing or showing an empty switcher without explanation).

EPIC-5028-05 and EPIC-5028-07 govern what happens on the *sign-in path* when a locked org is selected; this story governs the *enumeration path* in the switcher. The two behaviors must be consistent: an org that cannot be switched into (05/07) must also not appear in the switch list (this story).

### Acceptance Criteria

**AC-1: Happy path — locked membership org is absent from the switcher list**
Given the user `@td(MULTI_ORG_TF_BR.email)` is authenticated in a TechFlow session and their BuildRight membership has been locked in SETUP via `POST /api/customer/organization-memberships/@td(MULTI_ORG_TF_BR.buildright_membership_id)/lock`,
When the user opens the org-switcher dropdown in the header account menu,
Then the TechFlow organization entry is present in the list,
And the BuildRight organization entry is absent from the list,
And the count of organizations displayed equals the count of the user's memberships where `IsCurrentlyLocked = false`.

**AC-2: Resolver scoping — `GetOrganizations` returns only currently-unlocked orgs for the principal**
Given the same setup as AC-1 (BuildRight locked, TechFlow unlocked),
When the `organizations` xAPI query is executed with the user's JWT (operation `GetOrganizations`),
Then `data.organizations.items[]` does not contain any entry whose `id` equals `@td(MULTI_ORG_TF_BR.org_buildright_id)`,
And `data.organizations.items[]` contains an entry whose `id` equals `@td(MULTI_ORG_TF_BR.org_techflow_id)`,
And `errors[]` is empty.

**AC-3: Expired timed lock — org reappears in switcher automatically**
Given a membership has `IsLocked = true` and a `LockoutEnd` timestamp that is in the past (the lock has expired),
When the user opens the org-switcher dropdown,
Then that organization IS present in the switcher list (the `IsCurrentlyLocked` predicate evaluates to false because `LockoutEnd <= UtcNow`),
And no manual intervention (explicit unlock call) is required for it to reappear.

**AC-4: Consistency with sign-in path — switcher exclusion and sign-in rejection agree**
Given the user is currently signed into a TechFlow session and BuildRight membership is locked,
When the user opens the header org-switcher,
Then BuildRight does not appear in the switcher list (this story, AC-1),
And if the user navigates directly to the org-switch flow for BuildRight (e.g., via a bookmarked URL or stale client state), the token request for BuildRight still returns `400 invalid_grant` with `code: "user_is_locked_in_organization"` (EPIC-5028-05, EPIC-5028-07 — the two enforcement layers agree),
And the storefront surfaces the org-specific lockout copy rather than silently failing.

**AC-5: Negative — locking user X in Org A does not affect user Y's switcher**
Given user `@td(MULTI_ORG_TF_BR.email)` is locked out of BuildRight,
When a different authenticated user who also belongs to BuildRight (with an unlocked membership) opens their org-switcher,
Then BuildRight appears normally in that user's switcher list (BL-B2B-001 strict cross-principal isolation),
And the count of switchable orgs for that second user is unchanged from before user X was locked.

**AC-6: All-memberships-locked edge — switcher shows empty or hidden state with no crash**
Given every organization membership for the authenticated user has `IsCurrentlyLocked = true`,
When the user opens the header account menu,
Then the org-switcher control either: (a) is hidden entirely, or (b) renders with an empty list and an appropriate empty-state message referencing that no organizations are currently accessible,
And the storefront does not throw a JavaScript exception or render a broken UI,
And the user remains authenticated at the global-account level with access to account-level pages (`/account/orders`, `/account/profile`).

### Out of Scope

- The sign-in org-selection dropdown at `/sign-in` (separate from the post-login header switcher; its filtering behavior is covered by EPIC-5028-05 and EPIC-5028-07)
- Admin SPA — the Admin SPA org widget is not affected by this story (that surface is governed by EPIC-5028-06)
- What UX the product team ultimately chooses for the all-memberships-locked state (AC-6 specifies the acceptable range; the exact design is a product decision to confirm)
- Automatic lock-expiry notifications or countdown timers in the switcher

### Dependencies

**Depends on:** vc-module-profile-experience-api PR #135 (`SearchOrganizationsQuery` UserId scoping), vc-frontend PR #2315
**Cross-references:** EPIC-5028-05 (other-org access retained after lock), EPIC-5028-07 (org-scoped lockout error UX — the sign-in-path enforcement layer this story must be consistent with)
**Enables:** Full regression coverage of the switcher enumeration path; product sign-off on AC-6 UX edge case

### Definition of Done

- [ ] Feature works in Chrome, Firefox, and Edge
- [ ] Switcher dropdown renders correctly at 1920px desktop; account menu at 375px mobile (hamburger panel — confirm BuildRight absent in mobile switcher too, per `feedback_mobile_hamburger_inventory.md`)
- [ ] `organizations` xAPI query verified against live schema — `after: Int`, `first: Int`, `searchPhrase: String`, `sort: String` argument names used exactly as in `graphql-schema.md` line 124; no paraphrased field names
- [ ] GraphQL runner test case added to `regression/suites/Backend/graphql/050d-graphql-xprofile.csv` covering AC-2 (runner-native `[ERRORS]` empty + `[DATA] data.organizations.items[].id` does not contain BuildRight id)
- [ ] E2E test case added to `regression/suites/Frontend/b2b/006-b2b-organization.csv` covering AC-1 happy path (SMK-020 smoke must remain green)
- [ ] SETUP/CLEANUP lock/unlock steps use `POST /api/customer/organization-memberships/@td(MULTI_ORG_TF_BR.buildright_membership_id)/lock` and `.../unlock`; no persistent fixture mutation
- [ ] AC-6 UX decision confirmed with product before test is written (test author uses confirmed behavior, not assumption)
- [ ] No new console errors or warnings introduced
- [ ] All visible strings use i18n keys (empty-state message for AC-6)
- [ ] BA sign-off; BL-AUTH-012, BL-AUTH-013, BL-B2B-001 mapping recorded; PROPOSED-BL-B2B-011 noted as pending promotion approval

### UI/UX Notes

**Layout:** The org-switcher is the organization dropdown in the top-right header account menu, populated by a `GetOrganizations` search-as-you-type call. On mobile (width <= 500px) the header controls re-mount inside the hamburger panel — the switcher must be verified absent/present there as well.

**States to handle:**
- Default (multiple unlocked memberships): dropdown lists all unlocked orgs; search filters within the unlocked set only
- One locked, others unlocked: dropdown is shorter by the locked org(s); no visual indicator that orgs are "missing" (from the user's perspective, this is their accessible org list)
- All locked (AC-6): either (a) switcher control not rendered, or (b) dropdown open with an empty-state message such as "No organizations available" — product decision required
- Loading: search-as-you-type shows a loading indicator while `GetOrganizations` is in-flight; same UX as today

**Interaction details:**
- The switcher's search input filters only the orgs that the resolver already returned (already-filtered unlocked set); no client-side re-filtering for lock state is needed or acceptable
- Switching into an org that appears in the list must succeed without hitting the `user_is_locked_in_organization` error (if an org appears in the list, the token request for it must succeed — consistency guarantee of this story)
- No lock-status badge or tooltip is shown on orgs in the list (they are all unlocked by construction)

**Existing component:** The org-switcher composable is `useOrganizationSwitcher.ts`; `switchOrganization()` in `useUser.ts` returns boolean. No new component is needed — the fix is in the data layer (`GetOrganizations` resolver) with this story covering the regression requirement.

### Technical Notes

**xAPI query surface:**
- Operation name: `GetOrganizations` (confirmed in `vc/shared/reports/bugs/closed/BUG-Organization-Search-Not-Filtering.md`)
- Schema signature: `organizations(after: Int, first: Int, searchPhrase: String, sort: String)` — exact argument names from `graphql-schema.md` line 124
- The resolver's `UserId` scoping (vc-module-profile-experience-api PR #135) performs the filtering server-side inside `SearchOrganizationsQuery`; the frontend composable does not apply any additional lock-state filter

**Lock model precision:**
- `IsCurrentlyLocked` is the compound predicate: `IsLocked == true AND (!LockoutEnd.HasValue OR LockoutEnd > UtcNow)`. The resolver must use this predicate, not the raw `IsLocked` flag, so that expired timed locks do not permanently suppress an org from the list.
- `IsLocked` alone (without the `LockoutEnd` check) is insufficient and would cause AC-3 to fail.

**REST endpoints for SETUP/CLEANUP:**
- Lock: `POST /api/customer/organization-memberships/@td(MULTI_ORG_TF_BR.buildright_membership_id)/lock`
- Unlock: `POST /api/customer/organization-memberships/@td(MULTI_ORG_TF_BR.buildright_membership_id)/unlock`
- Verify lock state: `GET /api/customer/organization-memberships/@td(MULTI_ORG_TF_BR.buildright_membership_id)` — check `isLocked: true`, `isCurrentlyLocked: true`

**GraphQL fixture:** No existing `GetOrganizations.graphql` fixture in `test-data/graphql/queries/` as of 2026-06-15. QA team must add `test-data/graphql/queries/GetOrganizations.graphql` and a corresponding `index.json` entry before authoring the runner-native AC-2 test case.

**BL-AUTH-013 cross-reference:** That invariant's `Verify` step includes "storefront `/sign-in` or org-switch into the locked org → assert org-specific copy." This story's AC-4 is the *switcher-side* complement: the org must not appear in the list at all, making the org-switch-into-locked path unreachable under normal conditions. The two together close the full enforcement surface.

**VC modules affected:** vc-module-profile-experience-api PR #135 (resolver, already merged), vc-frontend PR #2315 (org-switcher composable, already merged) — this story adds test coverage, not new code.

**Known defect (do not regress):** BUG-1 (`GetPageContext.user.permissions` returns `[]` after org-switch) is distinct from this story — it affects management affordances on `/company/members`, not the `GetOrganizations` query or switcher list contents. This story's test is not blocked by BUG-1.

### Test Scenarios

| Scenario | Input | Expected Output | Test Type | ECL Ref |
|----------|-------|-----------------|-----------|---------|
| Happy path — locked org absent from list | SETUP: lock `@td(MULTI_ORG_TF_BR.buildright_membership_id)`; open header switcher | BuildRight absent; TechFlow present; listed count = unlocked membership count | E2E | null |
| Resolver scoping — `GetOrganizations` excludes locked org | Execute `GetOrganizations` with `@td(MULTI_ORG_TF_BR.email)` JWT (BuildRight locked) | `errors[]` empty; `data.organizations.items[].id` does not contain `@td(MULTI_ORG_TF_BR.org_buildright_id)` | GraphQL (runner-native) | ECL-7.2 |
| Expired timed lock — org reappears | Membership has `IsLocked=true`, `LockoutEnd` in the past | Org IS present in switcher; no explicit unlock needed | Integration | null |
| Cross-path consistency | BuildRight locked; user attempts org-switch to BuildRight via stale URL | BuildRight not in switcher list; token request still returns `400 user_is_locked_in_organization` if attempted directly | E2E | ECL-7.2 |
| Cross-principal isolation | User X locked from BuildRight; User Y (different account, unlocked BuildRight membership) opens switcher | BuildRight present in User Y's switcher; User Y's list unchanged | E2E | ECL-7.2 |
| All memberships locked | All user memberships set `IsCurrentlyLocked = true` | Switcher hidden or shows empty-state; no JS exception; account-level pages remain accessible | E2E | null |
| Unlock restores org to list | CLEANUP unlock `@td(MULTI_ORG_TF_BR.buildright_membership_id)` → open switcher | BuildRight reappears in list | E2E | null |
| Mobile hamburger — locked org absent | Same as happy path at 375px viewport, hamburger open | BuildRight absent from mobile switcher panel | E2E | null |

---

## Known Defects Cross-Referenced

The following defects were identified during sprint test execution (2026-06-15) and are referenced as known risks across the stories above. Track as blocking bugs — not encoded as user stories.

**BUG-1 (High) — `GetPageContext.user.permissions` returns `[]` after org-switch**
Blocks: EPIC-5028-01 AC-1, EPIC-5028-02 AC-1, EPIC-5028-03 AC-1, EPIC-5028-08 AC-1, EPIC-5028-09 AC-2 (partial).
Root cause: `me`/pageContext projection does not derive `permissions`/`roles` from `OrganizationMembership` records after org-switch; reads `ApplicationUser.Roles` which is empty for Customer-type accounts.
Module: vc-module-profile-experience-api (PR#135 did not wire the permissions projection path for org-switched user context).
Evidence: `tests/Sprint26-11/VCST-5028/test-execution-report-frontend.md` §BUG-1.

**BUG-2 (High) — REST `POST /api/customer/organization-memberships` input validation gaps**
Missing `userId` → HTTP 500 + DB name leak (`vcst-qa-platform_restored`). Empty-string `userId` → HTTP 200 orphan record. Expected: HTTP 400 with validation message.
Module: vc-module-customer (PR#300 `OrganizationMembershipController.Create`).
Blocks: EPIC-5028-06 AC-5 negative test for create validation.
Evidence: `tests/Sprint26-11/VCST-5028/test-execution-report-backend.md` §Finding #2.
