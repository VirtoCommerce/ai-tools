# Testing Checklist — VCST-5028: Per-Organization Roles and Access Control

**Build:** Platform 3.1037.0 | Customer PR#300 (3.1010.0-pr-300-fa2a) | ProfileXAPI PR#135 (3.1008.0-pr-135-cb12) | vc-frontend PR#2315 (2.51.0-pr-2315-c85b)
**Env:** `{{BACK_URL}}` / `{{FRONT_URL}}` (vcst-qa)
**Fixture:** `@td(MULTI_ORG_TF_BR.*)` — TechFlow = `org-maintainer`, BuildRight = `org-employee`
**BL refs:** BL-AUTH-005 (RBAC 6-perm model), BL-AUTH-006 (role hierarchy), BL-AUTH-003 (lockout), BL-B2B-001 (org-switch isolation), BL-B2B-005 (role → feature visibility)
**Auth note:** `/connect/token` password grant returns `invalid_grant` for B2B-store Customer accounts. JWT must be captured via the storefront login → org-switch flow (Authorization header or localStorage bearer), then decoded with `atob(token.split('.')[1])`.
**Execution order for FE:** AC1 (read-only) → AC2 (TechFlow role change) → AC3 (BuildRight lockout). Reset fixture state between runs if needed.
**BE isolation:** qa-backend-expert MUST create a separate `AGENT-TEST-` member for write/lock operations so it never collides with the FE fixture.

---

## AC1 — Per-org JWT permission isolation

**Precondition:** `@td(MULTI_ORG_TF_BR.email)` is logged out. Both org memberships are clean (no prior lock/role change from this run).

### [FE] AC1-F-01 — TechFlow login yields org-maintainer permissions
- Given: log in as `@td(MULTI_ORG_TF_BR.email)` / `@td(MULTI_ORG_TF_BR.password)` on `{{FRONT_URL}}`
- When: org switcher shows; select TechFlow organization
- Then: capture bearer token from localStorage/Authorization header; decode payload; assert `roles` or `permissions` include org-maintainer scope; assert org-employee scope from BuildRight is NOT present
- Then: Company Members page is accessible (BL-B2B-005 — maintainer feature visibility)
- **Gap:** no existing suite covers per-org JWT payload content post org-switch

### [FE] AC1-F-02 — BuildRight login yields org-employee permissions (different set)
- Given: same session or fresh login, select BuildRight organization
- Then: decode bearer; assert roles/permissions reflect `org-employee` scope; assert org-maintainer scope from TechFlow is NOT present (BL-B2B-001 isolation)
- Then: if Company Members role-change UI is maintainer-only → it should be absent or disabled for employee (BL-B2B-005)
- **Gap:** no existing suite asserts permission-set difference between two orgs for the same user

### [BE] AC1-B-01 — Admin "Organization memberships" widget shows both memberships
- Given: navigate Admin SPA → Customers → Contacts → open `@td(MULTI_ORG_TF_BR.id)` contact blade
- Then: "Organization memberships" widget lists two rows: TechFlow / org-maintainer AND BuildRight / org-employee
- Then: membership ids match `@td(MULTI_ORG_TF_BR.techflow_membership_id)` and `@td(MULTI_ORG_TF_BR.buildright_membership_id)`

### [BE] AC1-B-02 — REST search returns per-org roles
- Given: `POST {{BACK_URL}}/api/customer/organization-memberships/search` body `{"userId":"@td(MULTI_ORG_TF_BR.userId)"}`
- Then: `200 OK`; `totalCount = 2`; one item has `organizationId = @td(MULTI_ORG_TF_BR.org_techflow_id)` and roles containing `org-maintainer`; other has `org_buildright_id` and `org-employee` (BL-AUTH-005)

### [BE] AC1-B-03 — GraphQL ContactType exposes org membership roles
- Given: `query { contact(id: "@td(MULTI_ORG_TF_BR.id)") { organizationMemberships { organizationId roles { id name } isLocked } } }`
- Then: `errors[]` is empty or absent; response contains two membership nodes with correct org IDs and role names
- **Gap:** new field — not covered by any existing GraphQL suite

