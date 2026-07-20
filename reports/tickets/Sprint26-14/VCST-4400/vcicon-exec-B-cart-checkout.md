# VCST-4400 VcIcon Verification — Exec B (Cart / Checkout / BOPIS)

**Scope:** §5 Cart, §6 Checkout, §14 BOPIS/fulfillment-center store selector.
**Env:** vcst-qa storefront @ theme `2.54.0-pr-2382-100c-100cbb5e` (confirmed live in footer). Browser: **playwright-edge**. Viewports: 1280 + 375.
**Auth/isolation:** logged in via real `/sign-in` UI as `test-carlos.rodriguez-20260310@test-agent.com` (org **AGENT-TEST-Org-BuildRight**) — a distinct B2B org from the default TechFlow/Acme admin, isolating this cart. Password typed via secret NAME (`B2B_USER_PASSWORD`, MCP-redacted). Products/branches resolved via `@td()`/live UI.
**Method:** real-user drive (click/type/select); icon colour/glyph/size/solidity read via read-only `getComputedStyle`/`getBoundingClientRect` (allowlisted). Coffee theme `--color-primary` = `rgb(229,33,33)`.

**Totals (my sections): 9 PASS · 0 FAIL · 4 BLOCKED · 1 N/A.** No FAILs. The highest-risk item — the direct-`cube.svg?raw`-import BOPIS map pin — **PASSES**. No `Failed to load icon` console errors on any page/modal visited (only pre-existing product-image 404s + benign Apollo/lazy-load logs).

> Note: on this env the checkout is **single-page inline on `/cart`** (delivery + shipping/pickup + payment + order summary + Place order all render on `/cart`); there is no separate `/checkout/*` step. §6 items were verified there.

## §5 — Cart (`/cart`)

| Row | Verdict | Evidence |
|---|---|---|
| In-stock chip icon on line items (`in-stock.vue`, solid, DAC-2) | **PASS** | Cart line-item in-stock chip = `span.vc-icon` (NO `--outline`), glyph pathFill `rgb(62,132,91)` green / pathStroke `none` → **solid**, 10px. Solid override intact. |
| In-cart count badge on line items (`count-in-cart.vue`) | **N/A** | The `count-in-cart` "in Cart: N" badge renders on product cards/PDP (observed "in Cart: 1" on the search card), **not** on cart line items — that element is §4 scope. |
| ⚠️ Occlusion re-check (was NOT REACHED before) | **PASS** | Over-ordered the low-stock fixture (`QA-LOW-001`, stock 5 → set qty 9) → over-stock message rendered as a real `div.vc-alert--outline-dark--danger` inside `div.vc-line-item__after` ("You can order maximum 5 item(s)"). `occlusionAudit` (measure-layout): **8 alerts, 0 overlaps, 0 severe** — no control/icon occludes or clips the alert. Screenshot: `exec-B-cart-overstock-alert-occlusion.png`. |
| ↳ alert-semantics of that message | **WARN (known, not a new regression)** | The danger alert has `role=null`, `aria-live=null`, `announced=false` — a screen reader won't announce it (WCAG 4.1.3). This is the exact `.vc-line-item__after` gap already documented in `measure-layout.ts` (advisory; pre-existing pattern, not introduced by VCST-4400). |
| Cart trigger badge (header) | **PASS** | Badge updated live 0→1→2→10→1 as items/qty changed; DAC unaffected. |

## §6 — Checkout (inline on `/cart`)

| Row | Verdict | Evidence |
|---|---|---|
| Order-summary discount chevron (`order-summary.vue`, text-primary, toggles) | **PASS** | After applying coupon `FIXED5` (−$5.00): `lucide-chevron-down`, `vc-icon--size--xs`, colour `rgb(229,33,33)` = **text-primary**, 14px, sits on an interactive `<button>Discount</button>` toggle. |
| Address-modal selected checkmark — list (text-secondary) + table (text-success) | **PASS** | Desktop **table** view: `check-circle` **text-success** `srgb(0.243,0.517,0.357)` 24px. Mobile-375 **list** view: `check-circle` **text-secondary** `rgb(43,126,168)` 20px. Both match `select-address-modal.vue`. |
| Address-modal favorite/whishlist star (text-accent, `whishlist`→`star`) | **BLOCKED** | Data-gated: source `v-if="hasFavoriteAddresses && item.isFavorite"` (desktop, `text-accent` size 16) / mobile warning `VcBadge v-if="item.isFavorite"`. BuildRight org has **no favorited address**, so the star never renders. Needs an address flagged favorite to verify the glyph/colour. |
| **BOPIS pickup map pin** (`select-address-map-view.vue`, direct `icons/solid/cube.svg?raw`) | **PASS** ✅ | Highest-risk / different code path. Renders `<gmp-advanced-marker background="var(--color-primary-500)">` → `<gmp-pin>` → inline `<svg class="select-address-map-view__marker-glyph" viewBox="0 0 20 20">` with glyph **fill white, stroke none (solid)** on a primary-coloured pin, ~23px, one per location + a selected blue marker. Direct raw import works — not blank, not broken, always solid. Screenshot: `exec-B-bopis-map-pins.png`. |
| Credit-card display icon (`credit-card.vue`, text-primary / disabled text-inherit) | **BLOCKED** | Not reachable in the exercised states — selecting Bank card (Skyflow) renders the Skyflow **new-card iframe** (own card field), and `credit-card.vue`'s saved-card display context isn't reached without a saved card. |
| Skyflow existing-card icon (text-neutral, `credit-card`) | **BLOCKED (Skyflow-only, no saved card)** | Skyflow IS a selectable method here, but the saved-cards `VcSelect` (host of this icon) renders only `v-if="skyflowCards?.length"` (source). BuildRight user has none → new-card iframe form shows instead. Needs a pre-saved Skyflow card. |
| Skyflow add-new-card icon (text-success, `plus-circle-outlined`) | **BLOCKED (Skyflow-only, no saved card)** | Same `skyflowCards?.length` gate in the saved-cards select. |
| Payment/shipping method select chevrons (`vc-select.vue`) | **PASS** | "Select a delivery method" + "Select a payment method": `lucide-chevron-down`, `vc-select__icon`, `size--xs`, enabled colour `srgb(0.09)` = text-neutral-900. |
| Multistep-gate note | **INFO** | Single-page checkout inline on `/cart` on this env (no `/checkout/*` step gated). Payment methods offered: Authorize.Net, CyberSource, Datatrans, Manual, Pay with points, Skyflow. |

