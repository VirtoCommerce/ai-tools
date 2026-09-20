# Variant picker selection state, group naming, and role composition are invisible to assistive technology — WCAG 2.2 Level A (4.1.2) [P1]

**Env:** vcst-qa, platform `3.1071.0-pr-3108-016f`, theme `2.58.0-pr-2467-1f40b001` (PR pre-release — see Notes; not the cause).

## Summary
`VcVariantPicker`/`VcVariantPickerGroup` (the PDP OPTIONS block) conveys selected/unavailable state and group identity through CSS classes and generic strings only, never through ARIA state. A screen-reader user on the buy path cannot tell which Color/Fabric/Size is selected, cannot tell the Color group from the Size group, and can select — and add to cart — a variant marked unavailable. Found in `REG-2026-09-18-1818`, case `A11Y-VCP-001` (suite `045`), never actioned. Source-confirmed against `VirtoCommerce/vc-frontend` `dev`.

## Steps to Reproduce
1. Open a PDP with variant options (e.g. Men's Flannel Shirts under *Products with options > Shirts, jeans and more*) on `{{FRONT_URL}}`.
2. In the OPTIONS block, click a Size value, e.g. `L`.
3. Query the DOM: `[role="radiogroup"] [aria-checked]`, `[role="radiogroup"] [aria-selected]`, `[role="radiogroup"] [role="radio"]`.
4. Tab through the Color, Fabric and Size groups and read each group's accessible name.
5. Click an option struck through as unavailable for the current combination.

## Expected vs Actual
- **Expected:** the chosen option exposes `aria-checked="true"` (or `aria-selected="true"`) so AT can report the current Color/Fabric/Size; the radiogroup owns `role="radio"` descendants; each group has its own accessible name; an unavailable option is `disabled`/`aria-disabled` and not selectable.
- **Actual:** step 3 returns **zero matches** — selection exists only as the `vc-variant-picker--active` CSS class. Step 4 announces all three groups identically as the generic string "Variant options". Step 5 succeeds — the unavailable option is selected with no AT indication anything unusual happened.

## Defects (one component, one fix surface)

**1. Primary — WCAG 4.1.2 Name/Role/Value, Level A.** In `vc-variant-picker.vue`, the real `<input :type="inputType" :checked="checked">` (radio/checkbox) carries `.vc-variant-picker__input { @apply hidden; }` (`display:none`) — removed from the accessibility tree — and has no `@change`/`v-model` handler; it is decorative only. The element the user actually operates is `<button type="button" class="vc-variant-picker__trigger" :aria-label="accessibleName" @click="toggleValue">`, which exposes **only `aria-label`** — no `aria-checked`, `aria-pressed`, or `role="radio"`. The `checked` computed drives solely the `vc-variant-picker--active` class on the wrapping `<div>`. Matches `BL-A11Y-004`'s violation signal verbatim: *"aria-checked/aria-selected not toggling with visible state."*

**2. `aria-required-children` (axe Serious).** `vc-variant-picker-group.vue` sets `role="radiogroup"` on its root `<div>` (line 5), but the DOM path to each option is `div.vc-variant-picker > label.vc-variant-picker__container > button.vc-variant-picker__trigger` — no element anywhere in that subtree carries `role="radio"` (the button's implicit role is `button`). No reachable descendant satisfies the radiogroup's required-owned-elements rule, regardless of nesting depth. `BL-A11Y-004` bars axe Critical/Serious outright.

**3. Generic group naming — WCAG 1.3.1 / 4.1.2 (`BL-A11Y-002`).** `ariaLabelValue = computed(() => ariaLabel.value ?? t("ui_kit.accessibility.variant_picker_group"))` in `vc-variant-picker-group.vue`. The consumer, `client-app/shared/catalog/components/product/options.vue`, passes `:name="property.label"` (sets the HTML `name` attribute used for native radio grouping) but **never passes `:aria-label`** — confirmed by reading the file. Color, Fabric and Size therefore all announce as the same fallback string. The visible caption (`<div class="options__label">{{ property.label }}</div>`) is unassociated plain text with no `id`/`aria-labelledby` link to the `radiogroup`.

**4. Unavailable options are visual-only, and remain operable.** `options.vue` passes `:is-available="isAvailable(...)"`; in `vc-variant-picker.vue` this only toggles the `--unavailable` class (a CSS `::before`/`::after` strikethrough). The trigger button has no `:disabled`/`:aria-disabled` binding, and `@click="toggleValue"` fires unconditionally — an AT user (and a sighted mouse user) can select and add to cart an option the storefront itself marked unavailable, with zero indication of anything wrong.

## Severity — P1 (accessibility is normally non-blocking; this is not)
- 4.1.2 is **Level A**, inside this project's declared WCAG 2.2 **AA** target, not AAA polish.
- Sits on the purchase path (variant selection precedes add-to-cart) and is structural in the shared UI-kit component, not incidental to one page.
- **Axe's `button-name` rule PASSES** here (the button's accessible name is non-empty) — this is a manual-judgment finding an automated scan alone will not surface, which is why it needs a written report.
- The case's `flaky: true` flag rests on `priorRuns: 1` (per `reports/regression/REG-2026-09-18-1818/triage-report.md` §10) — far below the ≥3-crossings/≥4-points credibility bar, and contradicted by the defect being structural in `dev` source. **The flag is not credible and should not gate action.**

## Evidence
- `reports/regression/REG-2026-09-18-1818/screenshots/A11Y-VCP-001-pdp.png` (OPTIONS block, default state)
- `reports/regression/REG-2026-09-18-1818/screenshots/A11Y-VCP-001-FAIL-no-aria-state.png` (selected Size `L`, no ARIA state exposed)
- `reports/regression/REG-2026-09-18-1818/traces/A11Y-VCP-001-FAIL-trace.json`

## Notes
- Environment is a PR pre-release build (`3.1071.0-pr-3108-016f` / `2.58.0-pr-2467-1f40b001`). The defect is confirmed structural in `vc-frontend` `dev` component source (not gated behind this PR), so the pre-release build is context, **not** the cause.
- `BL-PAY-005` / `BL-SEC-004` and two wrong-domain ids surfaced elsewhere in this run's triage were unverifiable — **not cited here**. Only `BL-A11Y-002` and `BL-A11Y-004` are used, both confirmed live in `.claude/knowledge/oracles/business-logic.md`.

## Fix Routing
**Repo:** `VirtoCommerce/vc-frontend` (`dev`)
- `client-app/ui-kit/components/molecules/variant-picker/vc-variant-picker.vue` — bind `aria-checked`/`role="radio"` (or `aria-pressed` if kept as a button) to the `checked` computed on the trigger button; bind `:disabled`/`:aria-disabled` to `!isAvailable`.
- `client-app/ui-kit/components/molecules/variant-picker-group/vc-variant-picker-group.vue` — ensure the group's owned elements satisfy `role="radiogroup"`'s required children.
- `client-app/shared/catalog/components/product/options.vue` — pass a per-property `:aria-label="property.label"` (or `aria-labelledby` to `.options__label`) to `VcVariantPickerGroup` so Color/Fabric/Size announce distinctly.
