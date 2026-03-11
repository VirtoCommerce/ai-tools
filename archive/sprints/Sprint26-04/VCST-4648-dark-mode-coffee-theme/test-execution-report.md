# Test Execution Report — VCST-4648: Implement Dark Mode (Coffee Theme)

**JIRA:** [VCST-4648](https://virtocommerce.atlassian.net/browse/VCST-4648)
**PR:** [vc-frontend#2200](https://github.com/VirtoCommerce/vc-frontend/pull/2200)
**Date:** 2026-03-04
**Environment:** QA (`https://vcst-qa-storefront.govirto.com`) — Coffee theme, v2.43.0-pr-2200
**Executed by:** 3 parallel QA agents

---

## Overall Summary

| Agent | Browser | Sections | Tests | Pass | Fail | Blocked | Skip |
|-------|---------|----------|-------|------|------|---------|------|
| frontend-tester | playwright-chrome | 1, 2, 3, 5, 10 | 37 | 37 | 0 | 0 | 0 |
| testing-expert | playwright-firefox | 7, 8, 9, 11, 12 | 23 | 17 | 0 | 0 | 2 (+2 N/A, 1 partial) |
| visual-a11y-tester | Chrome DevTools | 4, 6 | 35 | 31 | 4 | 0 | 0 |
| retest | playwright-chrome | retest | 3 | 3 | 0 | 0 | 0 |
| **Total** | | **All 12** | **95** | **86** | **4** | **0** | **2** |

**Overall pass rate: 93.5%** (86/92 executed, excluding N/A and skips). Retest cleared all 3 previously blocked cases.

---

## Verdict: CONDITIONAL PASS

Dark mode is **functionally complete and solid** — all P0 revenue flows pass, mode switching works correctly, persistence is reliable, i18n is localized, FOUC prevention is effective, and cross-browser rendering is clean.

**Release is blocked by 1 High bug:**

| # | Severity | TC | Description | Blocker? |
|---|----------|----|-------------|----------|
| Bug #1 | **HIGH** | TC-DM-085 | Focus ring invisible in dark mode — outline contrast 1.64:1 (WCAG 2.4.7) | **YES** |
| Bug #2 | Medium | TC-DM-060 | Breadcrumb separator contrast 2.47:1 (WCAG 1.4.11 non-text, needs 3:1) | No |
| Bug #3 | Low (P3) | TC-DM-113 | Corrupted localStorage shows raw i18n key as toggle label | No |

---

## Defect Details

### Bug #1 — Focus Ring Invisible in Dark Mode (HIGH / BLOCKER)

- **WCAG:** 2.4.7 Focus Visible (Level AA)
- **Root cause:** `--outline-color: rgb(from var(--color-primary-500) r g b / .4)` where `--color-primary-500` = `#9a6d5b`. At 40% opacity on dark bg `rgb(28,28,28)`, effective contrast is **1.64:1** — invisible.
- **Impact:** All keyboard users lose visible focus indicators in dark mode.
- **Fix:** Override `--outline-color` in dark mode with higher opacity or lighter shade:
  ```css
  html.dark { --outline-color: rgba(194, 163, 150, 0.8); }
  ```

### Bug #2 — Breadcrumb Separator Low Contrast (Medium)

- **WCAG:** 1.4.11 Non-text Contrast (Level AA — requires 3:1)
- **Root cause:** Separator `<span>` color `rgb(90,90,90)` on dark bg `rgb(28,28,28)` = **2.47:1**
- **Fix:** Change separator color to >= `rgb(107,107,107)` OR add `aria-hidden="true"`

### Bug #3 — Corrupted localStorage Shows Raw i18n Key (P3)

- **Root cause:** `useDarkMode` composable uses the stored value as an i18n key suffix without validation
- **Impact:** Cosmetic only — mode defaults to system correctly, but label shows `shared.layout.header.top_header.dark_mode.invalid`
- **Fix:** Validate stored value against allowed modes before i18n lookup

---

## Section Results

### Section 1 — Toggle UI (7/7 PASS)
Toggle present in desktop header and mobile menu. Cycles through Dark/Light/System. Has proper `aria-label` ("Theme: dark/light/auto"). No layout shift.

### Section 2 — Mode Switching (10/10 PASS)
`html.dark` class applied/removed correctly. `localStorage['vc-color-mode']` stores `dark`/`light`/`system`. `<style id="vc-theme-variables">` injects ~248 CSS custom properties with `.dark` scoping. System mode follows `prefers-color-scheme`. Zero console errors.

### Section 3 — Persistence (7/7 PASS)
Survives page reload, new tab, navigation across pages, sign-in/sign-out. Clearing localStorage falls back to system default.

### Section 4 — Visual Coverage (24/26 PASS, 2 BLOCKED)
All 16 pages render correctly in dark mode. Body text contrast 13.44:1 (excellent). All components pass AA except breadcrumb separator (Bug #2). Blocked: sign-in and sign-up pages (auth redirect).

### Section 5 — i18n (4/4 PASS)
Toggle labels localized in English, German, Russian. No raw translation keys. Dark mode persists across language switches.

### Section 6 — Accessibility (4/6 PASS, 2 FAIL)
Body text, CTAs, modal text all pass AA. Toggle has `aria-label`, is keyboard-accessible. **Failures:** Focus ring invisible (Bug #1), breadcrumb separator low contrast (Bug #2).

### Section 7 — FOUC Prevention (3/4 PASS, 1 BLOCKED)
No white flash on reload in dark mode. FOUC prevention script inline in `<head>` works correctly. Blocked: TC-DM-091 (Firefox cannot emulate OS dark preference via Playwright MCP).

### Section 8 — Cross-Browser/Responsive (5/5 PASS + 2 N/A)
Firefox renders correctly at all 4 viewports (1920x1080, 768x1024, 375x812, 1280x720). Chrome confirmed by frontend-tester. Edge not tested (separate slot needed).

### Section 9 — Console Errors (3/4 PASS, 1 PARTIAL)
Zero JS errors across all mode transitions, reloads, and 6+ page navigations. Partial: corrupted localStorage doesn't crash but shows raw i18n key (Bug #3).

### Section 10 — Revenue Flows (9/9 PASS)
All critical flows pass in dark mode: sign-in, add to cart, cart, checkout shipping, checkout payment (Skyflow), place order, search, order history, registration.

### Section 11 — Edge Cases (6/6 PASS + 2 SKIPPED)
Rapid toggle (7x) stable. Mid-checkout switch preserves form state. Cart persists after mode change. Language switch preserves dark mode. No-localStorage fallback works. Modal blocks toggle. Skipped: print preview and JS-disabled (tool limitations).

### Section 12 — Theme Isolation (2/2 PASS)
Coffee dark variables scoped under `.dark` selector in `<style id="vc-theme-variables">`. VirtoStart demo store confirmed: no dark mode infrastructure at all.

---

## Pre-existing Issues (Not Dark Mode)

1. **Orders page i18n bug:** Raw key `commmon.buttons.search_orders` (triple 'm' typo)
2. **PDP 404:** `skinny_md.png` missing on Configurable Hat PDP
3. **Logout console error:** `ApolloError: Anonymous access denied` — expected

---

## Test Data Cleanup Required

| Item | Details |
|------|---------|
| Shipping address | 123 Test Street, New York, NY 10001 — needs Admin cleanup |
| Order | CO260304-00001 (Payment required, $198.00) — needs Admin cleanup |

---

## Evidence

- **30 screenshots** across 3 report directories
- Individual reports: `execution-report-frontend.md`, `execution-report-testing.md`, `execution-report-visual-a11y.md`
- Contrast ratio measurements documented in `execution-report-visual-a11y.md`

---

## Recommendation

1. **Fix Bug #1** (focus ring) before release — keyboard accessibility regression
2. **Fix Bug #2** (breadcrumb separator) — low effort, same CSS token root cause as input borders
3. **Log Bug #3** (i18n fallback) as backlog — edge case, no user impact in normal flow
4. ~~Retest sign-in/sign-up pages~~ — **DONE** (2026-03-04 retest: both PASS)
5. ~~Retest FOUC with OS dark preference~~ — **DONE** (2026-03-04 retest: PASS via Chromium emulation)
6. **Retest** Edge browser (TC-DM-102) — not covered in this run

*Generated 2026-03-04 by qa-lead (consolidated from 3 parallel agent reports)*
