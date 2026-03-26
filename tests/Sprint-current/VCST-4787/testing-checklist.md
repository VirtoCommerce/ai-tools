# Testing Checklist — VCST-4787: Implement Dark-mode (purple-pink theme)

**PR:** VirtoCommerce/vc-frontend #2215
**Date:** 2026-03-25
**Tester:** test-management-specialist
**Suite target:** 070 (Whitelabeling Storefront), 071 (Whitelabeling Branding)
**Env:** `{{FRONT_URL}}` (Coffee theme on QA — switch org/store to purplePink > Dark mode for these tests)

## Scope Summary

| Area | Priority | Cases |
|------|----------|-------|
| A. Purple-Pink Dark Theme — preset activation | P0 | 001–006 |
| B. Purple-Pink Dark Theme — color token verification | P1 | 007–018 |
| C. VcPopover Refactor Regression | P0 | 019–033 |
| D. Dark Theme on Key Pages | P1 | 034–043 |
| E. Mobile Responsive (375px) | P1 | 044–048 |
| F. Cross-Theme Compatibility (Coffee/Default/Mercury) | P0 | 049–054 |
| G. WCAG Contrast — Purple-Pink Dark | P1 | 055–059 |
| H. Business Rules — BL-WL-001 / BL-WL-002 | P0 | 060–062 |

---

## A. Purple-Pink Dark Theme — Preset Activation

- [ ] **TC-4787-001** | P0 | `purplePinkDark` preset is registered and appears in the Admin Store White Labeling theme selector dropdown.
  **Expected:** Dropdown lists "purplePinkDark" (exact name, case-sensitive) alongside existing presets.

- [ ] **TC-4787-002** | P0 | Setting store theme to `purplePinkDark` in Admin and saving reflects on the storefront without page rebuild.
  **Expected:** After Admin save, storefront page loaded with `{{FRONT_URL}}` renders dark purple-pink colors (dark body background, not white). No 5xx errors in network tab.

- [ ] **TC-4787-003** | P0 | Dark mode toggle in storefront header/footer activates the purple-pink dark variant when `purplePinkDark` is the configured preset.
  **Expected:** Toggling dark mode applies `--vc-color-*` CSS variables from `purple-pink.dark.json`. Body background changes to dark value; toggle shows active state.

- [ ] **TC-4787-004** | P0 | Switching from purple-pink light to purple-pink dark (toggle on) and back (toggle off) works without page reload.
  **Expected:** Light → dark transition: dark bg applied. Dark → light transition: light bg restored. No flash of unstyled content (FOUC). No JS console errors on either toggle.

- [ ] **TC-4787-005** | P1 | Dark mode preference persists across page refresh when `purplePinkDark` is active.
  **Expected:** After enabling dark mode and pressing F5, dark theme remains applied. Toggle still shows enabled state. No FOUC of light theme before dark settles.

- [ ] **TC-4787-006** | P1 | Dark mode preference persists across SPA navigation (homepage → catalog → product detail → cart).
  **Expected:** Dark colors remain consistent on every route transition. No route that resets to light theme. Body background color is stable throughout.

---

## B. Purple-Pink Dark Theme — Color Token Verification

Verify via browser DevTools computed styles (`getComputedStyle`) against `purple-pink.dark.json` values.

- [ ] **TC-4787-007** | P1 | Body background and primary text color match dark spec.
  **Expected:** `--vc-color-body-bg` resolves to the dark body background token from `purple-pink.dark.json`. Primary text is legible (light color on dark background).

- [ ] **TC-4787-008** | P1 | Header top and header bottom background colors match dark spec.
  **Expected:** `color_header_top_bg` and `color_header_bottom_bg` tokens applied to header regions. Header does not appear white or transparent.

- [ ] **TC-4787-009** | P1 | Footer top and footer bottom background and text colors match dark spec.
  **Expected:** `color_footer_top_bg` / `color_footer_top_text` and `color_footer_bottom_bg` / `color_footer_bottom_text` tokens applied. Footer text is legible against its dark background.

