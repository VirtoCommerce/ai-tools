# Testing Checklist — VCST-4535: VcTable UI-Kit Refactor

**PR:** https://github.com/VirtoCommerce/vc-frontend/pull/2261
**Theme deploy:** `vc-theme-b2b-vue-2.49.0-pr-2261-156b`
**Priority:** Medium | **Layer:** Frontend-only (Storefront UI + Storybook)
**Date:** 2026-05-06

---

## 1. Storybook UI-Kit Checklist

**Agent:** `ui-ux-expert` | **Browser:** Chrome DevTools MCP
**URL:** `https://vcst-qa-storybook.govirto.com` — navigate to **Organisms / Table**

> Skip WebKit (Windows). Run all viewport checks in Chrome only.

### 1.1 Declarative VcTableColumn API

- [ ] Stories using `<VcTableColumn>` subcomponents render without Vue warnings in the console.
- [ ] Column definitions declared via `<VcTableColumn>` produce the same visual output as equivalent `columns` prop definitions (smoke comparison between the two API stories if both exist).
- [ ] `VcTableColumn` slot props (`#cell`, `#header`) receive the correct column and row data — verify rendered cell content matches the story's slot definition.
- [ ] Removing a `<VcTableColumn>` from the declarative story dynamically hides that column without page reload (if the story supports live knobs/controls).
- [ ] `codePanel` is visible in the Storybook docs tab for at least one Table story (AC-9).

### 1.2 Legacy `columns` Prop (Backward Compatibility)

- [ ] A story driven purely by the `columns` array prop renders correctly — no console errors about deprecated APIs.
- [ ] Cell slot overrides (`v-slot:cell(colKey)`) defined in the legacy pattern still resolve and render.
- [ ] Header slot overrides (`v-slot:header(colKey)`) defined in the legacy pattern still resolve and render.
- [ ] No Vue "Missing required prop" warnings emitted when only `columns` prop is supplied (no `VcTableColumn` children).

### 1.3 Sticky Header

- [ ] When `stickyHeader` is enabled and table content exceeds `maxHeight`, the `<thead>` row remains fixed at the top while the body scrolls.
- [ ] The sticky header does not overlap or obscure the first data row at initial load.
- [ ] When `stickyHeader` is disabled (or `maxHeight` is not set), the header scrolls with the table body.
- [ ] Header cell widths match corresponding column widths after a vertical scroll within a `maxHeight`-bounded container.

### 1.4 Fixed / Sticky Columns

- [ ] A column declared `fixed: 'left'` remains pinned on the left edge while the table scrolls horizontally.
- [ ] A column declared `fixed: 'right'` remains pinned on the right edge during horizontal scroll.
- [ ] When both `fixed: 'left'` and `fixed: 'right'` columns are present simultaneously, each edge stays correct independently.
- [ ] Auto edge reordering: fixed-left columns are grouped first, unfixed columns in the middle, fixed-right columns last — regardless of the declaration order in the template.
- [ ] CSS offset arithmetic for stacked fixed columns uses unit-safe values (e.g., `px` offsets computed correctly when `width` is supplied as a `px` value, and `rem` widths also produce numerically correct offsets).
- [ ] Fixed columns display an appropriate visual shadow or separator to indicate scrollability.

### 1.5 `rowClass` and `rowStyle` Props

- [ ] A `rowClass` passed as a static string applies the CSS class to every `<tr>`.
- [ ] A `rowClass` passed as a function `(row) => string` applies the per-row derived class (verify two visually distinct classes for two different data rows).
- [ ] A `rowStyle` passed as a static object applies inline styles to every `<tr>`.
- [ ] A `rowStyle` passed as a function `(row) => object` applies per-row derived styles correctly.
- [ ] `rowClass` and `rowStyle` coexist on the same table without overriding each other.

### 1.6 `@row-click` Event and Keyboard Accessibility

- [ ] Clicking a data row in a story that binds `@row-click` fires the event and produces the expected side effect (e.g., console log or knob highlight in Storybook).
- [ ] Hovering over a clickable row shows `cursor: pointer`.
- [ ] When no `@row-click` listener is bound, the cursor remains default and no pointer styling is applied.
- [ ] Pressing **Enter** on a focused row triggers the `@row-click` handler (keyboard activation — AC-5).
- [ ] Pressing **Space** on a focused row triggers the `@row-click` handler (keyboard activation — AC-5).
- [ ] Each row in a clickable table has `tabindex="0"` (or equivalent) so it can be reached by Tab.
- [ ] `role="row"` is present on `<tr>` elements; if the row acts as a button, verify `role` or `tabindex` conveys interactivity without conflicting table semantics.
- [ ] Focus ring is visible on focused row (focus-visible style present, sufficient contrast).

### 1.7 Loading Skeletons

- [ ] When `loading` is `true`, skeleton placeholder rows are rendered.
- [ ] Skeleton column count matches the `orderedColumns` count (AC-6) — skeleton rows align with real column headers.
- [ ] Skeleton placeholder widths are plausible relative to the column widths — no single skeleton spans multiple columns.
- [ ] After loading completes (`loading` becomes `false`), skeletons are replaced by data rows with no layout shift.

