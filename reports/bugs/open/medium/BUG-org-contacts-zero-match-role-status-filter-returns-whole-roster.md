# Company Members: a zero-match role+status filter silently returns the ENTIRE member roster — Medium

## Status: CONFIRMED

**Found by:** REG-2026-09-07-1342 · suite 008 (B2C-MBR-025) · triaged `REAL_BUG`
**Archetype:** SILENT

**Env:** vcst-qa @ Platform 3.1064.0 · Customer 3.1023.0 · ProfileExperienceApiModule 3.1017.0 · Xapi 3.1020.0 · Theme 2.57.0-pr-2471-6ed5dc1b (probed live 2026-09-08)

## Summary

On `/company/members`, a **Role** + **Status** pair whose members do not intersect returns the **whole
organization roster** instead of an empty result. `GetOrganizationContacts` discards **both** arguments
when the intersection is empty — `totalCount: 50` (the full contacts population) with 16 rows, none
satisfying either chip. Each argument works alone; both work together when the intersection is non-empty.
HTTP 200, no `errors[]`: nothing reports a failure.

## Steps to reproduce

1. Sign in as an organization maintainer of an org with members in a role **and** members in a status but
   **none in both** (observed: `AGENT-TEST-Org-TechFlow-20260310` /
   `96f109a7-9010-4691-b6a1-bef25cca3d04` — 5 Sales Representatives, 1 Blocked, no overlap).
2. **Company members** → **FILTERS** → Role = **Sales Representative**, Status = **Blocked** → Apply.

## Expected vs actual

**Expected:** zero rows + the "nothing matched this filter" empty state. `0` is correct, and is what the
Platform REST layer returns for the same criteria.

**Actual:** the unfiltered roster — `totalCount: 50`, 16 rows, pages `1 2 3 4`. Every visible row's
**Roles** cell reads `Organization employee, Purchasing agent` (not one Sales Representative) and every
**Active** cell shows an unblocked state. The drawer still reports **FILTERS 2** with both chips intact,
so the UI asserts two active filters over data that was never filtered.

![zero-match filter renders the whole roster](../../../regression/REG-2026-09-07-1342/screenshots/B2C-MBR-025-RECHECK-salesrep-blocked-zero-match-shows-all.png)

## Measured — GraphQL `GetOrganizationContacts` (same org, same session)

| `roleIds` | `statuses` | `totalCount` | items | verdict |
|---|---|---|---|---|
| — | — | 50 | 16 | baseline |
| `["a8bf5373…"]` Sales Rep | — | 5 | 5 | correct |
| — | `["Locked"]` | 1 | 1 | correct |
| `["org-employee"]` | `["Locked"]` | 1 | 1 | no collapse — but not discriminating¹ |
| `["a8bf5373…"]` Sales Rep | `["Locked"]` | **50** | **16** | **WRONG — should be 0** |
| `["store-manager"]` | `["Locked"]` | **50** | **16** | **WRONG — should be 0** |

Dumps: `test-results/chrome/net/mbr-{base,f1,f2,f3,f4,f5}-{req,resp}*.txt`.

¹ `org-employee` is one of this org's **org-level** roles, and per source the role filter is dropped
(`FilterRequired = false`) when a requested role overlaps those — so both readings predict `1`. The two
`50` rows carry the finding.

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | FAIL (inherited) | screenshot — renders what the xAPI returned, plus 2 active chips |
| 2. Backend Admin | N/A | no Admin SPA blade exercises these arguments |
| 3. GraphQL xAPI | **FAIL** | `roleIds:[SalesRep] + statuses:["Locked"]` → `totalCount: 50`, 16 items (`mbr-f1-resp*.txt`) |
| 4. Platform REST API | **PASS** | `POST /api/customer/organization-memberships/search` → `0` on every empty-intersection input |

**Owning layer:** Layer 3 — GraphQL xAPI. REST is correct, so the stack does **not** inherit this.

**The REST controls that settle it** (admin token, read-only, same org; `OrganizationMembershipSearchCriteria`
carries both `roleIds` and `statuses`, so the query is expressible there): baseline `27` · role-only `5` ·
`SalesRep+Locked` **0** · `store-manager+Locked` **0** · `SalesRep+onlyLocked` **0** · `SalesRep+Approved`
(a 2nd empty intersection) **0** · nonexistent roleId `0` · nonexistent status `0`. REST fails **closed** on
every unsatisfiable filter; the xAPI fails **open** on the same inputs.

## Root Cause Analysis

**Summary:** the per-filter zero-guards in `OrganizationType.cs` (`ResolveContactsConnectionAsync`, tag `3.1017.0`) sit *before* the two filters are composed, so each filter is individually non-empty while their intersection is empty — and `MembersSearchCriteria` has no role/status property, so losing the ids removes the filter rather than narrowing it. Both arguments therefore vanish together and the unfiltered contacts population (50) is returned.

**Full analysis, source anchors and regression attribution:** [`org-contacts-filter-collapse-investigation-2026-09-08.md`](../../../reports/org-contacts-filter-collapse-investigation-2026-09-08.md)

## Alternatives ruled out

