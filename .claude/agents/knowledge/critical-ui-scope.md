---
applicability: reference
applicability_rationale: "vcst's 7 components × 8 pages coverage matrix. Customer adapts to their components/pages."
---

# Critical UI Scope — Regression-Enforced Component Checklist

**Canonical scope of UI primitives that every regression run must verify.** Layout-stability findings on these components are revenue-protecting, not cosmetic. The Coverage Matrix at the bottom of this file is **machine-readable**: `scripts/validate-critical-ui-scope.ts` parses it and fails the build if any covered cell points at a test ID that doesn't exist in any regression suite CSV.

> **Pre-reads:** [BL-UI invariants](business-logic.md#domain-15-ui-display--layout-stability-bl-ui), [storefront-selectors.md](storefront-selectors.md), [measure-layout.ts helper](../../../scripts/lib/measure-layout.ts), [048b suite](../../../regression/suites/Frontend/cross-cutting/048b-layout-stability.csv).
>
> **Owner agent:** [ui-ux-expert](../qa/ui-ux-expert.md). Other agents may consume this scope as input but should not modify it without explicit per-entry user approval (same convention as `business-logic.md` promotions per [feedback_business_logic_promotion](../../../memory)).

## Why a matrix, not a list

A flat list of "test these components" gives no enforcement. Adding a new test for one component while another silently regresses is the failure mode this file blocks. By making every (component × applicable BL-UI invariant) cell carry a covering test ID, and by gating CI on the matrix being fully populated, **a regression run is no longer permitted to pass with an uncovered critical surface.**

## Source of Truth

The **vc-frontend Storybook** (`{{STORYBOOK_URL}}` / `{{STORYBOOK_DEV_URL}}`) is the canonical inventory of Vc* primitives. As of 2026-05-14 it ships **87 stories** across 3 Atomic-Design tiers:

- **Atoms (37):** VcActionInput, VcBadge, VcBreadcrumbs, VcCarouselPagination, VcCheckboxGroup, VcCheckbox, VcContainer, VcDialog, VcExpansionPanels, VcIcon, VcImage, VcInfinityScrollLoader, VcInputDetails, VcLabel, VcLayout, VcLineItemPropertyDeprecated, VcLink, VcListItem, VcLoader, VcMarkdownRender, VcPopover, VcPopupSidebar, VcPriceDisplayCatalogDeprecated, VcPriceDisplay, VcProductActions, VcProductProperties, VcProductTitle, VcProductsGrid, VcProperty, VcRadioButton, VcScrollTopButton, VcScrollbar, VcSwitch, VcTooltip, VcTotalDisplay, VcTypography, VcVariantPickerGroup
- **Molecules (41):** VcAlert, VcButtonSeeMoreLess, VcButton, VcCarousel, VcChip, VcCollapsibleContent, VcCompositeShape, VcCopyText, VcDateSelector, VcDialogContent, VcDialogFooter, VcDialogHeader, VcDropdownMenu, VcEmptyPage, VcEmptyView, VcExpansionPanel, VcFilePicker, VcFileUploader, VcFile, VcInput, VcItemPriceCatalog, VcLineItem, VcLineItems, VcList, VcLoaderOverlay, VcLoaderWithText, VcMenuItem, VcNavButton, VcProductActionsButton, VcProductPrice, VcProductTotal, VcRating, VcSelect, VcShape, VcSlider, VcSteps, VcTabSwitch, VcTextarea, VcVariantPicker, VcWidgetSkeleton, VcWidget
- **Organisms (9):** VcProductButton, VcAddToCart, VcConfirmationModal, VcModal, VcPagination, VcProductCard, VcProductImage, VcQuantityStepper, VcTable

**Three of this file's entries are page-level compositions, not Storybook primitives:** Header, Notifications, BOPIS Modal. They earn rows because their layout-stability contract still must be gated — but treat their audit protocols as integration-only (no Storybook isolation audit applicable).

## Component inventory

Thirty-six entries, ordered by criticality. Criticality = (revenue-path proximity) × (defect blast radius) × (frequency of render across pages).

| # | Component | Why critical |
|---|-----------|--------------|
| 1 | **VcButton** | Action surface for every page. A 1 px regression replicates across hundreds of buttons. Touch-target regressions block mobile checkout. |
| 2 | **VcProductCard** | Browse → buy funnel entry. Renders 16+ instances per catalog page; height drift breaks the grid; long-title overflow obscures price. |
| 3 | **VcLineItem** | Cart edit surface. Stepper-update shift makes accidental over-orders; line totals reflow obscures the running total. |
| 4 | **VcTable** | Data surfaces (orders, lists, members). Row-height drift across data rows is the canonical "looks broken" signal users notice fastest. |
| 5 | **VcDialog (modal)** | Address/confirmation modals. Body-scroll-lock done wrong causes background page jump on open; close-button under 44 px is the mobile-trap defect. |
| 6 | **Popover** (ship-to selector, account dropdown) | State-shift sensitive — opening must not displace adjacent header items. Content overflow on mobile is chronic. |
| 7 | **VcSidebar** (account section — VcLayout sidebar slot) | Layout backbone for `/account/*`. **Naming note:** there is no Storybook primitive literally named "VcSidebar" — this row audits the [VcLayout](https://vcst-qa-storybook.govirto.com/?path=/docs/components-atoms-vclayout--docs) sidebar slot pattern. Storybook also ships [VcPopupSidebar](https://vcst-qa-storybook.govirto.com/?path=/docs/components-atoms-vcpopupsidebar--docs) (mobile-drawer pattern) — distinct from this row. Sidebar item alignment drift signals a broken design-token chain. |
| 8 | **BOPIS Modal** (pickup-locations-modal) | Revenue-critical pickup flow. 102-location scroll list (no pagination) + country/region/city filters + map column → high complexity, layout-stability defects likely. Specialization of VcDialog with unique behaviors warranting dedicated coverage. |
| 9 | **VcInput** (form primitive) | Every form: sign-in, sign-up, search, address, qty, configurable text. `.vc-input--error` insertion is BL-UI-003 critical — validation message must not shift form below. Mobile-keyboard layout regressions are chronic. |
| 10 | **VcQuantityStepper** | Revenue-path component: on B2B-store it IS the add-to-cart entry on PDP (per `feedback_qty_stepper_as_add_to_cart`). Renders on PDP, cart line item, and per-option in Configurable PDP. Currently audited only transitively via VcLineItem. |
| 11 | **Header** (top-header chrome) | Renders on every page — 25+ persistent `data-test-id`s (language/currency/ship-to/account-button/cart-link/search/dark-mode toggle). Layout regressions here cascade everywhere. Mobile hamburger inventory (per `feedback_mobile_hamburger_inventory`) re-mounts header controls at ≤500 px. |
| 12 | **Notifications/Toast** (`useNotifications`) | Toast appearance must not shift main content (BL-UI-003). Stackable, 4 severity levels — risk of stack-height pushing CTAs out of view. Selector: `.notifications-host__wrapper:not(:empty)`. |
| 13 | **VcPriceDisplay/VcPrice** | Wherever money renders. Dynamic price on Configurable PDP MUST not reflow sidebar. Sale strikethrough + actual-price baseline alignment is fragile. Partially audited transitively via VcProductCard/VcLineItem; dedicated row formalizes dynamic-update coverage. |
| 14 | **VcEmptyView/Empty State** | Renders conditionally — easy to miss. Empty cart, empty wishlist, no-search-results layouts differ from populated states. Selector: `.vc-empty-page` and friends. |
| 15 | **VcCheckbox** | Cart select-all + per-line checkboxes (`[data-test-id="vc-line-items-head-checkbox"]`, `[data-test-id="vc-line-item-checkbox"]`), checkout `billing-address-equals-shipping-checkbox`, catalog facet toggles (`purchased-before-checkbox-filter`). State-change on select-all triggers action-bar render — BL-UI-003 critical. Touch target on mobile is a chronic pain point. |
| 16 | **VcRadioButton** | BOPIS modal row selection (50 instances per modal load, `.vc-radio-button--checked` is the selected-state marker), Configurable PDP option selection, shipping-method selector, payment-method selector. Selection-change on shipping/payment may shift the form below — BL-UI-003 critical. Touch target on mobile (label-as-click-target pattern). |
| 17 | **VcChip** | Inline status indicator — in-stock badge on Configurable PDP (`.vc-chip.vc-chip--color--success`), pickup-availability chips in BOPIS modal (`[data-test-id="pickup-availability-chip"]` × 51 instances). High-frequency render; wrapping/sizing regressions break row alignment. Color-token variants (success/warning/danger) must comply with BL-UI-002 spacing grid. |
| 18 | **VcSelect** (dropdown) | Address-form Country / State / Province selectors, catalog sort selector, BOPIS modal country/region/city filters (`[data-test-id="filter-country"]`, `[data-test-id="filter-region"]`, `[data-test-id="filter-city"]`). On-change form reflow is BL-UI-003 critical (Country change repopulates State options → form may resize). Dropdown panel open must not shift main content. Long option labels (country names in non-Latin scripts) stress BL-UI-004. |
| 19 | **VcDropdownMenu** (menu-list overlay) | Header account-menu (`OrgName / UserName` button opens dropdown with User + Organizations sections, per sitemap §11), language-selector + currency-selector menus, header All-products + notifications dropdowns, catalog sort menu, BOPIS modal facet filter dropdowns (`.vc-popover.vc-dropdown-menu`). Distinct from generic Popover (#6, content overlay) and VcSelect (#18, form-field). Menu-item hover must not shift the menu; opening must not push adjacent header items. Long item lists need keyboard navigation + mobile overflow handling. |
| 20 | **VcVariantPicker** | Variant selector on PDP + catalog cards (`[data-test-id^="variations-"]`). Variant change swaps price + image + inventory — must NOT push the Add-to-Cart CTA or shift the gallery (BL-UI-003 critical on revenue path). Swatch row alignment, long color/size labels at 375 px. |
| 21 | **VcWidget** (content section wrapper) | Generic widget wrapper (`<section class="vc-widget …">`). Hosts order summary widget, product price block, configurable PDP sections (`.vc-widget--collapsible`). Skeleton variant: `.vc-widget-skeleton`. Critical because the widget IS the structural container — its padding/border/collapsible toggle behaviors anchor multiple downstream components. Header alignment across stacked widgets in a column. |
| 22 | **VcTabSwitch** | Tab-switcher pattern — catalog view switcher (`[data-test-id="view-switcher"]` with `grid-view-tab` / `list-view-tab`), PDP details tabs, account sub-section tabs (where applicable). Active-tab underline transition must not jump; long tab labels at 375 px stress BL-UI-004; tab tap targets are mobile-critical. |
| 23 | **VcSwitch** (toggle) | Binary on/off control — used in preferences, filter toggles where rendered as switches, possibly the dark-mode toggle variant in account settings. State-change must not shift adjacent text/labels (BL-UI-003). Mobile tap target ≥ 44 × 44 including label hit-area. |
| 24 | **VcScrollbar** (custom scroll) | Custom scroll primitive (`.vc-scrollbar.vc-scrollbar--vertical`). Used inside the BOPIS modal location list (50 of 102 rows scroll), VcTable mobile horizontal scroll, and other constrained-height surfaces. Critical because scrollbar appearance/disappearance on overflow MUST NOT shift adjacent content (the container must reserve scrollbar gutter). |
| 25 | **VcImage** (Atoms) | The **#1 CLS offender** per BL-UI-001. Used everywhere images render — product cards, line items, PDP gallery, home hero, content blocks. Without `width`/`height` attrs or `aspect-ratio` CSS, image load shifts surrounding content. Currently BL-UI-001 is anchored on VcProductCard/VcLineItem (their containing parents); a dedicated row formalizes the image-attribute contract at the primitive level. |
| 26 | **VcAlert** (Molecules) | Inline error/warning/info/success banner — distinct from Notifications/Toast (#12, overlay). Renders inline above forms (sign-in failures, payment errors), inside cart (validation failures), at top of pages (system messages). Insertion MUST shift downstream content predictably; container must reserve space when conditionally rendered. |
| 27 | **VcBadge** (Atoms) | Counter / status badge — header cart count (1 → 99 digit-width change), notifications count, account-menu unread indicator. Digit-count change MUST NOT shift adjacent header items (already cited in BL-UI-003 rationale; dedicated row formalizes). Currently audited transitively under Header. |
| 28 | **VcCarousel** (Molecules) | Home hero (`.slider-block`), PDP image gallery (paired with VcCarouselPagination Atom). Lazy-loaded slide images are a primary BL-UI-001 source; navigation arrows + pagination dots stress BL-UI-006 on mobile; slide-change auto-rotate must not shift surrounding chrome. |
| 29 | **VcPagination** (Organisms) | Page-navigation control. Renders on data tables / catalog pagination where endless-scroll isn't used. Compact mode for mobile (ellipsis), page-number row alignment, page-button touch targets are all BL-UI risks. |
| 30 | **VcExpansionPanels / VcExpansionPanel** (Atoms + Molecules) | Accordion pattern — Atoms ships the group container (`VcExpansionPanels`), Molecules ships the single panel (`VcExpansionPanel`). Used in FAQ, PDP details on mobile, filter facet groups. Expand/collapse triggers a controlled shift of adjacent panels; long content inside a panel stresses BL-UI-004; panel-header touch targets stress BL-UI-006. |
| 31 | **VcModal** (Organisms) | Underlying modal wrapper primitive (`.vc-modal`, `.vc-modal__wrapper`, `.vc-modal__backdrop`, `.vc-modal__panel`). Hosts `VcDialog` (#5) inside. BOPIS Modal (#8) and VcConfirmationModal (#32) are specializations. Audits the wrapper-level body-scroll-lock + fullscreen-on-mobile contracts (vs. VcDialog #5 which audits the inner dialog frame). |
| 32 | **VcConfirmationModal** (Organisms) | Yes/no confirmation pattern (thin VcModal specialization with confirm/cancel button row). Used for destructive actions (remove item, clear cart, delete address). Button-row alignment, long-message overflow, button touch targets. |
| 33 | **VcAddToCart** (Organisms) | Dedicated Add-to-Cart button — used on Configurable PDP (`[data-test-id="sidebar"] .product-price-block button[aria-label="Add to cart"]` per storefront-selectors §12). On standard B2B-store PDP the qty stepper plays this role instead (per `feedback_qty_stepper_as_add_to_cart`). Loading state on click must not shift adjacent content. |
| 34 | **VcSlider** (Molecules) | Range slider — price-range facet filter on `/catalog`. Handle drag updates value display without shifting surrounding controls. Handle touch target ≥ 44 × 44 is a chronic mobile-slider pain point. |
| 35 | **VcRating** (Molecules) | Product star rating display. Renders on product cards + PDP. Stars + count baseline alignment; mostly read-only so BL-UI-003 / BL-UI-006 typically N/A. |
| 36 | **VcBreadcrumbs** (Atoms) | Hierarchical navigation row above PDP / category content. Long path (deep category trees) overflows at 375 px — chronic mobile issue. Breadcrumb items + separators baseline alignment. |

## Render-location map

Every audit MUST exercise the component on its real render surface. Selectors come from [storefront-selectors.md](storefront-selectors.md) — never duplicate them here, just reference.

| Component | Primary live URL | Secondary URL(s) | Trigger to render |
|-----------|------------------|------------------|-------------------|
| VcButton | `/cart` (checkout CTAs), `/` (header buttons) | every page | always present |
| VcProductCard | `/catalog` | `/`, `/search?q={query}`, `/category/{guid}` | always present once content resolves |
| VcLineItem | `/cart` | n/a | requires authenticated user with ≥ 1 item in cart |
| VcTable | `/account/orders` | `/account/lists`, `/account/quotes` | requires authenticated user with order history |
| VcDialog | `/cart` (address modal) | `/account/addresses` (address-edit modal) | opens on click of `[data-test-id="select-address-button"]` or "Add new address" |
| Popover | `/` header (ship-to selector) | `/` header (account dropdown) | opens on click of `[data-test-id="ship-to-selector"]` or `[data-test-id="account-button"]` |
| VcSidebar | `/account/dashboard` | `/account/orders`, `/account/lists`, `/account/addresses` | renders alongside main content on every `/account/*` route (audited as the VcLayout sidebar slot — see Storybook `VcLayout`) |
| BOPIS Modal | `/cart` → click `[data-test-id="pickup-switcher"]` → click `[data-test-id="pickup-location-section"] [data-test-id="select-address-button"]` (pencil/edit icon) | n/a — single trigger surface | requires authenticated user with cart containing ≥ 1 pickup-eligible item (else `pickup-switcher` absent → BLOCKED) |
| VcInput | `/sign-in` (email/password) | `/sign-up`, `/account/addresses` (address form), `/account/profile`, `/cart` (qty inputs, search), Configurable PDP text section | always present on form pages; error state requires submitting invalid value |
| VcQuantityStepper | `/cart` (line items) | PDP (`@td(STRESS.longTitleSlug)` or any in-stock SKU), Configurable PDP (per-option steppers, up to 6 instances) | PDP requires in-stock SKU; cart requires ≥ 1 line item |
| Header | `/` | every page (always rendered) | always present once page loads; mobile drawer requires viewport ≤ 500 px |
| Notifications/Toast | `/cart` (post-action toast on add/remove/coupon) | every page (global host) | trigger: perform an action that emits a notification (e.g. add-to-cart, remove-item, apply-coupon) |
| VcPriceDisplay | `/catalog` (card prices) | PDP, `/cart` (line item prices + summary), Configurable PDP sidebar (dynamic price `[data-test-id="sidebar"] .product-price-block .price__actual`) | always present on price-bearing surfaces |
| VcEmptyView | `/cart` when empty (`.vc-empty-page`) | `/account/lists` (empty wishlist), `/search?q=zzz-no-results` (no results), `/account/orders` (no orders) | requires inducing empty state — log in with an account that has no cart/lists/orders, OR clear cart, OR search for nonsense query |
| VcCheckbox | `/cart` (head + per-line checkboxes, billing-equals-shipping) | `/catalog` (facet checkbox filters), `/account/lists` (per-item select) | always present on /cart with ≥ 1 line item; facets present on /catalog with filter-applicable category |
| VcRadioButton | BOPIS Modal (pickup-location list — 50 rows) | Configurable PDP (option selection), `/cart` (shipping-method-selector, payment-method-selector) | BOPIS variant needs cart with pickup-eligible item; cart variant needs shipping/payment methods configured |
| VcChip | Configurable PDP (`.vc-chip.vc-chip--color--success` in-stock indicator) | BOPIS Modal (`[data-test-id="pickup-availability-chip"]` × 51 — 50 in list + 1 in card) | always present once host surface renders; BOPIS chips appear with the modal open |
| VcSelect | `/account/addresses` (address-edit form: Country / State / Province) | BOPIS Modal filter dropdowns (`filter-country`, `filter-region`, `filter-city`), `/catalog` sort selector | address-form variant requires user with editable address; BOPIS variant present whenever the modal is open |
| VcDropdownMenu | `/` header — click `[data-test-id="account-button"]` to open the account-menu dropdown (user + organizations sections per sitemap §11) | header `[data-test-id="language-selector-button"]`, `[data-test-id="currency-selector-button"]`, `/catalog` sort menu | always present on header; account-menu requires authenticated user |
| VcVariantPicker | `/catalog` (cards with variants → `[data-test-id^="variations-"]`) | PDP for a variation-bearing product (e.g. `/products-with-options/variations-of-jeans/baggy-regular-jeans-grey`) | requires a SKU that has ≥ 2 variations configured |
| VcWidget | `/cart` (order-summary widget `[data-test-id="order-summary-widget"]`) | PDP (product price block `.product-price-block.vc-widget`), Configurable PDP (configuration sections `.vc-widget--collapsible`) | always present on host surface |
| VcTabSwitch | `/catalog` (view switcher `[data-test-id="view-switcher"]` with `grid-view-tab` / `list-view-tab`) | PDP detail tabs (if rendered for the SKU under test) | always present on /catalog; PDP tab presence varies by SKU |
| VcSwitch | `/account/profile` (preference toggles) — verify selector live | `/account/notifications` (notification preferences if rendered), filter facets where rendered as switches | requires authenticated user with editable preferences |
| VcScrollbar | BOPIS Modal location list (`[data-test-id="pickup-locations-modal"] .vc-scrollbar.vc-scrollbar--vertical`) | VcTable mobile/desktop variants with constrained-height containers | BOPIS variant present when modal is open; verify other surfaces live |
| VcImage | `/catalog` (`.vc-product-card .vc-product-image img`) | PDP gallery (`.image-gallery__img--active`), `/cart` line item (`.vc-line-item img.vc-image`), `/` hero | always present once host surface resolves |
| VcAlert | `/sign-in` failed-login alert (incognito context) | `/cart` (validation alerts), `/checkout/payment` (payment-error alert) | requires inducing an error or alert condition |
| VcBadge | `/` header cart count (badge on cart icon) | account-menu unread indicator, notifications icon | header badge always present once cart count > 0; manipulate cart to vary digit count |
| VcCarousel | `/` home hero (`.slider-block`) | PDP image gallery (paired with VcCarouselPagination) | always present on home; PDP gallery requires PDP with ≥ 2 images |
| VcPagination | `/account/orders` (when orders count > page size) | other paginated lists — verify live | requires sufficient items to trigger pagination |
| VcExpansionPanels / VcExpansionPanel | `/catalog` filter facet groups (`.vc-expansion-panels`) | FAQ pages, PDP details on mobile | always present where facets/details render |
| VcModal | BOPIS Modal trigger (`/cart` → pickup-switcher → pencil — see Component §8) | any other modal trigger (e.g., address-edit on /cart, login-modal if rendered) | open any modal to exercise the VcModal wrapper |
| VcConfirmationModal | `/cart` → click `[data-test-id="clear-cart-button"]` (clear-cart confirmation) | `/account/lists` (delete-list confirmation), `/account/addresses` (delete-address confirmation) | requires inducing a destructive action |
| VcAddToCart | Configurable PDP (`[data-test-id="sidebar"] .product-price-block button[aria-label="Add to cart"]`) | n/a — standard B2B-store PDP uses qty stepper instead | requires a configurable product fixture (`@td(CONFIGURABLE.testSlug)`) |
| VcSlider | `/catalog` price-range facet (`.vc-slider` inside `[data-test-id="filter-price"]`) | other range-based facets if rendered | requires a category with price-range facet enabled |
| VcRating | `/catalog` product card (rated SKUs) | PDP rated SKU detail page | requires a SKU with rating data |
| VcBreadcrumbs | PDP (`@td(STRESS.longTitleSlug)` or any product with breadcrumbs) | category page (`/products-with-options/variations-of-jeans`) | always present on PDP / nested category routes |

## Applicability of BL-UI invariants per component

Not every invariant is meaningful for every component. The matrix at the bottom uses these applicability rules:

- **BL-UI-001 (CLS)** — Page-level metric. Applies to `VcProductCard` and `VcLineItem` because they're the visible content blocks whose load-time shifts the user perceives. Also applies to `VcImage` (the primitive that owns the width/height-attribute contract — the #1 CLS offender) and `VcCarousel` (lazy-loaded slides). Does NOT apply in isolation to `VcButton`, `VcSidebar`, `VcInput`, `VcQuantityStepper`, `Header`, `Notifications`, `VcPriceDisplay`, `VcEmptyView`, `VcCheckbox`, `VcRadioButton`, `VcChip`, `VcSelect`, `VcDropdownMenu`, `VcVariantPicker`, `VcWidget`, `VcTabSwitch`, `VcSwitch`, `VcScrollbar`, `VcAlert`, `VcBadge`, `VcPagination`, `VcExpansionPanels`, `VcModal`, `VcConfirmationModal`, `VcAddToCart`, `VcSlider`, `VcRating`, `VcBreadcrumbs`, etc. (their CLS contribution is rolled into the page's overall CLS, already covered by `LAYOUT-CLS-001..004` and the per-page `LAYOUT-PAGE-CLS-*` IDs).
- **BL-UI-002 (spacing grid)** — Applies to every component with computed padding/margin/gap. Universal — including all new entries: VcImage, VcAlert, VcBadge, VcCarousel, VcPagination, VcExpansionPanels, VcModal, VcConfirmationModal, VcAddToCart, VcSlider, VcRating, VcBreadcrumbs (plus everything from earlier additions).
- **BL-UI-003 (state-induced shift)** — Applies to components with state transitions: hover (VcButton, VcProductCard, VcDropdownMenu item hover), update (VcLineItem stepper, cart badge, VcQuantityStepper +/− press, VcPriceDisplay dynamic update on Configurable PDP, VcBadge digit-count change), open (VcDialog, Popover, BOPIS Modal, Header mobile drawer, VcSelect dropdown panel, VcDropdownMenu panel, VcModal wrapper, VcConfirmationModal), sort/filter (VcTable), validation-error insertion (VcInput), toast emit (Notifications), alert insertion (VcAlert — inline banner appears above content), select-all toggle (VcCheckbox — action-bar reveal), shipping/payment method change (VcRadioButton — form section reflow), country change (VcSelect — State/Province options repopulate, form section may resize), variant change (VcVariantPicker — price/image swap), collapse/expand (VcWidget collapsible toggle, VcExpansionPanels expand/collapse), tab switch (VcTabSwitch — underline indicator, content panel swap), toggle (VcSwitch — adjacent text must not shift), scrollbar appear/disappear on overflow (VcScrollbar — content gutter must be reserved), slide change (VcCarousel — surrounding chrome stays fixed), page change (VcPagination — pagination control stays fixed; only the list rows replace), broken-image placeholder swap (VcImage), loading state (VcAddToCart spinner overlay), drag (VcSlider handle drag updates value-display). Does NOT apply to VcChip, VcRating (typically read-only display), VcBreadcrumbs (static once rendered).
- **BL-UI-004 (content boundary / overflow)** — Applies to text-bearing or content-bearing components: VcProductCard (long title), VcLineItem (long title), VcTable (long cell content), VcDialog (long modal content), Popover (mobile width), VcInput (long value), VcEmptyView (illustration + text @375), Header (hamburger overflow @375), VcChip (long label wrap/truncate), VcSelect (long option label inside trigger; long-option-list panel overflow at 375 px), VcDropdownMenu (long item label; mobile panel width), VcVariantPicker (long swatch labels wrap), VcWidget (long content inside collapsible body), VcTabSwitch (long tab labels @375), VcAlert (long-message overflow), VcCarousel (slide content at 375 px), VcPagination (many-page truncation / compact mode at 375 px), VcExpansionPanels (long content inside open panel), VcModal (mobile fullscreen modifier), VcConfirmationModal (long-message), VcBreadcrumbs (deep-path overflow at 375 px). Does NOT apply to VcCheckbox/VcRadioButton/VcSwitch (fixed-size toggles), VcScrollbar (the component IS the overflow handler), VcImage / VcBadge / VcAddToCart / VcSlider / VcRating (sizing intrinsic to the primitive contract).
- **BL-UI-005 (alignment)** — Applies to multi-element groups: VcProductCard in grid row, VcLineItem in cart row, VcTable cell row, VcSidebar nav items, Header nav items in row, VcPriceDisplay (sale strikethrough + actual price baseline), VcQuantityStepper (+/− buttons align with numeric input), VcCheckbox (icon + label baseline), VcRadioButton (radio dot + label baseline), VcChip (baseline alignment within a row of chips, e.g. availability chips per pickup row), VcDropdownMenu (menu items align vertically — leading icon / label / trailing chevron baseline), VcVariantPicker (swatch row baseline alignment), VcWidget (widget headers align across stacked widgets in a column), VcTabSwitch (tabs in a row align), VcSwitch (switch + label baseline), VcBadge (baseline within parent icon), VcPagination (page-number row baseline), VcExpansionPanels (panel-header row alignment), VcConfirmationModal (button-row alignment), VcSlider (handles + track + value labels), VcRating (stars + count baseline), VcBreadcrumbs (breadcrumb items + separators baseline). Does NOT apply to VcSelect (single-column field), VcScrollbar (single-axis primitive), VcImage / VcAlert / VcModal / VcAddToCart / VcCarousel (single-element or single-column compositions).
- **BL-UI-006 (touch targets at ≤ 768 px)** — Applies to components containing interactive elements: VcButton (everywhere), VcLineItem (stepper, remove, checkbox), VcDialog (close, action buttons), VcProductCard (variations/add buttons on mobile), VcInput (form fields ≥ 44 px), VcQuantityStepper (+/− buttons), Header (hamburger toggle, cart icon, account button), VcCheckbox (tap target ≥ 44 px including label hit-area), VcRadioButton (tap target ≥ 44 px including label hit-area, with ≥ 8 px gap between stacked radios), VcSelect (trigger button ≥ 44 × 44; each option row in the open panel ≥ 44 px tall), VcDropdownMenu (trigger + each menu item ≥ 44 × 44), VcVariantPicker (each swatch/option ≥ 44 × 44 with ≥ 8 px gap), VcTabSwitch (each tab ≥ 44 × 44 with ≥ 8 px gap), VcSwitch (tap target ≥ 44 × 44 including label hit-area), VcAlert (close button if present ≥ 44 × 44), VcCarousel (navigation arrows + pagination dots ≥ 44 × 44), VcPagination (each page button ≥ 44 × 44), VcExpansionPanels (panel-header tap target ≥ 44 × 44), VcModal (close button), VcConfirmationModal (confirm + cancel buttons), VcAddToCart (button ≥ 44 × 44), VcSlider (handle tap target — chronic mobile-slider pain point). Does NOT apply to VcChip (currently status-only, non-interactive in this codebase), VcWidget (header collapse toggle is already audited via VcButton), VcScrollbar (mobile devices use native scroll), VcImage / VcBadge / VcRating / VcBreadcrumbs (non-interactive or links audited at parent-page level).

Cells marked `—` in the matrix are non-applicable by these rules and are NOT counted toward the gap total.

## Audit protocol per component

Run order: top to bottom. Each protocol assumes the agent is on the correct render URL (see map above) and the user is authenticated where required.

### 1. VcButton

```text
SCOPE: header buttons + main content buttons (exclude footer chrome)
1. browser_evaluate(spacingAuditSnippet('header button, main button'))
   → classifySpacing()
2. browser_evaluate(rectSnapshotSnippet('header [data-test-id="account-button"]')) → before
   browser_hover('header [data-test-id="account-button"]')
   wait 500ms
   browser_evaluate(rectSnapshotSnippet('header [data-test-id="account-button"]')) → after
   → compareRectSnapshots — self-shift acceptable iff layout-neutral (transform, outline)
3. At viewport 375 px:
   browser_evaluate(touchTargetAuditSnippet('main'))
   → classifyTouchTargets()
```

### 2. VcProductCard

```text
1. browser_evaluate(spacingAuditSnippet(
     '.category-products__list .vc-product-card,
      .category-products__list .vc-product-card .vc-product-title,
      .category-products__list .vc-product-card .vc-product-price'))
2. browser_evaluate(alignmentAuditSnippet(
     '.category-products__list .vc-product-card:nth-child(-n+4)'))
3. browser_evaluate(rectSnapshotSnippet('.category-products__list .vc-product-card:nth-child(2)')) → before
   browser_hover('.category-products__list .vc-product-card:nth-child(1)')
   browser_evaluate(rectSnapshotSnippet('.category-products__list .vc-product-card:nth-child(2)')) → after
   → compareRectSnapshots — neighbor topDelta/leftDelta must be 0
4. Long-title stress: navigate to @td(STRESS.longTitleSlug); verify title wraps or truncates within container
```

### 3. VcLineItem

```text
PREREQ: cart has 1+ items
1. browser_evaluate(spacingAuditSnippet(
     '.vc-line-item,
      .vc-line-item .vc-quantity-stepper,
      .vc-line-item .vc-line-item__property-price,
      .vc-line-item .vc-line-item__total'))
2. browser_evaluate(alignmentAuditSnippet(
     '.vc-line-item .vc-quantity-stepper,
      .vc-line-item .vc-line-item__property-price,
      .vc-line-item .vc-line-item__total,
      .vc-line-item [data-test-id="remove-item-button"]'))
3. State-shift on stepper update:
   browser_evaluate(rectSnapshotSnippet('.vc-line-item:nth-child(2)')) → before  (need 2+ line items)
   browser_click('.vc-line-item:nth-child(1) .vc-quantity-stepper button[aria-label="Increase quantity"]')
   wait for cart totals to recompute
   browser_evaluate(rectSnapshotSnippet('.vc-line-item:nth-child(2)')) → after
   → compareRectSnapshots — sibling line item must not shift
4. At viewport 375 px:
   browser_evaluate(touchTargetAuditSnippet('[data-test-id="cart.products-section"]'))
```

### 4. VcTable

```text
PREREQ: authenticated user with order history (at least 3 orders for row-parity test)
NAV: /account/orders
1. wait for `.vc-table` to render (skeleton clears, ≥ 3 `tbody tr`)
2. browser_evaluate(spacingAuditSnippet('.vc-table, .vc-table th, .vc-table td'))
3. browser_evaluate(alignmentAuditSnippet('.vc-table tbody tr:nth-child(-n+3)'))
   → row heights must drift by ≤ 1 px
4. State-shift on column sort:
   browser_evaluate(rectSnapshotSnippet('main')) → before  (full-page reference; sort-induced shift is large if present)
   browser_click('.vc-table thead [role="button"]:first-of-type')  // first sortable column
   wait 300ms for sort to settle
   browser_evaluate(rectSnapshotSnippet('main')) → after
   → compareRectSnapshots — main shouldn't jump > 1 px (rows rearrange but page does not)
5. Skeleton → table swap (slow 3G):
   covered by LAYOUT-SHIFT-004 in 048b
```

### 5. VcDialog (modal)

```text
PREREQ: authenticated user on /cart
1. browser_evaluate(rectSnapshotSnippet('main')) → before-open
2. browser_click('[data-test-id="select-address-button"]')
3. wait for modal to be visible (.vc-dialog, .modal, or whichever class — verify in DOM)
4. browser_evaluate(rectSnapshotSnippet('main')) → after-open
   → compareRectSnapshots — main should NOT shift on modal open
   (typical regression: body-scroll-lock removes scrollbar, page widens, content shifts left)
5. At viewport 375 px:
   browser_evaluate(touchTargetAuditSnippet('[role="dialog"], .vc-dialog'))
   → close button (X) and modal CTAs must all be ≥ 44×44
```

### 6. Popover (ship-to selector)

```text
NAV: / (home, authenticated)
1. browser_evaluate(rectSnapshotSnippet('header [data-test-id="account-button"]')) → before
2. browser_click('header [data-test-id="ship-to-selector"]')
3. wait 300ms for popover to render
4. browser_evaluate(rectSnapshotSnippet('header [data-test-id="account-button"]')) → after
   → compareRectSnapshots — header neighbor MUST NOT shift when popover opens
5. At viewport 375 px (popover still open):
   browser_evaluate(LAYOUT_SNIPPETS.overflowAudit)
   → no horizontal scroll; no clipped favorite-address rows in popover
6. browser_evaluate(spacingAuditSnippet('[data-test-id="shipping-addresses-list"] li, [data-test-id^="ship-to-favorite-icon-"]'))
```

### 7. VcSidebar (account section)

```text
PREREQ: authenticated user
NAV: /account/dashboard
1. wait for sidebar to render (locate via `aside` or `.account-sidebar` — verify in DOM)
2. browser_evaluate(spacingAuditSnippet('aside nav a, aside nav li'))
3. browser_evaluate(alignmentAuditSnippet('aside nav a:nth-child(-n+5)'))
   → first 5 sidebar items must align (vertical centers within 1 px, heights match)
4. Cross-route stability:
   browser_evaluate(rectSnapshotSnippet('aside')) → before
   browser_click on a sidebar nav item (e.g. Orders)
   wait for navigation
   browser_evaluate(rectSnapshotSnippet('aside')) → after
   → sidebar position must NOT shift (it's the persistent layout backbone)
5. Overflow at 375 px:
   browser_evaluate(LAYOUT_SNIPPETS.overflowAudit)  // assumes sidebar collapses to hamburger or drawer; verify
```

### 8. BOPIS Modal

```text
PREREQ: authenticated user with cart containing ≥ 1 pickup-eligible item
       (see storefront-selectors.md Section 11 — pickup-switcher must be present on /cart)
NAV: /cart
1. browser_click('[data-test-id="pickup-switcher"]')                              // activate pickup tab
2. browser_click('[data-test-id="pickup-location-section"] [data-test-id="select-address-button"]')  // pencil opens modal
3. wait for '[data-test-id="pickup-locations-modal"]' to render with ≥ 10 rows

4. SPACING (BL-UI-002):
   browser_evaluate(spacingAuditSnippet(
     '[data-test-id="pickup-locations-modal"] .vc-dialog-header,
      [data-test-id="pickup-locations-modal"] .select-address-map-list,
      [data-test-id="pickup-locations-list"] > .select-address-map-list__item'))

5. STATE-SHIFT on open (BL-UI-003):
   (covered separately) before opening: rectSnapshotSnippet('main') → before
   open modal → rectSnapshotSnippet('main') → after
   compareRectSnapshots — topDelta/leftDelta must be 0 (body-scroll-lock correctness)

6. OVERFLOW at 375 px (BL-UI-004):
   set viewport 375, open modal, LAYOUT_SNIPPETS.overflowAudit
   → documentScrolls === false; internal `.select-address-map-list` scroll is intentional

7. ROW ALIGNMENT (BL-UI-005):
   browser_evaluate(alignmentAuditSnippet(
     '[data-test-id="pickup-locations-list"] > .select-address-map-list__item:nth-child(-n+5)'))
   → heightDriftPx ≤ 1 (rows pad to consistent height even with multi-line addresses)

8. TOUCH TARGETS at 375 px (BL-UI-006):
   touchTargetAuditSnippet('[data-test-id="pickup-locations-modal"]')
   → close X (`.vc-dialog-header__close` — no data-test-id, known gap), search button,
     filter dropdowns, row labels all ≥ 44×44 with ≥ 8 px gap

NOTE: No pagination component — 50 of 102 locations visible by default (scroll-only).
      Selected-state lives on `.vc-radio-button--checked`, not the row container.
```

### 9. VcInput

```text
SCOPE: form-field surface (sign-in, sign-up, address form, search). Use /sign-in
       from an incognito context — /sign-in and /sign-up auto-redirect when
       authenticated (per storefront-selectors.md §6).
PREREQ: navigate from a fresh, unauthenticated browser context.

1. browser_evaluate(spacingAuditSnippet(
     'form .vc-input, form .vc-input__container, form .vc-input__input, form .vc-input-details'))
   → classifySpacing()

2. State-shift on validation error (BL-UI-003):
   browser_evaluate(rectSnapshotSnippet('form button[type="submit"]')) → before
   browser_fill('form input[type="email"]', 'invalid-not-an-email')
   browser_click('form button[type="submit"]')
   wait 300 ms for `.vc-input--error` + `.vc-input-details` to render
   browser_evaluate(rectSnapshotSnippet('form button[type="submit"]')) → after
   → compareRectSnapshots — submit button MUST NOT shift down when the error
     message is inserted (reserve space via `min-height` on .vc-input-details
     or insert above the submit row)

3. Long-value overflow (BL-UI-004):
   browser_fill('form input[type="email"]',
     'a-very-long-email-address-that-stresses-input-width@example.com')
   browser_evaluate(LAYOUT_SNIPPETS.overflowAudit) — value must scroll inside
   the input, not push the form chrome

4. At viewport 375 px (BL-UI-006):
   browser_evaluate(touchTargetAuditSnippet('form'))
   → every `<input>`, `<button>`, password-toggle icon ≥ 44 × 44
```

### 10. VcQuantityStepper

```text
SCOPE: stepper as the add-to-cart entry on B2B-store PDP, AND as the qty control
       on cart line items. Configurable PDP per-option steppers are audited under
       VcLineItem-style scoping inside the Configurable PDP page tests.
PREREQ: PDP audit needs an in-stock SKU; cart audit needs ≥ 1 line item.

A) PDP variant (NAV: any in-stock PDP, e.g. /search → click first card → land on PDP):

1. browser_evaluate(spacingAuditSnippet(
     '.product-price-block .vc-quantity-stepper,
      .product-price-block .vc-quantity-stepper button,
      .product-price-block .vc-quantity-stepper input'))

2. Alignment (BL-UI-005):
   browser_evaluate(alignmentAuditSnippet(
     '.vc-quantity-stepper button[aria-label="Decrease quantity"],
      .vc-quantity-stepper input.vc-input__input,
      .vc-quantity-stepper button[aria-label="Increase quantity"]'))
   → vertical-center drift ≤ 1 px across the three controls

3. State-shift on increment (BL-UI-003):
   browser_evaluate(rectSnapshotSnippet('.product-price-block')) → before
   browser_click('.vc-quantity-stepper button[aria-label="Increase quantity"]')
   wait 300 ms for cart-add roundtrip
   browser_evaluate(rectSnapshotSnippet('.product-price-block')) → after
   → compareRectSnapshots — the surrounding price block must not jump
     when the "View cart" CTA appears (per `feedback_qty_stepper_as_add_to_cart`,
     the qty stepper drives add-to-cart; the View Cart button rendering is
     the typical shift source)

4. At viewport 375 px (BL-UI-006):
   browser_evaluate(touchTargetAuditSnippet('.product-price-block .vc-quantity-stepper'))
   → +/− buttons ≥ 44 × 44 with ≥ 8 px gap; numeric input itself
     should also be ≥ 44 × 44 tap target

B) Cart variant: covered under VcLineItem §3 — re-use snapshots.
```

### 11. Header (top-header chrome)

```text
SCOPE: top-header bar — language/currency/ship-to/dark-mode-toggle/account-button/
       customer-name-label/global-search-query-input/desktop-main-menu-cart-link.
       See storefront-selectors.md §10 Appendix for full data-test-id inventory.
PREREQ: authenticated user on `/`.

1. browser_evaluate(spacingAuditSnippet(
     'header[data-test-id="top-header"],
      header [data-test-id="language-selector"],
      header [data-test-id="currency-selector"],
      header [data-test-id="ship-to-selector"],
      header [data-test-id="account-button"],
      header a[href="/cart"]'))

2. Alignment of top-row nav items (BL-UI-005):
   browser_evaluate(alignmentAuditSnippet(
     'header [data-test-id="language-selector-button"],
      header [data-test-id="currency-selector-button"],
      header [data-test-id="dark-mode-toggle"],
      header [data-test-id="account-button"]'))
   → vertical-center drift ≤ 1 px; heights match within 1 px

3. Sticky-header behavior on scroll (BL-UI-003):
   browser_evaluate(rectSnapshotSnippet('header')) → before-scroll
   browser_evaluate('window.scrollTo({ top: 800, behavior: "instant" })')
   wait 300 ms
   browser_evaluate(rectSnapshotSnippet('header')) → after-scroll
   → if header is sticky, `top` must remain 0; if not sticky, header should be
     out of viewport, not partially shifted

4. Mobile hamburger collapse at 375 px (BL-UI-004 + BL-UI-006):
   resize viewport to 375 px
   browser_evaluate(LAYOUT_SNIPPETS.overflowAudit)
   → documentScrolls === false (header chrome must fit at 375 px or
     re-mount controls into hamburger panel per `feedback_mobile_hamburger_inventory`)
   browser_click on hamburger trigger (verify selector live — likely
     `header button[aria-label*="menu" i]` or `[data-test-id="mobile-menu-toggle"]`)
   browser_evaluate(touchTargetAuditSnippet('header'))
   → hamburger toggle, cart icon, account button all ≥ 44 × 44
```

### 12. Notifications/Toast

```text
SCOPE: global notifications host `.notifications-host__wrapper`. Toasts emitted
       by useNotifications() on cart actions, sign-in, coupon apply, etc.
PREREQ: authenticated user on /cart with ≥ 1 line item.

1. State-shift on toast emit (BL-UI-003):
   browser_evaluate(rectSnapshotSnippet('main')) → before-toast
   browser_click('.vc-line-item:nth-child(1) [data-test-id="remove-item-button"]')
   wait 200 ms for `.notifications-host__wrapper:not(:empty)` to render
   browser_evaluate(rectSnapshotSnippet('main')) → during-toast
   → compareRectSnapshots — main content MUST NOT shift when toast appears
     (toast is overlay-portalled, not in document flow)

2. Spacing (BL-UI-002):
   browser_evaluate(spacingAuditSnippet(
     '.notifications-host__wrapper,
      .notifications-host__wrapper > *'))

3. Stack-height stress (toast must not displace sticky CTAs):
   Emit 3+ toasts in quick succession (e.g., remove 3 items, apply 2 coupons).
   browser_evaluate(rectSnapshotSnippet(
     '[data-test-id="sticked-place-order-button"], [data-test-id="place-order-button"]'))
   → sticky place-order button must remain visible and at its baseline position
```

### 13. VcPriceDisplay / VcPrice

```text
SCOPE: price-bearing surfaces. The most regression-prone scenario is dynamic
       price update on Configurable PDP (formalizes the previously out-of-matrix
       LAYOUT-COMP-CONFIG-002).
PREREQ: anon or auth user on Configurable PDP (`@td(CONFIGURABLE.testSlug)`).

1. Spacing (BL-UI-002):
   browser_evaluate(spacingAuditSnippet(
     '[data-test-id="sidebar"] .product-price-block,
      [data-test-id="sidebar"] .product-price-block .price__list,
      [data-test-id="sidebar"] .product-price-block .price__actual'))

2. Sale strikethrough + actual price baseline alignment (BL-UI-005):
   browser_evaluate(alignmentAuditSnippet(
     '[data-test-id="sidebar"] .product-price-block .price__list,
      [data-test-id="sidebar"] .product-price-block .price__actual'))
   → text-baseline drift ≤ 1 px

3. Dynamic-update without sidebar reflow (BL-UI-003):
   browser_evaluate(rectSnapshotSnippet(
     '[data-test-id="sidebar"] .product-price-block button[aria-label="Add to cart"]')) → before
   browser_click on a `[data-test-id="product-option"]` (option that changes price)
   wait 500 ms for price recompute (`.price__actual` text changes)
   browser_evaluate(rectSnapshotSnippet(
     '[data-test-id="sidebar"] .product-price-block button[aria-label="Add to cart"]')) → after
   → compareRectSnapshots — Add-to-cart button must NOT shift when price text
     widens/narrows; price block reserves space for max width
```

### 14. VcEmptyView / Empty State

```text
SCOPE: empty-state surfaces — empty cart (`.vc-empty-page`), empty wishlist,
       no-results search.
PREREQ: induce empty state — clear cart, OR new account with no lists, OR
        `/search?q=zzz-no-results-test`.

A) Empty cart variant (NAV: /cart after clearing):

1. Layout boundary (BL-UI-002):
   browser_evaluate(spacingAuditSnippet(
     '.vc-empty-page,
      .vc-empty-page__wrapper,
      .vc-empty-page__title,
      .vc-empty-page__breadcrumbs'))

2. No-results overflow at 375 px (BL-UI-004):
   resize viewport to 375 px
   browser_evaluate(LAYOUT_SNIPPETS.overflowAudit)
   → empty-state illustration must fit within viewport; documentScrolls === false

B) No-results search variant (NAV: /search?q=zzz-no-results-test):

3. Repeat steps 1-2 against the search empty-state container (selector likely
   `.search-empty-state` or `.vc-empty-page` — verify live before authoring tests)
```

### 15. VcCheckbox

```text
SCOPE: cart head + per-line checkboxes, billing-equals-shipping toggle,
       catalog facet checkboxes.
PREREQ: authenticated user on /cart with ≥ 2 line items.

1. Spacing + baseline alignment (BL-UI-002 + BL-UI-005):
   browser_evaluate(spacingAuditSnippet(
     '[data-test-id="vc-line-items-head-checkbox"],
      [data-test-id="vc-line-item-checkbox"]'))
   browser_evaluate(alignmentAuditSnippet(
     '.vc-line-item [data-test-id="vc-line-item-checkbox"],
      .vc-line-item .vc-product-title__text,
      .vc-line-item .vc-quantity-stepper'))
   → checkbox icon + adjacent label baseline drift ≤ 1 px

2. State-shift on select-all (BL-UI-003):
   browser_evaluate(rectSnapshotSnippet('[data-test-id="cart.products-section"]')) → before
   browser_click('[data-test-id="vc-line-items-head-checkbox"]')
   wait 200 ms for any action-bar to render
   browser_evaluate(rectSnapshotSnippet('[data-test-id="cart.products-section"]')) → after
   → compareRectSnapshots — products section must not shift vertically when
     a bulk-action bar appears (it should overlay or reserve its own slot)

3. At viewport 375 px (BL-UI-006):
   browser_evaluate(touchTargetAuditSnippet('[data-test-id="cart.products-section"]'))
   → each `[data-test-id^="vc-line-item-checkbox"]` ≥ 44 × 44 including label
```

### 16. VcRadioButton

```text
SCOPE: shipping-method-selector + payment-method-selector on /cart, AND
       BOPIS modal location list (50 rows). Configurable PDP per-option radios
       are audited under the Configurable PDP page tests.
PREREQ: authenticated user on /cart with ≥ 1 line item, shipping/payment
        configured for store.

A) Cart shipping/payment selector variant:

1. Spacing + baseline alignment (BL-UI-002 + BL-UI-005):
   browser_evaluate(spacingAuditSnippet(
     '[data-test-id="shipping-method-selector"] .vc-radio-button,
      [data-test-id="payment-method-selector"] .vc-radio-button'))
   browser_evaluate(alignmentAuditSnippet(
     '[data-test-id="shipping-method-selector"] .vc-radio-button:nth-child(-n+3)'))
   → radio dot + label baseline drift ≤ 1 px across first 3 options

2. State-shift on method change (BL-UI-003):
   browser_evaluate(rectSnapshotSnippet('[data-test-id="payment-details-section"]')) → before
   browser_click on a different shipping option
   wait 500 ms for shipping recompute + summary update
   browser_evaluate(rectSnapshotSnippet('[data-test-id="payment-details-section"]')) → after
   → compareRectSnapshots — payment section below shipping must not shift
     vertically when shipping price/label widens

3. At viewport 375 px (BL-UI-006):
   browser_evaluate(touchTargetAuditSnippet('[data-test-id="shipping-method-selector"]'))
   → each radio row ≥ 44 × 44 with ≥ 8 px gap between stacked radios

B) BOPIS modal row-select variant: covered under BOPIS Modal §8 — re-use snapshots.
```

### 17. VcChip

```text
SCOPE: status chips — in-stock indicator (`.vc-chip.vc-chip--color--success`)
       on Configurable PDP, and pickup-availability chips
       (`[data-test-id="pickup-availability-chip"]`) inside BOPIS modal rows.
PREREQ: anon or auth on Configurable PDP for §A; authenticated user with
        BOPIS modal open for §B (see Component §8 protocol).

A) Configurable PDP variant (single chip):

1. Spacing (BL-UI-002):
   browser_evaluate(spacingAuditSnippet(
     '[data-test-id="sidebar"] .product-price-block .vc-chip'))

B) BOPIS modal variant (51 chips — high-frequency row alignment):

2. Row-alignment of chips inside the location list (BL-UI-005):
   browser_evaluate(alignmentAuditSnippet(
     '[data-test-id="pickup-locations-list"] > .select-address-map-list__item:nth-child(-n+5) [data-test-id="pickup-availability-chip"]'))
   → chip vertical-center drift ≤ 1 px across first 5 rows

3. Long-label overflow stress at 375 px (BL-UI-004):
   resize viewport to 375 px
   browser_evaluate(LAYOUT_SNIPPETS.overflowAudit) scoped to modal
   → chip text must wrap or truncate within its row; row must NOT widen
     so as to introduce horizontal scroll inside the list scroll container
```

### 18. VcSelect

```text
SCOPE: dropdown selectors — address-form Country / State / Province on
       `/account/addresses` AND BOPIS modal country/region/city filters.
PREREQ: authenticated user with at least one editable address; OR BOPIS modal
        open per Component §8.

A) Address-form variant (NAV: /account/addresses → click edit/add):

1. Spacing (BL-UI-002):
   browser_evaluate(spacingAuditSnippet(
     'form .vc-select, form .vc-select__trigger, form .vc-select__panel'))

2. State-shift on dropdown open (BL-UI-003):
   browser_evaluate(rectSnapshotSnippet('form')) → before-open
   browser_click on the Country `.vc-select__trigger`
   wait 300 ms for `.vc-select__panel` to render (overlay/popover)
   browser_evaluate(rectSnapshotSnippet('form')) → after-open
   → compareRectSnapshots — form must NOT shift when panel opens
     (panel must be portalled/overlayed, not in document flow)

3. On-change form reflow (BL-UI-003):
   browser_evaluate(rectSnapshotSnippet('form button[type="submit"]')) → before
   browser_click an option that changes the State/Province option list
     (e.g., switch Country USA → Canada — state list repopulates;
      switch USA → UK — State field becomes empty/disabled per
      `reference_address_data_conventions`)
   wait 300 ms for downstream field repaint
   browser_evaluate(rectSnapshotSnippet('form button[type="submit"]')) → after
   → compareRectSnapshots — submit button must NOT shift down when state field
     dimensions change (form must reserve vertical space)

4. Long-option overflow (BL-UI-004):
   open Country dropdown; verify that long country names
   (e.g., "United States Minor Outlying Islands") fit within the trigger,
   wrap, or truncate — never overflow the form column.
   At viewport 375 px: browser_evaluate(LAYOUT_SNIPPETS.overflowAudit) scoped to form

5. Touch targets at 375 px (BL-UI-006):
   resize to 375; open Country dropdown
   browser_evaluate(touchTargetAuditSnippet('.vc-select__panel'))
   → trigger ≥ 44 × 44; each option row in panel ≥ 44 px tall with ≥ 8 px gap

B) BOPIS modal filter variant: re-use §8 BOPIS Modal protocol; the filter
   dropdown selectors are `[data-test-id="filter-country"]`,
   `[data-test-id="filter-region"]`, `[data-test-id="filter-city"]` —
   audit panel-open shift inside the modal.
```

### 19. VcDropdownMenu

```text
SCOPE: header account-menu (account-button → user + organizations dropdown),
       language-selector, currency-selector. Underlying class `.vc-popover.vc-dropdown-menu`.
PREREQ: authenticated user on `/`.

1. State-shift on menu open (BL-UI-003):
   browser_evaluate(rectSnapshotSnippet('header [data-test-id="customer-name-label"]')) → before
   browser_click('header [data-test-id="account-button"]')
   wait 300 ms for dropdown panel to render
   browser_evaluate(rectSnapshotSnippet('header [data-test-id="customer-name-label"]')) → after
   → compareRectSnapshots — adjacent header items must NOT shift

2. Menu-item hover (BL-UI-003):
   With dropdown still open, snapshot a sibling menu item's rect, hover the
   first item, re-snapshot — sibling must NOT move

3. Item-row spacing + alignment (BL-UI-002 + BL-UI-005):
   browser_evaluate(spacingAuditSnippet('.vc-popover.vc-dropdown-menu li, .vc-popover.vc-dropdown-menu [role="menuitem"]'))
   browser_evaluate(alignmentAuditSnippet('.vc-popover.vc-dropdown-menu [role="menuitem"]:nth-child(-n+5)'))

4. Long-item label + mobile width (BL-UI-004):
   resize viewport to 375 px; open menu; verify documentScrolls === false and
   the dropdown panel fits within viewport (or wraps gracefully)

5. Touch targets (BL-UI-006):
   browser_evaluate(touchTargetAuditSnippet('.vc-popover.vc-dropdown-menu'))
   → trigger + every menu item ≥ 44 × 44
```

### 20. VcVariantPicker

```text
SCOPE: variant picker on catalog cards (`[data-test-id^="variations-"]`) and
       PDP variation widget on a variation-bearing product.
PREREQ: navigate to a PDP with ≥ 2 variations
        (e.g. /products-with-options/variations-of-jeans/baggy-regular-jeans-grey).

1. Spacing + row alignment (BL-UI-002 + BL-UI-005):
   browser_evaluate(spacingAuditSnippet('.product-variations, .product-variations__swatch'))
   browser_evaluate(alignmentAuditSnippet('.product-variations__swatch:nth-child(-n+5)'))
   → swatch row baseline drift ≤ 1 px

2. Variant change without CTA shift (BL-UI-003, revenue-critical):
   browser_evaluate(rectSnapshotSnippet('.product-price-block')) → before
   browser_click on a different variant swatch (selector live-verify)
   wait 500 ms for price + image swap (xAPI re-resolution)
   browser_evaluate(rectSnapshotSnippet('.product-price-block')) → after
   → compareRectSnapshots — price block + Add-to-Cart must NOT shift; the
     gallery may swap image but the buy block position stays fixed

3. Long swatch label overflow at 375 px (BL-UI-004):
   resize viewport to 375; verify swatch labels wrap or truncate within row

4. Touch targets at 375 px (BL-UI-006):
   browser_evaluate(touchTargetAuditSnippet('.product-variations'))
   → each swatch ≥ 44 × 44 with ≥ 8 px gap
```

### 21. VcWidget

```text
SCOPE: `<section class="vc-widget …">` wrapper. Audit on /cart (order-summary
       widget) and Configurable PDP (collapsible configuration sections).
PREREQ: authenticated user on /cart for §A; Configurable PDP for §B.

A) Order-summary widget (NAV: /cart):

1. Spacing (BL-UI-002):
   browser_evaluate(spacingAuditSnippet(
     '[data-test-id="order-summary-widget"],
      [data-test-id="order-summary-widget"] .vc-widget__title,
      [data-test-id="order-summary-widget"] .vc-widget__slot-container'))

2. Header alignment across stacked widgets (BL-UI-005):
   browser_evaluate(alignmentAuditSnippet(
     '[data-test-id="cart.products-section"] .vc-widget__title,
      [data-test-id="order-summary-widget"] .vc-widget__title'))
   → widget-title baseline drift ≤ 1 px across the stack

B) Collapsible widget (NAV: Configurable PDP):

3. Collapse/expand without neighbor shift (BL-UI-003):
   browser_evaluate(rectSnapshotSnippet('[data-test-id="sidebar"] .product-price-block')) → before
   browser_click('.product-configuration [data-test-id="section"]:not(.vc-widget--collapsed) > button.vc-widget__header-container')
   wait 300 ms for collapse animation
   browser_evaluate(rectSnapshotSnippet('[data-test-id="sidebar"] .product-price-block')) → after
   → compareRectSnapshots — sticky sidebar must NOT shift when the content
     column reflows (already covered partially by LAYOUT-COMP-CONFIG-001 outside
     the matrix; this row formalizes the widget-level contract)

4. Long-content overflow within collapsible body (BL-UI-004):
   browser_evaluate(LAYOUT_SNIPPETS.overflowAudit) scoped to '.vc-widget__slot-container'
```

### 22. VcTabSwitch

```text
SCOPE: tab switcher — catalog view switcher (`[data-test-id="view-switcher"]`
       with `grid-view-tab` / `list-view-tab`), PDP details tabs.
PREREQ: /catalog (anon or auth).

1. Spacing + tab row alignment (BL-UI-002 + BL-UI-005):
   browser_evaluate(spacingAuditSnippet(
     '[data-test-id="view-switcher"],
      [data-test-id="view-switcher"] [data-test-id="grid-view-tab"],
      [data-test-id="view-switcher"] [data-test-id="list-view-tab"]'))
   browser_evaluate(alignmentAuditSnippet(
     '[data-test-id="grid-view-tab"], [data-test-id="list-view-tab"]'))
   → tabs in row, baseline + height drift ≤ 1 px

2. Active-tab indicator change (BL-UI-003):
   browser_evaluate(rectSnapshotSnippet('[data-test-id="view-switcher"]')) → before
   browser_click('[data-test-id="list-view-tab"]')
   wait 300 ms for tab + content panel swap
   browser_evaluate(rectSnapshotSnippet('[data-test-id="view-switcher"]')) → after
   → switcher position must NOT jump (underline slides, container stays fixed)

3. Long tab labels at 375 px (BL-UI-004):
   resize to 375; verify tabs fit row or scroll horizontally inside the
   switcher container (no document overflow)

4. Touch targets at 375 px (BL-UI-006):
   browser_evaluate(touchTargetAuditSnippet('[data-test-id="view-switcher"]'))
   → each tab ≥ 44 × 44 with ≥ 8 px gap
```

### 23. VcSwitch

```text
SCOPE: binary on/off toggle. Audit on /account/profile (or wherever VcSwitch
       renders — verify selector live before authoring tests; likely `.vc-switch`
       or `[role="switch"]`).
PREREQ: authenticated user on the page that hosts a VcSwitch.

1. Spacing + switch-label baseline (BL-UI-002 + BL-UI-005):
   browser_evaluate(spacingAuditSnippet('.vc-switch, .vc-switch__label'))
   browser_evaluate(alignmentAuditSnippet('.vc-switch'))
   → switch thumb + label baseline drift ≤ 1 px

2. State-change without neighbor shift (BL-UI-003):
   browser_evaluate(rectSnapshotSnippet('.vc-switch + *, fieldset.vc-switch ~ *')) → before
   browser_click('.vc-switch [role="switch"]')
   wait 200 ms for state transition
   browser_evaluate(rectSnapshotSnippet('.vc-switch + *')) → after
   → adjacent text/label must NOT shift; if state-change reveals a
     dependent sub-form, that should be a controlled reflow (assert
     expected delta, not zero — author per host page contract)

3. Touch target at 375 px (BL-UI-006):
   browser_evaluate(touchTargetAuditSnippet('.vc-switch'))
   → tap target ≥ 44 × 44 including label hit-area
```

### 24. VcScrollbar

```text
SCOPE: custom scrollbar primitive `.vc-scrollbar.vc-scrollbar--vertical`.
       Audit inside BOPIS modal location list (the most reliable host).
PREREQ: BOPIS modal open (see Component §8).

1. Spacing (BL-UI-002):
   browser_evaluate(spacingAuditSnippet(
     '[data-test-id="pickup-locations-modal"] .vc-scrollbar,
      [data-test-id="pickup-locations-modal"] .vc-scrollbar__track,
      [data-test-id="pickup-locations-modal"] .vc-scrollbar__thumb'))

2. Scrollbar appear/disappear without content shift (BL-UI-003):
   Compare the modal in two states:
   a) Many rows visible (scrollbar present) → snapshot first row rect
   b) Apply a filter that returns ≤ 5 rows (scrollbar absent) → snapshot first row rect
   → first-row leftDelta MUST be 0 (container reserves scrollbar gutter via
     `scrollbar-gutter: stable` or equivalent; if not, content shifts horizontally
     when scrollbar appears/disappears — common defect)

NOTE: BL-UI-004 / BL-UI-005 / BL-UI-006 marked n/a in matrix.
      VcScrollbar IS the overflow handler (BL-UI-004 n/a), has no horizontal
      sibling group (BL-UI-005 n/a), and mobile devices use native scroll
      (BL-UI-006 n/a — custom-scrollbar drag handle is a desktop concern).
```

### 25. VcImage

```text
SCOPE: image primitive (`img.vc-image` and class variants). Audit on /catalog
       product cards and PDP gallery — the two highest-frequency render surfaces.
       BL-UI-001 anchor for the width/height-attribute contract.
PREREQ: anon or auth on /catalog.

1. CLS via attribute presence (BL-UI-001):
   browser_evaluate(() => {
     const imgs = Array.from(document.querySelectorAll('.vc-product-card .vc-product-image img'));
     return imgs.map(img => ({
       src: img.getAttribute('src')?.slice(-40),
       hasWidth: img.hasAttribute('width'),
       hasHeight: img.hasAttribute('height'),
       computedAspectRatio: getComputedStyle(img).aspectRatio
     }));
   })
   → every image must EITHER have `width` + `height` attrs OR a CSS `aspect-ratio`
     that resolves to a non-`auto` value

2. Spacing (BL-UI-002):
   browser_evaluate(spacingAuditSnippet('.vc-product-card .vc-product-image img'))

3. Broken-image placeholder swap (BL-UI-003):
   browser_evaluate(rectSnapshotSnippet('.vc-product-card:nth-child(1)')) → before
   force a broken image (e.g., `img.src = 'invalid://'`) on the first card
   wait 500 ms for placeholder to render
   browser_evaluate(rectSnapshotSnippet('.vc-product-card:nth-child(1)')) → after
   → card height MUST NOT change (placeholder reserves identical box)

NOTE: BL-UI-004 / BL-UI-005 / BL-UI-006 are n/a — sizing is intrinsic to the
      primitive contract; no horizontal group; non-interactive.
```

### 26. VcAlert

```text
SCOPE: inline alert banner. Best induced from /sign-in failed-login alert
       in an incognito context.
PREREQ: incognito context on /sign-in.

1. Insertion shift (BL-UI-003):
   browser_evaluate(rectSnapshotSnippet('form button[type="submit"]')) → before
   browser_fill('input[type="email"]', 'no-such-user@example.com')
   browser_fill('input[type="password"]', 'wrong-password')
   browser_click('form button[type="submit"]')
   wait 800 ms for the .vc-alert banner to render (typically above the form)
   browser_evaluate(rectSnapshotSnippet('form button[type="submit"]')) → after
   → submit button position must change PREDICTABLY by exactly the alert's
     reserved height (assert non-zero, bounded delta — not zero), OR the
     alert must overlay without shifting the form (assert delta = 0)

2. Spacing (BL-UI-002):
   browser_evaluate(spacingAuditSnippet('.vc-alert, .vc-alert__title, .vc-alert__message'))

3. Long-message overflow at 375 px (BL-UI-004):
   force a long alert message; resize to 375 px;
   browser_evaluate(LAYOUT_SNIPPETS.overflowAudit)
   → message wraps inside the banner; no horizontal document scroll

4. Close-button touch target (BL-UI-006):
   browser_evaluate(touchTargetAuditSnippet('.vc-alert'))
   → close button (if present) ≥ 44 × 44
```

### 27. VcBadge

```text
SCOPE: header cart-count badge (also account-menu unread indicator).
PREREQ: authenticated user on `/`; cart contains varying number of items
        to force digit-count changes.

1. Spacing (BL-UI-002) + baseline within parent (BL-UI-005):
   browser_evaluate(spacingAuditSnippet('header .vc-badge'))
   browser_evaluate(alignmentAuditSnippet('header a[href="/cart"] .vc-badge'))
   → badge vertical-center aligns with parent cart-icon center within 1 px

2. Digit-count change without neighbor shift (BL-UI-003 — KNOWN CHRONIC):
   browser_evaluate(rectSnapshotSnippet('header [data-test-id="account-button"]')) → before-1digit
   add items to cart until badge reads 10+
   browser_evaluate(rectSnapshotSnippet('header [data-test-id="account-button"]')) → after-2digit
   → adjacent account-button MUST NOT shift left when badge widens
     (cart-icon parent must reserve max-digit width or badge must overlay)
```

### 28. VcCarousel

```text
SCOPE: home hero (`.slider-block`) AND PDP image gallery.
PREREQ: anon or auth on `/` for hero; PDP with multi-image for gallery.

A) Home hero variant (NAV: /):

1. CLS via slide-image attrs (BL-UI-001):
   inspect each `.slider-block .swiper-slide img` for width/height attrs or
   CSS aspect-ratio — same contract as VcImage §25 step 1

2. Spacing (BL-UI-002):
   browser_evaluate(spacingAuditSnippet('.slider-block, .slider-block .swiper-pagination'))

3. Auto-rotate slide change without chrome shift (BL-UI-003):
   browser_evaluate(rectSnapshotSnippet('main > *:nth-child(2)')) → before
   (let auto-rotate fire, or programmatically advance the swiper)
   wait 500 ms
   browser_evaluate(rectSnapshotSnippet('main > *:nth-child(2)')) → after
   → content below the hero MUST NOT shift on slide change

4. Mobile overflow (BL-UI-004) + navigation touch targets (BL-UI-006):
   resize to 375 px
   browser_evaluate(LAYOUT_SNIPPETS.overflowAudit)
   browser_evaluate(touchTargetAuditSnippet('.slider-block'))
   → arrows + pagination dots ≥ 44 × 44

B) PDP gallery variant — re-use the protocol against `.image-gallery`.
```

### 29. VcPagination

```text
SCOPE: page-navigation control. Audit on a paginated list (e.g., /account/orders
       with > page-size orders, or any catalog that uses pagination instead of
       endless-scroll).
PREREQ: authenticated user with sufficient items to trigger pagination.

1. Spacing + row alignment (BL-UI-002 + BL-UI-005):
   browser_evaluate(spacingAuditSnippet('.vc-pagination, .vc-pagination__item'))
   browser_evaluate(alignmentAuditSnippet('.vc-pagination__item:nth-child(-n+5)'))

2. Page-change without scroll-jump (BL-UI-003):
   browser_evaluate(rectSnapshotSnippet('.vc-pagination')) → before
   browser_click('.vc-pagination__item:nth-child(2)')  // page 2
   wait for list to repopulate
   browser_evaluate(rectSnapshotSnippet('.vc-pagination')) → after
   → pagination control position must NOT jump (only the list rows replace;
     the control stays anchored)

3. Compact mode at 375 px (BL-UI-004):
   resize to 375 px
   verify many-page pagination collapses to compact mode (ellipsis); no
   horizontal document scroll

4. Touch targets (BL-UI-006):
   browser_evaluate(touchTargetAuditSnippet('.vc-pagination'))
   → each page button ≥ 44 × 44 with ≥ 8 px gap
```

### 30. VcExpansionPanels / VcExpansionPanel

```text
SCOPE: accordion. Catalog facet groups (`.vc-expansion-panels`) is the most
       reliable render surface.
PREREQ: /catalog with filter facets visible.

1. Spacing + header row alignment (BL-UI-002 + BL-UI-005):
   browser_evaluate(spacingAuditSnippet('.vc-expansion-panel, .vc-expansion-panel__header'))
   browser_evaluate(alignmentAuditSnippet('.vc-expansion-panels > .vc-expansion-panel:nth-child(-n+5) .vc-expansion-panel__header'))

2. Expand/collapse — controlled shift (BL-UI-003):
   browser_evaluate(rectSnapshotSnippet('.vc-expansion-panels > .vc-expansion-panel:nth-child(2)')) → before
   browser_click('.vc-expansion-panels > .vc-expansion-panel:nth-child(1) .vc-expansion-panel__header')
   wait 300 ms for collapse animation
   browser_evaluate(rectSnapshotSnippet('.vc-expansion-panels > .vc-expansion-panel:nth-child(2)')) → after
   → panel #2 shift = exactly the height of panel #1's collapsed body (controlled),
     not arbitrary

3. Long content inside open panel (BL-UI-004):
   open a panel with many facet options; resize to 375 px;
   browser_evaluate(LAYOUT_SNIPPETS.overflowAudit) scoped to the open panel

4. Header touch target (BL-UI-006):
   browser_evaluate(touchTargetAuditSnippet('.vc-expansion-panels'))
   → each panel header ≥ 44 × 44
```

### 31. VcModal

```text
SCOPE: VcModal wrapper primitive (`.vc-modal`, `.vc-modal__wrapper`,
       `.vc-modal__backdrop`, `.vc-modal__panel`). Audited at the wrapper level
       vs. VcDialog §5 which audits the inner dialog frame. BOPIS Modal #8 and
       VcConfirmationModal #32 are specializations.
PREREQ: open any modal trigger (e.g., BOPIS modal per §8 or address-edit on /cart).

1. Wrapper spacing + backdrop (BL-UI-002):
   browser_evaluate(spacingAuditSnippet('.vc-modal, .vc-modal__backdrop, .vc-modal__panel'))

2. Body-scroll-lock without shift (BL-UI-003):
   re-use VcDialog §5 step 1-4 protocol — `main` must not shift when modal opens.
   At the wrapper level, additionally verify `document.body.style.overflow`
   becomes `hidden` AND `document.documentElement.style.paddingRight` is set
   to scrollbar-width (proper scrollbar-gutter reservation)

3. Mobile fullscreen modifier (BL-UI-004):
   resize to 375 px; open modal;
   verify `.vc-modal--mobile-fullscreen` class is applied AND the panel
   occupies viewport width without horizontal overflow

4. Close button touch target (BL-UI-006):
   browser_evaluate(touchTargetAuditSnippet('.vc-modal'))
   → close button ≥ 44 × 44
```

### 32. VcConfirmationModal

```text
SCOPE: yes/no confirmation modal. Cleanest trigger: /cart → click
       `[data-test-id="clear-cart-button"]`.
PREREQ: authenticated user on /cart with ≥ 1 line item.

1. Open without shift (BL-UI-003):
   browser_evaluate(rectSnapshotSnippet('main')) → before
   browser_click('[data-test-id="clear-cart-button"]')
   wait for confirmation modal to render
   browser_evaluate(rectSnapshotSnippet('main')) → after
   → main MUST NOT shift on confirmation-modal open

2. Spacing + button-row alignment (BL-UI-002 + BL-UI-005):
   browser_evaluate(spacingAuditSnippet('.vc-confirmation-modal'))
   browser_evaluate(alignmentAuditSnippet('.vc-confirmation-modal__actions button'))
   → confirm + cancel button heights match exactly; baseline drift ≤ 1 px

3. Long-message overflow at 375 px (BL-UI-004):
   resize to 375 px; modal still open;
   browser_evaluate(LAYOUT_SNIPPETS.overflowAudit) scoped to the modal

4. Button touch targets (BL-UI-006):
   browser_evaluate(touchTargetAuditSnippet('.vc-confirmation-modal'))
   → confirm + cancel buttons ≥ 44 × 44 with ≥ 8 px gap

NOTE: dismiss the modal (click cancel) before leaving the test to keep
      teardown deterministic.
```

### 33. VcAddToCart

```text
SCOPE: dedicated Add-to-Cart button — Configurable PDP only. Standard
       B2B-store PDP uses qty stepper instead (per `feedback_qty_stepper_as_add_to_cart`).
PREREQ: anon or auth on Configurable PDP (`@td(CONFIGURABLE.testSlug)`),
        all required sections satisfied so button is enabled.

1. Spacing (BL-UI-002):
   browser_evaluate(spacingAuditSnippet('[data-test-id="sidebar"] .product-price-block button[aria-label="Add to cart"]'))

2. Loading state shift (BL-UI-003):
   browser_evaluate(rectSnapshotSnippet('[data-test-id="sidebar"] .product-price-block')) → before
   browser_click('[data-test-id="sidebar"] .product-price-block button[aria-label="Add to cart"]')
   immediately snapshot (within first 300 ms — while spinner is visible)
   browser_evaluate(rectSnapshotSnippet('[data-test-id="sidebar"] .product-price-block')) → during-loading
   → price-block height MUST NOT change when button enters loading state
     (spinner overlays the button label, doesn't widen the row)

3. Touch target (BL-UI-006):
   browser_evaluate(touchTargetAuditSnippet('[data-test-id="sidebar"] .product-price-block'))
   → Add-to-Cart button ≥ 44 × 44
```

### 34. VcSlider

```text
SCOPE: range slider — `/catalog` price-range facet (`.vc-slider` inside
       `[data-test-id="filter-price"]`).
PREREQ: /catalog with a category that exposes a price-range facet.

1. Spacing + alignment (BL-UI-002 + BL-UI-005):
   browser_evaluate(spacingAuditSnippet('[data-test-id="filter-price"] .vc-slider'))
   browser_evaluate(alignmentAuditSnippet('[data-test-id="filter-price"] .vc-slider__handle, [data-test-id="filter-price"] .vc-slider__value'))
   → handles + track + value labels baseline drift ≤ 1 px

2. Drag value-display shift (BL-UI-003):
   browser_evaluate(rectSnapshotSnippet('[data-test-id="filter-price"] .vc-slider__value')) → before
   simulate drag on left handle to a different value (use browser_drag if available)
   wait 300 ms for value to update
   browser_evaluate(rectSnapshotSnippet('[data-test-id="filter-price"] .vc-slider__value')) → after
   → value-display container must NOT shift horizontally as digit width changes
     (container reserves max-digit width)

3. Handle touch target at 375 px (BL-UI-006 — KNOWN MOBILE PAIN POINT):
   resize to 375 px
   browser_evaluate(touchTargetAuditSnippet('[data-test-id="filter-price"] .vc-slider'))
   → each handle ≥ 44 × 44 (sliders chronically ship 24 × 24 thumbs that
     fail this contract)
```

### 35. VcRating

```text
SCOPE: product star rating display. Audit on /catalog cards (SKUs with rating
       data) and PDP rated SKU detail page.
PREREQ: a product card or PDP that displays a rating; if no fixture has ratings
        in the env under test, skip with a BLOCKED status (do not fabricate data).

1. Spacing + baseline alignment (BL-UI-002 + BL-UI-005):
   browser_evaluate(spacingAuditSnippet('.vc-rating, .vc-rating__star, .vc-rating__count'))
   browser_evaluate(alignmentAuditSnippet('.vc-rating .vc-rating__star, .vc-rating .vc-rating__count'))
   → stars + count text baseline drift ≤ 1 px

NOTE: BL-UI-001 / BL-UI-003 / BL-UI-004 / BL-UI-006 marked n/a in matrix.
      Rating is typically read-only display rolled into the host card/PDP CLS;
      fixed-width; no state transition; non-interactive in this codebase.
```

### 36. VcBreadcrumbs

```text
SCOPE: hierarchical navigation row above PDP / category content.
PREREQ: navigate to a PDP or nested category with deep breadcrumbs
        (e.g., `@td(STRESS.longTitleSlug)`).

1. Spacing + baseline alignment (BL-UI-002 + BL-UI-005):
   browser_evaluate(spacingAuditSnippet('.vc-breadcrumbs, .vc-breadcrumbs__item, .vc-breadcrumbs__separator'))
   browser_evaluate(alignmentAuditSnippet('.vc-breadcrumbs__item, .vc-breadcrumbs__separator'))
   → items + separators baseline drift ≤ 1 px

2. Deep-path overflow at 375 px (BL-UI-004 — CHRONIC):
   resize to 375 px
   browser_evaluate(LAYOUT_SNIPPETS.overflowAudit) scoped to `.vc-breadcrumbs`
   → breadcrumbs MUST wrap, truncate with ellipsis, or scroll inside the
     row — they must NOT push the document horizontal scrollbar

NOTE: BL-UI-001 / BL-UI-003 / BL-UI-006 marked n/a — static once rendered;
      link tap targets are audited at the parent-page level.
```

## Coverage Matrix — machine-readable

The validator at [`scripts/validate-critical-ui-scope.ts`](../../../scripts/validate-critical-ui-scope.ts) parses the table below.

**Cell value contract:**
- A test ID like `LAYOUT-CLS-001` or `LAYOUT-COMP-VCBUTTON-001` — must exist in a regression suite CSV under the `ID` column.
- `n/a` — invariant does not apply to this component (skipped by validator).
- Anything else (including empty cells or text like `GAP` or `none`) is treated as **uncovered** and fails the validator.

Multiple test IDs in one cell — separate with ` + ` (literal `+` with spaces). Each ID is validated independently.

<!-- COVERAGE-MATRIX-START -->

| Component | BL-UI-001 | BL-UI-002 | BL-UI-003 | BL-UI-004 | BL-UI-005 | BL-UI-006 |
|-----------|-----------|-----------|-----------|-----------|-----------|-----------|
| VcButton | n/a | LAYOUT-COMP-VCBUTTON-001 | LAYOUT-SHIFT-001 | n/a | n/a | LAYOUT-TGT-001 + LAYOUT-TGT-003 |
| VcProductCard | LAYOUT-CLS-001 + LAYOUT-CLS-002 | LAYOUT-SPC-001 | LAYOUT-SHIFT-001 | LAYOUT-OVF-LONGTITLE-001 | LAYOUT-ALN-001 | LAYOUT-TGT-001 |
| VcLineItem | LAYOUT-CLS-003 | LAYOUT-SPC-002 | LAYOUT-COMP-VCLINEITEM-001 | LAYOUT-OVF-004 | LAYOUT-ALN-002 | LAYOUT-TGT-002 |
| VcTable | n/a | LAYOUT-COMP-VCTABLE-001 | LAYOUT-COMP-VCTABLE-003 + LAYOUT-SHIFT-004 | LAYOUT-OVF-005 | LAYOUT-COMP-VCTABLE-002 | n/a |
| VcDialog | n/a | LAYOUT-SPC-003 | LAYOUT-COMP-VCDIALOG-001 | LAYOUT-OVF-004 | n/a | LAYOUT-COMP-VCDIALOG-002 |
| Popover | n/a | LAYOUT-COMP-POPOVER-002 | LAYOUT-COMP-POPOVER-001 | LAYOUT-COMP-POPOVER-002 | n/a | n/a |
| VcSidebar | n/a | LAYOUT-COMP-VCSIDEBAR-001 | n/a | LAYOUT-OVF-005 + LAYOUT-OVF-006 + LAYOUT-OVF-007 + LAYOUT-OVF-008 | LAYOUT-COMP-VCSIDEBAR-001 | n/a |
| BOPIS Modal | n/a | LAYOUT-COMP-BOPIS-001 | LAYOUT-COMP-BOPIS-002 | LAYOUT-COMP-BOPIS-003 | LAYOUT-COMP-BOPIS-004 | LAYOUT-COMP-BOPIS-005 |
| VcInput | n/a | LAYOUT-COMP-VCINPUT-001 | LAYOUT-COMP-VCINPUT-002 | LAYOUT-COMP-VCINPUT-004 | n/a | LAYOUT-COMP-VCINPUT-003 |
| VcQuantityStepper | n/a | LAYOUT-COMP-VCQTY-001 | LAYOUT-COMP-VCQTY-003 | n/a | LAYOUT-COMP-VCQTY-001 | LAYOUT-COMP-VCQTY-002 |
| Header | n/a | LAYOUT-COMP-HEADER-001 | LAYOUT-COMP-HEADER-003 | LAYOUT-COMP-HEADER-002 | LAYOUT-COMP-HEADER-001 | LAYOUT-COMP-HEADER-002 |
| Notifications | n/a | LAYOUT-COMP-TOAST-001 | LAYOUT-COMP-TOAST-001 + LAYOUT-COMP-TOAST-002 | n/a | n/a | n/a |
| VcPriceDisplay | n/a | LAYOUT-COMP-VCPRICE-002 | LAYOUT-COMP-VCPRICE-001 | n/a | LAYOUT-COMP-VCPRICE-002 | n/a |
| VcEmptyView | n/a | LAYOUT-COMP-EMPTY-001 | n/a | LAYOUT-COMP-EMPTY-002 | n/a | n/a |
| VcCheckbox | n/a | LAYOUT-COMP-VCCHECKBOX-001 | LAYOUT-COMP-VCCHECKBOX-002 | n/a | LAYOUT-COMP-VCCHECKBOX-001 | LAYOUT-COMP-VCCHECKBOX-003 |
| VcRadioButton | n/a | LAYOUT-COMP-VCRADIO-001 | LAYOUT-COMP-VCRADIO-002 | n/a | LAYOUT-COMP-VCRADIO-001 | LAYOUT-COMP-VCRADIO-003 |
| VcChip | n/a | LAYOUT-COMP-VCCHIP-001 | n/a | LAYOUT-COMP-VCCHIP-002 | LAYOUT-COMP-VCCHIP-003 | n/a |
| VcSelect | n/a | LAYOUT-COMP-VCSELECT-001 | LAYOUT-COMP-VCSELECT-002 | LAYOUT-COMP-VCSELECT-003 | n/a | LAYOUT-COMP-VCSELECT-004 |
| VcDropdownMenu | n/a | LAYOUT-COMP-VCDROPDOWN-001 | LAYOUT-COMP-VCDROPDOWN-002 | LAYOUT-COMP-VCDROPDOWN-003 | LAYOUT-COMP-VCDROPDOWN-004 | LAYOUT-COMP-VCDROPDOWN-005 |
| VcVariantPicker | n/a | LAYOUT-COMP-VCVARIANTPICKER-001 | LAYOUT-COMP-VCVARIANTPICKER-002 | LAYOUT-COMP-VCVARIANTPICKER-001 | LAYOUT-COMP-VCVARIANTPICKER-001 | LAYOUT-COMP-VCVARIANTPICKER-003 |
| VcWidget | n/a | LAYOUT-COMP-VCWIDGET-001 | LAYOUT-COMP-VCWIDGET-002 | LAYOUT-COMP-VCWIDGET-003 | LAYOUT-COMP-VCWIDGET-001 | n/a |
| VcTabSwitch | n/a | LAYOUT-COMP-VCTABSWITCH-001 | LAYOUT-COMP-VCTABSWITCH-002 | LAYOUT-COMP-VCTABSWITCH-003 | LAYOUT-COMP-VCTABSWITCH-001 | LAYOUT-COMP-VCTABSWITCH-004 |
| VcSwitch | n/a | LAYOUT-COMP-VCSWITCH-001 | LAYOUT-COMP-VCSWITCH-002 | n/a | LAYOUT-COMP-VCSWITCH-001 | LAYOUT-COMP-VCSWITCH-003 |
| VcScrollbar | n/a | LAYOUT-COMP-VCSCROLLBAR-001 | LAYOUT-COMP-VCSCROLLBAR-002 | n/a | n/a | n/a |
| VcImage | LAYOUT-COMP-VCIMAGE-001 | LAYOUT-COMP-VCIMAGE-002 | LAYOUT-COMP-VCIMAGE-003 | n/a | n/a | n/a |
| VcAlert | n/a | LAYOUT-COMP-VCALERT-001 | LAYOUT-COMP-VCALERT-002 | LAYOUT-COMP-VCALERT-003 | n/a | LAYOUT-COMP-VCALERT-004 |
| VcBadge | n/a | LAYOUT-COMP-VCBADGE-001 | LAYOUT-COMP-VCBADGE-002 | n/a | LAYOUT-COMP-VCBADGE-003 | n/a |
| VcCarousel | LAYOUT-COMP-VCCAROUSEL-001 | LAYOUT-COMP-VCCAROUSEL-002 | LAYOUT-COMP-VCCAROUSEL-003 | LAYOUT-COMP-VCCAROUSEL-004 | n/a | LAYOUT-COMP-VCCAROUSEL-005 |
| VcPagination | n/a | LAYOUT-COMP-VCPAGINATION-001 | LAYOUT-COMP-VCPAGINATION-002 | LAYOUT-COMP-VCPAGINATION-003 | LAYOUT-COMP-VCPAGINATION-001 | LAYOUT-COMP-VCPAGINATION-004 |
| VcExpansionPanels | n/a | LAYOUT-COMP-VCEXPANSION-001 | LAYOUT-COMP-VCEXPANSION-002 | LAYOUT-COMP-VCEXPANSION-003 | LAYOUT-COMP-VCEXPANSION-001 | LAYOUT-COMP-VCEXPANSION-004 |
| VcModal | n/a | LAYOUT-COMP-VCMODAL-001 | LAYOUT-COMP-VCMODAL-002 | LAYOUT-COMP-VCMODAL-003 | n/a | LAYOUT-COMP-VCMODAL-004 |
| VcConfirmationModal | n/a | LAYOUT-COMP-VCCONFIRMMODAL-001 | LAYOUT-COMP-VCCONFIRMMODAL-002 | LAYOUT-COMP-VCCONFIRMMODAL-003 | LAYOUT-COMP-VCCONFIRMMODAL-001 | LAYOUT-COMP-VCCONFIRMMODAL-004 |
| VcAddToCart | n/a | LAYOUT-COMP-VCADDTOCART-001 | LAYOUT-COMP-VCADDTOCART-002 | n/a | n/a | LAYOUT-COMP-VCADDTOCART-003 |
| VcSlider | n/a | LAYOUT-COMP-VCSLIDER-001 | LAYOUT-COMP-VCSLIDER-002 | n/a | LAYOUT-COMP-VCSLIDER-001 | LAYOUT-COMP-VCSLIDER-003 |
| VcRating | n/a | LAYOUT-COMP-VCRATING-001 | n/a | n/a | LAYOUT-COMP-VCRATING-001 | n/a |
| VcBreadcrumbs | n/a | LAYOUT-COMP-VCBREADCRUMBS-001 | n/a | LAYOUT-COMP-VCBREADCRUMBS-002 | LAYOUT-COMP-VCBREADCRUMBS-001 | n/a |

<!-- COVERAGE-MATRIX-END -->

**Summary (components):**
- 36 components × 6 invariants = 216 cells
- `n/a` cells: 76 (per applicability rules above)
- Covered cells: 140 (every cell that's not `n/a`)
- Gaps: 0

---

## Critical Pages Inventory

Components compose pages. Pages are also independently critical: a regression that doesn't break any single component can still break a page's layout via wrapper chrome, route-specific async fetches, or feature flags. Pages are first-class regression scope alongside components.

Sixteen pages, ordered by revenue + traffic proximity:

| # | Page | Auth | Why critical |
|---|------|------|--------------|
| 1 | `/` (home + header chrome) | anon or auth | Header chrome renders on every page. Cart link, search, ship-to selector, account button all live here. Layout regressions here cascade everywhere. |
| 2 | `/catalog` | anon or auth | Funnel entry. First impression. Product grid alignment + image-load CLS are the chronic offenders. |
| 3 | PDP (`/{slug}`, e.g. `@td(STRESS.longTitleSlug)`) | anon or auth | Conversion-critical. Image gallery CLS, qty stepper (B2B add-to-cart entry), variations widget. |
| 4 | `/cart` (cart + single-page checkout) | required | Revenue path. Line items, shipping, payment, Place Order all on one page. |
| 5 | `/account/orders` | required | Order history (VcTable). Skeleton → table swap is a known shift source. |
| 6 | `/account/lists` | required | Wishlist (VcProductCard inside list container). Skeleton → grid swap. |
| 7 | `/company/members` | required + B2B org admin role | B2B member management (VcTable + role controls). Mobile touch targets on invite/role dropdowns. |
| 8 | `/company/info` | required + B2B org admin role | B2B company profile form. Spacing-grid and validation-shift territory. |
| 9 | **Configurable PDP** (`@td(CONFIGURABLE.testSlug)`) | anon or auth | High-value B2B SKUs (customized products, wedding cakes, monogrammed items). Section accordions + conditional sections + dynamic price = layout-sensitive interactions. Distinct from standard PDP because of `.product-configuration` section system and per-option qty steppers. |
| 10 | `/checkout/payment` | required | Redirect target for non-CyberSource processors (Skyflow / Authorize.Net / Datatrans) per `feedback_payment_flow_learnings`. Payment iframe / hosted form layout shift is high-risk on this revenue-path page. |
| 11 | `/account/dashboard` | required | Default landing for the account section (top-header "Dashboard" link). Contains latest-orders + monthly-spend chart — charts are CLS-prone. |
| 12 | `/account/addresses` | required | Address CRUD page (separate chrome from the address-edit modal already covered by VcDialog). TechFlow org has multiple addresses → stress-tests row alignment. Personal-account-only sidebar item (per memory). |
| 13 | `/sign-in` | anon (incognito) | Highest-traffic anon page. `.vc-input--error` state-insertion is BL-UI-003 critical here. **Test from incognito context** — authenticated browsers redirect to `/catalog` (storefront-selectors.md §6 blocker). |
| 14 | `/search?q={query}` | anon or auth | Funnel-entry alternative to `/catalog`. Empty-state condition (`zzz-no-results`) is unique — exercises VcEmptyView row alongside the regular results grid. |
| 15 | `/sign-up` | anon (incognito) | Same form architecture as `/sign-in` but with more fields (confirm-password, name, org). More validation states = more BL-UI-003 risk. Test from incognito. |
| 16 | `/account/quotes` | required | B2B quote management (VcTable). Transitively covered via the VcTable component row, but a dedicated page row formalizes the layout-stability contract for this revenue-adjacent surface. |

### Applicability of BL-UI invariants per page

Pages use a **4-column** subset of the BL-UI invariants (BL-UI-003 and BL-UI-005 are component-anchored, not page-anchored):

- **BL-UI-001 (CLS)** — applies to every page (page-level metric by definition).
- **BL-UI-002 (spacing)** — applies if the page has wrapper/chrome spacing that isn't already audited via its constituent components.
- **BL-UI-004 (overflow at 375 px)** — applies to every page (no horizontal scroll at mobile is a universal contract).
- **BL-UI-006 (touch targets at 375 px)** — applies if the page has page-specific interactive elements not already audited via its components.

`n/a` in a Page matrix cell means: the invariant is covered transitively by a component this page renders, OR the invariant is structurally not relevant at the page level (e.g., a static info page may have no novel touch targets beyond its VcButton instances, already audited under the component matrix).

### Page audit protocol

For each page in the matrix:

```text
1. NAV: navigate to the page's primary URL (see render-location map below)
2. CLS: install LAYOUT_SNIPPETS.installClsObserver immediately after navigation,
        wait for idle + triggerReflowProbe, read CLS
3. Overflow: at viewport 375 px, run LAYOUT_SNIPPETS.overflowAudit
4. Touch targets (if applicable): touchTargetAuditSnippet(scope) where scope
        is the main content area (excluding header/footer chrome already
        audited under the / page entry)
5. Spacing (if applicable): spacingAuditSnippet for page-specific wrapper/chrome
        not covered by component audits
```

### Render-location map (pages)

| Page (matrix row) | Primary URL | Preconditions |
|-------------------|-------------|---------------|
| `/` | `{{FRONT_URL}}` | none (works anon or authenticated) |
| `/catalog` | `{{FRONT_URL}}/catalog` | none |
| PDP | `{{FRONT_URL}}@td(STRESS.longTitleSlug)` (or navigate via `/search?q={{TEST_SKU}}` → click first card) | none |
| `/cart` | `{{FRONT_URL}}/cart` | authenticated user with ≥ 1 cart item |
| `/account/orders` | `{{FRONT_URL}}/account/orders` | authenticated user with ≥ 1 historical order |
| `/account/lists` | `{{FRONT_URL}}/account/lists` | authenticated user with ≥ 1 wishlist |
| `/company/members` | `{{FRONT_URL}}/company/members` | authenticated as B2B org admin (`TECHFLOW_ADMIN` alias or equivalent) |
| `/company/info` | `{{FRONT_URL}}/company/info` | authenticated as B2B org admin |
| Configurable PDP | `{{FRONT_URL}}@td(CONFIGURABLE.testSlug)` (resolves to `/products-with-options/wedding-cakes/sections-with-conditions-wedding-cake`) | none (anon or auth both work); fixture SKU `YOC-85609878` |
| `/checkout/payment` | `{{FRONT_URL}}/checkout/payment` | authenticated; cart with ≥ 1 item; payment method set to a non-CyberSource processor (Skyflow / Authorize.Net / Datatrans); reached by clicking Place Order on `/cart` |
| `/account/dashboard` | `{{FRONT_URL}}/account/dashboard` | authenticated user (personal account or B2B contact) |
| `/account/addresses` | `{{FRONT_URL}}/account/addresses` | authenticated personal account (B2B users may not see the sidebar item — per memory `feedback_storefront_virtual_catalog_link` / personal-account convention). Use TechFlow contact for stress (multiple addresses). |
| `/sign-in` | `{{FRONT_URL}}/sign-in` | **incognito context only** — authenticated browsers auto-redirect to `/catalog` (see storefront-selectors §6) |
| `/search?q=` | `{{FRONT_URL}}/search?q={{TEST_SKU}}` for results variant; `{{FRONT_URL}}/search?q=zzz-no-results-test` for empty-state variant | none (anon or auth) |
| `/sign-up` | `{{FRONT_URL}}/sign-up` | **incognito context only** |
| `/account/quotes` | `{{FRONT_URL}}/account/quotes` | authenticated user with ≥ 1 quote request (otherwise empty-state variant — exercises VcEmptyView transitively) |

### Coverage Matrix — Pages

<!-- PAGE-COVERAGE-MATRIX-START -->

| Page | BL-UI-001 | BL-UI-002 | BL-UI-004 | BL-UI-006 |
|------|-----------|-----------|-----------|-----------|
| / | LAYOUT-CLS-001 | LAYOUT-COMP-VCBUTTON-001 | LAYOUT-OVF-001 | LAYOUT-TGT-001 |
| /catalog | LAYOUT-CLS-002 | LAYOUT-SPC-001 | LAYOUT-OVF-002 | LAYOUT-TGT-001 |
| PDP | LAYOUT-CLS-002 | LAYOUT-SPC-001 | LAYOUT-OVF-003 + LAYOUT-OVF-LONGTITLE-001 | LAYOUT-TGT-001 |
| /cart | LAYOUT-CLS-003 + LAYOUT-CLS-004 | LAYOUT-SPC-002 + LAYOUT-SPC-003 | LAYOUT-OVF-004 | LAYOUT-TGT-002 + LAYOUT-TGT-003 |
| /account/orders | LAYOUT-PAGE-CLS-ORDERS-001 | LAYOUT-COMP-VCTABLE-001 | LAYOUT-OVF-005 | n/a |
| /account/lists | LAYOUT-PAGE-CLS-LISTS-001 | LAYOUT-SPC-001 | LAYOUT-OVF-006 | n/a |
| /company/members | LAYOUT-PAGE-CLS-MEMBERS-001 | LAYOUT-COMP-VCTABLE-001 | LAYOUT-OVF-007 | n/a |
| /company/info | LAYOUT-PAGE-CLS-COMPANY-001 | LAYOUT-COMP-VCBUTTON-001 | LAYOUT-OVF-008 | n/a |
| Configurable PDP | LAYOUT-PAGE-CLS-CONFIG-001 | LAYOUT-COMP-VCBUTTON-001 | LAYOUT-OVF-009 | LAYOUT-PAGE-TGT-CONFIG-001 |
| /checkout/payment | LAYOUT-PAGE-CLS-PAYMENT-001 | LAYOUT-PAGE-SPC-PAYMENT-001 | LAYOUT-OVF-PAYMENT-001 | LAYOUT-PAGE-TGT-PAYMENT-001 |
| /account/dashboard | LAYOUT-PAGE-CLS-DASHBOARD-001 | LAYOUT-COMP-VCSIDEBAR-001 | LAYOUT-OVF-DASHBOARD-001 | n/a |
| /account/addresses | LAYOUT-PAGE-CLS-ADDRESSES-001 | LAYOUT-COMP-VCSIDEBAR-001 | LAYOUT-OVF-ADDRESSES-001 | n/a |
| /sign-in | LAYOUT-PAGE-CLS-SIGNIN-001 | LAYOUT-COMP-VCINPUT-001 | LAYOUT-OVF-SIGNIN-001 | LAYOUT-PAGE-TGT-SIGNIN-001 |
| /search?q= | LAYOUT-PAGE-CLS-SEARCH-001 | LAYOUT-SPC-001 | LAYOUT-OVF-SEARCH-001 | LAYOUT-TGT-001 |
| /sign-up | LAYOUT-PAGE-CLS-SIGNUP-001 | LAYOUT-COMP-VCINPUT-001 | LAYOUT-OVF-SIGNUP-001 | LAYOUT-PAGE-TGT-SIGNUP-001 |
| /account/quotes | LAYOUT-PAGE-CLS-QUOTES-001 | LAYOUT-COMP-VCTABLE-001 | LAYOUT-OVF-QUOTES-001 | n/a |

<!-- PAGE-COVERAGE-MATRIX-END -->

**Summary (pages):**
- 16 pages × 4 applicable invariants = 64 cells
- `n/a` cells: 7 (account/company/dashboard/quotes pages — touch targets covered transitively under components)
- Covered cells: 57
- Gaps: 0

**Configurable PDP — additional state-shift tests not in matrix:** The matrix has no BL-UI-003 column for pages (state-shift is component-anchored). Two tests cover Configurable-PDP-specific state behaviors AS SUITE TESTS, outside the matrix:
- `LAYOUT-COMP-CONFIG-001` — accordion expand/collapse: sticky sidebar must not shift
- `LAYOUT-COMP-CONFIG-002` — option selection: dynamic price updates without sidebar block reflow

These are required for regression coverage of the configurable-product UX but are not gated by the validator (which only enforces the matrix). Suite execution always runs them.

**LAYOUT-OVF-001 was split into 8 per-page tests on 2026-05-14** (LAYOUT-OVF-001..008, one per critical page) after the first regression run showed the agent naturally reporting per-page granularity. The single composite test was replaced; each page now has its own overflow test for triage clarity. The previous LAYOUT-OVF-002 (long-title stress) was renamed to LAYOUT-OVF-LONGTITLE-001 to avoid ID collision with the per-page split.

## Notes on transitive coverage

Cells that point at component-level test IDs (e.g., `/company/members × BL-UI-002 = LAYOUT-COMP-VCTABLE-001`) require the component test's render-location to actually exercise that page. The agent running `LAYOUT-COMP-VCTABLE-001` MUST navigate to `/account/orders` OR `/company/members` (its choice — whichever is more reliably populated in the test environment). If you change a component test's render location, audit the Pages matrix for cells that depended on it.

The validator does NOT enforce render-location parity (that's a runtime concern, not a static check). It enforces only that every non-`n/a` cell points at a test ID that exists. Render-location correctness is the test author's responsibility.

## When to update this file

- **Add a new component to the inventory** — only with explicit user approval. Update inventory, render-location map, applicability rules, audit protocol, AND coverage matrix in the same edit. Add tests to fill the new row's covered cells.
- **Add a new BL-UI invariant** — coordinated with [business-logic.md](business-logic.md#domain-15-ui-display--layout-stability-bl-ui) promotion. The matrix grows a column; fill applicable cells.
- **A covering test ID is renamed or moved** — update the matrix immediately. Validator will fail until you do.
- **A component's applicability changes** (e.g., VcSidebar starts containing interactive primary CTAs and BL-UI-006 becomes applicable) — flip the cell from `n/a` to a real test ID and add the test.

## Why this file lives in `knowledge/`, not `rules/`

`rules/` files describe HOW the project works (regression modes, MCP setup). `knowledge/` files describe domain truth that agents need to make judgments (business logic, edge cases, schemas, selectors, scope). Coverage scope is domain truth, not a process rule — it sits with the BL-UI invariants and storefront selectors that define WHAT must hold true.
