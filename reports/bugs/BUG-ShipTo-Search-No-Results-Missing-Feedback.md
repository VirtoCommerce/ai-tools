# BUG: Ship To Address Search Shows No Feedback for Empty Results

**Severity:** Low
**Component:** Ship To / Address Search
**Browser:** Firefox (Playwright MCP)
**Environment:** https://vcst-qa-storefront.govirto.com (QA)
**Platform Version:** 2.43.0-pr-2188-c129-c1290c2d
**Date:** 2026-03-03
**Reported By:** QA Agent (qa-testing-expert)

## Steps to Reproduce

1. Navigate to https://vcst-qa-storefront.govirto.com
2. Log in as `mutykovaelena@gmail.com` (BMW-Group organization)
3. Click the **Ship To** selector in the header bar (must have 7+ addresses for search field to appear)
4. Type **"zzzznonexistent"** in the search field
5. Observe the dropdown area below the search field

## Expected Result

A "No addresses found" or "No results match your search" message should appear in the empty dropdown area to provide clear user feedback.

## Actual Result

The dropdown area is completely blank — no addresses shown and no feedback message. The user receives no indication whether the search found nothing, is still loading, or encountered an error. Only the header ("Select address" + "Add new") and the search field with the clear (X) button remain visible.

## Evidence

- Screenshot (empty results, no message): `test-results/bugs/ship-to-2026-03-03/bug002-empty-search-no-message.png`
- Screenshot (valid search for comparison): `test-results/bugs/ship-to-2026-03-03/bug002-valid-search-results.png`
- Console errors: None
- Network errors: None — search is performed client-side by filtering the already-loaded address list; no additional network requests are made

## Technical Details

- Search is **client-side filtering** of the pre-loaded address list (no GraphQL query fired)
- Search is **case-insensitive** and matches across all address display fields (street, city, postal code, country)
- The search field with clear (X) button appears dynamically when the address count exceeds 6
- The clear button works correctly, restoring the full address list

## Impact

- **UX friction:** Users may be confused whether the search is broken, still loading, or simply found nothing
- **Accessibility:** Screen reader users get no audible feedback that results are empty
- **Low severity** because the workaround is straightforward (clear search and browse manually)

## References

- JIRA: [VCST-4723](https://virtocommerce.atlassian.net/browse/VCST-4723)
- Exploratory session: `reports/exploratory/exploratory-ship-to-2026-03-03.md`
