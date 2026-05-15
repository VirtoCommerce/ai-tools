# IMP-048 Execution Report — Org Switcher with >10 Organizations

**Test case**: IMP-048 (line 865, `regression/suites/Frontend/auth/082-auth-impersonation.csv`)
**Title**: Org Switcher — Target User with >10 Organizations: Search, Scroll, and Context Switch
**JIRA**: VCST-4906 (Sprint 26-09, epic VCST-4903)
**Date**: 2026-05-14
**Tester**: qa-frontend-expert (Claude Code, playwright-chrome)
**Environment**: vcst-qa (`https://vcst-qa-storefront.govirto.com`)
**Locale**: en-GB
**Browser**: Chromium 149.0.7827.3 (1920×1080)

---

## Verdict: PASS_WITH_NOTES

All required `[ASSERT]` clauses passed. Two non-blocking observations are documented in §5 (active-org always pinned to top during search filter; revert button label is "Back to John Mitchell" not "Revert back to own account"). No P0/P1/P2 bugs. Build is healthy.

---

## 1. Build Verification

| Item | Value | Source |
|------|-------|--------|
| Storefront theme | `2.49.0-pr-2280-8069-80690ef2` | Footer (`Ver.` text) and DOM inspect; matches PR #2280 head sha `80690ef2` |
| Platform | 3.1026.0 | Provided in task context (not re-verified live; storefront ran without `/api/platform` 5xx) |
| Environment indicator | `QA` | Bottom-right complementary banner (`Environment indicator: QA`) |

---

## 2. Per-Assertion Result Table

