# BUG — Storefront `/company/members` Roles column shows the merged multi-org role union, not the per-org membership role · High

**Env:** vcst-qa @ Platform 3.1051.0 · Customer 3.1021.0-pr-312-2257 · ProfileExperienceApi 3.1015.0-pr-141-d7d8 · Theme 2.55.0-pr-2399-845a
**Found by:** `/qa-regression` REG-2026-07-30-1040, suite 027 (CUST-089) · triaged `REAL_BUG`
**BL:** BL-B2B-005, BL-B2B-008

## Summary

The `/company/members` Roles column renders the member's **global/merged** role set — the union across
every organization they belong to — instead of the role they hold in the **currently viewed** organization.
This is systemic (every row affected), not a one-off, and is an org-isolation/info-disclosure concern: a
TechFlow admin can see a member's role in an unrelated org (e.g. BuildRight) through the TechFlow roster.

## Steps to reproduce

1. Invite a new user to TechFlow with `roleIds:[org-employee]` **only** (`POST /api/members/customers/invite`).
2. Confirm via REST (`organization-memberships/search`) the row is created with `roles=[org-employee]` and
   nothing else — all four REST assertions pass.
3. Open `/company/members` as a TechFlow maintainer and read that member's Roles cell.
4. Compare against a known multi-org member (e.g. `AgentTest MultiOrg`) whose **TechFlow** membership holds
   only `org-maintainer`.

## Expected vs actual

**Expected:** the Roles cell for the new invite reads `Organization employee` only; the multi-org member's
TechFlow row reads `Organization maintainer` only.

**Actual:** the new invite's row reads **"Purchasing agent, Organization employee"** — `Purchasing agent`
was never requested. The multi-org member's row reads **"Purchasing agent, Organization employee,
Organization maintainer"** — none of which is scoped to the TechFlow membership record alone.

![Roles column not org-scoped](../../regression/REG-2026-07-30-1040/screenshots/CUST-089-FAIL-storefront-roles-not-org-scoped.png)

Cross-check: under an admin (org-less) token, the `rolesInOrganization` field itself returns `null` and
`organizationsIds` is `[]` even though REST confirms `contact.organizations=[TechFlow]` — so the field
requires an org-scoped session to resolve at all, and even then appears to return the union rather than a
per-org slice.

## Root cause (shared with an existing finding)

Likely the same underlying source as `BUG-change-role-dialog-preselects-org-level-role.md`, which already
documented that `rolesInOrganization` returns "the merged union of org-level + membership + global roles"
and that the Change-role dialog pre-checks `rolesInOrganization[0]`. This bug shows the **Roles column**
renders the **whole** merged array rather than filtering to the org currently in context — the same
underlying field, a different consumer. Recommend fixing both from one root-cause change: derive the
column (and the dialog pre-check) from the membership record scoped to the active organization, not the
global merged list.

## Fix Routing

- **Layer:** L1 storefront (Vue), possibly L3 xAPI if `rolesInOrganization` itself needs to become org-scoped
- **Repo:** `vc-frontend` (`useOrganizationContacts.ts` / members grid) — cross-check `vc-module-profile-experience-api`'s `rolesInOrganization` resolver
- **Suggested fix:** scope the Roles column to the membership record for the currently active organization
  instead of the merged `rolesInOrganization` array.
- Do NOT auto-merge — human review required.

## Test-case note (routed separately, not part of this draft)

`CUST-089`'s own xAPI verification leg queried a non-existent `ContactType.organizationMemberships` field
(schema error: "Cannot query field 'organizationMemberships'..."). Corrected in
`regression/suites/Backend/customer/027-customer-orgs-invites.csv` this run (see triage report) to use the
real fields (`statusInOrganization`, `isLockedInOrganization`, `rolesInOrganization`, `organizationsIds`) —
a `TEST_STEPS_DEFECT`, unrelated to the product bug above, which was confirmed independently via the
storefront UI and REST.
