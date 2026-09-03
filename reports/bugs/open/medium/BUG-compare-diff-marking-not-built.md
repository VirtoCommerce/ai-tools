# Compare v2 — differing rows carry no dot and no amber fill; the Differences readout names a count nothing marks — P2

## Status: FILED — VCST-5872
**Tracker:** [VCST-5872](https://virtocommerce.atlassian.net/browse/VCST-5872) — Sub-task of VCST-5735
**Found by:** VCST-5735 `/qa-test` FULL run · 5b verifier live probe (`playwright-edge`) · IN-SCOPE
**Archetype:** `FALLBACK`

**Severity:** P2 · **Type:** Incomplete delivery against the ticket description

**Env:** vcst-qa @ theme `2.57.0-pr-2452-d1e4-d1e45b04` (vc-frontend PR #2452, open), Platform `3.1063.0`.

## Summary
Bullet 3 of the description says differing rows are "additionally marked with a **dot + soft amber row
fill**". Neither exists. Row backgrounds are **pure index zebra**, so a customer reading the board cannot
tell which rows the filter considers different — while the header simultaneously tells them a number
("Differ: 6 of 8 rows") that nothing on screen corresponds to.

## Steps to Reproduce
1. Open `/compare` with 2+ products in one tab that differ on some rows and match on others.
2. Read the row backgrounds in the **All** view and compare a differing row against an identical one.

## Expected vs Actual
- **Expected:** differing rows carry a dot before the label and a soft amber row fill.
- **Actual:** the only row classes are `compare-table__row` and `compare-table__row--alt` (index zebra).
  Measured: differing row *Brand* = `rgba(0,0,0,0)`; identical row *Min. order qty* and differing row
  *Flavor* are **both** `#FAFAFA`. No dot element anywhere.

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | **FAIL** | computed background per row; class inventory |
| 2. Backend Admin | N/A | presentation only |
| 3. GraphQL xAPI | N/A | `differs` is computed client-side |
| 4. Platform REST API | N/A | as above |

**Owning layer:** Layer 1 — Storefront

## Root Cause
`row.differs` is computed and used **only** to filter `visibleRows`. It is never bound to a class or a
style, so it drives visibility and nothing else. The marking was specified but not wired.

## Note on the design prototype — do not use it to dismiss this
The Claude Design prototype's own row component renders neither the dot nor the amber fill either, and an
earlier pass in this run therefore recorded the finding as `UNSPEC` ("no design oracle") and routed it to
an advisory bucket that can never fail a ticket. **That was wrong.** The ticket states the promise in its
own words, and the ticket is the oracle; the prototype's omission is a gap in the prototype. The
disposition was reversed and the reversal recorded in `summary.json.visual.advisory` so it is auditable.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** `VirtoCommerce/vc-frontend`
- **repoKind:** frontend
- **Ownership hint:** platform (no `project-profile.json` — native deployment)
- **Component / module:** `client-app/shared/compare/components/compare-table.vue`
- **RCA anchor:** `row.differs` consumed only by the `visibleRows` filter; never bound to a row class or style
- **Routing confidence:** HIGH