- [ ] **TC-4787-010** | P1 | Price display color matches spec (`#c9b8ed` per context).
  **Expected:** Product price elements (`[data-test="product-price"]` or equivalent) render in the correct purple-toned light color, not white or default gray.

- [ ] **TC-4787-011** | P1 | Link colors and hover states match dark spec.
  **Expected:** Anchor tags render in the link color token from dark preset. Hover state changes to the hover-link token. No links are invisible (same color as background).

- [ ] **TC-4787-012** | P1 | Mobile menu background color matches dark spec.
  **Expected:** At 375px viewport, hamburger menu panel background uses `color_mobile_menu_bg` dark token, not white or light purple-pink.

- [ ] **TC-4787-013** | P1 | Button primary background and text colors match dark spec.
  **Expected:** Primary CTA buttons (Add to Cart, Place Order) render with correct dark-preset button colors, not with light-preset colors.

- [ ] **TC-4787-014** | P1 | Input field backgrounds, borders, and placeholder text match dark spec.
  **Expected:** Search input, form fields render with dark-appropriate background (not white). Placeholder text is visible. No inputs blend into the page background.

- [ ] **TC-4787-015** | P1 | Badge and tag colors (e.g., product labels, in-stock/out-of-stock) match dark spec.
  **Expected:** All 146 token categories are represented — badge/tag tokens render without falling back to light-preset values.

- [ ] **TC-4787-016** | P1 | Breadcrumb and navigation text colors match dark spec.
  **Expected:** Breadcrumb trail on catalog/product pages uses correct dark token. Active link distinguished from inactive.

- [ ] **TC-4787-017** | P2 | No orphaned CSS custom properties that fall back to `initial` or `inherit` when dark mode is active.
  **Expected:** DevTools CSS panel shows no `--vc-color-*` variables with unresolved/empty values in dark mode. All 146 tokens from `purple-pink.dark.json` are applied.

- [ ] **TC-4787-018** | P2 | Switching from `purplePinkDark` to another dark preset (coffee-dark or default-dark) and back clears all purple-pink dark CSS vars and re-applies the new preset correctly.
  **Expected:** No purple-pink color values leak through when a different dark preset is active. Theme isolation is complete.

---

## C. VcPopover Refactor Regression (CRITICAL)

These cases verify the `vc-popover.vue` refactor does not break any popover consumer. Test on the **current QA theme (Coffee)** unless noted — these are regression checks, not theme checks.

### Tooltip (vc-tooltip.vue)

- [ ] **TC-4787-019** | P0 | Tooltips render with correct background color via `--vc-popover-bg-color` CSS variable.
  **Expected:** Hovering an element with a tooltip shows the tooltip panel with a visible background (not transparent). Background color matches the expected token for the active theme.

- [ ] **TC-4787-020** | P0 | Tooltip arrow is visible and its color matches the tooltip background (no contrasting mismatch).
  **Expected:** `--arrow-color` CSS variable resolves to the same value as `--vc-popover-bg-color`. Arrow does not appear white on a dark tooltip or vice versa.

- [ ] **TC-4787-021** | P0 | Tooltip border radius is applied via `--vc-popover-radius` CSS variable.
  **Expected:** Tooltip corners are rounded consistent with the design system radius token. Tooltip does not have sharp 0px corners unless that is the theme default.

- [ ] **TC-4787-022** | P1 | Tooltip shadow is visible (VcPopover `shadow` prop is set where applicable).
  **Expected:** Tooltip has a visible box-shadow that lifts it from the page background. Shadow does not cause layout shift or overlap issues.

### Dropdown Menu (vc-dropdown-menu.vue)

- [ ] **TC-4787-023** | P0 | Dropdown menus open, display options, and close without visual regressions after the `vc-dropdown-menu.vue` CSS var migration.
  **Expected:** Dropdown background uses `--vc-popover-bg-color`. All menu items are visible and selectable. Dropdown does not clip, overflow, or appear below page fold unexpectedly.

- [ ] **TC-4787-024** | P0 | Dropdown menu arrow color matches dropdown background (same `--arrow-color` and `--vc-popover-bg-color` linkage).
  **Expected:** Arrow visible and color-matched to panel. No white arrow on white background or dark arrow on dark background.

