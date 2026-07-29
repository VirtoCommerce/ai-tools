# VCST-5344 — Fix Verification — VERIFIED

**Verdict: VERIFIED.** Per-brand CVV validation on the shared Authorize.Net bank-card form works; the STR (Amex + 3-digit CVV) is rejected and *Place order* stays disabled — 3/3 runs. Both positive controls and the Visa mirror case pass. No ghost order created.

> Supersedes the earlier BLOCKED run today (10:56), which stayed a guest — the embedded card form only renders when signed in. This run signed in the B2B user safely via the `--secrets` mechanism (password never seen), unblocking cases A–D.

## Environment
- Local vc-frontend (docker `vc-frontend:local-latest`, image built 2026-07-20) → **theme 2.54.0-pr-2352**, the fix build (PR #2352, commit `8cab3f88`), proxied to the real **vcst-qa** backend, store **B2B-store**.
- Authenticated B2B session. Browser: playwright-chrome. **Authoritative live check:** the per-brand CVV behavior below is present in the running build — it does not exist on `dev`, so the fixed code is confirmed live (image build date matches the `8cab3f88` force-push).

## Baseline (RED) — cited, not re-run
Fix already live on this build, so RED-on-this-build is impossible. Baseline = original `/qa-bug` repro of 2026-06-23 (`reports/bugs/open/BUG-bankcard-authnet-cvv-no-per-brand-validation.md`): Amex + 3-digit CVV valid + Place order enabled; Visa + 4-digit valid + enabled; ghost order CO260623-00011. Screenshots staged as `screenshots/VCST-5344-RED-*`.

## Cases (form-validation level — Place order never clicked)
| # | Card / CVV | Before (RED) | After (GREEN) | Result |
|---|-----------|--------------|---------------|--------|
| A | Amex `370000000000002` / `123` (3-digit) | valid → enabled | error "Security code must be exactly 4 characters" → **Place order disabled** | **PASS** (3/3) |
| B | Amex `370000000000002` / `1234` (4-digit) | — | valid → **Place order enabled** | **PASS** |
| C | Visa `4007000000027` / 4-digit attempt | 4-digit valid → enabled | field **clamps to 3 digits** — 4th digit rejected | **PASS** |
| D | Visa `4007000000027` / `123` (3-digit) | — | valid → **Place order enabled** | **PASS** |

**Brand awareness confirmed:** card grouping (Amex 4-6-5 `3700 0000 0000 002` vs Visa 4-4-4), CVV placeholder (Amex `1111` vs Visa `111`), CVV maxlength (Amex 4, Visa 3) — all switch reactively on card-number entry.

## Regression / side effects
- **No ghost order:** *Place order* never clicked; network shows no `createOrderFromCart`, no Accept.js load. Every `/graphql` POST → 200.
- **Console:** no payment/CVV/card/Accept.js errors. Only benign local-proxy `ws://localhost/graphql` 400 (subscription WS unsupported through the proxy) and catalog-image 404s on the proxied backend.
- **Sibling method:** Skyflow shares the new `cvv-validation.ts` core; its behavior/tests unchanged (per PR #2352 rework).

## Checklist
BF (10/10) pass · Root cause addressed (IIN brand detection drives rule + mask + maxlength + placeholder) · positive controls pass (no over-blocking) · mirror asymmetry closed · BL-CHECKOUT/BL-PAY client-gating preserved.

## Evidence
- `evidence.html` — RED→GREEN before/after page (local; not published — client-typed profile).
- `screenshots/` — RED baselines (`VCST-5344-RED-*`) + GREEN captures (`VCST-5344-GREEN-Case{A,B,CD}-*`).

## Follow-up (non-blocking)
Regression coverage gap per the ticket: add a per-brand CVV case `PAY-AN-0xx` to suite `040b-payment-authorizenet.csv` (analogous to Skyflow's PAY-SKY-015).