---

## AC2 — Storefront org-scoped role change

**Precondition:** Logged in as TechFlow org-maintainer (post AC1-F-01). A second member exists in TechFlow that the FE agent can change roles on — use `TECHFLOW_BUYER` (`@td(TECHFLOW_BUYER.email)`) if already in TechFlow, or the BE agent creates a separate `AGENT-TEST-` member.

### [FE] AC2-F-01 — Org maintainer changes member role on Company Members page
- Given: `{{FRONT_URL}}/company/members` open as TechFlow org-maintainer
- When: locate the target member row; open role dropdown; change role (e.g., org-employee → org-manager or vice versa)
- Then: success toast shown; role column updates without full page reload
- **Gap:** no suite currently asserts org-scoped role change via storefront UI (suite 006 covers member listing only)

### [FE] AC2-F-02 — Changed role is reflected in Admin Organization memberships widget
- Given: role was changed in AC2-F-01
- Then: Admin SPA → Customers → Contacts → target member → Organization memberships widget shows the new role for TechFlow; BuildRight membership (if any) is unchanged (BL-B2B-001)
- **Gap:** no cross-layer storefront-change → Admin verification for org-scoped role

### [FE] AC2-F-03 — Role change does not bleed to the other org
- Given: target member also has a BuildRight membership with its own role
- Then: BuildRight membership role in Admin widget = unchanged original value after AC2-F-01 role change

### [BE] AC2-B-01 — GraphQL ChangeOrganizationContactRole mutation (on AGENT-TEST member)
- Given: BE agent creates `AGENT-TEST-` member, adds to TechFlow org via REST, captures membershipId
- When: `mutation { changeOrganizationContactRole(command: { memberId: ..., organizationId: "@td(MULTI_ORG_TF_BR.org_techflow_id)", roleIds: ["org-manager"] }) { ... } }`
- Then: `errors[]` absent; response reflects updated role; REST search for that userId confirms new role for TechFlow, other-org role unchanged
- **Gap:** new mutation — not in any existing GraphQL suite

### [BE] AC2-B-02 — Unauthorized role change rejected (org-employee cannot change roles)
- Given: authenticated as a member who is org-employee in TechFlow (not maintainer)
- When: attempt `changeOrganizationContactRole` GraphQL mutation
- Then: `errors[]` contains authorization error; no role change persisted (BL-AUTH-005, BL-AUTH-006)

---

## AC3 — Org-scoped lockout

**Precondition:** BE agent creates a fresh `AGENT-TEST-` member in BOTH TechFlow and BuildRight. FE agent uses `@td(MULTI_ORG_TF_BR.*)` for the storefront lockout UX path (read-only fixture manipulation — lock BuildRight, attempt BuildRight login, then unlock to restore).

