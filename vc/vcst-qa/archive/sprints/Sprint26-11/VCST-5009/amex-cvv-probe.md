# VCST-5009 — Amex CVV-length probe (Skyflow cart form)

Env: vcst-qa @ theme 2.51.0-pr-2308-219ce232 · Chrome · user BMW-Group/SmokeTest RunnerQA · 2026-06-05
Scope: cart-embedded `Bank card (Skyflow)` form; Amex 370000000000002 vs canonical MC 5424000000000015.

## Results per probe

| Probe | Input | Field validation | Place order | Evidence |
|-------|-------|------------------|-------------|----------|
| A Brand detect | Amex 3700… | Masked **3700 000000 00002** (Amex 4-6-5); brand icon switches to Amex; CVV placeholder stays **"111"** (3-digit) | n/a | A-amex-brand-detection.png |
| B1 CVV empty | "" | invalid | disabled | — |
| B2 CVV 1 | "1" | invalid | disabled | — |
| B3 CVV 2 | "12" | invalid | disabled | — |
| **B4 CVV 3 (KEY)** | "123" on Amex | **valid, no error** | **ENABLED** | B4-cvv3-amex.png |
| B5 CVV 4 | "1234" on Amex | valid (`****`) | ENABLED | — |
| **C** submit 3-digit | click Place order | not blocked client-side | order **CO260605-00009** created (Payment required, $188.40) | C-decline-retry-page.png |
| **D** retry 4-digit | Pay now, CVV 1234 | not blocked | **decline → /checkout/payment/failure** | D-payment-failure-4digit.png |
| **E** MC + 4-digit | MC 5424…, CVV "9000" | masked 4-4-4-4; CVV `****` accepted | **ENABLED** (not submitted) | E-mc-4digit-cvv-enabled.png |

## AuthorizePayment payloads (order 906ba54d… / PI260605-00009)
- C (CVV 123): `isSuccess:false` · `"Your transaction was declined: This transaction has been declined. (65);Successful. (I00001);"`
- D (CVV 1234): `isSuccess:false` · **identical** `"...declined. (65)..."`

Both attempts: CVV is tokenized and forwarded to the processor; 3- and 4-digit produce the **same** Authorize.Net code **65**. Correct-format CVV does not change the outcome → the decline is the **vault/processor rejecting the Amex card itself** (known QA Skyflow vault accepts only canonical MC), not a CVV-format rejection.

## Verdict — per-brand CVV validation IS missing (low-severity, filable)
- The Skyflow form applies a **generic length rule** (the `^[0-9]{3,4}$` regex from PR #2308): it accepts a 3-digit CVV on Amex (B4) AND a 4-digit CVV on a 3-digit-CVV brand (E). No per-brand length enforcement in either direction.
- Brand detection works for **display** (Amex 4-6-5 grouping, brand icon) but is **not wired to CVV length** — the CVV placeholder never switches to "1111" for Amex and any 3–4 digit value validates.
- **Impact (low):** an Amex user who typos a 3-digit CVV is NOT warned client-side; they hit a confusing processor decline + a pre-created unpaid order (CO260605-00009) on /checkout/payment/failure. Not a revenue-blocker (correct entries still pass to the processor) but a UX/validation gap that the storefront-set CVV_REGEX could close.
- **Layer / ownership:** storefront config — the regex is set by vc-frontend (PR #2308 `CVV_REGEX`), NOT Skyflow SDK behavior (the SDK does detect brand). Fix is a frontend change to derive CVV length from detected brand (3 for non-Amex, 4 for Amex). **Filable as a low/medium UX-validation bug against vc-frontend.**

## Dangling artifacts
- Unpaid order **CO260605-00009** (id 906ba54d-d8fa-4ab5-8b26-e56e44722c1a), status "Payment required" — could not self-complete (Amex declines on QA vault). Cart cleared.

## Console
Only known-benign noise: Skyflow `postMessage` origin warnings, `electro2.json` 404, one clean WebSocket close. No unexpected errors.