### 1.8 Slot Overrides (Cell and Header)

- [ ] A custom `#cell` slot renders custom content instead of the default text output.
- [ ] A custom `#header` slot renders custom header content instead of the default column title.
- [ ] When both a custom header slot and sticky header are active simultaneously, the sticky header renders the custom content (not a blank cell).

### 1.9 WCAG 2.1 AA — Keyboard and ARIA

- [ ] Tab order traverses interactive rows in DOM order (no jumps or trapped focus).
- [ ] After pressing Enter/Space to activate a row, focus moves to the target view or returns sensibly (no focus loss).
- [ ] If any column header is sortable, `aria-sort` attribute toggles between `ascending` / `descending` / `none`.
- [ ] Color contrast on row hover state meets WCAG AA (4.5:1 for text, 3:1 for UI components) in Coffee theme.
- [ ] Color contrast on row focus state meets WCAG AA.
- [ ] Table has a visible or `aria-label` accessible name if it lacks a visible `<caption>`.

### 1.10 Visual Regression — Viewports

Capture screenshots at each viewport for the primary Table story (sticky + fixed + row-click all active):

| Viewport | Filename |
|----------|----------|
| 1920 × 1080 | `Organisms/Table/sticky-fixed-rowclick-1920.png` |
| 1024 × 768 | `Organisms/Table/sticky-fixed-rowclick-1024.png` |
| 768 × 1024 | `Organisms/Table/sticky-fixed-rowclick-768.png` |
| 375 × 812 | `Organisms/Table/sticky-fixed-rowclick-375.png` |

- [ ] At 375 px the table is horizontally scrollable (not cut off) and fixed columns stay pinned.
- [ ] At 768 px sticky header is still functional after vertical scroll.

---

## 2. Account → Orders Integration Checklist

**Agent:** `qa-frontend-expert` | **Browser:** `playwright-chrome`
**URL:** Read `{{FRONT_URL}}` from `.env` at runtime. Sign in with `{{USER_EMAIL}}` / `{{USER_PASSWORD}}`.

> Do NOT hardcode any credential, URL, order number, price, or date.

### 2.1 Orders Page Renders with Declarative API

- [ ] Navigate to `{{FRONT_URL}}/account/orders` — page loads without blank screen or Vue error in the console.
- [ ] Order list table is visible with at least the expected structural columns (order number, date, status, total — assert presence of column headers, not specific values).
- [ ] No Vue warnings about unknown props or missing required props emitted in the browser console.
- [ ] No `[Vue warn]: Missing required prop` or deprecation warnings related to `VcTable` or `VcTableColumn` in console.

### 2.2 Row Click → Navigation

- [ ] Clicking on any order row navigates to that order's detail page.
- [ ] The resulting URL matches the pattern `{{FRONT_URL}}/account/orders/<id>` (assert URL pattern, not a specific ID).
- [ ] The order detail page loads without 404 or blank content after row click.
- [ ] Clicking on a row's interactive child element (if any link or button inside a cell is present) does not double-navigate or cause conflicting behavior — flag and document observed behavior for AC-5 clarification (see Section 5 Edge Case 6).

### 2.3 Hover State

- [ ] Hovering the mouse over any order row shows `cursor: pointer` computed style.
- [ ] The hover background/highlight state renders without visual artifact (no flicker or misaligned border).

### 2.4 Keyboard Navigation

- [ ] Pressing **Tab** from the page header eventually reaches the first order row.
- [ ] Pressing **Enter** on a focused order row navigates to the order detail page (same URL pattern as 2.2).
- [ ] Pressing **Space** on a focused order row navigates to the order detail page.
- [ ] Focus is visible on the active row (focus ring or equivalent contrast indicator).

### 2.5 Sticky Header on Long Lists

- [ ] When the orders list is long enough to require scrolling, the column header row remains fixed at the top of the table viewport.
- [ ] After scrolling down and back up, the header stays in place without rendering artifacts.
- [ ] If the orders page uses a fixed `maxHeight` on the table container, verify the scroll is confined to the table, not the whole page.

### 2.6 Loading Skeleton

- [ ] On first page load (or after a hard refresh), a skeleton loading state is briefly visible before the order list data appears.
- [ ] Skeleton columns match the rendered columns after data loads — no sudden layout shift.

### 2.7 Empty State

- [ ] Accessing the orders page with a fresh account (no orders) shows an empty state message — not a blank table body or JavaScript error.

### 2.8 Mobile Viewport (375 × 812)

- [ ] At 375 px width the orders table is legible — either horizontally scrollable or responsively adapted.
- [ ] Tapping an order row on mobile navigates to the order detail page (touch equivalent of row click).
- [ ] No text overflow causes content to be visually hidden or clipped at 375 px.

### 2.9 Pagination, Sort, and Filter (Backward Compatibility)

