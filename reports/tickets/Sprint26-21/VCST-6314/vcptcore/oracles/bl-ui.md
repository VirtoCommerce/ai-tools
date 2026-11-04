# BL invariants — extract (7 of 232)

> Verbatim slice of the oracle rendered from `.claude\knowledge\oracles\bl/*.yaml`, produced by `npm run bl:extract -- --domain ui`.
> **This is a SUBSET.** Invariants outside the filter are not shown and are not absent — if the
> task turns out to touch another domain, extract that domain too rather than concluding no rule
> applies. The `BL-*` ids are the citation contract the suites use; cite them, do not renumber.

**Included:** BL-UI-001, BL-UI-002, BL-UI-003, BL-UI-004, BL-UI-005, BL-UI-006, BL-UI-007

---

### BL-UI-001: Layout stability on initial render `[P2-ux]`
- **Rule:** After first paint, visible content MUST NOT shift as late assets resolve (images, web fonts, async data, skeleton → content swap). Cumulative Layout Shift (CLS) — measured via `PerformanceObserver({ type: 'layout-shift' })` summing `entry.value` where `entry.hadRecentInput === false` — must be ≤ 0.1 on initial render. Image elements without intrinsic dimensions (`width`/`height` attrs or CSS `aspect-ratio`) are the most common offender.
- **Verify:** Install the observer before navigating (`LAYOUT_SNIPPETS.installClsObserver`). Load the component / page. Wait for `load` + idle. Read accumulated CLS (`LAYOUT_SNIPPETS.readCls`). Repeat on throttled network ("Fast 3G") — late-loading images often hide shifts on fast connections.
- **Violation signal:** CLS ≥ 0.1 (FAIL), ≥ 0.25 (P0 if on checkout / cart / PDP). Visible jump as image loads. Skeleton snaps to different height when data arrives. Font swap (FOIT/FOUT) reflows surrounding text.
- **Agents:** ui-ux-expert, qa-frontend-expert, qa-backend-expert
- **Source:** VCST-2505 (Done) — footer jumped into the header area on page refresh (initial-render layout shift) and was fixed
- **Trust:** DECLARED
- **Lifecycle:** SUSPECT — [case] MSNF-060 failed in REG-2026-10-01-1243

### BL-UI-002: Spacing grid compliance `[P2-ux]`
- **Rule:** Every computed `padding`, `margin`, and `gap` SHOULD resolve to a value from the project spacing scale: the **Tailwind default scale** (0.25 rem / 4 px base unit, **including its half-steps** `0.5`=2 px, `1.5`=6 px, `2.5`=10 px, `3.5`=14 px) **plus** the vc-frontend `extend.spacing` additions in `tailwind.config.ts` (notably `4.5`=18 px, `17`=68 px, `18`=72 px, `19`=76 px). An arbitrary value that maps to no scale step (e.g. 13 px, 27 px, 41 px) is off-grid. The spacing scale is defined in `tailwind.config.ts` and is **theme-agnostic** — only COLORS are theme-driven CSS custom properties, so this is a design-system (not a per-theme "Coffee") contract. (Correcting the earlier claim of a strict 4 px multiple / a fixed allowed set: `vc-button.vue` uses `padding[2.5]`=10 px and `padding[3.5]`=14 px, and `extend.spacing` adds 18 px.)
- **Verify:** For each container and its key children, read `getComputedStyle(el).paddingTop|Right|Bottom|Left`, `marginTop|…`, and `gap` via `spacingAuditSnippet(selector)`, then `classifySpacing()`. **Never hand-list the allowed values** — the snippet embeds `SPACING_GRID`, which is derived by `npm run tokens:sync` from Tailwind's default scale (at the version vc-frontend pins) unioned with that repo's `theme.extend.spacing`; `npm run tokens:check` fails when the design system drifts. Run at the derived `AUDIT_VIEWPORTS_PX` sweep — some breakpoints introduce token overrides.
- **Violation signal:** Computed values that map to **no** Tailwind scale step (e.g. `"13px"`, `"27px"`, `"41px"`). Note: spacing in vc-frontend is applied via Tailwind utility classes / `theme()` refs, **not** `--spacing-*` CSS variables (those do not exist in the codebase).
- **Agents:** ui-ux-expert, qa-frontend-expert, qa-backend-expert
- **Trust:** INFERRED

### BL-UI-003: No state-induced layout shift `[P2-ux]`
- **Rule:** Hover, focus, validation-message insertion, badge/counter updates, and skeleton → content swap MUST NOT move adjacent elements. A border that appears on hover must use `outline` (which does not affect layout) OR reserve its space with a transparent border in the default state. A counter widening from 1-digit to 3-digit must not push siblings.
- **Verify:** Record `getBoundingClientRect()` of a neighbor sibling (`rectSnapshotSnippet(selector)`). Trigger the state change. Re-record. Compare with `compareRectSnapshots(before, after)` — `topDelta` and `leftDelta` must be 0.
- **Violation signal:** Neighbor moves on hover. Form below a field jumps when validation error inserts. Cart-icon badge change shifts navbar items. Skeleton dimensions ≠ resolved content → snap on load.
- **Agents:** ui-ux-expert, qa-frontend-expert, qa-backend-expert
- **Trust:** INFERRED

