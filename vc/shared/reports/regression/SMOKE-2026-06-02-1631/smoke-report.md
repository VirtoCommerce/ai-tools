# Smoke Test Report — SMOKE-2026-06-02-1631

## Verdict: GO — safe to deploy

Storefront-only run (`/qa-smoke storefront`). All revenue-flow gates pass; the 2 non-green cases are test-data/account constraints, not storefront defects.

| Field | Value |
|-------|-------|
| Run ID | SMOKE-2026-06-02-1631 |
| Date | 2026-06-02 |
| Environment | vcst-qa (https://vcst-qa-storefront.govirto.com) |
| Platform | 3.1032.0 |
| Theme | vc-theme-b2b-vue 2.50.0 |
| Browser | playwright-chrome |

## Track A — Storefront Results

Gates: SMOKE-CHECKLIST **28/30 in-scope** · SMOKE-CROSS-LAYER all in-scope parity PASS
Counts: **PASS 28 · FAIL 0 · BLOCKED 2 · SKIP 0** (93.3%, 0 failures)

Critical gates — **all PASS**:
- SMK-012 Checkout (delivery+shipping, total math BL-CHK-006) — PASS
- SMK-013 Place Order — PASS → order CO260602-00018, cart cleared, createOrderFromCart 200
- SMK-014 Payment (CyberSource embedded Microform via iframe refs) — PASS
- Cross-layer parity (me/cart/orders 200 & match UI, GA4 single purchase event) — PASS
- SMK-030 BOPIS E2E — PASS → pickup order CO260602-00019 ($0.00 shipping, FFC not delivery addr)

Blocked (test-data, not defects):
- SMK-005 — `ORG_USER_EMAIL` creds stale → `/connect/token` 400. Re-seed.
- SMK-017 — `USER_EMAIL` is org-bound multi-org, not personal → personal-only Addresses N/A. Provision a dedicated personal account or remap.

## Bugs Found

Both Low / cosmetic, no functional impact — not filed:
- OBS_042_001 (Low): `/assets/presets/electro2.json` → 404 on authenticated pages (SMK-026). No layout/interaction impact.
- OBS_042_002 (Low): some homepage catalog product-image URLs → 404, stale refs likely from 2026-05-15 catalog restore (SMK-001). Broken thumbnails only.

## Cleanup awareness
Orders created: CO260602-00018 (delivery $420), CO260602-00019 (BOPIS pickup $186) — both BMW-Group/USER_EMAIL, status "Payment required" (CyberSource sandbox hold, normal).

Evidence: `suite-042-trackA-results.json`, `screenshots/SMK-013-order-confirmation.png`, `screenshots/SMK-030-bopis-order-confirmation.png`, HAR in `test-results/chrome/har/`.
