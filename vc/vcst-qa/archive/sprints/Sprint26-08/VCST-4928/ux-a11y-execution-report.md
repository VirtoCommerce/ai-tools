# VCST-4928 — UI/UX & Accessibility Execution Report
## CFG-TEXT-COUNTER-003, CFG-TEXT-COUNTER-005, CFG-TEXT-COUNTER-006

**Agent:** ui-ux-expert
**Build:** `vc-theme-b2b-vue-2.47.0-pr-2263-2bf2-2bf2be51`
**Environment:** `https://vcst-qa-storefront.govirto.com`
**Product:** `AGENT-TEST-Config-Engraved-Ring-20260327` (SKU `#AGENT-TEST-RING-TXT-CFG-20260327`)
**URL:** `/products-with-options/configurations/agent-test-config-engraved-ring-20260327`
**Browser:** Chrome DevTools MCP (Chromium)
**Date:** 2026-04-20
**axe-core:** 4.9.1 (CDN injection)

---

## OVERALL VERDICT: CONDITIONAL PASS WITH ONE BUG

| Test Case | AC | Verdict | Severity |
|-----------|----|---------|----------|
| CFG-TEXT-COUNTER-003 | AC3: At-cap visual emphasis + ARIA | PASS | — |
| CFG-TEXT-COUNTER-005 | AC5: i18n counter format (fr/de/ja) | PASS | — |
| CFG-TEXT-COUNTER-006 | AC6: WCAG 2.1 AA axe scan | FAIL | High (WCAG 1.4.3) |

One WCAG violation found: the at-cap counter color `#de3131` on `#fafafa` background yields contrast ratio 4.38:1 — marginally below the 4.5:1 required for normal-weight text at 10px font size (WCAG 1.4.3, Level AA). A bug must be filed.

---

## CFG-TEXT-COUNTER-003 — At-Cap Visual Emphasis + ARIA

**AC3:** When character count reaches the max, apply `vc-input-details__counter--limit` BEM modifier, render counter in `≈ #DE3131` red, conditionally add `role=status` + `aria-live="polite"`. Revert below cap.

### Steps Executed

1. Navigated to product PDP in authenticated state (mutykovaelena@gmail.com)
2. Typed 29 characters into the "Engraving Text" required text field
3. Verified: `vc-input-details__counter--limit` class NOT present; color unchanged (default gray)
4. Typed 1 more character (total 30 = max)
5. Verified: `--limit` class applied; color changed to `#de3131`; `role="status"` + `aria-live="polite"` added
6. Deleted 2 characters (total 28)
7. Verified: `--limit` class removed; color reverted; `role` and `aria-live` removed

### Evidence — DOM Inspection at Cap

```
classList: ['vc-input-details__counter', 'vc-input-details__counter--limit']
computed color: #de3131  (color(srgb 0.870588 0.192157 0.192157))
role: "status"
aria-live: "polite"
```

### Evidence — DOM Inspection Below Cap (29 chars)

```
classList: ['vc-input-details__counter']  // no --limit modifier
role: null
aria-live: null
```

### Evidence — DOM Inspection After Reversion (28 chars)

```
classList: ['vc-input-details__counter']  // --limit removed
role: null
aria-live: null
```

### Note — aria-describedby Implementation

The spec references `aria-describedby` pointing to "the counter element". The actual implementation links the `<textarea>` to the `vc-input-details` wrapper element (id `input-521-details`), not the `.vc-input-details__counter` child (which has no id). The wrapper contains the counter text `N / 30` as a child node. This is functionally equivalent — screen readers announce the wrapper's text content (which includes the counter) when the input is focused. This is an implementation choice, not a bug.

### Screenshots

- `evidence/screenshots/rest-state-baseline.png` — empty state `0 / 30`
- `evidence/a11y/CFG-TEXT-COUNTER-003-at-cap-30-30.png` — at-cap `30 / 30` with red counter and `--limit` class visible

### Assertions

| Assertion | Result |
|-----------|--------|
| `--limit` class absent at 29 chars | PASS |
| `--limit` class present at 30 chars | PASS |
| Computed color `≈ #DE3131` at cap | PASS (actual `#de3131`) |
| `role="status"` added at cap | PASS |
| `aria-live="polite"` added at cap | PASS |
| `--limit` class removed after delete to 28 | PASS |
| `role` and `aria-live` removed after reversion | PASS |

**VERDICT: PASS**

---

