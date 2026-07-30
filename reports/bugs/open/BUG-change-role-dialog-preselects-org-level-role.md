# BUG — "Change role" dialog pre-selects the organization-level role, not the member's own role · High

**Env:** vcst-qa @ Platform 3.1051.0 · Customer 3.1021.0-pr-312-2257 · ProfileExperienceApi 3.1015.0-pr-141-d7d8 · Theme 2.55.0-pr-2399-845a
**Found by:** `/qa-regression` REG-2026-07-30-1040, suite 008 (B2C-MBR-008, B2C-MBR-019) · triaged `REAL_BUG`
**BL:** BL-B2B-005

## Summary

On `/company/members`, Actions → **Edit role** opens a "Change role" dialog whose pre-checked radio is the
organization's first **org-level** role rather than the member's own membership role. Every TechFlow member's
dialog reports the same "current role" regardless of what they actually hold, so a permissions screen
misinforms the operator at the moment they change permissions.

## Steps to reproduce

1. Ensure the organization carries an org-level role that differs from a given member's membership role.
   TechFlow's org-level roles are `[purchasing-agent, org-employee]`
   (`GET {BACK_URL}/api/organizations/96f109a7-9010-4691-b6a1-bef25cca3d04` → `roles[]`).
2. Sign in to the storefront as that org's maintainer and open `/company/members`.
3. Pick a member whose **own** membership role is `org-maintainer` — e.g. `agent-test-multiorg-20260615@yopmail.com`
   (`POST {BACK_URL}/api/customer/organization-memberships/search {userId}` → `roles: [org-maintainer]`).
4. Click **Actions → Edit role**.
5. Observe which radio is pre-checked.

## Expected vs actual

**Expected:** the pre-checked radio is the member's current org-scoped role, `Organization maintainer`.
**Actual:** `Purchasing agent` is pre-checked — TechFlow's first org-level role.

Reproduced on 4 members in one run, spanning two different membership roles — all pre-checked `Purchasing agent`:

| Member | Own membership role | Roles column | Pre-checked |
|---|---|---|---|
| `AGENT-TEST-mbr008-…` (throwaway) | `org-employee` | Purchasing agent, Organization employee | **Purchasing agent** |
| `agent-test-multiorg-20260615@yopmail.com` | `org-maintainer` | + Organization maintainer | **Purchasing agent** |
| `AGENT-TEST-invite-5028@…` (accepted invite) | `org-employee` | Purchasing agent, Organization employee | **Purchasing agent** |
| same, after role edit | `org-maintainer` | + Organization maintainer | **Purchasing agent** |

![Change role dialog pre-checks Purchasing agent for an org-maintainer member](../../regression/REG-2026-07-30-1040/screenshots/B2C-MBR-008-FAIL-change-role-wrong-current-role.png)

## Root cause (hypothesis)

Since VCST-5239 (vc-frontend#2354 / vc-module-profile-experience-api#137) `rolesInOrganization` returns the
**merged union** of org-level + membership + global roles. The radio group appears to initialise from
`rolesInOrganization[0]` — the org-level head of that merged list — instead of the member's membership role.

Supporting evidence: not reproducible in BuildRight, whose org-level `roles` array is empty, so there the merged
list collapses to the membership role and the pre-selection looks correct. The mutation itself is well-formed and
correctly org-scoped — `ChangeOrganizationContactRole` sends
`{command:{memberId, roleIds:['org-maintainer']}}` with **no** `organizationId` (org taken from the JWT) and returns
`{succeeded:true, errors:[]}`. Note `roleIds` is an **array** while the dialog is single-select radio.

## Impact

`Save` stays disabled until a *different* radio is picked, so a pure accidental no-op overwrite is prevented.
But every deliberate edit starts from a false baseline: an admin who wants to keep `Organization maintainer`,
sees `Purchasing agent` pre-checked, and "corrects" it will silently demote the member. Conversely an operator
auditing roles through this dialog will conclude a maintainer is only a purchasing agent.

## Not a duplicate

Checked `reports/bugs/` (no existing draft) and the full 13-item `bugs_pending_confirmation` list plus screenshot
set in `reports/tickets/Sprint26-15/VCST-5281/` — this defect is absent from both.

## Fix Routing

- **Layer:** L1 storefront (Vue)
- **Repo:** `vc-frontend`
- **Anchor:** the members-page role editor (`members.vue` / `useOrganizationContacts.ts`), role-radio initialisation
- **Suggested fix:** initialise the radio from the member's membership role (the org-scoped assignment) rather than
  `rolesInOrganization[0]`; consider surfacing inherited org-level roles read-only so the two are not conflated.
- Do NOT auto-merge — human review required.
