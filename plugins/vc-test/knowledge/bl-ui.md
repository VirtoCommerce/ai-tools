<!-- GENERATED from .claude/knowledge/oracles/bl/{a11y.yaml,cat.yaml,chk.yaml,price.yaml,ui.yaml} by npm run vc-test:design — do not edit; the BL oracle YAML is canonical -->

# BL invariants — UI display, accessibility, and the three cross-cutting rules the visual lane cites

> Verbatim slice of the BL oracle: the rules the visual lane judges against.
> (in this repository: rendered from `.claude/knowledge/oracles/bl/*.yaml`; printed by `npm run bl:extract -- --domain ui,a11y --id BL-PRICE-003,BL-CAT-002,BL-CHK-001`)
> **This is a SUBSET.** An invariant outside it is not absent — if the work touches another domain, do not conclude
> that no rule applies. The `BL-*` ids are the citation contract the suites use; cite them, do not renumber.

**Included:** BL-PRICE-003, BL-CHK-001, BL-CAT-002, BL-UI-001, BL-UI-002, BL-UI-003, BL-UI-004, BL-UI-005, BL-UI-006, BL-UI-007, BL-A11Y-001, BL-A11Y-002, BL-A11Y-003, BL-A11Y-004

---

### BL-PRICE-003: Price rounding `[P0-revenue]`
- **Rule:** All monetary amounts round half-up to 2 decimal places in the display currency. Intermediate calculations may use higher precision, but all customer-visible prices (line totals, subtotal, tax, grand total) display exactly 2 decimals.
- **Verify:** No prices display with 0, 1, or 3+ decimal places. Check edge cases: items at $X.X95 should round to $X.X0 (half-up).
- **Violation signal:** Price displays like "$12.5" or "$12.456", or rounding inconsistency between line total and cart subtotal.
- **Agents:** qa-frontend-expert, qa-backend-expert, ui-ux-expert
- **Docs:** platform/developer-guide/docs/Tutorials-and-How-tos/How-tos/overriding-rounding-policy.md — money rounding is done by IMoneyRoundingPolicy, which can be replaced
- **Source:** VP-4639 (Done) — a discounted price was shown rounded up to 2 decimals but truncated in calculations; fixed so the rounded 2-decimal value is used throughout
- **Trust:** DECLARED

### BL-CHK-001: Guest vs authenticated checkout `[P0-revenue]`
- **Rule:** Guest checkout is only available when the store setting `createAnonymousOrderEnabled = true`. When disabled, anonymous users must sign in before reaching checkout. Guest checkout skips address book (no saved addresses) and order history is not linked to an account.
- **Verify:** With flag OFF → "Add to cart" → "Checkout" → redirect to sign-in. With flag ON → anonymous user can complete full checkout without account.
- **Violation signal:** Anonymous user reaches checkout when flag is OFF; guest order appears in a registered user's order history; saved addresses shown to guest.
- **Agents:** qa-frontend-expert, qa-backend-expert, qa-testing-expert, test-management-specialist
- **Docs:** platform/user-guide/docs/cart/overview.md — the cart module supports anonymous carts and submitting orders without creating an account
- **Docs:** platform/developer-guide/docs/GraphQL-Storefront-API-Reference-xAPI/update-xapi-modules.md — the anonymous order creation setting moved to its functional X-module
- **Source:** vc-frontend `client-app/pages/checkout/index.vue` — no auth guard on the checkout route; a guest may initialize and complete checkout, and the guest order is not linked to an account.
- **Trust:** DECLARED
- **Lifecycle:** SUSPECT — [case] CHK-096 failed in REG-2026-10-15-1624

