# BUG-004-001: Search dropdown does not return to Hints state after clicking Clear (X) button

## Severity
**Low** — UX inconsistency, not a functional blocker. Users can still resume searching by typing or navigating.

## Environment
- Browser: Edge (playwright-edge)
- Storefront: https://vcst-qa-storefront.govirto.com
- Build: Ver. 2.48.x
- User: test-carlos.rodriguez-20260310@test-agent.com (BuildRight org)
- Date: 2026-05-04
- Run: REG-2026-05-04-1527 / Suite 004 / SRCH-NEW-004

## Linked Tests
- SRCH-NEW-004 — Search Bar - Clear Button Resets Input to Empty

## Reproduction Steps
1. Navigate to https://vcst-qa-storefront.govirto.com/ (any page)
2. Click the global search input in the main navigation
3. Type "hoodie" in the input
4. Wait for autocomplete dropdown to appear (HINTS + PRODUCTS sections)
5. Observe the Clear (X) button at the right edge of the input
6. Click the Clear (X) button
7. Observe state of input and dropdown

## Expected Behavior
Per spec assertion in SRCH-NEW-004 (regression/suites/Frontend/search/004-search-core.csv line 89):
- Input cleared to empty ✓
- Clear button disappears ✓
- Focus retained on input ✓
- **Dropdown returns to "Hints" state showing prior searches** ✗

## Actual Behavior
After clicking the Clear (X) button:
- Input value = "" (correct)
- Input retains focus (correct)
- **Dropdown is dismissed/closed entirely** (incorrect — should revert to Hints state)
- Subsequent re-click on the focused input does NOT re-open the dropdown
- User must either type or blur+refocus to summon the dropdown again

## Evidence
- Input verified empty: `inputValue: ""`, `focused: true`
- Dropdown DOM check: `[data-test-id="global-search-suggestions-dropdown"]` returns null
- Console: no JS errors related to clear action

## Impact
- User experience inconsistency — clear button feels like it dismisses the search context entirely
- Minor regression vs. expected UX pattern; users can still continue searching by typing
- Affects discovery: users who clear input intending to refine search to a different prior term lose the Hints visibility

## Suggested Fix
After Clear (X) click, the dropdown should remain open (or re-open) showing only the Hints/Categories empty-state content (without the PRODUCTS section), matching the initial focus-on-empty-input state described in SRCH-NEW-001.

## Cross-References
- SRCH-NEW-001 (Click Opens Dropdown Empty State) — passing baseline behavior on initial click
- BL-SEARCH-002 — Search dropdown UX invariant
