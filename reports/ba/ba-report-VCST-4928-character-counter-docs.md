# VCST-4928 — Live Character Counter: User-Facing Documentation

**Feature:** [Frontend] Add live character counter to configurable product Text section inputs
**Build:** vc-theme-b2b-vue 2.47.0-pr-2263-2bf2-2bf2be51 | Platform 3.1019.0
**Parent ticket:** VCST-4806 (MaxLength backend validation)
**QA verdict:** PASS WITH NOTES — 2026-04-20
**Audience:** Shoppers (Section 1), Admins / Merchandisers (Section 2), Dev / Localization / Support (Section 3)

---

## Section 1 — Shopper Help Snippet

> Intended drop-in for the storefront Help Center. Plain language, no technical terms.

### Personalizing products: the character counter

Some products on our store let you add your own text — an engraving, a personal message, a custom label, and so on. When a text field has a character limit, a small counter appears next to it showing how many characters you have used and how many are allowed. It looks like this: **5 / 30**, meaning you have typed 5 characters out of a 30-character maximum.

The counter updates as you type, so you always know where you stand. When you reach the limit, the number turns red — for example, **30 / 30** in red. This is just a visual reminder; it is not an error. The field simply stops accepting new characters at that point, so you cannot accidentally go over the limit.

If you paste a block of text that is longer than the limit, the field accepts only as many characters as are allowed and ignores the rest. The counter will then show the maximum in red straight away.

**Screen reader note:** When you reach the character limit, your screen reader will announce the counter value automatically. You do not need to move focus away from the field to hear the update.

---

## Section 2 — Admin and Merchandiser Guide: Configuring the Character Limit

> For Virto Commerce Admin Panel users who create and edit configurable products.

### What this feature does

The character counter is a storefront UX improvement that builds on the Max Length validation introduced in VCST-4806. When you set a Max Length on a Text-type configuration section, shoppers now see a live `N / M` counter next to the input field as they type, instead of only discovering the limit when they try to submit.

No new admin setting is required — the counter is driven entirely by the existing **Max Length** field you already configure on Text sections.

### Where to set Max Length

1. Go to **Catalog > Products** in the Admin Panel.
2. Open the configurable product you want to edit.
3. In the **Product Configuration** blade, click the **Text**-type section you want to limit (or create a new one).
4. Locate the **Max Length** field in the section detail form.
5. Enter a positive integer (for example, `30`).
6. Click **Save**.

The storefront picks up the new value immediately on the next product page load — no cache clearing is required.

> **Max Length applies only to Text-type sections.** Product, File, and Variation section types do not have this field.

### What happens when Max Length is left blank

If you leave Max Length empty, the storefront falls back to a default limit of **255 characters**. In this case the counter will show `0 / 255` at rest and count up as the shopper types. This is consistent behavior — the shopper always sees a counter and always has a cap, even when you have not explicitly set one.

> If you intentionally want no visible counter, you must seed the section with `null` via the API rather than leaving the field blank in the UI. The UI blank and a null API value both resolve to 255 on the storefront at present. This behavior is documented in VCST-4928 AC4 and is subject to a content-team data decision.

### Recommended limits for common use cases

| Use case | Suggested Max Length | Rationale |
|---|---|---|
| Engraving or monogram | 20 – 30 | Physical engraving machines typically cap at 25 – 30 characters |
| Gift message / greeting card | 80 – 100 | Fits most card formats; keeps fulfillment manageable |
| Custom label / short description | 120 – 150 | Room for a sentence or two |
| Free-form personalization | 255 (default) | Use the default; no need to set anything |

### How to preview the counter on storefront

1. Save the Max Length value on the section.
2. Open the storefront product page in a browser (use the **View on Storefront** link from the product blade if available).
3. Scroll to the configuration section and click on the Text field.
4. Begin typing — the counter `0 / N` should appear and update with each keystroke.
5. Type up to the limit to confirm the red at-cap state.

### Relationship to backend validation

Setting Max Length enables validation at two layers: the storefront counter (VCST-4928, this feature) and the server-side cart validator (VCST-4806, parent feature). The backend error code for a length-exceeded add-to-cart attempt remains `CONFIGURATION_SECTION_CUSTOM_TEXT_MAX_LENGTH_EXCEEDED` — unchanged by this story. If you need to test the backend layer independently, refer to the API reference in the VCST-4806 BA report.

---

## Section 3 — Accessibility and i18n Technical Notes

> For developers, the localization team, and support engineers. Not intended for shoppers or admins.

### Accessibility model (WCAG 2.1 AA)

The counter is implemented in `vc-input-details.vue` using a two-mode ARIA model:

**Always-on association (all states)**

