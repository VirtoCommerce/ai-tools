# BUG — /company/members Role facet is a static list: omits inherited roles members hold, offers roles nobody holds · Medium

**Env:** vcst-qa @ Platform 3.1051.0 · Customer 3.1021.0-pr-312-2257 · ProfileExperienceApi 3.1015.0-pr-141-d7d8 · Theme 2.55.0-pr-2399-845a
**Found by:** `/qa-regression` REG-2026-07-30-1040, suite 008 (B2C-MBR-031; AC-2 half also seen in B2C-MBR-025) · triaged `REAL_BUG`
**BL:** BL-B2B-005 · Story EPIC-5239-05 AC-1 + AC-2

## Summary

The Members filters **Role** facet is sourced from a static role list rather than the roles members actually hold.
It therefore **omits** a role members visibly hold via org-level inheritance, and **offers** a role nobody holds
(a guaranteed dead-end filter). Since VCST-5239 made the Roles *column* show the merged union, the column and the
facet now disagree about which roles exist in the org.

## Steps to reproduce

1. Append an org-level role to the organization — capture the existing array first and append, never replace:
   `GET {BACK_URL}/api/organizations/{orgId}` → `roles[]`, then
   `PUT {BACK_URL}/api/organizations` with `[...$ORIGINAL_ROLES, {organizationId, roleId:'org-manager', roleName:'Organization manager'}]`.
2. Create a member of that org whose only **membership** role is `org-employee`, with no global account role.
3. Sign in as an org maintainer, open `/company/members`, confirm that member's **Roles** column renders
   `Organization manager` — i.e. they hold it by inheritance.
4. Click **FILTERS** and inspect the Role checkbox list.

## Expected vs actual

**Expected:** `Organization manager` is a selectable Role facet option and selecting it returns that member;
no offered option yields zero results.

**Actual:** the Role facet lists only `Organization maintainer / Organization employee / Purchasing agent /
Store administrator / Store manager`.

- **AC-1 fails** — `Organization manager` is **absent**, so a role rendered in the Roles column cannot be filtered on.
- **AC-2 fails** — `Store administrator` **is** offered but held by no member; applying it alone returns
  "There are no results found" (a dead-end filter).

![Role facet omits Organization manager](../../regression/REG-2026-07-30-1040/screenshots/B2C-MBR-031-FAIL-role-facet-missing-org-level-inherited-role.png)

Verified the fixture genuinely held the role only by inheritance: membership `roles=[org-employee]`,
account `roles=[]`, org-level roles include `org-manager`.

## Impact

Administrators cannot isolate members by a role those members visibly hold, and can select filters guaranteed to
return nothing. On a roster paginated at 16 that makes an inherited-role cohort effectively unfindable.
Filtering usability only — no data or authorization impact.

## Related (not duplicate)

Adjacent to, but distinct from, the VCST-5281 pending item *"Delete member / Revoke invite leave the contact
visible as Inactive, still counted, **unfilterable**"* — that concerns the **Status** facet lacking an `Inactive`
option. This bug concerns the **Role** facet's source list. Neither this nor AC-2 appears in
`reports/tickets/Sprint26-15/VCST-5281/summary.json`.

## Fix Routing

- **Layer:** L1 storefront (Vue) — possibly L3 xAPI if the facet options are served
- **Repo:** `vc-frontend` (`useOrganizationContacts.ts` / members filters panel)
- **Suggested fix:** derive Role facet options from the distinct roles present in the org's merged member role sets
  (the same source the Roles column uses), instead of a static assignable-role list.
- Do NOT auto-merge — human review required.