- [ ] **TC-4787-025** | P1 | Dropdown menu positioning is unchanged — it opens relative to its trigger button, not off-screen.
  **Expected:** All dropdowns (header account, sort-by on catalog, etc.) open in the correct position relative to their trigger.

### Mega-Menu (mega-menu.vue)

- [ ] **TC-4787-026** | P0 | Mega-menu popover background matches the header-bottom region background (`--vc-popover-bg-color` set to header-bottom bg token via `mega-menu.vue` inline style).
  **Expected:** Mega-menu panel blends with the header-bottom strip — no visible seam between header and mega-menu at their join point. Panel background is not white if the header is dark.

- [ ] **TC-4787-027** | P0 | Mega-menu `shadow` prop produces a visible shadow below the mega-menu panel.
  **Expected:** Box-shadow visible on the bottom edge of the mega-menu. Does not interfere with catalog content below.

- [ ] **TC-4787-028** | P1 | Mega-menu arrow is colored correctly (matches header-bottom background, not white).
  **Expected:** Arrow at the top of the mega-menu panel matches the panel background. Transparent or contrasting arrow is a failure.

- [ ] **TC-4787-029** | P1 | Mega-menu opens and closes correctly on all top-level navigation items (hover or click per theme behavior).
  **Expected:** Each navigation category exposes its sub-items in the mega-menu without visual overlap, clipping, or z-index issues.

### Products Filters Popover (products-filters.vue)

- [ ] **TC-4787-030** | P0 | Filter dropdown popovers on catalog page still position correctly after the scoped CSS override was removed.
  **Expected:** All filter dropdowns (price, brand, category, etc.) open within viewport. The last filter in the row does not overflow off-screen to the right.

- [ ] **TC-4787-031** | P0 | Products filter popover `__body` slot renders filter controls (checkboxes, range sliders) inside the panel.
  **Expected:** After the `__content` → `__body` rename, filter popover content is still rendered. Panel is not empty.

- [ ] **TC-4787-032** | P1 | Applying a filter via the popover and closing it retains the active filter chip below the filter bar.
  **Expected:** Selected filter value appears as a removable chip. Popover can be re-opened and shows the previously selected value checked.

### VcPopover Structural — renamed slot `__content` → `__body`

- [ ] **TC-4787-033** | P0 | No "slot not found" or empty-panel regressions across any popover consumer in the storefront (tooltip, dropdown, mega-menu, filters, account menu, cart dropdown if applicable).
  **Expected:** All popovers render their content. No visible empty white boxes where content should appear. Check browser console for Vue slot-not-found warnings.

---

## D. Dark Theme on Key Pages (Purple-Pink Dark)

Precondition: store or org configured with `purplePinkDark` preset; dark mode enabled.

- [ ] **TC-4787-034** | P1 | Homepage renders correctly in purple-pink dark mode: hero, featured products, category tiles all use dark tokens.
  **Expected:** No white backgrounds on hero/banner areas. Product cards have dark bg. Section headings use correct dark text color.

- [ ] **TC-4787-035** | P1 | Catalog listing page (grid and list view) renders correctly in purple-pink dark mode.
  **Expected:** Product cards, filter sidebar, pagination all use dark-preset tokens. No light-mode residue (white card backgrounds, black text on dark bg).

- [ ] **TC-4787-036** | P1 | Product detail page renders correctly in purple-pink dark mode: title, price, description, add-to-cart button all use dark tokens.
  **Expected:** Price visible in `#c9b8ed` (or equivalent dark preset price token). Add to Cart button uses correct dark button color. Images are unaffected (not inverted).

- [ ] **TC-4787-037** | P1 | Cart page renders correctly in purple-pink dark mode: line items, totals, checkout button all use dark tokens.
  **Expected:** Line item rows have dark background. Quantity inputs are visible. Subtotal, tax, total values use correct color tokens. "Proceed to Checkout" button uses dark preset primary color.

