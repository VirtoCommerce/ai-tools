# VCST-4993 Verification Report

## Summary
- **Verdict:** VERIFIED
- **Date:** 2026-05-12
- **Environment:** https://vcst-qa-storefront.govirto.com (vcst-qa)
- **Theme:** vc-theme-b2b-vue-2.49.0-pr-2287-367d-367d16a1 (confirmed live in footer)
- **Platform:** 3.1026.0
- **Browser:** playwright-chrome (Chromium 149.0.7827.3, viewport 1920x1080)
- **Test account:** main storefront user (mutykovaelena@gmail.com, org "[E2E Test] Contoso Ltd.")
- **STR result:** 3/3 PASS

The fix from PR vc-frontend #2287 is correctly deployed and functioning: the search input inside the Cart-page "Select address" modal exposes `aria-label="Search addresses"` instead of the incorrect "Search pickup locations" from the BOPIS context. WCAG 4.1.2 (Name, Role, Value) is now satisfied for the address-selection dialog.

## STR Verification

| Run | aria-label observed | Match expected | Modal title | Screenshot |
|-----|---------------------|----------------|-------------|------------|
| 1   | "Search addresses"  | PASS           | Select address | screenshot-aria-label-search-addresses.png |
| 2   | "Search addresses"  | PASS           | Select address | (same selector, deterministic) |
| 3   | "Search addresses"  | PASS           | Select address | (same selector, deterministic) |

Each run executed a fresh page reload (`/cart` → click `[data-test-id="select-address-button"]` → read `aria-label` on `[data-test-id="search-keyword-input"]`). The accessibility tree also confirms the rendered name: `textbox "Search addresses" [ref=e1096]` inside `dialog "Select address" [ref=e1042]`.

## Checklist

### Fix Confirmation
| # | Item | Result | Evidence |
|---|------|--------|----------|
| 1 | STR repro #1 — aria-label = "Search addresses" | PASS | Read via DOM `getAttribute('aria-label')` + AT snapshot |
| 2 | STR repro #2 — aria-label = "Search addresses" | PASS | Fresh reload, identical result |
| 3 | STR repro #3 — aria-label = "Search addresses" | PASS | Fresh reload, identical result |

### Regression (adjacent VCST-4710 features)
| # | Item | Result | Evidence |
|---|------|--------|----------|
| 4 | Address-modal opens cleanly from `/cart` | PASS | Modal renders, title "Select address", no JS exceptions during click |
| 5 | Typing in search filters list | PARTIAL PASS | Input accepts text, fires `input` events, Search button present and clickable; with only 1 saved address in this account the filter direction could not be exhaustively proven (the underlying request fires — see GraphQL POSTs at indexes 81–88, 93). Functional UI intact. |
| 6 | Selecting address closes modal & updates cart shipping summary | PASS | Row click → OK → modal closes, cart text shows "123 QA Test Street..." in Shipping details |
| 7 | No new console errors or 4xx/5xx | PASS | 0 console errors. Only pre-existing Apollo client warning codes 24/25/26 (masking). All `/graphql` POSTs returned 200. Two `[FAILED] ERR_ABORTED` GA collect events are pre-existing GA4 navigation cancellations, not introduced by this PR. |

### Sibling-context A11y sanity
| # | Item | Result | Evidence |
|---|------|--------|----------|
| 8 | BOPIS pickup-store selector still announces "Search pickup locations" | BLOCKED | The cart items on this account ([E2E Test] Contoso Ltd. context) are not BOPIS-eligible — clicking the "Pickup" toggle on the cart line registers as a shipping-tier change (GA `add_shipping_info` with `shipping_tier=Pickup`) but no store-selector modal opens. No BOPIS-enabled product or fulfillment-center mapping was available in the test cart. Per task instructions this is non-blocking for the verdict. Static code analysis (PR diff): `createCartFilterContext` and `createProductFilterContext` in `usePickupFilterContext.ts` were intentionally kept at the BOPIS key — fix is surgical by construction. |

### Cosmetic / WCAG
| # | Item | Result | Evidence |
|---|------|--------|----------|
| 9 | Placeholder literal value | OBSERVED — "Search " (with trailing space) | Confirmed across all 3 runs. Out of PR #2287 scope per task instructions; comes from `$t('common.labels.search')`. NOT a fail. |
| 10 | WCAG 4.1.2 — accessible name in address dialog | PASS | Accessibility tree: `textbox "Search addresses"` inside `dialog "Select address"`. Context now correctly conveyed by AT. Satisfies AC-10c of VCST-4710. |

## Side observations

- **Placeholder value:** `"Search "` (literal, trailing whitespace from `common.labels.search` translation). Not addressed by PR #2287 — per parent instructions, noted not failed.
- **Console errors (new):** None. The only console output is three pre-existing Apollo error-masking warnings (codes 24/25/26) at `https://go.apollo.dev/c/err#...`; these existed before PR #2287 and have no semantic relation to the address modal a11y change.
- **Network errors (new):** None. All storefront `/graphql` POSTs returned 200. Two GA4 `region1.google-analytics.com/g/collect` failures with `ERR_ABORTED` are routine navigation-cancellation noise from the GA4 client.
- **Modal heading:** `<h2>Select address</h2>` is correct context. The dialog correctly exposes `role="dialog"` and `aria-labelledby` semantics via the h2.
- **Sibling context (code review of PR diff):** `usePickupFilterContext.ts` declares `searchAriaLabelKey` per factory:
  - `createCartFilterContext` → `pages.account.order_details.bopis.search_pickup_locations` (BOPIS — unchanged)
  - `createAddressFilterContext` → `shared.checkout.select_address_modal.search_addresses_aria_label` (THE FIX)
  - `createProductFilterContext` → `pages.account.order_details.bopis.search_pickup_locations` (unchanged)

  Because the BOPIS keys are unchanged, BOPIS regression risk is zero by construction; a live BOPIS re-test would be confirmatory rather than gating.

## Evidence files

- `screenshot-aria-label-search-addresses.png` — element-level screenshot of the search input inside the open "Select address" modal (Run #1; aria-label = "Search addresses" verified at this exact element)
- Console logs and HAR captures are produced automatically by the playwright-chrome MCP config; located in `test-results/chrome/` if needed (per `config/mcp-playwright-chrome.config.json`)

## Verdict rationale

3/3 STR runs pass; the accessibility tree exposes the correct name ("Search addresses") inside the correctly-named dialog ("Select address"); no console/network regressions introduced; modal open/select/close cycle works end-to-end; cart shipping summary updates correctly. BOPIS sibling-context live re-test was BLOCKED by test-data setup but mitigated by PR diff analysis showing the BOPIS keys were intentionally preserved. The placeholder trailing-space cosmetic artifact is explicitly out of PR scope. **Recommendation: transition VCST-4993 to "Closed / Done" — fix is verified.**
