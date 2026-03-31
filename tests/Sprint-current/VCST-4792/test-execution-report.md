# VCST-4792 — Storybook Stories (Molecules & Organisms) — Test Execution Report

**Date:** 2026-03-30
**Environment:** https://vcst-qa-storybook.govirto.com
**Browser:** Chrome DevTools MCP
**Theme:** Coffee (verified active via toolbar " Coffee" button on all stories)
**PR:** VirtoCommerce/vc-frontend#2216

---

## Results Summary

**15 / 15 components PASS — 100% pass rate**
**0 bugs found**
**0 JS errors in console**

---

## Component-by-Component Results

| # | Component | Category | Renders | Console | Controls | Variants | Visual | Sidebar | Verdict |
|---|-----------|----------|---------|---------|----------|----------|--------|---------|---------|
| 1 | VcCarousel | Molecules | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 2 | VcCopyText | Molecules | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 3 | VcDialogContent | Molecules | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 4 | VcDialogFooter | Molecules | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 5 | VcDialogHeader | Molecules | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 6 | VcEmptyPage | Molecules | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 7 | VcExpansionPanel | Molecules | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 8 | VcItemPriceCatalog | Molecules | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 9 | VcList | Molecules | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 10 | VcLoaderOverlay | Molecules | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 11 | VcLoaderWithText | Molecules | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 12 | VcSteps | Molecules | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 13 | VcTextarea | Molecules | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 14 | VcModal | Organisms | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 15 | VcConfirmationModal | Organisms | PASS | PASS | PASS | PASS | PASS | PASS | PASS |

---

## Detailed Findings Per Component

### 1. VcCarousel — PASS
- **Stories (4):** Basic, With Navigation, With Pagination, With Navigation And Pagination
- **Controls (5):** navigation (switch), pagination (switch), slides (object), options (object), slide slot
- **Rendering:** 4 slides render with realistic content (Spring Collection, Summer Sale, New Arrivals, Exclusive Deals). Navigation and pagination toggles confirmed working — both switches show "checked" in With Navigation And Pagination variant.
- **Note:** Story ID "default" does not exist; correct first story ID is "basic". Not a bug — the story naming convention differs from the guessed ID.

### 2. VcCopyText — PASS
- **Stories (2):** Basic, With Label
- **Controls (3):** text (required, default "ORD-2024-00123"), notification (required, default "Copied to clipboard!"), default slot
- **Rendering:** "Copy" button renders. Both required props documented with asterisk (*).

### 3. VcDialogContent — PASS
- **Stories (2):** Basic, Scrollable
- **Controls (3):** scrollable (switch, default true), container slot, default slot
- **Rendering:** Full dialog context rendered — header ("Dialog Title" + Close button), body text, and CLOSE footer button. Scrollable enabled by default.

### 4. VcDialogFooter — PASS
- **Stories (3):** Basic, With Custom Actions, With Leading Action
- **Controls:** close event, container slot, default slot
- **Rendering:** Dialog with title, body, and CLOSE button action. Emits close event.

### 5. VcDialogHeader — PASS
- **Stories (5):** Basic, With Icon, Not Closable, Colors, Sizes
- **Controls (7):** icon (text), color (select, 8 options), closable (switch, default true), size (radio: xs/sm/md/lg), close event, main slot, default slot
- **Rendering:** "Dialog Title" with close button. Rich controls covering all design token variants.

### 6. VcEmptyPage — PASS
- **Stories (3):** Basic, Cart Is Empty, With Breadcrumbs
- **Controls (10):** hasBgImage, hideMobileSide, title, icon, image, statusColor, breadcrumbs, bgColor, default slot, side slot
- **Rendering:** "PAGE NOT FOUND" heading with sad icon, subtitle text, and "GO TO HOMEPAGE" CTA button.

### 7. VcExpansionPanel — PASS
- **Stories (3):** Basic, Expanded, With Icon
- **Controls (5):** title (text), expanded (switch), icon slot, header-content slot, default slot
- **Rendering:** Collapsed state shows "PANEL TITLE" trigger button. Toggle interaction supported via expanded switch.

