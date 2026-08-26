# BUG: Dashboard widget reorder/resize is drag-only — no single-pointer or keyboard alternative — [Serious, SC 2.5.7]

**Env:** `@vc-shell/framework` 2.3.0 · Vendor Portal `https://vcmp-dev.govirto.com/apps/vendor-portal/` dashboard (gridstack) · Chromium 1440×900, Windows 11
**Found while testing:** VCST-5412 (`/qa-accessibility`, WCAG 2.2 AA gate)
**WCAG:** 2.5.7 Dragging Movements, Level **AA** — new in WCAG 2.2

## Summary

Reordering and resizing dashboard widgets can only be done by dragging. There is no button, menu,
arrow-key or any other single-pointer path to the same result, so users who cannot perform a drag
gesture (motor impairment, switch device, keyboard-only, head pointer) cannot change the dashboard
layout at all.

## Steps to reproduce

1. Sign in to `https://vcmp-dev.govirto.com/apps/vendor-portal/` — the dashboard loads with widgets.
2. Try to move or resize any widget **without** dragging — keyboard only, or single clicks.
3. Tab through the dashboard and observe that no widget or resize handle ever receives focus.

## Expected vs actual

**Expected (2.5.7):** any functionality that uses a dragging movement offers a **single-pointer
alternative** that is not a drag — e.g. a widget "Move / Resize" menu, arrow-key nudging on a focused
widget, or up/down reorder buttons.

**Actual:** dragging is the only path. Measured on the live dashboard:

| Probe | Result |
|---|---|
| Draggable elements (`.grid-stack-item`, resize handles) | **10** |
| `ui-resizable-handle` elements | **5** |
| `grid-stack-item` `tabIndex` | **-1** on every item — never focusable |
| `aria-grabbed` present | **no** |
| Resize handles: buttons inside / tabbable | **0 buttons**, not tabbable |
| Buttons inside widgets | 2–5 each — but these are the widget's own actions ("All offers →"), **not** layout controls |

So neither the widget nor its resize handle can be reached or operated without a pointer drag.

## Notes

- This also **upgrades** a finding from the behaviour pass on this ticket (BS-13, *"widget drag-reorder +
  resize NOT-EXECUTABLE — harness cannot drive gridstack"*): the operation is not merely hard to
  automate, it is **keyboard-inaccessible**, which is an AA conformance failure.
- Same family as the already-filed
  `BUG-vendor-portal-primary-nav-not-keyboard-operable.md` — the shell's interactive layer is broadly
  pointer-only even where its ARIA/landmark layer is correct. Worth treating as one workstream.
- Not a regression from PR #255: that PR scoped its sweep to **WCAG 2.1**, and 2.5.7 is new in **2.2**.
- Related, non-blocking: widget period selection (90D/12M) also resets after a reload, and layout
  persistence for widgets was only partially verified.

## Suggested fix

Make each `grid-stack-item` focusable (`tabindex="0"`) with an accessible name, and add either
(a) arrow-key move/resize while focused (with a documented modifier for resize), or (b) an explicit
per-widget menu offering Move up/down/left/right and Grow/Shrink. Gridstack does not provide this
out of the box — it needs a shell-level control surface.

## Impact

Every `@vc-shell/framework` consumer with a draggable dashboard. Under **EN 301 549 / the EAA** this is
an AA conformance failure for any EU-reachable deployment.

Full audit: `reports/tickets/Sprint26-15/VCST-5412/wcag22-accessibility-audit.md`.

---

## Resolution — FIXED (verified 2026-08-26), with one residual split out

**Fixed by [vc-shell#272](https://github.com/VirtoCommerce/vc-shell/pull/272) — "feat(a11y): rearrange dashboard widgets from the keyboard"**, merged **2026-07-30** (two days after this report), plus follow-ups [#283](https://github.com/VirtoCommerce/vc-shell/pull/283) (widget size as live state so keyboard resize accumulates) and [#303](https://github.com/VirtoCommerce/vc-shell/pull/303) (let keyboard events reach controls inside a widget). Shipped in **v2.4.0**. Tracked as VCST-5600.

The implemented key map is exactly the "shell-level control surface" this report said gridstack could not provide:

| Key | Action |
|---|---|
| `Tab` | focus between widgets |
| `Enter` / `Space` | pick up, and drop |
| Arrows | move one grid cell while picked up |
| `Shift`+arrow | resize one cell |
| `Escape` | cancel, restore original position |

Arrow keys stay inert until a widget is explicitly picked up, so interactive content inside widgets keeps working — the design problem this report flagged when it noted widgets contain their own action buttons.

**Live measurement on vcmp-dev — the inverse of this report's probe table:**

| Probe | Reported | Now |
|---|---|---|
| `.grid-stack-item` `tabIndex` | **-1** on every item | **0** on every item |
| item role | none | **`listitem`** (container `role="list"`) |
| item accessible name | none | `"Last products, widget 1 of 5. Press Enter to pick up and rearrange with the arrow keys."` |

Five widgets, all focusable and self-describing. Moves are clamped at grid edges and at the declared 2×2 `gs-min-w`/`gs-min-h`; each step is announced through the pre-existing `aria-live` region, and the picked-up widget is outlined so sighted keyboard users see the state too. #272 ships 8 unit tests (tab order, arrows inert before pick-up, one-cell move, no negative coordinates, Shift-resize, Escape restores, grabbed class lifecycle, layout persisted on drop).

**Not verified here** — and #272 says so itself: its unit tests mock `useGridstack`, so they prove the key handling and the calls made, not that gridstack repositions the element. Collision behaviour on moving into an occupied cell still wants one manual pass. I did not perform it: it mutates the shared vcmp-dev dashboard layout, and `Escape` only restores within a single pick-up. The focusability and affordance claims above are measured; the *movement* claim rests on #272's tests.

**One residual, split out rather than closed here.** #272's body states both aria-labels were rewritten. Only one was: the live container still announces `"Dashboard widgets. Drag widgets to rearrange."` — the exact "tells screen-reader users to do the one thing they cannot" wording the PR set out to remove. Filed as `BUG-vc-shell-dashboard-container-arialabel-still-says-drag-only.md`. It does not reopen this report: the *functionality* exists and the per-widget labels teach it.

**Verdict: VERIFIED FIXED** (WCAG 2.5.7 — a non-drag alternative now exists and is reachable).
