# Sign-in code boxes are almost invisible: their border is 1.48:1 (light) / 1.88:1 (dark), under WCAG 1.4.11's 3:1

## Status: READY_TO_SUBMIT
**Found by:** agent — testing VCST-5904
**Tracker:** VCST-6504 (Bug, Medium) · **Severity:** Medium · **Layer:** Storefront frontend · **Parent story:** VCST-5904 (MFA by email) · **Related:** VCST-6460 (VcInput border 2.52:1)

**Env:** vcst-qa storefront, store B2B-store, theme `2.61.0-pr-2570-2fc9-2fc9261a` (vc-frontend PR #2570 @ 2fc9261a), Chrome 1280×900, light and dark mode. Platform 3.1090.0-pr-3133, MFA 3.1000.0-pr-1-cf83, OTP 3.1001.0-pr-3-d978.

## Summary
The new six-box code step (OTP sign-in, and the MFA code step built on the same component) draws each box with a 1 px `neutral-300` border. Against the box fill it is 1.48:1 in light mode and 1.88:1 in dark mode, well under the 3:1 WCAG 1.4.11 requires for a UI component boundary. The real input above the boxes is transparent, so the borders are the only cue where the code goes — low-vision users see an empty area.

## Steps to reproduce
1. Storefront `/sign-in` (OTP is the default mode on B2B-store): type the email of any registered account, press **Continue**.
2. The **Check your email** step shows six code boxes (`.sign-in-code-input__cell`). Leave them empty; look at boxes 2–6 (box 1 has the blue focus border).
3. Measure the boxes' computed `border-color` against their `background-color` and the page behind; switch the header theme to dark and repeat.

## Actual
| Element | Theme | Border | Fill / page | Ratio vs fill / page |
|---|---|---|---|---|
| Code box, resting | light | #d4d4d4 | #ffffff / #fafafa | **1.48:1** / 1.42:1 |
| Code box, resting | dark | #3f3f3f | #0a0a0a / #121212 | **1.88:1** / 1.78:1 |
| Email field on the same form (VcInput) | light / dark | #a3a3a3 / #6e6e6e | same | 2.52:1 / 3.88:1 |

`.sign-in-code-input__input` has a transparent background, text colour and caret. Console: 0 errors.

## Expected
Each code box's resting boundary reaches at least 3:1 against its adjacent colours in both themes (WCAG 2.2 SC 1.4.11 Non-text Contrast), so the field is perceivable without focus.

## Evidence
![Code step, light](../screenshots/OTP-Code-Boxes-Border-Contrast-Below-3to1/c69-code-step-light-1280.png)
![Code step, dark](../screenshots/OTP-Code-Boxes-Border-Contrast-Below-3to1/c69-code-step-dark-1280.png)

Package: `investigations/C-69/` (evidence-index.md, root-cause.md, console log) · run checklist row C-69 · triage `triage-report.md`.

## Layer Validation
| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront Frontend | FAIL | computed styles above, screenshots |
| 2. Backend Admin | N/A | pure styling, no data |
| 3. GraphQL xAPI | N/A | no request involved |
| 4. Platform REST API | N/A | no request involved |

**Owning layer:** Layer 1 — Storefront.

## Root Cause Analysis
`client-app/shared/sign-in/components/sign-in-code-input.vue:148` (@ 2fc9261a, new in PR #2570) gives `__cell` the class `border border-neutral-300`. The token scale itself is correct (neutral-300 = #d4d4d4 light / #3f3f3f dark, flipping as designed); the component simply picked a step too light for a boundary. VcInput uses `border-neutral-400` (`client-app/ui-kit/components/molecules/input/vc-input.vue:358`), which passes dark (3.88:1) but still fails light (2.52:1 — VCST-6460). **neutral-500** is the lowest step at ≥ 3:1 in both: #737373 = 4.74:1 on white, #9e9e9e = 7.39:1 on #0a0a0a.

Not covered: hover / error states, 375 px (no responsive border rules in source), presets other than the one vcst renders.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend
- **repoKind:** frontend
- **Ownership hint:** platform
- **Component / module:** vc-frontend sign-in code input (`shared/sign-in/components/sign-in-code-input.vue`)
- **RCA anchor:** `client-app/shared/sign-in/components/sign-in-code-input.vue:148` — `border-neutral-300` on `.sign-in-code-input__cell`
- **Routing confidence:** HIGH — one class on one new component; the shade (neutral-500 vs a UI-kit-wide change with VCST-6460) is a design call for the reviewer
