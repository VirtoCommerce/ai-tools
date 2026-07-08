# VCST-5239 — AC Traceability & Implementation Analysis

**Story:** [Support][Opus] Organization-scoped roles with user-level override · Story · **High** · status **Testing** · VirtoStart
**Parent:** VCST-5028 (per-org roles & access control — Done). This story extends that model with **organization-level roles** (inherited by all members) + **user-level override** + **role whitelists**.
**Build under test:** Platform `3.1041.0` · `VirtoCommerce.Customer 3.1014.0-alpha.1002-vcst-5239` · `ProfileExperienceApiModule 3.1010.0-pr-137-5f46` · theme `2.53.0-pr-2354` (all confirmed in vc-deploy-dev@vcst-qa)
**PRs:** customer#304 · profile-experience-api#137 · vc-frontend#2354

## Story AC quality
The story description is a single sentence ("assign a role at the organization level so all employees inherit permissions"). It is **not independently testable** — the falsifiable ACs live in the two QA test-script comments (Dmitry Grishin, 2026-06-30): **Test 1** (roles → JWT permissions after relogin) and **Test 2** (whitelist → dropdown options). Those + the PR diffs are the real spec. Verdict: story AC = **REWRITE/SPLIT** into the atomic conditions below. `ba-story-writer` Mode-B skipped (one-line story, full diff context in hand) — noted deviation.

## AC ↔ implementation traceability

Impl verdict legend: **SAT-diff** = code for it is present in the diff (a suspicion, not a pass); **GAP** = no direct diff coverage, must verify live; **DRIFT-risk** = contract change that could break consumers.

| # | Atomic condition | Source | BL / ECL | Layer | Impl (static) | Live verdict |
|---|---|---|---|---|---|---|
| AC1 | Admin can view a user's Global roles and Membership roles; user carries **only** the roles that were set | Test 1 | BL-AUTH-005 | Admin SPA / API | SAT-diff | _pending_ |
| AC2 | The user's JWT `permission[]` = exactly the permissions derived from those roles (decode at jwt.io) | Test 1 | BL-B2B-007, BL-AUTH-005 | Backend/token | SAT-diff (`OrganizationIdClaimProvider`) | _pending_ |
| AC3 | Admin adds a **new organization-level role** + Save → after storefront **relogin**, the user's roles **and** JWT permissions reflect the new org role | Test 1 | BL-B2B-005, BL-B2B-007 | Backend + storefront | SAT-diff | _pending_ |
| AC4 | **Customer › Roles** settings expose an **Organization roles whitelist** and a **Membership roles whitelist** | Test 2 | BL-AUTH-005 | Admin SPA / settings | SAT-diff (`ModuleConstants` +20) | _pending_ |
| AC5 | Organization-managing page role dropdown shows **only** options from the Organization roles whitelist | Test 2 | — | Admin SPA | SAT-diff | _pending_ |
| AC6 | Membership page role dropdown shows **only** options from the Membership roles whitelist | Test 2 | — | Admin SPA | SAT-diff | _pending_ |
| AC7 | Assigning a role at the org level → **all employees inherit** those permissions without per-user assignment | Story | BL-B2B-005 | Backend + storefront | SAT-diff (`Organization.Roles`, `OrganizationRoleEntity`) | _pending_ |
| AC8 | `organization.contacts(roleIds:)` GraphQL filter returns only members holding a given role | Diff | — | xAPI | SAT-diff (`OrganizationType.cs`) | _pending_ |
| AC9 | Members page (`/company/members`) shows **all** of a member's roles (comma-joined), role-facet filter works, reset clears it; RoleIcon column removed; header label "Roles" (plural) | Diff | BL-B2B-005 | Storefront | SAT-diff (`members.vue`, `useOrganizationContacts`, locales) | _pending_ |
| AC10 | Org-scoped role / whitelist change mutates **only** the target org's membership — global `ApplicationUser.Roles` and other orgs untouched | **GAP** (regression guard) | BL-B2B-008 | Backend | GAP | _pending_ |
| AC11 | GraphQL contract change: `rolesInOrganization` / `isLockedInOrganization` no longer take `organizationId` arg (org context now implicit from token/userId) — existing consumers still resolve correctly | Diff | — | xAPI | **DRIFT-risk** | _pending_ |
| AC12 | Whitelist is enforced **server-side**, not just hidden in the dropdown — assigning a non-whitelisted role via API is rejected | **GAP** (security) | BL-AUTH-005 | Backend/API | GAP | _pending_ |
| AC13 | **User-level override:** a member with an inherited org role + own membership role sees the **union** of permissions; removing the user override leaves org-inherited perms intact | Story ("user-level override") | BL-B2B-005, BL-B2B-007 | Backend + storefront | GAP | _pending_ |

