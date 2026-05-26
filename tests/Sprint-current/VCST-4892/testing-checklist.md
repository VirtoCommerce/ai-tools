# VCST-4892 — UI Kit Date Picker: Testing Checklist

**JIRA:** VCST-4892 | **PR:** vc-frontend#2291 (`fed4fe16`) | **Theme build:** `vc-theme-b2b-vue-2.50.0-pr-2291`
**Surface:** Storybook (`STORYBOOK_URL`) primary; `/account/orders` storefront regression
**Existing coverage:** ORD-017 covers the happy-path date-range filter flow — all items below are NEW gaps
**BL refs:** BL-UI-001 (CLS), BL-UI-003 (state shift), BL-UI-004 (overflow), BL-UI-006 (touch targets)
**Agent:** `ui-ux-expert` for Sections A–C + E; `qa-frontend-expert` for Sections D; both for F + G

---

## Section A — VcDateInput (Storybook)

**AC coverage:** Ivan Kalachikov comment #1 (@change contract), #2 (typing-0 bug), #3 (no eager request)
**Evidence:** screenshot + console log per item

- [ ] **A-1 [P0]** Locale parsing — en (MM/DD/YYYY): type `01/15/2025` → value accepted, @change fires `complete:true, valid:true` | AC-1
- [ ] **A-2 [P0]** Locale parsing — de/fi (DD.MM.YYYY): type `15.01.2025` → accepted, correct format | AC-1
- [ ] **A-3 [P0]** Locale parsing — ja (YYYY/MM/DD): type `2025/01/15` → accepted | AC-1
- [ ] **A-4 [P0]** Locale parsing — ru (DD.MM.YYYY): type `15.01.2025` → if locale key missing, falls back gracefully (no crash, no wrong mask) | AC-1, i18n gap
- [ ] **A-5 [P0]** Typing `0` in day field does NOT clear the entire input — allows continuing to `01`, `02`…`09` | AC-2
- [ ] **A-6 [P1]** Paste a full date string → @change fires once with correct payload; no double-fire | AC-1
- [ ] **A-7 [P1]** Masked input: placeholder mask shows date format hint; mask chars are non-editable | AC-1
- [ ] **A-8 [P1]** @change payload structure: `{ complete, valid, data, eventSource }` — verify each field present and typed correctly via console | AC-1
- [ ] **A-9 [P1]** eventSource values: keyboard input → `'input'`; blur → `'blur'`; picker → `'picker'` | AC-1
- [ ] **A-10 [P1]** Editing a pre-filled date keystroke-by-keystroke does NOT fire network request per keystroke — only on blur/Enter | AC-3
- [ ] **A-11 [P1]** Sizes xs/sm/md render without overflow; label, input, and error text stay inside bounds | BL-UI-004
- [ ] **A-12 [P1]** Disabled state: input not editable, @change not fired, cursor shows not-allowed | BL-UI-003
- [ ] **A-13 [P1]** Error state: red border + error message rendered; aria-describedby links input to error | WCAG 1.3.1
- [ ] **A-14 [P2]** Empty/blank input → @change fires `complete:false, valid:false` | AC-1
- [ ] **A-15 [P2]** 200% browser zoom: input label and field remain readable, no clip | WCAG 1.4.4

---

## Section B — VcCalendar (Storybook)

**AC coverage:** single-date selection, min/max, unavailable-date predicate, keyboard nav, i18n labels
**Evidence:** screenshot per interaction state; console for keyboard events

- [ ] **B-1 [P0]** Single-date selection: click a day → day highlighted, @change fires with selected date | AC-1
- [ ] **B-2 [P0]** Today highlight: today's cell visually distinct (CSS class/style); clicking today selects it | AC-1
- [ ] **B-3 [P0]** Min/max constraint: dates before `min` and after `max` are unclickable and visually disabled | AC-1
- [ ] **B-4 [P1]** Unavailable-date predicate: cells returned true by predicate styled as unavailable and non-selectable | AC-1
- [ ] **B-5 [P1]** Year navigation: Prev/Next year buttons advance the grid by 12 months; year label updates | AC-1
- [ ] **B-6 [P1]** Month navigation: Prev/Next month buttons advance by 1 month; month/year label updates | AC-1
- [ ] **B-7 [P1]** Keyboard — Arrow keys move focus across days (wraps to prev/next month) | WCAG 2.1.1
- [ ] **B-8 [P1]** Keyboard — Home/End jump to first/last day of the visible week | WCAG 2.1.1
- [ ] **B-9 [P1]** Keyboard — PgUp/PgDn navigate by month; Ctrl+PgUp/Dn navigate by year | WCAG 2.1.1
- [ ] **B-10 [P1]** Keyboard — Enter/Space on a focused day selects it; Escape collapses parent (tested in VcDatePicker context) | WCAG 2.1.1
- [ ] **B-11 [P1]** Today footer button: click navigates to current month and highlights today | AC-1
- [ ] **B-12 [P1]** Clear footer button: clears selected date; @change fires `data: null` or empty | AC-1
- [ ] **B-13 [P1]** Locale weekday labels: en=Sun–Sat, de=So–Sa, ja=日–土 — first-day-of-week matches locale convention | AC-1
- [ ] **B-14 [P2]** Month/year header label text matches current locale's full month name | AC-1
- [ ] **B-15 [P2]** Slot rendering: custom day cell content renders inside the grid cell without overflow | BL-UI-004