The `<textarea>` (or `<input>`) element carries a permanent `aria-describedby` attribute pointing to the `vc-input-details` wrapper element. This wrapper contains the counter text as a child node (for example, `5 / 30`). Screen readers announce the counter value when the user focuses the input. This satisfies **WCAG 2.1 SC 1.3.1 Info and Relationships** — the character limit is programmatically associated with its control at all times.

Note: `aria-describedby` targets the wrapper (`id="input-N-details"`), not the inner `.vc-input-details__counter` child, which has no `id` of its own. This is an implementation choice, not a defect — the wrapper's text content includes the counter, so the announced value is correct.

**Conditional live region (at-cap state only)**

When the character count reaches the maximum, the BEM modifier `vc-input-details__counter--limit` is applied to the counter element. At the same moment, `role="status"` and `aria-live="polite"` are added to that element. When the user deletes characters and drops below the cap, both attributes are removed.

This conditional pattern satisfies **WCAG 2.1 SC 4.1.3 Status Messages** — the at-cap state is a status message that must be available to assistive technology without requiring focus movement, and `role="status"` with `aria-live="polite"` achieves this. The polite (not assertive) setting avoids interrupting ongoing screen reader announcements.

**WCAG coverage summary**

| Criterion | Level | Status |
|---|---|---|
| 1.3.1 Info and Relationships | A | Pass — `aria-describedby` on input |
| 4.1.3 Status Messages | AA | Pass — `role="status"` + `aria-live="polite"` at cap |
| 1.4.3 Contrast (Minimum) | AA | **Known issue — see below** |

**Known issue: WCAG 1.4.3 marginal color-contrast fail (tracked separately)**

At the at-cap state, the counter color token resolves to `#de3131` on a `#fafafa` background, producing a contrast ratio of **4.38:1**. The WCAG 2.1 AA minimum for normal-weight text at 10px is **4.5:1**. The shortfall is 0.12:1.

- Axe-core 4.9.1 reports this as a `color-contrast` violation with impact: serious.
- The fix is to darken the at-cap color token — `#c82020` achieves approximately 5.3:1 on `#fafafa`. Alternatively, increasing font-weight to 700 (bold) lowers the threshold to 3:1, at which point 4.38:1 passes, but this changes layout and is not the recommended path.
- Evidence: `tests/Sprint-current/VCST-4928/evidence/a11y/axe-at-cap.json` and `tests/Sprint-current/VCST-4928/evidence/screenshots/CFG-TEXT-COUNTER-006-at-cap-axe-violation.png`
- This finding is filed as a follow-up bug (status: pending user confirmation as of 2026-04-20) and was not treated as a blocker for the functional delivery of VCST-4928.

### i18n notes

The counter format is `N / M` — ASCII numerals with a space-slash-space separator. There are no locale-specific strings in the counter itself. The format does not change across any of the 13 supported locales.

Adjacent UI labels (textbox aria-label, section heading, required message) are fully localized under the `shared.catalog.product_details.product_configuration.*` key namespace. These were verified by QA in French (fr-FR), German (de-DE), and Japanese (ja-JP) as part of AC5. No raw i18n key strings leaked into the UI in any tested locale.

**CJK character counting:** Each BMP (Basic Multilingual Plane) character — including Chinese, Japanese, and Korean ideographs — is counted as one unit. This matches the behavior of the HTML `maxlength` attribute and the backend `string.Length` check in C#. Surrogate-pair characters (outside BMP, U+10000 and above) would be counted as two units by both the frontend and backend; no such edge case was exercised in QA testing.

**Supported locales (all render identically for the counter):** en, de, es, fi, fr, it, ja, no, pl, pt, ru, sv, zh.

### Evidence paths

Full QA evidence for VCST-4928 is at `tests/Sprint-current/VCST-4928/evidence/`. Key files for a11y and i18n work:

- `evidence/a11y/axe-at-rest.json` — axe scan at empty state (0 violations)
- `evidence/a11y/axe-at-cap.json` — axe scan at at-cap state (1 violation: color-contrast)
- `evidence/screenshots/CFG-TEXT-COUNTER-006-at-cap-axe-violation.png` — at-cap state with violation highlighted
- `evidence/screenshots/CFG-TEXT-COUNTER-005-fr-FR-18-30.png` — French locale mid-type
- `evidence/screenshots/CFG-TEXT-COUNTER-005-ja-locale-0-30.png` — Japanese locale empty state
- `ux-a11y-execution-report.md` — full agent execution trace for AC3, AC5, AC6

---

*Document generated from QA execution artifacts — VCST-4928, Sprint 26-08, 2026-04-20.*
*Source PR: vc-frontend #2263 | Theme build: vc-theme-b2b-vue-2.47.0-pr-2263-2bf2-2bf2be51*
