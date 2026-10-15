# BUG: Search input moves 99 px when the first category scope chip appears (no previous chip)

## Status: CONFIRMED (measured), not filed — below the /qa-test severity floor

**Severity: Low** (P3, BL-UI-003). Found during `/qa-test VCST-5817` (checklist B11). PRE-EXISTING: it is PR #2522's own declared "Known limit (c)" and the pre-PR build also grows from 0. Same root cause family as VCST-5817 (`reports/bugs/open/medium/BUG-Search-Bar-Scope-Chip-Layout-Shift.md`) — a residual of it, recorded separately per VC-UI-004 (a distinct state).

**Env:** http://localhost = vc-frontend PR #2522 build `2.60.0-pr-2522-6f90-6f902c9e`, API vcst-qa, store B2B-store, Chrome 1920×1080, anonymous.

## Summary
Entering a category from a page that shows no scope chip (home → header menu "Printers", or a cold category URL): the scope slot goes 0 → 80 px (loader with an empty label) → 94.89 px (chip "Printers"). The search input moves +84 px, then +14.89 px — +98.89 px in total. With no previous label there is nothing for the loader to reserve.

## Steps to Reproduce
1. Open `{{FRONT_URL}}/` (no category scope).
2. Before the click, install a MutationObserver on `.search-bar .vc-input__decorator` recording `input[data-test-id=global-search-query-input]` `getBoundingClientRect().left`, plus `PerformanceObserver('layout-shift')`.
3. Click "Printers" in the header menu; read the timeline after settle.

**Expected (BL-UI-003):** a state change in the slot does not move the adjacent search input.
**Actual:** input left 115.9 → 199.9 (+84) → 214.79 (+14.89). (The 0.234 layout-shift value recorded alongside includes the footer collapsing under the matcher loader — filter `sources[].node` to the slot when measuring.)

## Root Cause Analysis
`client-app/shared/layout/components/header/_internal/search-bar/search-bar.vue` — the slot has no width reservation when `lastScopeLabel` is undefined; the loader takes `SCOPE_MIN_WIDTH` (5rem), then the chip its label width. Fix direction (product decision, together with VCST-5817's residual): a fixed or bounded slot width.

## Fix Routing
Owning layer: Layer 1 — Storefront · Repo: `VirtoCommerce/vc-frontend` · Anchor: `search-bar.vue` `#prepend` · Confidence: MEDIUM.
