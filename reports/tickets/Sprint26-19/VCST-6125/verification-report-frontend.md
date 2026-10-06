# VCST-6125 — Frontend verification (storefront UI part of the fix)

**Verdict: PASS (6/6)** · env vcptcore-qa · store `B2B-store` · theme **2.59.0-pr-2476-0abb-0abbf215** (shown in footer) · playwright-chrome, 1920x1080 (+375px spot check) · 2026-10-05

## Setup (xAPI, owner = @td(SR_REP_PRIMARY), org-scoped token, organization_id=@td(ORG_ACME.platform_id))
- createWishlist `AGENT-TEST-6125-FE-ORG-…` (id 38057332-…224e) → addWishlistItem (live-discovered buyable+in-stock product, SKU 5999086456519) → changeWishlist scope `Organization` → `isOwner:true`, scope Organization.
- Request/response log: `screenshots/fe-step0-owner-setup.json`.
- Co-owner: @td(ACME_BUYER), browser login via the `--secrets` key `B2B_USER_PASSWORD` (registered in the lane).

## Checklist
| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Co-owner card menu: no Share, no Remove list (3/3, reload between runs) | **PASS**: menu = `Rename` only, all 3 runs; same at 375px | `fe-01-coowner-card-menu-run1/2/3.png`, `fe-06-coowner-card-menu-375.png` |
| 2 | Co-owner details header: no Share, no Remove list | **PASS**: header = Save changes · Rename · Add all to cart · Buy now | `fe-02-coowner-details-header.png` |
| 3 | Co-owner Rename works, owner unchanged | **PASS**: renamed to `AGENT-TEST-6125-FE-RENAMD`; owner `wishlist(listId)` afterwards: name updated, scope Organization, `sharingSetting.isOwner: true` for the rep | `fe-03a-coowner-rename-dialog.png`, `fe-after-coowner-rename-owner-wishlist.json` |
| 4 | Co-owner item actions still work | **PASS**: qty 1→12 + Save changes → Yes persisted (owner xAPI shows quantity 12); Add to cart → "Successfully added 1", cart badge 12 | `fe-04-coowner-add-to-cart-result.png` |
| 5 | Own (Private, created in UI) list: Share/Rename/Remove offered; Remove works | **PASS**: card menu = Rename · Share · Remove list; details header = Rename · Share; Remove list → Confirm Delete → list gone, still gone after reload | `fe-05a-own-list-card-menu.png`, `fe-05b-own-list-details-header.png`, `fe-05c-own-list-remove-confirm.png`, `fe-05d-own-list-removed-after-reload.png` |
| 6 | No new console errors / failed requests | **PASS**: 0 console errors in the session. Only warning: WebSocket `Connection closed` code 1000 `wasClean:true` (normal close on navigation). All storefront `/graphql` = 200. 3 `ERR_BLOCKED_BY_ORB` on external catalog image hosts (raw.githubusercontent.com logo, thewarrenstockport.co.uk product images). That is catalog-data noise and unrelated to the fix | `fe-network-cart-page.txt` |

RED → GREEN: the pre-fix baseline (`VCST-5707/screenshots/5c-coowner-ui-card-menu.png`, `5c-coowner-ui-details-header.png`) showed the co-owner Rename + Remove list (and Share on the hijacked list). On this build the non-owner sees only Rename on both surfaces.

## Notes (observations, not defects of this fix)
- The Rename/New List dialog limits the name to **25 chars** on the client (`This field must not contain more than 25 characters`). xAPI accepts longer names (setup created a 31-char name), so an API-created list name cannot be saved unchanged from the UI. This is a pre-existing UI/API mismatch. Not filed; raising it for the lead's call.
- The X on a list row is announced as `Remove from cart` (a11y name), but it removes the item from the **list**. This is a pre-existing a11y label issue, outside the scope of this fix. Not filed.
- The GA4 `add_to_cart` event sent `value=48` for 12 × $9.00 (UI price). The event params carry `pr9~ds5`, so the value may be net of a discount. Not investigated, outside the scope of this fix.
- HAR: this lane did not write a HAR for this session (only a stale `test-results/chrome/session-legacy.har` from Aug exists).

## Cleanup
- Org list 38057332-…224e: `removeWishlist` by owner → `true`; owner `wishlists` holds no `*6125*` list. **Done**
- Own Private list `AGENT-TEST-6125-FE-OWN`: removed via UI (part of check 5). **Done**
- ACME_BUYER cart: the 12 × notebook line added in check 4 was removed, "Your cart is empty". **Done**

## KB
`KB-C075BDF9` confirmed (owner menu set) · `KB-EAA7BA2F` disputed (an Organization-scope list owned by someone else DOES appear on a member's /account/lists) · `KB-ACDF81BB` captured (non-owner = Rename only).