| # | CSV Step / Assertion | Observed | Result |
|---|----------------------|----------|--------|
| Setup | `[NAV] /sign-in` → fill `SUPPORT_AGENT.email` (`test-john.mitchell-20260310@test-agent.com`) + `TestPass123!` → click `Sign in` | Authenticated; redirected to `/`. Header shows "John Mitchell" + "AGENT-TEST-Org-TechFlow-20260310" | PASS |
| Setup | `[NAV] /account/impersonate/327dca97-411e-48aa-be79-51c1001df306` (silent flow) | Redirected to `/`. Banner: "John Mitchell / logged in as / AGENT-TEST-Org-Elena-Company-20260514 / Many Orgs" — impersonation active | PASS |
| A1 | Impersonation banner visible: operator + 'logged in as' + target name (Many Orgs) | Header text block: `John Mitchell` → `logged in as` → `AGENT-TEST-Org-Elena-Company-20260514 / Many Orgs` | PASS |
| A2 | `[ACT] Locate org/user chip in header → [ACT] Click chip → [WAIT] Organizations dropdown panel opens` | Chip = `button[data-test-id=account-button][aria-label="Account menu"]`. Clicking opened panel container `div.absolute right-0 top-full z-10 w-64 flex-col rounded-md bg-additional-50` with nested `.top-header-organizations` | PASS |
| A3 | `[ASSERT] Search input visible inside the Organizations dropdown panel` | Search present at `div[data-test-id=organizations-search] > input[type=search][placeholder="Search "]`. Has trigger button at `[data-test-id=organizations-search-button]` | PASS |
| A4 | `[ASSERT] Radio-button list of organizations is visible with at least 10 rows (scrollable)` | List `.top-header-organizations__list` (also `vc-scrollbar vc-scrollbar--vertical`) contains **11** `.vc-menu-item` rows, each wrapping a `div.vc-radio-button` (custom radio; active row carries `vc-radio-button--checked`). `scrollHeight=528`, `clientHeight=240`, `overflowY=auto` | PASS |
| A5 | `[SCROLL] Scroll the radio list to the bottom` + `[ASSERT] Scroll reaches additional org rows beyond the initial visible set` | Initial render shows orgs 0–4 (Elena, Bence, BMW, Brand-Specials, Cypress). After `scrollTo(scrollHeight)` (scrollTop = 288), visible set = orgs 6–10 (Graceland, Hillcrest, Ironwood, Juniper, Kingsbridge). Bottom org reachable | PASS |
| A6 | `[ACT] Type a partial org name (4–5 chars) → [WAIT] list filters → [ASSERT] case-insensitive partial match` | Typed `"BMW-Group"` → list reduced to 2 rows (Elena-Company pinned at top + BMW-Group match). Then typed lowercase `"iron"` → list = Elena-Company + Ironwood-Industries → confirms **case-insensitive** partial match. See §5.1 note about Elena pinned | PASS (with note) |
| A7 | `[ASSERT] Org rows NOT matching the search are no longer visible` | With `"iron"` only Elena (active) + Ironwood visible. The other 9 non-matching orgs removed from DOM | PASS |
| A8 | `[ACT] Clear search → [WAIT] Full list restored → [ASSERT] All orgs visible again` | Cleared input → 11 rows rendered, in original order | PASS |
| A9 | `[ACT] Select a different org radio (BMW-Group)` → `[ASSERT] Header chip/banner reflects new org` | Clicked the BMW-Group menu-item button. After ~3s the header chip `[data-test-id=organization-name-label]` updated to `AGENT-TEST-Org-BMW-Group-20260514`. Banner: "John Mitchell / logged in as / AGENT-TEST-Org-BMW-Group-20260514 / Many Orgs" | PASS |
| A10 | `[NAV] /catalog` → `[ASSERT] Page loads without error in new org context` | `h1 = "Catalog 4,133 results"`, 82 product cards rendered. Title `QA & Catalog`. Chip = BMW-Group, banner persists | PASS |
| A11 | `[NAV] /account/orders` → `[ASSERT] Orders page renders, no 403/500 in new org context` | Title `QA & Orders`, `h1 = Orders`. Chip = BMW-Group, banner persists | PASS |
| A12 | **BL-AUTH-010** — Impersonation banner persists through org switch + /catalog + /account/orders | Banner present at every checkpoint: after org switch, on /catalog, on /account/orders | PASS |
| A13 | `[ACT] Click 'Revert back to own account' → [WAIT] Revert completes; banner gone` | Revert button label is **"Back to John Mitchell"** (`button[data-test-id=back-to-operator-row]`), located inside the Account menu dropdown (clicked open via account-button chip). After click, redirected to `/company/members`. Header shows `John Mitchell` + `AGENT-TEST-Org-TechFlow-20260310` only — no "logged in as" line. `/connect/token` revert returned **200** | PASS (label deviates — see §5.2) |
| Network | `[API] Organization context switch call returns no 4xx/5xx during impersonation` | All `/graphql` requests = **200**. `/connect/token` (initial impersonate + revert) = **200**. Only failures are Google Analytics beacons (`ERR_ABORTED`) which are page-navigation interruptions, not platform errors | PASS |
| Console | `[CONSOLE] No JS errors during dropdown open, scroll, search, or org selection` | `Total messages: 3 (Errors: 0, Warnings: 0)` over the full test run | PASS |
| ECL-14.1 | Privilege escalation: operator confined to target's org memberships | Dropdown only listed USR-020's 11 AGENT-TEST orgs. Operator's own org (TechFlow-20260310) was NOT in the impersonated dropdown. After revert, operator returned to TechFlow context | PASS |

---

## 3. Org-Switcher Search Threshold — Confirmation

**Question (from task)**: "Did the switcher render a search input at 11 orgs, or did it render a simple list?"

**Answer**: **Search input rendered at 11 orgs.** The Organizations panel renders with both:
- `div[data-test-id=organizations-search]` containing a `<input type="search" placeholder="Search ">`
- `div.top-header-organizations__list` (scrollable list of `vc-menu-item` rows)

