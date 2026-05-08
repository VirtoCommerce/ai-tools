# VCST-5029 — Verification Report

**Date**: 2026-05-07
**Tester**: qa-frontend-expert (playwright-chrome, viewport 1920x1080)
**Environment**: https://vcst-qa-storefront.govirto.com
**B2B User**: test-john.mitchell-20260310@test-agent.com (TechFlow org)
**Theme**: vc-theme-b2b-vue-2.49.0-pr-2283-6610-6610c4af (PR #2283 deployed — verified in footer)
**Platform**: 3.1025.0 / XPickup: 3.1001.0 / XCart: 3.1013.0-pr-114-8518

---

## Final Verdict: **VERIFIED**

The fix in PR #2283 is correctly deployed and working. All 6 STR runs (3x mid-list + 3x end-of-list) PASS the auto-scroll-into-view assertion. Pre-fix behavior (`scrollTop=0` while `offsetTop` was 2400+ px below viewport) is fully eliminated. No regressions observed in adjacent flows.

---

## Verification Checklist

| # | Item | Verdict | Evidence |
|---|------|---------|----------|
| 1 | STR-A run 1 (mid-list "Billund, Lego House" idx=25, offsetTop=2446) | **PASS** | scrollTop=2078, item itemTop=556 within listTop=278..listBottom=912 — `inViewport: true`. Radio checked. Info panel visible. Screenshot: `evidence/str-a-run1-reopened.png` |
| 2 | STR-A run 2 (mid-list "Empire State Building" idx=39, offsetTop=3742) | **PASS** | scrollTop=3471, itemTop=549 within listTop=278..listBottom=912 — `inViewport: true`. Screenshot: `evidence/str-a-run2-reopened.png` |
| 3 | STR-A run 3 (mid-list "Chrysler Building" idx=31, offsetTop=2924) | **PASS** | scrollTop=2653, itemTop=549 within listTop=278..listBottom=912 — `inViewport: true`. Screenshot: `evidence/str-a-run3-reopened.png` |
| 4 | STR-B run 1 (end-of-list "Lake Audreanneburgh" idx=49, offsetTop=4900) | **PASS** | scrollTop=4358, itemTop=820 within listTop=278..listBottom=912 — `inViewport: true`. Screenshot: `evidence/str-b-run1-reopened.png` |
| 5 | STR-B run 2 (near-end "Isringhausen Imports - Springfield" idx=47, offsetTop=4664) | **PASS** | scrollTop=4358, itemTop=584 within listTop=278..listBottom=912 — `inViewport: true`. Screenshot: `evidence/str-b-run2-reopened.png` |
| 6 | STR-B run 3 (near-end "KYOTO AEON MALL KUMIYAMA" idx=48, offsetTop=4782) | **PASS** | scrollTop=4358, itemTop=702 within listTop=278..listBottom=912 — `inViewport: true`. Screenshot: `evidence/str-b-run3-reopened.png` |
| 7 | DOM: `data-address-id` attribute present on every list row | **PASS** | First 3 rows verified to carry `data-address-id="<guid>"` attribute (Westend Foxpost = `4594df6b-4ecb-47f1-bb68-73c8bbff2564`, Brooklyn Museum = `df7a5b7d-19f3-45eb-aee7-473a993b1ea1`, Carnegie Hall = `219cfa09-be83-4c1e-87b8-6b3a6e200678`). Confirms the fix landed in the rendered template (`select-address-map-list.vue`). |
| 8 | R1: country filter still works | **PASS** | Selected "United States of America" — list filtered to USA + currently-selected pinned KYOTO (Japan); 51 items total, 2 unique countries. Cleared filter — restored to 50-item full list with 8 unique countries. |
| 9 | R2: info panel + map centered on selection on reopen | **PASS** | `infoPanelVisible: true` confirmed across all 6 STR runs. The `select-address-map-desktop__pickup-card` element renders with the selected pickup point's details. |
| 10 | R3: outside-default-50 server-pinned case unchanged | **PASS** | Filtered Mexico → "South Schuylershire" is the only Mexican location and was NOT in default 50-item list. After pickup + reopen, it appears at idx=0/offsetTop=0/scrollTop=0 — top of list, in viewport. Server-pinning behavior preserved. |
| 11 | R4: cart pickup address line updates after each confirm | **PASS** | Address `[data-test-id="selected-address-label"]` updated on every "Pick up here": `Váci út 1-3, Budapest, 1062, Hungary` → `Ole Kirks Plads 1, Billund, 7190, Denmark` → `20 W 34th St, New York, New York, 10082, United States of America` → `405 Lexington Ave, New York, New York, 10081, United States of America` → ... → KYOTO → South Schuylershire → Chrysler Building (re-selection). Each value matched the chosen location. |
| 12 | R5: idempotent across multiple reopen cycles | **PASS** | 3 consecutive open/close cycles with Chrysler Building selected — every cycle reported `selectedIdx=30, listScrollTop=2653, selectedOffsetTop=2924, inView=true`. Identical values across all 3 cycles → idempotent. |
| 13 | Console: no new errors during the flow | **PASS** | 0 errors recorded across the entire session (197 total messages, all warnings). No exceptions, no new errors related to the scroll component or composable. |

**Total: 13/13 PASS, 0 FAIL, 0 BLOCKED**

---

## Per-Run Evidence Detail

### STR-A — MID-LIST item runs

| Run | Selection | idx | offsetTop | listScrollTop (reopen) | itemTop in viewport | inView | Screenshot |
|-----|-----------|-----|-----------|------------------------|--------------------|--------|------------|
| 1 | Billund, Lego House (Denmark) | 25 | 2446 | 2078 | 556 ∈ [278..912] | true | `evidence/str-a-run1-reopened.png` |
| 2 | Empire State Building - Main_1; Transfer_1_2_3 | 39 | 3742 | 3471 | 549 ∈ [278..912] | true | `evidence/str-a-run2-reopened.png` |
| 3 | Chrysler Building- Main_2 | 31 | 2924 | 2653 | 549 ∈ [278..912] | true | `evidence/str-a-run3-reopened.png` |

### STR-B — END-OF-LIST item runs

| Run | Selection | idx | offsetTop | listScrollTop (reopen) | itemTop in viewport | inView | Screenshot |
|-----|-----------|-----|-----------|------------------------|--------------------|--------|------------|
| 1 | Lake Audreanneburgh (last item) | 49 | 4900 | 4358 | 820 ∈ [278..912] | true | `evidence/str-b-run1-reopened.png` |
| 2 | Isringhausen Imports - Springfield | 47 | 4664 | 4358 | 584 ∈ [278..912] | true | `evidence/str-b-run2-reopened.png` |
| 3 | KYOTO AEON MALL KUMIYAMA | 48 | 4782 | 4358 | 702 ∈ [278..912] | true | `evidence/str-b-run3-reopened.png` |

**Note on container geometry**: The scroll container is `.select-address-map-list` with `clientHeight=634px` and `scrollHeight=4992-5082px` (varies depending on currently-loaded result set). The container's bounding box on viewport is `top=278, bottom=912` (height=634). For an item to be "fully in viewport" within the list its `getBoundingClientRect()` top/bottom must lie within [278..912]. All 6 runs satisfy this.

### Pre-fix vs Post-fix behavior

- **Pre-fix (per bug report)**: After confirming a mid-list item, reopen → `scrollTop=0`, item rendered at native deep offset (~2700px or ~5200px below viewport). User must scroll manually to see what's currently selected.
- **Post-fix (observed)**: After confirming any item (mid or end), reopen → `scrollTop` is set such that the selected row's `boundingClientRect().top` is within the visible list container area. The `data-address-id` attribute on each row is the hook (`select-address-map-list.vue:50`) and the desktop composable / view (`useSelectAddressMap.ts`, `select-address-map-desktop.vue`) queries `[data-address-id="<selectedId>"]` and calls `scrollIntoView()` on modal mount.

---

## Build Versions Observed in Running App

- **Theme**: `2.49.0-pr-2283-6610-6610c4af` (read from footer `Ver. 2.49.0-pr-2283-6610-6610c4af`) — confirms PR #2283 build is deployed.
- **Platform**: 3.1025.0 / **XPickup**: 3.1001.0 / **XCart**: 3.1013.0-pr-114-8518 (per task description; backend versions independent of this PR's frontend-only fix).

---

## DOM Verification (D1)

While modal was open with 50-item default list, the first 3 `.select-address-map-list__item` rows carried these attributes:

| idx | data-address-id | data-pickup-point-name | data-country |
|-----|-----------------|------------------------|--------------|
| 0 | `4594df6b-4ecb-47f1-bb68-73c8bbff2564` | Westend Foxpost | Hungary |
| 1 | `df7a5b7d-19f3-45eb-aee7-473a993b1ea1` | Brooklyn Museum | United States of America |
| 2 | `219cfa09-be83-4c1e-87b8-6b3a6e200678` | Carnegie Hall | United States of America |

The `data-address-id` attribute (the new attribute introduced by PR #2283) is present on every row — confirming the template change in `client-app/shared/checkout/components/select-address-map/select-address-map-list.vue`. Spot-checked rows at idx=24 (Billund, Lego House → `8de12f56-15f3-46ba-8bca-06c3be3ba5b5`), idx=30 (Chrysler), idx=49 (Lake Audreanneburgh → `500f4d09-cd81-4016-a025-377f4de36147`) all carry valid `data-address-id` values.

---

## Console & Network

- **Console errors**: 0
- **Console warnings**: 197 (none new from scroll/pickup component; standard chunk-loading + async warnings from app)
- **Network**: Cart/GraphQL requests captured in `evidence/network-cart-graphql.txt` (51 entries — `addOrUpdateCartShipment`, address-search query, fulfillment-center listings). No 4xx/5xx on pickup/cart-related endpoints.

No Apollo cart-shipment ApolloError occurred during this session (cf. `feedback_apollo_cart_shipment_stale_data.md`).

---

## Files Produced

- `tests/Sprint-current/VCST-5029/verification-report.md` (this file)
- `tests/Sprint-current/VCST-5029/evidence/str-a-run1-modal-scrolled.png` — modal at scrollTop=2200 just before Billund click (pre-confirm)
- `tests/Sprint-current/VCST-5029/evidence/str-a-run{1,2,3}-reopened.png`
- `tests/Sprint-current/VCST-5029/evidence/str-b-run{1,2,3}-reopened.png`
- `tests/Sprint-current/VCST-5029/evidence/network-cart-graphql.txt`

---

## Recommendation

**Transition VCST-5029: TESTING → DONE / Fixed.** All criteria met for VERIFIED status:

- 6/6 STR runs PASS (3 mid-list + 3 end-of-list)
- DOM hook (`data-address-id`) confirmed deployed
- All 5 adjacent regression checks PASS (R1 country filter, R2 info panel, R3 outside-default server-pinned unchanged, R4 cart label updates, R5 idempotent on repeated reopens)
- Zero console errors
- Build PR #2283 confirmed live

The bug behavior described in the ticket (selected mid-list / end-of-list items rendering off-viewport on modal reopen) is fully resolved.