## CFG-TEXT-COUNTER-005 — i18n Counter Format (fr / de / ja)

**AC5:** Counter digit format `N / M` renders correctly when UI locale is switched to French, German, or Japanese. No i18n key leakage in counter or adjacent labels. Digits remain ASCII numerals (no locale-specific numeral substitution).

### Method

Locale switching via the in-page language switcher button (header bar). The `?cultureName=` query parameter alone does NOT trigger locale change in this storefront — the language switcher sets a locale cookie and reloads with the `/xx/` URL prefix. This approach was validated by confirming `document.documentElement.lang` matched the expected locale after each switch.

### French (fr-FR)

- URL: `/fr/products-with-options/configurations/agent-test-config-engraved-ring-20260327`
- `document.documentElement.lang` = `fr-FR`
- Counter at rest: `0 / 30`
- Counter mid-type: `18 / 30`
- Textbox aria-label: `"Saisir un texte personnalisé"` — translated
- Section heading: `"CONFIGURER LES PARAMÈTRES"` — translated
- Required message: `"Veuillez sélectionner toutes les options requises pour finaliser votre sélection."` — translated
- i18n key leaks: none detected
- Console errors: none
- Screenshot: `evidence/a11y/CFG-TEXT-COUNTER-005-fr-locale-0-30.png`

### German (de-DE)

- URL: `/de/products-with-options/configurations/agent-test-config-engraved-ring-20260327`
- `document.documentElement.lang` = `de-DE`
- Counter at rest: `0 / 30`
- Textbox aria-label: `"Benutzerdefinierten Text eingeben"` — translated
- Section heading: `"PARAMETER KONFIGURIEREN"` — translated
- Required message: `"Bitte alle erforderlichen Optionen auswählen, um Ihre Auswahl abzuschließen."` — translated
- i18n key leaks: none detected
- Console errors: none

### Japanese (ja-JP)

- URL: `/ja/products-with-options/configurations/agent-test-config-engraved-ring-20260327`
- `document.documentElement.lang` = `ja-JP`
- Counter at rest: `0 / 30` — ASCII digits, ` / ` separator unchanged by locale
- Textbox aria-label: `"カスタムテキストを入力"` — translated
- Section heading: `"パラメータ設定"` — translated
- Required message: `"すべての必須オプションを選択して、完了してください"` — translated
- Language button confirms: `"言語: 日本語 (日本) JA"`
- i18n key leaks: none detected (regex scan of full page text, zero matches)
- Console errors/warnings: none
- Screenshot: `evidence/CFG-TEXT-COUNTER-005-ja-locale-0-30.png`

### Assertions

| Assertion | FR | DE | JA |
|-----------|----|----|-----|
| Counter digits ASCII numerals (`0 / 30`) | PASS | PASS | PASS |
| ` / ` separator unchanged | PASS | PASS | PASS |
| Textbox label translated | PASS | PASS | PASS |
| Section heading translated | PASS | PASS | PASS |
| Required message translated | PASS | PASS | PASS |
| No raw i18n key strings in UI | PASS | PASS | PASS |
| No console errors/warnings | PASS | PASS | PASS |
| ARIA `description="0 / 30"` correct | PASS | PASS | PASS |

**VERDICT: PASS**

---

## CFG-TEXT-COUNTER-006 — WCAG 2.1 AA Accessibility (axe-core)

**AC6:** Automated axe scan reports zero WCAG 2.1 AA violations in two states: at-rest (empty field) and at-cap (30/30). WCAG criteria under focus: 1.3.1 (Info and Relationships), 4.1.3 (Status Messages).

### Method

axe-core 4.9.1 injected via CDN script tag. `axe.run()` executed against the full document with `runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] }`. Results serialized to JSON artifacts.

### State 1 — At-Rest (0 / 30)

- Violations: **0**
- Passes: 19
- Incomplete: 1 (`aria-prohibited-attr` on `vc-widget__slot` — unrelated to counter; affects product recommendations widget wrapper; pre-existing condition)
- WCAG 1.3.1 (Info and Relationships): PASS — counter text is programmatically associated via `aria-describedby` on the input
- WCAG 4.1.3 (Status Messages): PASS — no status message element present at rest (correct: status role is added conditionally)

Artifact: `evidence/a11y/axe-at-rest.json`

### State 2 — At-Cap (30 / 30)

