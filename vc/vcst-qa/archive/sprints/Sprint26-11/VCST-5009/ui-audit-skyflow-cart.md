# UI/UX Audit — Skyflow Cart-Embedded Payment (VCST-5009)

**Env:** vcst-qa @ Theme 2.51.0-pr-2308, Skyflow module 3.1002.0-pr-23 · Browser: Chrome DevTools MCP (Chromium) · Theme: Coffee · User: SmokeTest RunnerQA (B2B-store)
**Scope:** UI/UX/design-system/visual quality of the `/cart` Skyflow payment section only. No order placed. WCAG 2.2 AA.
**Skyflow:** composable iframe `js.skyflow.com/v2.7.7`, env PROD, layout `[1,1,2]` (new card) / `[1]` (CVV-only).

## Verdict: PASS with minor findings — SHIP-OK

The Skyflow cart-embedded payment UI is well-integrated with the Coffee theme. The storefront passes deliberate, theme-aware style tokens to the Skyflow iframe (Lato font, 8px radius, 12px padding, Coffee-primary focus ring, red invalid/error). Field states, brand detection, validation, masking, Place-Order gating, and state cleanup on every transition all behave correctly. No P0/P1 defects. Findings are 1 Medium a11y (faint focus-ring contrast — Skyflow-config token), plus low-severity design-inconsistency and UX observations.

## Findings

