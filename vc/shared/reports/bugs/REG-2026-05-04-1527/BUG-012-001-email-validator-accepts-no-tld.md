# BUG-012-001: Address-form email validator accepts addresses without a TLD

**Suite:** 012 — Checkout Guest
**Test Case:** CHK-029 (FAIL)
**Severity:** Low
**Priority:** P3
**Type:** Functional — input validation (regex laxity)
**Discovered:** 2026-05-05 during run REG-2026-05-04-1527
**Browser:** Firefox (via playwright-firefox MCP)
**Environment:** vcst-qa-storefront.govirto.com
**Account:** Anonymous / guest session

## Summary

The "New address" modal (opened from the storefront cart "Ship to: Add new address" header link) email validator rejects two of the three invalid-email patterns from CHK-029 but **accepts `user@domain` (no TLD)** without showing any inline error. The CHK-029 step explicitly says "Enter `user@domain` (no TLD), Verify error shown", which is contradicted by the live behavior.

## Steps to Reproduce

1. Open `https://vcst-qa-storefront.govirto.com/cart` as anonymous user (incognito) with at least one item in cart
2. Click `Ship to: Add new address` in the top header → "New address" modal opens
3. In the **Email** field, type `notanemail` and press Tab
   - Expected: `Enter a valid email address, e.g. johndoe@gmail.com` inline error
   - Actual: error shown (PASS)
4. Clear the field. Type `user@` and press Tab
   - Expected: same email-format error
   - Actual: error shown (PASS)
5. Clear the field. Type `user@domain` and press Tab
   - Expected (per CHK-029 step): `Enter a valid email address` error shown
   - **Actual: NO error shown — field accepts `user@domain` without complaint, no red outline, no inline message**

## Expected

The third pattern (no TLD) should trigger the same `Enter a valid email address, e.g. johndoe@gmail.com` inline error per CHK-029 step.

## Actual

`user@domain` is accepted as a valid email. Field renders without a red outline or inline error message.

## Evidence

- `reports/regression/REG-2026-05-04-1527/012-evidence/CHK-019-email-invalid-error.png` — error correctly rendered for `notanemail` (control)
- `reports/regression/REG-2026-05-04-1527/012-evidence/CHK-029-no-tld-accepted.png` — `user@domain` accepted with no error

## Console / Network

- Console errors: 0
- Network 4xx/5xx: 0
- Behavior is purely client-side validation regex.

## Notes / Triage Hints

This is borderline by design — the standard JavaScript email regex (and the HTML5 `type="email"` validator) actually accepts `user@hostname` because RFC 5321/5322 permit hostnames without a TLD (e.g. `root@localhost` is valid). Many production validators behave this way intentionally.

However, the CHK-029 test case explicitly marks `user@domain` as an "invalid pattern" that should be rejected. There is a divergence between:
- **Test specification** — expects rejection
- **Industry-standard behavior** — accepts hostnames without TLD

Recommended action: review CHK-029 spec — either (a) tighten the email validator to require `.<TLD>` after `@`, or (b) update CHK-029 to remove `user@domain` from the rejected-pattern list and document the SMTP-permissive behavior as intentional.

This is not a P0/P1 issue and does not block guest checkout. Filing for tracking only.

**Confirmed:** false (preliminary — defer to qa-testing-expert investigation)
