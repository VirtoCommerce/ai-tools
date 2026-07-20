# VCST-4400 — VcIcon solid & outline icons — Storefront Test Execution

**Verdict: PASS (8/8 conditions).** No defects attributable to the icon change.
**Env:** vcst-qa storefront @ Theme **2.54.0-pr-2382-100c-100cbb5e** (PR #2382 deployed, confirmed in footer)
**Browser:** playwright-chrome 1920px + 375px mobile · **User:** B2B org admin (Emily Johnson / AGENT-TEST-Org-TechFlow) via real UI login (`/sign-in`)
**Date:** 2026-07-20

## Summary
PR #2382 makes `VcIcon` outline-first by default (theme `icon_variant` default = outline) with explicit `variant="solid"` overrides, and migrates ~25 color classes `fill-*`→`text-*`. Verified across header, catalog, PDP, cart, checkout(cart-inline), account/orders, company members, and mobile. The variant mechanism confirmed at the DOM/computed-style level: **outline** = `.vc-icon--outline` (`fill:none; stroke:currentColor`, viewBox 24×24); **solid** = base `.vc-icon` with no `--outline` modifier (`fill:currentColor; stroke:none`, viewBox 20×20). **Zero broken/empty icons** on every surface checked. Colors resolve correctly via the migrated `text-*` classes (stroke picks up currentColor). Only console noise = pre-existing broken CMS product-image 404s (unrelated).

## Results per condition

| ID | Condition | Verdict | Evidence |
|----|-----------|---------|----------|
| DAC-1 | Default = outline app-wide | **PASS** | Home 178/178, Catalog 176 outline of 192, PDP 83/84, Cart 106/107 render as `--outline` (`fill:none; stroke:*`, 24×24). |
| DAC-2 | Solid overrides stay filled | **PASS** | In-stock chip **cube** solid (green `rgb(62,132,91)`, 20×20, `fill` set) on catalog & PDP; **count-in-cart** badge cube→cart glyph solid (grey, 20×20) after add-to-cart; **order-status** chip icon solid. |
| DAC-3 | fill→text color migration | **PASS** | `text-primary`=red `srgb(0.898,0.129,0.129)`, success chip=green `rgb(62,132,91)`, **`text-danger` Delete** in member menu=red `srgb(0.870,0.192,0.192)`, secondary greys. All via stroke; none black/invisible. |
| DAC-4 | Address-edit = pencil | **PASS** | `[data-test-id="select-address-button"]` icon = Lucide **pencil** (paths `M21.174 6.812a1 1 0 0 0-3.986-3.987…` + `m15 5 4 4`), outline, primary red. Cart shipping-address block. |
| DAC-5 | Mobile sizing ≤500px | **PASS** | 375px header 7 icons (10/14/24px), mobile drawer 56 icons — 0 oversized(>44px), 0 zero-size, no horizontal overflow (scrollW 361<375). Bell + cart badges + chevrons correct. |
| DAC-6 | a11y label / aria-hidden | **PASS (1 minor obs)** | All decorative VcIcons `aria-hidden="true"` (128/128 on members page); icon-only buttons carry accessible names ("Actions","Remove from cart","Toggle search bar","Show/hide password"…). See Obs-2. |
| DAC-7 | No visual regression (broad) | **PASS** | Header/catalog/PDP/cart/orders/members/mobile all render; **0 broken/misaligned/miscolored** icons on any surface. Screenshots 01–12. |
| DAC-8 | Order-status chip structure | **PASS** | "New" chips = `vc-chip--color--success` with exactly **1** child VcIcon (no doubling/missing), solid green dot + label together. |

## Observations (not bugs from this PR)
- **Obs-1 (pre-existing data):** Console 404 / ERR_NAME_NOT_RESOLVED on broken CMS product images across the session — `starmarket-platform.demo` host, `AGENT-TEST-CFG-019`, `QA-PACK-001`, `SN-001`. Missing test-data images; NOT icon-related (icons are inlined SVG, no fetch). No JS exceptions, no failed SVG loads all session.
- **Obs-2 (minor a11y, likely pre-existing):** 1 icon-only grouped button (`vc-button--size--xs`) on Company members lacked an accessible name (12/13 icon-only buttons are named). The VcIcon a11y contract itself is upheld (decorative icons aria-hidden; optional `label` supported). Not attributable to the icon PR; flag to team for a follow-up label if desired.

## Notes
- Checkout address selection is covered via the B2B single-page cart shipping block (pencil edit icon). Order-confirmation "thanks" check-circle not exercised (no live order placed), but the success-green icon family is proven via in-stock chip + order-status chip.
- Exploratory (P2): hover state on remove-from-cart icon stays outline, stroke darkens correctly (no render glitch); VcDialog (Clear cart confirm) close X renders. No anomalies.
- Cleanup: 1 test cart item added during testing was cleared (Clear cart → Yes). No orgs/contacts/accounts created.

## Follow-up: auth-gated a11y/occlusion confirmations (for /qa-design audit)

1. **Wishlist heart contrast (WCAG 1.4.11) — FAIL confirmed.** Logged-in B2B user; resting "not-favorited" **"Add to list" heart** is **ENABLED** on both catalog listing and PDP price-action row: glyph neutral-400 `#a3a3a3` (`srgb 0.639`) on white = **2.52:1** (needs ≥3:1). Identical to the "Add to Compare" `git-compare-arrows` icon (also enabled, 2.52:1). Not a disabled/exempt control → real 1.4.11 FAIL. Active/favorited state uses primary/accent (passes 3:1); not toggled to avoid creating list data. Evidence: `13-wishlist-compare-contrast-catalog.png`.
2. **Company/members unnamed icon-only button — NO gap (retract earlier Obs-2).** Rigorous re-check with full accessible-name computation (aria-label / aria-labelledby / sr-only / `img[alt]`): **12/12 icon-only buttons named** — "Actions"×8, "Barcode scan", "Active" status toggles via `img alt="Active"`, language via `img alt`. The earlier functional-pass flag was a false positive (incomplete name resolution + a transient open-dropdown button). No 4.1.2 acceptance item needed.
3. **/cart occlusion (F-CART-006 / PROPOSED-BL-UI-007) — PASS (no occlusion), with caveat.** Could NOT reproduce the exact "product no longer available" `.vc-alert--danger`/`[role=alert]` state — both Capri-Sun (stock 1378) and MAMMOET SHOT (stock 510) are currently in stock in vcst-qa; that state needs an admin data change (out of scope). Closest UI-reproducible line-item danger state = over-stock ("You can order maximum 510 item(s)"), triggered by setting qty 99999 on MAMMOET SHOT. It renders as a **red-bordered full-width `div.vc-line-item__after`** (1004×30px) on its own row BELOW the product row; line-item action icons (Save-for-later, Remove ×, in-stock chip) sit in the row above → **NO VcIcon overlap (occlusionAudit PASS, 0 overlaps)**. Increase-qty correctly disabled at the cap (validation working). Evidence: `14-cart-overstock-alert.png`.
   - *Caveats to flag:* (a) this over-stock message is NOT in a `CRITICAL_ALERT_SELECTORS` element (`div.vc-line-item__after`, not `.vc-alert--danger`) and is NOT exposed as `[role=alert]`/`aria-live` — a screen reader wouldn't announce it (possible pre-existing a11y gap, unrelated to the icon PR). (b) The genuine unavailable-product occlusion case remains unconfirmed pending a product that renders `.vc-alert--danger`.

## Screenshots
`reports/tickets/Sprint26-14/VCST-4400/screenshots/` — 01 home header · 02 catalog grid · 03 PDP · 04 PDP count-in-cart · 05 cart · 06 my-orders empty · 07 all-orders status chips · 08 company members · 09/10 member action menu · 11 mobile header · 12 mobile drawer.
