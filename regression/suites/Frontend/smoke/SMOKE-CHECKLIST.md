# Frontend Smoke Checklist

> **Purpose:** Minimal critical-path gate for storefront deployments. One happy-path check per area — edge/negative paths belong to full regression. Detail lives in the suite; this is the scannable gate.
>
> **Source:** `042-smoke-tests.csv` (SMK-001 – SMK-033) · **Cross-layer parity:** see `SMOKE-CROSS-LAYER-CHECKLIST.md`
> **Data:** `{{FRONT_URL}}`, `{{USER_EMAIL}}`, `{{ORG_USER_EMAIL}}`, `{{MULTI_ORG_USER_EMAIL}}`, `@td(BUYABLE_NO_MIN_QTY.*)`, `@td(ADDR_NY.*)`, `@td(SEARCH_KITCHEN.query)`, `@td(CFG_LAPTOP.url)`, `@td(CFG_RING.url)`. Never hardcode SKUs, prices, or credentials.

## Summary

| # | Area | Items | SMK cases |
|---|------|-------|-----------|
| 1 | Homepage & Global Nav | 3 | SMK-001 |
| 2 | Registration | 2 | SMK-002, SMK-003 |
| 3 | Authentication | 2 | SMK-004, SMK-005 |
| 4 | Search | 2 | SMK-006, SMK-023 |
| 5 | Catalog & PDP | 2 | SMK-007 |
| 6 | Cart & Quantity Stepper | 3 | SMK-008, SMK-010, SMK-011 |
| 7 | Checkout — Delivery | 2 | SMK-012, SMK-013 |
| 8 | Payment | 1 | SMK-014 |
| 9 | Orders | 2 | SMK-016, SMK-033 |
| 10 | Addresses | 1 | SMK-017 |
| 11 | BOPIS (Pickup) | 2 | SMK-024, SMK-030 |
| 12 | Ship-To Header | 1 | SMK-029 |
| 13 | Configurable Products | 4 | SMK-018, SMK-019, SMK-031, SMK-032 |
| 14 | B2B Multi-Org | 2 | SMK-020, SMK-021 |
| 15 | B2B Bulk Order | 1 | SMK-022 |
| 16 | GA4 Tracking | 1 | SMK-015 |
| 17 | Security Regression | 1 | SMK-025 |
| 18 | Storefront Health | 1 | SMK-026 |
| 19 | Selector Regression | 2 | SMK-027, SMK-028 |

---

## 1. Homepage & Global Nav
- [ ] `{{FRONT_URL}}` loads; hero visible above the fold; no JS errors — SMK-001
- [ ] Header shows nav dropdown, cart icon, language selector — SMK-001
- [ ] Hero CTA navigates (no 404); browser-back returns home — SMK-001

## 2. Registration
- [ ] Personal sign-up completes → authenticated, name in header — SMK-002
- [ ] Org sign-up creates org; org name + B2B nav (Quotes, Members) visible — SMK-003

## 3. Authentication
- [ ] Sign-in `{{USER_EMAIL}}`: user button visible; `/account/dashboard` loads — SMK-004
- [ ] Sign-in `{{ORG_USER_EMAIL}}` (B2B): org name in header; `/company/members` no 403; no "Addresses" link — SMK-005

## 4. Search
- [ ] Search `@td(SEARCH_KITCHEN.query)` → ≥1 product card with name + price — SMK-006
- [ ] Search → PDP → add to cart → cart shows product, price matches — SMK-023

## 5. Catalog & PDP
- [ ] `/catalog` → category tile → product → PDP with name, price, stepper — SMK-007
- [ ] PDP breadcrumb visible; price formatted to 2 decimals (BL-PRICE-003) — SMK-007

## 6. Cart & Quantity Stepper
> B2B store: the (+) stepper is the add-to-cart entry point — no separate "Add to Cart" button.
- [ ] (+) once on `@td(BUYABLE_NO_MIN_QTY.slug)` → qty 1, badge 1; (−) disabled at 0 (BL-CART-001) — SMK-008
- [ ] Cart line shows name, image, unit price, qty; line total = price × qty (BL-PRICE-003/008) — SMK-010
- [ ] Remove line → cart empty, subtotal $0.00 (BL-PRICE-008) — SMK-011

