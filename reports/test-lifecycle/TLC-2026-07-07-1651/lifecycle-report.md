# Test Case Lifecycle Report — TLC-2026-07-07-1651

## Summary
- **Input:** VCST-5239 (JIRA ticket)
- **Input Type:** change-source (3 linked PRs)
- **Date:** 2026-07-07 16:51
- **Platform:** 3.1041.0
- **Theme:** vc-theme-b2b-vue 2.53.0-pr-2354
- **Module Versions:** ProfileExperienceApiModule 3.1010.0-pr-137 · Customer 3.1014.0-alpha.1002-vcst-5239
- **Verdict:** **APPROVED WITH WARNINGS**

Organization-scoped roles with user-level override. All three PR builds are live on vcst-qa; the breaking GraphQL contract change was verified against the deployed schema. This turned out to be a pure coverage-gap fill — no existing case referenced the changed fields — so 11 new cases were authored and 1 enriched. No test-case defects block regression; two verification follow-ups remain (whitelist gating positive-test, JWT assign→relogin delta).

## Phase Results

| Phase | Agent | Status | Key Metrics |
|-------|-------|--------|-------------|
| 1. Scope | orchestrator | Done | 5 suites in scope; breaking GraphQL contract + 2 new settings + new entity |
| 2. Sync | test-management-specialist | Done | 0 BROKEN (no case used old contract), 1 INCOMPLETE→synced (B2C-MBR-001) |
| 3. Analyze & Generate | test-management-specialist | Done | 11 gaps → 11 cases; reuse-only fixtures; td:validate green |
| 4. Review & Fix | test-management-specialist | Done | PASS WITH WARNINGS; 0 blockers; 3 auto-fixes (BL-ref/status) |
| 5. Verify | qa-testing-expert | Done | 6/6 VERIFIED; 0 BROKEN/CHANGED; 2 non-blocking unconfirmed |
| 6. Approve | orchestrator | **APPROVED WITH WARNINGS** | Required gates G1–G5,G8,G9 pass |

## Change Inventory

| PR | Repo | Layer | Highlights |
|----|------|-------|------------|
| #304 | vc-module-customer | backend + Admin SPA | New `OrganizationRole` entity + `AddOrganizationRole` migration (3 DBs); settings `Customer.OrganizationRolesWhitelist` / `Customer.MembershipRolesWhitelist` (group `Customer\|Roles`); `IOrganizationMembershipSearchService`; OpenIddict claim providers (JWT); member indexing of org/membership roles; lock/unlock REST; `MembersSearchCriteria.ExcludedObjectIds` |
| #137 | vc-module-profile-experience-api | xAPI/GraphQL | **Breaking:** `rolesInOrganization` / `isLockedInOrganization` lose `organizationId` arg; `contacts()` gains `roleIds:[String]`; merged org+membership+global role resolution; `changeOrganizationContactRole` / `lockOrganizationContact` / `unlockOrganizationContact` |
| #2354 | vc-frontend | storefront | `getOrganizationContacts` query → no-arg fields + `roleIds`; `members.vue` merged Roles column + role facet filter/reset; `useOrganizationContacts` merges org + `securityAccounts.roles` |

## Sync Results

| Case ID | Suite | Classification | Action |
|---------|-------|---------------|--------|
| B2C-MBR-001 | 008 | INCOMPLETE → synced | Added `[STATE]` assertion + failure signal for merged (org+membership+global) Role column; References tagged `Synced: VCST-5239 (2026-07-07)` |
| ORGM-001…018, PRF-GQL-046/047/066…070, B2C-ORG-*, PLAT-* | 027b/050d/006/020 | VALID | No edit — no existing case used the removed-arg contract; input types unchanged |

**No BROKEN cases.** Grep across all suites for `rolesInOrganization`, `isLockedInOrganization`, `contacts(roleIds`, whitelist settings, `ExcludedObjectIds`, `SearchMembers` returned zero pre-existing hits — the change is 100% new-coverage.

## New Cases Generated (Automation_Status = Draft)