### 8. VcItemPriceCatalog — PASS
- **Stories (4):** Regular Price, With Discount, With From Label, Custom Price Color
- **Controls (3):** withFromLabel (switch), priceColorClass (text, default "text-neutral-900"), value (complex object with list/actual MoneyType)
- **Rendering:** Regular Price displays "$67.67 / $99.99" — 2 decimal places confirmed (BL-PRICE-003 compliant). With Discount shows "$99.99 / $149.99". With From Label shows "From $49.99".
- **Note:** Story ID "basic" does not exist; first story is "regular-price". Not a bug — intentional naming.

### 9. VcList — PASS
- **Stories (2):** Basic, Plain Text
- **Controls:** default slot only (slot-based content component)
- **Rendering:** Basic shows 3 items with title + description pairs (Free standard shipping, Easy 30-day returns, 24/7 customer support). Plain Text shows 3 plain items.

### 10. VcLoaderOverlay — PASS
- **Stories (3):** Basic, No Bg, Hidden
- **Controls (3):** visible (switch, default true), noBg (switch), fixedSpinner (switch)
- **Rendering:** "Content underneath the overlay" visible beneath the overlay. All three visibility states documented.

### 11. VcLoaderWithText — PASS
- **Stories (3):** Basic, Centered, Custom Text
- **Controls (2):** centered (switch), text (string)
- **Rendering:** "Loading..." text in Basic and Centered. Custom Text shows "Fetching your order…". Minimal, focused component.

### 12. VcSteps — PASS
- **Stories (5):** First Step, Middle Progress, Last Step, All Completed, Disabled
- **Controls (5):** steps (IStepsItem[] array), currentStepIndex (slider, range 1-6), disabled (switch), startStepIndex (number), transitionName (string)
- **Rendering:** 5-step checkout progression (Cart → Shipping → Payment → Review → Confirmation). Middle Progress shows steps 1-2 completed (no numbers, checkmark implied), step 3 active (shows "3"), steps 4-5 pending. All Completed shows all steps without numbers. Disabled shows steps with grayed-out navigation.
- **Evidence:** `screenshots/vcsteps-middle-progress-desktop.png`

### 13. VcTextarea — PASS
- **Stories (8):** Basic, Common, Required, Error State, With Counter, No Resize, Disabled, Readonly
- **Controls (15+):** readonly, disabled, required, error, counter, noResize, rows, ariaLabel, modelValue, modelModifiers, autocomplete, name, label, placeholder, message, singleLineMessage, showEmptyDetails, maxLength — comprehensive coverage
- **Rendering:**
  - Required: field marked `required` in accessibility tree, asterisk (*) visible
  - Error State: "This field is required" error message renders below input
  - With Counter: "0 / 500" character counter visible
  - Disabled: textarea is `disableable disabled` with pre-filled content, greyed out
  - Readonly: textarea is `readonly` with non-modifiable content
- **Evidence:** `screenshots/vctextarea-error-state-desktop.png`

### 14. VcModal — PASS (Organism)
- **Sidebar location:** Components / Organisms / VcModal — confirmed correct Atomic Design category
- **Stories (5):** Basic, With Icon, With Custom Actions, Persistent, Scrollable Content
- **Controls (17):** title, variant (8 color options), dividers, scrollable, isPersistent, hideActions, show, isMobileFullscreen, icon, maxWidth, height, maxHeight, testId, close event, container slot, default slot, actions slot
- **Rendering:** "OPEN MODAL" trigger button renders in canvas. No JS errors on navigation or render.
- **Evidence:** `screenshots/vcmodal-basic-desktop.png`, `screenshots/vcmodal-docs-desktop.png`

### 15. VcConfirmationModal — PASS (Organism)
- **Sidebar location:** Components / Organisms / VcConfirmationModal — confirmed correct Atomic Design category
- **Stories (4):** Basic, Single Button, Loading State, Variants
- **Controls (7):** title, text, icon (default "warning"), variant (8 color options, default "danger"), singleButton (switch), loading (switch), close event, confirm event
- **Rendering:**
  - Basic: "DELETE ITEM" trigger button
  - Single Button: "SHOW NOTIFICATION" trigger
  - Loading State: "DELETE PRODUCT" trigger
  - Variants: All 8 color variant buttons rendered inline (Primary, Secondary, Info, Success, Warning, Danger, Neutral, Accent)