## 7. Checkout — Delivery
- [ ] Delivery + `@td(ADDR_NY.*)` + shipping method → cost shown; total = subtotal + shipping + tax (BL-CHK-006) — SMK-012
- [ ] Place order → confirmation "CO[digits]", badge 0, button disabled after click (BL-CROSS-005, BL-ORD-005, BL-CHK-002) — SMK-013

## 8. Payment
- [ ] Payment form at correct step (CyberSource on `/cart`; others `/checkout/payment`); test card submits <30s; order authorized/paid — SMK-014

## 9. Orders
- [ ] `/account/orders` lists latest order; row → detail with items + totals matching confirmation (BL-ORD-005) — SMK-016
- [ ] `/account/orders` status filter: open → select status → click Apply → filtered rows match status; clear → full list restored (BL-ORD-003) — SMK-033

## 10. Addresses
- [ ] Personal: "Addresses" link visible; save `@td(ADDR_NY.*)` → success toast, appears in list; no XSS (VCST-4802) — SMK-017

## 11. BOPIS (Pickup)
- [ ] `/cart` shows Delivery + Pickup; Pickup → location modal ≥1; shipping $0.00 (BL-BOPIS-002) — SMK-024
- [ ] Full BOPIS order → confirmation shows FFC, shipping $0.00; visible in orders (BL-BOPIS-001, BL-CHK-006) — SMK-030

## 12. Ship-To Header
- [ ] "Ship to" control opens picker; save `@td(ADDR_NY.*)` updates label; persists to `/cart` (BL-SHIP-001) — SMK-029

## 13. Configurable Products
- [ ] `@td(CFG_LAPTOP.url)`: Add-to-Cart disabled until required section filled; cart reflects config (BL-CAT-006) — SMK-018
- [ ] Price updates instantly on option switch; 2 decimals (BL-PRICE-003) — SMK-019
- [ ] Guest adds configured `@td(CFG_LAPTOP.url)` (both required sections filled) → signs in → cart merges with configuration intact (BL-CART-008, BL-CART-010) — SMK-031
- [ ] `@td(CFG_RING.url)` with text input: Save for Later → item in saved section with non-blank config detail → Move to cart → config preserved (BL-CART-010, VCST-4205 regression gate) — SMK-032

## 14. B2B Multi-Org
- [ ] `{{MULTI_ORG_USER_EMAIL}}`: org switch changes header + clears badge; no cross-org carryover (BL-B2B-001) — SMK-020
- [ ] `/company/members` no 403 (≥1 member or empty-state); `/company/info` shows org name (BL-B2B-005) — SMK-021

## 15. B2B Bulk Order
- [ ] `/bulk-order` for `{{ORG_USER_EMAIL}}`: pad heading visible; textarea accepts `@td(BUYABLE_NO_MIN_QTY.sku),1`; Add-to-cart enables (BL-B2B-005) — SMK-022

## 16. GA4 Tracking
- [ ] Confirmation: `dataLayer` has exactly 1 `purchase`, `transaction_id` = order number; refresh fires no second event (BL-CROSS-005) — SMK-015

## 17. Security Regression
- [ ] Profile + shipment-address save: no alert(), no unescaped script in DOM, no 5xx (VCST-4803/4804 XSS) — SMK-025

## 18. Storefront Health
- [ ] `/account/dashboard`, `/account/orders`, `/catalog`, `/cart` load; no TypeError/ReferenceError; no 5xx (BL-CROSS-011) — SMK-026

## 19. Selector Regression (PR #2234)
- [ ] Homepage: `top-header` + `language-selector` test-ids present; no deprecated `main-layout.top-header.*` — SMK-027
- [ ] `/sign-in`: `email-input` accessible; error uses `sign-in-error-alert` test-id — SMK-028

---

## GO / NO-GO

| Status | Criteria |
|--------|----------|
| **GO** | All 33 items checked |
| **GO WITH RISK** | ≤2 unchecked in §17–19 (regression-specific); all revenue-flow items (§1–16) pass; risk noted in run report |
| **NO-GO** | Any item in §1–16 fails, or any security regression (§17) fails |
