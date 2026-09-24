# BUG: `vc-calendar` day grid — `role="application"`, selection not on the focused element, and first-Tab lands on the wrong cell

## Status: CONFIRMED · all three re-verified against current head 2026-09-21
**Severity: Medium** (P2) · shared UI kit, so every calendar in the storefront inherits it.
**Found by:** `/qa-test VCST-5732` (2026-09-18 round, re-derived 2026-09-21) · **deferred by the developer
to a shared-UI-kit ticket**, deliberately — a storefront-wide component change should not ride in a
feature PR.
**Archetype:** `STATE` / keyboard semantics

**Env:** vcptcore-qa @ theme `2.58.0-pr-2464-2971-2971a77b` · `playwright-edge` · verified on **both**
`/company/calendar` and the dashboard mini-calendar.

## Why this report exists, and what changed since the first round
The developer asked explicitly for two of these to be re-checked against current head, because VCST-5653's
focus-ring work added `focusActiveCell` **after** the original run. **Re-derived rather than carried
forward — and one of them did partly move.**

| Item | Prior round | Re-verified 2026-09-21 |
|---|---|---|
| **D14** `role="application"` on the grid | failing | **unchanged, still present** |
| **D8** selected date conveyed by colour alone | failing | **still failing, but RELOCATED** — see below |
| **D16** `tabindex="0"` on the wrong cell | failing | **PARTIALLY FIXED** — `focusActiveCell` landed |

---

## 1. `role="application"` still wraps the day grid (WCAG 1.3.1, 4.1.2)
`application [ref]` wraps the whole day-grid table, on both surfaces. That role tells assistive tech to
hand **all** keyboard handling to the page's JS and suppress normal browse mode, which discards the table
semantics the component otherwise gets right (`role="gridcell"` on the cells, a proper header row) and
orphans the gridcells.

**Fix:** `role="grid"`, per the WAI-ARIA APG pattern. The keyboard support this role was presumably
protecting **already exists and works** — see item 3: the roving tabindex and arrow handlers are
implemented, so `grid` costs nothing here.

## 2. The selection moved one DOM level away from focus, which is not a fix (WCAG 4.1.2)
`aria-selected` now **does** exist — the accessibility tree shows `gridcell [selected]` on the selected
cell. But the **focusable, interactive element is the nested `<button>`**, and the button carries neither
`aria-selected` nor `aria-current`.

**Screen readers announce the properties of the element that receives focus.** A `<td>`-level
`aria-selected` two DOM levels away from the focused button is not reliably surfaced. A keyboard user
landing on the selected date still hears only "22, Tuesday, September 22 2026" with no
selected/current cue — functionally the original complaint, relocated.

**Fix:** put (or duplicate) `aria-selected="true"` / `aria-current="date"` on the `<button>` itself.

## 3. First Tab into the grid lands on day 1, not the selected or current date (WCAG 2.4.3)
- **Fixed:** post-interaction focus memory. Arrow to a cell, Tab out, Shift+Tab back — focus returns to
  that same cell. `focusActiveCell` works.
- **Not fixed:** the **first** Tab into a freshly rendered or freshly navigated grid lands on the 1st of
  the displayed month. Reproduced by navigating the mini-calendar to **September 2027** (no selection) and
  tabbing in: focus landed on "Wednesday, September 1, 2027".

**Fix:** on mount and on month navigation, set the roving `tabindex="0"` on the selected cell — or today's,
or the first focusable meaningful cell — **before** any user interaction, instead of defaulting to the
first cell in the `rowgroup`.

---

## Steps to Reproduce
1. Sign in as a sales rep → `/company/calendar`.
2. **(1)** Inspect the month grid's wrapping element role.
3. **(2)** Keyboard-navigate onto the selected day's cell and read the focused element's properties.
4. **(3)** Reload, then Tab into the grid without pressing an arrow key first; note which cell takes focus.
   Repeat after navigating to a month with no selection.

All three were derived from a **real keyboard walk** plus accessibility-tree reads, not inferred from
markup — item 3 is precisely a tab-order defect and cannot be read off the DOM alone.

## Business rule
`WCAG 1.3.1` · `WCAG 2.4.3` · `WCAG 4.1.2` · `BL-A11Y-*`. WAI-ARIA APG *Date Picker Grid* pattern.

## Provenance
**PRE-EXISTING on the shared component**, surfaced by VCST-5732. Per `close-out.md` §5-verdict.2 it is
filed as its own ticket at its own severity and does **not** fail VCST-5732's verdict.

## Related
`D6` — `vc-textarea` has no accessible name — is the fourth deferred item and a **different** component:
`BUG-vc-textarea-has-no-accessible-name-shared-ui-kit.md` (High).

## Fix Routing
`vc-frontend` — the in-repo Vue UI kit (`vc-calendar`). Single repo. **Reach exceeds the diff**: every
calendar consumer inherits all three, so the fix wants a deliberate `/qa-regression` pass over them.

## Evidence
Keyboard walk + accessibility-tree reads, 2026-09-21 (visual lane).
`reports/tickets/Sprint26-19/VCST-5732/screenshots/laneB-calendar-1920-default.png`,
`laneB-minicalendar-dots-1920.png`. **axe-core flagged none of these three** — see the methodology note in
`BUG-SalesRep-Tasks-Calendar-Selected-Tile-Dots-Invisible-And-No-Live-Region.md`.
