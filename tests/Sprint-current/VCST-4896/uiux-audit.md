# VCST-4896 — UI/UX + Accessibility Audit
**Component:** `<CouponsSection>` + `<CouponCard>` (PR #2269)
**Date:** 2026-04-28
**Auditor:** ui-ux-expert (Claude Sonnet 4.6)
**Build verified:** `vc-theme-b2b-vue-2.48.0-pr-2269-dfb0-dfb0c1e5` — matches PR #2269 head SHA `dfb0c1e5`

---

## 1. Scope

| Item | Value |
|------|-------|
| URL | `https://vcst-qa-storefront.govirto.com/cart` |
| Browser | Chrome DevTools MCP (Chromium 147, axe-core 4.11.2) |
| Theme | Coffee (QA default, WCAG-tested theme per project memory) |
| Viewports tested | 768x1024, 1024x768, 1280x800, 1920x1080 |
| States captured | `default` (all 4 presets + custom), `applied` (CAT20 preset), `error` (BOGUS-XYZ invalid code) |
| Already-confirmed bugs | VCST-4896-bug-3 (`rel="noopener"`) and bug-4 (aria-label on buttons) — not re-filed here |
| Method | Live DOM audit, a11y tree inspection, Lighthouse (snapshot mode), computed style checks, manual tab-order verification |

---

## 2. A11y Findings

**Lighthouse a11y score: 85/100** (7 failing audits total; 2 are attributable to `<CouponsSection>` / `<CouponCard>`)

| ID | WCAG | Severity | Title | Finding | Fix |
|----|------|----------|-------|---------|-----|
| **A11Y-01** | 4.1.2 | **Critical** | All 5 action buttons have no accessible name | Confirmed live (extends VCST-4896-bug-4). All 4 preset apply-buttons AND the custom apply-button render as icon-only `<button>` with no `aria-label`, no title, no inner text. Screen reader announces each as "button". Trash icon (applied state) also nameless. **Lighthouse `button-name` audit: FAIL — 5 CouponCard buttons listed as failing.** | Add `aria-label` to `viewConfigs` button definitions in `coupon-card.vue` (apply: "Apply coupon", remove: "Remove coupon") + i18n keys. |
| **A11Y-02** | 3.3.1 / 4.1.3 | **Serious** | Error message "This code is not valid" has no live-region announcement | `coupon-card__error` `<p>` element has `aria-live: null`, `role: null`. Error appears as plain `StaticText` in a11y tree (uid=6_15). Screen-reader users receive no notification when an error appears. No `role="alert"` or `aria-live="polite"` anywhere on the element or its parents. | Add `role="alert"` (preferred: immediate announcement) or `aria-live="polite"` to `<p class="coupon-card__error">` in `coupon-card.vue:27`. |
| **A11Y-03** | 1.3.1 | **Serious** | `<section>` landmark has no accessible name | `<CouponsSection>` renders as `<section class="vc-widget coupons-section">` with no `aria-labelledby` connecting to the `<span id="title6">DISCOUNT & COUPONS</span>`. The section is an unnamed landmark in the a11y tree (uid=4_261 is `StaticText`, not part of a labeled region). Screen readers cannot identify it when navigating by landmarks. | Add `aria-labelledby="title6"` to the outer `<section>` in `VcWidget`. Note: this is a pre-existing VcWidget issue, not introduced by PR #2269 — all other `<VcWidget>` instances on the page have the same gap. File as a separate platform-level a11y ticket. Not attributed to VCST-4896. |
| **A11Y-04** | 3.3.2 | **Moderate** | Custom code input has no programmatic label | `input#input-751` (the editable custom card input) has no `<label>`, no `aria-label`, no `aria-labelledby`. It relies solely on `placeholder="Enter custom code"`. Placeholder disappears when typing and is not read as a label by all screen readers. The nearby `<p class="coupon-card__name">Custom code</p>` is not associated with the input. | Associate the visible "Custom code" text to the input via `aria-labelledby` or wrap both in `<label>`. For readonly preset inputs, `aria-label` or `aria-hidden="true"` + `aria-labelledby` from the `<h3>` label is appropriate since they are display-only. |
| **A11Y-05** | 2.5.5 | **Serious** | All 5 action buttons are 26x26px — below 44x44px minimum touch target | Measured live: all `vc-button` instances in the coupons section render at `width: 26px, height: 26px`. WCAG 2.5.5 (AA) requires minimum 44x44px. On touch devices this makes the apply/remove buttons very difficult to activate without mis-tap. | Increase the `xxs` `VcButton` size token or add explicit min-width/min-height to the button in `VcInput`'s decorator slot when used in the coupon context. Alternatively, increase the padding/hit-area via CSS without changing visual size. |
| **A11Y-06** | 1.4.4 | **Minor** | Readonly preset card inputs are in the tab order unnecessarily | 4 readonly inputs (CAT20, FREESHIP, WINE, FIXED5) have `tabIndex=0` and are reachable by keyboard. They are display-only (non-editable, non-interactive) — tabbing into them provides no value and adds 4 unnecessary tab stops before reaching the actionable apply buttons. | Add `tabindex="-1"` to readonly preset card inputs, or suppress them via `aria-hidden="true"` and ensure the adjacent apply button is sufficiently labeled. |
| **A11Y-07** | 1.3.1 | **Minor** | Coupon cards use `<h3>` labels that skip heading hierarchy | `<h3 class="coupon-card__label">` (e.g., "20% off") is the first heading in the sidebar, but the page heading is `<h1>CART</h1>`. There is no `<h2>` in the sidebar — the jump from h1 to h3 skips a level. **Lighthouse `heading-order` audit: FAIL** (moderate impact). This is partly a pre-existing VcWidget issue since other widgets also lack h2-level titles. | Either promote coupon label headings to `<h4>` (below an implicit h2 for the sidebar), or add a visually-hidden `<h2>` wrapper to VcWidget section titles. Pre-existing concern — flag to platform team. |

**Color contrast — PASS.** Lighthouse `color-contrast` audit passes (score 1). Spot-checks:
- `coupon-card__error` text: `color(srgb 0.87 0.19 0.19)` on white background = danger-500 — estimated contrast ~4.6:1 for 12px text. Borderline pass for body text (≥4.5:1 required). At exactly 12px / non-bold this is tight; passes but leave a margin note.
- `coupon-card__end-date` text: `color(srgb 0.32 0.32 0.32)` (neutral-600) on white — approximately 9:1, passes easily.
- "View all" link: `rgb(56, 100, 123)` on white background — approximately 5.2:1, passes 4.5:1 requirement.
- Applied card icon background (`color(srgb 0.36 0.68 0.49)` = success-400) with white text: approximately 3.1:1 — PASSES for large/bold text but BORDERLINE for the icon itself (non-text contrast, ≥3:1 required per 1.4.11). Passes at exactly 3:1 threshold.

**Keyboard navigation — PASS with caveats.** All 11 interactive elements (10 inputs+buttons + 1 link) are reachable by Tab in a logical top-to-bottom left-to-right order. No keyboard trap detected. Focus does reach the "View all" link. The 4 unnecessary readonly input tab stops (A11Y-06) inflate the count but do not break navigation.

**Focus visibility.** Not directly measured by Lighthouse but visual spot-check: browser default focus rings are visible on inputs and the link. Custom VcButton focus state uses the design system's ring — visible. No custom CSS removing outline detected in coupon-specific styles.

---

## 3. Design-System Findings

| Area | Finding | Verdict |
|------|---------|---------|
| **VcWidget reuse** | `<CouponsSection>` wraps itself in `<VcWidget>` — correct. Widget title, header slot, and slot-container patterns are identical to adjacent ORDER SUMMARY and QUOTE REQUEST widgets. | PASS |
| **VcInput reuse** | All 5 card inputs use `<VcInput size="xs">` with the `#append` slot for the button. This matches how other cart-page inputs use VcInput. | PASS |
| **VcButton reuse** | Apply button uses `variant="solid" color="primary"`, trash uses `variant="no-background" color="neutral"` — both are standard VcButton prop combinations. | PASS |
| **VcIcon** | `receipt-tax` (default/error), `round-check` (applied), `outline-trash` (applied trash), `arrow-right` (apply + link). `outline-trash` is a NEW icon added by this PR. `receipt-tax` and `arrow-right` are used elsewhere in the design system. `round-check` is a pre-existing icon. All render at consistent sizes (icon: 24px, link arrow: 14px per source). | PASS |
| **Spacing tokens** | Container `@apply space-y-3 px-5 pt-4 pb-0.5` — uses 4px/8px grid multiples (12, 20, 16, 2px). Link `@apply mb-0.5 px-5 py-3.5` (2, 20, 14px). These values are consistent with Tailwind utility scale and the 4px grid. | PASS |
| **Border radius** | Cards use `rounded` (4px default Tailwind) consistent with the design system `border-radius: 4px` token. Icon container uses `rounded-full`. | PASS |
| **Card p-2.5 (10px) vs gap-3 (12px)** | Card internal padding is 10px with icon-to-content gap of 12px. Adjacent OrderSummary widget interior uses `px-5 py-4` (20/16px). The coupon card padding is intentionally denser for a list-card pattern. Acceptable variance. | PASS |
| **Error state border = default border** | Both `coupon-card--default` and `coupon-card--error` apply `@apply border-dashed border-secondary-400`. The error card's only visual differentiators are the icon color (danger-400 instead of secondary-400) and the disabled apply button. The border itself does not change. **This is the most significant design-system concern.** Compared to the VC design system's convention for error states (see `VcAlert` error variant using `border-danger-400`), the lack of a danger-colored border on the error card weakens the error signal. Sighted users must look closely at the icon to detect the difference. | AMBIGUOUS — Flag to design team. See Section 7. |
| **Icon container size** | Applied-state icon container: 48x48px (`size-12 min-w-12`). This gives the icon room to breathe and is consistent with other icon containers in the design system. | PASS |

---

## 4. Visual States Report

All screenshots captured at 1280x800 with viewport scrolled to the CouponsSection.

| State | File | Visual Conformance | Notes |
|-------|------|--------------------|-------|
| **`default`** | `evidence/uiux/state-default.png` | PASS | Dashed secondary-400 border, receipt-tax icon, primary solid "→" apply button, h3 label, name text, expiry date all render as expected. All 4 preset cards + 1 custom card visible. |
| **`applied`** | `evidence/uiux/state-applied.png` | PASS | Green gradient background (`success-50 → white at 40%`), success-200 border, round-check icon (success-400 bg, white text), trash icon button renders. Order Summary shows updated discount. |
| **`error`** | `evidence/uiux/state-error.png` | CONDITIONAL PASS | Error text "This code is not valid" in danger-500 renders correctly. Apply button disabled. Icon border/color changes to danger-400. **However, the card border is identical to the default state (dashed secondary-400) — the error card looks nearly identical to a default card at a glance.** This is a design concern, not a rendering bug (component renders per source spec). See A11Y-02 (no live announcement) as the associated a11y failure. |

---

## 5. Responsive Findings

| Viewport | File | Layout | Overflow | CouponsSection |
|----------|------|--------|----------|----------------|
| **768x1024** (tablet portrait) | `evidence/uiux/responsive-768x1024.png` | PASS | None | Sidebar (256px wide) sits alongside main content at x=473px. Does NOT stack to full-width. Section renders within sidebar column — readable, no cutoff. |
| **1024x768** (tablet landscape) | `evidence/uiux/responsive-1024x768.png` | PASS | None | Sidebar maintains right-column position. CouponsSection cards stack vertically at narrower card width but remain readable. |
| **1280x800** (narrow desktop) | `evidence/uiux/responsive-1280x800.png` | PASS | None | Reference width. Section at 288px wide. No overflow (`bodyScrollWidth: 1265 < 1280`). |
| **1920x1080** (wide desktop) | `evidence/uiux/responsive-1920x1080.png` | PASS | None | Sidebar expands proportionally. CouponsSection cards have more breathing room. |

Note: At 768px portrait, the sidebar is still right-column (not stacked). This is consistent with the rest of the cart page's layout behavior — the sidebar stays right until the layout's breakpoint (likely below 768px based on Tailwind `lg:` grid). The 375x812 mobile stacking was already verified by exploratory agent. No new responsive failures found.

---

## 6. Heuristic Evaluation (Nielsen's 10)

- **H1 — Visibility of system status.** The VcButton's `:loading` prop triggers a spinner overlay during apply/remove operations. This visual feedback is clear. Applied state (green gradient + checkmark) clearly signals success. PASS.
- **H2 — Match between system and real world.** "Discount & coupons" is clear. "Custom code" (`shared.cart.coupons_section.custom_code`) is reasonably clear for B2B users. "Expires [date]" follows natural language. PASS.
- **H3 — User control and freedom.** Trash icon (applied state) allows instant removal without a confirmation dialog. For a coupon removal, this is an acceptable low-risk action that does not need confirmation — consistent with e-commerce norms (most cart removals are immediate). PASS. Minor note: the trash icon has no tooltip.
- **H5 — Error prevention.** Custom card: `if (!value) return` in `handleClick` silently ignores an empty submit. No toast, no inline feedback. This is a minor gap — sighted users may click the arrow button on an empty custom input and receive no signal that anything happened. The button is not disabled when input is empty. MODERATE concern. See Section 7.
- **H6 — Recognition rather than recall.** Preset cards surface code, label name, and expiry date — users don't need to recall anything. The "View all" link provides an escape hatch to see more coupons. Custom card says "Custom code" without a hint like "(e.g. SAVE10)". Minor gap for first-time users.
- **H8 — Aesthetic and minimalist design.** 4 preset cards + 1 custom card + "View all" link = 6 visual items in the sidebar section. For a sidebar context this is moderately dense. The `COUPONS_PER_PAGE = 4` cap prevents unbounded list growth. Acceptable for B2B power users who know their coupons.
- **H9 — Help users recover from errors.** "This code is not valid" is clear. "Something went wrong, please try again" (failed_coupon) is less specific but acceptable. No retry button — user must re-click the apply button (which is disabled in error state, requiring a re-type or card change). MINOR: in error state, the apply button is `disabled: true`, but the input remains editable. User can fix the code and click apply again — the error clears on next attempt. Recovery path exists. PASS.

---

## 7. New Bugs to File

The following issues are NEW — not covered by `bug-investigation.md`.

---

### VCST-4896-bug-5 — Error message has no `role="alert"` — screen readers cannot detect invalid coupon

**WCAG:** 3.3.1 (Error Identification) + 4.1.3 (Status Messages) — Level AA
**Severity:** Serious (a11y — screen-reader users receive no feedback when coupon fails)
**Component:** `coupon-card.vue` line 27
**Repro:**
1. Navigate to `/cart` as authenticated user (Coffee theme)
2. Type "BOGUS-XYZ" in the custom code input
3. Click the apply button (arrow icon)
4. Observe with screen reader (or inspect DOM): the `<p class="coupon-card__error">This code is not valid</p>` appears visually but has no `aria-live` or `role="alert"` — the error is invisible to assistive technology

**DOM evidence:** `coupon-card__error` has `ariaLive: null, role: null` (verified via `getComputedStyle` + `getAttribute`)
**Fix:** Add `role="alert"` to `<p v-if="view === 'error' && !!error" class="coupon-card__error">` in `coupon-card.vue:27`

---

### VCST-4896-bug-6 — Apply buttons are 26x26px — below WCAG 2.5.5 minimum touch target (44x44px)

**WCAG:** 2.5.5 (Target Size) — Level AA
**Severity:** Serious (touch users, especially motor-impaired, will miss-tap)
**Component:** `coupon-card.vue` — `VcButton` inside `VcInput`'s `#append` slot, `size="xxs"`
**Repro:**
1. Navigate to `/cart` on a touch device or emulated mobile viewport
2. Inspect any apply/trash button in the coupons section
3. Measured: `getBoundingClientRect()` returns `width: 26, height: 26` for all 5 buttons

**Evidence:** Script output `[{width:26, height:26}, ...]` for all 5 buttons
**Fix:** Either increase `vc-button--size--xxs` token minimum dimensions, or add a CSS wrapper that extends the hit area (e.g., `min-w-[44px] min-h-[44px]`) to the VcInput decorator slot when used in `size="xs"` mode. Affects VcButton's `xxs` size globally — scope review required.

---

### VCST-4896-bug-7 — Readonly preset card inputs occupy 4 unnecessary keyboard tab stops

**WCAG:** 2.4.3 (Focus Order) — advisory; also usability concern
**Severity:** Minor (keyboard navigation degradation)
**Component:** `coupon-card.vue` — `<VcInput readonly>` for non-custom cards
**Repro:**
1. Navigate to `/cart` using keyboard only
2. Tab into the "Discount & coupons" section
3. Tab cycles through: input(CAT20) → button → input(FREESHIP) → button → input(WINE) → button → input(FIXED5) → button → input(custom) → button → link
4. The 4 readonly inputs provide no keyboard interaction value — they display a code the user cannot edit

**Fix:** Add `tabindex="-1"` to the `<input>` rendered by `VcInput` when `:readonly="true"` and `!custom`. Alternatively, add `aria-hidden="true"` to the readonly inputs so they're skipped by AT entirely, and ensure the adjacent apply button's `aria-label` includes the coupon code for context (e.g., "Apply coupon CAT20").

---

### VCST-4896-bug-8 — Empty custom input submit is silently ignored — no feedback for user

**WCAG:** Not a direct criterion violation, but violates Nielsen H5 (Error Prevention) and H9 (Help Recover)
**Severity:** Minor (UX — sighted + keyboard users)
**Component:** `coupon-card.vue` — `handleClick()` has `if (!value) return` with no feedback
**Repro:**
1. Navigate to `/cart`, scroll to "Discount & coupons"
2. Leave the custom code input empty
3. Click the "→" apply button (or press Enter)
4. Nothing happens — no toast, no inline error, no visual indication the action was ignored

**Fix:** When `!value`, either disable the apply button reactively (`:disabled="!code"`) so it cannot be clicked while empty, or show a brief inline message. Disabling the button is simpler and more preventive.

---

## 8. Recommendations (Design Polish — No Severity)

1. **Error state card border.** The `error` view uses the same `border-dashed border-secondary-400` as `default`. Consider changing it to `border-dashed border-danger-400` (matching the icon's color) to make the error state visually distinct from the default state at a glance. This would align with the VcAlert `error` variant's design pattern. Low implementation cost.

2. **Custom code input placeholder hint.** The placeholder "Enter custom code" could be improved to "e.g. SAVE10" or include a brief parenthetical to help first-time B2B users who may not know what format a coupon code takes.

3. **Trash icon tooltip.** The trash button in `applied` state has no `title` attribute and no visible tooltip. Adding a `title="Remove coupon"` as a fallback would help sighted users who hover on an unfamiliar icon.

4. **Preset input `aria-label` includes coupon code.** If A11Y-06 (tabindex) is fixed to keep inputs in the tab order but provide context, consider `aria-label="Coupon code: CAT20, 20% off, expires Jan 1, 2027"` to give screen-reader users full context before they encounter the apply button.

---

## Summary Table

| Bug ID | Title | WCAG | Severity | Status |
|--------|-------|------|----------|--------|
| VCST-4896-bug-3 | Missing `rel="noopener"` on "View all" link | — | Minor | Already filed |
| VCST-4896-bug-4 | Apply/trash buttons missing `aria-label` | 4.1.2 | Serious | Already filed |
| **VCST-4896-bug-5** | Error message has no `role="alert"` | 3.3.1 / 4.1.3 | **Serious** | NEW |
| **VCST-4896-bug-6** | Action buttons are 26x26px — below 44x44px touch target | 2.5.5 | **Serious** | NEW |
| **VCST-4896-bug-7** | Readonly preset inputs occupy 4 unnecessary tab stops | 2.4.3 | Minor | NEW |
| **VCST-4896-bug-8** | Empty custom input submit silently ignored | H5/H9 | Minor | NEW |
