# VCST-4400 — VcIcon Per-Page Verification Checklist

**PR:** [VirtoCommerce/vc-frontend#2382](https://github.com/VirtoCommerce/vc-frontend/pull/2382) `feat(VCST-4400): implement outline icons` · **Deployed:** vcst-qa storefront @ theme `2.54.0-pr-2382-100c-100cbb5e` · `FRONT_URL={{FRONT_URL}}`
**Reuses DAC-1…DAC-9** from `ac-analysis.md` (all SATISFIED in the prior pass — this checklist is for **re-testing on any rebuild/hotfix of the PR**, not a first pass). Contrast/focus findings below are from `qa-design-vcicon.md`.

## Legend

- Viewports: **375** (mobile) / **768** (tablet) / **1280** (desktop)
- Size tokens: `xxs`=10 `xs`=14 `sm`=20 `md`=24(default) `lg`=40 `xl`=48 `xxl`=64 px
- Auth: **G**uest / **B2B** authenticated B2B user (`@td()` / live-discover — never hardcode)
- DAC tags reference `ac-analysis.md`: DAC-1 outline-default, DAC-2 solid-override, DAC-3 fill→text color, DAC-4 pencil icon, DAC-5 mobile sizing, DAC-6 a11y label/aria-hidden, DAC-7 no visual regression, DAC-8 order-status chip structure, DAC-9 stroke buckets
- ⚠️ = known issue from `qa-design-vcicon.md` — re-verify, don't re-file unless changed

## 0. Site-wide risk — icon name aliasing (read before testing any page)

`client-app/ui-kit/utilities/icon-aliases.ts` is a **new** file (not called out in the original seed map) that remaps ~80 legacy icon names to canonical Lucide outline names (e.g. `cart`→`shopping-cart`, `whishlist`→`star`, `delete-2`→`x`, `logout`→`log-out`, `grid`/`view-grid`→`layout-grid`, `warning`→`triangle-alert`, `compare`→`git-compare-arrows`). This resolution happens in `icons.ts` `resolveIcon()`, consumed by **every** `VcIcon` render app-wide — including call sites the PR diff never touched (a `.vue` file with `name="cart"` and no line change still renders a different glyph shape post-PR). The 30-file seed map only covers files with a **literal diff**; the *rendered* blast radius is larger.

- [ ] Spot-check 3–5 untouched-by-diff pages that use an aliased name (e.g. any `logout` icon in account nav, any `grid`/`view-grid` view-toggle on catalog listing) — confirm the new Lucide glyph renders, is not blank/broken, and reads recognizably as the same concept (DAC-7)
- [ ] Confirm `variant="solid"` requests resolve correctly: `resolveIcon()` matches solid assets by the **raw literal name** (solid library keeps legacy names, e.g. `icons/solid/cart.svg`), not the canonical alias — a solid request for a name whose solid asset doesn't exist under that exact string silently degrades to outline. Verified OK for this PR's actual solid overrides (`cart`, `cube`, `cloud`, `credit-card`, `plus-circle-outlined` all have matching solid assets) — but flag if any **future** solid override uses a canonical Lucide name directly
- [ ] `client-app/ui-kit/utilities/icons.ts` (new resolver, DOMPurify-sanitized SVG fetch, memoized per icon name) — no console errors (`Failed to load icon: <name>`) on any page visited below

## 1. Global / every page (header, footer-adjacent, scroll)

Auth: G + B2B · Viewports: 375/768/1280

| Icon / element | File | Expected | DAC | Check |
|---|---|---|---|---|
| Hamburger (mobile) | `mobile-header.vue` | outline `menu`, **24px** (was 32) | DAC-3, DAC-5 | [ ] |
| Phone (mobile header) | `mobile-header.vue` | outline `phone`, **24px** (was 28) | DAC-3, DAC-5 | [ ] |
| Search trigger (mobile header) | `mobile-header.vue` | outline `search`, **24px** (was 28) | DAC-3, DAC-5 | [ ] |
| Cart trigger (mobile header) | `mobile-header.vue` | outline `cart`, **24px** (was 28), badge unaffected | DAC-3, DAC-5 | [ ] |
| Catalog-menu chevron (desktop bottom header) | `bottom-header.vue` | outline chevron, `text-primary` | DAC-3 | [ ] |
| Bottom-header link icons (nav badges) | `bottom-header-link.vue` | `text-primary`, badge no longer forces `variant="outline"` — confirm badge still styled correctly | DAC-3, DAC-7 | [ ] |
| Mega-menu arrow/expand icon | `mega-menu.vue` | `text-primary`, size-4 | DAC-3 | [ ] |
| Subcategory nav arrow | `subcategories.vue` | `text-secondary-400` | DAC-3 | [ ] |
| Mobile menu drawer: active/inactive item icon | `mobile-menu-link.vue` | active = `text-[--mobile-menu-icon-active-color]`, inactive = `text-[--mobile-menu-icon-color]`, chevron-right on parent items | DAC-3 | [ ] |
| Mobile menu drawer: dark-mode toggle + close (X) | `mobile-menu.vue` | toggle icon `text-[--mobile-menu-navigation-color]`; close now `delete-thin`→`x` via alias, same color var | DAC-3, §0 alias | [ ] |
| Currency selector arrow | `currency-selector.vue` | mobile `text-[--mobile-menu-navigation-color]`, desktop (`lg:`) `text-primary` | DAC-3, DAC-5 | [ ] |
| Language selector arrow | `language-selector.vue` | mobile `text-[--mobile-menu-navigation-color]`, desktop `text-primary` | DAC-3, DAC-5 | [ ] |
| Push messages bell (desktop header) | `link-push-messages.vue` | `text-primary`, size 24 | DAC-3 | [ ] |
| Push messages bell (mobile header) | `push-messages-mobile.vue` | **24px** (was 28) — this is a size regression risk beyond the seed's "sizes changed" note, verify it's not now too small next to other 24px mobile-header icons | DAC-3, DAC-5 | [ ] |
| Push messages dropdown option icons | `vc-push-messages.vue` | `text-neutral` / hover `text-neutral-700` | DAC-3 | [ ] |
| Top header: call-us phone, user-circle (×2), login-menu chevron, back-to-operator arrow | `top-header.vue` | all `fill-*`→`text-*`; chevron flips up/down on menu toggle; impersonation "back to operator" row (auth-gated, needs impersonation session) | DAC-3, DAC-7 | [ ] |
| Barcode scanner trigger button | `barcode-scanner.vue` | **not a VcIcon prop change** — button `color` prop `primary`→`neutral`; confirm the search-bar scan button still reads as an actionable icon button, not merely a lint-adjacent regression | DAC-7 (adjacent) | [ ] |
| Scroll-to-top button | `vc-scroll-top-button.vue` | `text-primary`; appears after scrolling any long page | DAC-3 | [ ] |
| CMS/content widget accordion caret | `vc-widget.vue` | `text-primary`, rotates 180° on expand; used on Homepage, CMS pages, category description widgets | DAC-3, DAC-7 | [ ] |
| Infinite-scroll loader spinner/icon | `vc-infinity-scroll-loader.vue` | `text-primary`; triggers on any paginated grid (catalog listing, search results, wishlists) | DAC-3 | [ ] |
| Dropdown/select chevron | `vc-select.vue` | enabled `text-neutral-900`, disabled `text-neutral-400`, readonly variant unchanged; used in every `<select>`-style control site-wide (filters, forms, payment/shipping pickers) | DAC-3 | [ ] |

## 2. Homepage (`/`)

Auth: G + B2B · Viewports: 375/1280

| Icon / element | File | Expected | DAC | Check |
|---|---|---|---|---|
| Main-banner key-feature bullets (×3) | `login-form-section.vue` | **VcIcon `circle-solid` REMOVED** — now a plain `<span class="size-2 rounded-full bg-primary">` CSS dot, not an icon at all | DAC-7 | [ ] confirm dot still renders same size/color/position as the old icon did (regression, not just variant swap) |
| Homepage content widgets (if any use accordion) | `vc-widget.vue` | see §1 | DAC-3 | [ ] |

## 3. Catalog listing / category / search results

Auth: G + B2B · Viewports: 375/768/1280

| Icon / element | File | Expected | DAC | Check |
|---|---|---|---|---|
| Breadcrumb "back to parent category" chevron | `category-selector.vue` | `text-primary`, chevron-left | DAC-3 | [ ] |
| Active filter chips | `active-filter-chips.vue` | lint-only change (unrelated `sonarjs` suppression comment) — **no visual change expected**, sanity-check chip render only | — | [ ] |
| "Add to Compare" icon on product cards | (call site not in diff — glyph via `compare`→`git-compare-arrows` alias, §0) | ⚠️ **known contrast FAIL**: `text-neutral-400` `#a3a3a3` on white = 2.52:1, fails WCAG 1.4.11 (icon is enabled/clickable, not exempt) | DAC-3 | [ ] confirm still 2.52:1 (no incidental fix); do not re-file, already tracked |
| Infinite-scroll loader on results grid | `vc-infinity-scroll-loader.vue` | see §1 | DAC-3 | [ ] |
| Grid/list view toggle (if present) | uses `grid`/`view-grid`→`layout-grid` alias | glyph changed via §0 alias map — confirm still recognizable as a grid-view icon | §0 | [ ] |

## 4. Product Detail Page (PDP)

Auth: G + B2B · Viewports: 375/1280

| Icon / element | File | Expected | DAC | Check |
|---|---|---|---|---|
| "Thanks for feedback" success check (after review submit) | `product-reviews.vue` | `text-success`, `check-circle`, aria-hidden (adjacent visible text) | DAC-3, DAC-6 | [ ] (needs a submitted review — auth) |
| In-cart count badge icon | `count-in-cart.vue` | **`variant="solid"` explicit** — filled cart glyph, not outline | DAC-2 | [ ] |
| In-stock / digital / out-of-stock chip icons | `in-stock.vue` | all 3 (`cloud` digital, `cube` in-stock, `cube` out-of-stock) **`variant="solid"`** | DAC-2 | [ ] |
| Variation table low-stock quantity icon | `variations-table.vue` | `text-danger` | DAC-3 | [ ] (needs a variable product with variations) |
| Vendor rating star | `vendor.vue` | `text-primary`, only if `$cfg.vendor_rating_enabled` | DAC-3 | [ ] |
| Gallery placeholder (broken/missing image) icon | `vc-product-image.vue` | `.vc-icon` inside placeholder badge now `text-neutral-400` | DAC-3 | [ ] (needs a product with a missing/broken image asset) |
| File-upload icon (configurable products, file-driven section) | `vc-file-picker.vue` | `text-accent` | DAC-3 | [ ] (needs a `File-Driven-Cond` configurable product per `@td()`) |
| Configuration option dropdowns | `vc-select.vue` | see §1 | DAC-3 | [ ] |

## 5. Cart (`/cart`)

Auth: G + B2B · Viewports: 375/1280

| Icon / element | File | Expected | DAC | Check |
|---|---|---|---|---|
| In-cart / in-stock chip icons on line items | `count-in-cart.vue`, `in-stock.vue` | see §4 (solid) | DAC-2 | [ ] |
| ⚠️ Occlusion re-check (from `qa-design-vcicon.md`, NOT REACHED in the prior pass) | — | seed an **unavailable/out-of-stock product already in cart** (authenticated) and confirm its status icon/chip doesn't overlap or get clipped by adjacent line-item controls (PROPOSED-BL-UI-007 pattern) | DAC-7 | [ ] |
| Cart trigger badge (header) | see §1 mobile/desktop header rows | — | DAC-3, DAC-5 | [ ] |

## 6. Checkout

Auth: G + B2B · Viewports: 375/1280

| Icon / element | File | Expected | DAC | Check |
|---|---|---|---|---|
| Order summary discount chevron | `order-summary.vue` | `text-primary`, chevron-down/up toggling | DAC-3 | [ ] |
| Address modal: selected checkmark (list + table view) | `select-address-modal.vue` | `text-secondary` (list), `text-success` (table) | DAC-3 | [ ] |
| Address modal: favorite/whishlist icon | `select-address-modal.vue` | `text-accent`, name `whishlist`→`star` alias | DAC-3, §0 | [ ] |
| BOPIS pickup-location map pin | `select-address-map-view.vue` | now imports `icons/solid/cube.svg?raw` directly (bypasses the async resolver — always solid, never outline) | DAC-2, DAC-7 | [ ] confirm map pin still renders (direct raw import, different code path than the rest of VcIcon — most likely to break silently) |
| Credit card display icon | `credit-card.vue` | `text-primary`; disabled state `text-inherit` | DAC-3 | [ ] |
| Skyflow payment: card icon (existing card) | `payment-processing-skyflow.vue` | `text-neutral`, `credit-card` | DAC-3 | [ ] (Skyflow processor only) |
| Skyflow payment: add-new-card icon | `payment-processing-skyflow.vue` | `text-success`, `plus-circle-outlined` | DAC-3 | [ ] |
| Payment/shipping method selects | `vc-select.vue` | see §1 | DAC-3 | [ ] |
| Multistep gate note | — | checkout steps are config-gated (`checkout multistep gate` memory) — confirm which step(s) are reachable on this env before marking N/A | — | [ ] |

## 7. Account — Dashboard (`/account`)

Auth: B2B · Viewport: 1280

| Icon / element | File | Expected | DAC | Check |
|---|---|---|---|---|
| "All orders" link arrow | `dashboard.vue` | `text-primary`, `arrow-right`, size `xs` | DAC-3 | [ ] |
| Order payment page (props reorder only) | `order-payment.vue` | **no visual change** — `defineProps` moved above a comment block, no icon touched; sanity-check page still renders | — | [ ] |

## 8. Account — Orders / Order Detail

Auth: B2B · Viewport: 1280

| Icon / element | File | Expected | DAC | Check |
|---|---|---|---|---|
| Order status chip icon | `order-status.vue` | **structural change**: icon is now a child `<VcIcon variant="solid">` inside `VcChip`, not a `:icon` prop passed to the chip — confirm exactly 1 icon renders (no doubling, no missing), correctly colored per status, positioned before the status text | DAC-2, DAC-8 | [ ] |
| Order-status icon has no explicit `label`/aria — relies on adjacent visible status text for accessible name; confirm that's still true (icon isn't the only content) | `order-status.vue` | aria-hidden (default, no label set) | DAC-6 | [ ] |