- [ ] **TC-4787-038** | P1 | Checkout page renders correctly in purple-pink dark mode: address form, shipping selector, payment section all use dark tokens.
  **Expected:** Form fields are visible (dark input bg with light text). Step labels use correct dark text token. No form fields invisible due to white-on-white or dark-on-dark.

- [ ] **TC-4787-039** | P1 | Account pages (Orders, Profile, Addresses if visible) render correctly in purple-pink dark mode.
  **Expected:** Table rows, section headers, form fields all use dark tokens. Order status badges visible against dark row backgrounds.

- [ ] **TC-4787-040** | P2 | Search results page renders correctly in purple-pink dark mode: result cards, highlights, pagination all use dark tokens.
  **Expected:** Search highlight color is visible on dark background. Result card borders/shadows visible. No white card flash.

- [ ] **TC-4787-041** | P2 | 404 and empty-state pages render correctly in purple-pink dark mode (no unstyled light fallback).
  **Expected:** Error page background is dark. Text and illustration/icon colors use dark preset tokens.

- [ ] **TC-4787-042** | P2 | Toast notifications (add to cart, error, success) render correctly in purple-pink dark mode.
  **Expected:** Toast background uses dark token. Toast text is legible. Close button visible. Compare/list action buttons on toast are styled (not white-on-white — ref BUG from VCST-4718 watermelon).

- [ ] **TC-4787-043** | P2 | Modal dialogs (confirm, B2B invite, etc.) render correctly in purple-pink dark mode.
  **Expected:** Modal overlay is dark. Modal panel background uses dark preset token. Heading and body text visible. Action buttons styled correctly.

---

## E. Mobile Responsive — 375px (Purple-Pink Dark)

Precondition: browser viewport set to 375×812 (iPhone); purple-pink dark mode active.

- [ ] **TC-4787-044** | P1 | Hamburger icon is visible against the dark header background at 375px.
  **Expected:** Hamburger icon has sufficient contrast. Icon color uses dark-preset header icon token, not a dark icon on a dark header.

- [ ] **TC-4787-045** | P1 | Mobile menu panel renders with correct dark background (`color_mobile_menu_bg` token) when opened.
  **Expected:** Panel slides in with dark background. All menu items (text, icons, separators) are visible. No white panel on dark page.

- [ ] **TC-4787-046** | P1 | Mobile filter panel/drawer renders with dark tokens at 375px.
  **Expected:** Filter options (checkboxes, labels) visible on dark background. Apply/Reset buttons styled with dark preset tokens.

- [ ] **TC-4787-047** | P1 | Product image carousel and thumbnails render without color distortion in dark mode at 375px.
  **Expected:** Images display normally (not inverted or dimmed). Thumbnail border/active-state indicator uses correct dark preset token.

- [ ] **TC-4787-048** | P2 | Cart and checkout forms remain fully usable at 375px in purple-pink dark mode (no input invisibility, no button overlap).
  **Expected:** All interactive elements have sufficient size (min 44px tap target). Form fields clearly bounded. Submit button not obscured.

---

## F. Cross-Theme Compatibility (Regression on Coffee/Default/Mercury)

These cases confirm the `VcPopover` refactor and `purplePinkDark` registration did not break existing themes. Run on the **current QA env (Coffee theme)** — no preset switch needed.

- [ ] **TC-4787-049** | P0 | Coffee theme (QA default): tooltips render with correct background, shadow, arrow, and radius after VcPopover CSS var migration.
  **Expected:** Tooltip appearance on Coffee theme is identical to pre-PR baseline. No visual regression. Arrow color matches panel background.

- [ ] **TC-4787-050** | P0 | Coffee theme: dropdown menus (sort, account menu) render with correct background and positioning.
  **Expected:** All dropdowns open in correct position. Background matches Coffee theme token, not a hard-coded or leaked value.

- [ ] **TC-4787-051** | P0 | Coffee theme: mega-menu renders with correct header-bottom background and shadow.
  **Expected:** Mega-menu appears visually identical to pre-PR baseline on Coffee theme. Shadow visible, no seam.

