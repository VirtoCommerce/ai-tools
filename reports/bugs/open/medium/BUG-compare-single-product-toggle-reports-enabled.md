# Compare v2 — with one product the All/Differences toggle reports itself enabled while being inert — P2

## Status: FILED — VCST-5877
**Tracker:** [VCST-5877](https://virtocommerce.atlassian.net/browse/VCST-5877) — Sub-task of VCST-5735
**Found by:** VCST-5735 `/qa-test` FULL run · suite 098 (CMP-006) · triaged REAL_BUG · IN-SCOPE
**Archetype:** `SILENT`

**Severity:** P2 · **Type:** Control state / accessibility semantics (WCAG 4.1.2)

**Env:** vcst-qa @ theme `2.57.0-pr-2452-d1e4-d1e45b04` (vc-frontend PR #2452, open), Platform `3.1063.0`.

## Summary
With exactly one product in a tab the All/Differences control is made inert by a wrapper carrying
`pointer-events: none`, but the `<button>` elements keep `tabindex="0"` and expose **no `disabled` and no
`aria-disabled`**. A mouse user cannot click it; a keyboard or screen-reader user can focus it, is told it
is actionable, and gets nothing.

## Steps to Reproduce
1. Put exactly **one** product in a category tab and open `/compare`.
2. Inspect the All/Differences buttons, then Tab to them.

## Expected vs Actual
- **Expected:** a control that cannot be operated reports that it cannot be operated — `disabled`, or
  `aria-disabled="true"` and removal from the tab order.
- **Actual:** `<button tabindex="0" aria-label="Differences" class="vc-tab-switch__button">` with neither
  attribute. Playwright resolves it as *"visible, **enabled** and stable"*; the click is refused only
  because `.compare-table__tabs` intercepts pointer events.

The adjacent readout is separately incoherent: it renders **`Differ: 0 of 5 rows` above 5 rendered rows**.
That half has **no oracle** — the design spec's own rule sanctions `Differ: 0 of N` at N=1, and nothing in
the spec, the i18n or `BL-*` says the readout should be suppressed beside a disabled toggle. It is
recorded here as an observation and routed to `/qa-review-oracles` as a candidate, **not asserted as a
defect**.

Evidence: `reports/tickets/Sprint26-17/VCST-5735/screenshots/CMP-006-FAIL-single-product-toggle-not-disabled.png`

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | **FAIL** | attribute inspection + Tab walk |
| 2. Backend Admin | N/A | client-side control state |
| 3. GraphQL xAPI | N/A | no request involved |
| 4. Platform REST API | N/A | as above |

**Owning layer:** Layer 1 — Storefront

## Root Cause
The inert state is applied presentationally — a `vc-tab-switch--disabled` wrapper class plus
`pointer-events: none` — rather than on the control itself. Presentational inertness is invisible to the
accessibility tree and to the keyboard.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** `VirtoCommerce/vc-frontend`
- **repoKind:** frontend
- **Ownership hint:** platform (no `project-profile.json` — native deployment)
- **Component / module:** `client-app/shared/compare/components/compare-table.vue`, UI-kit `vc-tab-switch`
- **RCA anchor:** `vc-tab-switch--disabled` + `pointer-events: none` on the wrapper while the inner `<button>` keeps `tabindex="0"` and no `disabled`/`aria-disabled`
- **Routing confidence:** MEDIUM — the fix may belong in the shared `vc-tab-switch` component rather than in compare, which would widen its blast radius