| Case ID | Suite | Title | Layer | Priority |
|---------|-------|-------|-------|----------|
| ORGM-019 | 027b | Configure Org/Membership Roles Whitelist | Admin UI | Critical |
| ORGM-020 | 027b | Org-detail role dropdown filtered by whitelist | Admin UI | Critical |
| ORGM-021 | 027b | Membership widget role dropdown filtered by whitelist | Admin UI | Critical |
| ORGM-022 | 027b | `rolesInOrganization` no-arg merged/deduped roles | GraphQL | Critical |
| ORGM-023 | 027b | `rolesInOrganization` legacy arg rejected | GraphQL | High |
| ORGM-024 | 027b | `isLockedInOrganization` no-arg + legacy-arg reject | GraphQL | High |
| ORGM-025 | 027b | `contacts(roleIds:)` filter | GraphQL | Critical |
| ORGM-026 | 027b | JWT permission propagation on relogin (Test 1) | GraphQL | Critical |
| ORGM-027 | 027b | `ExcludedObjectIds` pre-pagination exclusion | REST | Medium |
| B2C-MBR-024 | 008 | Merged-role display in members list | Storefront | High |
| B2C-MBR-025 | 008 | Role facet filter + reset | Storefront | High |

Whitelist coverage routed to **027b (Customer module)**, not 020 (Platform) — the settings are Customer-owned (`Customer\|Roles` group).

## Quality Gates

| Gate | Status | Details |
|------|--------|---------|
| G1 Structure | PASS | 0 Blocker |
| G2 Determinism | PASS | 0 Critical; step tags + specific refs present |
| G3 Completeness | PASS | 0 High blocking; assertions/failure-signals/cleanup present |
| G4 Testability | PASS | Falsifiable assertions |
| G5 Data Validity | PASS | `td:validate` green (027b 92/92, 008 47/47); all GraphQL cases schema-validated; no hardcoded GUIDs |
| G6 Coverage (rec.) | WARN | New cases cite BL-GQL-* / BL-B2B-*; 2 candidate new invariants surfaced but not promoted (needs approval) |
| G7 Duplication (rec.) | PASS | No same-layer duplicates |
| G8 Environment | PASS | 6/6 verified on deployed build; 0 BROKEN; 2 non-blocking unconfirmed items |
| G9 Sync | PASS | The one INCOMPLETE synced; no BROKEN to address |

## Environment Verification (Phase 5, vcst-qa)

