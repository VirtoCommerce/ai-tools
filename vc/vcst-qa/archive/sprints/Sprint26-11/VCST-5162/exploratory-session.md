# Exploratory Session — VCST-5162 Authorize.Net AllowCartPayment (inline Accept.js card form)

- **Charter (Risk):** Explore the cart-embedded Authorize.Net payment form and its integration boundaries to discover risks NOT covered by scripted cases PAY-AN-010..017.
- **Heuristic:** SFDPOT · **Familiar-Problems oracle:** `vc-bug-catalog.md` (VC-CHECKOUT-*, VC-CART-*)
- **Env:** vcst-qa storefront @ build `2.51.0-pr-2309-ba0b-ba0bcf37` (matches commit ba0bcf37). Theme auto.
- **Browser:** playwright-firefox MCP only · **User:** qa-agent-slot2 ("Agent Firefox", org AGENT-TEST-Org-TechFlow-20260310)
- **Date:** 2026-06-05 · **Time box:** ~20 min explore + 5 adjacent + 5 doc
- **No order placement** (per charter); charge-completion left to the Chrome agent.

## Setup notes
- Found a stray authenticated session (SmokeTest RunnerQA / Contoso) on first load — signed it out and signed in as slot-2 to avoid colliding with parallel agents.
- Cart seeded with 1× Fanta Orange Bottle ($25) via the recently-browsed (+) stepper (VC-CART-006). Delivery = Fixed Rate (Ground); selecting it added +$150 shipping and recalculated tax (correct fixed-rate behavior).
- Six payment methods offered on /cart: **Authorize.Net, CyberSource, Datatrans, Manual, Pay with points, Skyflow.** AN + CyberSource both render an inline "Payment card" form (allowCartPayment); selecting AN renders the form immediately.

## Timeline
1. Sign-out stray session → sign in slot-2 → seed cart (Fanta) → set Fixed Rate Ground.
2. Select AN → inline native card form renders (Card number / Cardholder / Expiry MM/YY / CVV). Place Order gated (disabled) on empty card fields. ✅
3. **Probe 1 — refresh persistence:** fill all 4 fields → refresh /cart.
4. **Probe 2 — cart mutation w/ form filled:** re-fill card# + cardholder → bump Fanta qty to 2.
5. **Probe 3 — coupon w/ form filled:** attempt apply `super` ($30 off) — blocked by Firefox quirk (see Risk R1).
6. **Probe 4 — method-switch matrix:** AN → CyberSource → AN.
7. **Probe 5 — a11y/keyboard:** Tab order through native AN fields.
8. **Probe 6 — mobile 375px:** AN form usability + field interaction.
9. **Probe 7 — Amex grouping** (15-digit number).
10. **Probe 8 — data-abuse:** over-length card#, non-numeric/`<script>`, min-length validation.
11. **Probe 9 — expiry validation:** past date `01/20` vs invalid month `13/29`.
12. Teardown: clear cart (confirm dialog) → sign out.
- **Console: 0 errors** across the entire session (incl. all AN renders, AN↔CyberSource iframe mount/unmount, mutations, validation, mobile). All 15+ warnings are benign noise (GA cookie `expires` overwrite, Firefox OpaqueResponseBlocking on catalog images, preload-not-used, scroll-linked-effect, WebSocket close). No CSP / Accept.js errors.

## Findings

### Bug
_None confirmed._

### Question
- **Q1 — Past (valid-month) expiry does not block Place Order client-side [needs Chrome second-source per VC-EXEC-005].**
  With a valid card# + cardholder + CVV and expiry **`01/20` (Jan 2020, past)**, the AN form shows **no inline error** and **Place Order is ENABLED**. By contrast, an **invalid month `13/29`** *does* error ("Provide a valid expiration month") and re-disables Place Order. So the field validates *month range (1–12)* but apparently **not whether a valid-month date is in the past/expired.** A buyer could submit an expired card and rely on Accept.js/gateway to reject it.
  - Could be by-design (defer expiry-future check to Accept.js tokenization / gateway). Firefox can't complete Place Order (no order placement + Firefox quirk), so this needs the **Chrome agent** to confirm: does clicking Place Order with `01/20` get rejected client-side by Accept.js, or round-trip to the gateway? Do NOT file until confirmed.
  - Evidence: `screenshots/an-past-expiry-placeorder-enabled.png` (Place Order enabled with `01 / 20`).

