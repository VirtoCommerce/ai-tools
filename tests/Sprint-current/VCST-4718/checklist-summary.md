# VCST-4718 — Watermelon Dark Mode: Test Checklist Summary

**Feature:** Implement Dark-mode (Watermelon theme preset)
**PR:** vc-frontend #2204 — adds `watermelon.dark.json` (146 tokens) + registration in `darkPresets` map
**Deployed version:** 2.45.0-pr-2204-de06c786
**Checklist file:** `VCST-4718-dark-mode-watermelon-checklist.csv`
**Total test cases:** 48 (WDM-001 through WDM-048)
**Layer:** Storefront UI (primary), Admin UI + GraphQL (cross-layer verification for WL integration cases)
**Assigned agent:** `qa-frontend-expert` (Storefront + Mobile); `qa-backend-expert` (WL integration, GraphQL, Admin)

---

## Coverage by Section

| Section | Cases | Priority Breakdown |
|---------|-------|--------------------|
| Dark Mode Activation | WDM-001 – WDM-005 | 1 Critical, 2 High, 2 High |
| Color Token Verification | WDM-006 – WDM-014 | 4 Critical, 5 High |
| Multi-Page Visual Verification | WDM-015 – WDM-020 | 3 Critical, 2 High, 1 Medium |
| Accessibility / Contrast | WDM-021 – WDM-024 | 1 Critical, 2 High, 1 Medium |
| Theme Switching | WDM-025 – WDM-028 | 2 Critical, 1 High, 1 Medium |
| White Labeling Integration | WDM-029 – WDM-033 | 2 Critical, 2 High, 1 Medium |
| Mobile Responsive | WDM-034 – WDM-036 | 2 High, 1 Medium |
| Edge Cases | WDM-037 – WDM-040 | 1 High, 2 Medium, 1 Low |
| Regression - Other Dark Presets | WDM-041 – WDM-044 | 3 Critical, 1 High |
| Cross-Browser | WDM-045 – WDM-048 | 2 High, 2 Medium |

**Priority totals:** Critical = 16 | High = 21 | Medium = 9 | Low = 2

---

## Business Rules Covered

- **BL-B2B-006** — White labeling resolution order (user > org > store default). Referenced in all 48 cases.
- **BL-WL-001** — Org override takes precedence over store when both configured (WDM-030).
- **BL-WL-004** — Non-existent preset falls back to default without errors (WDM-033).

---

## Known Issues from Prior Exploration

Three potential WCAG AA contrast failures were identified analytically during the qa-frontend-expert and ui-ux-expert runs. The checklist includes targeted audit cases for each:

| Bug | Case | Issue | Measured Ratio |
|-----|------|-------|----------------|
| BUG-02 | WDM-021 | White text on CTA button (#e73433) | 4.25:1 (need 4.5:1) |
| BUG-03 | WDM-022 | Status -500 colors on dark card surfaces | Estimated insufficient |
| BUG-04 | WDM-023 | neutral-300 border contrast on dark backgrounds | Borderline |

WDM-021 is marked Critical because the CTA button is a revenue-critical element. WDM-022 and WDM-023 are High and Medium respectively.

---

## Key Test Data Notes

- Watermelon dark preset must be pre-configured in Admin White Labeling before executing WDM-029 through WDM-033. Use exact case-sensitive preset name as registered in `darkPresets` map (verify from `index.ts`).
- Multi-org user account required for WDM-027 (org switch between Watermelon and Coffee dark).
- WDM-037 requires Slow 3G throttling in DevTools to reliably observe FOUC.
- WDM-039 depends on the content hash `de06c786` in CSS bundle URLs — verify this matches the deployed build.

---

## Delegation Recommendations

| Cases | Agent | Browser |
|-------|-------|---------|
| WDM-001 to WDM-020, WDM-025/026, WDM-034 to WDM-040, WDM-045, WDM-048 | `qa-frontend-expert` | `playwright-chrome` |
| WDM-046 | `qa-frontend-expert` | `playwright-firefox` |
| WDM-047 | `qa-backend-expert` | `playwright-edge` |
| WDM-021 to WDM-024 | `ui-ux-expert` | Chrome DevTools MCP |
| WDM-027 to WDM-033 (WL Admin + GraphQL steps) | `qa-backend-expert` | `playwright-edge` |
| WDM-041 to WDM-044 (regression other presets) | `qa-frontend-expert` | `playwright-chrome` |

---

## Execution Notes

1. Run Critical cases (WDM-001, WDM-006–009, WDM-015–017, WDM-025–026, WDM-029–030, WDM-041–043) before any other sections — these represent the minimum bar for feature sign-off.
2. Accessibility cases WDM-021 through WDM-024 should run after all visual cases pass — they require stable dark mode rendering.
3. Regression cases WDM-041–044 should be executed in isolation (separate browser context) with each respective theme preset configured, to avoid cross-contamination between presets.
4. Cross-browser cases (WDM-045–048) are lowest priority for initial verification but must pass before sprint release.
