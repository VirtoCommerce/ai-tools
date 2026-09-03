# Storefront display gaps — saved-for-later config, coupon link name, pack messaging `[P3]`

**Env:** vcst-qa storefront @ theme 2.53.0-pr-2368, Platform 3.1043.0
**Summary:** Three minor, independent storefront display/a11y gaps confirmed live 2026-07-14 (triage of REG-2026-07-14-0018): a configured item hides its configuration while in Saved-for-later, the cart "View all coupons" link has no accessible name, and the pack PDP shows no pack-size messaging.

> Note: the loyalty points-history "Redeemed rows unsigned" item originally grouped here is **not a bug** — showing the PTS amount unsigned with direction conveyed by the Type column is by design. MCO-E2E-007's assertion was corrected instead (see 083b).

## Findings (each independently reproducible)

### 1. Saved-for-later hides configuration (CART-070)
- **STR:** Add a configured item (with configuration text, e.g. an engraved ring) to cart → move it to Saved-for-later → view `/cart` compact widget and `/account/saved-for-later`.
- **Expected:** the configuration detail visible (as it is in the active cart line via "Components list").
- **Actual:** while in Saved-for-later, **no configuration detail** shows on either surface (only name + price + Customize/Move-to-cart); it restores correctly on Move-to-cart (no data loss). `screenshots/CART-070-VERIFY-savedforlater-no-config-detail.png`.

### 2. Coupon-widget link has no accessible name (CART-057)
- **STR:** `/cart` → Discount & coupons widget → inspect the "View all coupons & promotions" link.
- **Expected:** an accessible name.
- **Actual:** renders visually but appears in the a11y tree as a bare `link` with only a `/url` (→ `/account/coupons`), no accessible name (WCAG 2.4.4 / 4.1.2). `screenshots/CART-057-VERIFY-view-all-coupons-link-unlabeled.png`.

### 3. No pack-size messaging on PDP (CART-054)
- **STR:** Open a pack-sized product PDP (e.g. `QA-PACK-001`, pack of 6) → use the quantity stepper.
- **Expected:** static "Sold in packs of 6" (or MOQ) messaging explaining the ×6 increment.
- **Actual:** the first "+" correctly jumps 0→6 (mechanics fine) but **no pack/MOQ messaging** appears anywhere on the PDP. `screenshots/CART-054-VERIFY-no-pack-messaging-stepper-6.png`.

## Fix Routing
- **Repo:** `vc-frontend` · **Layer:** storefront (frontend) · **Components:** saved-for-later/wishlist item (request `configurationItems`); coupon-widget link label; pack-size PDP messaging. Three small independent changes — split into separate PRs if preferred.

## Re-verification 2026-08-26 — sub-finding 2 (CART-057) is FIXED; 1 and 3 not re-checked

Backlog triage, Theme `2.56.0-pr-2451-8ba8-8ba8bd04` (draft: `3.1043.0` era), playwright-chrome on `/cart`.

**2. Coupon-widget link has no accessible name — ✅ FIXED.** The link now exposes a proper accessible name;
the a11y tree renders it as `link "View all coupons & promotions" → /account/coupons`, not the bare
`link` + `/url` the draft recorded. WCAG 2.4.4 / 4.1.2 satisfied for this element. (Observed while
verifying the cart-coupons a11y draft in the same session.)

**1. Saved-for-later loses configuration detail — not re-checked** (needs a configured item moved to
saved-for-later). Note the related memory `project_saved_for_later_config_display_not_implemented`: the
configuration display on saved-for-later was never implemented, so this may be a **missing feature rather
than a regression** — worth settling before filing.

**3. No pack-size messaging on PDP — not re-checked.** Independent note from the same session: the PDP for a
normal product rendered **no quantity stepper at all** in the price sidebar, so the PDP add-to-cart surface
may have changed shape since this draft; re-check 3 against the current PDP rather than the draft's screenshot.

This draft bundles three unrelated findings, which is why only one could be cleared. **Consider splitting it**
— finding 2 is done, finding 1 may be by-design, finding 3 needs a fresh look.
