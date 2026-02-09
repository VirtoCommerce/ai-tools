# BUG: Organization Switcher Search Does Not Filter As-You-Type and Returns Incorrect Server-Side Results

| Field | Value |
|-------|-------|
| **Bug ID** | BUG-ORG-SEARCH-001 |
| **JIRA Reference** | VCST-4357 |
| **Related Test Cases** | C414018, C414019 |
| **Date Reported** | 2026-02-09 |
| **Reported By** | qa-frontend-expert |
| **Environment** | QA Storefront |
| **Storefront URL** | https://vcst-qa-storefront.govirto.com |
| **Backend URL** | https://vcst-qa.govirto.com |
| **Storefront Version** | v2.41.0-alpha.2219 |
| **Store** | B2B-store |
| **Browser** | Google Chrome (latest, via Playwright MCP) |
| **OS** | Windows |

---

## Summary

The organization switcher dropdown search field has **two distinct bugs** that degrade the user experience for B2B customers assigned to multiple organizations (>10):

1. **Frontend Bug:** Typing in the search field does NOT filter the organization list in real time. The list only filters when the user explicitly clicks the search button (magnifying glass icon) or presses the Enter key. There is zero visual feedback (no filtering, no highlighting) while typing.

2. **Backend Bug:** When the search is triggered (via button click or Enter), the GraphQL `GetOrganizations` query returns organizations that do NOT match the search term by name. The server appears to perform full-text search across multiple indexed fields (possibly description, address, or internal metadata), not just the organization name.

---

## Severity Assessment

| Bug | Severity | Priority | Justification |
|-----|----------|----------|---------------|
| Bug 1 (No as-you-type filtering) | **Medium (P2)** | High | Standard UX expectation for search fields. Users expect instant feedback. Workaround exists (press Enter or click button). Affects all multi-org B2B users. |
| Bug 2 (Incorrect search results) | **Medium (P2)** | Medium | Returns extra non-matching results, which is confusing but does not prevent finding the correct organization. The correct match IS included in results. |

**Combined Impact:** These two bugs together create a poor experience -- the user types, sees nothing happen, then must take an explicit action, and even then gets cluttered results with non-matching organizations mixed in.

---

## Preconditions

- User must be assigned to **more than 10 organizations** (the search bar only appears for >10 orgs)
- User must be signed in to the B2B storefront
- Test account used: `mutykovaelena@gmail.com` (Elena Mutykova, default org: BMW-Group, 30 organizations assigned)

---

## Steps to Reproduce

### Bug 1: No As-You-Type Filtering

| Step | Action | Expected Result | Actual Result | Status |
|------|--------|-----------------|---------------|--------|
| 1 | Navigate to `https://vcst-qa-storefront.govirto.com` and sign in | Storefront loads, user is signed in | As expected | PASS |
| 2 | Click the organization name in the header (e.g., "BMW-Group") to open the organization switcher dropdown | Dropdown opens showing search bar + list of all organizations | As expected -- 30 organizations visible with search bar at top | PASS |
| 3 | Type "Gear" into the search field (keystroke by keystroke) | List should filter in real time, showing only organizations containing "Gear" (e.g., "Gear" or "Gearhead Supplies") | **NOTHING HAPPENS.** All 30 organizations remain visible. No filtering. No highlighting. No DOM changes whatsoever. | **FAIL** |
| 4 | Without clearing the field, click the search button (magnifying glass icon) | List filters to matching organizations | List correctly filters to show only "BMW-Group" (current org, always shown) and "Gear" | PASS |
| 5 | Click the X (clear) button in the search field | Full list restores | Full list of 30 organizations restores correctly | PASS |

### Bug 2: Incorrect Server-Side Search Results

| Step | Action | Expected Result | Actual Result | Status |
|------|--------|-----------------|---------------|--------|
| 6 | With the dropdown still open, type "ACME" in the search field | (No filtering expected due to Bug 1) | No filtering occurs | Known Bug 1 |
| 7 | Press Enter to trigger the search | List should filter to show only organizations containing "ACME" in their name | List filters but shows **12 organizations**, only **3 of which** contain "ACME" in their name | **FAIL** |
| 8 | Observe the filtered results | Expected: BMW-Group (current), ACME Store, ACME Store 2, ACME Store 3 (4 total) | Actual: BMW-Group, ACME Store, ACME Store 2, ACME Store 3, **plus** Aurora Market, Bayfront Traders, Desert Cove Market, Harbor Supplies, Lakeview Goods, Lone Star Outfitters, Redwood Provisions, Sunrise Bazaar (12 total) | **FAIL** |

