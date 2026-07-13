# VCST-5391 Re-Verification — PASS ✅

**Build:** XCart module 3.1026.0-pr-132-5ff9 (PR #132 head, redeployed 2026-07-13) · Platform 3.1043.0 · Theme 2.53.0-pr-2368 · Env vcst-qa
**User:** B2B-store org admin (`test-john.mitchell-20260310@test-agent.com`) · Product: configurable Bike `@td(CFG_BIKE)` / CFG-032 · Browser: playwright-chrome (en-US)

## Verdict: fix confirmed. Both mutations return HTTP 200, `errors[]` EMPTY (0), `configurationItems` populated (never `[null]`), each config item `extendedPrice` non-null with USD currency. 3/3 on every scenario.

## Checklist

| # | Check | Result |
|---|-------|--------|
| 1 | changeCartConfiguredItem `errors[]` EMPTY (3/3) | PASS — 0 errors on all 3 |
| 2 | changeCartConfiguredItem `configurationItems` populated, not `[null]` (3/3) | PASS — 1 config item each |
| 3 | changeCartConfiguredItem config `extendedPrice` non-null + currency (3/3) | PASS — all with USD |
| 4 | moveFromSavedForLater `errors[]` EMPTY (3/3) | PASS — 0 errors on all 3 |
| 5 | moveFromSavedForLater configurationItems populated + extendedPrice non-null (3/3) | PASS — Rear wheel $176 USD each |
| 6 | Line updates in place — same lineItemId, qty preserved, no dup, new price (BL-CART-010) | PASS — see S1 below |
| 7 | Cart total correct for the selected config after edit and move-back | PASS — prices match $350 base + option |
| 8 | No NEW browser console errors (BL-CART-011) | PASS — only pre-existing image 404s |

## Scenario 1 — changeCartConfiguredItem (edit config from cart)
All 3 responses: `errors` count = **0**. Same `lineItemId` `be4b98ed-…211e4` across all runs, qty 1 preserved, single line (no duplicate), listPrice/subTotal reflect the changed option.

| Run | Option → | errors | configurationItems[0] | listPrice / subTotal |
|-----|----------|--------|-----------------------|----------------------|
| 1 | Seat → Engine | 0 | `200CC…Engine Motor` extendedPrice **$225.00 USD** | $575.00 / $575.00 |
| 2 | Engine → Pedals | 0 | `Pedals` extendedPrice **$14.00 USD** | $364.00 / $364.00 |
| 3 | Pedals → Rear wheel | 0 | `Rear wheel…` extendedPrice **$176.00 USD** | $526.00 / $526.00 |

## Scenario 2 — moveFromSavedForLater
Cart returned under `data.moveFromSavedForLater.cart`. Config (Rear wheel) preserved through save→move each time. New lineItemId per move is expected (save-for-later removes then re-adds the line).

| Run | errors | configurationItems[0] | listPrice / subTotal |
|-----|--------|-----------------------|----------------------|
| 1 | 0 | `Rear wheel…` extendedPrice **$176.00 USD** | $526.00 / $526.00 |
| 2 | 0 | `Rear wheel…` extendedPrice **$176.00 USD** | $526.00 / $526.00 |
| 3 | 0 | `Rear wheel…` extendedPrice **$176.00 USD** | $526.00 / $526.00 |

## Console
35 errors observed, ALL image-asset 404s (`…/AGENT-TEST-CFG-*/…-main_md.png`) — pre-existing missing seed thumbnails, baseline before any mutation. No JS exceptions, no GraphQL `errors[]` in any response, no Vue warnings. No new errors introduced by the fix.

## Evidence
- Mutation response bodies: `s1-change-run1..3.json`, `s2-movefrom-run1..3.json` (this folder)
- `screenshots/cart-after-edit.png` — cart after S1 edit (Rear wheel config, $526)
