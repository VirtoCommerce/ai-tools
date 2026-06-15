# Regression Report — REG-2026-06-15-1845

**Selection:** 040b (Payment — Authorize.Net) · **Date:** 2026-06-15 · **Env:** vcst-qa
**Build:** Platform 3.1037.0 · Theme 2.51.0-pr-2315-3425 · AuthorizeNetPayment 3.1002.0
**Browser:** playwright-edge (firefox avoided — `/cart` payment-dropdown quirk) · **Trigger:** VCST-5162 post-lifecycle verification

## Summary

| Metric | Value |
|--------|-------|
| Active cases run | 11 (PAY-AN-010…020) |
| Passed | 9 |
| Failed | 1 |
| Blocked | 1 |
| Skipped (deprecated) | 9 (PAY-AN-001…009) |
| Active pass rate | 81.8% |

**Quality gate:** PASS WITH FINDINGS — core VCST-5162 cart-inline payment behavior verified; 1 FAIL is a candidate defect needing second-source confirmation (likely known issue), 1 BLOCKED is a test-tooling limitation.

## Passes (9)
PAY-AN-010 (cart-inline render), 011 (method-switch guard — no charge), 013 (empty fields block), 014 (successful cart payment → confirmation), 016 (GA4 purchase fires once), 017 (multistep billing-step survival), 018 (valid fill enables), 019 (expired-date gate — PR #2309 fix), 020 (expiry BVA).

## Failures (1)

| TC | Expected | Actual | Evidence |
|----|----------|--------|----------|
| PAY-AN-012 | Luhn-invalid card → inline error / Place order disabled; no order created | Place order ENABLED with Luhn-invalid `1234567890123456`; click → GA4 `place_order`, **order `c92e2e8f-9a15-4353-a8c7-3706c6d1e08b` created**, redirect to `/checkout/payment`. No `api2.authorize.net` POST (card never tokenized/charged). No purchase event (correct). | `PAY-AN-012-FAIL-luhn-no-client-validation.png` |

## Blocked (1)

| TC | Reason |
|----|--------|
| PAY-AN-015 | Accept.js CDN-block simulation requires request interception (`page.route()` / DevTools URL-block) not available through real-user MCP browser tooling. Needs infra-level simulation. **Test-design limitation, not a product defect** — flag for suite review (mark Semi-Automated or rework). |

## Bugs Found — candidate, NOT filed

**`BUG_040b_001` (candidate, NEEDS VERIFICATION — not filed to JIRA):** AN cart-inline form has no client-side card-number (Luhn) validation; a Luhn-invalid number creates a ghost "Payment required" order via `createOrderFromCart` before tokenization and redirects to `/checkout/payment`.
- **Likely the unfixed tail of the known `BUG-AN-cart-no-client-card-validation`** — PR #2309 fixed the *expiry* gate (PAY-AN-019 PASS) but not card-number Luhn. Dedup against that known issue before filing.
- **Possible test-expectation error:** PAY-AN-012 expects client-side Luhn rejection "on blur"; Authorize.Net validates the number at Accept.js tokenization, not via a form rule. The substantive issue is the *order-created-before-validation* (ghost order), not "no Luhn on blur." Needs a human/second-source determination: product bug vs. test-case correction.
- **Next step:** `/qa-bug` (reproduce + payload capture + dedup) before any JIRA filing. Per `feedback_no_force_disabled_controls` / `feedback_verify_payload_bugs_second_source`, do not file on a single automated run.

## App Insights (run window 18:45–19:23)
Not run — the FAIL is a 200-with-order-created (no 5xx, empty console/network errors), so backend correlation adds nothing here. Run `/qa-monitoring both --since=45` if a payment-authorization signal is wanted.

## Cleanup
Orphan order `c92e2e8f-9a15-4353-a8c7-3706c6d1e08b` (created by the PAY-AN-012 FAIL, unpaid) — **needs cancellation** via admin in the orphan-order sweep. Manual-method order from PAY-AN-011 and sandbox orders from PAY-AN-014/016/017 — confirm cancelled by the runner's teardown.
