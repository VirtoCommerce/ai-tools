# Sales Rep filters drawer announces itself as a dialog but isn't one — Escape doesn't close it, focus never returns — P1

**Severity:** High (P1) · **Type:** Accessibility (WCAG 4.1.2 Name, Role, Value; 2.1.2 No Keyboard Trap; 2.4.3 Focus Order)
**Provenance:** **IN-SCOPE** — the drawer is new in `vc-frontend#2444`
**Invariants:** `BL-A11Y-001..004` (all P1) · **Case:** `SR-CO-016` / checklist row **V1** · **Ticket:** VCST-5733

**Env:** vcst-qa @ theme `2.57.0-pr-2444-5946-59465f5e` · Platform 3.1063.0 · store `B2B-store`

## Summary
The **FILTERS** trigger on the Sales Rep customer-orders list declares `aria-haspopup="dialog"`, but the
panel it opens has **`role=null`**, **no `aria-modal`**, and **no accessible name**. Pressing **Escape
twice does not close it**, and on close **focus is never restored** to the trigger.

The panel is the outlier inside its own feature, which is what makes this a defect rather than a house
convention: **its two child date pickers correctly set `role="dialog"` plus `aria-label="Calendar"`**, and
the same `vc-popover` component correctly emits `role="tooltip"` for chips and `role="menu"` for the
mega-menu elsewhere on the page. So the pattern is available and applied one level down — just not on the
panel that promises it.

For a screen-reader or keyboard-only rep this is the most consequential control on the page: it holds the
`Created date` pair, the multi-select `Select order status` checkboxes, `Select customer`, `Reset` and
`Apply`. Announced as a dialog, it is not navigable as one.

## Steps to Reproduce
1. Sign in to the storefront as a sales rep (`@td(SR_REP_PRIMARY.email)`).
2. Open `{{FRONT_URL}}/company/customer-orders`.
3. Inspect the **FILTERS** button — note `aria-haspopup="dialog"`.
4. Activate it and inspect the opened panel: read its `role`, `aria-modal`, and accessible name.
5. With the panel open, press **Escape**. Press **Escape** again.
6. Close the panel by its own control and observe where keyboard focus lands.
7. For the contrast, open one of the panel's own **Start date / End date** calendars and inspect *its*
   `role` and `aria-label`.

## Expected vs Actual
| | Expected | Actual |
|---|---|---|
| `role` on the panel | `dialog` (as the trigger advertises) | **`null`** |
| `aria-modal` | present for a modal panel | **absent** |
| Accessible name | present (e.g. "Filters") | **none** |
| Escape | closes the panel | **no effect, twice** |
| Focus on close | returns to the FILTERS trigger | **never restored** |
| Child calendars (control) | `role="dialog"` + name | ✅ correct — `aria-label="Calendar"` |

## Why it is IN-SCOPE
The drawer (`client-app/modules/sales-rep/components/sales-rep-orders-filters.vue`, +286 lines) is **added
by this PR**. The correct pattern is already in use by its own children and by the shared `vc-popover`'s
other consumers, so this is a gap in the new component, not an inherited platform limitation.

## Evidence
`reports/tickets/Sprint26-17/VCST-5733/design-report.md` (finding **VIS-02**), and
`reports/tickets/Sprint26-17/VCST-5733/summary.json` → `visual.invariant_failures[]`.

## Notes
Above the `/qa-test` 5d severity floor (`Critical`/`High`/`Medium`), so filed as a **Sub-task of
VCST-5733** per IN-SCOPE provenance. Severity graded once at 5a and not re-graded at 5d.

**Related but deliberately separate:** the focus *indicator* on this drawer's three date inputs measures
1.63:1 against a 3:1 requirement (**VIS-01**) — that one reproduces identically on `/account/orders`, so
the **token** is the defect and its blast radius is every `vc-input` in the storefront. It is PRE-EXISTING
and needs its own escalation rather than being folded in here.
