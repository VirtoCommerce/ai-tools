# BUG — Role whitelists do not filter storefront role-assignment dropdowns (Test 2 fails) `[Medium / P2]`

**Env:** vcst-qa @ Platform `3.1041.0`, Customer `3.1014.0-alpha.1002-vcst-5239`, ProfileExperienceApi `3.1010.0-pr-137`, Theme `2.53.0-pr-2354` (PR under test)

## Summary
VCST-5239 adds Organization/Membership role **whitelists** (Customer › Roles settings) meant to restrict which roles appear in the storefront role-assignment dropdowns (JIRA **Test 2**). On the storefront, **both** membership role dropdowns — the `/company/members` "Change role" dialog and the "Invite member" dialog — show **all** organization roles, ignoring the Membership whitelist. Combined with the backend finding that the whitelist has no server-side enforcement (report F1), the whitelist feature is inert on every observable surface → **Test 2 fails**.

## Fixture state (left by backend phase — do not reset)
- Membership roles whitelist = `{org-employee}` (excludes `org-maintainer`, `purchasing-agent`).
- Organization roles whitelist = `{org-maintainer, purchasing-agent}`.

## Steps to Reproduce
1. Sign in at `/sign-in` as a TechFlow org-maintainer (`agent-test-multiorg-20260615@yopmail.com` / `Password1!`) — active org context = TechFlow.
2. Go to `/company/members` → a member row → **Actions → Edit role**.
3. Observe the "Change role" dialog options.
4. Close, then click **Invite members** → open the **Role** dropdown.

## Expected vs Actual
- **Expected (AC6 / Test 2):** membership dropdowns limited to the Membership whitelist → only **Organization employee** selectable.
- **Actual:** both dropdowns list **all three** org roles — *Organization employee, Purchasing agent, Organization maintainer*. Neither the Membership whitelist `{org-employee}` nor the Organization whitelist `{org-maintainer, purchasing-agent}` is applied — it is the full unfiltered role set.

## Evidence
- Change-role dialog (unfiltered): `reports/bugs/screenshots/VCST-5239-AC6-FAIL-membership-dropdown-unfiltered.png`
- Invite dialog dropdown (unfiltered): `reports/bugs/screenshots/VCST-5239-AC6-FAIL-invite-role-dropdown-unfiltered.png`
- No GraphQL role-filtering query fired on dialog open (role list is sourced unfiltered); no `errors[]`.

## Scope / severity notes
- **AC5 (org-level role dropdown) has no storefront surface** — org-level role assignment is Admin-only (backend `PUT /api/organizations`); so the whitelist's only would-be storefront consumer is the membership dropdown, which is unfiltered.
- Backend report **F1**: whitelist is settings-only, **not** a server boundary (`profile-experience-api#137` has zero whitelist refs). So this is a **non-functional new feature**, not a security regression — an org-maintainer could already assign any role. Severity kept at **P2 (Medium)** because a documented acceptance criterion / QA Test 2 is entirely unmet; triage may downgrade to P3 given no functional/security harm.
- BL-AUTH-005 permission gating still works (mutation still requires `xapi:my_organization:edit`).

## Suggested routing
vc-frontend (`vc-frontend#2354`) — the membership role dropdown population in the members "Change role" + "Invite member" components should read the Membership whitelist setting. (If server-side enforcement was also intended, that is a separate backend gap per F1 — PO decision.)