### BL-UI-004: Content boundary `[P2-ux]`
- **Rule:** Text and child elements MUST stay inside their container at every supported viewport. Long content must wrap, truncate with ellipsis, or scroll — never overflow silently and never be clipped by `overflow: hidden` without an explicit ellipsis indicator. Horizontal scrolling on the document at any tested viewport (375 / 768 / 1024 / 1280 / 1920) is a bug unless the scrolling element is itself an intentional horizontal scroller (e.g., a data table).
- **Verify:** Inject stress content (80-char product title, 12-digit SKU, German-equivalent label, 4-digit quantity). At each viewport, run `LAYOUT_SNIPPETS.overflowAudit` — checks `document.documentElement.scrollWidth > window.innerWidth` (horizontal overflow) and for each suspect element `el.scrollHeight > el.clientHeight && getComputedStyle(el).overflowY === 'hidden'` (silent clipping).
- **Violation signal:** Page scrolls horizontally at 375 px. Product title is cut off mid-character with no `…`. Card stretches to fit the longest sibling's text, breaking grid alignment. Locale labels (German `Versandadresse`) overflow into adjacent column.
- **Agents:** ui-ux-expert, qa-frontend-expert, qa-backend-expert
- **Source:** VCST-6029 (Done) — long unbroken value overflowed its compare-table cell across the next column; fixed to stay inside
- **Source:** VCST-4597 (Done) — PDP shipment options content overflowed its widget container
- **Source:** VCST-5124 (Done) — cart save-for-later control overflowed its card by 27px on mobile
- **Trust:** DECLARED

### BL-UI-005: Alignment in horizontal groups `[P2-ux]`
- **Rule:** Elements in a horizontal group share a baseline: text baselines align, vertical centers align within 1 px, buttons in the same row share `height` exactly, and an icon adjacent to text vertically centers with that text (within 1 px). Product-grid cells share height per row; table-row cells share height per row.
- **Verify:** Read `getBoundingClientRect()` for each item in the row via `alignmentAuditSnippet(selector)`. For vertical-center alignment, compute `top + height/2` per item — values must match within 1 px. For row-height parity, `height` values must match exactly. The helper returns `centerDriftPx`, `heightDriftPx`, and a boolean `misaligned`.
- **Violation signal:** Cart-quantity stepper buttons sit 2 px lower than the number field. Icon-and-label pair has icon offset upward. One product card in a row is taller than its neighbors, breaking the grid. Table row heights drift from row to row.
- **Agents:** ui-ux-expert, qa-frontend-expert, qa-backend-expert
- **Source:** VCST-4816 (Done) — badge count not vertically centered due to wrong flex alignment property; fixed to centre
- **Source:** VCST-3738 (Done) — misaligned admin module icons adjusted
- **Trust:** DECLARED
- **Lifecycle:** SUSPECT — [case] SR-TK-019 failed in REG-2026-10-07-1421

### BL-UI-006: Touch target size and spacing `[P1-data]`
- **Rule:** At mobile viewport (≤ 768 px), every interactive element — `<button>`, `<a>`, `<input type="checkbox|radio">`, `[role="button"]`, custom steppers, toggle switches — MUST measure at least **24 × 24 CSS px (WCAG 2.2 SC 2.5.8, Level AA)** and SHOULD reach **44 × 44 (SC 2.5.5, Level AAA)**, with ≥ 8 px gap from any adjacent interactive element. Padding counts toward the target; hit area is `getBoundingClientRect()` of the element including padding, NOT the visible glyph alone. **Two tiers on purpose:** the vc-frontend UI kit ships button sizes 26 / 32 / 38 / 44 / 52 px by design (`vc-button.vue` `--size`), so a flat 44 px bar marks most of the design system as broken — that produced 13 of 36 failures in run REG-2026-07-24-2121. Below AA = defect (FAIL); AA-to-AAA = design-system tradeoff (WARN), cross-check against the derived `UI_KIT_BUTTON_SIZES_PX` before filing.
- **Verify:** Set viewport to 375 px. Run `LAYOUT_SNIPPETS.touchTargetAudit` → `classifyTouchTargets()`, which tags each undersized element with `belowAA` and returns FAIL / WARN / PASS accordingly; for pairwise spacing, checks closest-edge distance ≥ 8 px. Thresholds live in `TOUCH_TARGET_AA_MIN_PX` / `TOUCH_TARGET_AAA_MIN_PX` — don't re-hardcode 44.
- **Violation signal:** 32 × 32 close button on a modal. Quantity stepper buttons 28 × 28 with 4 px between. Two checkboxes stacked with 6 px gap. A tap that should hit one element hits a neighbor instead.
- **Agents:** ui-ux-expert, qa-frontend-expert, qa-backend-expert
- **Docs:** w3.org/TR/WCAG22#target-size-minimum (SC 2.5.8, AA) — pointer targets at least 24x24 CSS px, with spacing exception
- **Docs:** w3.org/TR/WCAG22#target-size-enhanced (SC 2.5.5, AAA) — targets at least 44x44 CSS px
- **Source:** vc-frontend `client-app/ui-kit/components/molecules/button/vc-button.vue` `--size` tiers (xxs 26 / xs 32 / sm 38 / md 44 / lg 52 px); this repo `scripts/lib/measure-layout.ts` `TOUCH_TARGET_AA_MIN_PX` / `classifyTouchTargets()` (FAIL < 24, WARN 24–43).
- **Source:** VCST-5019 (Cancelled) — 26x26 coupon buttons reported against a 44px bar were not fixed; consistent with the rule treating 24-43px as WARN, not FAIL
- **Trust:** DECLARED
- **Lifecycle:** SUSPECT — [case] SR-CO-048 failed in REG-2026-10-07-1421

