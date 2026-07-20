# VCST-4400 — VcIcon Checklist Execution Results (consolidated)

**Build:** vcst-qa storefront @ theme `2.54.0-pr-2382-100c-100cbb5e` (PR #2382) · **Date:** 2026-07-20
**Checklist:** `vcicon-verification-checklist.md` · **Per-agent detail:** `vcicon-exec-A-browse-account.md` (chrome, org admin) + `vcicon-exec-B-cart-checkout.md` (edge, BuildRight org — isolated)

## Verdict: ✅ PASS — 0 FAIL, 0 broken icons

| | PASS | FAIL | BLOCKED | N/A | ⚠️ known-unchanged |
|---|---|---|---|---|---|
| A — §0–4, 7–13, a11y | 38 | 0 | 4 | 11 | 3 |
| B — §5 cart, §6 checkout, §14 BOPIS (incl. unblock + Skyflow) | 13 | 1 | 0 | 1 | — |
| **Total (after all unblock passes)** | **53** | **1** | **0** | **12** | **3** |

## Unblock follow-up (of the 8 originally BLOCKED → 2 cleared to PASS, 6 remain)
- ✅ **In-cart count badge** → PASS — added a product, "in Cart: 1" chip = **solid** `cart` glyph (no `--outline`, fill set / stroke none), on the product card/listing. `exec-B-count-in-cart-solid.png`.
- ✅ **Address favorite star** → PASS — BuildRight org already had a favorited address; checkout modal shows `lucide-star`, `text-accent` (`whishlist`→`star` alias), 16px. Its contrast = **3.68:1 → PASSES** WCAG 1.4.11 (distinct from the resting not-favorited neutral-400 2.52:1 fail). `exec-B-address-favorite-star.png`.
- ⏸ **Review "thanks" check** → still BLOCKED — the **reviews feature is off** on this store (no `product-reviews.vue` on any PDP, no reviews `$cfg` flag). Needs a store-config change; not a VcIcon defect.
- ✅ **Skyflow existing-card icon** → PASS (after a card was saved) — saved-cards select/row: `credit-card` outline, `text-neutral`. `exec-B-skyflow-saved-cards.png`.
- ✅ **Skyflow add-new-card icon** → PASS — "Add new card" option: `plus-circle-outlined`/`circle-plus`, `text-success` green, 48px. Same screenshot.
- ❌ **credit-card.vue display icon** → **FAIL** — on `/account/saved-credit-cards` the active card icon renders **neutral-900 (dark), not `text-primary`**. Root cause = SCSS scoping bug in `credit-card.vue`: `$disabled` is `""` at the `&__icon` block (reassigned only inside `&--disabled`, not `!global`), so `#{$disabled} &` compiles to an **unconditional** `.credit-card__icon { color: inherit }` that overrides `text-primary` (equal specificity, later in source) → icon inherits the parent `text-neutral-900`. The PR edited these exact lines (`fill-primary→text-primary`, `fill-inherit→text-inherit`) but the scoping bug predates it (same structure with `fill-*`). Fix: scope the disabled rule (e.g. `.credit-card--disabled &` / `&--disabled &`) so `text-inherit` applies only when disabled. `exec-B-creditcard-vue-not-primary.png`.
- ✅ **Review "thanks" check** → PASS — reviews ARE enabled; the widget is **purchase-gated** (`canLeaveFeedback` needs a `Completed` order for the product, `ReviewValidator.OrderExists`). Verified on **Emily** (`test-emily.johnson-20260310@test-agent.com`, who has a Completed Configurable-Hat order): submitted 5★ + comment → "Thanks for feedback" `check-circle` renders **text-success green rgb(62,132,91), 48px, outline, aria-hidden** (DAC-3 + DAC-6). `exec-A-review-thanks-check.png`. (A real pending-moderation review was created on Emily's account.)
- ✅ **Personal `/account/addresses` delete** → PASS — verified on a **personal (non-org) account** (`mutykovaelena@gmail.com`), where the page renders (the earlier redirect was org-user-specific). Delete icon (`delete-2`→`x`) = **text-danger red #de3131**, 20px outline; edit = neutral-600 square-pen. Console clean. *Caveat:* only a non-default address existed, so the **default → text-neutral-400** color variant was not observed (would need a data mutation to expose) — the non-default `text-danger` state is confirmed.

## Highlights
- **§0 icon-alias migration — clean.** `logout→log-out`, `grid/view-grid→layout-grid`, `delete-2→x`, `whishlist→star`, `clear→eraser` all render recognizably across ~15 pages. **No `Failed to load icon` console error anywhere** (all console noise = pre-existing broken-IMAGE 404s; icons are inlined SVG).
- **BOPIS map pin (highest silent-break risk) — PASS.** The direct `icons/solid/cube.svg?raw` import path renders solid white on the primary pin.
- **Occlusion re-check (was NOT REACHED before) — PASS.** Forced a real `.vc-alert--outline-dark--danger` (over-ordered low-stock: qty 9 > stock 5): 8 alerts / **0 overlaps / 0 severe**. No icon covers the alert.
- **Solid overrides / structure:** in-stock chip cube solid; order-status chip = 1 child VcIcon (no doubling); pencil edit icon confirmed (DAC-4); mobile 24px header sizing confirmed (DAC-5); real keyboard-Tab focus ring present (WCAG 2.4.7).

## Known issues (re-verified UNCHANGED — already tracked on the ticket, NOT re-filed)
- **WCAG 1.4.11 contrast 2.52:1** on 3 enabled icons: Add-to-Compare, Company/Info favorite star, **authenticated wishlist heart** — this resolves the prior "authenticated heart" open item (it IS the fail; guest state was disabled-exempt).
- **WCAG 4.1.3** — the cart over-stock message (`.vc-line-item__after`, `role=null`/`aria-live=null`) isn't announced to screen readers. Confirmed **pre-existing**, not a VCST-4400 regression (advisory WARN; already noted in the ticket comment).

## Resolved open items
- §11 Company/Members "1 unnamed icon-only button" → **no gap** (12/12 named; earlier flag was a false positive).

## BLOCKED (8 — all data/scope-gated, NOT defects)
- Cart mutation rows for Agent A (owned by Agent B); personal `/account/addresses` hidden for org users (verified via company-address dropdown instead).
- Address favorite star (no favorited address in BuildRight org); Skyflow existing-card + add-new-card + credit-card display icons (no saved card → those `v-if` branches don't render).

## Env notes
- Checkout is **single-page inline on `/cart`** on this env (no `/checkout/*` steps) — reflected in §6 scope.
- N/A rows (12) are un-triggerable states (vendor rating off, no low-stock variation, no accordion widget, infinite-scroll not triggered, etc.).
