# VCST-5239 Testing Checklist — Organization-scoped roles with user-level override

Scoped checklist only (no RTM/TestRail CSV). Spine = 13 atomic ACs in `ac-analysis.md`. Format per item:
`[ ] <AC#> — <action> → <expected> (BL-ref, suite-case-id or GAP)`.

Test data: admin actor = `[AUTH role=ADMIN_DEFAULT]` (ORGM-* convention) / `{{ADMIN_USERNAME}}`+`Password1!`; TechFlow org-maintainer storefront actor = `{{ORG_USER_EMAIL}}`/`{{ORG_USER_PASSWORD}}`; cross-org override target = `@td(MULTI_ORG_TF_BR.email)` / `@td(MULTI_ORG_TF_BR.password)` / `@td(MULTI_ORG_TF_BR.userId)` / `@td(MULTI_ORG_TF_BR.org_techflow_id)`. Never hardcode org/role/user IDs — resolve live where no alias exists (org-level role IDs, whitelist entries are NEW entities this ticket introduces and have no `@td()` alias yet — discover via live-discover / GraphiQL introspection, do not invent GUIDs).

---

## Block A — Backend / Admin-SPA / GraphQL (assign: qa-backend-expert)

**Setup / discovery (do first, before AC items below)**
- [ ] Introspect live xAPI schema for the new org-level-role and whitelist surface (`Organization` type roles field, `changeOrganizationRole`/equivalent mutation, `Customer` module Roles settings keys) via GraphiQL at `{{BACK_URL}}/ui/graphiql` — the committed `.claude/knowledge/api/graphql-schema.md` snapshot predates this PR and does NOT yet list these fields. Record actual field/mutation names before writing runner-native cases (GAP — no suite yet, this ticket's fields are absent from the schema snapshot).

**AC1 — Admin views Global + Membership roles; user carries only the set roles**
- [ ] AC1 — Open a test contact's member blade in Admin SPA (`{{BACK_URL}}` Customer module), inspect Global roles panel + Organization memberships widget → confirm both are visible and distinct sections (BL-AUTH-005; extends `CUST-063` which only covers per-org **membership**-role assignment, not the Global-roles panel — GAP for the dual-panel view)
- [ ] AC1 — REST: `GET {{BACK_URL}}/api/platform/security/users/{userId}` for a freshly-provisioned AGENT-TEST user with exactly one membership role set → assert `roles`/claims contain only that role, no residual defaults (BL-AUTH-005; reuse ORGM-001..004 setup pattern from `027b-customer-org-roles.csv`, but those assert membership-role change only — extend to assert **no extra roles leaked**, GAP)

**AC2 — JWT `permission[]` == permissions derived from roles (jwt.io decode)**
- [ ] AC2 — `POST {{BACK_URL}}/connect/token` for the AC1 fixture user with `organization_id` param (snake_case, per `reference_connect_token_org_scoped`) → decode `access_token` at jwt.io (or JS `atob` on payload segment) → assert decoded `permission[]` is exactly the permission set mapped from the assigned role(s), no more, no fewer (BL-B2B-007 P0, BL-AUTH-005; `032-auth-session-rbac.csv` line 8 only asserts the token IS a JWT, never decodes/matches `permission[]` — GAP, this is the authoritative Test-1 oracle)
- [ ] AC2 — Cross-check: `GET {{BACK_URL}}/api/platform/security/users/{userId}` role→permission mapping vs the decoded JWT claims for the same user — must match 1:1 (BL-B2B-007 — GAP)

**AC3 (setup + JWT half) — Add org-level role, Save, confirm server-side before handing to storefront relogin**
- [ ] AC3 — In the org blade (Customer module), add a NEW organization-level role to the org → Save → assert success toast + persisted (BL-B2B-005 — GAP, org-LEVEL role assignment is the new surface this ticket introduces; `CUST-063`/`ORGM-001..004` only cover per-member **membership** role change, not an org-level role attached to the org record itself)
- [ ] AC3 — Re-issue `/connect/token` for a member of that org who did NOT have the role individually assigned → decode JWT → assert the new org-level role's permissions now appear in `permission[]` (BL-B2B-007, BL-B2B-005 — GAP, this is the server-side half of Test 1; storefront relogin/visibility half is in Block B)

**AC4 — Customer › Roles settings expose Organization + Membership role whitelists**
- [ ] AC4 — Navigate Admin SPA Customer module → Roles settings (or wherever `ModuleConstants` +20 settings surface) → assert an "Organization roles whitelist" control and a "Membership roles whitelist" control both exist and are independently editable (BL-AUTH-005 — GAP, brand-new settings UI; no existing suite touches Customer-module role settings at all — `020-021*` covers platform Users/Roles module, not this Customer-specific whitelist)
- [ ] AC4 — Save each whitelist with a distinct role subset → reload the settings page → assert persistence (round-trip) (GAP)

**AC5 — Organization-managing page role dropdown limited to Organization whitelist**
- [ ] AC5 — With Organization whitelist restricted to a 2-role subset (e.g. exclude one normally-available role), open the org-level role-assignment dropdown on the org blade → assert only the whitelisted roles are selectable options (BL-AUTH-005 — GAP)
- [ ] AC5 — Boundary: set the Organization whitelist to a single role → dropdown shows exactly one option, no "none" fallback that silently allows all roles (BVA — GAP)

**AC6 — Membership page role dropdown limited to Membership whitelist**
- [ ] AC6 — With Membership whitelist restricted, open the per-member role-assignment dropdown (Admin SPA member blade org-membership widget, the surface `CUST-063` exercises today) → assert dropdown options are filtered to the Membership whitelist only, independent of the Organization whitelist set in AC5 (BL-AUTH-005 — GAP; `CUST-063` predates whitelisting and shows an unfiltered dropdown)

**AC7 — Org-level role assignment is inherited by ALL employees without per-user assignment**
- [ ] AC7 — Assign an org-level role to TechFlow → without touching any individual membership, query 2+ distinct TechFlow members' effective permissions (REST `GET /api/members/{id}` or JWT decode per member) → assert all inherit the org-level role's permissions (BL-B2B-005 — GAP, this is the story's core new behavior; `ORGM-*` and `CUST-063` only ever change ONE member's role at a time, never an org-wide inherited grant)
- [ ] AC7 — Remove the org-level role from the org → re-check the same members → assert the inherited permission is revoked from all of them simultaneously (BL-B2B-005 — GAP)

**AC8 — `organization.contacts(roleIds:)` filter returns only members holding the given role**
- [ ] AC8 — GraphQL: query `organization.contacts(roleIds: [<whitelisted-role-id>])` (verify exact field/arg name against live schema from the Setup step) with a mix of members holding/not-holding the role → assert result set contains only role-holders (BL-B2B-005 — related to `B2C-MBR-025`'s `$roleIds` param on `getOrganizationContactsQuery`, but that case is the storefront consumer of the filter, not a direct backend/schema-level assertion of `organization.contacts` filter correctness at the xAPI layer — treat as a **new backend case**, GAP)
- [ ] AC8 — `roleIds: []` / omitted → assert full unfiltered contact list returned (no accidental empty-set-matches-none semantics) (EP — GAP)

**AC10 [adversarial/GAP] — Org-level role / whitelist change mutates only the target org**
- [ ] AC10 — Assign an org-level role to TechFlow only → assert BuildRight (or any other org sharing the AC7 fixture member) shows NO inherited permission change (BL-B2B-008; direct analog of `ORGM-004`'s isolation pattern in `027b-customer-org-roles.csv`, but ORGM-004 tests **membership**-role isolation — repeat the same technique for the NEW **org-level** role surface, GAP)
- [ ] AC10 — Change TechFlow's Organization/Membership whitelist → assert BuildRight's whitelist settings are unaffected (independent settings objects, not a shared global) (BL-B2B-008 — GAP)
- [ ] AC10 — Global `ApplicationUser.Roles` / global lockout state must NOT be touched by an org-level role or whitelist change — reuse the `GET {{BACK_URL}}/api/platform/security/users/{userId}/locked`-style global guard pattern from `ORGM-006`/`ORGM-009` (BL-AUTH-003 analog, BL-B2B-008 — GAP)

**AC11 [regression] — GraphQL contract change: `rolesInOrganization`/`isLockedInOrganization` drop the `organizationId` arg**
- [ ] AC11 — Diff/introspect: confirm `rolesInOrganization` and `isLockedInOrganization` no longer accept an explicit `organizationId` argument (org context now implicit from token/userId) against the live schema (DRIFT-risk — GAP, static introspection check)
- [ ] AC11 — Run every EXISTING query that previously passed `organizationId` to these fields (check `050d-graphql-xprofile.csv` and any `027*` GraphQL cases referencing these fields) → assert they still resolve correctly with the arg omitted, i.e. no `errors[]` from a stale query shape held in a test fixture or client cache (regression trap called out explicitly in `ac-analysis.md` notes — GAP, no suite currently exercises these two fields by name)
- [ ] AC11 — Multi-org actor (`@td(MULTI_ORG_TF_BR)`) with an org-scoped JWT for TechFlow calls `rolesInOrganization`/`isLockedInOrganization` with NO arg → assert the org context resolved is TechFlow (from token), not BuildRight or a wrong default (BL-B2B-007 — GAP)

**AC12 [adversarial/GAP] — Whitelist enforced server-side, not just hidden in dropdown**
- [ ] AC12 — With a role explicitly EXCLUDED from the Organization whitelist, attempt to assign that role via direct GraphQL mutation / REST call (bypassing the Admin SPA dropdown entirely) → assert the server REJECTS the assignment (non-empty `errors[]` / 4xx), it must not silently succeed just because the UI hid the option (BL-AUTH-005 — GAP, security-critical; this is exactly the kind of gap the `/qa-checklist` error-guessing technique targets — "what if the client bypasses the widget")
- [ ] AC12 — Same probe for the Membership whitelist: assign a non-whitelisted role to a member via `changeOrganizationContactRole` GraphQL mutation directly → assert rejection (BL-AUTH-005 — GAP)
- [ ] AC12 — Whitelist changed AFTER a non-whitelisted role was already assigned to a member/org (no retroactive purge expected, but re-attempting to re-assign the same now-excluded role must still be rejected) (State Transition — GAP, also listed under Exploratory hooks below)

**AC13 (backend/permission-union half) — User-level override: union of org-inherited + membership permissions**
- [ ] AC13 — Member has an org-inherited role (via AC7) AND their own distinct membership role → query effective permissions (JWT decode or `GET /api/members/{id}`) → assert the permission set is the UNION of both, not just one or the other (BL-B2B-005, BL-B2B-007 — GAP, this is the story's "user-level override" clause and has zero direct diff coverage per `ac-analysis.md`)
- [ ] AC13 — Remove the user-level membership-role override → assert the member RETAINS the org-inherited permissions (the override's removal must not also strip the inherited grant) (BL-B2B-005 — GAP, this is the sharpest "what did the PO not consider" edge: override-removal accidentally deleting the inherited base is a highly plausible implementation bug in a union-merge)
- [ ] AC13 — Conflicting grant: org-level role explicitly restricts something the user's own membership role would allow (or vice versa) — determine and assert which wins per the implemented precedence (union is asserted above; if the diff implements a "deny wins" or "most-restrictive-wins" rule instead of pure union, this test will surface the actual contract) (BL-B2B-005 — GAP, error-guessing)

---

## Block B — Storefront (assign: qa-frontend-expert)

**AC3 (relogin + visibility half)**
- [ ] AC3 — After Block A adds the new org-level role and Saves it server-side, sign in on storefront as a TechFlow member who inherits it ONLY via the org-level grant (no direct membership assignment) using `{{ORG_USER_EMAIL}}`/`{{ORG_USER_PASSWORD}}` or an org-scoped fixture member → assert the NEW role now appears in the member's visible role/permission surface post-relogin (e.g. `/company/members` own-context features, gated buttons) (BL-B2B-005, BL-B2B-007 — GAP; this is the storefront half of the authoritative Test 1 script — "relogin on storefront → confirm new role AND its permissions now appear")
- [ ] AC3 — Confirm the role change is NOT visible without relogin (stale session) — i.e. permissions are re-derived at token issuance, not live-pushed to an open session; document actual behavior either way (relogin-timing edge, also listed in Exploratory hooks)
- [ ] AC3 — Cross-layer: the storefront-visible permission set for this session must equal the JWT `permission[]` decoded in Block A's AC2/AC3 check for the SAME session (BL-B2B-007 P0 — the `pageContext.user.permissions == decoded-JWT` invariant called out explicitly in the assignment brief; historical BUG-A regression class per `feedback_visibility_fix_can_expose_init_errors` / `B2C-MBR-023` notes — GAP as a **direct assertion**, though `B2C-MBR-023`'s BUG-A note documents the general pattern for membership-role empty-permissions, not this org-level-role path)

**AC9 — Members page merged-roles display + facet filter + reset + header label**
- [ ] AC9 — `/company/members` Role column shows the MERGED set (org-level + membership + global) deduped, comma-joined, per member — covered by `B2C-MBR-001` (updated 2026-07-07 sync note) and `B2C-MBR-024` in `008-b2b-members.csv`; confirm those still pass against the actual VCST-5239 build (`3.1041.0` / `customer 3.1014.0-alpha.1002-vcst-5239`) since they were written from the diff, not live-verified (SAT-diff → verify live)
- [ ] AC9 — Role-facet filter narrows the list to members holding a selected role, and reset restores the full list — covered by `B2C-MBR-025` (`008-b2b-members.csv`); live-verify against this build, including the case's noted empty-state-copy assertion
- [ ] AC9 — Confirm RoleIcon column is REMOVED and the header label reads "Roles" (plural) per the diff description — not explicitly asserted as a standalone item in `B2C-MBR-001/024/025`; add a quick visual/DOM check (header text = "Roles", no icon-only role column remains) (GAP — small, but a literal AC clause with no direct case)
- [ ] AC9 — A member holding an org-level-inherited role (new AC7 surface) ALSO shows correctly in this merged display — `B2C-MBR-024`'s merge assertion was written against membership+global roles only (per its Preconditions note); re-verify the merge also picks up the NEW org-level role source (GAP for the org-level-role variant specifically)

**AC13 (storefront visibility half) — union of permissions visible to the user**
- [ ] AC13 — Storefront: a member with both an org-inherited role and their own membership role sees the UNION reflected in gated UI (e.g. Invite button, Edit role / Block actions on `/company/members`, per the maintainer-action gating pattern in `B2C-MBR-023`) — not just whichever role happens to render first (BL-B2B-005 — GAP)
- [ ] AC13 — After the user-level override is removed (Block A action), the SAME storefront session (post-relogin) still shows org-inherited gated actions — i.e. the storefront-visible permission set doesn't collapse to zero (BL-B2B-005 — GAP, storefront mirror of the Block A override-removal check)

**AC11 (consumer-still-renders regression check)**
- [ ] AC11 — `/company/members` (which consumes `rolesInOrganization`/`isLockedInOrganization` under the hood via `useOrganizationContacts`) still renders correctly end-to-end after the arg was dropped from those fields — no console GraphQL error, no blank Role/Active columns (regression; direct frontend consumer of the AC11 contract change flagged in `ac-analysis.md` — GAP as an explicit assertion, though `B2C-MBR-001/024` incidentally exercise the same query surface)

---

## Block C — Exploratory hooks (assign: qa-testing-expert, `/qa-sbtm`-style session)

- [ ] Whitelist edge case: EMPTY Organization whitelist saved (zero roles selected) — does the org-level role dropdown show nothing (locking out org-level role assignment entirely) or fall back to "allow all" (a likely security gap mirroring AC12)?
- [ ] Whitelist edge case: a role is REMOVED from the whitelist AFTER it was already assigned to an org/member — does the existing assignment stay intact, get silently revoked, or surface as an inconsistent/error state in the Admin SPA dropdown (shows a value not in its own option list)?
- [ ] Whitelist edge case: the SAME role ID appears in both the Organization whitelist and the Membership whitelist — confirm no cross-contamination (e.g. adding it to one doesn't implicitly add it to the other) and no duplicate-option rendering in either dropdown.
- [ ] Duplicate-role guard: attempt to add the SAME org-level role to an org twice (double-click Save, or race two admin sessions) — confirm no duplicate `OrganizationRoleEntity` rows and no doubled permission entries in the JWT.
- [ ] Contract-change adjacent screens: sweep other Admin SPA / storefront screens that might indirectly touch `rolesInOrganization`/`isLockedInOrganization` beyond `/company/members` (e.g. any org-switcher role display, impersonation flow per `082-auth-impersonation.csv`, invite-flow role preview) for the same dropped-arg regression as AC11.
- [ ] Relogin timing/caching: how long after Admin Save does a storefront session need to relogin before the org-level role takes effect — is it truly relogin-gated (per Test 1's explicit script) or does an already-open tab eventually pick it up via a background token refresh / Apollo cache invalidation? Cross-ref `feedback_apollo_cart_shipment_stale_data` for a known stale-cache pattern in this codebase.
- [ ] Session-of-record ambiguity: if the SAME user is logged into TWO org contexts in two tabs (multi-org user, `@td(MULTI_ORG_TF_BR)`) and an org-level role changes for org A only, confirm tab B (org B context) is unaffected and tab A requires its own independent relogin.
- [ ] Permission union order-of-operations: assign the user-level override BEFORE vs AFTER the org-level role exists — confirm the resulting union is the same regardless of assignment order (should be, if it's a true set union and not a sequential-merge-with-overwrite bug).

---

## Coverage gaps requiring NEW regression suite authoring (out of scope for this checklist, flag for follow-up)

`027b-customer-org-roles.csv` (Backend/GraphQL) and `008-b2b-members.csv` (Frontend) need new runner-native / journey cases for: org-level role CRUD + inheritance (AC7), whitelist settings CRUD + dropdown filtering (AC4/AC5/AC6), JWT-decode permission-match assertion (AC2/AC3), server-side whitelist enforcement (AC12), org-isolation for org-level roles (AC10), and permission-union override behavior (AC13). None of these exist as cases today — every GAP item above is a genuine hole, not a mis-mapping.