---

## Section C — VcDatePicker (Storybook)

**AC coverage:** popover composition, ARIA linkage, updateOn modes, validation surface, form integration
**Evidence:** screenshot on popover states; DevTools Elements for ARIA attrs; console for events

- [ ] **C-1 [P0]** Click VcDateInput trigger → VcCalendar popover opens; input's aria-expanded updates to `true` | WCAG 4.1.2
- [ ] **C-2 [P0]** Press Escape with popover open → popover closes; focus returns to input; aria-expanded=`false` | WCAG 2.1.2
- [ ] **C-3 [P0]** Click outside popover → popover closes | BL-UI-003
- [ ] **C-4 [P1]** aria-haspopup=`dialog` or `listbox` present on input trigger | WCAG 4.1.2
- [ ] **C-5 [P1]** aria-controls links input trigger to popover element id | WCAG 4.1.2
- [ ] **C-6 [P1]** aria-describedby on input references visible date-format hint or error message | WCAG 1.3.1
- [ ] **C-7 [P1]** VcPopover aria-label prop (new prop from PR) renders as aria-label on popover element | AC-1
- [ ] **C-8 [P1]** updateOn=blur: selecting date in calendar does NOT immediately commit; commits on input blur | AC-3
- [ ] **C-9 [P1]** updateOn=enter: selecting date does NOT commit; commits on Enter keypress in input | AC-3
- [ ] **C-10 [P1]** updateOn=submit: value held until enclosing form submit event | AC-3
- [ ] **C-11 [P1]** Min/max validation: date outside range → error state shown, @change `valid:false` | AC-1
- [ ] **C-12 [P1]** Disabled-date validation: selecting a disabled day from calendar → no selection, error message | AC-1
- [ ] **C-13 [P1]** vee-validate integration: field shows validation error on invalid input; no console errors | AC-1
- [ ] **C-14 [P1]** Form reset: reset event clears the date input and calendar selection | AC-1
- [ ] **C-15 [P1]** Popover teleport: renders in `<body>` or configured target; does NOT cause z-index layering issues with sticky header | BL-UI-003
- [ ] **C-16 [P1]** Viewport edge positioning: when trigger is near right/bottom edge, popover flips or repositions; no overflow beyond viewport | BL-UI-004
- [ ] **C-17 [P2]** Sizes (xs/sm/md): VcDatePicker outer container matches VcDateInput size variant without CLS | BL-UI-001
- [ ] **C-18 [P2]** No layout shift when popover opens or closes (CLS = 0 for adjacent elements) | BL-UI-003

---

## Section D — Account Orders Date Filter Regression (`/account/orders`)

**Existing coverage:** ORD-017 covers happy-path range selection — items below cover migration-specific behaviors
**AC coverage:** VcDatePicker replaces VcDateSelector in `date-filter-select.vue`; URL serialization; edge cases
**Evidence:** screenshot before/after filter; Network tab for ISO param; URL bar

