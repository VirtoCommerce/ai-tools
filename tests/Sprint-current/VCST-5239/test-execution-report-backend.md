# VCST-5239 — Backend / Admin-SPA / GraphQL Test Execution Report

**Env:** vcst-qa @ Platform `3.1041.0` · `VirtoCommerce.Customer 3.1014.0-alpha.1002-vcst-5239` · `ProfileExperienceApiModule 3.1010.0-pr-137-5f46` (versions confirmed at runtime via admin session / introspection).
**Scope:** Block A of `testing-checklist.md` + Block C whitelist/duplicate hooks. Browser: playwright-edge (Admin SPA) + REST/`/connect/token`/GraphQL (xAPI).
**Verdict:** All in-scope ACs PASS or by-design. **No bugs filed.** Two adversarial hypotheses (AC12 server-side enforcement; duplicate-role guard) verified as **by-design / no-impact**, not defects.

## Per-AC verdict

| AC | Verdict | Evidence (oracle) |
|----|---------|-------------------|
| AC1 | PASS | Admin SPA member blade shows distinct **Accounts** (global roles) + **Organization memberships** widgets (screenshot). Fresh AGENT-TEST user global `roles=[]` — no residual defaults; JWT carries only set + inherited roles. |
| AC2 | PASS | `/connect/token` access_token decoded: `permission[]` == role-derived set 1:1. org-maintainer→11 perms, org-employee→2 perms. `organizationId` claim present + org-scoped. |
| AC3 (server half) | PASS | Added org-level role to TechFlow via `PUT /api/organizations` → re-issued member JWT gained the role's perm (`marketing:read`, 11→12) with **no** membership change. |
| AC4 | PASS | Settings → **Customer › Roles** exposes "Organization roles whitelist" + "Membership roles whitelist"; both independently editable; save round-trips (persisted in setting `allowedValues`). Screenshot. |
| AC5 (Admin SPA) | N/A → Block B | Admin SPA org-level role dropdown sources the **unfiltered** `POST /api/platform/security/roles/search` (all 42 roles). Whitelist has no server/Admin-SPA consumer (see AC12); storefront (vc-frontend#2354) is the intended dropdown consumer → verify in Block B. Not a defect. |
| AC6 (Admin SPA) | N/A → Block B | Same as AC5: membership-role widget sources all 42 platform roles, not the Membership whitelist. |
| AC7 | PASS | Org-level role inherited by **ALL 6** TechFlow members: `organization.contacts{ rolesInOrganization }` returns `AGENT-TEST-OrgLevel-5239` for every member incl. "Invited User" (who has NO membership role). Two distinct members (maintainer + fresh employee) both gained the inherited perms in their JWTs with no per-user assignment. |
| AC8 | PASS | `organization.contacts(roleIds:["org-employee"])` → exactly the 2 employee-role members; `roleIds:[]` and omitted → full 6 (no empty-set-matches-none). |
| AC10 | PASS | Org-level role on TechFlow did **not** touch BuildRight (org `roles=[]`) nor the global account (fresh user global `roles=[]`); multi-org user's BuildRight JWT stayed 2 perms — `marketing:read` did **not** leak. |
| AC11 | PASS | Introspection: `rolesInOrganization` / `isLockedInOrganization` now take **no args** (org context implicit). Both resolve with no arg, no `errors[]`. Multi-org actor with a BuildRight-scoped JWT → `rolesInOrganization`=`["Organization employee"]` (BuildRight only), no TechFlow leak. |
| AC12 | BY-DESIGN (not a bug) | See finding F1. Whitelist is **not** enforced server-side; xAPI `changeOrganizationContactRole` accepted a non-whitelisted role. Confirmed by code: whitelist is settings-only. |
| AC13 (union + override-removal) | PASS | Union: employee membership(2) ∪ org-inherited(2) = 4 deduped; maintainer(11) ∪ org-inherited = 12. **Override-removal:** set membership `roles=[]` → JWT retained the org-inherited perms (`marketing:read`, `xapi:my_organization:order:view`), only the membership base dropped. The plausible "strip-the-base" union bug is **NOT** present. |

## Block C exploratory

- **Empty Org whitelist / allow-all:** N/A as a server security gap — there is **no** server-side whitelist gate anywhere (F1). Empty-whitelist dropdown behavior is a frontend concern (Block B).
- **Role removed from whitelist after assigned:** existing assignments intact — TechFlow maintainers still hold `org-maintainer` though it is not in the Membership whitelist; re-assigning it via xAPI still succeeds (consistent with UI-only whitelist). No retroactive purge, no inconsistent state.
- **Same role in both whitelists:** the two settings are independent objects — held distinct values simultaneously (Org={org-maintainer, purchasing-agent}, Membership={org-employee}); no cross-contamination.
- **Duplicate org-level role guard:** finding F2 (low, not filed).

## Findings (verified NOT filable)

**F1 — Whitelist has no server-side enforcement (AC12).** Via storefront xAPI, `changeOrganizationContactRole(memberId, roleIds:["org-maintainer"])` (a role EXCLUDED from the Membership whitelist) returned `succeeded:true, errors:[]`. Verified against source: `customer#304` defines the two whitelist `SettingDescriptor`s in `ModuleConstants.cs` only (6 refs, all settings-definition); `profile-experience-api#137` (the mutation handler) has **zero** whitelist references. **Conclusion: the whitelist is a UI dropdown-population feature by design, not a security boundary — this is out-of-scope / by-design, NOT a defect.** Flag for PO only if a server-side boundary was ever intended (then it would be a privilege gap, since an org-maintainer could grant any role by crafting the mutation). BL-AUTH-005's "403 on unauthorized" is unaffected — permission checks (e.g. `xapi:my_organization:edit`) still gate the mutation.

**F2 — No uniqueness guard on org-level roles (Block C).** `PUT /api/organizations` with a hand-crafted duplicate `OrganizationRoleEntity` array persisted **two** identical rows (same `roleId`). No functional impact — the JWT dedupes (`marketing:read` count=1). API-only, no UI path (Admin dropdown would exclude an already-assigned role), no permission impact → low-severity data-hygiene note, not filed.

## BL invariant results

- **BL-B2B-007 `[P0]`** PASS — per-org JWT is org-scoped; TechFlow(12/11 perms) vs BuildRight(2 perms) with correct `organizationId` claim; no cross-org permission leak in token or `rolesInOrganization`.
- **BL-B2B-005** PASS — effective perms derived from `OrganizationMembership.Roles` **plus** inherited org-level roles; `rolesInOrganization` returns the merged set.
- **BL-B2B-008** PASS — org-scoped role change mutated only the target org; global `ApplicationUser.Roles` and other org (BuildRight) untouched.
- **BL-AUTH-005** PASS (6-permission model observed in JWTs); the "403 on non-whitelisted assignment" sub-hypothesis is N/A (whitelist is not a server boundary — F1).
- **BL-AUTH-006** N/A — org roles are flat B2B roles; no hierarchy inheritance exercised here.

## Contract notes for downstream

- Org-level roles live on the org's `roles[]` as `OrganizationRoleEntity {organizationId, roleId, roleName, id}` — set via `PUT /api/organizations` (the generic `PUT /api/members` accepts a role entity with **null** `roleId` silently → resolves to zero perms; use the org endpoint / proper `roleId`).
- Whitelist values persist in the setting object's **`allowedValues`** array (not `value`); dictionary setting, group `Customer|Roles`.
- xAPI: mutation root type is `Mutations`; `changeOrganizationContactRole` returns `CustomIdentityResultType { succeeded, errors{code description} }`.

---

## Fixture state left for frontend phase (CRITICAL)

All entities carry the `AGENT-TEST-` prefix and are safe for teardown after the frontend phase. **Do not reset the whitelists — Block B needs them.**

**Org-level role (NEW, no `@td` alias):**
- Role id `AGENT-TEST-orglevel-5239`, name `AGENT-TEST-OrgLevel-5239`, permissions = `xapi:my_organization:order:view` + `marketing:read` (both storefront-observable; order:view gates order-viewing UI).
- Assigned as an **organization-level role on TechFlow** (`@td(MULTI_ORG_TF_BR.org_techflow_id)` = `96f109a7-9010-4691-b6a1-bef25cca3d04`). Exactly one entry. Inherited by all 6 TechFlow members.

**Members / logins (all password `Password1!`, `storeId=B2B-store`; relogin = fresh `/connect/token` with `organization_id=<TechFlow id>` or storefront sign-in):**
- **AC3 / AC13-UNION fixture** — `agent-test-multiorg-20260615@yopmail.com` (`@td(MULTI_ORG_TF_BR)`). TechFlow membership role = **org-maintainer** + org-inherited role → effective = **12 perms union** (includes inherited `marketing:read`). Use to observe the new org-level role appearing post-relogin (AC3) and the union in gated UI (AC13). In BuildRight this same user is org-employee (2 perms) — use for cross-org isolation.
- **AC13 OVERRIDE-REMOVED fixture** — `agent-test-5239-emp-20260707@yopmail.com` (NEW; contactId `a03954c0-9fc6-4f8b-878a-448fd85654de`, userId `09b6cc33-a431-4bb7-8906-50c3b2b93c03`; global roles `[]`). TechFlow member; membership override was **removed** (`roles=[]`), so effective = **only the 2 org-inherited perms** (`marketing:read`, `xapi:my_organization:order:view`). Use to confirm the storefront still shows org-inherited gated actions after override removal (permission set must NOT collapse to zero).

**Whitelist configuration left in place (Customer › Roles settings):**
- **Organization roles whitelist** = `org-maintainer`, `purchasing-agent` (excludes `org-employee`).
- **Membership roles whitelist** = `org-employee` (excludes `org-maintainer`, `purchasing-agent`).
- Use these to verify storefront dropdown filtering (AC5/AC6 storefront half). Note from Block A: the whitelist is **not** enforced server-side and the **Admin SPA** dropdowns are unfiltered — so AC5/AC6 are meaningful only if the **storefront** reads the whitelist to populate its dropdowns (vc-frontend#2354). If the storefront dropdown is also unfiltered, that is the frontend consumer gap to report (still not a server bug).

**Teardown note:** after the frontend phase, sweep via `npm run seed:b2b:teardown` (AGENT-TEST- prefix) + delete role `AGENT-TEST-orglevel-5239`, remove it from TechFlow's `roles[]`, and reset both `Customer.*RolesWhitelist` settings to empty. The fresh user + org-level role are not auto-created by seeders — remove manually.