- [ ] **TC-4787-052** | P0 | Coffee theme: products-filter popovers open correctly within viewport (no overflow regression).
  **Expected:** All filter dropdowns on catalog page open in-viewport. Last filter does not overflow off-screen.

- [ ] **TC-4787-053** | P1 | Coffee dark mode (if configured): VcPopover consumers render correctly — no CSS variable conflicts between coffee-dark and purple-pink-dark tokens.
  **Expected:** Switching org/store theme to coffee-dark shows coffee-dark colors in tooltips/dropdowns. No purple-pink color bleed.

- [ ] **TC-4787-054** | P1 | Default and Mercury themes: spot-check tooltip and dropdown appearance unchanged (select 2 pages each, verify no visual regression).
  **Expected:** Tooltip and dropdown appearance on Default/Mercury themes matches pre-PR baseline.

---

## G. WCAG Contrast — Purple-Pink Dark

Use browser DevTools "Accessibility" panel or Lighthouse to check contrast ratios. Target: WCAG 2.1 AA (4.5:1 for normal text, 3:1 for large text / UI components).

- [ ] **TC-4787-055** | P1 | Body text on dark body background meets WCAG AA (≥ 4.5:1 contrast ratio).
  **Expected:** Contrast ratio ≥ 4.5:1 for the primary text color token on the body background token.

- [ ] **TC-4787-056** | P1 | Header navigation links on header-bottom background meet WCAG AA.
  **Expected:** Navigation link color on header-bottom background ≥ 4.5:1.

- [ ] **TC-4787-057** | P1 | Price color (`#c9b8ed`) on product card background meets WCAG AA.
  **Expected:** Price text contrast ratio ≥ 4.5:1 against the card background.

- [ ] **TC-4787-058** | P1 | Button text on primary button background meets WCAG AA.
  **Expected:** Primary button label contrast ≥ 4.5:1 against button background.

- [ ] **TC-4787-059** | P2 | Footer text on footer-bottom background meets WCAG AA.
  **Expected:** Footer copyright/link text contrast ratio ≥ 4.5:1.

---

## H. Business Rules

- [ ] **TC-4787-060** | P0 | BL-WL-001: Organization-level `purplePinkDark` theme overrides store-level theme. When org sets `purplePinkDark` and store has a different theme, org users see purple-pink dark.
  **Expected:** Org user logs in → purple-pink dark tokens applied. Store admin user (no org) sees the store-level theme. Override chain: org > store > default.

- [ ] **TC-4787-061** | P0 | BL-WL-001: Theme preset name is case-sensitive. Setting org theme to `purplepinkdark` (lowercase) does NOT activate the preset; `purplePinkDark` (camelCase) does.
  **Expected:** Miscased theme name results in fallback to default theme, not an error. Correct camelCase activates purple-pink dark.

- [ ] **TC-4787-062** | P0 | BL-WL-002: Store White Labeling OFF disables `purplePinkDark` theme even if an org has it configured.
  **Expected:** When store WL=OFF, all branding (including `purplePinkDark`) is suppressed. Storefront renders with default platform theme regardless of org setting.

---

## Delegation

| Section | Agent | Browser |
|---------|-------|---------|
| A–B, D–E, H (Storefront UI) | `qa-frontend-expert` | `playwright-chrome` |
| C (VcPopover regression) | `qa-frontend-expert` | `playwright-chrome` |
| F (Cross-theme Coffee regression) | `qa-frontend-expert` | `playwright-chrome` (QA env, no preset switch needed) |
| G (WCAG contrast) | `ui-ux-expert` | Chrome DevTools MCP (Lighthouse) |
| Admin preset config steps (TC-4787-001, 060–062) | `qa-backend-expert` | `playwright-edge` |

## Evidence Requirements (per P0 case)

- Screenshot of before/after toggle or preset switch
- DevTools computed style snapshot showing resolved CSS variable value
- Console log (zero errors)
- Network tab (zero 4xx/5xx on theme asset requests)

## Known Risk

The VcPopover `__content` → `__body` slot rename (TC-4787-031, 033) is the highest structural risk — any Vue component that uses the old slot name will silently render empty content. Prioritize these checks before all UI-layer color verifications.
