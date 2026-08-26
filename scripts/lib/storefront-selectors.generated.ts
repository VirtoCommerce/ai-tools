/**
 * AUTO-GENERATED — DO NOT EDIT BY HAND.
 *
 * The storefront's `data-test-id` surface, read from the vc-frontend source so test
 * authoring and the preflight macros target REAL elements instead of a hand-transcribed list.
 * When this file was first generated, 24 of the 78 selectors the knowledge files asserted did
 * not exist in the source at all — including the canonical sign-in/sign-out pair.
 *
 * Source:      https://github.com/VirtoCommerce/vc-frontend
 * Ref:         dev
 * Commit:      17c99c7c8df935670bc4fd4fead0c7078ae0f7ec
 * Subtree:     client-app/
 * Regenerate:  npm run selectors:sync
 * Drift-guard: npm run selectors:check   (CI gate)
 */

/**
 * The attribute the storefront actually uses. `data-testid` (no dash) has ZERO occurrences
 * in the source — a locator written against it can never match, whatever the docs used to say.
 */
export const TEST_ID_ATTRIBUTE = "data-test-id" as const;

/** Every statically-declared `data-test-id` value, sorted. */
export const STATIC_SELECTORS: readonly string[] = [
  "account-button",
  "account-menu",
  "add-all-to-cart-button",
  "add-shipping-address-button",
  "add-to-cart-button",
  "add-to-cart-component",
  "add-to-list-button",
  "address-form",
  "back-to-operator-loader",
  "back-to-operator-row",
  "billing-address-equals-shipping-checkbox",
  "brand-banner",
  "brand-logo",
  "brand-products",
  "brand-title",
  "brands-empty_view",
  "brands-featured",
  "brands-letter",
  "brands-letter_item",
  "brands-letter_link",
  "brands-letter_list",
  "brands-nav_item",
  "brands-search_button",
  "brands-search_input",
  "cancel-button",
  "card-holder-input",
  "card-number-input",
  "cart-discount-total-label",
  "cart-for-later.see-all-button",
  "cart-for-later.show-more-button",
  "cart-item-actions-after-image",
  "cart-item-actions-after-title",
  "cart-other-currency-totals",
  "cart-subtotal-label",
  "cart-tax-total-label",
  "cart-total-label",
  "cart.products-section",
  "category-products-loader",
  "check-pickup-locations-button",
  "checkout-layout.secure-checkout-label",
  "city-input",
  "clear-cart-button",
  "close-button",
  "confirm-button",
  "contact-us-link",
  "contacts-link",
  "content",
  "count-in-cart-label",
  "country-select",
  "create-wishlist-button",
  "currency-selector",
  "currency-selector-button",
  "current-currency-label",
  "current-language-label",
  "custom-input",
  "custom-input-radio",
  "customer-name-label",
  "dashboard-link",
  "delete-button",
  "description-input",
  "email-input",
  "end-list-label",
  "expiration-date-input",
  "extension-point",
  "file-option",
  "filter-city",
  "filter-country",
  "filter-region",
  "first-name-input",
  "forgot-password-link",
  "global-search-apply-button",
  "global-search-categories-suggestions",
  "global-search-history-sections",
  "global-search-not-found",
  "global-search-pages-suggestions",
  "global-search-products-suggestions",
  "global-search-query-input",
  "global-search-suggestions-dropdown",
  "grid-view-tab",
  "language-selector",
  "language-selector-button",
  "last-name-input",
  "line-1-input",
  "line-2-input",
  "list-view-tab",
  "login-button",
  "mobile-account-menu-logout-row",
  "mobile-back-to-operator-button",
  "mobile-back-to-operator-loader",
  "no-button",
  "none-option",
  "operator-name-label",
  "order-summary-widget",
  "organization-name-label",
  "organizations-empty-list",
  "organizations-search",
  "organizations-search-button",
  "password-input",
  "pay-now-button",
  "payment-details-section",
  "payment-method-selector",
  "phone-input",
  "pickup-availability-chip",
  "pickup-location-address",
  "pickup-location-card",
  "pickup-location-card-cancel",
  "pickup-location-card-dialog",
  "pickup-location-card-info",
  "pickup-location-card-name",
  "pickup-location-card-select",
  "pickup-location-name",
  "pickup-location-section",
  "pickup-locations-list",
  "pickup-locations-load-more",
  "pickup-locations-map",
  "pickup-locations-not-found",
  "pickup-switcher",
  "place-order-button",
  "postal-code-input",
  "predefined-option",
  "product-card-configurations-button",
  "product-option",
  "products-count-label",
  "purchased-before-badge",
  "purchased-before-checkbox-filter",
  "quantity-stepper",
  "region-select",
  "remove-item-button",
  "reset-filters-chip",
  "reset-filters-mobile-button",
  "reset-search-button",
  "save-for-later-button",
  "search-button",
  "search-keyword-input",
  "section",
  "section-description",
  "section-subtitle",
  "section-title",
  "security-code-input",
  "select-address-button",
  "select-address-label",
  "select-address-map-desktop",
  "select-address-map-mobile",
  "selected-address-label",
  "ship-to-add-new-address",
  "ship-to-more-button",
  "ship-to-no-results",
  "ship-to-search-field",
  "ship-to-selector",
  "shipment-options-widget",
  "shipping-address-section",
  "shipping-addresses-list",
  "shipping-cost-label",
  "shipping-details-section",
  "shipping-method-selector",
  "shipping-switcher",
  "sidebar",
  "sign-in-error-alert",
  "sign-in-link",
  "sign-in-page.registration-button",
  "sign-out-button",
  "sign-up-confirm-password-input",
  "sign-up-email-input",
  "sign-up-first-name-input",
  "sign-up-last-name-input",
  "sign-up-link",
  "sign-up-organization-name-input",
  "sign-up-organization-registration-radio-button",
  "sign-up-password-input",
  "sign-up-personal-registration-radio-button",
  "sign-up-submit-button",
  "slider-input-end",
  "slider-input-start",
  "sticked-place-order-button",
  "submit-button",
  "support-phone-link",
  "text-option",
  "top-header",
  "view-list-button",
  "view-map-button",
  "view-switcher",
  "wishlist-card",
  "wishlist-card-edit-menu-item",
  "wishlist-card-menu-button",
  "wishlist-card-remove-menu-item",
  "wishlist-description-input",
  "wishlist-modal-save-button",
  "wishlist-name-input",
  "wishlist-settings-cancel-button",
  "wishlist-settings-save-button",
  "wishlist-share-customer-select",
  "wishlist-share-message-input",
  "wishlist-sharing-scope-select",
  "yes-button",
] as const;