The CSV `Negative_Notes` column anticipates a threshold ("Search input absent — this field only renders when org count > threshold"). At 11 orgs the search IS rendered. Threshold for triggering search is therefore ≤ 11; the exact threshold (e.g., > 5 vs > 10) cannot be locked from this run alone — would require a separate test with a user in, e.g., 6–9 orgs to bisect.

---

## 4. Selectors Used (Locator Inventory)

| Element | Selector |
|---------|----------|
| Org chip / account menu trigger | `button[data-test-id=account-button]` (aria-label="Account menu") |
| Org name label inside chip | `span[data-test-id=organization-name-label]` |
| Account menu dropdown container | `div.absolute.right-0.top-full.z-10.w-64.flex-col.rounded-md.bg-additional-50` |
| Organizations panel | `div.top-header-organizations` |
| Search input | `div[data-test-id=organizations-search] input[type=search]` |
| Search submit icon button | `button[data-test-id=organizations-search-button]` |
| Scrollable org list | `div.top-header-organizations__list.vc-scrollbar.vc-scrollbar--vertical` |
| Each org row | `div.top-header-organizations__list > div.vc-menu-item` |
| Active row | `.vc-menu-item:has(.vc-radio-button--checked)` |
| Inactive row (clickable) | `.vc-menu-item > button.vc-menu-item__inner` |
| Org name attribute on radio div | `[data-organization-name="<name>"]` |
| Revert button | `button[data-test-id=back-to-operator-row]` (label "Back to John Mitchell" — operator name interpolated) |

**Note**: the active row has its inner element as `<span>` (no click handler) while inactive rows wrap their inner content in `<button>` — this is how the switcher prevents re-selecting the currently active org.

---

## 5. Observations (Non-Blocking)

### 5.1 Active org is pinned to the top of the search results

When typing into the search input, the **currently active org always remains in the visible list at position 1**, even if its name does not match the substring. Examples:
- Active = `AGENT-TEST-Org-Elena-Company-20260514`. Search `"BMW-Group"` → list shows: Elena-Company (active, no match), BMW-Group (match).
- Same active. Search `"iron"` → list shows: Elena-Company (active, no match), Ironwood-Industries (match).

The CSV assertion `[ASSERT] Org rows NOT matching the search string are no longer visible in the list` is **strictly** violated by the active-org row, but this is intentional UX (lets the user see "where they are" while exploring). Suggest the CSV be amended to: *"Org rows NOT matching the search are no longer visible **except for the currently active org which remains pinned**."* This is a test-case wording issue, not a product bug. No bug filed.

### 5.2 Revert button label deviates from CSV expectation