| Alternative | Ruled out by |
|---|---|
| **By design** | Docs give the filter's purpose as narrowing (`storefront/user-guide/docs/account/company-members.md`, Context7 `/virtocommerce/vc-docs`); no return-everything fallback documented. Decisively: **REST answers `0` for identical criteria**, and the source shows the zero-return was *intended* (two `return empty` guards) and merely mis-placed. |
| **GUID-vs-slug id format** | `store-manager` is a slug — same shape as the working `org-employee` — and still fails. |
| **Test-data drift** | REST: role-only 5, `onlyLocked` 1, role+locked 0. Screenshot: no returned row has the role or the status. |
| **Frontend-only** | Variables carry both arguments verbatim (`mbr-f1-req100.txt`); the response body itself holds `totalCount: 50` + 16 unfiltered items. |
| **Flaky / env** | 2 distinct zero-match combos, single-filter controls passing on **both** axes, plus 2 further REST controls. |
| **Swallowed server error** | App Insights: zero correlated exceptions, all SQL dependencies successful. |

## Application Insights

Resource `vcst-qa` (sub `973d0b8c-…`, RG `vcst`), classic schema. **Volume first:** `requests` = **77,321**
in 48 h, latest `2026-09-08 12:16:19Z` — telemetry is flowing, so a null result is real.
`POST graphql/GetOrganizationContacts` = **30 requests / 48 h, all `200`, all `success = True`**, zero
attributable exceptions, all dependencies SQL and successful. **CLEAN — and the cleanliness is the
finding:** the defect is success-shaped, so monitoring can never see it. Only an assertion on the
*contents* of a filtered result catches it, which is why B2C-MBR-025 did and telemetry did not.

## Severity — Medium (P2), argued

**For higher:** it surfaces member names, emails, roles and per-org statuses the viewer did not ask for;
it is silent; it is two clicks away in documented normal use; and the UI **misrepresents its own state**
(FILTERS 2 + both chips over unfiltered data), so the operator gets no signal the answer is wrong.

**Against:** the viewer is already an **authenticated member of that same organization** and sees all 50
contacts unfiltered by clearing the filter or just loading the page. **No row crosses a trust boundary** —
not cross-tenant, not privilege escalation, not disclosure to anyone unentitled (org-scoped auth is
demonstrably live: `AuthorizationError` at `ProfileSchema.CheckAuthAsync`, 98× in the same window).
Read-path only, corrupts nothing, user-reversible. The wrong-action path (filter to "blocked sales reps",
then use a row's gear menu) is blunted because every row *displays* the role and status contradicting the chips.

**Concluded Medium (P2)** — filter **correctness** + **misleading UI state** on a member-administration
surface, not a security-boundary failure; the exposure framing is weak precisely because the same rows are
already available to the same viewer. Placed at the **top** of Medium: silent, trivially reachable, defeats
a control whose only purpose is narrowing. A triager weighing the wrong-destructive-action path more heavily
could reasonably promote to High — the reasoning is here so that call is explicit.

## Notes and limits

Caveats, non-discriminating controls, the unfiled second filter-drop path, and tooling limits are recorded in the linked investigation: [`org-contacts-filter-collapse-investigation-2026-09-08.md`](../../../reports/org-contacts-filter-collapse-investigation-2026-09-08.md).

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 3 — xAPI (GraphQL resolver / aggregation)
- **Suggested repo:** `VirtoCommerce/vc-module-profile-experience-api` — this repo **is**
  `VirtoCommerce.ProfileExperienceApiModule` (deployed 3.1017.0). **There is no `vc-module-x-profile`**; the
  generic `vc-module-x-<name>` convention does not hold here. Matches `fix-repos.json` pattern
  `^vc-module(-x)?-[a-z0-9.-]+$`.
- **repoKind:** module
- **Ownership hint:** platform (no `project-profile.json` → native VirtoCommerce)
- **Component / module:** ProfileExperienceApi — `organization.contacts` role/status → `ObjectIds` composition
- **RCA anchor:** `src/VirtoCommerce.ProfileExperienceApiModule.Data/Schemas/OrganizationType.cs:137-168`
  (`ResolveContactsConnectionAsync`) — guards at **:137**/**:159** precede the compositions at
  **:142**/**:164**; nothing re-checks `query.ObjectIds` before `mediator.Send(query)` at **:168**. Helper
  `IntersectObjectIds` at **:234**.
- **Routing confidence:** **HIGH** — layer proven by paired REST controls on both axes; the wrong count
  equals the unfiltered contacts population exactly; anchor read at the deployed tag and byte-identical to
  `dev`; introducing PR identified.
- **NOT `vc-module-customer`:** its REST search honours both filters on every combination tried. Its
  `IsNullOrEmpty(ObjectIds)` guard is *correct* for a criteria object — changing it would be fixing working
  code and would ripple to every other consumer.
- **Fix direction (not the fix):** short-circuit **after** the composition — if any filter was
  `FilterRequired` and `query.ObjectIds` ended up empty, return the empty `PagedConnection` instead of
  sending the query; or have `IntersectObjectIds` signal "empty by intersection" distinctly from
  "unconstrained". Clamping downstream is the wrong layer: since `MembersSearchCriteria` cannot express role
  or status, an empty `ObjectIds` there is genuinely ambiguous, so the zero case must be decided in the
  resolver that knows a filter was requested.
