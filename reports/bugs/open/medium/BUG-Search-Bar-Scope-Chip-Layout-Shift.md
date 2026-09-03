# BUG: Search bar input shifts horizontally when the category-scope indicator changes

## Status: CONFIRMED

**Tracker:** VCST-5817 · **Severity:** P2 (Medium) · **Type:** UI / layout stability · **Invariant:** BL-UI-003

**Env:** vcst-qa @ theme `vc-theme-b2b-vue-2.57.0-pr-2436-f3bf-f3bffc67`, Chrome 1920×1080

## Summary

During a category→category breadcrumb navigation the search bar's scope indicator passes through
three widths — chip → empty → fixed-width skeleton → new chip. The search input is laid out after it,
so it travels **115.43px horizontally** across the transition. Chrome records the movement as a
layout shift with `hadRecentInput: false`, i.e. it counts toward CLS.

Pre-existing; found while verifying VCST-5729. That PR changed which states are reachable, not the
absence of a width contract.

## Steps to reproduce

1. Open a category page that has a child category (e.g. `{{FRONT_URL}}/seed-electronics`).
2. Navigate into the child category so the search bar shows its scope chip.
3. Click the parent category link in the breadcrumb.
4. Watch the search input's left edge while the scope indicator changes.

## Expected vs Actual

**Expected (BL-UI-003):** "skeleton → content swap MUST NOT move adjacent elements." The skeleton
should reserve the space its resolved content will occupy.

**Actual — measured timeline** (`getBoundingClientRect().left` of `INPUT.vc-input__input`, recorded
via MutationObserver so the transient states are captured):

| t (ms) | Scope indicator state | `input.left` | Δ from previous |
|---|---|---|---|
| 10049 | chip "Peripherals" | 231.52 | — |
| 17958 | empty (chip removed) | 116.09 | **−115.43** |
| 18137 | skeleton (84.00px ≡ `min-width:5rem`) | 200.09 | **+84.00** |
| 18304 | chip "Electronics" | 229.77 | **+29.68** |

Total excursion **115.43px**. `input.top` = 66 at every state — the shift is purely horizontal.

Chrome `PerformanceObserver('layout-shift')`, `hadRecentInput: false`:
`value: 0.02157`, source `INPUT.vc-input__input` moving `left 116 → 232`.

## Root cause

`search-bar.vue:28` — the loading indicator declares `min-width="5rem"` (84px). The scope chip
(same file, the `VcButton` in the `v-else` block) declares **no width contract at all**; it is sized
by its label text, so its width varies with the category name. The two states can therefore never
agree, and the empty state between them is 0px wide, which is what produces the largest single jump.

## Suggested fix

Give the scope slot itself a stable width, rather than the indicators inside it — e.g. reserve the
slot while `preparingScope` is true so it never collapses to 0, and give the skeleton and the chip a
shared min-width. Reserving the space is what BL-UI-003 asks for.

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | **FAIL** | measured timeline above + layout-shift entry |
| 2. Backend Admin | N/A | pure client-side layout; no admin surface |
| 3. GraphQL xAPI | N/A | no data involved — same payload renders correctly |
| 4. Platform REST API | N/A | no data involved |

**Owning layer:** Layer 1 — Storefront. REST/GraphQL/Admin are not exercised by this defect.

## Notes on evidence

No screenshot is attached deliberately. The defect exists only in states lasting ~160–380ms, and a
settled-state screenshot shows nothing wrong — the same false-PASS trap as VCST-5276, where a
screenshot passed a layout bug that numeric geometry caught. The `getBoundingClientRect` timeline and
the layout-shift entry are the evidence.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** `VirtoCommerce/vc-frontend`
- **repoKind:** frontend
- **Ownership hint:** platform (no client profile present ⇒ native VirtoCommerce)
- **Component / module:** storefront header search bar — scope indicator slot
- **RCA anchor:** `client-app/shared/layout/components/header/_internal/search-bar/search-bar.vue:28` (`min-width="5rem"` on the loading `VcButton`; the chip `VcButton` in the `v-else` has no width contract)
- **Routing confidence:** HIGH — single file, single component, RCA confirmed in source via `search_code`

## References

- `BL-UI-003` — No state-induced layout shift (`knowledge/oracles/business-logic.md`)
- Found during: VCST-5729 `/qa-test`, regression run `REG-2026-08-27-0952`
- Reproduced first-hand 2026-08-27