### [FE] AC3-F-01 — Locked-out member cannot log into locked org; can still log into other org
- Given: admin (or BE step) locks the fixture member from BuildRight org via Admin SPA or REST
- When: `@td(MULTI_ORG_TF_BR.email)` attempts login and selects BuildRight on `{{FRONT_URL}}`
- Then: "account locked for this organization" identity error appears (new frontend identity error from PR#2315)
- When: same credentials, select TechFlow
- Then: login succeeds; TechFlow session is active (BL-AUTH-003 scoped to org, NOT global)
- **Cleanup:** unlock BuildRight membership after this item to restore fixture

### [FE] AC3-F-02 — Org-specific lock error message wording
- Given: member locked from org
- When: sign-in attempted for that org
- Then: error copy matches "account locked for this organization" (or the exact copy from PR#2315 implementation) — not the generic global-lockout message

### [BE] AC3-B-01 — LockOrganizationContact mutation scopes lock to one org (on AGENT-TEST member)
- Given: AGENT-TEST member in TechFlow + BuildRight
- When: `mutation { lockOrganizationContact(command: { memberId: ..., organizationId: "@td(MULTI_ORG_TF_BR.org_buildright_id)" }) { ... } }`
- Then: `errors[]` absent; REST search shows `isLocked: true` for BuildRight membership; TechFlow membership `isLocked: false`
- **Gap:** new mutation — not in any existing GraphQL suite

### [BE] AC3-B-02 — Global ApplicationUser.LockoutEnd is NOT set when org-locking
- Given: BuildRight membership is locked via mutation/REST
- When: `GET {{BACK_URL}}/api/platform/security/users/@td(MULTI_ORG_TF_BR.userId)/locked`
- Then: `{ "locked": false }` — global account is NOT locked (BL-AUTH-003; the exact bug the feature fixes)
- **Gap:** critical regression guard — no existing suite checks this invariant for the new entity

### [BE] AC3-B-03 — UnlockOrganizationContact mutation restores access
- Given: AGENT-TEST member locked in BuildRight (from AC3-B-01)
- When: `mutation { unlockOrganizationContact(command: { memberId: ..., organizationId: "@td(MULTI_ORG_TF_BR.org_buildright_id)" }) { ... } }`
- Then: `errors[]` absent; REST search shows `isLocked: false` for BuildRight; member can re-authenticate into BuildRight org

### [BE] AC3-B-04 — Admin SPA lock via Organization memberships widget (on AGENT-TEST member)
- Given: Admin SPA → Contacts → AGENT-TEST member → Organization memberships widget
- When: lock BuildRight membership row via widget action
- Then: Admin shows locked state for BuildRight; TechFlow row remains unlocked; `GET /api/platform/security/users/{userId}/locked` → `{ "locked": false }` (global account untouched)

---

## Edge Cases & Adversarial Checks

### [FE] EDGE-F-01 — Privilege escalation: higher-priv org perms do not leak after switching to lower-priv org
- Given: logged in as TechFlow org-maintainer (higher priv)
- When: switch to BuildRight org (org-employee)
- Then: decode new bearer; org-maintainer permissions from TechFlow are NOT present; Company Members role-change action is absent or disabled (BL-B2B-001 strict isolation)

### [BE] EDGE-B-01 — Unauthorized actor cannot lock another org's member
- Given: authenticated as org-employee (no admin rights)
- When: attempt `lockOrganizationContact` for another org they don't manage
- Then: `errors[]` present; `isLocked` unchanged (BL-AUTH-005)

### [BE] EDGE-B-02 — Token valid until expiry after mid-session org-lock (refresh boundary)
- Given: active session token issued for BuildRight org
- When: BuildRight membership is locked externally (mid-session)
- Then: existing token remains valid until its `exp` claim; next token-refresh attempt is rejected with org-lockout error
- Note: this is an informational check — document actual refresh-rejection behavior; no pass/fail if the platform relies on token expiry by design

### [BE] EDGE-B-03 — REST OrganizationMembershipController — missing required fields returns 400
- Given: `POST {{BACK_URL}}/api/customer/organization-memberships` body missing `userId`
- Then: `400 Bad Request` with validation error; no partial record created

### [BE] EDGE-B-04 — Removing last membership does not corrupt global account
- Given: AGENT-TEST member with one org membership
- When: delete membership via REST or Admin widget
- Then: contact still exists in platform; global account `locked: false`; `GET /api/platform/security/users/{userId}` returns valid user record

---

## Coverage Gaps Summary

| Item | Gap | Existing Suite |
|------|-----|---------------|
| Per-org JWT payload content after org-switch | None | No suite (new capability) |
| Permission-set difference between two orgs same user | None | No suite |
| Storefront org-scoped role change UI | None | Suite 006 covers listing only |
| GraphQL `organizationMemberships` on ContactType | None | New field — 050* suites predate PR#135 |
| `changeOrganizationContactRole` mutation | None | New mutation |
| `lockOrganizationContact` / `unlockOrganizationContact` | None | New mutations |
| Global lockout NOT set when org-locking (AC3-B-02) | None | Critical regression guard — no suite |
| "Account locked for this organization" error copy | None | Suite 031 auth covers global lockout only |
