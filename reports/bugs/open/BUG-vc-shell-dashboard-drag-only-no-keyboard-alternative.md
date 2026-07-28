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
