# Sales-rep order filter chips: all three dismiss controls share one accessible name — High

## Status: CONFIRMED

**Not filed to any tracker** — draft only, awaiting a human decision.

**Severity:** High (P1) · **Type:** Accessibility (WCAG 2.2 4.1.2 Name, Role, Value; 2.4.6 Headings and
Labels) · **Invariant:** `BL-A11Y-002` (accessible naming)

**Env:** vcst-qa @ Platform 3.1064.0, Theme 2.57.0-alpha.2490, SalesRep 3.1008.0-pr-19-5e0f,
XOrder 3.1011.0, Xapi 3.1020.0

**Found by:** suite `097` case `SR-CO-037`, live-verified 2026-09-08 on `playwright-chrome`, signed in as
`SR_REP_PRIMARY` (Priya Rao, context org AcmeCorp, 5 served customers).
**Case:** SR-CO-037
**Archetype:** `PARITY`

## Summary
On the Sales Rep customer-orders filter chip row, every chip's dismiss control has the accessible name
**"Close chip"** — including the chip's own visible label is different, the control that removes it is
not. A screen-reader user hears "Close chip, button" three times in a row with no way to tell which
filter term each one removes.

**This is broader than the original finding.** The originally reported defect was a collision between the
two *date-boundary* chips. It is broader: **the status chip's close control shares the exact same name
too**, so all three are indistinguishable, not two.

## Steps to Reproduce
1. Sign in to the storefront as a sales rep (`@td(SR_REP_PRIMARY.email)`).
2. Go to `{{FRONT_URL}}/company/my-customers/@td(ORG_TECHFLOW.platform_id)/orders` (TechFlow).
3. Open **Filters** → set status `New` (59) + Created date **Custom date**, Start `01/01/2020`,
   End `12/31/2026` → **Apply**.
4. Confirm the grid re-filters correctly (Cancelled rows dropped, pager 7 → 6 pages).
5. Inspect the accessibility tree for each chip's dismiss control.
6. Tab from the search box through the chip row and operate each close control with Enter, then operate
   `Reset filters`.

## Expected vs Actual
Filtering itself is correct — the grid re-filters as expected, so this is purely an accessible-naming
defect, not a functional one.

| Chip visible label | Close control accessible name |
|---|---|
| `New` (status) | `"Close chip"` |
| `Start: 1/1/2020` | `"Close chip"` |
| `End: 12/31/2026` | `"Close chip"` |
| — (`Reset filters` button, for contrast) | `"Reset filters"` |

**Expected:** each dismiss control's accessible name incorporates the filter term it removes (as
`Reset filters` already demonstrates is the house pattern for this row).
**Actual:** all three dismiss controls share the identical generic name "Close chip".

## Keyboard operability — clean, and it narrows the fix
Tab order from the search box is: `Search orders` → `Filters` → chip1 × → chip2 × → chip3 × →
`Reset filters`. Every close control is reachable and focusable, and `Enter` on `Reset filters` cleared
all three chips (chip row removed from the DOM). So the controls are fully operable — the defect is
**purely the non-distinguishing accessible name**, not focus management or reachability.

## Evidence
`reports/regression/REG-2026-09-07-1342/screenshots/SR-CO-037-chip-row-duplicate-names.png`
`reports/regression/REG-2026-09-07-1342/screenshots/SR-CO-037-FAIL-chip-close-identical-accessible-names.png`
`reports/regression/REG-2026-09-07-1342/screenshots/SR-CO-037-tab1.png`
`reports/regression/REG-2026-09-07-1342/screenshots/SR-CO-037-tab2.png`

## Accessibility policy note
Per this repo's rules, a `BL-A11Y-*` finding on a functional/feature ticket is filed as its **own
standalone item at its real severity and does not block the parent run** — it is a cross-cutting property
of the surface, usually pre-existing on the shared chip component. This report is **not** shaped as a
sub-task of any story, and the run it came from is not failed by it.

## Fix Routing
- **Owning layer:** Layer 1 — Storefront
- **Repo:** `VirtoCommerce/vc-frontend` · **repoKind:** `frontend`
- **Component:** sales-rep customer-orders filter chip component
- **Routing confidence:** HIGH — give each chip's dismiss control a name incorporating its own filter
  term, e.g. "Remove filter: Start 1/1/2020".