---

## Edge Case Testing Results

| Test Case | Search Term | Trigger Method | Result | Status |
|-----------|-------------|----------------|--------|--------|
| Type only (no submit) | "Gear" | Keystroke only | No filtering at all | BUG (Bug 1) |
| Exact match + button click | "Gear" | Button click | Correctly filters to BMW-Group + Gear | PASS |
| Partial match + button click | "Coffee" | Button click | Correctly filters to BMW-Group + Coffee shop | PASS |
| Case insensitive | "coffee" (lowercase) | Enter key | Returns "Coffee shop" -- case insensitive works | PASS |
| Non-existent term | "xyz999nonexistent" | Enter key | Shows "No results found" message | PASS |
| Clear search | Click X button | Button click | Restores full list of all organizations | PASS |
| Broad term returning extras | "ACME" | Enter key | Returns 12 orgs, only 3 match by name | BUG (Bug 2) |

---

## Technical Analysis

### Frontend Analysis (Bug 1)

**Search Input Element:**
```html
<input id="input-1926" type="search" class="vc-input__input" placeholder="Search">
```

**DOM Inspection Results:**
- When text is typed in the search field, JavaScript evaluation confirmed:
  - 30 organization radio button items remain in the DOM
  - ALL items have `display: flex`, `visibility: visible`, `opacity: 1`
  - ZERO items are hidden, collapsed, or have `display: none`
  - ZERO `<mark>`, `[class*="highlight"]`, or `[class*="match"]` elements exist
  - No Vue reactivity binding was detected on the input element via `__vue__` or `__vueParentComponent`

**Root Cause Assessment:**
The search input field likely lacks an `@input` or `@keyup` event listener with a debounced handler that triggers filtering. The filter/search action is only bound to:
- The search button's `@click` event
- The form's `@submit` event (triggered by Enter key)

There is no client-side filtering at all -- the search is entirely server-side via GraphQL.

### Backend / API Analysis (Bug 2)

**GraphQL Query Captured:**
```graphql
query GetOrganizations(
  $after: String
  $first: Int
  $sort: String
  $searchPhrase: String
) {
  me {
    contact {
      organizations(
        after: $after
        first: $first
        sort: $sort
        searchPhrase: $searchPhrase
      ) {
        items {
          ...organizationFields
        }
        totalCount
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
}
```

**Request Variables (for "ACME" search):**
```json
{
  "first": 30,
  "sort": "name:asc",
  "searchPhrase": "\"ACME\""
}
```

**Key Observation:** The search phrase is wrapped in escaped double quotes before being sent to the server: `"\"ACME\""`. This suggests the frontend wraps the user input in quotes.

**Server Response:** The GraphQL response contains 12 organization items. Only 3 have "ACME" in their name. The remaining 8 non-matching organizations (Aurora Market, Bayfront Traders, Desert Cove Market, Harbor Supplies, Lakeview Goods, Lone Star Outfitters, Redwood Provisions, Sunrise Bazaar) are returned by the server despite not containing "ACME" in their name.

**Root Cause Assessment:**
The `searchPhrase` parameter in the `GetOrganizations` resolver performs full-text search across multiple indexed fields in the Elastic Search / Lucene index, not just the `name` field. It likely searches across:
- Organization name
- Organization description
- Organization addresses
- Custom dynamic properties
- Other indexed metadata

This causes organizations to appear in results when "ACME" matches any indexed field, even if it does not appear in the organization name that the user sees in the dropdown.

### Network Analysis

| Observation | Detail |
|-------------|--------|
| **Typing triggers API calls?** | NO -- zero GraphQL requests are sent while typing |
| **Button click triggers API call?** | YES -- sends `GetOrganizations` with `searchPhrase` variable |
| **Enter key triggers API call?** | YES -- same query as button click |
| **Clear (X) triggers API call?** | YES -- sends `GetOrganizations` with `searchPhrase: ""` (empty string) |
| **Console errors during search?** | Only unrelated: `ServiceWorker registration failed (404)` |
| **Failed network requests?** | None -- all GraphQL calls return HTTP 200 |