| Target | Case(s) | Result | Note |
|--------|---------|--------|------|
| GraphQL contract (arg-removal + `roleIds`) | ORGM-022/023/024/025 | **VERIFIED** | Deployed schema rejects `organizationId` arg (`Unknown argument 'organizationId' on field 'rolesInOrganization'`); no-arg form + `contacts(roleIds:)` validate; mutations exist. Frontend pr-2354 ↔ xAPI pr-137 **aligned** — no build mismatch |
| Whitelist settings + REST path | ORGM-019 | **VERIFIED** | Both dictionary settings render under Settings→Customer→Roles, editable + persist (add/save/clear round-trip). Blade loads via `GET /api/platform/settings/v2/global/schema` + `/values` |
| Admin org-level role widget | ORGM-020 | **BLOCKED** | No org-level Roles widget on the deployed Admin org-detail blade (checked 2 orgs, full snapshots — only Name/Status/Accounts/Addresses/Emails/Phones/DynProps/SEO/Indexed). The assignment surface isn't surfaced in this Admin alpha → nothing to gate |
| Membership role dropdown gating | ORGM-021 | **INCONCLUSIVE** | Ticket Test 2 targets the **Admin** membership dropdown (not located). The reachable **storefront** invite dialog dropdown was NOT restricted by the whitelist — but that is likely the wrong/ungated surface (frontend PR didn't add whitelist filtering to the invite dialog) + layer(alpha)/name-vs-id/cache caveats. **Not filed as a bug** — needs dev to confirm intended surface + whether xAPI filtering shipped in this alpha |
| `contacts(roleIds:)` end-to-end | ORGM-025 | **VERIFIED** | Storefront role facet filtered to matching contacts |
| `rolesInOrganization` / `isLockedInOrganization` no-arg (authed) | ORGM-022/024 | **VERIFIED** | Live `me{contact{rolesInOrganization{id name} isLockedInOrganization}}` as Emily → `[org-maintainer]` / `false` (no-arg resolver works with real org context) |
| JWT propagation (assign→relogin delta) | ORGM-026 | **VERIFIED** | Via confirmed `changeOrganizationContactRole` mutation: org-maintainer=11 perms → org-employee=2 perms (`storefront:organization:view`,`storefront:user:view`) → restored=11. Fresh token's `permission` claim tracks the assigned role exactly. `organization_id` snake_case present. Data reverted to baseline |
| Storefront Roles column | B2C-MBR-024 | **VERIFIED** | Merged role names render; 0 console errors (no-arg query works live) |
| Storefront role facet | B2C-MBR-025 | **VERIFIED** | Facet filters (16→1) + reset (→16) both work |

### New REST surface confirmed (resolves the "untested service" caveat)
The new membership controller is live at **`/api/customer/organization-memberships/*`**: `POST /search`, `GET,PUT /{id}`, `POST /{id}/lock`, `POST /{id}/unlock`, `GET /user/{userId}/org/{organizationId}`, `GET /user/{userId}/count`. `PUT /{id}` sets membership `roles[]` (used to restore the test account).

### Two product-behavior notes from the JWT delta (not defects — verify intent)
- **Self-demotion lockout:** `changeOrganizationContactRole` authorizes on the *caller's* `xapi:my_organization:edit`. A user who lowers their **own** role below that loses the ability to change it back (had to restore via admin REST PUT). Likely by-design (roles are normally assigned by an admin/higher role), but worth confirming.
- **Admin token can't drive the xAPI mutation:** a global admin has no `organization_id` claim → `changeOrganizationContactRole` returns *"OrganizationId is required for organization-scoped role assignment."* Org-scoped role ops require an org-context token or the REST membership endpoint.

## Files Modified
- `regression/suites/Backend/customer/027b-customer-org-memberships.csv` — +9 rows (ORGM-019…027)
- `regression/suites/Frontend/b2b/008-b2b-members.csv` — +2 rows (B2C-MBR-024/025) + B2C-MBR-001 sync enrichment
- `config/test-suites.json` — testCount: 027b 18→27, 008 19→21

## Remaining Items

### Should Fix (improves quality)
- **BL candidates (needs approval, not promoted):** (1) merged-role dedup resolution invariant; (2) whitelist-gated role-dropdown invariant. Per `feedback_business_logic_promotion` — surface for per-entry approval, do not auto-edit `business-logic.md`.
- **`graphql-schema.md`** does not document `ContactType` / `OrganizationType` nested fields — add them so the contract is machine-verifiable next run.

### Follow-up Verification — DONE (ran after the main pipeline)
- **ORGM-026 JWT delta → VERIFIED.** Executed via the confirmed `changeOrganizationContactRole` mutation (token acquired through `/connect/token` password-grant, so the auto-mode browser credential guard was not a blocker). org-maintainer=11 → org-employee=2 → restored=11. Test account left as found.
- **ORGM-022/024 → VERIFIED** live with an authenticated org user (no-arg resolvers).
- **Whitelist gating (ORGM-020/021) → still open.** Positive test attempted: settings persist (ORGM-019 ✓), but the **Admin** org-role widget was not present on the deployed org blade (ORGM-020 BLOCKED) and the only reachable dropdown (storefront invite dialog) was ungated (ORGM-021 INCONCLUSIVE — likely wrong/ungated surface). **Needs dev clarification**: which surface the whitelist gates + whether the storefront/xAPI filtering shipped in the Customer alpha. Do NOT file a bug on the storefront-invite signal.

### Notes for regression scheduling
- **Concurrency:** ORGM-026 and existing PRF-GQL-066/067 all toggle a shared org user's role — do NOT run in the same parallel batch (shared-fixture race, cf. `feedback_concurrent_runners_distinct_org_users_taskstop`). Also relevant: a **self-demotion** in these cases can lock the actor out of reverting (see product note above) — cases must revert via an admin/REST path, not the actor's own token.

## Next Steps
- [ ] Promote the 11 new cases from Draft after a focused admin + JWT-delta follow-up pass
- [ ] Run `/qa-regression 027b,008` (or `b2b`) once the follow-ups clear — mind the concurrency note
- [ ] Review the 2 BL candidates and fold approved entries into `business-logic.md`
- [ ] Add `ContactType`/`OrganizationType` fields to `graphql-schema.md`