- [ ] If pagination controls are present, navigating to page 2 loads a different set of orders (no duplicates with page 1).
- [ ] If a status filter is present, applying it updates the list without console errors.
- [ ] If a date range filter is present, applying it updates the list without console errors.
- [ ] If a search field is present, submitting a search term updates the list without console errors.
- [ ] Clearing any filter/search restores the full list.

### 2.10 Cross-Widget: Dashboard "Latest Orders" Widget

- [ ] Navigate to the account dashboard (if a "latest orders" or "recent orders" widget exists using VcTable).
- [ ] The widget renders without console errors after the PR deploy.
- [ ] Row click on a dashboard order widget item navigates to the correct order detail page.

---

## 3. Backward Compatibility / Regression Checklist

**Agent:** `qa-frontend-expert` | **Browser:** `playwright-chrome`

### 3.1 Other Pages Consuming VcTable

Search the codebase for `VcTable` usage outside `orders.vue` — known usages to spot-check:

| Page | URL Pattern | Check |
|------|-------------|-------|
| Quotes list | `{{FRONT_URL}}/account/quotes` | Table renders, rows clickable |
| Lists / Shared lists | `{{FRONT_URL}}/account/lists` | Table renders without regression |
| B2C Members | `{{FRONT_URL}}/account/members` | Table renders without regression |
| B2C Dashboard | `{{FRONT_URL}}/account/dashboard` | Recent orders widget renders |

For each page:
- [ ] Table renders data rows without Vue errors.
- [ ] Existing row interactions (click, links inside cells) still function.
- [ ] No visual regression on column layout (column widths not collapsed or blown out).

### 3.2 vc-date-selector Stories (Also Modified in PR)

- [ ] Navigate to the `vc-date-selector` story in Storybook — story loads without error.
- [ ] The `name` field update does not break the story ID or cause 404 in Storybook.
- [ ] `codePanel` is enabled (`.storybook/preview.ts` change) — verify the Code tab appears in at least one Table story docs view.

---

## 4. Business Rules to Verify

This is a presentational refactor; only orders-domain rendering invariants apply.

| Invariant | What to Check |
|-----------|---------------|
| **BL-ORD-005** — Order number uniqueness and immutability | Order numbers in the list render correctly and match the detail page URL after row-click navigation. |
| **BL-ORD-001** — Order state machine | Order statuses displayed in the list are rendered as human-readable labels (not raw enum values) — `New`, `Processing`, `Completed`, etc. |
| **BL-ORD-007** — Shipment state machine vocabulary | Shipment/fulfillment status labels in the orders table match the correct storefront vocabulary (see `project_order_status_vocab` memory). |

Note: no pricing, cart, or payment invariants apply — this PR does not touch business logic.

---

## 5. Edge Cases to Cover (ECL-Style)

1. **Long order numbers / wide cells** — if an order number or product name is unusually long, verify cell content truncates with ellipsis and does not overflow into adjacent columns (ECL-3.1 overflow pattern).

2. **Single column** — verify VcTable with exactly one `VcTableColumn` renders without layout error (no division-by-zero in CSS offset math).

3. **Many columns (10+)** — verify horizontal scroll is enabled and fixed columns remain pinned at both edges without misaligned offsets.

4. **Mixed fixed-left + fixed-right + sticky header simultaneously** — in Storybook, activate all three features at once and scroll both vertically and horizontally; confirm no z-index conflict between the sticky header and fixed columns (corner cell).

5. **Empty orders list (new account or all-filtered-out results)** — verify no skeleton columns misalign with an empty table body; no `orderedColumns` computation error when data is an empty array.

6. **`@row-click` with interactive child elements** — if a cell contains a `<a>` or `<button>`, clicking that child should route via the child's own handler. Determine whether the parent row-click also fires (intent from AC-5 is ambiguous). **Flag as open question** if both fire simultaneously, as it may cause double navigation.

7. **Slow network / skeleton alignment** — throttle network to "Slow 3G" in Chrome DevTools; confirm skeleton column count matches `orderedColumns` definition throughout the loading phase, with no layout jump when data resolves.

---

## 6. Out of Scope

- Backend API changes — this PR is UI-only; no REST or GraphQL mutations are modified.
- Admin SPA — no admin components are touched.
- Payment flows, cart mutations, pricing — unaffected by this PR.
- Other storefront pages not consuming `VcTable`.
- E2E cross-layer verification (no new API surface introduced).
- Unit test coverage (`vc-table.test.ts` ships with the PR; review is out of scope for QA acceptance).

---

## Agent Delegation Summary

| Section | Agent | Browser |
|---------|-------|---------|
| Section 1 — Storybook | `ui-ux-expert` | Chrome DevTools MCP |
| Section 2 — Orders page | `qa-frontend-expert` | `playwright-chrome` |
| Section 3 — Regression | `qa-frontend-expert` | `playwright-chrome` |

> Sections 2 and 3 must NOT share a browser session with Section 1.
> Read all credentials from `.env` at runtime — never hardcode.
