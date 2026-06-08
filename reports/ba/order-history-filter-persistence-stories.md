# Order History Date-Range Filter — URL Persistence & State Restoration

**Scope:** vc-frontend (Vue SPA), `/account/orders` page, split from VCST-5153 item 4 per developer recommendation (Maya, 2026-06-03).
**Env:** vcst-qa — Theme `2.51.0-pr-2312-*`, Platform 3.1026.x.
**Executive summary:** The Order History date-range filter discards state on browser Back-navigation and does not reflect applied filters in the URL query string. This prevents shareability, page-refresh resilience, and coherent back-navigation — all common operational workflows for both B2C customers and B2B purchasing agents. One story covers the full URL-sync + restoration contract. The WCAG keyboard-a11y items (VCST-5153 items 1–3) are out of scope here.

---

## [VCST-5153-4 | EPIC-ORD-F01] Order History Filter State — URL Persistence, Deep-Link & Back-Nav Restoration

```
Type:     Improvement (defect productized as feature requirement)
Module:   Orders (vc-frontend / account/orders)
Priority: Medium
Effort:   S (1–3 days)
Sprint:   (unassigned — backlog)
Business_Rule:  PROPOSED-BL-ORD-010 (see §proposed_bl below)
Edge_Case_Refs: ECL-1.2 (Session & Timeout), ECL-4.1 (Filter persistence)
Jira_ref: VCST-5153 (parent), VCST-4892 (VcDatePicker component)
```

### Story Statement

```
As a registered B2C customer or B2B purchasing agent,
I want the active date-range filter on my Order History page to be
  reflected in the browser URL and restored after navigating into
  an order detail and pressing Back (or refreshing the page),
So that I can share a filtered order view with a colleague, revisit
  a specific date window without re-entering it, and trust that my
  context is not silently discarded on navigation.
```

### Background

The `/account/orders` page exposes a VcDatePicker date-range filter (introduced via VCST-4892 / VCST-5153). When a user sets a start and end date and clicks "Apply", the filtered result loads correctly — but the URL remains bare `/account/orders` and no query params are appended. Clicking into an order detail then pressing browser Back returns the user to the unfiltered list. B2B purchasing agents routinely filter by accounting period (e.g., a quarter) and need to share those views with finance colleagues or return to the same window across browser sessions. The fix is a standard Vue Router query-param sync pattern and does not require any backend API changes.

### Acceptance Criteria

```
AC-1: Filter state writes to URL query params on Apply
Given a registered B2C customer or B2B purchasing agent is on /account/orders
When the user sets a valid start date and end date using the date-range inputs
  and clicks "Apply"
Then the URL updates to /account/orders?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
  using ISO 8601 (YYYY-MM-DD) date format
And the filter chip / input fields remain populated with the selected range
And the displayed order list reflects only orders within that date range

AC-2: Deep-link / shareable URL pre-populates the filter on load
Given no active browser session is required (the user authenticates and then
  navigates directly to a URL containing ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD)
When the /account/orders page loads with valid startDate and endDate query params
Then the Start Date and End Date inputs render pre-populated with those values
And the order list loads already filtered to that date range without the user
  clicking "Apply"

AC-3: Filter state is restored after Back-navigation from order detail
Given a registered B2C customer or B2B purchasing agent has applied a date-range
  filter on /account/orders (URL carries ?startDate=…&endDate=…)
When the user clicks an order row to open the order detail page
  and then presses the browser Back button
Then the browser returns to /account/orders?startDate=…&endDate=…
And the Start Date and End Date inputs are still populated
And the filtered order list is displayed (not the unfiltered default)

AC-4: Filter state survives page refresh
Given a registered B2C customer or B2B purchasing agent is on
  /account/orders?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD with results visible
When the user refreshes the page (F5 / Cmd+R)
Then the page reloads with the same query params intact
And the date inputs are populated and the filtered order list is shown

AC-5: Clearing the filter removes query params from URL
Given a registered B2C customer or B2B purchasing agent is on
  /account/orders?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
When the user clears both date inputs and clicks "Apply" (or clicks an explicit
  "Clear" / reset control if present)
Then the URL returns to bare /account/orders (no startDate or endDate params)
And the order list shows all orders (unfiltered default view)

AC-6 (negative): Malformed or invalid query params fall back gracefully
Given a registered B2C customer or B2B purchasing agent opens a URL with
  malformed or invalid date query params, for example:
  /account/orders?startDate=not-a-date&endDate=2025-99-99
  or /account/orders?startDate=abc&endDate=
When the /account/orders page loads
Then the date inputs render empty (no pre-population)
And the order list shows the default unfiltered view
And no JavaScript exception is thrown and no error toast appears
And the malformed params are silently dropped from the URL

AC-7 (negative): Reversed date range in query params is rejected on load
Given a URL with the end date earlier than the start date is opened, for example:
  /account/orders?startDate=2025-06-01&endDate=2025-01-01
When the /account/orders page loads
Then the date inputs render empty (matching the existing in-form validation
  that blocks reversed-range Apply)
And the order list shows the default unfiltered view
And no error toast or crash occurs

AC-8 (negative): Valid date range that returns no orders shows empty state
Given a registered B2C customer or B2B purchasing agent applies a valid date
  range for which no orders exist (e.g., a future date window far beyond any
  placed order)
When the order list renders
Then the URL still carries the correct ?startDate=…&endDate=… params
And the order list area displays the standard "No orders found" / empty-state
  message
And the filter inputs remain populated (the absence of results does not clear
  the filter state)
```

