# BUG-005-001 — "Show in stock" checkbox not checked by default on search results

**Run**: REG-2026-05-04-1527
**Suite**: 005 (Search Filters & Advanced)
**Test Case**: SRCH-NEW-012
**Browser**: playwright-chrome
**Environment**: https://vcst-qa-storefront.govirto.com
**Severity**: Medium (UX inconsistency, not blocking)
**Priority**: P2

## Summary
The "Show in stock" checkbox on search results pages is unchecked by default, contradicting the documented expected behavior in test case SRCH-NEW-012 ([STATE] 'Show in stock' is checked on page load by default; [DOM] Chip for 'Show in stock' present in chip bar by default).

## Steps to Reproduce
1. Sign in as `qa-agent-slot1@virtocommerce.com` (TechFlow org)
2. Navigate to `https://vcst-qa-storefront.govirto.com/search?q=hoodie` (or `/search?q=printer`)
3. Inspect the toolbar containing "Purchased before", "Show in stock", "Available at branches" checkboxes

## Expected
- 'Show in stock' is checked on page load by default
- Corresponding chip appears in the chip bar by default
- Default search results exclude out-of-stock items

## Actual
- 'Show in stock' is **unchecked** on page load
- No corresponding chip displayed in the chip bar
- Default search results include out-of-stock items
  - For `?q=printer`: default 31 results; toggling "Show in stock" ON narrows to 28 (3 OOS items shown by default)

## Reproduces On
- /search?q=printer (31 → 28 after toggling on)
- /search?q=hoodie (4 results, all checkboxes unchecked)

## Toggle Behavior
- Toggling "Show in stock" ON works — count updates from 31 → 28
- However, no chip appears in chip bar even after toggling on (additional minor issue)

## Evidence
- Console: no JS errors during toggle
- Network: filter request returns 200 OK
- URL: no query param added when checkbox toggled (state appears local only)

## BL References
BL-CAT-002 (Filter logic narrows results)

## Notes
- Affects only the "default checked" expectation — the checkbox itself is functional
- Either the test case spec is outdated OR the storefront default state changed in a prior release
- Recommend either: (a) update SRCH-NEW-012 to reflect current behavior, or (b) restore default-checked state in storefront if it's the intended behavior

## Status
NEW — needs Product Owner triage to determine if this is a regression or a spec update
