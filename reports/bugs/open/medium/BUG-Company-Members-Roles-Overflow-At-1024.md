# `/company/members`: a member with two roles pushes the members table out of its card and the page scrolls sideways at 1024 px `[Medium]`

## Status: CONFIRMED
**Found by:** agent — testing VCST-6652
**Severity:** Medium (P2) · **Oracle:** BL-UI-004 (content stays in its box; the page never scrolls sideways)
**Tracker:** no separate ticket — by the operator's decision (2026-11-05) this is fixed under **VCST-6652** in VirtoCommerce/vc-frontend#2638 (commit `45068bb83`: Roles cell `max-w-xs` → `max-w-52`). Move to `fixed/` once `/qa-verify-fix VCST-6652` confirms it on a deployment.

**Env:** vcst · theme `2.62.0-pr-2613-e3fc-e3fce9a9` · Firefox (playwright-firefox) · Organization maintainer (`ORG_USER_EMAIL`, TechFlow)

## Summary
At a 1024 px wide window, a member whose Roles cell lists two roles (e.g. "Purchasing agent, Organization employee") makes the Company members table wider than its card. The actions column ends up outside the card and the whole page scrolls sideways by 49 px. No long name is involved: this is a second trigger, separate from VCST-6652, and the VCST-6652 fix (a cap on the Name column) does not remove it.

## Preconditions
- An organization with a member whose organization membership holds two roles. On vcst no member has two roles by default; the reproduction gave TechFlow's "Blocked User" (`IMPERSONATE_TARGET_BLOCKED`) the Purchasing agent role in addition to Organization employee, then restored it.
- Signed in as that organization's maintainer.

## Steps to Reproduce
1. Set the window to 1024×768.
2. Open `/company/members` and go to the page that lists the two-role member (page 3 of 3 on vcst).
3. Look at the right edge of the table, or scroll the page sideways.

## Expected
The table fits its card at every width from 1024 px: a long Roles text is cut with "…" (the cell already has `truncate` and a `title` tooltip), or the table scrolls inside the card. The page itself never scrolls sideways.

## Actual
Measured on real data (no DOM changes), unfiltered page 3, 1024 px:

| Page scrollWidth | Card | Table | Name / Roles / Email / Active / actions |
|---|---|---|---|
| **1073** | 740 | **820** | 182 / **285** / 208 / 73 / 72 |

- Roles text "Purchasing agent, Organization employee" is 253 px wide; its cell takes 285 px (it may grow to 320 px before `truncate` applies).
- Before the second role was added, the same page measured scrollWidth 1024 and table 738: it fit. The only change is the Roles text.
- Filtered to that member alone (search "Blocked"), the table still spills 13 px past the card at 1024 px (no page scroll) and fits from about 1037 px.
- Simulating the VCST-6652 Name cap (`max-width: 10rem` on Name cells, in the DOM) does not remove the overflow: Name is not the widest contributor here.
- DOM-simulated widths: a three-role text overflows from 1024 to 1139 px; every two-role string tried overflows at 1024 px; every single role fits.

![Members table at 1024 px: actions column outside the card (emails blurred)](../../screenshots/Company-Members-Roles-Overflow-At-1024/BUG-company-members-roles-overflow-1024-page.png)

Console: no errors.

## Layer Validation
| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront Frontend | **FAIL** | measurements above, screenshot |
| 2. Backend Admin | N/A | the page is storefront-only |
| 3. GraphQL xAPI | PASS | `organization.contacts.rolesInOrganization` returns the two roles the membership holds |
| 4. Platform REST API | PASS | `GET /api/customer/organization-memberships/{id}` returns the two roles |

**Owning layer:** Layer 1 — Storefront.

## Root Cause Analysis
`VirtoCommerce/vc-frontend` @ `dev` (`3f3457e68`), `client-app/pages/company/members.vue`:
- The Roles `<td>` is `max-w-xs truncate` (320 px cap). In the table's auto layout a nowrap cell takes its full text width up to that cap, so a two-role text claims 250–320 px. With Name ≥ 160, Email 208, Active + actions ≈ 145, the columns' minimum sum passes the 738 px card at 1024 px.
- `<VcTable … mobile-breakpoint="lg">` is rendered without `scrollable`, so `.vc-table__scrollbar` keeps `overflow-x: visible` and the excess widens the page.
- Roles shown = `rolesInOrganization` ∪ the contact's security-account roles, de-duplicated (`getContactRoles`, `client-app/shared/company/utils/index.ts`; kb KB-5937E1C3), so a member can show several roles.

Possible fixes (a design choice, not a one-line given): a smaller Roles cap (e.g. `max-w-52`, as on Email — leaves little slack at 1024 px), letting Roles wrap, or `scrollable` on this VcTable.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend
- **repoKind:** frontend
- **Ownership hint:** platform
- **Component / module:** vc-frontend Company members page (`client-app/pages/company/members.vue`)
- **RCA anchor:** `client-app/pages/company/members.vue` Roles `<td class="max-w-xs truncate …">` (desktop-body, second cell) and the `<VcTable>` without `scrollable`
- **Routing confidence:** MEDIUM — the repo and file are certain; which of the fix options to take is a design decision