### Out of Scope

```
- VCST-5153 items 1–3: keyboard accessibility for VcDatePicker / VcCalendar
  (tracked in the parent ticket)
- Status filter, keyword search, or other order-history filter fields — URL
  persistence for those is a separate follow-on story if the same mechanism
  is not reused by the implementation team
- Admin SPA Order Management filters — entirely different surface
- Mobile deep-link handling via native app (this is a browser SPA only)
- Server-side rendering / prerender SEO for filtered URLs
```

### Dependencies

```
Depends on:  VCST-4892 (VcDatePicker component — must be stable in QA)
             VCST-5153 (parent — items 1–3 can proceed in parallel or after)
Blocked by:  None — no backend API change required; pure vc-frontend work
Enables:     Future story: persist status/keyword filter state in URL
             Suite 014/015 regression coverage of this URL contract
```

### Definition of Done

```
- [ ] URL query params written on Apply and cleared on filter reset
- [ ] Deep-link load pre-populates inputs and triggers filtered fetch
- [ ] Browser Back from order detail restores filtered URL + UI state
- [ ] Page refresh preserves filter via query params
- [ ] Malformed / reversed / empty params fall back gracefully (AC-6, AC-7)
- [ ] Empty-result state shown with filter inputs still populated (AC-8)
- [ ] Date format in URL is strictly ISO 8601 YYYY-MM-DD (locale-safe)
- [ ] Works in Chrome, Firefox, and Edge (WebKit not supported on Windows QA)
- [ ] Responsive: tested at 375 px (mobile), 768 px (tablet), 1920 px (desktop)
- [ ] No new console errors or warnings introduced
- [ ] All strings use i18n keys (no hardcoded English labels added)
- [ ] Unit tests cover: param serialization, param deserialization,
      malformed-param guard, reversed-range guard
- [ ] Regression test cases added to suite 014 (orders-frontend) covering
      AC-1..AC-8 via browser E2E (happy path) + direct URL navigation
- [ ] PROPOSED-BL-ORD-010 reviewed and approved (or existing BL cited)
- [ ] BA sign-off on acceptance criteria
```

### UI/UX Notes

```
Layout: No new UI elements. Existing date-range inputs and "Apply" button
  on /account/orders are the sole interaction points. URL update is silent.

States to handle:
- Default (no params): inputs empty, full order list
- Filtered (valid params): inputs pre-populated, filtered list
- Empty result: inputs populated, "No orders found" empty state
- Invalid params: inputs empty, full list (silent fallback, no error UI)

Interaction details:
- URL update uses router.replace() so the filtered URL does not add an extra
  Back-stack entry — Back from order detail returns to the filtered list.
- "Apply" is the gate; real-time URL updates on each calendar click are
  out of scope (would conflict with the reversed-range guard).
- Clear / reset: router.replace({ query: {} }) strips params.

Existing components to reuse:
- VcDatePicker / VcCalendar (VCST-4892 / VCST-5153) — no component changes;
  URL sync lives in the parent page composable (useOrders or equivalent)
- Vue Router useRoute / useRouter (standard vc-frontend pattern)
```

### Technical Notes

