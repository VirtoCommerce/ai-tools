# vc-frontend Storefront Config Flags

Source of truth: [`vc-frontend/client-app/config/settings_data.json`](https://github.com/VirtoCommerce/vc-frontend/blob/dev/client-app/config/settings_data.json) (branch `dev`).

These are the **client-side `$cfg.*` flags** consumed by Vue components and route guards. They are baked into the deployed theme zip (e.g., `vc-theme-b2b-vue-2.48.0-pr-2269-cd06.zip`); a deployment can override defaults per environment.

> **Why this matters for testing:** when a UI element doesn't render or a route redirects unexpectedly, check whether a `$cfg.<flag>` gate explains it before classifying as a bug, regression, or scope-expansion (lesson from TLC-2026-04-27-1533 MAN-006). These flags are NOT the same as platform store settings (the `Stores.*` / `XOrder.*` keys returned by `GET /api/stores/{id}`); those are server-side.

**Snapshot date:** 2026-04-27 · **Branch:** `dev` · **Active preset:** `default`

## Cart / Checkout

| Flag | Default | What it gates |
|------|---------|---------------|
| `checkout_multistep_enabled` | **`false`** | Multi-step checkout flow. When `true`, `/checkout/review` (read-only review page) is reachable; when `false`, /cart redirects from /checkout/review and the `<ProceedTo>` button on cart routes single-page. **QA currently OFF.** |
| `checkout_comment_enabled` | `true` | Order comment input on cart/checkout |
| `checkout_purchase_order_enabled` | `true` | PO Number field on checkout (B2B) |
| `checkout_coupon_enabled` | `true` | **LEGACY** — gated the old inline VcActionInput on cart's OrderSummary footer. PR #2269 (VCST-4896) removed that input and replaced it with `<CouponsSection>` widget which renders **unconditionally** (does not check this flag). The flag still exists in defaults but no longer gates the cart-side coupon UI. |
| `checkout_gifts_enabled` | `true` | Gift items section in cart |

## Catalog / Product

| Flag | Default | What it gates |
|------|---------|---------------|
| `product_compare_enabled` | `true` | Compare feature visibility |
| `product_compare_limit` | `5` | Max products in compare list |
| `product_filters_sorting` | `false` | Sortable filter facets |
| `product_filters_sorting_direction` | `"asc"` | Default facet sort direction |
| `product_quantity_control` | `"stepper"` | Qty input style on PDP/cart (stepper vs. numeric) |
| `range_filter_type` | `"slider"` | Numeric range facet UI |
| `vendor_enabled` | `true` | Vendor display on catalog/PDP |
| `vendor_rating_enabled` | `true` | Vendor rating display |
| `categories_limit` | `499` | Max categories rendered |
| `wishlists_limit` | `10` | Max user wishlists |
| `image_thumbnails_enabled` | `true` | Thumbnail variants on PDP |
| `image_thumbnails_original_fallback_enabled` | `true` | Fallback to original when thumb missing |
| `image_carousel_in_product_card_enabled` | `true` | Multi-image carousel in catalog cards |
| `zero_price_product_enabled` | `false` | Whether $0-priced products are addable to cart |

## Search

| Flag | Default | What it gates |
|------|---------|---------------|
| `search_max_chars` | `400` | Max chars in search input |
| `search_static_content_suggestions_enabled` | `true` | CMS pages in search suggestions dropdown |
| `search_product_phrase_suggestions_enabled` | `false` | Product phrase suggestions (autocomplete) |

## Files / Push / Misc

| Flag | Default | What it gates |
|------|---------|---------------|
| `files_enabled` | `true` | File attachments (FileExperienceApi) |
| `push_messages_enabled` | `true` | Push notifications |
| `isCVVinSkyflowRequired` | `true` | CVV requirement on Skyflow payment |
| `default_return_url` | `"/"` | Post-action redirect default |
| `line_items_group_by_vendor_enabled` | `true` | Cart line item grouping |
| `graphql_operation_marking_enabled` | `true` | Adds operation-name comments to GraphQL requests |
| `cart_page_browser_target` | `"_blank"` | Cart link `target` attribute |
| `product_page_browser_target` | `"_self"` | Product link `target` attribute |
| `details_browser_target` | `"_blank"` | Details link `target` attribute |

## Layout / Branding

| Flag | Default | What it gates |
|------|---------|---------------|
| `logo_image` | `"logo.svg"` | Header logo |
| `logo_inverted_image` | `"logo-white.svg"` | Footer/dark-mode logo |
| `favicon_image` | `"/static/icons/favicon-32x32.png"` | Browser tab icon |
| `homepage_background_image` | `"main-banner.webp"` | Hero background |
| `catalog_pagination_mode` | `"infinite_scroll"` | Catalog pagination style |
| `desktop_menu_mode` | `"horizontal"` | Desktop nav layout |

## Status Vocabularies (not flags but config arrays)

- `orders_statuses[]` — 7 entries: `New`, `Processing`, `Pending`, `Cancelled`, `Completed`, `Payment required`, `Ready for pickup` (with display color/variant/icon per status). Storefront uses these labels — assertions on order status text should match this list, NOT the platform `OrderStatusType` enum (see project memory `project_order_status_vocab.md`).
- `quote_statuses[]` — 8 entries: `New`, `Processing`, `Ordered`, `Proposal sent`, `On hold`, `Draft`, `Declined`, `Canceled`.

## Other config arrays

- `social_sharing_services[]` — Facebook, Twitter, Pinterest, Telegram (icon + url_template)
- `image_thumbnails_suffixes` — `{sm: "sm", md: "md", lg: "lg"}`
- `previewers_settings.priorities` — `builderIo: 1, slugContent: 2, internal: 3`

## How to read in tests / Vue components

```vue
<template>
  <!-- gated render -->
  <ProceedTo v-if="$cfg.checkout_multistep_enabled" />
</template>

<script setup>
import { useThemeContext } from "@/core/composables";
const { themeContext } = useThemeContext();
const isMultistep = themeContext.value.settings.checkout_multistep_enabled;
</script>
```

In Playwright/Edge MCP tests:
```js
browser_evaluate(() => window.$cfg?.checkout_multistep_enabled)
// or read from the loaded settings JSON in localStorage / Vue runtime
```

## Known per-environment overrides observed

| Env | Flag | Value | Notes |
|-----|------|-------|-------|
| QA (`vcst-qa-storefront.govirto.com`) | `checkout_multistep_enabled` | `false` | Default — single-page checkout. `/checkout/review` redirects to `/cart`. |

## Workflow notes

- This file is a **snapshot**. Re-fetch from GitHub if a behavior seems off and a flag is suspected: `mcp__github__get_file_contents owner=VirtoCommerce repo=vc-frontend path=client-app/config/settings_data.json branch=dev`
- A specific deployed theme may override defaults — check the theme zip's bundled `settings_data.json` if behavior diverges from this list.
- Flag-removal (e.g., `checkout_coupon_enabled` no longer gating sidebar) is a real PR concern but does NOT remove the flag from this file; PRs delete `v-if` directives, not the defaults.
