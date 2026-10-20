# Root cause — VCST-6398 V6

**Symptom:** CLS 0.1015 (> BL-UI-001 limit 0.1) on full load of the Vintage Wedding cake PDP at 1920×1080; 0.0996 at 1280×900.
**Lowest failing layer:** storefront theme vc-frontend-next, render-time layout. All GraphQL 200.

**Mechanism:**
1. GetProduct render pushes the in-viewport footer down 96 px → 0.0141. Pre-existing (simple PDP 0.0356).
2. 20–30 ms after GetProductConfigurations, one shift of 0.0867 with two sources:
   a. footer pushed out of the viewport by the main-column configuration sections, which reserve no space (pre-existing; PR #11's product-configuration.vue changes are ids/collapse only);
   b. Price & delivery `div.vc-widget__footer-container` moved 228 px by `ul.product-configuration-checklist` (212 px + mt-4) inserted above it.
3. Source: PR #11 adds `<ProductConfigurationChecklist v-if="product.isConfigurable">` to `product-price-block.vue`; the checklist root is `<ul v-if="items.length">` with items computed from the async configuration → mounts late, no placeholder. File absent on vc-frontend-next `dev` (404). Ported from vc-frontend #2527 (VCST-6027), same template upstream.

**Contribution (computed, formula checked on shift 1: 0.0142 vs 0.0141 measured):** 2b ≈ 0.0146 at 1920 (≈0.031 at 1280); without it 1920 ≈ 0.0869 → PASS. The checklist pushes an otherwise-passing page over the limit.

**Ruled out:** by design (BL-UI-001 has no async exception); product-specific drift (scales with checklist height); images/fonts (no img shift source; fonts before FCP); flaky (identical to 4 decimals).
**Confidence:** MEDIUM-HIGH (contribution computed, not measured on a build without the checklist).
**Fix routing:** VirtoCommerce/vc-frontend-next · `client-app/shared/catalog/components/configuration/product-configuration-checklist.vue` (+ `product-price-block.vue`): reserve space or render a skeleton while the configuration loads; optionally reserve the configuration-sections area. Upstream vc-frontend likely shares the checklist part (not measured).
**Severity:** Low (P3) — +0.0015 over the limit, 1920 only, peripheral elements; BL-UI-001 is P2-ux and SUSPECT.
**NEW_WITH_MERGE:** yes for the threshold-crossing part; the base footer push pre-exists by source.