---

## Evidence

### Screenshots

| # | Filename | Description |
|---|----------|-------------|
| 1 | `test-results/chrome/bug-org-search-01-initial-state.png` | Catalog page before opening the organization dropdown |
| 2 | `test-results/chrome/bug-org-search-02-dropdown-open-all-orgs.png` | Dropdown open showing all 30 organizations with search bar at top |
| 3 | `test-results/chrome/bug-org-search-03-gear-typed-no-filtering.png` | **BUG 1 EVIDENCE:** "Gear" typed in search field, all 30 organizations still visible, zero filtering |
| 4 | `test-results/chrome/bug-org-search-04-after-clicking-search-button-filtered.png` | After clicking search button: correctly filtered to BMW-Group + Gear (2 items) |
| 5 | `test-results/chrome/bug-org-search-05-enter-ACME-wrong-results.png` | **BUG 2 EVIDENCE:** "ACME" search via Enter returns 12 organizations, only 3 contain "ACME" in name |
| 6 | `test-results/chrome/bug-org-search-06-no-results-found.png` | "xyz999nonexistent" correctly shows "No results found" |

### Console Logs

```
Errors during testing session:
- ServiceWorker registration failed: A bad HTTP response code (404) was received when fetching the script.
  (Unrelated to organization search functionality)

No JavaScript errors related to search/filtering observed.
```

---

## Impact Assessment

### Who Is Affected?
- All B2B customers assigned to **more than 10 organizations**
- This is a core B2B workflow for multi-organization users who need to switch between companies

### User Experience Impact
1. **Bug 1:** User types in search field, sees no response. This feels broken. Users may think the feature is non-functional and manually scroll through 30+ organizations instead.
2. **Bug 2:** When the user does trigger a search, irrelevant organizations appear in results, creating confusion (e.g., searching "ACME" shows "Aurora Market").

### Business Impact
- Reduced efficiency for B2B users managing multiple organizations
- Increased support tickets from confused users
- Perception of poor product quality in a core B2B differentiating feature

### Frequency
- Every time a multi-org user attempts to search for an organization
- Reproduction rate: 100%

---

## Workaround

**For Bug 1 (no as-you-type filtering):**
- After typing the search term, press Enter or click the magnifying glass button to trigger filtering
- The search DOES work when explicitly submitted

**For Bug 2 (incorrect results):**
- The correct matching organization IS included in the results -- the user just needs to visually scan past the extra non-matching entries
- Use more specific search terms to reduce the number of false positives

---

## Recommendations

### For Bug 1 (Frontend Fix -- Recommended)

**Option A (Preferred): Add client-side as-you-type filtering**
- Add an `@input` event handler on the search input with a 300ms debounce
- Filter the displayed organization list client-side by matching the search term against the organization name
- This avoids unnecessary server calls and provides instant feedback
- The full list of organizations is already loaded in the component (30 items max due to `first: 30` query parameter)

**Option B: Add debounced server-side search on input**
- Add an `@input` event handler that sends the `GetOrganizations` GraphQL query after 300-500ms of inactivity
- This leverages the existing server-side search but adds a typing delay

### For Bug 2 (Backend Fix -- Recommended)

- Review the Elastic Search index configuration for the `Organization` entity
- Either:
  - Restrict the `searchPhrase` matching to the `name` field only (for this specific use case)
  - Add a `searchFields` parameter to the `GetOrganizations` query to let the frontend specify which fields to search
  - Update the frontend to pass a more specific query (e.g., `name:ACME` syntax if supported)

---

## Related Information

| Item | Reference |
|------|-----------|
| JIRA Ticket | VCST-4357 |
| Failed Test Cases | C414018 (Switch organization via search), C414019 (Search edge cases) |
| Regression Report | `reports/regression/frontend-regression-report-2026-02-09.md` |
| Storefront Repository | https://github.com/VirtoCommerce/vc-frontend |
| Component | Organization Switcher Dropdown (header) |
| GraphQL Query | `GetOrganizations` (xAPI layer) |
| Search Technology | Server-side via Elastic Search / Lucene |

---

*Report generated: 2026-02-09 | Investigation performed using Playwright MCP (Chrome) and Chrome DevTools MCP*