/**
 * Selectors built from a template literal. These are PREFIXES, not names — the suffix comes
 * from runtime data (a facet name, an address id). Never write the whole thing as a literal:
 * `filter-price` was one of the phantom selectors that motivated this file.
 */
export const SELECTOR_PATTERNS: readonly { readonly prefix: string; readonly template: string }[] = [
  { prefix: "customer-address-", template: "`customer-address-${item.id}`" },
  { prefix: "filter-", template: "`filter-${facet.paramName}-${item.value}`" },
  { prefix: "filter-city-", template: "`filter-city-${value.value}`" },
  { prefix: "filter-country-", template: "`filter-country-${value.value}`" },
  { prefix: "filter-region-", template: "`filter-region-${value.value}`" },
  { prefix: "loyalty-validation-alert-", template: "`loyalty-validation-alert-${message.code}`" },
  { prefix: "products-", template: "`products-${savedViewMode}-view`" },
  { prefix: "ship-to-favorite-icon-", template: "`ship-to-favorite-icon-${address.id}`" },
  { prefix: "sign-up-error-", template: "`sign-up-error-${error}-alert`" },
  { prefix: "variations-", template: "`variations-${product.code}-button`" },
] as const;

/**
 * Bindings whose value could not be resolved statically (a bare expression like
 * `:data-test-id="item.dataTestId"`). Recorded rather than guessed at: a fabricated
 * expectation fails every correct implementation. A non-zero count means the surface is
 * WIDER than `STATIC_SELECTORS` — treat an unknown selector as unverified, not as invalid.
 */