### BL-CAT-002: Virtual catalog inherits physical catalog changes `[P1-data]`
- **Rule:** A virtual catalog is a view over physical catalog data — not a copy. Any change to a product in the physical catalog (price, description, stock, images) is immediately reflected in all virtual catalogs that include it. There is no manual sync or publish step for catalog data propagation. Deletion of a product from the physical catalog removes it from all linked virtual catalogs.
- **Verify:** Edit product name in physical catalog → open virtual catalog → name updated immediately. Delete product from physical catalog → virtual catalog no longer shows it. Add product to physical catalog in a linked category → appears in virtual catalog.
- **Violation signal:** Virtual catalog shows stale data after physical catalog edit; deleted product still appears in virtual catalog; changes require manual sync.
- **Agents:** qa-frontend-expert, qa-backend-expert
- **Docs:** vc-docs platform/user-guide/docs/catalog/add-new-catalog.md — changes to items in a physical catalog are automatically reflected in all associated virtual catalogs
- **Source:** VP-8460 (Done) — a product read through a virtual-catalog store returned price 0 / stock 0 while the physical product had values; fixed
- **Trust:** DECLARED

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
- **Lifecycle:** SUSPECT — [case] SR-ACT-016 failed in REG-2026-10-28-1915

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

### BL-A11Y-001: Keyboard operability and focus management `[P1-data]`
- **Rule:** On the accessibility-gated storefront themes, every interactive element MUST be reachable and operable via keyboard alone, in a logical DOM/tab order, with a visible focus indicator on the currently focused element (WCAG 2.1.1, 2.4.3, 2.4.7). A modal/dialog overlay MUST contain keyboard focus within itself while open — Tab from its last focusable element cycles to its first, Shift+Tab from the first cycles to the last — and closing it (via Escape or an explicit close control) MUST release the trap and return focus to the triggering control.
- **Verify:** From a neutral starting point, Tab through the surface and confirm every interactive element receives focus in DOM order with a visible focus ring. Open a modal, Tab to its last focusable element and confirm wrap to the first (Shift+Tab from the first wraps to the last). Close it and confirm focus returns to the trigger and Tab no longer reaches the closed modal's contents.
- **Violation signal:** An element skipped by Tab; `outline:none` with no visible replacement; Tab exits an open modal to page content behind it; focus remains trapped, or does not return to the trigger, after close.
- **Agents:** ui-ux-expert, qa-frontend-expert
- **Docs:** w3.org/TR/WCAG22#keyboard (SC 2.1.1), #focus-order (SC 2.4.3), #focus-visible (SC 2.4.7) — keyboard operable, logical order, visible focus
- **Docs:** w3.org/TR/WCAG22#no-keyboard-trap (SC 2.1.2) — focus can leave any component
- **Source:** `client-app/ui-kit/composables/useFocusManagement.ts` — the focusable-elements selector and the Tab-cycle keydown handler that wraps focus at the first/last element when `trapFocus` is enabled; wired into `client-app/ui-kit/components/molecules/dialog/vc-dialog.vue`.
- **Source:** VCST-5671 (Done) — overflow popover was not keyboard reachable and focus did not move into it; fixed
- **Trust:** DECLARED
- **Lifecycle:** SUSPECT — [case] SR-CO-051 failed in REG-2026-10-06-1457

### BL-A11Y-002: Accessible naming and label association `[P1-data]`
- **Rule:** Every interactive control MUST expose a non-empty, contextual accessible name to assistive technology (WCAG 4.1.2), distinct from a generic element-type label. Every visible field label MUST be programmatically associated with its input via `<label for>`/`aria-labelledby`/`aria-label` (WCAG 1.3.1). Every informative image's `alt` describes its content/purpose; a purely decorative image carries `alt=""` (WCAG 1.1.1).
- **Verify:** Capture the accessibility tree for the surface and confirm every button/link/input exposes a non-generic accessible name; confirm each visible label's `for`/`id` pairing or `aria-labelledby` resolves correctly; confirm `<img alt>` is present and non-generic (or explicitly empty for decorative images). Corroborate with an axe-core scan (`button-name`, `link-name`, `label`, `image-alt`) — zero violations required.
- **Violation signal:** An icon-only control announced as bare "button"/"link"; an input with no associated label; a product image missing `alt`; `aria-labelledby` referencing a non-existent id.
- **Agents:** ui-ux-expert, qa-frontend-expert
- **Docs:** w3.org/TR/WCAG22#name-role-value (SC 4.1.2), #info-and-relationships (SC 1.3.1), #non-text-content (SC 1.1.1) — accessible names, programmatic label association, alt text
- **Source:** `client-app/shared/cart/components/coupon-card.vue` — Apply/Remove buttons receive a dynamic, contextual `aria-label` from i18n keys via the `VcButton` `ariaLabel` prop, rather than a static generic label; `client-app/shared/wishlists/components/wishlist-card.vue` similarly attaches a contextual `aria-label` to its date block rather than relying on the bare visible date text.
- **Source:** VCST-4993 (Done) — checkout address popup search input had a wrong aria-label; fixed
- **Source:** VCST-5860 (Done) — icon toggle buttons had no accessible name; fixed
- **Trust:** DECLARED
- **Lifecycle:** SUSPECT — [case] MSNF-090 failed in REG-2026-10-01-1243

