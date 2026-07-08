# VCST-5239 — Storefront Test Execution Report (Frontend)

**Env:** vcst-qa @ Platform `3.1041.0`, Customer `3.1014.0-alpha.1002-vcst-5239`, ProfileExperienceApi `3.1010.0-pr-137`, **Theme `2.53.0-pr-2354`** (PR under test, confirmed in footer). Browser: playwright-chrome, en-US.
**Scope:** Block B (storefront) + reframed AC5/AC6 + Block C storefront hooks.
**Verdict:** Storefront role-model behavior is correct across AC3/AC9/AC11/AC13. **Test 2 (whitelist → dropdown) FAILS** — 1 bug filed. BL-B2B-007 [P0] parity holds.

## Per-AC verdict

| AC | Verdict | Evidence / oracle |
|----|---------|-------------------|
| AC3 (relogin visibility) | **PASS** | Fresh sign-in as `agent-test-multiorg-...` (TechFlow ctx) → new org-level role `AGENT-TEST-OrgLevel-5239` appears in `/company/members` merged display; its perms present in pageContext. |
| AC3 (relogin-gating) | **PASS (documented)** | Permissions are re-derived at token issuance — a fresh login reflects the org-level role. Live-push-to-open-session negative case not exercised (would require an Admin mutation during an open session; read-only on Admin, fixtures must not change). No evidence of live push; consistent with relogin-gated design. |
| AC3 cross-layer — **BL-B2B-007 [P0]** | **PASS** | `GetPageContext.user.permissions` = **12 perms** incl. the 2 org-inherited (`marketing:read`, `xapi:my_organization:order:view`), == backend-decoded JWT 12-perm union. **No BUG-A divergence** (pageContext not empty). |
| AC5 (storefront org-level role dropdown) | **N/A (no surface)** | No org-level role-assignment UI on storefront (`/company/info` = name/logo/addresses only). Org-level roles are Admin-only. Not a defect. |
| AC6 (storefront membership dropdown → Membership whitelist) | **FAIL** | "Change role" dialog AND "Invite member" dropdown both list all 3 org roles (employee, purchasing-agent, maintainer); Membership whitelist `{org-employee}` not applied. → **Test 2 fails.** Bug filed. |
| AC9 (merged roles + facet + reset + header) | **PASS** | Header "**Roles**" (plural); **no RoleIcon column**; each member's roles comma-joined incl. the org-level role (union of org-level + membership + global, global `[]`); role facet narrows (Purchasing agent → David Kim only); Reset restores all 6. |
| AC11 (consumer renders after dropped `organizationId` arg) | **PASS** | `GetOrganizationContacts` queries `rolesInOrganization`/`isLockedInOrganization` with **no** `organizationId` arg; response 200, no `errors[]`, `totalCount:6`; org context implicit resolved to TechFlow (`96f109a7…`). Page renders end-to-end, no blank Role/Active cells, no console GraphQL error. |
| AC13 (storefront union) | **PASS** | Union user shows `AGENT-TEST-OrgLevel-5239, Organization maintainer` + full maintainer gated actions (Edit role / Block / Delete / Login on behalf / Invite) — union, not first-role-only. |
| AC13 (override-removed storefront) | **PASS** | `agent-test-5239-emp-...` pageContext.permissions = exactly `["marketing:read","xapi:my_organization:order:view"]` (2 inherited, **non-zero**); membership `roles=[]`, global `[]`. Read-only members roster visible; Invite/Actions correctly hidden. Inherited grant survived override removal. |

## BL invariant results
- **BL-B2B-007 [P0]** — PASS. pageContext perms == decoded JWT perms for both the 12-perm union user and the 2-perm override-removed user; org-scoped to TechFlow.
- **BL-B2B-005** — PASS. Feature visibility follows the effective (union) permission set: maintainer sees mgmt actions; override-removed inherited-only user sees read-only roster, no mgmt actions.
- **BL-AUTH-005** — PASS (permission-gated visibility). The whitelist "restrict dropdown" clause is unmet (see bug), but permission gating itself works.
- **BL-AUTH-006** — N/A (flat B2B roles, no hierarchy exercised).

## Bugs filed
| Title | Severity | File |
|-------|----------|------|
| Role whitelists do not filter storefront role-assignment dropdowns (Test 2 fails) | Medium / P2 (triage may → P3) | `reports/bugs/BUG-VCST-5239-whitelist-storefront-dropdown-unfiltered.md` |

## AC5 / AC6 whitelist-dropdown verdict (decides Test 2)
**Test 2 = FAIL.** The whitelist feature has **no enforcing consumer** anywhere observable: server-side not enforced (backend F1), Admin SPA dropdowns unfiltered (backend), and the storefront membership dropdowns (Change role + Invite) are unfiltered (AC6 FAIL). AC5's org-level dropdown does not exist on the storefront. The whitelist settings are inert.

## Exploratory findings (Block C)
1. **Observation** — Reduced-permission member (`org:order:view` + `marketing:read`, no `organization:view`) can still load `/company/members` and see the full roster (names/emails/roles). Likely by-design (roster is a basic org-member view; only management actions are gated) — not filed; would need design-intent confirmation to escalate.
2. **Observation** — The AC9 role facet lists 5 roles (Organization maintainer/employee, Purchasing agent, Store administrator, Store manager) but **not** the custom org-level role `AGENT-TEST-OrgLevel-5239` that every member holds — so the inherited org-level role cannot be filtered via the facet. Facet appears sourced from a standard/assignable role list, not the members' actual role set. Minor; not filed.
3. **Observation** — Account menu exposes an org switcher (TechFlow/BuildRight); org context (nav shows "AGENT-TEST-Org-TechFlow-20260310") and the members query (`organization.id = 96f109a7…`) both stay TechFlow-scoped — no cross-org leak in the single-tab session. Two-tab session-of-record ambiguity not exercised (single browser context).
4. **Risk** — AC3 live-push-to-open-session (relogin-gating negative case) and two-tab multi-org isolation were not driven (require Admin mutations mid-session / a second context). Behavior observed is consistent with relogin-gated re-derivation, but the negative path is unverified.

## Notes
- Benign console errors only: 404s on `AGENT-TEST-CFG-019-*.png` catalog images (unrelated). No GraphQL `errors[]`, no 4xx/5xx on any org/role query.
- Cross-layer perm inspection used the storefront's own `GetPageContext`/`GetOrganizationContacts` network responses (observation, not UI bypass).
- Evidence: `tests/Sprint-current/VCST-5239/screenshots/VCST-5239-*.png`.
