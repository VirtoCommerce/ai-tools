# REG-2026-06-05-PAYAN — Authorize.Net AllowCartPayment (VCST-5162) Verification Run

- **Run ID:** REG-2026-06-05-PAYAN  ·  **Date:** 2026-06-05  ·  **Env:** vcst-qa
- **Build:** vc-frontend theme **2.51.0-pr-2309-ba0b** (VCST-5162 PR#2309 branch deployed); Platform `vcst-qa.govirto.com`; Accept.js sandbox `jstest.authorize.net` + `apitest.authorize.net`
- **Browser:** playwright-**edge** (fallback — `playwright-chrome` profile was locked by an orphaned Chromium holding `mcp-chromium-…/lockfile`; could not clear safely without killing the user's Chrome, PowerShell/wmic denied/non-functional). Edge is the project-recommended browser for /cart payment completion.
- **Account:** registered B2B user `SmokeTest RunnerQA` / org BMW-Group. Suite: `Frontend/payment/040-payment-processors.csv` cases PAY-AN-010..019.
- **AN form note:** the inline "Payment card" form on /cart is a **native storefront form** (not js.authorize.net hosted iframes). Accept.js tokenizes on submit. Expiry field masks **MM/YY** (placeholder `MM / YY`) — the `@td(AUTHORIZENET_VISA.expiry)` value `12/2029` is truncated to `12/20` (Dec 2020, expired); the correct live input for Dec 2029 is `12/29`. **Test-data caveat: AUTHORIZENET_VISA.expiry should be MM/YY for this storefront field, not MM/YYYY.**

## Counts

| Verdict | Count | Cases |
|---------|-------|-------|
| PASS | 5 | AN-010, AN-011, AN-013, AN-014, AN-018 |
| PASS (caveat) | 1 | AN-016 |
| FAIL (expected — red by design) | 2 | AN-012, AN-019 |
| BLOCKED | 2 | AN-015, AN-017 |

**Passes:** PAY-AN-010, PAY-AN-011, PAY-AN-013, PAY-AN-014, PAY-AN-018 (+ PAY-AN-016 with caveat).

## Per-case detail

### Failures (both EXPECTED — pre-existing known bug, case asserts the correct/target behavior)

**PAY-AN-012 — Invalid Luhn card rejected by client validation → FAIL (expected).**
- Expected: inline error on card number for Luhn-invalid `1234567890123456`; Place order disabled.
- Actual: **no inline error; Place order ENABLED** with the Luhn-invalid number (all other fields valid). No client-side Luhn validation. Matches BUG-AN-cart-no-client-card-validation (Luhn arm).
- Evidence: `screenshots/PAY-AN-012-luhn-no-error.png`. Did NOT click Place order (would ghost-order).

**PAY-AN-019 — Per-field negative validation → FAIL (expected, NEG-1 only).**
- NEG-1 expired date `01/20`: **no error, Place order ENABLED** (KNOWN bug). Evidence: `screenshots/PAY-AN-019-expired-no-error.png`.
- NEG-2 month `13`: PASS — inline "Provide a valid expiration month"; Place order disabled.
- NEG-3 CVV `12`: PASS — inline "Security code must be at least 3 characters"; Place order disabled.
- NEG-4 CVV `abc`: PASS — non-numeric filtered out → "This field is required"; Place order disabled.
- Recovery: PASS — all errors clear, Place order enables on valid data. No payment/order network call in any state. Validation-only; never clicked Place order.

### Passes

- **PAY-AN-010** — AN method visible without Place-order click; inline card form (number/cardholder/expiry/CVV) renders on /cart on method select; URL stays /cart (no redirect); Place order disabled while empty; Accept.js + AcceptCore.js load from `jstest.authorize.net` (200); no JS errors. allowCartPayment=true confirmed at UI layer by inline render.
- **PAY-AN-011** — AN→Manual switch guard. AN card filled, switched to Manual: AN card form unmounted; **no AN transaction POST** on switch (network still only the 3 Accept.js GETs); Place order created **Manual** order CO260605-00043 (status New, PO `PO-TEST-AN011-20260605`), card NOT charged via AN. No "processor already registered"/TypeError on switch.
- **PAY-AN-013** — Empty → Place order disabled; partial (card only) → disabled; all-filled → enabled. No premature payment call.
- **PAY-AN-014** — Successful cart-embedded charge. Inline form, no redirect, → /checkout/completed, order **CO260605-00044** (status Processing, AN payment method), cart cleared. Accept.js tokenization POST to `apitest.authorize.net/xml/v1/request.api` (200); `AuthorizePayment` GraphQL sends opaque `dataValue` token — **raw PAN `4007000000027` absent** from all storefront /graphql payloads. createOrderFromCart succeeded.
- **PAY-AN-018** — Validation happy path. Valid card → no inline errors, Place order enables; no payment/order network call during fill. Did NOT click Place order.
- **PAY-AN-016 (caveat)** — GA4 purchase. Order **CO260605-00045** created (AN). GA4 `en=purchase` beacon fired with `ep.transaction_id` = order GUID and `epn.value=159` matching cart. Two `g/collect?...en=purchase` hits observed but **byte-identical** (same `_s=11`, `_et`, `tfd`) = GA4 transport retry of ONE logical hit, not an app-level double-fire (a real double-fire shows distinct counters). The dataLayer.push interceptor returned 0 (detached across the SPA view transition to /completed), so the network beacon is the authoritative oracle. No evidence of the component+checkout double-fire regression. Earlier `add_payment_info` beacon carried `ep.payment_type=AuthorizeNetPaymentMethod`.

### Blocked

- **PAY-AN-015** — Accept.js script-load-failure. **BLOCKED**: playwright-edge/chrome MCP has no native URL-block tool, and blocking a CDN `<script>` tag from page JS is not reliably possible (and would be a run-code bypass). Not faked.
- **PAY-AN-017** — Multistep checkout. **BLOCKED per its PRE-CHECK**: navigating to `/checkout/review` with an item in cart **redirected back to /cart** → `checkout_multistep_enabled` is OFF. Cannot run.

## Known-bug persistence verdicts

- **Bug 1 — BUG-AN-cart-no-client-card-validation: PERSISTS.** Both arms confirmed on 2.51.0-pr-2309: Luhn-invalid card (AN-012) and expired date (AN-019 NEG-1) are accepted with no inline error and Place order stays enabled. Month-range (13), short CVV (2-digit), and non-numeric CVV ARE caught (validation present for those) — consistent with the bug being scoped to Luhn + expired-date checks only.
- **Bug 2 — BUG-AN-no-payment-gateway-transaction: PERSISTS.** Successful AN order CO260605-00044 → PaymentIn **#PI260605-00044 status Authorized ($204)** but the PaymentIn **Transactions tab count = 0** (no PaymentGatewayTransaction recorded). Evidence: `screenshots/BUG-AN-no-gateway-transaction-PI260605-00044.png`.

## New observations (NOT filed — verify-before-filing; returned for triage)

- **Cart line-item / payment-method state drift during repeated payment-method switching on a reused cart.** Across AN-018/019/012/013 (single cart) and again in the AN-011/AN-016 carts, the JBL Flip 6 ($119, top of "Recently browsed") appeared in the cart unbidden 3× across separate carts, and once the selected payment method silently reverted Manual→Skyflow after a PO-field keystroke (corrected on re-select). The AN-011 precondition itself warns "cart-resolver appends payment rows on every switch; orphaned rows cause false state." Could not cleanly separate genuine resolver desync from playwright ref-staleness mis-clicks during heavy re-render, so NOT filed — flagged for a second-source manual repro. The AN form-validation and charge results above were each re-verified on fresh carts and are unaffected.

## Orders created / cleaned up

Created: CO260605-00043 (Manual, AN-011), CO260605-00044 (AN, AN-014), CO260605-00045 (AN, AN-016). **All 3 deleted via Admin** (Orders grid → Delete → "yes" confirm; verified absent from grid). No ghost "Payment required" orders were created (validation-only cases never clicked Place order). Storefront cart left empty.

## Cross-layer / environment notes

- VCST-5162 core behavior VERIFIED on the PR build: AN renders inline on /cart, no /checkout/payment redirect, allowCartPayment guard holds on method switch, Accept.js tokenization keeps raw PAN off storefront payloads, successful charge reaches confirmation.
- Console during runs: only benign 404s (`assets/presets/electro2.json`, a product image variant) — no payment-related JS errors.
