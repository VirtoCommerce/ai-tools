# BUG: [Configurable products] Configuration checklist mounts late with no reserved space — PDP CLS 0.1015 at 1920 px — Low

## Status: READY_TO_SUBMIT
**Found by:** agent — testing VCST-6398
**Tracker:** not filed (Low, local report only)

**Severity:** Low (P3) · **Type:** Layout stability · **Relationship:** in scope of VCST-6398 (the checklist arrives with this merge) — marginal
**Env:** vcst, guest, playwright-chrome, unthrottled, 2026-10-20 · **Build:** theme vc-frontend-next `3.1.0-pr-11-d67b-d67b0e0a`
**Oracle:** BL-UI-001 (CLS ≤ 0.1 on initial render; rule status SUSPECT)

## Summary
Full load of the Vintage Wedding cake PDP: CLS 0.1015 at 1920×1080 on 3/3 loads (0.0996 at 1280×900, 0/3). 20–30 ms after `GetProductConfigurations` returns, the new `ProductConfigurationChecklist` (212 px + 16 px margin) mounts in Price & delivery and pushes the action-icons row down 228 px; the configuration sections push the footer out of the viewport (pre-existing). The checklist's share (~0.0146, computed) takes an otherwise-passing page (~0.0869) over the limit. Smaller checklists stay under (AGENT-TEST-Wedding-Cake-Cond 0.0623; simple PDP 0.0363).

## Steps to reproduce
Install a `layout-shift` PerformanceObserver, load the configurable PDP cache-busted at 1920×1080 with no input, read CLS.

## Expected / Actual
CLS ≤ 0.1 · 0.1015 (3/3), dominant shift 0.0867 right after GetProductConfigurations.

![1920 price block](../../screenshots/Configurable-PDP-CLS-Checklist-Late-Mount/02-vintage-1920-price-block.png)

## Root Cause Analysis
- PR #11 adds `<ProductConfigurationChecklist v-if="product.isConfigurable">` to `product-price-block.vue`; `product-configuration-checklist.vue` renders `<ul v-if="items.length">` from the async configuration, with no skeleton or reserved height.
- Absent on next `dev`; ported from vc-frontend #2527 (VCST-6027).
- Not measured: Fast 3G, 375/768, a `dev` build.
- Package: `reports/tickets/Sprint26-21/VCST-6398/evidence-V6/`. kb: KB-690403F4.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend-next
- **repoKind:** frontend · **Ownership hint:** platform
- **RCA anchor:** `client-app/shared/catalog/components/configuration/product-configuration-checklist.vue` `<ul v-if="items.length"`
- **Routing confidence:** MEDIUM — reserve the checklist's space or render a skeleton while the configuration loads