## 9. Account — Addresses

Auth: B2B · Viewport: 1280

| Icon / element | File | Expected | DAC | Check |
|---|---|---|---|---|
| Delete address (dropdown menu) | `address-dropdown-menu.vue` | default addr `text-neutral-400`, non-default `text-danger` | DAC-3 | [ ] |
| Edit/select address button | `address-selection.vue` | **icon changed `edit`→`pencil`** | DAC-4 | [ ] |

## 10. Company — Info (`/company/info`)

Auth: B2B (company admin/manager role) · Viewport: 1280

| Icon / element | File | Expected | DAC | Check |
|---|---|---|---|---|
| Address favorite (whishlist/star) toggle | `company/info.vue` | not-favorite `text-neutral-400`, favorite `text-primary` | DAC-3 | [ ] |
| ⚠️ Known contrast FAIL (from `qa-design-vcicon.md`) | same element | resting (not-favorited) state `#a3a3a3` on white ≈ 2.52:1, fails WCAG 1.4.11 (element is enabled/clickable) | DAC-3 | [ ] re-verify ratio unchanged; do not re-file |
| ⚠️ Open item: authenticated wishlist heart re-check (flagged NOT YET DONE in prior pass) | same pattern, wishlist module | confirm the authenticated (non-guest) "not-favorited" state — prior pass only checked the guest/disabled-exempt state | DAC-3 | [ ] |