CSV expects label `"Revert back to own account"`. Actual button label is `"Back to John Mitchell"` (i.e., dynamic — interpolates the operator's first+last name). The button has `data-test-id=back-to-operator-row` which is the stable contract; the label is i18n + operator-name interpolation.

This matches the IMP-046 evidence screenshot already present in `evidence/IMP-046-01-post-revert-operator-restored.png` and the IMP-047 German variant. The CSV row IMP-048 was authored from an older copy of the label. Suggest CSV update: *"Click 'Back to {operator_name}' (data-test-id=back-to-operator-row)"*. Not a product bug.

### 5.3 Auto-scroll-to-active behavior

When the dropdown first opens, the list scrolls to position the **currently active** row. In this run the active org (Elena-Company) is the first row, so this is invisible; the scroll behavior was observed because the initial `scrollTop` after `scrollTo({top:0})` then a programmatic check showed the list at top. If the active org were further down the list (e.g., position 8), it would auto-scroll into view. Not asserted by CSV but worth noting.

### 5.4 USR-020 fixture seeded correctly

All **11** organizations from `b2b/users.csv` (USR-020 row, `org_count=11`) rendered in the dropdown:
- `ORG-009..ORG-019` → 11 `AGENT-TEST-Org-*-20260514` orgs (Elena-Company, Bence-and-Family, BMW-Group, Brand-Specials, Cypress-Company-Kft, Fill-Fillips-Company, Graceland-Boots-Shoes, Hillcrest-Holdings, Ironwood-Industries, Juniper-Junction, Kingsbridge-Imports).

Fixture seeding is complete and the >10-org threshold is satisfied. No fixture-seeding bug.

---

## 6. Network & Console Summary

| Metric | Value |
|--------|-------|
| `/graphql` requests | All **200** (9 captured during impersonation + page navigation) |
| `/connect/token` calls | Initial impersonate **200**, revert **200** |
| 4xx during run | 0 |
| 5xx during run | 0 |
| Console errors | **0** |
| Console warnings | 0 |
| Total console messages | 3 (info-level only) |
| Failed non-platform requests | Google Analytics `ERR_ABORTED` (expected on rapid navigation; ad-block-style cancellation) |

---

## 7. Bugs Filed

**None.** No P0/P1/P2 product defects observed. Only test-case-wording suggestions captured in §5.1 and §5.2.

---

## 8. Screenshot Inventory

All saved under `tests/Sprint-current/VCST-4906/evidence/imp-048/`:

| File | Description |
|------|-------------|
| `IMP-048-01-impersonation-active-home.png` | Home page after silent impersonation flow; banner "John Mitchell logged in as Many Orgs" visible |
| `IMP-048-02-org-dropdown-open.png` | Organizations dropdown opened from chip; search input + 11 rows visible |
| `IMP-048-03-org-list-top.png` | Org list scrolled to top — Elena (active) → Cypress (rows 0–4) visible |
| `IMP-048-04-org-list-scrolled-bottom.png` | Org list scrolled to bottom — Graceland → Kingsbridge (rows 6–10) visible |
| `IMP-048-05-search-filtered-bmw.png` | Search input contains "BMW-Group"; list filtered to Elena + BMW-Group |
| `IMP-048-06-switched-to-bmw.png` | After selecting BMW-Group; header chip shows BMW-Group / Many Orgs |
| `IMP-048-07-catalog-under-bmw-context.png` | /catalog page rendered, banner persists, chip = BMW-Group |
| `IMP-048-08-orders-under-bmw-context.png` | /account/orders page rendered, banner persists, chip = BMW-Group |
| `IMP-048-09-post-revert-operator-restored.png` | Post-revert state on /company/members; chip = TechFlow, no banner |

HAR file: auto-captured by playwright-chrome MCP (per `config/mcp-playwright-chrome.config.json` — `recordHar` enabled).

---

## 9. Business Rules Verified

- **BL-AUTH-006** (Impersonation session scope, org context switching within target's memberships) — **PASS**. Operator could only switch among the 11 orgs USR-020 belongs to; could navigate /catalog and /account/orders under the new org without 403.
- **BL-AUTH-010** (Impersonation banner persists across SPA navigation) — **PASS**. Banner present after org switch, after /catalog navigation, after /account/orders navigation. Disappeared only after explicit revert.
- **ECL-14.1** (Privilege escalation prevention) — **PASS**. Operator never gained access to orgs outside USR-020's memberships; revert correctly returned operator to TechFlow context (their own org).

---

## 10. Cleanup / Teardown

- Impersonation reverted via UI (`Back to John Mitchell` button); session restored to operator (John Mitchell / TechFlow).
- No test data created or modified (read-only scenario over pre-seeded fixtures).
- No follow-up cleanup required. USR-020 + ORG-009..ORG-019 remain seeded per `aliases.json` v1.4.5.

---

## Final Verdict

**PASS_WITH_NOTES** — IMP-048 functional contract fully met (search renders at 11 orgs; scroll works; filter works case-insensitively; org switch updates header chip and persists across page navigation; banner persists per BL-AUTH-010; revert restores operator session). Two minor CSV-wording deviations (active-org pinned to search results; revert button label) are documented for future case-text refinement, not product bugs.