```
Vue Router query-param sync (vc-frontend):
- On Apply: router.replace({ query: { startDate, endDate } }) using ISO 8601
  (dayjs().format('YYYY-MM-DD') — already used by VcDatePicker internally).
- On mount / route.query watch (immediate: true): validate params
  (regex /^\d{4}-\d{2}-\d{2}$/ + Date.parse not NaN + start ≤ end);
  deserialize if valid, else no-op. URL is canonical source of truth; Pinia
  state (if used) must initialize from route.query, not the reverse.
- router.replace() not router.push() — keeps one history entry per filter
  state so browser Back from order-detail pops to the filtered URL.
- Guard against double-fetch on mount when both params are absent.
- Pagination must reset to page 1 when filter params change.

VC module(s) affected: vc-frontend only (storefront Vue SPA).
No changes to vc-module-order, xAPI schema, or REST endpoints.

Security: always validate params before passing to API (AC-6/AC-7 guard).
Orders API enforces per-user authorization; no additional scoping required.

GraphQL xAPI:
- Confirm exact date-range argument names against
  .claude/agents/knowledge/graphql-schema.md before implementation.
- Runner-native assertions: `errors[]` empty on valid range;
  all `data.orders.items[].createdDate` values within [startDate, endDate].
- Check test-data/graphql/index.json for an existing orders/me fixture;
  if absent, add test-data/graphql/queries/orders.graphql + index.json entry.
```

### Test Scenario Matrix

| ID | Scenario | Input | Expected Output | Test Type | ECL Ref |
|----|----------|-------|-----------------|-----------|---------|
| TS-01 | Happy path — Apply writes URL | Set startDate=`@td(DATE_RANGE_Q1.start)` endDate=`@td(DATE_RANGE_Q1.end)`, click Apply | URL = `/account/orders?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`; list filtered | E2E | — |
| TS-02 | Deep-link load pre-populates filter | Navigate directly to `/account/orders?startDate={{ORDER_FILTER_START}}&endDate={{ORDER_FILTER_END}}` | Inputs populated; list filtered without clicking Apply | E2E | — |
| TS-03 | Back-nav restores filter | Apply filter → click order → click Back | URL restores query params; inputs populated; list filtered | E2E | ECL-1.2 |
| TS-04 | Page refresh preserves filter | Apply filter → press F5 | URL params intact; inputs populated; list filtered | E2E | — |
| TS-05 | Clear filter removes URL params | Apply filter → clear inputs → Apply | URL = bare `/account/orders`; full order list shown | E2E | — |
| TS-06 | Malformed startDate param | `/account/orders?startDate=not-a-date&endDate=2025-06-01` | Inputs empty; unfiltered list; no console error | E2E | ECL-4.1 |
| TS-07 | Malformed endDate param | `/account/orders?startDate=2025-01-01&endDate=2025-99-99` | Inputs empty; unfiltered list; no crash | Unit | ECL-4.1 |
| TS-08 | Empty endDate param | `/account/orders?startDate=2025-01-01&endDate=` | Inputs empty; unfiltered list | Unit | — |
| TS-09 | Reversed range in URL | `/account/orders?startDate=2025-06-01&endDate=2025-01-01` | Inputs empty; unfiltered list; consistent with in-form reversed-range guard | Unit | — |
| TS-10 | Valid range with no orders | Future date range (e.g., 2035-01-01 to 2035-12-31) | URL carries params; "No orders found" empty state; inputs remain populated | E2E | — |
| TS-11 | B2B purchasing agent actor | Sign in as `@td(ORG_USER.email)`, apply date filter | Same URL-sync and restoration behavior as B2C actor | E2E | — |
| TS-12 | GraphQL query with date-range args | Valid ISO startDate / endDate passed to orders query | `errors[]` empty; `data.orders.items[]` all within range | GraphQL (runner-native) | — |
| TS-13 | GraphQL query with invalid date args | Non-ISO string passed to orders query | `errors[]` non-empty with descriptive message | GraphQL (runner-native) | ECL-4.1 |

---

### Proposed Business Logic Entry

```
PROPOSED-BL-ORD-010: Filter state URL contract [P2-ux]
Rule: On any paginated list view in the storefront that exposes user-controlled
  filters (orders, quotes, lists), the active filter state MUST be reflected in
  URL query params using ISO 8601 date strings (YYYY-MM-DD) for date fields and
  plain strings for enumeration fields. The URL must be the canonical source of
  truth: loading a URL with valid filter params must produce the same filtered
  view as manually applying those filters in the UI. Invalid or absent params
  must produce the default (unfiltered) view without error.
Source: AC-1, AC-2, AC-6 (this story); deferred from VCST-5153 item 4.
ProposedId: PROPOSED-BL-ORD-010
Status: Awaiting per-entry user approval before promotion to business-logic.md.
```