## 11. Company — Members

Auth: B2B (company admin/manager role) · Viewport: 1280

| Icon / element | File | Expected | DAC | Check |
|---|---|---|---|---|
| Remove member (dropdown menu) | `members-dropdown-menu.vue` | `text-danger`, `delete-2`→`x` alias | DAC-3, §0 | [ ] |
| ⚠️ Open item: 1 icon-only `vc-button--size--xs` lacks an accessible name (12/13 named, per prior pass) | — | re-check while authenticated (prior pass could not confirm — likely pre-existing, not VCST-4400-introduced) | DAC-6 | [ ] |

## 12. Bulk Order

Auth: B2B · Viewport: 1280

| Icon / element | File | Expected | DAC | Check |
|---|---|---|---|---|
| "Add rows" plus icon | `manually.vue` | `text-primary`, `plus`, size `sm` | DAC-3 | [ ] |

## 13. Wishlists

Auth: B2B · Viewport: 1280/375

| Icon / element | File | Expected | DAC | Check |
|---|---|---|---|---|
| "Add new list" plus icon | `add-to-wishlists-modal.vue` | conditional `text-primary` when button enabled | DAC-3 | [ ] |
| Remove wishlist (dropdown menu) | `wishlist-dropdown-menu.vue` | `text-danger`, `delete-2`→`x` alias | DAC-3, §0 | [ ] |
| Shared-list users icon | `wishlist-status.vue` | `text-primary`, `users` icon, size 16 | DAC-3 | [ ] |

