# VCST-4892 — /account/orders Date Filter Regression Report (Section D)

**JIRA:** VCST-4892 | **PR:** vc-frontend#2291 | **Build:** `vc-theme-b2b-vue-2.50.0-pr-2291-fed4-fed4fe16`
**Env:** vcst-qa-storefront.govirto.com | **Browser:** playwright-chrome (1920x1080, then 375x812)
**User:** mutykovaelena@gmail.com (BMW-Group / Elena Mutykova, pre-authenticated session) | **Date:** 2026-05-22

## Summary

Of 10 items run in Section D: **8 PASS** (1 with caveat), **2 PARTIAL/FAIL**. The new `VcDatePicker` migration is functionally correct: rendered (D-1), no per-keystroke fetches (D-5), min/max coupling at nav level (D-3), validation error on reversed range (D-6). Two real defects: **D-8 navigation persistence broken** (filter state lost on back nav — URL has no query params, so nothing to restore from), and **D-6 partial fail** (Apply submits with malformed Lucene filter despite visible validation error). D-10 mobile touch targets <44px (component-level, pre-existing).

## Per-item results

| # | Status | Evidence |
|---|--------|---------|
| D-1 | **PASS** | New `VcDatePicker` confirmed: `input type=text` (NOT native date), classes `vc-popover__trigger / vc-input__input / date-filter-select__custom`, `role=dialog` calendar with `aria-haspopup=dialog` + `aria-expanded` on input. NO `VcDateSelector` deprecation warning fired. SS `D-1-filter-panel-initial.png` |
| D-2 | **PASS** | Calendar click on Mar 1 populates start `03/01/2026`, click on Mar 15 populates end `03/15/2026`; Apply filters to orders dated 3/5 and 3/9. Chips "Start: 3/1/2026", "End: 3/15/2026" appear. SS `D-2-range-selected-before-apply.png`, `D-2-D-3-after-apply.png` |
| D-3 | **PARTIAL — deviation from AC** | URL stays bare `/account/orders` (no `startDate=` / `endDate=` query params at all). GraphQL filter encoded as Lucene-ISO (`createddate:["2026-02-28T23:00:00.000Z" TO "2026-03-15T22:59:59.999Z"]`). The locale-format-leakage bug the AC tries to prevent is moot (URL has no dates), but lack of URL serialization breaks D-8 persistence. Network req #126 inspected. |
| D-4 | **PASS** | Reset button clears both inputs, chips "Start"/"End" removed, full order list restored. |
| D-5 | **PASS — clean** | Typed 10 chars into start (`02/15/2026`) and 10 chars into end (`02/28/2026`) sequentially → **ZERO** GraphQL requests fired during 20 keystrokes (last req #208 unchanged). Clicking Apply → ONE request (#227) with correct Lucene filter `createddate:["2026-02-14T23:00:00.000Z" TO "2026-02-28T22:59:59.999Z"]`. SS `D-5-keyboard-typing-no-keystroke-fetch.png` |
| D-6 | **PARTIAL FAIL** | Start=03/15, End=03/01 (reversed): validation error renders correctly ("Date must be on or after 2026-03-15", red border, `vc-input--error`) — no auto-swap. **BUT** Apply button is NOT disabled and clicking it fires a malformed GraphQL request: `filter: createddate:["2026-03-14T23:00:00.000Z" TO]` (end value silently dropped, malformed Lucene range). Resulting filter chip shows only "Start: 3/15/2026", no End chip. SS `D-6-reversed-range-error.png` — see Defect 1 below |
| D-7 | **PASS** | Start=End=03/09/2026 → 3 orders shown, all dated 3/9/2026; chips display "Start: 3/9/2026" + "End: 3/9/2026" |
| D-8 | **FAIL** | Open order detail (`/account/orders/216b9bfd-…`), browser-back to `/account/orders`: filter chips "Start"/"End" GONE, only status chips remain. Date filter state NOT restored. Root cause: URL has no `startDate=`/`endDate=` params to restore from (see D-3). SS `D-8-FAIL-back-nav-filter-lost.png` — see Defect 2 below |
| D-9 | **PASS (caveat)** | `DataTransfer`+`ClipboardEvent('paste')` injection accepted: start input value became `03/01/2026`. True OS-clipboard `Ctrl+V` not testable via Playwright MCP without CDP clipboard API; D-5 already proves keyboard input works equivalently. |
| D-10 | **MIXED** | Popover does NOT overflow 375x812 viewport (dialog 318x350 at x=49, centered). Filters toggle: 44x44 ✓. **Touch-target failures (BL-UI-006)**: date input height 36px, Open-calendar btn 38x38, Apply button height 38px, calendar day cells 40x40 — all below 44x44 WCAG/BL-UI-006. Pre-existing primitive-level concern, not new regression. SS `D-10-mobile-calendar.png` |

## Defects

### Defect 1 — D-6 reversed range fires malformed Lucene filter on Apply
**Severity:** Medium (P2) | **Component:** `date-filter-select.vue` / VcDatePicker Apply gating
**Repro:** /account/orders → Filters → start=03/15/2026, end=03/01/2026, Tab → visible error "Date must be on or after 2026-03-15" → click Apply (NOT disabled) → GraphQL POST GetOrders with `filter: createddate:["2026-03-14T23:00:00.000Z" TO]` (malformed, end dropped). Server returns 200; UI shows orders from 3/15 onward without the user's intended end bound.
**Expected:** Apply button disabled while any field is in error state, OR end-date input value preserved in the GraphQL filter, OR explicit error toast preventing submission.

### Defect 2 — D-8 date filter not persisted on back-button navigation
**Severity:** Medium (P2) | **Component:** `date-filter-select.vue` / orders route query-state binding
**Repro:** /account/orders → apply any date range (e.g. 3/1–3/15) → click an order row (opens detail in new tab per VcTable default; direct-nav to detail in same tab also reproduces) → browser-back → date filter chips & input state lost; full order list re-fetched.
**Expected (per checklist D-8/ECL-7.1):** Filter state survives back-nav. Either persist `startDate`/`endDate` as URL query params (matches JIRA req #2 spirit) or use sessionStorage with route-scoped key.

## Build & evidence

- Footer version stamp confirmed: `Ver. 2.50.0-pr-2291-fed4-fed4fe16`
- Screenshots (7): `tests/Sprint-current/VCST-4892/screenshots/account-orders/`
- HAR: not auto-captured by current playwright-chrome MCP build (HAR config not active in `config/mcp-playwright-chrome.config.json`). Network evidence captured via `browser_network_requests` + `browser_network_request` payload inspection inline.
- Console: 0 errors related to filter, 3 cryptic Apollo client warnings (`go.apollo.dev/c/err#…`) unrelated to the date-picker scope, 2 unrelated 404s (third-party image, cdn rum). No `VcDateSelector` deprecation warning on this page.

## Cross-AC alignment vs. JIRA comments

- **Req #1 "no request per keystroke":** PASS (D-5)
- **Req #2 "URL serialization stays ISO":** NEEDS PRODUCT DECISION. URL has zero date params today; the locale-format leakage bug is moot, but the contract implied by the AC isn't met. If query-param serialization was intended, Defect 2 (D-8) is the primary symptom.
- **Req #3 "min/max coupling":** PASS at navigation level (end picker's Prev-month disabled at start month; D-3). Cell-level dates-before-start disable not directly observable in tested month (March starts on Sunday, no leading other-month cells in grid).