- Violations: **1**
- Rule: `color-contrast`
- Impact: **serious**
- WCAG Criterion: **1.4.3 Contrast (Minimum)** — Level AA
- Element: `.vc-input-details__counter.vc-input-details__counter--limit`
- Foreground color: `#de3131`
- Background color: `#fafafa`
- Computed ratio: **4.38:1**
- Required ratio: **4.5:1** (normal text < 18pt / < 14pt bold)
- Font size: 10px normal weight (qualifies as normal text, not large text)
- Shortfall: **0.12:1**

WCAG 4.1.3 (Status Messages): The counter at cap correctly has `role="status"` and `aria-live="polite"` — this criterion passes in both states. The violation is solely on 1.4.3.

Artifact: `evidence/a11y/axe-at-cap.json`
Screenshot: `evidence/a11y/CFG-TEXT-COUNTER-006-at-cap-axe-violation.png`

### Bug Classification

| Field | Value |
|-------|-------|
| Category | A11y High (contrast violation on functional UI element) |
| WCAG Criterion | 1.4.3 Contrast (Minimum) — Level AA |
| Severity | High |
| Component | `vc-input-details.vue` — BEM `.vc-input-details__counter--limit` |
| Token | `--color-danger-500` or equivalent red token used for `color` |
| Reproduction | Navigate to configurable product PDP; type 30 chars into Text section field; counter turns red — axe reports `color-contrast` violation |
| Fix | Darken the at-cap counter color token so that on the lightest background (`#fafafa`) the contrast achieves ≥4.5:1. Candidate: `#c82020` yields ~5.3:1 on `#fafafa`. Alternatively, use a larger font size (≥18.67px / ≥14px bold) which downgrades the requirement to ≥3:1, where 4.38:1 would pass — but this changes layout and is not recommended. |
| Risk | Legal compliance risk (WCAG AA is required by VPAT commitment) |
| Escalation | Report to qa-lead-orchestrator for JIRA creation; assign to design system team |

### Assertions

| Assertion | At-Rest | At-Cap |
|-----------|---------|--------|
| WCAG 1.3.1: counter programmatically associated to input | PASS | PASS |
| WCAG 4.1.3: `role=status` / `aria-live` on status messages | PASS (N/A — absent at rest is correct) | PASS (present at cap with correct role) |
| WCAG 1.4.3: color contrast ≥4.5:1 | PASS (gray counter, not checked) | FAIL (4.38:1 < 4.5:1) |
| axe violations count | 0 (PASS) | 1 (FAIL — color-contrast) |

**VERDICT: FAIL — WCAG 1.4.3 color-contrast violation at cap. Contrast 4.38:1 < 4.5:1 required.**

---

## Evidence Inventory

| File | Purpose |
|------|---------|
| `evidence/screenshots/rest-state-baseline.png` | Empty state `0 / 30` — counter baseline |
| `evidence/a11y/CFG-TEXT-COUNTER-003-at-cap-30-30.png` | At-cap red counter with `--limit` class |
| `evidence/a11y/CFG-TEXT-COUNTER-005-fr-locale-0-30.png` | French locale counter |
| `evidence/a11y/CFG-TEXT-COUNTER-005-fr-FR-18-30.png` | French locale mid-type `18 / 30` |
| `evidence/CFG-TEXT-COUNTER-005-ja-locale-0-30.png` | Japanese locale counter |
| `evidence/a11y/CFG-TEXT-COUNTER-006-at-cap-axe-violation.png` | axe violation state screenshot |
| `evidence/a11y/axe-at-rest.json` | axe scan artifact — at-rest (0 violations) |
| `evidence/a11y/axe-at-cap.json` | axe scan artifact — at-cap (1 violation: color-contrast) |

---

## Sign-Off

```
AGENT:   ui-ux-expert
DATE:    2026-04-20
BUILD:   vc-theme-b2b-vue-2.47.0-pr-2263-2bf2-2bf2be51
SCOPE:   CFG-TEXT-COUNTER-003, CFG-TEXT-COUNTER-005, CFG-TEXT-COUNTER-006

AC3 (visual emphasis + ARIA):   PASS
AC5 (i18n — fr/de/ja):          PASS
AC6 (WCAG 2.1 AA axe):          FAIL

BLOCKER: WCAG 1.4.3 violation — at-cap counter color #de3131 on #fafafa = 4.38:1 (need 4.5:1)
ACTION:  File JIRA bug: severity=High, component=vc-input-details, criterion=WCAG 1.4.3
GATE:    FAIL — ticket must not ship until contrast token corrected or design exception documented
```
