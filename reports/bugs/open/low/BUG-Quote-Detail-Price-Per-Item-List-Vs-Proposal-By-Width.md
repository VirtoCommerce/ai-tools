# BUG: [Quotes] Quote detail "Price per item" shows the list price at desktop width and the proposal price on narrow screens — Low

## Status: READY_TO_SUBMIT
**Found by:** agent — testing VCST-6398
**Tracker:** not filed — overlaps VCST-6375 (same VcLineItem `showPlacedPrice` mechanism on the cart; fix vc-frontend#2588 in review). This is the quote-page follow-up that VCST-6375's comment leaves open.

**Severity:** Low (P3) · **Type:** Functional / display · **Relationship:** found while testing VCST-6398; not introduced by it
**Env:** vcst, playwright-firefox, B2B buyer @td(AGENT_POOL_SLOT_1.b2b_email), 2026-10-20 · **Build:** theme vc-frontend-next `3.1.0-pr-11-d67b-d67b0e0a`
**Oracle:** BL-PRICE-008 violation signal (line total ≠ qty × unit price) · VirtoOZ "Quote Requests" (Ordered = ordering at the proposed prices)

## Summary
On a Proposal-sent quote at 1920 px, "Price per item" shows the list price (349.00 / 189.00) beside line totals computed from the proposal price (628.20 = 2 × 314.10; 510.30 = 3 × 170.10). At 375 px the same label shows 314.10 / 170.10. The page also shows two subtotals (1,138.50 under the lines, 1,265.00 in the summary). `GetQuote` data is correct.

## Steps to reproduce
1. Open a Proposal-sent quote with proposal prices below list (e.g. AGENT-TEST-QTE-ADMIN-RESPONSE) at 1920 px.
2. Compare "Price per item" × quantity with the line total; resize to 375 px.

## Expected
The unit price a buyer approves matches the line total at every width.

## Actual
3/3: wide layout shows the list price, narrow layout the proposal price; totals are always the proposal.

![1920](../../screenshots/Quote-Detail-Price-Per-Item-List-Vs-Proposal-By-Width/01-desktop-1920-price-per-item-list.png)

## Root Cause Analysis
- `client-app/modules/quotes/components/quote-line-items.vue` passes `:actual-price="item.selectedTierPrice?.price"`, `:list-price`, `:total` but no `show-placed-price` / `list-total`.
- `ui-kit/components/molecules/line-item/vc-line-item.vue`: wide column renders `showPlacedPrice ? actualPrice : listPrice`; narrow property `actualPrice || listPrice`. Cart and order lines pass both via `prepareLineItem()`.
- Identical on next `dev` (last change 38fbb592, 2025-10-20) and upstream.
- Once vc-frontend#2588 ships, the narrow slot follows `showPlacedPrice` too, so quotes show the list price everywhere — the open question is whether a quote should show the proposed unit price.
- Package: `reports/tickets/Sprint26-21/VCST-6398/evidence-QUOTE-005/`. kb: KB-563D7FE5, KB-110978AE.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend-next (same code upstream)
- **repoKind:** frontend · **Ownership hint:** platform
- **RCA anchor:** `client-app/modules/quotes/components/quote-line-items.vue` `<VcLineItem` (no `show-placed-price`)
- **Routing confidence:** MEDIUM — depends on the product decision left open by VCST-6375