## Notes for execution
- **AC2/AC3 (JWT):** decode `/connect/token` access_token (org-scoped: `organization_id` param, snake_case). `pageContext.user.permissions` MUST equal the decoded JWT `permission[]` (BL-B2B-007, BUG-A history).
- **AC10/AC12/AC13** are the GAP/adversarial conditions — highest priority to verify live because the diff doesn't obviously cover them.
- **AC11** is the regression trap: verify the Members page + any other `rolesInOrganization` consumer still renders after the arg was dropped.
- Test data: admin `Password1!`; multi-org storefront user `@td(MULTI_ORG_USER_EMAIL)` / `@td(MULTI_ORG_TF_BR)`; never hardcode org/role IDs — discover live.

## Live reconciliation (Step 6b) — authoritative AC↔implementation verdicts

Backend phase (qa-backend-expert, playwright-edge) + storefront phase (qa-frontend-expert, playwright-chrome). All static "SAT-diff" suspicions closed against live behavior.

| # | Live verdict | Evidence |
|---|---|---|
| AC1 | **SATISFIED** | Member blade shows distinct Accounts(global)+Org-membership widgets; fresh user global `roles=[]` |
| AC2 | **SATISFIED** | JWT `permission[]` decoded == role set 1:1 (maintainer→11, employee→2), org-scoped `organizationId` claim |
| AC3 | **SATISFIED** | Org-level role add → re-issued JWT gained `marketing:read` (11→12); storefront relogin shows new role+perms; relogin-gated |
| AC4 | **SATISFIED** | Customer›Roles exposes both whitelists; save round-trips |
| AC5 | **N/A** | No org-level role dropdown exists on the storefront (org-level roles are Admin-only) — condition has no surface |
| AC6 | **CONTRADICTS (FAIL)** | Storefront Change-role + Invite dialogs list ALL roles, ignore the Membership whitelist {org-employee} → **JIRA Test 2 FAILS** |
| AC7 | **SATISFIED** | Org-level role in `rolesInOrganization` for all 6 TechFlow members incl. one with no membership role; removal revokes for all |
| AC8 | **SATISFIED** | `contacts(roleIds:["org-employee"])`→2; `[]`/omitted→full 6 |
| AC9 | **SATISFIED** | "Roles" plural header, RoleIcon removed, union comma-joined, facet narrows+resets |
| AC10 | **SATISFIED** | TechFlow org-role/whitelist change did not touch BuildRight or global `ApplicationUser.Roles`; no cross-org JWT leak |
| AC11 | **SATISFIED** (drift-risk cleared) | `rolesInOrganization`/`isLockedInOrganization` resolve with no `organizationId` arg; `/company/members` renders, no `errors[]` |
| AC12 | **BY-DESIGN** | Whitelist not server-enforced — verified against `customer#304` source: settings define `SettingDescriptor`s only, no mutation consumes them. UI-population feature, not a security boundary (F1). Not a defect; means whitelist has no enforcing consumer anywhere |
| AC13 | **SATISFIED** | Effective perms = union (deduped); **override-removal preserves org-inherited perms** (plausible strip-base bug absent) |

**Net:** 11 SATISFIED · 1 CONTRADICTS/FAIL (AC6 → Test 2) · 1 N/A (AC5) · AC12 by-design. The story's core (org-level inheritance, user-override union, JWT propagation BL-B2B-007 P0, org isolation) all PASS; the single failure is that the **role whitelist has no enforcing consumer** — its settings save but filter nothing (Admin SPA, storefront, and server all ignore them).
