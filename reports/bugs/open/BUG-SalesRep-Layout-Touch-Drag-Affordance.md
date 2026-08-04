# BUG — Sales Rep saved layout: on touch, reordering silently requires an undiscoverable 200 ms press-and-hold while the on-screen instruction says plain "drag"

**Severity:** Medium (P2) · UX / Discoverability — touch reordering · Storefront (Sales Rep hub dashboard + customer profile, layout edit mode)
**Env:** vcptcore-qa @ theme `vc-theme-b2b-vue-2.55.0-pr-2400-c6ca`, `VirtoCommerce.SalesRep 3.1001.0-pr-6-4f32` · Chromium 390×844, `hasTouch`, `isMobile`, dsf 3
**Ticket:** VCST-5367 (vc-frontend PR #2400)

## Summary

`layout-region.vue` configures Sortable with **`delay: 200`**, **`delayOnTouchOnly: true`** and
**`touchStartThreshold: 5`**. So on a touch device a drag starts only after holding roughly 0.2 s
*without moving more than ~5 px*; a normal swipe scrolls instead. That is a deliberate and correct
design choice — it is what keeps the page scrollable on a phone.

The defect is that **nothing in the UI communicates it.** In edit mode at 390×844 the instruction
string reads, verbatim and identically to desktop:

> Editing layout — drag a block by its handle to reorder it, or hide it with ✕.
> Keyboard: press space on a block to pick it up, arrow keys to move it, space to drop, escape to cancel.

It documents the mouse gesture and the keyboard gesture, and **never mentions press-and-hold**. A rep on
a tablet or phone follows the instruction exactly, swipes the handle, watches the page scroll, and
concludes the feature is broken — which is precisely the report that triggered this investigation. The
5 px tolerance makes it worse: a finger that drifts a few pixels during the hold cancels the drag, so
even a user who guesses the gesture gets intermittent failure with no feedback.

## Steps to reproduce

1. On a touch device (or a `hasTouch` context at 390×844), sign in as a Sales Rep and open
   `/company/dashboard`.
2. Click **Edit layout**.
3. Read the edit-bar instruction text. Note it says only "drag a block by its handle".
4. Swipe a widget header handle the way the instruction describes, without pausing first.

## Expected vs Actual

| | |
|---|---|
| **Expected** | On a touch pointer the instruction states the required gesture — e.g. "**touch and hold**, then drag" — so the 200 ms hold is discoverable. Ideally a brief press also gives some feedback that a hold is needed. |
| **Actual** | The instruction is the desktop wording on every pointer type. The hold requirement is invisible, and a hold-less swipe produces only a page scroll with no hint that anything was expected. |

## What is confirmed vs still open

**Confirmed at 390×844:**

- The drag handle `button[aria-label="Reorder {title}"]` is present and hit-testable at **32×32** CSS px;
  the hide control `button.layout-widget__hide` likewise. Columns stack, the stat row wraps to
  full-width cards (342 px), and the edit bar stays usable (Reset 67×37, Cancel 79×37, Save 136×37).
  **So neither a missing handle nor the mobile layout explains the report.**
- Reordering itself **works** at this viewport — a synthetic drag between two adjacent in-viewport stat
  cards reordered them correctly (`My customers` ⇄ `Active carts`), and the keyboard route works fully
  (Space grab → announcer `Orders placed · WEEK grabbed. Position 4 of 6. Use the left and right arrow
  keys to move it, up and down to hide or show it, space to drop it, escape to cancel.` → ArrowLeft →
  `moved to position 3 of 6`, DOM order followed).
- The instruction text carries **no** press-and-hold affordance in any form (no hint string, no extra
  `aria` description) — this is the finding above, and it is decidable from the DOM alone.

**Still open — the functional touch verdict.** Whether a *real finger* hold of 200 ms+ successfully
starts a drag is **NOT verified**, and cannot be with the bound toolset: there is no touch/tap tool on
any Playwright MCP server, `browser_drag` is a single atomic mouse-based `dragTo` with no way to hold
between press and move, and `browser_drop` only drops files/MIME data from outside the page. Proof that
the synthetic path is mouse-derived rather than touch: a **hold-less** synthetic drag succeeded on the
`hasTouch` context, which `delay: 200` would have blocked had Sortable seen touch events. So the tooling
structurally bypasses the very code path under test. Confirming or refuting "hold then drag works on a
real device" needs manual testing on hardware, or selective pointer choreography that the real-user
tooling rule puts out of scope.

## Notes

- Checked against the accepted-gaps list for VCST-5367 — this is **not** on it.
- `SR-HD-041`'s current wording assumes the hold works and asserts only the gesture outcomes; it needs an
  added assertion that the edit-mode instruction communicates the press-and-hold requirement on touch,
  since that is the part that is both decidable and currently failing.
- The 32×32 controls are a separate, already-accepted observation (WCAG 2.2 AA 2.5.8 passes at 24×24;
  below this repo's stricter 44×44 heuristic; `VcButton xs` is the deliberate design spec) — not re-filed.
