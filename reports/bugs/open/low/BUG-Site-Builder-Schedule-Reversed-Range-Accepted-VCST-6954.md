# [Low] Site Builder: page Scheduling accepts an End date earlier than the Start date (no validation in the shell or the API)

## Status: CONFIRMED — filed in Jira as VCST-6954 (2026-11-20)
**Found by:** agent — regression REG-2026-11-19-2029
**Tracker:** [VCST-6954](https://virtocommerce.atlassian.net/browse/VCST-6954) (Bug, Priority Low, Relates VCST-6571)

**Severity:** Low. This is not a regression from Page Builder (see below). It is an authoring mistake that the product does not catch, and it does not corrupt data. Escalate to Medium only if the product decides a reversed range must be refused. Source shows that such a page can never be Active (see Root Cause Analysis).

**Env:** vcst (vcst-qa) @ Platform 3.1099.0, VirtoCommerce.SiteBuilder 3.1000.0-pr-1-28d0 (vc-module-site-builder PR #1 @ 28d00e0), storefront 2.63.0-pr-2676. Admin user, store B2B-store.

## Summary
In the Site Builder page details blade, the Scheduling card accepts an End date that is earlier than the Start date. No message is shown, Save stays enabled, and the save succeeds. The API also accepts and stores the reversed range on create, update and create-group-page. Nothing checks the order of the two dates.

## Steps to reproduce
1. Back office → Site Builder → Draft pages → open an AGENT-TEST draft page.
2. Expand **Scheduling**. Set Start date = today + 10 and End date = today + 1.
3. Click **Save**.
4. `GET /api/site-builder-pages/grouped/{groupId}`.

API-only equivalent: `PUT /api/site-builder-pages/grouped` with the group body and `startDate` > `endDate`.

## Expected vs Actual
| Expected | Actual |
|---|---|
| A reversed range is refused: an inline message on End date, or Save blocked, or a 400 from the API. This comes from the suite's test plan (scheduling). It is **not** stated in the README @ 28d00e0, which is silent on scheduling validation | No message, and Save is enabled. `PUT /grouped` → 200, toast "Page saved successfully". The page stores startDate 2026-11-19T23:00:00Z and endDate 2026-11-09T23:00:00Z (REG-2026-11-19-2029, UI) |

![Reversed schedule saved](../../screenshots/Site-Builder-Schedule-Reversed-Range-Accepted/SB-064-FAIL-reversed-schedule-saved.png)

## Layer Validation
| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront | N/A (open question) | See RCA. The storefront effect was not observed |
| 2. Backend Admin (Vue shell) | FAIL | SB-064, screenshot above, `traces/SB-064-FAIL-trace.json` |
| 3. GraphQL xAPI | N/A | — |
| 4. Platform REST | **FAIL** | Re-run 2026-11-20 (admin token, AGENT-TEST pages, deleted afterwards): `POST /grouped` with start = today+10 and end = today+1 → **200**, stored as sent. `PUT /grouped` with start = today+20 and end = today+2 → **200**, and `GET` returns the reversed pair. `POST /create-group-page` with a reversed pair → **200** |

**Owning layer:** Layer 4, REST, where the rule belongs, because every writer (shell, API, import) goes through `GroupedPageOperationService`. A matching inline rule in the shell is a nice-to-have in the same repo.

## Root Cause Analysis (vc-module-site-builder @ 28d00e0)
- `src/VirtoCommerce.SiteBuilder.Data/Services/GroupedPageOperationService.cs:787-796`, `CheckGroupUpdate`. It checks only for an archived group, the permalink and the name. `CreateInternalAsync` (`:59`) and the create-group-page path (`:133`, `CheckPermalink ?? CheckName ?? CheckEnvelope`) check no dates either. `CreateGroup` (`:165-166`) copies `StartDate`/`EndDate` as they arrive.
- `src/VirtoCommerce.SiteBuilder.Web/vue/src/modules/site-builder/components/pageAdvancedOptions.vue:74-92`. The two `VcInput type="datetime-local"` fields have no `rules`, `min` or `max` linking them.
- What source shows a reversed range does: `src/VirtoCommerce.SiteBuilder.Data/Services/GroupedPageSearchService.cs:145-155`. The admin lifecycle filters list a published page as **Active** only when `StartDate <= now && EndDate >= now`, which is never true when start > end. The same page is listed as **Pending** while `StartDate > now`, and as **Archived** once `EndDate < now`, even before its start date arrives. The `ActiveOn` filter (`:110-120`) uses the same predicate, so it never matches either.
- **Open question:** whether the storefront page delivery path uses this predicate, so that a reversed-range page is never served. Not traced, and not observed live.

**Regression or new?** Not a regression: Page Builder never refused a reversed range. `vc-module-pagebuilder` `dev` has the same unvalidated inputs (`Apps/page-builder-shell/…/components/pageAdvancedOptions.vue:75-92`, identical markup). A code search of `vc-module-pagebuilder` for `EndDate` finds no validator or operation-service check, only models, entities, migrations, search, export and the content provider. Site Builder inherited the gap unchanged.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 4 — REST
- **Suggested repo:** VirtoCommerce/vc-module-site-builder (PR #1 branch `feat/VCST-6571-site-builder-r1`, not yet merged)
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** Site Builder grouped page save (`GroupedPageOperationService`), plus the Scheduling card in the shell
- **RCA anchor:** `src/VirtoCommerce.SiteBuilder.Data/Services/GroupedPageOperationService.cs:787` @ 28d00e0 (`CheckGroupUpdate`, which has no `StartDate`/`EndDate` comparison)
- **Routing confidence:** MEDIUM. The repo and code site are clear. Whether a reversed range should be refused (400 and an inline message) is a product decision: the README does not state it, and Page Builder never did it.