## §14 — BOPIS / Fulfillment-center store selector

The two §14 icons live in **`branches-modal.vue`** ("Select branch" modal) reached via the catalog **"Available at branches"** filter — NOT the checkout Pickup-point map selector (that separate component uses `lucide-truck` delivery chips + Cancel/Pick-up-here, no clock/eraser).

| Row | Verdict | Evidence |
|---|---|---|
| Branch hours/clock icon (`branch-item.vue`, text-secondary, `clock`, 16) | **PASS** | In "Select branch" modal: `lucide-clock`, colour `srgb(0.42,0.447,0.502)` = **text-secondary**, 16px, outline. 8 instances (one per branch). |
| Clear-selection icon (`branches-modal.vue`, `clear`→`eraser`, text-primary, list + mobile-floating, ×2) | **PASS (both instances)** | Desktop list-view: `lucide-eraser`, `text-primary` `rgb(229,33,33)`, 16px, on the "Clear selection" button (appears once ≥1 branch selected). Mobile-375 floating: `lucide-eraser`, text-primary, 16px, appears with "Selected branches (1)". `clear`→`eraser` alias confirmed. Screenshot: `exec-B-branches-modal-clock-eraser.png`. |

## §0 site-wide (icon-aliases) — spot check within my flows
No `Failed to load icon: <name>` console errors across cart, search, address modal, pickup-map modal, branches modal (desktop + mobile). Aliased/solid names exercised all rendered correct Lucide/solid glyphs: `clear`→eraser, `whishlist`→star (source-confirmed), plus box/truck/banknote/gift/file-text/mouse-pointer-click/ticket-percent/arrow-right/circle-alert/check-circle/trash-2/pencil/bookmark/chevron-down/x — none blank. Solid overrides (in-stock cube, BOPIS map cube) render filled.

## Teardown
Cart cleared via UI ("Clear cart" → Yes → "Your cart is empty"). No orgs/users created. Session isolated to BuildRight org.

