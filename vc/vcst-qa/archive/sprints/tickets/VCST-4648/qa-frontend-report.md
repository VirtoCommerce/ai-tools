# VCST-4648: Dark Mode (Coffee Theme) — Frontend Storefront Report

**Date:** 2026-03-04
**Browser:** Chromium (playwright-chrome)
**Environment:** FRONT_URL (QA storefront)

## Test Results

| Test Area | Result | Notes |
|-----------|--------|-------|
| DarkModeToggle (desktop header) | PASS | Cycles dark → light → auto → dark |
| CSS variable switching | PASS | Custom properties swap under `.dark` |
| localStorage persistence | PASS | Survives page reload |
| FOUC prevention | PASS | Synchronous script in head, no flash |
| Critical flows in dark mode (7 pages) | PASS | Catalog, product, search, cart, account, contacts |
| Mobile (375px) toggle + rendering | PASS | Toggle in mobile menu works, all content themed |

## Observation (Non-blocking)

15 Builder.io content blocks on the homepage have hardcoded light backgrounds that do not respond to dark mode. This is a CMS content issue, not a code defect. Recommended as a follow-up ticket.

## Decision: APPROVED WITH CONDITIONS

Dark mode feature is ready for release. The Builder.io content block styling should be addressed in a separate ticket.
