# BUG: [Search] Keyboard focus is lost to the page body after removing the category scope chip from the search bar

## Status: FILED — [VCST-6254](https://virtocommerce.atlassian.net/browse/VCST-6254) (Medium, standalone, relates to VCST-5817)

**Severity: Medium** · Provenance: PRE-EXISTING (A/B control: vcst-qa-storefront 3.0.0-alpha.2685) · Found: /qa-test VCST-5817, 2026-10-09

_Found by an agent during /qa-test VCST-5817 (search-scope slot). Pre-existing — not introduced by vc-frontend PR #2522. Accessibility: WCAG 2.4.3 Focus Order (BL-A11Y-001)._

**Env:** local storefront = vc-frontend PR #2522 build `2.60.0-pr-2522-6f90-6f902c9e` (API vcst-qa, store B2B-store, anonymous). *Control:* vcst-qa-storefront `3.0.0-alpha.2685` (no PR #2522) — reproduces identically, so this is *pre-existing*, not caused by PR #2522.

## Summary
Activating the header search bar's category scope chip ("Remove: <category>") removes it from the DOM and nothing receives focus afterwards: `document.activeElement` becomes `<body>`. A screen reader announces nothing and the focus ring disappears. Same pattern as VCST-6198 (Sales Rep filter chips).

## Steps to reproduce
1. Open `/printers` — the search bar shows the chip "Remove: Printers".
1. Keyboard: click into the search input, press Shift+Tab to the chip, press Enter.
1. Mouse: reload, click the chip.
1. After each, check where focus is; then press Tab once.

## Expected vs Actual
**Expected:** after removal, focus moves to a logical place — the search input.
**Actual:** `activeElement` = `BODY` on both paths. Keyboard (Firefox): the next Tab lands in the input. Mouse: the next Tab restarts from the top ("Skip to main content"). Identical on the control build.

## Root cause
`client-app/shared/layout/components/header/_internal/search-bar/search-bar.vue` (dev @ 1850afa6) L33–44 renders one VcButton per scope item; `onScopeItemClick` (L174–176) only calls `removeScopeItemById` (`useSearchScore.ts` L36–38). The focused button leaves the v-for and unmounts; no focus is restored.

## Suggested fix
After `removeScopeItemById`, `await nextTick()` and focus the search input.

## Layer validation
||Layer||Result||
|Storefront Frontend|FAIL|
|Backend Admin / GraphQL / REST|N/A|

## Fix routing
* Owning layer: Layer 1 — Storefront · Repo: `VirtoCommerce/vc-frontend` · RCA anchor: `search-bar.vue:174` · Confidence: HIGH

## References
Found during VCST-5817 /qa-test (2026-10-09), checklist B10, regression case SRCH-032 (run REG-2026-10-09-1616).