- [ ] **D-1 [P0]** Open date filter → VcDatePicker renders (NOT deprecated VcDateSelector); no console deprecation warn | Migration
- [ ] **D-2 [P0]** Select start date via calendar click → start field populated; select end date → filter applies; orders filtered | ORD-017 extension
- [ ] **D-3 [P0]** URL serialization: after applying range, URL query params use ISO 8601 format (YYYY-MM-DD), not locale-specific | AC-1
- [ ] **D-4 [P1]** Clear filter: both date inputs empty, URL params removed, full order list restored | ORD-017 extension
- [ ] **D-5 [P1]** Type start date via keyboard → end date via keyboard → filter applies on commit (blur/Enter); no request per keystroke | AC-3
- [ ] **D-6 [P1]** Reversed range (start > end): either auto-swap dates or show validation error — no silent incorrect filter | ECL-3.2
- [ ] **D-7 [P1]** Same-day range (start = end): single day selected for both fields → only orders from that day shown | ECL-3.2
- [ ] **D-8 [P1]** Navigation persistence: navigate to order detail and back → date filter state preserved | ECL-7.1
- [ ] **D-9 [P2]** Paste date into start field → filter updates correctly | AC-1
- [ ] **D-10 [P2]** Mobile 375 px: date filter controls ≥ 44 × 44 px touch targets; popover does not overflow viewport | BL-UI-006

---

## Section E — Accessibility WCAG 2.1 AA

**AC coverage:** keyboard-only operation, ARIA semantics, contrast, screen reader
**Evidence:** DevTools axe scan screenshot; NVDA session notes; contrast ratio readings

- [ ] **E-1 [P0]** Keyboard-only: open picker → navigate calendar → select date → close — achievable with Tab/Arrows/Enter/Escape only; no mouse needed | WCAG 2.1.1
- [ ] **E-2 [P0]** Focus trap inside popover: Tab cycles within calendar grid + footer buttons; does NOT escape to page behind | WCAG 2.1.2
- [ ] **E-3 [P0]** Focus returns to trigger input after popover close (Escape or date selection) | WCAG 2.4.3
- [ ] **E-4 [P1]** NVDA + Chrome: opening calendar announces "dialog" or role; selected date announced on selection | WCAG 1.3.1
- [ ] **E-5 [P1]** NVDA: each calendar day cell announces day number + month + year + selected/unavailable state | WCAG 1.3.1
- [ ] **E-6 [P1]** Color contrast — input text on background ≥ 4.5:1; placeholder ≥ 3:1; error text ≥ 4.5:1 | WCAG 1.4.3
- [ ] **E-7 [P1]** Color contrast — calendar day cells: today highlight, selected day, disabled day — all states ≥ 3:1 for UI component borders | WCAG 1.4.11
- [ ] **E-8 [P1]** Error state uses color + icon/text, NOT color alone | WCAG 1.4.1
- [ ] **E-9 [P1]** Visible focus indicator present on input, calendar day cells, nav buttons, Today/Clear buttons | WCAG 2.4.7
- [ ] **E-10 [P2]** axe DevTools scan on VcDatePicker Storybook story: zero critical/serious violations | WCAG (automated)

---

## Section F — Deprecation (VcDateSelector)

**AC coverage:** backward compatibility; dev-warn fires exactly once
**Evidence:** console screenshot showing warning text

- [ ] **F-1 [P1]** VcDateSelector Storybook story still renders; date selection still functional (no runtime error) | Backward compat
- [ ] **F-2 [P1]** Browser console shows exactly one deprecation warning containing "VcDateSelector" or "deprecated" on mount | Deprecation contract
- [ ] **F-3 [P2]** Warning does NOT repeat on every re-render or prop update (fires once on mount) | Deprecation contract

---

## Section G — i18n Gaps (ru / sv / zh)

**AC coverage:** PR claims 10-locale coverage; ru, sv, zh locale files NOT updated per diff review
**Evidence:** console screenshot; browser locale set to missing locale

- [ ] **G-1 [P0 — defect candidate]** Set browser locale to `ru` → VcDateInput mask/placeholder shows correct DD.MM.YYYY format; no missing translation keys logged in console | i18n gap
- [ ] **G-2 [P1 — defect candidate]** Set browser locale to `sv` → date format renders correctly (DD.MM.YYYY expected); no key fallback shown | i18n gap
- [ ] **G-3 [P1 — defect candidate]** Set browser locale to `zh` → date format renders correctly (YYYY/MM/DD expected); no key fallback shown | i18n gap
- [ ] **G-4 [P1]** If any locale key is missing: verify fallback is English (not raw key string `"date_picker.placeholder"`) | i18n contract

---

**Checklist totals:** 64 items — P0: 14 | P1: 40 | P2: 10
**New coverage (not in ORD-017):** All items in A, B, C, E, F, G; D-1 + D-3–D-10
**Execution agents:** `ui-ux-expert` (A, B, C, E, F, G) via `playwright-chrome` + Chrome DevTools; `qa-frontend-expert` (D) via `playwright-chrome`
