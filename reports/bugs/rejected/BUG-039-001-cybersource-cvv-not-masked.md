# BUG-039-001 — CyberSource CVV input is NOT masked (plaintext displayed)
**Not a bug! CyberSource does not support the masking for CVV field!!!!!**

**Severity:** High (PCI security concern)
**Suite / Test:** 039 / PAY-CS-015 (also impacts BL-PAY-001, BL-PAY-002)
**Browser:** playwright-chrome (Chromium)
**Environment:** https://vcst-qa-storefront.govirto.com (QA, build 2.48.0-alpha.2324-dev)
**Discovered:** 2026-05-04 during regression run REG-2026-05-04-1527
**Confirmed:** false (preliminary — pending qa-testing-expert investigation)

## Summary
The CyberSource Microform v2.0.2 Security Code (CVV) iframe field on `/cart` displays the entered CVV in plaintext rather than masking it with dots/asterisks. This contradicts the test expectation in PAY-CS-015 which states: "CVV field displays dots (•••) or asterisks (***) instead of the digits". Real-time masking of CVV fields is a baseline expectation for PCI-aware UIs (shoulder-surfing protection).

## Steps to Reproduce
1. Login to storefront as registered user (e.g., USER_EMAIL from .env).
2. Navigate to `/` and click "Increase quantity" on any in-stock product (e.g., Eddie Bauer Gift Card on home page).
3. Navigate to `/cart`.
4. In Payment details, select **Bank card (CyberSource)** as Payment method.
5. Click into the **Security code** iframe field.
6. Type a 3-digit CVV (e.g., `838` or `123`) — use real keystrokes, not programmatic `fill()`.
7. Observe the field content during and after entry.

## Expected
The CVV field displays masking characters (`•••` / `***`) immediately on each character input. Actual digits should never appear in the rendered UI.

## Actual
The CVV iframe field displays the actual digits in plaintext (e.g., `838`, `123`). Masking is NOT applied — neither during entry nor on focus loss/blur. The placeholder text `•••` (visible when the field is empty) gives the false impression that the field is masked, but as soon as the user types, the digits are visible.

## Evidence
- `reports/regression/REG-2026-05-04-1527/039-evidence/PAY-CS-001-form-filled.png` — initial observation: CVV `838` shown plaintext after Place Order workflow.
- `reports/regression/REG-2026-05-04-1527/039-evidence/PAY-CS-015-cvv-masking-FAIL.png` — focused screenshot of the CVV iframe with `838` plaintext.
- `reports/regression/REG-2026-05-04-1527/039-evidence/PAY-CS-015-real-typing-cvv.png` — re-test using real keystrokes (`pressSequentially`); plaintext `838` reproducible.
- `reports/regression/REG-2026-05-04-1527/039-evidence/PAY-CS-015-cvv-during-entry.png` — `123` plaintext entry confirmation.

## Root cause hypothesis
The CyberSource Microform v2 iframe is initialized with a configuration that does not enforce masked rendering for the `securityCode` field. The Microform `flexConfig.styles.input` block in the iframe URL does not include any mask/font-mask directive. Possible fixes:
1. Pass `type: "password"` (or equivalent CyberSource Microform setting) when constructing the security code field.
2. Use the Microform `flex-mask` style override to render input as `text-security: disc`.
3. Switch to CyberSource Microform v2 `securityCode` field config that masks by default if available in newer SDK.

## Cross-Layer Checks
- **NETWORK:** No raw CVV in any request payload (PAY-SEC-003 PASSES) — tokenization works correctly. The risk is purely UI/shoulder-surfing.
- **CONSOLE:** No JS errors during CVV entry.
- **STORAGE:** CVV not persisted (PAY-SEC-004 PASSES).

## Business Rule Violations
- **BL-PAY-001** (Payment data security): CVV is sensitive cardholder data; UI masking is part of defense-in-depth even when the wire-level data is tokenized.
- **BL-PAY-002** (PCI-DSS): While DSS does not strictly mandate UI masking, mature payment forms universally mask CVV; lack of masking degrades the security posture and customer trust.

## Notes / Suggested next steps
- Verify whether this is a project-side configuration of the Microform initialization OR a CyberSource Microform v2.0.2 default that requires explicit opt-in for masking.
- Compare with Skyflow / Authorize.Net / Datatrans CVV field rendering on the same storefront — if they mask correctly, the gap is CyberSource-specific.
- Add `[STATE] CVV displayed as masked characters at all times` to PAY-CS-015 assertions to make the failure unambiguous in future runs.
