# VCST-4928 — Testing Checklist

**Ticket:** [Frontend] Add live character counter to configurable product Text section inputs
**Priority:** Low (UX enhancement) | **Sprint:** 26-08 | **Status:** Ready for test
**PR:** vc-frontend #2263 → theme `vc-theme-b2b-vue-2.47.0-pr-2263-2bf2-2bf2be51.zip` (deployed on vcst-qa ✅)
**Platform:** 3.1019.0
**Component:** `client-app/shared/catalog/components/configuration/section-text-fieldset.vue`

## Scope

Frontend-only — storefront PDP counter UX for configurable-product Text sections.
- **Domains:** Configurable Products, Accessibility (WCAG 2.1 AA), i18n
- **Business Rules to verify:** BL-CAT-006 (configurable product — sections fillable + no regression in required-section enforcement)
- **Edge case patterns:** ECL-7.1 (loading/empty state), ECL-7.2 (text validation boundary), ECL-14.5 (null/default handling)

## AC → Test Case Mapping (from existing suite 072b)

| AC | Scenario | Existing Test Case(s) | Primary Agent |
|----|----------|------------------------|---------------|
| 1  | Counter visible `0 / 30` + `aria-describedby` | **CFG-TEXT-COUNTER-001** | qa-frontend-expert |
| 2  | Live updates `0 → 5 → 30` (<100ms) | **CFG-TEXT-COUNTER-002** | qa-frontend-expert |
| 3  | At-cap visual emphasis + `role=status` + `aria-live=polite` | **CFG-TEXT-COUNTER-003** | ui-ux-expert |
| 4  | Null `maxLength` — hidden OR `0 / 255`; no console errors | **CFG-TEXT-COUNTER-004** | qa-frontend-expert |
| 5  | i18n — fr/de/ja render correctly, no key breakage | **CFG-TEXT-COUNTER-005** | ui-ux-expert |
| 6  | WCAG 2.1 AA 1.3.1 + 4.1.3 (axe) | **CFG-TEXT-COUNTER-006** | ui-ux-expert |
| 7  | No regression to existing 30-char enforcement | **CFG-TEXT-001** (updated) | qa-frontend-expert |

## Exploratory Coverage (Step 5 — qa-testing-expert on playwright-firefox)

Risk charter (SFDPOT heuristic), 20-min time-box:
- **Paste over cap:** paste 50 chars into 30-cap field → does counter display `30 / 30`? Does HTML `maxlength` truncate correctly?
- **Cut/select-all/delete:** select all at cap → delete → counter returns to `0 / 30`? At-cap class removed?
- **IME composition (CJK):** paste/type Chinese or Japanese multibyte text near cap — counter counts characters or code units correctly?
- **Rapid typing:** hold key down → counter tracks without lag/desync
- **Browser back/forward:** counter re-renders with correct value after cart navigation
- **Mobile viewport (360px, 768px):** counter still visible + not clipped
- **Cross-browser:** verify on Firefox (primary exploratory); Chrome/Edge covered by CFG-TEXT-COUNTER cases

## Evidence Policy

- Screenshots: empty state, mid-type, at-cap state (with visible color token)
- DOM inspection: `aria-describedby`, `role=status`, `aria-live`, BEM class `vc-input-details__counter--limit`
- Console: capture any errors for null-maxLength product
- Network: HAR always
- Axe report: attach as artifact for CFG-TEXT-COUNTER-006

## Verdict Criteria

- **PASS:** All 7 ACs verified; counter visible in empty/mid/at-cap states; aria attributes correct; no console errors; i18n digits render across 3 locales; axe reports no new WCAG 2.1 AA violations; CFG-TEXT-001 regression clean.
- **FAIL:** Any AC violated; counter missing; wrong aria model; i18n key breakage; new WCAG violations; 30-char enforcement regressed.
