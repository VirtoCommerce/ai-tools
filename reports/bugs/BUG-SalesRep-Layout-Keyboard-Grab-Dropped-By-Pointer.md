# BUG — Sales Rep saved layout: a pointer press silently drops a live keyboard grab, leaving the block moved and Escape inert

**Severity:** Medium (P2) · Functional / A11y — keyboard-only reordering · Storefront (Sales Rep hub + customer profile)
**Env:** vcptcore-qa @ Platform 3.1053.0, theme `vc-theme-b2b-vue-2.55.0-pr-2400-c6ca`, `VirtoCommerce.SalesRep 3.1001.0-pr-6-4f32` · Chrome 1920×1080
**Ticket:** VCST-5367 (vc-frontend PR #2400)

## Summary

While a block is grabbed for keyboard sorting, any **mouse press on another draggable block** silently
ends the grab *without restoring the block's original position* and *without an `aria-live` announcement*.
The arrow-key move is therefore committed by accident, and a subsequent **Escape does nothing** (there is
no grab left to cancel). Escape itself is not broken — it restores correctly in every case where the grab
is still live (verified on all three regions).

## Steps to reproduce

1. Sign in as a Sales Rep, open `/company/dashboard`, click **Edit layout**.
2. Click the **Reorder Recent orders** handle in the left column (order is `orders, top_sellers`).
3. Press **Space** → announcer: `Recent orders grabbed. Position 1 of 2. Use the arrow keys to move it, space to drop it, escape to cancel.`
4. Press **ArrowDown** → announcer: `Recent orders moved to position 2 of 2.` DOM order is now `top_sellers, orders`.
5. **Click the "Reorder Top sellers" handle** (any mouse press on a draggable block, or on the stat card itself in the stats row, reproduces).
6. Press **Escape**.

## Expected vs Actual

| | |
|---|---|
| **Expected** | Either the grab survives the pointer press so Escape still restores position 1, or the grab is cancelled the same way a blur-cancel is — position restored to 1 and `Move of Recent orders cancelled.` announced. |
| **Actual** | `aria-pressed` clears but the block **stays at position 2**; the announcer still shows the stale `Recent orders moved to position 2 of 2.` — no `cancelled` announcement. Escape at step 6 changes nothing at all. |

## Why this is not one of the accepted gaps

The ticket's 2026-07-30 QA notes accept: the "Editing layout" button acting as Cancel, no unsaved-changes
guard, keyboard park/restore appending to the end, a stat card announcing only "Reorder {name}", no
concurrency control, no grab cursor on the widget header, and a plain click on the handle doing nothing.
**Escape failing to restore is not on that list.** The blur-cancel path (clicking a *neutral*, non-draggable
area) does restore correctly — verified: order returned to the pre-grab arrangement and
`Move of Recent orders cancelled.` was announced — so the two pointer paths are inconsistent.

## Root cause (likely)

`client-app/modules/sales-rep/components/layout-region.vue` — the Sortable option
`onChoose: () => release()`. `release()` (in `composables/useKeyboardSort.ts`) clears `grabbedId` and
`originIndex` **without** calling `onReorder(id, originIndex)`, unlike `cancel()`. `onChoose` fires on
mousedown, i.e. before the handle's `blur` handler, so `onBlur` then sees `isGrabbed === false` and the
restoring cancel path never runs. Using `cancel()` (or cancelling before releasing) would keep the two
pointer paths consistent.

## Scope

Reproduces identically on the **dashboard stats row** (horizontal), the **dashboard `mainLeft` column**,
and the **customer-profile `mainRight` rail** — i.e. it is in the shared composable/region, not one host.
Draft-only: **Cancel** or **Reset** still discards it, and nothing is persisted unless the rep clicks Save.

## Related behaviour — RULED AN ACCEPTED GAP, not part of this defect

Escape also cannot undo a **keyboard park**: after grabbing a stat card and pressing ArrowDown
(announcer `My customers hidden.`), Escape is a no-op because `toggleHidden()` clears `grabbedId` on
purpose ("the block leaves this list, so the grab is released rather than followed across containers").
Recovery exists — the card keeps focus in the parked zone, and Space + ArrowUp restores it
(`My customers shown.`).

**Decision (2026-08-04, QA owner): accepted gap — no fix required.** It joins the ticket's existing
accepted list alongside "keyboard park/restore appends to the end of the target zone". Current behaviour
is pinned by test case `SR-HD-044` so it is documented rather than rediscovered; do **not** file it as a
defect. This is recorded here only because the two behaviours look identical from the outside — a tester
who parks a card with ↑/↓ and then presses Escape sees "Escape does nothing", which is the accepted gap,
**not** the defect above. The defect above is specifically a *pointer press* silently ending a grab
without restoring.

## Evidence

`reports/tickets/VCST-5367/screenshots/SR-CP-036-rail-unmounted-edit-mode-light.png` (edit-mode chrome,
same build). No console errors accompany the failure — the state change is silent, which is what makes it
hard to notice.
