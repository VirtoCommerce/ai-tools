# Cart Mobile Audit Findings — 2026-05-18

**URL:** https://vcst-qa-storefront.govirto.com/cart
**Build:** vc-theme-b2b-vue-2.49.0-pr-2292-f131-f131d346
**Viewport:** 375 × 900 px (devicePixelRatio 2, mobile, touch)
**Browser:** Chrome DevTools MCP
**Theme:** Coffee
**Account:** mutykovaelena@gmail.com

---

### F-CART-006 — Save-for-later bookmark icon visually occludes "product no longer available" alert

| Field | Value |
|-------|-------|
| Invariant | **BL-UI-007 (proposed)** — No interactive control may visually occlude a critical error/warning alert. Closest existing match: BL-UI-004 (content must not be silently hidden), but BL-UI-004 addresses overflow:hidden clipping, not sibling-branch layout overlap. Proposed new slot for business-logic.md Domain 15. |
| Severity | **High** — the alert is the sole visible signal that an item is unavailable; the bookmark occludes the alert's danger icon (leftmost, most salient element). User may miss the warning and attempt Place Order. |
| Selector (alert) | `.vc-alert.vc-alert--outline-dark--danger` inside `.vc-line-item__after > div.flex.flex-col.gap-1` |
| Selector (icon) | `[data-test-id="save-for-later-button"]` inside `.vc-line-item__main > .vc-line-item__img-container > .vc-line-item__img-actions > .cart-item-actions` |
| Bounding rects | alert: `{top:332, left:36, right:339, bottom:362, w:303, h:30}` ; bookmark: `{top:316, left:36, right:68, bottom:348, w:32, h:32}` ; **overlap: true — 32 px wide x 16 px tall** |
| Computed positioning | alert: `position:static, z-index:auto, display:flex, overflow:visible, paddingLeft:7px` ; bookmark: `position:relative, z-index:auto, display:inline-block, top:0, left:0, transform:none` ; `.cart-item-actions` container: `position:static, display:block, z-index:auto` |
| DOM relationship | Both are descendants of `.vc-line-item` (flex-column, `position:relative`, `overflow:visible`). They are in separate sibling branches: bookmark is in `vc-line-item__main > vc-line-item__img-container > vc-line-item__img-actions > cart-item-actions`; alert is in `vc-line-item__after`. The `.vc-line-item__img-actions` block (h:40px) extends below the `__main` block (bottom:324) into the `__after` zone (top:332). Because all containers are `position:static` and `overflow:visible`, the bookmark button (top:316, bottom:348) paints over the alert (top:332, bottom:362) in normal flow — no z-index trickery, just unaccounted height overflow from the img-container subtree. Common ancestor outerHTML excerpt: `<div class="vc-line-item vc-line-item--removable vc-line-item--selected vc-line-item--deleted" data-product-sku="JM-343434554">` |
| User impact | The danger icon within the alert (leftmost child of .vc-alert__icon) is fully occluded by the bookmark button at 375px viewport. User scanning the cart on mobile may not recognise the unavailable-item warning and proceed to Place Order, hitting a server-side error with no visible in-page explanation. |
| Fix suggestion | Root cause: `.vc-line-item__img-actions` renders its children below the product image, causing the `cart-item-actions` div to overflow past `__main` bottom into the `__after` zone. Preferred fix: move the save-for-later button out of `.vc-line-item__img-container` into the `__main` row controls area (alongside the remove x button) so it participates in the normal flex layout. Alternative: ensure `.vc-line-item__main` min-height accounts for image (64px) + img-actions (40px) = 104px, pushing `__after` clear of the img-container overflow. A z-index workaround (raise alert above bookmark) is a painting patch only — it does not resolve the layout collision and should be rejected. |
| Evidence | `BL-UI-OCCLUSION-375px-save-for-later-covers-alert-FAIL.png` ; `BL-UI-OCCLUSION-375px-enabled-line-baseline.png` |
| Proposed invariant | **BL-UI-007**: No interactive control or decorative element may visually occlude a critical error, warning, or validation alert. Threshold: overlap area > 0 px2 between any `.vc-alert--danger` / `.vc-alert--warning` / `[role=alert]` rect and any `button` / `a` / `[role=button]` rect within the same card container = FAIL. |