## 14. BOPIS / Fulfillment Centers (store selector modal — checkout + PDP "check availability")

Auth: G + B2B · Viewport: 1280/375

| Icon / element | File | Expected | DAC | Check |
|---|---|---|---|---|
| Branch hours/clock icon | `branch-item.vue` | `text-secondary`, `clock`, size 16 | DAC-3 | [ ] |
| Clear-selection icon (list view + mobile floating) | `branches-modal.vue` | `text-primary`, `clear`→`eraser` alias, both instances (×2 in diff) | DAC-3, §0 | [ ] |

---

## Cross-cutting a11y / focus re-checks (carried from `qa-design-vcicon.md`, PASS — spot re-verify only)

- [ ] Keyboard Tab on any icon button shows a visible 2px focus ring (WCAG 2.4.7) — real Tab, not just a programmatic audit (prior pass found the axe-style audit over-reports on disabled/`:focus-visible` states)
- [ ] Icon-only buttons site-wide still expose an accessible name via `aria-label`/adjacent text, except the two known open items above (Company/Members, guest-state wishlist)
- [ ] No new `Failed to load icon: <name>` console errors introduced by the icon-aliases migration (§0)

## Non-visual files in this PR (no manual verification needed, listed for completeness)

`vc-icon.stories.ts`, `vc-icon.test.ts`, `vc-icon.types.d.ts` (size type widened to accept arbitrary CSS length strings), `icons.test.ts`, `images.test.ts`, `css.test.ts`, `scripts/check-icon-parity.ts` (build-time asset-parity check), `package.json`, `tsconfig.node.json`, `vite.config.ts`, `properties.vue` + `useProductVariationProperties.ts` (import-path/lint fixes, unrelated to icon rendering), `settings_data.json` / `theme-config.ts` (declare the `icon_variant` setting, covered functionally by DAC-1).
