# Page Builder Designer accessibility: the section tree is unreachable by keyboard, plus four related defects

- **Severity:** High
- **Provenance:** **PRE-EXISTING** for the tree itself; the Shared-placement row added by PR #159 inherits it
- **Environment:** vcptcore-qa · `VirtoCommerce.PageBuilderModule 3.1025.0-pr-159-7361` (PR #159)
- **Found:** 2026-09-17, `/qa-test VCST-4933` visual lane (4v) + Designer lane
- **Relates to:** VCST-4933 — **does not fail that ticket's verdict** (a11y finding on a functional story)

Five defects on one surface, filed together because they share a root surface and a single fix pass.

## 1. The section tree is completely unreachable by `Tab` — `BL-UI-007`, WCAG 2.1.1 (Level A)

A physical keyboard walk goes from the Designer toolbar **straight into the canvas iframe**, skipping
the entire left-hand section tree: `Settings`, `Page Header`, every section row, the Shared-component
placement row, and all of their `tune` / `drag_indicator` / `add_circle` controls.

`BL-UI-007` `[P1-data]` requires that *"every interactive control an admin surface introduces must be
reachable by `Tab` in DOM order, activatable from the keyboard, and must expose the correct role and
selected/expanded state"*. This matches its own stated Violation signal almost exactly: *"a `Tab` walk
skips it entirely and assistive technology cannot report which tab is active."*

**Consequence:** a keyboard-only or screen-reader author cannot author page content at all. Every
section operation is mouse-only.

**Provenance note.** `BL-UI-007`'s Scope clause judges *"the controls a surface itself adds or owns"*.
The section tree **predates** Shared Components, so the defect is assessed as pre-existing and is NOT
attributed to PR #159 — what PR #159 adds is the Shared-placement row, which inherits the same
inaccessibility. This is reasoned from the tree predating the feature; it has **not** been proven with
an A/B run against a pre-#159 build, and that is the honest limit of the claim.

## 2. Icon-only controls expose no accessible name

`tune`, `drag_indicator` and `add_circle` carry no `aria-label` — assistive technology receives only
the raw ligature text (`"tune"`). Present on every section row and in the page header. Compounds #1:
even if the tree were reachable, the controls would be unidentifiable.

## 3. `aria-label` on a roleless `<span>` for the Shared badge

The `Shared` badge applies `aria-label` to a bare `<span>` with no `role`. axe-core: **`aria-prohibited-attr`,
serious**. The attribute is ignored, so the one affordance that marks a placement as shared may not be
announced at all — the thing an author most needs to know before editing.

## 4. Tree accessible names contain literal `"(undefined)"`

Tree item `title` / accessible-name attributes render broken interpolation, e.g.
`title="Settings (undefined)"`. Invisible in the rendered UI, but exposed to tooltips and to assistive
technology, where it is read aloud.

## 5. Layout and dismissal

- At **375 px** a floating `Refresh` FAB overlaps the Component-details blade's `Rename` button by
  **~102 × 34 px** — measured by bounding box, not judged from a screenshot. `BL-UI-004` (content
  boundary).
- **`Escape` closes neither** the Component-details blade nor the Add-block panel.
- `add_circle`, the floating "insert block here" affordance, is absolutely positioned over the **centre
  of the adjacent section row** and intercepts its pointer events: the row is only clickable via its
  left icon or right edge. Playwright reports
  `<app-icon class="add-button">…add_circle</app-icon> subtree intercepts pointer events`, reproduced on
  every attempt. Adjacent to `BL-UI-003`. This is a **mouse-usability** defect, not only a11y.

## Impact

Together, #1–#4 make the Designer unusable for keyboard-only and screen-reader authors, and #1 alone is
a WCAG Level A failure carrying the accessibility/legal exposure `BL-UI-007` is rated `[P1-data]` for.
#5 degrades ordinary mouse use at small viewports.

## Suggested fix

Give the tree roles and a roving `tabindex` (`tree`/`treeitem`, or a focusable list), add `aria-label`
to every icon-only control, move the badge's `aria-label` onto an element with a role (or use visually
hidden text), fix the `(undefined)` interpolation, add `Escape` dismissal to both overlays, and
constrain the `add_circle` hit area so it stops covering the neighbouring row.

## Verification

Keyboard walk from the toolbar must reach every tree control in DOM order with a visible focus
indicator; axe-core must report zero `aria-prohibited-attr`; no accessible name may contain
`"(undefined)"`; at 375 px no control may overlap another; `Escape` must close both overlays.

## Evidence

`reports/tickets/Sprint26-19/VCST-4933/design-report.md` and
`reports/tickets/Sprint26-19/VCST-4933/screenshots/` (16 files, `01`–`16`), plus
`INC-addcircle-intercept.png`. Run record: `reports/tickets/Sprint26-19/VCST-4933/findings.md` §C F3/F5/F6/F7.