| ID | Scenario | Classification | Severity | Description | Evidence |
|----|----------|----------------|----------|-------------|----------|
| SKY-UI-01 | A2 / B3 | A11y violation (WCAG 1.4.11 Non-text Contrast) | Medium | Field focus indicator is `box-shadow 0 0 0 3px rgb(from #996c5a / 0.3)` with border→transparent. Effective ring ≈ rgb(224,211,205) on #fff ≈ **1.2:1**, below the 3:1 required for focus indicators. Affects all Skyflow fields (card no., name, expiry, CVV). Token is set by storefront in the Skyflow init config (not Skyflow default). | A-newcard-form-empty-desktop.png (focused card field) |
| SKY-UI-02 | A1 | Design-inconsistency | Low | Skyflow iframe input border is `#a3a3a3` (darker gray) vs native theme form fields on same page using `#d4d4d4`. Side-by-side (dropdown above is #d4d4d4, iframe fields below #a3a3a3) the iframe borders read slightly heavier. | A-newcard-form-context-desktop.png |
| SKY-UI-03 | A7 | Design-inconsistency | Low | "Add new card" option uses a green "+" icon (`vc-icon fill-success`, ≈#3F845B) — the only non-Coffee-brown accent in the payment block; rest of the form uses brown primary for actions. Likely intentional additive affordance, but off-palette. | (dropdown-open screenshot in session) |
| SKY-UI-04 | A2 | Observation (error typography) | Low | Skyflow error text is `0.625rem` (10px) red `#de3131`. Legible but smaller than the storefront's usual caption scale; contrast of #de3131 on #fff ≈ 4.0:1 (OK for the 10px size only because it's bold-adjacent; meets 4.5:1 is borderline — #de3131 on white = 4.0:1, **below 4.5:1 for normal text**). Note as a secondary contrast watch-item. | A-newcard-form-valid-desktop.png (invalid state earlier in session) |
| SKY-UI-05 | B2 | UX Observation | Low | CVV-only block for a saved card shows just "Security code *" with no helper text explaining *why* re-entry is required, and the selected card is not echoed beside the CVV field (only context is the dropdown directly above). A one-line hint ("Re-enter the CVV for •••• 0015") would improve clarity. | B-savedcard-cvv-empty-desktop.png |
| SKY-UI-06 | A2 | Layout (BL-UI-003 validation shift) | Low | Revealing inline field errors grows the Skyflow iframe group ~6px and reflows content below (ORDER COMMENT). Measured CLS ≈ 0.15 *during* the type-and-tab interaction, but a fresh observer on the settled error state read **CLS = 0** — i.e. input-driven, settles immediately, not an animated/residual shift. The error reserve (`min-height 0.75rem`) is marginally short of the rendered line. Below P0 CLS bar; minor. | (measured in session) |
| SKY-UI-07 | A5 (mobile) | A11y — verify (WCAG 2.4.11 Focus Not Obscured) | Low/verify | At ≤500px a `position:fixed` PLACE ORDER bar (44px) pins to the viewport bottom. At observed scroll the iframe fields sit above it (no overlap), but depending on scroll the lowest field (Security code) could align under the sticky bar. Could not confirm focus-obscuration through the cross-origin iframe with keyboard — flag for manual SR/keyboard verification on a real device. | A-newcard-form-mobile-500.png |
| SKY-UI-08 | A6 / B6 | A11y — verify (screen-reader) | n/a | Inline error texts ("Invalid Card number.", "Provide a valid security code.") render as plain text inside the cross-origin Skyflow iframe; aria-live / aria-describedby association is Skyflow-owned and not verifiable with the MCP toolkit (no NVDA/JAWS/VoiceOver). Surface as manual SR check. | — |

## What PASSED (no defect)

**Scenario A — new-card form**
- Layout/tokens: iframe inputs match native theme on font (Lato 16px), border-radius (8px), padding (12px). Field gap 24px (on-grid). Labels bold #0a0a0a + red `*` — matches native "Billing address *" style. (A1)
- States: empty placeholders clear (`1111 1111 1111 1111`, `MM / YY`, `111`); focus ring present (contrast caveat SKY-UI-01); invalid → red border + red message; valid → neutral border, error cleared. (A2)
- Card-brand detection works: `4111…`→VISA logo, `5424…`→Mastercard logo, swapped live while typing. (A4)
- Place Order gating: disabled with helper "Complete all required information to proceed." while invalid; on full valid input it enables (Coffee #996c5a bg, white text ≈4.5:1 — passes 1.4.3) and the helper text correctly disappears. (A3)
- CVV masked (`•••`); card-number masked-on-blur per Skyflow mask config.
- Responsive: 500px (mobile min) — full-width fields, no horizontal overflow, sticky bottom CTA. Desktop side-by-side expiry/CVV. (A5)
- Keyboard: Tab enters Skyflow fields in order Card→Cardholder→Expiration→Security. (A6)
- Switching form→saved-card cleanly removes the 4-field iframe (no orphaned UI). (A7)

**Scenario B — saved card + CVV**
- Dropdown UX: placeholder "Select credit card"; selected shows masked card `•••• 0015 (09/27)`; options masked-card typography + expiry; generic card icon consistent. (B1)
- CVV re-entry: single CVV-only iframe (width 6rem), label "Security code *". (B2)
- CVV states: empty/focus/invalid(1 digit → "Provide a valid security code.")/valid — styling consistent with new-card form; Place Order gated until valid. (B3)
- **Switching saved cards resets the CVV** (no stale `***` carried from card 0015 to 1111) and **re-disables Place Order** — correct, secure state hygiene. (B4)
- saved-card → Add new card → back: fresh iframe each time, no residual CVV. (B5)
- Dropdown keyboard-operable (combobox/listbox roles, options selectable). (B6)

**Cross-cutting**
- No console **errors** in the payment section (known Skyflow postMessage/404 noise is warn-level only).
- No horizontal overflow at 500px or desktop. Touch targets (fields, dropdown, Place Order) ≥44px — meets WCAG 2.5.8 and mobile guidance.
- Coffee theme tokens applied throughout; no FOUC observed on the payment block.

## Note on known facts
- Payment method was **not** default-selected to Skyflow in this session (dropdown empty on load; Skyflow is the last of 6 options, not first). Minor drift vs the supplied baseline ("often default-selected") — not a defect.
- Saved-cards UI is gated behind selecting Skyflow + the dropdown; it does render by default once Skyflow is chosen, matching baseline.

## Recommendation
Ship. File SKY-UI-01 (focus-ring contrast, WCAG 1.4.11) and re-check SKY-UI-04 (error-text contrast) as the only conformance items — both are storefront-controlled Skyflow style tokens, fixable by darkening the focus-ring alpha/color and the error red. SKY-UI-07/08 need a real-device + screen-reader manual pass. Remaining items are cosmetic/UX polish.

---

## CVV Block Measurements (Scenario B — saved card `•••• 0015`, follow-up precise pass)

Method: `getBoundingClientRect` + `getComputedStyle` (read-only); inner CVV field tokens decoded from the Skyflow iframe `src` (cross-origin contentDocument blocked, as expected). Desktop = 1280px. Inner field = the CVV `<input>` inside the cross-origin Skyflow iframe (geometry inferred from tokens).

### 1. Geometry & vertical gaps (desktop 1280px)

| Element | x | y | w | h | border / radius |
|---------|---|---|---|---|-----------------|
| "Saved cards" label (`.vc-label--md`) | 61 | 517 | 334 | 20 | 0 / 0; `margin-bottom 2px`, font 16/20 **700** |
| Saved-cards dropdown (`.vc-select__button`) | 61 | 539 | 334 | **74** | 1px `#d4d4d4` / 8px |
| CVV iframe group (outer) | 57* | 629 | 672 | **150** | 0 / 0 |
| CVV iframe wrapper (`-mx-1 max-w-2xl`) | 57* | 629 | 672 | 150 | margin `0 −4px` |
| Inner CVV `<input>` (from tokens) | — | — | **96 (6rem)** | **~46** (20 lh + 24 pad + 2 bdr) | 1px `#a3a3a3` / .5rem(8px), pad .75rem(12px) |
| Next block "ORDER COMMENT" header | 61 | ~803 | — | — | — |

\* iframe x=57 is 4px left of the container (x=61) because the wrapper applies `-mx-1` (−4px) to cancel the iframe's internal `padding:0 4px`; the **visible field left edge realigns to x=61**.

**Vertical gaps:** label→dropdown = **2px** (label margin-bottom) · dropdown→iframe = **16px** · iframe group bottom→next section ≈ **24px** (paymentcard body bottom 803 → ORDER COMMENT). All gaps land on the 4px grid (2 is the label's sub-step; 16 and 24 are primary 8px-grid steps).

### 2. Paddings/margins vs references

| Property | CVV inner field (Skyflow token) | Native theme input (`vc-textarea`) | Saved-cards dropdown (`vc-select`) |
|----------|--------------------------------|-----------------------------------|-----------------------------------|
| Padding | **0.75rem = 12px** | **12px** | content-padded to h74 (icon-driven) |
| Border | 1px `#a3a3a3` | 1px `#d4d4d4` | 1px `#d4d4d4` |
| Radius | **.5rem = 8px** | **8px** | **8px** |
| Font | 1rem/1.25rem (16/20), 400 | 16/20, 400 | 16/20 |
| Outer wrapper margin | `0 −4px` (grid-cancel) | 0 | 0 |

**Verdict:** padding (12px), radius (8px), font (16/20) **match the native theme input exactly**. The only token divergence is **border color** `#a3a3a3` (CVV) vs `#d4d4d4` (native) — the same SKY-UI-02 finding from the first pass, now confirmed numerically (darker iframe border). All paddings are 8px-grid-clean; no off-grid values (no 13/27/41px).

### 3. Alignment (left/right edges)

| Edge | Label | Dropdown | CVV iframe (wrapper) | CVV visible field |
|------|-------|----------|----------------------|-------------------|
| Left x (desktop) | 61 | 61 | 57 (−4 wrap) | **61** (realigned) |
| Left x (375) | 23 | 23 | 19 (−4 wrap) | **23** (realigned) |

**Verdict:** label / dropdown / CVV-field left edges **align to within 0px** at every breakpoint (the −4px on the iframe wrapper is an intentional grid-cancel, not a misalignment). **PASS, no >1px drift.**
Right edges: CVV field is **intentionally narrow** — 96px (6rem) field vs 334px dropdown (desktop) / 439px (mobile). Ratio field:container ≈ 0.29 (desktop), ~0.22 (mobile). This is a deliberate "CVV is 3–4 digits" sizing decision (Skyflow `width: 6rem` token), leaving whitespace to the right — standard CVV-field convention, not a layout defect.

### 4. Field-height consistency

| State | iframe group height | inner field height |
|-------|--------------------|--------------------|
| CVV-only (`layout [1]`) | **150px** | ~46px |
| New-card (`layout [1,1,2]`) | **240px** | ~46px (same tokens) |
| Native textarea (ref) | 106px (multi-line) | n/a |
| Native dropdown (ref) | 74px (icon+text+chevron) | n/a |

**Verdict:** CVV field and new-card form fields share **identical inner tokens** (decoded byte-for-byte the same `inputStyles.base` except `width` and `textSecurity`), so rendered field heights are **consistent (~46px)** across CVV-only and full-form. The 150 vs 240 group-height difference is purely the number of field rows (1 vs 3), expected. The dropdown (74px) is taller than the CVV field (46px) by design — it renders a 40px card icon + masked text + chevron (native VcSelect sizing, not Skyflow).

### 5. Inner-field tokens — CVV vs full-form (decoded)

Identical across both element types:
`fontFamily Lato` · `fontSize 1rem` · `lineHeight 1.25rem` · `fontWeight 400` · `padding 0.75rem` · `borderRadius .5rem` · `border 1px solid #a3a3a3` · focus `box-shadow 0 0 0 3px rgb(from #996c5a / 0.3)` · invalid `1px solid #de3131` · label `1rem/700, paddingBottom .25rem, #0a0a0a` · errorText `0.625rem #de3131, minHeight 0.75rem` · container `gap 24px, padding 0 4px`.
**Only differences:** CVV `width: 6rem` (full-form fields `width: 100%`) and CVV `textSecurity: disc` / masking (full-form card-number unmasked). → One shared token set, parameterized only by width/masking. Deliberate, not ad-hoc.

### 6. Breakpoints (375 / 768 / desktop)

| Metric | Desktop 1280 | 768 | 375 (clamped 500) |
|--------|--------------|-----|-------------------|
| Horizontal overflow | none | none (753≤768) | none (485≤500) |
| gap label→dropdown | 2px | 2px | 2px |
| gap dropdown→iframe | 16px | 16px | 16px |
| Left-edge alignment (label/dd/field) | 0px drift | 0px drift | 0px drift |
| Dropdown height | 74px | 72px | 74px |
| CVV iframe group height | 150px | 150px | 150px |
| Inner CVV field | 96×~46px | 96×~46px | 96×~46px |
| Touch target (field/dropdown) | ≥46px | ≥46px | ≥46px (≥24 AA, ≥44 mobile) |

**Verdict:** layout is **stable and identical across all breakpoints** — gaps (2/16px), alignment (0px drift), and field/group heights do not change; the block just narrows to the column width. No compression below the 24px touch-target floor; CVV field stays ~46px tall. No mobile misalignment or overflow. Evidence: `B-cvv-block-measurements.png` (desktop). 768 + 375 verified clean in-session.

### Design read
The CVV block's spacing is **deliberate and on the theme's 4/8px grid**, not ad-hoc:
- All paddings/gaps resolve to grid values: field padding 12px, container gap 24px, label gap 2px, dropdown→field 16px, block→next-section ~24px.
- The Skyflow inner field **reuses the native theme input's exact padding (12px), radius (8px) and font (16/20)** — a single shared token set is pushed into Skyflow and parameterized only by width/masking, so the iframe field is visually indistinguishable from a native field except for the one `#a3a3a3` vs `#d4d4d4` border-color delta (SKY-UI-02).
- The `-mx-1` negative-margin wrapper is an intentional, correct grid-cancel so the masked-field content aligns to the same left rail as the label and dropdown (verified 0px visual drift at all breakpoints).
- The narrow 6rem CVV field is a deliberate convention, not a stretched/short bug.

**Only numeric nit:** the iframe border `#a3a3a3` is one step darker than the theme's `#d4d4d4` input border (SKY-UI-02, Low). Everything else is grid-clean and consistent.