export const UNRESOLVED_BINDINGS: readonly { readonly expr: string; readonly file: string; readonly reason: string }[] = [
  { expr: "dataTestId", file: "client-app/shared/catalog/components/facet-filter.vue", reason: "value is a bare expression" },
  { expr: "testId", file: "client-app/shared/checkout/components/proceed-to.vue", reason: "value is a bare expression" },
  { expr: "item.dataTestId", file: "client-app/shared/layout/components/header/_internal/bottom-header.vue", reason: "value is a bare expression" },
  { expr: "testId", file: "client-app/shared/layout/components/header/_internal/dark-mode-toggle.vue", reason: "value is a bare expression" },
  { expr: "testId", file: "client-app/shared/layout/components/header/_internal/dark-mode-toggle.vue", reason: "value is a bare expression" },
  { expr: "testId", file: "client-app/ui-kit/components/atoms/checkbox/vc-checkbox.vue", reason: "value is a bare expression" },
  { expr: "testId", file: "client-app/ui-kit/components/atoms/infinity-scroll-loader/vc-infinity-scroll-loader.vue", reason: "value is a bare expression" },
  { expr: "testIdInput", file: "client-app/ui-kit/components/atoms/radio-button/vc-radio-button.vue", reason: "value is a bare expression" },
  { expr: "testId", file: "client-app/ui-kit/components/atoms/scrollbar/vc-scrollbar.vue", reason: "value is a bare expression" },
  { expr: "testId", file: "client-app/ui-kit/components/atoms/switch/vc-switch.vue", reason: "value is a bare expression" },
  { expr: "dataTestId", file: "client-app/ui-kit/components/molecules/calendar/vc-calendar.vue", reason: "value is a bare expression" },
  { expr: "dataTestId", file: "client-app/ui-kit/components/molecules/chip/vc-chip.vue", reason: "value is a bare expression" },
  { expr: "dataTestId", file: "client-app/ui-kit/components/molecules/date-input/vc-date-input.vue", reason: "value is a bare expression" },
  { expr: "testIdInput", file: "client-app/ui-kit/components/molecules/input/vc-input.vue", reason: "value is a bare expression" },
  { expr: "testIdDropdown", file: "client-app/ui-kit/components/molecules/select/vc-select.vue", reason: "value is a bare expression" },
  { expr: "testId", file: "client-app/ui-kit/components/molecules/variant-picker-group/vc-variant-picker-group.vue", reason: "value is a bare expression" },
  { expr: "testId", file: "client-app/ui-kit/components/molecules/variant-picker/vc-variant-picker.vue", reason: "value is a bare expression" },
  { expr: "dataTestId", file: "client-app/ui-kit/components/organisms/date-picker/vc-date-picker.vue", reason: "value is a bare expression" },
  { expr: "testId", file: "client-app/ui-kit/components/organisms/modal/vc-modal.vue", reason: "value is a bare expression" },
  { expr: "dataTestId", file: "client-app/ui-kit/components/organisms/product-button/vc-product-button.vue", reason: "value is a bare expression" },
] as const;

/** CSS selector for a test id, in the one spelling that exists. */
export function testIdSelector(name: string): string {
  return `[${TEST_ID_ATTRIBUTE}="${name}"]`;
}

/**
 * Is this a selector the storefront can actually produce? True for a static value or for
 * anything matching a known template prefix. Returns false for an invented name — which is
 * what makes it usable as a review gate rather than documentation.
 */
export function isKnownSelector(name: string): boolean {
  if ((STATIC_SELECTORS as readonly string[]).includes(name)) return true;
  return SELECTOR_PATTERNS.some((p) => name.startsWith(p.prefix) && name.length > p.prefix.length);
}

export const SOURCE = {
  repo: "VirtoCommerce/vc-frontend",
  ref: "dev",
  commit: "17c99c7c8df935670bc4fd4fead0c7078ae0f7ec",
  sourcedFrom: "local checkout /tmp/claude-0/-home-user-vc-mcp-testing-module/5196f4de-3553-51eb-993f-0df6cd0e6fb6/scratchpad/vc-frontend",
  staticCount: 194,
  patternCount: 10,
  unresolvedCount: 20,
} as const;