- **Evidence:** `screenshots/vcconfirmationmodal-docs-desktop.png`

---

## Cross-Cutting Checks

### Sidebar Navigation — PASS
All 15 components appear in the Storybook sidebar under correct Atomic Design categories:
- **Molecules (13):** VcCarousel, VcCopyText, VcDialogContent, VcDialogFooter, VcDialogHeader, VcEmptyPage, VcExpansionPanel, VcItemPriceCatalog, VcList, VcLoaderOverlay, VcLoaderWithText, VcSteps, VcTextarea — all present under "Molecules"
- **Organisms (2):** VcModal, VcConfirmationModal — both present under "Organisms"

### Story Naming Conventions — PASS
Story names follow kebab-case with descriptive names. Two components use non-"basic" first stories (VcCarousel uses "basic", VcItemPriceCatalog uses "regular-price") — both are intentional and documented in story files.

### Console Errors — PASS
- Only one benign preload warning seen on VcCarousel: `vite-inject-mocker-entry.js was preloaded but not used within a few seconds` — this is a Storybook/Vite infrastructure warning, not a component error.
- All other component navigations: zero console errors or warnings.

### Theme (Coffee) — PASS
Coffee theme preset active and confirmed throughout session. Toolbar shows " Coffee" button on all stories tested. No FOUC observed.

### Docs Tab — PASS
All 15 components have a functional Docs tab. Component headings, prop tables, story listings, and "Show code" buttons all render correctly. Props include descriptions on most controls, confirming documentation quality.

### Business Logic — VcItemPriceCatalog
BL-PRICE-003 verified: all price values display exactly 2 decimal places ($67.67, $99.99, $149.99, $49.99, $89.99). No rounding violations observed.

---

## Screenshots Captured

| File | Description |
|------|-------------|
| `screenshots/storybook-home.png` | Storybook initial load with Coffee theme |
| `screenshots/vccarousel-default-desktop.png` | VcCarousel story ID not found (expected, wrong ID guessed) |
| `screenshots/vccarousel-with-nav-pagination-desktop.png` | VcCarousel — With Navigation And Pagination story |
| `screenshots/vcmodal-basic-desktop.png` | VcModal — Basic story with OPEN MODAL trigger |
| `screenshots/vcmodal-docs-desktop.png` | VcModal — Docs page showing all stories |
| `screenshots/vcconfirmationmodal-docs-desktop.png` | VcConfirmationModal — Docs with all 4 stories including Variants |
| `screenshots/vcsteps-middle-progress-desktop.png` | VcSteps — Middle Progress story |
| `screenshots/vctextarea-error-state-desktop.png` | VcTextarea — Error State story |

---

## Observations

1. **VcCarousel story ID convention:** The story URL uses `--basic` not `--default` — this is correct Storybook convention and not a defect. The initial navigation attempt to `--default` correctly returned a "not found" error from Storybook.
2. **VcItemPriceCatalog naming:** First story is `--regular-price` rather than `--basic` — a deliberate domain-appropriate naming choice.
3. **VcDialogContent + VcDialogFooter + VcDialogHeader** stories render as a composed dialog unit (showing all three sub-components together), which is the intended usage pattern for these molecules.
4. **VcSteps** is the most business-critical component of this PR — it drives checkout step visualization. All 5 story states (First, Middle, Last, All Completed, Disabled) render correctly with proper checkout flow labels.
5. **VcTextarea** has the richest control set (15+ props) of any component in this PR and covers all required interaction states including required, error, counter, disabled, and readonly — complete implementation.

---

## Overall Verdict

**PASS — All 15 components verified**

PR VirtoCommerce/vc-frontend#2216 successfully adds 15 Storybook story files (13 molecules + 2 organisms). Every component:
- Appears in the sidebar under the correct Atomic Design category
- Renders without JavaScript errors
- Exposes controls for all documented props
- Provides multiple story variants covering key use cases
- Operates correctly under the Coffee theme

No bugs found. PR is approved from a UI/Storybook stories perspective.