### Observation
- **O1 — AN form is fully native (no iframe); CyberSource uses cross-origin iframes.** AN renders native `<input>` fields (expiry placeholder `MM / YY`). CyberSource renders Microform **iframes** for Card number + Security code (expiry placeholder `MM / YYYY`). Architecturally distinct — relevant for any shared "card form" assertion.
- **O2 — Refresh clears card fields, keeps method selection (PCI-correct).** After refresh: AN method + Fixed-Rate delivery **persist**; card field values are **cleared**; form re-renders; Place Order re-disabled. Last-selected method persists across reload (saw CyberSource persist after a later switch).
- **O3 — Form survives a cart quantity mutation with values intact.** Bumping Fanta qty 1→2 kept Card# `4111…` + Cardholder `Agent Firefox` in the form (no re-mount/clear); order summary re-synced (subtotal $25→$50, total updated). Good UX. (`screenshots/an-after-qty-bump.png`)
- **O4 — Clean bidirectional method swap, no residual artifacts.** AN→CyberSource→AN: each swap fully re-mounts the form; **AN card data did NOT leak into the CyberSource iframe**; no residual CyberSource iframe after swapping back to AN; 0 console errors throughout.
- **O5 — Mobile 375px fully usable.** All 4 fields stack full-width with visible labels + VISA/MC/Amex brand icons; no overflow/clipping/horizontal-scroll; fields accept input at mobile width. (`screenshots/an-form-mobile-375.png`)
- **O6 — Keyboard a11y OK.** Tab order = Card number → Cardholder → Expiry → CVV; all four reachable; each textbox exposes a matching accessible name (label association resolves in the AT tree).
- **O7 — Input guarding on Card number is solid.** Capped at 19 digits (over-length truncated); non-numeric + `<script>` stripped to digits only (no XSS); too-short triggers "Card number must be at least 12 characters".
- **O8 — Amex 4-4-4-3 grouping (cosmetic).** `378282246310005` renders as `3782 8224 6310 005` (uniform 4-4-4-3) rather than the Amex-canonical 4-6-5; CVV placeholder stays `111` (3-digit) though Amex CVV is 4-digit. Digits intact, tokenization unaffected → cosmetic only. Would need Chrome second-source before any filing. (`screenshots/an-amex-grouping-mobile.png`)

### Risk
- **R1 — Coverage gap (tooling, not product): coupon-apply + payment-method dropdown intermittently time out in playwright-firefox on /cart** (known quirk `feedback_firefox_cart_dropdown_quirk`; CLS=0, element resolved/enabled — stability-check abort). NOT a product bug; not filed. The CyberSource iframe presence worsened the dropdown instability. Workaround that succeeded: clicking the method trigger via a stable CSS selector (`div[aria-label="Payment method"][role="button"]`) instead of aria-ref. **Coupon-apply-with-AN-form-open and full method-switch matrix (incl. Skyflow/Datatrans) should be completed by the Chrome agent.**

## Evidence
Screenshots saved by the Firefox MCP at project root (move to `tests/Sprint26-11/VCST-5162/screenshots/`):
`an-form-after-select.png`, `an-form-filled.png`, `an-after-qty-bump.png`, `an-form-mobile-375.png`, `an-amex-grouping-mobile.png`, `an-past-expiry-placeorder-enabled.png`. HAR under `test-results/firefox/har/`.

## Hand-off to Chrome agent
1. Confirm Q1: Place Order with past expiry `01/20` — client-side Accept.js rejection vs gateway round-trip.
2. Complete method-switch matrix incl. AN↔Skyflow and AN↔Datatrans (residual iframe / console check).
3. Coupon-apply with AN form open + filled — verify form survives and the would-charge total stays in sync.
4. (Low) Amex grouping/CVV-length cosmetic — confirm in Chrome before deciding to file.
