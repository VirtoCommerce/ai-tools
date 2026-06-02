# BUG-004-002: Search typo tolerance / "Did you mean" suggestions not implemented

## Severity
**Medium** — Functional gap; misspelled queries return zero results with no recovery suggestion. Affects search UX quality and discoverability.

## Environment
- Browser: Edge (playwright-edge)
- Storefront: https://vcst-qa-storefront.govirto.com
- Build: Ver. 2.48.x
- User: test-carlos.rodriguez-20260310@test-agent.com (BuildRight org)
- Date: 2026-05-04
- Run: REG-2026-05-04-1527 / Suite 004 / SRCH-NEW-037

## Linked Tests
- SRCH-NEW-037 — Search Typo Tolerance - Misspelled Query Returns Results

## Reproduction Steps
1. Navigate to https://vcst-qa-storefront.govirto.com/
2. Click search input
3. Type misspelled query "laptp" (should match "laptop")
4. Press Enter to submit
5. Observe results page

Repeat with "hoddie" (should match "hoodie").

## Expected Behavior
Per spec (SRCH-NEW-037 lines 197-200):
- Misspelled "laptp" returns laptop-related products OR shows a "Did you mean" correction
- Misspelled "hoddie" returns hoodie-related products OR shows a "Did you mean" correction
- "Did you mean" link if shown is clickable and navigates to corrected results

## Actual Behavior
Both typo queries return:
```
Sorry, your search for "laptp" didn't return any results
There are no results found
RESET SEARCH
```

```
Sorry, your search for "hoddie" didn't return any results
There are no results found
RESET SEARCH
```

- 0 results
- No "Did you mean" suggestion
- Only a "RESET SEARCH" button (which clears query and shows full catalog)

Note: For comparison, the correct queries work:
- "laptop" → 158 results
- "hoodie" → 4 results

## Evidence
- Search engine returns HTTP 200 (no server error)
- No JS errors in console
- Empty state is graceful (not a 500 page) — meets one part of the spec
- Does NOT meet typo tolerance OR "Did you mean" assertion

## Impact
- Users with single-character typos see zero results, leading to abandonment
- No recovery path other than manual re-entry of query
- Common e-commerce expectation (Amazon, Google, etc. all have fuzzy matching)

## Suggested Fix
Two options:
1. Enable Elasticsearch fuzzy matching (`fuzziness: "AUTO"`) on product name/description fields
2. Implement a "Did you mean" component that triggers when totalCount=0, suggesting top-1 fuzzy alternative

## Cross-References
- BL-SRCH-002 — Search fuzzy matching invariant
- ECL-3.1 — Fuzzy/typo edge cases
- E2E-SEARCH-004 — Fuzzy matching scenario
- GAP-CS-07 — Coverage gap: typo tolerance
