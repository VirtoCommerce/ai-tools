# VCST-5101 Loyalty Mixed Cart — Exploratory SBTM Session

**Env:** vcst-qa @ vc-theme-b2b-vue 2.51.0-pr-2310 (XCart PR #120, Cart PR #188) · store B2B-store · loyalty currency PTS, Mode=Mixed Cart
**Browser:** playwright-firefox · **User:** `@td(LOYALTY_VIP_USER)` (group VIP) · **Charter:** stress boundaries/integrations beyond verified happy paths · detect-and-report only.
**Box:** ~25 min · screenshots in `screenshots/`.

## Counts
**Bugs 1 · Risks 2 · Questions 1 · Observations 4**

## Verdicts by focus area

| # | Focus | Verdict | One-line |
|---|-------|---------|----------|
| 1 | Persistence | **Observation (PASS)** | Reload /cart: both lines + both total blocks survive; PTS currency intact; server-side cart persists; no console errors. |
| 2 | Guest→sign-in merge | **Observation (PASS)** | Guest USD item merged into VIP cart on sign-in; PTS line added after; both currencies preserved, correctly bucketed. |
| 3 | Checkout w/ mixed cart | **Observation (designed, PASS)** | Mixed cart is **NOT blocked** at checkout — with address + delivery + payment selected, **"Place order" enables**. PTS line is not excluded/blocked; no error. (Stopped at place-order boundary; no order created.) Evidence: `VCST-5101-checkout-mixed-place-order-enabled.png`. |
| 4 | Promotion/tax invariant | **BUG** (see below) | Auto −20% promo scopes correctly (PTS line discount=0), **but cart-% coupon QA10OFF folds the PTS line's value into the USD discount base (1:1 PTS→USD)**, inflating USD discount. PTS block stays PTS0.00 discount, but USD discount is wrong. |
| 5 | Remove-all-primary | **Observation (PASS)** | Remove only USD line → "Products in PTS" + "Total in PTS" persist; USD block renders $0.00 cleanly; `isDefaultTotalCurrency=true` USD block intact; no break/NaN. Evidence: `VCST-5101-remove-all-primary-pts-only.png`. |
| 6 | Line independence | **BUG-confirming** | Changing **PTS** qty leaves USD line/subtotal unchanged (independent ✓) — but exposes #4: each +PTS80 grows USD discount by exactly $8 (10% of 80). |
| 7 | Configurable exclusion | **Risk + Question** | Configurable add-to-cart **is disabled** in loyalty context (exclusion enforced ✓), BUT configurables are still **browsable in /loyalty-catalog namespace**, PDP shows **USD prices in a PTS catalog**, and configurable cards show **"From PTS0.00"**. Confusing/inconsistent. Evidence: `VCST-5101-configurable-in-loyalty-usd-price-disabled-add.png`. |
| 8 | Empty/edge | **Observation (PASS)** | Clear cart (modal Yes) empties cleanly, no errors. Max-qty/0-price PTS not provoked (out of box). |

## BUG — cart-% coupon includes PTS line value in USD discount base (promotion-engine)

**Severity:** High (violates VCST-5101 Task-1 AC: discount/tax apply to primary-currency lines only). API-confirmed + real-user reproducible.

**STR** (signed in as VIP; mixed cart 1×USD UMIDIGI $155→$124 net, 1×PTS Double Drum Autoclave PTS80):
1. `/cart` → apply coupon **QA10OFF** (10% off cart).
2. Increase the **PTS** line quantity 1→2→3.

**Observed** (USD line constant at qty1 the whole time):

| PTS qty | PTS subtotal | USD Discount | USD Tax | USD Total |
|---------|-------------|-------------|---------|-----------|
| 1 | PTS80 | −$51.40 | +$20.72 | $124.32 |
| 2 | PTS160 | −$59.40 | +$19.12 | $114.72 |
| 3 | PTS240 | −$67.40 | +$17.52 | $105.12 |

Each +PTS80 → USD discount grows by exactly **$8.00** (= 10% × 80). USD subtotal stays $155.

**Root cause (API, `cart-resp-coupon-pts-leak.json`):** at PTS qty3, cart `discounts[]` = `{coupon:"QA10OFF", amount: 36.40 USD}`. 36.40 = 10% × ($124 USD net + 240 PTS treated as USD) = 10% × $364. Per-line `discountTotal`: PTS line = **0 PTS** (correct), USD line = 31 USD (auto promo). But the **coupon** discount base includes the PTS line's monetary amount at 1:1 PTS→USD, and the whole $36.40 lands on the USD bucket. `cartTotals[]` correctly splits USD (`isDefaultTotalCurrency=true`) / PTS, and PTS bucket discount=PTS0.00 — so the value is double-handled: excluded from PTS block, leaked into USD discount.

**Expected:** cart-% coupon discount base = USD lines only ($124 net) → 10% = $12.40, independent of PTS line qty.

Evidence: `VCST-5101-BUG-pts-qty-leaks-usd-discount.png`, `cart-resp-coupon-pts-leak.json`. Note: auto promo (−20% per line) is correct (PTS line=0); only the **cart-subtotal % coupon** is affected.

## Risk — recurring Apollo cache error on every cart mutation
`[ERROR] Apollo error 13: Missing field 'currencyCode' while writing result` fires on **every** addItem/qty cart mutation (decoded args reference `LineItemType` with no `currencyCode`). Fires even on the **guest USD-only** add (pre-PTS), so not exclusively mixed-cart, but directly touches the field the mixed-cart UI buckets on. UI still renders correctly (cache write recovers), so non-blocking — but the cart projection returns LineItems without `currencyCode` to Apollo. Worth a dev look given the feature relies on per-line currency.

## Risk/Question — configurable products in loyalty namespace (Focus #7)
- Configurable PDP reachable under `/loyalty-catalog/products-with-options/configurable-products/configurable-hat` (deep link + recommendations carousel), not 404.
- That PDP shows **USD** section prices ($5/$2/$4) and USD main price ($16/$12.80) — currency did **not** convert to PTS in the loyalty context.
- Configurable cards in PTS context show **"From PTS0.00"** (no PTS base price).
- **Add to cart is disabled** → exclusion from mixed/loyalty cart is enforced at the button (correct; not forced).
- **Question for product:** should configurables surface in /loyalty-catalog at all? Current state (browsable + USD price + "From PTS0.00") is inconsistent with a clean exclusion.

## Observations
- **"Pay with points"** payment method present in the cart payment dropdown alongside bank-card methods + Manual — loyalty-relevant; not exercised this session.
- Loyalty catalog renders 50 PTS products for VIP (route guard allows guest browse too since Mode=Mixed Cart); listing + PDP prices in PTS.
- Mixed-cart display matches LOYF-025 AC: "Products in PTS" heading, separate PTS line group, "Total in PTS" summary block, `cartTotals[]` with USD `isDefaultTotalCurrency=true` + PTS `false`.
- Checkout shipping: Fixed Rate (Ground) added **+$150.00** to the USD block; PTS block has no shipping line.

## Orders created / cleanup
**No order created** (stopped at place-order boundary). Cart **cleared** + **logged out** (teardown done). One AGENT-TEST shipping address (123 Test Ave, New York) created on the VIP user during checkout setup — AGENT-TEST-scoped, sweepable by `/qa-seed-data teardown`.