## Screenshots (`reports/tickets/Sprint26-14/VCST-4400/screenshots/`)
- `exec-B-cart-overstock-alert-occlusion.png` — over-stock danger alert, no occlusion
- `exec-B-bopis-map-pins.png` — BOPIS map solid cube pins (direct-import path)
- `exec-B-branches-modal-clock-eraser.png` — branch clock + clear-selection eraser
- `exec-B-count-in-cart-solid.png` — count-in-cart solid chip (follow-up #1)
- `exec-B-address-favorite-star.png` — address favorite star text-accent (follow-up #3)

---

## Unblock follow-up (2nd pass — same build/session)

Re-ran the 3 previously-BLOCKED rows. **2 now PASS, 1 remains BLOCKED (store-config).**

| # | Row | Verdict | Evidence |
|---|---|---|---|
| 1 | In-cart count badge (`count-in-cart.vue`, DAC-2 solid cart) | **PASS** ✅ | Added the WH-001 headphones (cart badge→1), revisited its search card → "in Cart: 1" chip icon = `span.vc-icon` (NO `--outline`), 10px, **glyphFill `rgb(115,115,115)` / stroke `none` → solid** cart glyph, colour text-neutral, count matches cart qty (1). Solid `variant` intact. (No `lucide-*` class — solid glyph comes from the solid asset library, same as the in-stock cube.) Screenshot `exec-B-count-in-cart-solid.png`. Note: this chip renders on the product **card/listing**, not the PDP price box. |
| 2 | "Thanks for feedback" success check (`product-reviews.vue`, check-circle text-success, aria-hidden) | **BLOCKED** (feature off) | Product reviews are not enabled/surfaced on this storefront. No reviews section/tab on **any** PDP checked — the AGENT-TEST fixture (WH-001) **and** a real merchandise product (14 K Rhodium ring); `product-reviews.vue` is not rendered and "review" appears nowhere on either PDP, nor in the storefront `$cfg` flag inventory. Reaching the review-submit success state needs the reviews module/flag turned on (a store-config change) — out of scope for a storefront session. Not a VcIcon defect. |
| 3 | Address favorite star (`whishlist`→`star` alias, text-accent) | **PASS** ✅ | The BuildRight org **already has a favorited address** (Company info → Addresses: first row = "Remove from favorite" / `lucide-star`, so `hasFavoriteAddresses` is true — no mutation needed). Opened checkout shipping-address modal (desktop table view) → favorite star renders on the favorited rows: `lucide-star`, class `vc-icon vc-icon--outline me-1.5 text-accent`, **colour `rgb(59,130,246)` = text-accent**, 16px, outline glyph. `whishlist`→`star` alias confirmed (glyph IS `lucide-star`). Screenshot `exec-B-address-favorite-star.png`. **Contrast:** the FAVORITED text-accent star computes **≈3.68:1** on white — **passes** WCAG 1.4.11 non-text (3:1); it is distinct from the known resting *not-favorited* neutral-400 `#a3a3a3` 2.52:1 item (that known FAIL is unchanged and unrelated to the favorited state). Corrects the earlier "BLOCKED — no favorited address" note: the org did have one. No revert needed (nothing was changed). |

Teardown: cart cleared again; no address flag was changed (favorite pre-existed), so nothing to revert. Session still isolated to BuildRight org. No Jira/GitHub writes; checklist file untouched.

### Unblock follow-up 2 — Skyflow saved-card icons (3rd pass)

A Skyflow card is now saved. **Account with the saved card: my own BuildRight session (`test-carlos.rodriguez`)** — no account switch needed. `/account/saved-credit-cards` shows `•••• 1111 · Expires 09/29`, so `skyflowCards?.length` is truthy and the saved-cards `VcSelect` renders on /cart when Bank card (Skyflow) is the payment method. **2 PASS · 1 FAIL (deviation).** No `Failed to load icon` errors (only image 404s + benign Skyflow cross-origin postMessage warnings).

| # | Row | Verdict | Evidence |
|---|---|---|---|
| 1 | Skyflow existing-card icon (`payment-processing-skyflow.vue`, `credit-card`, text-neutral, outline) | **PASS** ✅ | Saved-cards select placeholder AND the saved-card option/selected row render `lucide-credit-card`, class `vc-icon vc-icon--size--xl vc-icon--outline text-neutral`, colour `srgb(0.451,0.451,0.451)` = **text-neutral**, 48px (xl), **outline** (fill:none). Option text "•••• 1111 (09/29)". Screenshot `exec-B-skyflow-saved-cards.png`. |
| 2 | Skyflow add-new-card icon (`plus-circle-outlined`, text-success) | **PASS** ✅ | The "Add new card" option in the saved-cards dropdown renders `lucide-circle-plus` (the `plus-circle-outlined` name resolves to it), class `vc-icon vc-icon--outline size-12 text-success`, colour `srgb(0.243,0.518,0.357)` = **text-success** green, 48px, **outline**. Screenshot `exec-B-skyflow-saved-cards.png`. |
| 3 | Credit-card display icon (`credit-card.vue`, text-primary; disabled=text-inherit) | **FAIL — deviation** ⚠️ | `credit-card.vue` is the account **Saved credit cards** card visual (`shared/account/components/credit-card.vue`), not the Skyflow checkout select. On `/account/saved-credit-cards` the **active** card's icon (`span.vc-icon.vc-icon--outline.credit-card__icon`, `lucide-credit-card`, 24px, outline) computes **`rgb(23,23,23)` neutral-900 — NOT text-primary**. The component SCSS says `.credit-card__icon { @apply size-6 text-primary }` (active) → `text-inherit` (disabled). Root cause: `text-primary` via SCSS `@apply` resolves to the **undefined `--color-primary`** CSS var, so the declaration is invalid and the icon falls back to the inherited `.credit-card` neutral-900. The theme only exposes `--color-primary-500` (`#e52121`) / `-600`; `--color-primary` and `--color-accent` are **empty**. Proof it's the token, not the utility: sibling `.text-primary` elements on the SAME page render correctly red `srgb(0.898,0.129,0.129)` = `#e52121`. Disabled state (`text-inherit`) not reachable — only one active card. Screenshot `exec-B-creditcard-vue-not-primary.png`. **Needs dev confirmation** whether VCST-4400's fill→text migration introduced the reliance on `--color-primary` (a regression) or it predates the PR; the *rendered* result is a non-primary (dark) card icon regardless. |

Follow-up-2 teardown: cart cleared (added headphones + selected the saved card as payment method during the check; no order placed, no card added/removed). Saved card left intact (pre-existing, not mine to remove). Session isolated to BuildRight. No Jira/GitHub writes; checklist untouched.