### BL-UI-007: Admin editor chrome is keyboard-operable and exposes its state `[P1-data]`
- **Rule:** Every interactive control an admin surface introduces must be reachable by `Tab` in DOM order, activatable from the keyboard, and must expose the correct role and selected/expanded state to assistive technology plus a non-empty accessible name. A visible focus indicator is required on focus — a control may not remove the platform outline without replacing it. Keyboard focus must never be trapped: an embedded editor that consumes `Tab` for indentation must provide an escape binding so focus can leave it (WCAG 2.1.2 No Keyboard Trap, Level A). Embedded iframes carry a non-empty `title`. Text meets WCAG 2.2 AA contrast 4.5:1 (3:1 for large text); non-text affordances such as icons and focus indicators meet 3:1. **Scope:** this invariant judges the controls a surface itself adds or owns. Pre-existing platform form chrome that fails the same check is a platform-level finding — record it once against the platform, not against every module blade that renders it.
- **Verify:** From the first field of the surface, walk `Tab` through every control and assert each interactive element receives focus in DOM order and shows a visible focus indicator (`outline` or `box-shadow` resolving to something other than none while focused). For each tab- or toggle-like control assert `role`, `aria-selected`/`aria-expanded`, and an accessible name; activate each with `Enter` and `Space`. Inside any embedded code editor press `Tab` and assert focus can still leave the editor. Assert every iframe has a non-empty `title`. Sample the surface's own text and icon foreground/background pairs and compute contrast ratios against the 4.5:1 / 3:1 thresholds.
- **Violation signal:** A tab strip built from non-semantic list items with click handlers and no `role`/`tabindex`/`aria-selected` — a `Tab` walk skips it entirely and assistive technology cannot report which tab is active. A styled `<button>` resolving `outline-style: none` and `box-shadow: none` while focused. An embedded editor where `Tab` inserts indentation with no escape binding, trapping focus. An iframe whose `title` is null. A 12 px label whose foreground/background pair measures below 4.5:1.
- **Agents:** ui-ux-expert, qa-frontend-expert, qa-backend-expert
- **Docs:** w3.org/TR/WCAG22#no-keyboard-trap (SC 2.1.2) — focus must be movable away from any component using keyboard
- **Docs:** w3.org/TR/WCAG22#name-role-value (SC 4.1.2) — controls expose name, role and state
- **Docs:** w3.org/TR/WCAG22#focus-visible (SC 2.4.7) and #contrast-minimum (SC 1.4.3) / #non-text-contrast (SC 1.4.11) — visible focus; 4.5:1 text, 3:1 non-text
- **Source:** Worked example — vc-module-notification (branch `feat/VCST-5557`) `Scripts/blades/notifications-edit-template.tpl.html`: the tab strip is a `<ul>` of `<li>` elements carrying `ng-click` with no `role`, `tabindex`, or `aria-selected` (:58-77), and the preview `<iframe>` is declared with no `title` (:99). `Content/css/styles.css` styles `.nt-tab` and `.nt-fs-btn` for `:hover` and an `.__active` class but authors no `:focus`/`:focus-visible` rule (:251-320), while the module's own focus rule elsewhere sets `outline: none` (:98-101). `Scripts/blades/notifications-edit-template.js` remaps `Ctrl-Q`/`Ctrl-Alt-F`/`Ctrl-Space` in the editor's `extraKeys` but leaves `Tab` at the editor default (indent) with no escape binding (:264-268); its injected format buttons render 12 px white text on a mid-blue fill (:210-218, :302) measuring ≈2.4:1 against the required 4.5:1.
- **Source:** VCST-5860 (Done) — admin (vc-shell) products-blade toggle buttons had no accessible name (4.1.2)
- **Source:** VCST-5862 (Done) — admin (vc-shell) light-theme text contrast violations (1.4.3)
- **Source:** VCST-5671 (Done) — admin scheduler overflow popover not keyboard/AT reachable (2.1.1, 4.1.2)
- **Trust:** DECLARED

---

