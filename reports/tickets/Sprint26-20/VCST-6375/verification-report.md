# VCST-6375 — Fix verification (vc-frontend PR #2588, 871e7eb5)

**Proposed verdict: VERIFIED_WITH_NOTES** · 2026-10-20 · qa-frontend-expert · lane `playwright-chrome` (Chromium 155)

## Build / env strip

| | PRE-FIX (RED) | FIXED (GREEN) |
|---|---|---|
| Storefront | vcptcore-qa1 storefront (released theme, last-modified 2026-10-19 21:55 GMT) | `http://localhost`, header `X-VC-Local-Theme: fe-f23723b99db0` (confirmed) |
| Backend | vcptcore_qa1 BACK_URL, store B2B-store, USD | same backend (proxied) |
| Account | USER_EMAIL (B2B buyer, AcmeCorp org), password via `--secrets` B2B_USER_PASSWORD | same |
| Cart | `8eba5be8-…` (the cart `/cart` renders for this user, see note N1) | same cart |

## Data that produced `showPlacedPrice=false`

- Non-coupon promotion **QA Category Percent** (`96c74f8e-…`, RewardItemGetOfRel 20%, roundAmountPerItem=false) is active but is **not applied by xCart** on qa1 (evaluate API says valid; captured as KB-BD09051C). Not edited.
- Used coupon **CAT20** → promotion **QA Category Percent Special** (`be7a6e02-…`, RewardItemGetOfRel 20%, roundAmountPerItem=**false**, no category). Applied to the cart via xAPI `addCoupon` with an explicit cartId (data setup only), then removed.
- Lines (identical in both responses, `verify-cart-response-qa1.json` == `verify-cart-response-local.json`):

| Line (sku) | list | sale | placed | showPlacedPrice |
|---|---|---|---|---|
| Gin Tonic Three Cents (DRH-42771013), added | 180.00 | 180.00 | 144.00 | false |
| ABSOLUT BLUE VODKA (LJO-92804653), added | 400.00 | 237.00 | 189.60 | false |
| Fanta Mango Soda (0003420), pre-existing | 89.00 | 89.00 | 71.20 | false |

Totals: subtotal 669.00, discount −264.20, total 404.80.

## RED vs GREEN — visible "Price per item"

| Width (`.vc-line-items`) | Slot | qa1 PRE-FIX | localhost FIXED |
|---|---|---|---|
| 1920 (wide) | `.vc-line-item__price` column | 180.00 / 400.00 / 89.00 (list) | 180.00 / 400.00 / 89.00 (list) |
| 1280 (835px ≤ 896) | property slot | **144.00 / 189.60 / 71.20** (placed) RED | **180.00 / 400.00 / 89.00** (list) GREEN |
| 390 (mobile) | property slot | **144.00 / 189.60 / 71.20** RED | **180.00 / 400.00 / 89.00** GREEN |

Line Total column at every width, both envs: 144.00 (~~180.00~~) / 189.60 (~~400.00~~) / 71.20 (~~89.00~~).

## 3-run tally (localhost, reload between runs)

| Run | 1920 column | 1280 slot | 390 slot | Result |
|---|---|---|---|---|
| 1 | list ×3 | list ×3 | list ×3 | GREEN |
| 2 | list ×3 | list ×3 | list ×3 | GREEN |
| 3 | list ×3 | list ×3 | list ×3 | GREEN |

**3/3 GREEN.** Pre-fix baseline: 1/1 RED.

## Checklist

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Bug reproduced on pre-fix qa1 | PASS (RED) | verify-qa1-cart-1920.png, verify-qa1-cart-1280.png, verify-qa1-cart-390.png |
| 2 | Narrow + mobile show list price (false line), 3/3 | PASS | verify-local-cart-1280.png, verify-local-cart-390.png; runs 2–3 from DOM snapshots |
| 3 | Wide layout unchanged (list, same as qa1) | PASS | verify-local-cart-1920.png vs verify-qa1-cart-1920.png |
| 4 | Line totals + cart totals identical qa1 vs local | PASS | both: 669.00 / −264.20 / 404.80; line totals as above; response excerpts byte-identical |
| 5 | `showPlacedPrice=true` line, narrow slot shows actual | PASS | coupon removed → vodka (list 400, sale 237) narrow slot **237.00** on localhost at 1280: verify-local-cart-1280-showplaced-true.png |
| 6 | Wishlist at 1280 (sale < list) | PASS, side effect confirmed | qa1 **237.00** (verify-qa1-wishlist-1280.png) → localhost **400.00** (verify-local-wishlist-1280.png) |
| 7 | Quote at 1280 | PASS (non-discriminating) | Draft RFQ260916-00001: both lines list = actual = 150.00 so the slot shows 150.00 either way (verify-qa1-quote-1280.png, verify-local-quote-1280.png). No quote with sale < list exists, so this proves no breakage only |
| 8 | No new console errors on /cart | PASS with a note | Both: image ERR_NAME_NOT_RESOLVED (starmarket-platform.demo.govirto.com), WebSocket close warning. Localhost only: 404 `/modules/$(VirtoCommerce.SalesRep)/plugins/vc-frontend/mf-manifest.json`, an unresolved module-plugin URL in the local proxy setup and not related to this diff |
| 9 | Checkout line items at 1280 | N/A | `/checkout` redirects to `/cart` on both builds (single-page checkout). The cart page is the checkout surface, already covered by #2–#4 |

## Side effects / notes

- **Accepted side effect confirmed:** wishlist items with a sale price now show the list price in the narrow slot (and in the wide column, which already did). The buyer no longer sees the sale price for a wishlist item at ≤1280 widths. Product should confirm this is wanted.
- **N1 — out of scope, not filed (no tracker writes):** the buyer has 14 leftover named carts (`AGENT-TEST-6286-*`). `/cart` renders the newest named cart, but `RemoveCartItems` and add-coupon (both sent without cartId) act on the `default` cart. The X/remove button returned HTTP 200 and did nothing, and a coupon typed into "Custom code" landed on the other cart. This happens on both builds and is unrelated to the fix. kb KB-2EDC661F confirmed with a note. A human should decide whether to file it and whether to sweep the 6286 carts.
- QA Category Percent (no coupon) does not apply in xCart on qa1 (KB-BD09051C). The kb entry says not to rely on it for fixtures.

## Data created / removed

| Item | Action | State now |
|---|---|---|
| Heineken 24x33cl, Gin Tonic, ABSOLUT added to cart `8eba5be8` | removed (xAPI with cartId) | cart holds only the pre-existing Fanta ×1, no coupons |
| Gin Tonic added to `default` cart (promo probe) | removed | default cart holds only the pre-existing Epson XP-820 |
| Coupon CAT20 (on default, then on 8eba) | removed from both | no coupons on either cart |
| Wishlist `AGENT-TEST-6375-WL` (`9ad3685f-…`) | deleted | buyer has 0 lists |
| Promotions | read only | unchanged |
| Draft quote RFQ260916-00001 | opened, not saved | unchanged |

kb: confirmed KB-5394491D, KB-EE2FF2C8 (marker VCST-6375), KB-110978AE, KB-2EDC661F; captured KB-BD09051C.
