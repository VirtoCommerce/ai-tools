# BUG-039-002 — CyberSource: card type icons do not respond to BIN entry (no real-time card brand detection)

**Not a bug! CyberSource does not support card type detection!!!**

**Severity:** Medium (functional/UX gap, no data-loss)
**Suite / Test:** 039 / PAY-CS-014
**Browser:** playwright-chrome (Chromium)
**Environment:** https://vcst-qa-storefront.govirto.com (QA, build 2.48.0-alpha.2324-dev)
**Discovered:** 2026-05-04 during regression run REG-2026-05-04-1527
**Confirmed:** false (preliminary)

## Summary
The card type icon row (Visa, Mastercard, AMEX, etc.) shown beside the CyberSource Card Number iframe is rendered as a static accepted-cards display. It does NOT highlight or visually differentiate the card brand based on the BIN of the digits being entered. This contradicts test PAY-CS-014 which expects: "After first digit, Visa card icon highlights/becomes active... Other card type icons become dimmed or deselected".

## Steps to Reproduce
1. Login to storefront as registered user.
2. Add a product to cart and navigate to `/cart`.
3. Select **Bank card (CyberSource)** as Payment method.
4. Click into the **Card number** iframe field.
5. Begin typing a Visa-BIN card number, e.g. `4622943127013705`.
6. Observe the card type icon row to the right of the Card Number field after the first digit, after 4 digits, and after the full PAN is entered.

## Expected
- After the first Visa digit (`4`), the Visa icon becomes visually active (highlighted, bolded, or otherwise emphasised).
- Other icons (Mastercard, AMEX, etc.) become visually dimmed / de-emphasized.
- Visa icon remains highlighted while a Visa PAN is in the field.

## Actual
- All four card-type icons (Visa, two Mastercard variants, AMEX) render with `opacity: 1`, `filter: none` regardless of the entered card number.
- No DOM/CSS class changes were observed when typing a Visa BIN, an invalid BIN, or no input at all.
- Verified via DOM inspection: each icon has class `vc-image card-labels__item` with no active/inactive state class toggling.

## Evidence
- `reports/regression/REG-2026-05-04-1527/039-evidence/PAY-CS-014-visa-detection.png` — screenshot showing Visa BIN entered, all icons equally bright.
- `reports/regression/REG-2026-05-04-1527/039-evidence/PAY-CS-001-form-filled.png` — same row of icons with valid Visa, no highlight.

## Cross-Layer Checks
- **CONSOLE:** No errors during BIN entry. (Acceptance criterion satisfied for BIN-detection telemetry, but no positive signal observed either.)
- **NETWORK:** No real-time BIN-detection lookup request observed in network requests during typing — confirms the storefront is not implementing any BIN classification UI logic.
- **API:** Order placement still succeeds with Visa card; card brand is determined server-side after tokenization, so the missing UI signal does not block payment.

## Business Rule Reference
- **BL-PAY-001** (general payment input UX): test PAY-CS-014 asserts visual feedback on card brand. Lack of this affordance degrades user confidence and accessibility (no early indication that the entered card is recognized).

## Notes / Suggested next steps
- This may be by design (the storefront accepts all listed brands and lets CyberSource determine the brand at tokenization). If so, the test should be re-classified to assert "all accepted-brand icons are rendered" rather than dynamic highlighting.
- If dynamic detection is desired, add a parent-page BIN classifier (e.g. local card-brand regex) and toggle an `active` class on the matching icon.
- Compare behaviour to Skyflow / Authorize.Net / Datatrans card forms on the same storefront for consistency.
