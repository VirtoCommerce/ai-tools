# Header control spacing below 8px contract + sign-in validation error causes unreserved layout shift — P2/P3

> **Not filed 2026-10-05 — QA owner decision.**

**Env:** vcst-qa @ suite 048c (REG-2026-08-10-1144), cases LAYOUT-COMP-HEADER-003, LAYOUT-COMP-VCINPUT-002
**Refs:** BL-UI-002 (spacing), BL-UI-001 (layout stability)

Two independent, small layout-stability findings from the same suite pass, not covered by the existing CLS/touch-target bugs (`BUG-layout-cls-images-missing-dimensions.md` covers home/catalog `.features-block`/footer/logo; `BUG-layout-undersized-touch-targets-mobile.md` covers undersized targets) — these are a spacing-grid violation and a validation-triggered shift, both on the sign-in surface at 375px.

## Finding 1 — Header controls closer than the 8px spacing contract (LAYOUT-COMP-HEADER-003, P3)
**STR:** At 375px viewport, measure the gap between adjacent header control buttons.
**Expected:** ≥8px gap per the spacing contract (BL-UI-002).
**Actual:** Two header buttons measure only 5px apart.

![Header spacing](screenshots/LAYOUT-COMP-HEADER-003-FAIL.png)

## Finding 2 — Sign-in inline validation shifts the submit button 32px (LAYOUT-COMP-VCINPUT-002, P2)
**STR:** At 375px viewport, trigger an inline validation error on the sign-in form (e.g. submit with an invalid email) and observe the submit button's position before/after.
**Expected:** The error message renders into reserved space — submit button does not move (BL-UI-001).
**Actual:** The submit button is pushed down 32px when the error appears — no space is reserved for the validation message.

![VcInput validation shift](screenshots/LAYOUT-COMP-VCINPUT-002-FAIL.png)

## Fix Routing
- **Repo:** vc-frontend — header control spacing: raise the gap between adjacent buttons to ≥8px. Sign-in form / `VcInput`: reserve space for the inline-error slot so its appearance doesn't reflow the submit button.
- **Kind:** frontend