### BL-A11Y-003: Color contrast and non-color status differentiation `[P1-data]`
- **Rule:** On the accessibility-gated storefront themes, body/paragraph text MUST meet contrast ≥ 4.5:1 against its background, and large text (≥18px, or ≥14px bold) ≥ 3:1 (WCAG 1.4.3). UI-component boundaries and meaning-bearing graphical/icon affordances MUST meet ≥ 3:1 against their adjacent background (WCAG 1.4.11). Status/meaning (error, success, warning) MUST NOT be conveyed by color alone (WCAG 1.4.1).
- **Verify:** Run an axe-core `color-contrast` scan against the surface on an accessibility-gated theme; zero violations required. For a color-conveyed status, confirm an accompanying icon/text label independent of color, and recheck under a colorblind-vision emulation.
- **Violation signal:** A foreground/background pair below the 4.5:1/3:1 threshold; an axe `color-contrast` violation; a status relying on red/green alone with no icon or text.
- **Agents:** ui-ux-expert, qa-frontend-expert
- **Docs:** w3.org/TR/WCAG22#contrast-minimum (SC 1.4.3), #non-text-contrast (SC 1.4.11), #use-of-color (SC 1.4.1) — 4.5:1 / 3:1 contrast; no colour-only meaning
- **Source:** `client-app/shared/wishlists/components/wishlist-card.vue` — the card's icon foreground is styled via a semantic design token rather than a raw hex value, routing contrast through the design-token system that governs compliance.
- **Source:** VCST-5911 (Done) — storefront status dot below 3:1 and status conveyed by colour alone; fixed
- **Trust:** DECLARED
- **Lifecycle:** SUSPECT — [case] MSNF-090 failed in REG-2026-10-01-1243

### BL-A11Y-004: Programmatic status, state, and role correctness (axe-clean) `[P1-data]`
- **Rule:** Every ARIA role/state/property a component sets MUST be valid, complete, and reflect the control's actual state (WCAG 4.1.2). A message appearing asynchronously in response to a user action MUST be exposed to assistive technology at the moment it appears — via `role="alert"`/`aria-live`, or an explicit focus shift plus `aria-describedby` linkage to the field it concerns — not by visual styling alone (WCAG 4.1.3; WCAG 3.3.1 for field-level errors). A surface MUST be free of axe-core Critical/Serious violations.
- **Verify:** Trigger the async state (invalid submit, coupon apply, menu/tab toggle) and confirm the resulting node carries `role="alert"`/a live region or receives focus, with a field-level error additionally carrying a matching `aria-describedby`. Run a full axe-core scan; zero Critical/Serious violations required.
- **Violation signal:** An error/status message with no `role="alert"`/`aria-live` and no focus shift; `aria-expanded`/`aria-selected` not toggling with visible state; an axe Critical or Serious violation.
- **Agents:** ui-ux-expert, qa-frontend-expert
- **Docs:** w3.org/TR/WCAG22#name-role-value (SC 4.1.2), #status-messages (SC 4.1.3), #error-identification (SC 3.3.1) — valid state, status messages exposed to AT, errors identified
- **Source:** `client-app/shared/cart/components/coupon-card.vue` — the coupon-apply error paragraph is conditionally mounted with `role="alert"` only when an error exists, so its appearance in the DOM itself triggers the assistive-technology alert announcement.
- **Source:** VCST-5912 (Done) — quantity spinbutton exposed aria-invalid=true and a wrong aria-valuenow on untouched render; fixed
- **Trust:** DECLARED
- **Lifecycle:** SUSPECT — [bug] VCST-5878 compare table body scroller below md has no focusable content (axe scrollable-region-focusable, Serious) — pre-existing; CMP-047 failed on it in REG-2026-10-12-1832

---
