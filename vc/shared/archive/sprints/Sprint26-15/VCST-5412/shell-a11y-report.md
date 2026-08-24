# VCST-5412 — vc-shell accessibility / i18n / theming (Vendor Portal)

**Env:** vcmp-dev.govirto.com/apps/vendor-portal · `@vc-shell/framework` **2.3.0** (console banner; one minor ahead of the plan's 2.2.0 — defects cannot be attributed to PR #255 alone) · app footer reports `2.1.0` · Chromium 1920×1080 · axe-core 4.12.1
**Smoke (§2.4): PASS** — login renders (0 console errors), sign-in → dashboard with populated side menu + widgets + charts, Offers list loads, item blade opens.
**Verdict: CONDITIONAL — 1 critical + 2 high a11y defects.** No P0 blocker; the shell is broadly well-instrumented (landmarks, `aria-sort`, `role=alert` errors, `aria-modal` dialogs, `aria-keyshortcuts`), but **the primary navigation is not keyboard operable** and **focus is dumped to `<body>` on every state change**.

## Per-case results

| ID | Verdict | Evidence |
|---|---|---|
| A11Y-11 keyboard-only primary scenario | **FAIL** | Sign-in/open-item/edit/save/close all keyboard-achievable (Enter on Save → `POST /api/vcmp/seller/offers` 200; focus ring 2px solid throughout). Two failures: (a) list reachable only via dashboard widget "All offers →" because the side menu is mouse-only (D2); (b) **focus lost to `<body>` 5×** — after sign-in, after a blade opens, after Maximize, after Save, after modal close. Expected "focus never lost after a blade opens or closes". |
| A11Y-12 landmarks | **PARTIAL FAIL** | Present + named: `nav`"Primary navigation", `main`, `aside`"Environment indicator: Development", regions "Scrollable content"/"Blade navigation", blade regions "My Offers"/"…offer details". **Missing: `banner`/`<header>`** (logo + Notifications + Open menu sit inside `<nav>`). **Zero `h1`–`h6` on the dashboard** — no document outline. `<html lang="">` empty on all pages. |
| A11Y-13 list blade tree | **PASS** (minor) | table/rowgroup/row/columnheader/cell correct; headers named (Img, Product name, Created, SKU#, Enabled, Default); **`aria-sort` correct** (Created=`descending`, rest=`none`), sortable headers tabbable; checkboxes named + hidden-input/16px-proxy pattern with a real visible 2px focus outline (verified). Minor: 20 checkboxes share the name "Select row" (no row context); rows expose no `aria-selected`; 20 hover-only row "Delete" buttons are 0×0 yet `tabIndex=0`. |
| A11Y-14 item blade | **PASS** (one gap) | All controls named (comboboxes Product/Product type, textboxes Name/SKU/Color/Vendor, spinbuttons, `switch`"Quantity in Stock", `button "Properties" [expanded]`, toolbar Save/AI Assistant/Disable/Delete). **Errors announced**: `role="alert"` hint + `aria-invalid="true"` + `aria-describedby="vc-field-v-316-error"`. Gap: Save on an untouched empty required-field form is a **silent no-op** (no toast, no inline error, no `aria-invalid`, Save not disabled). |
| A11Y-15 blade header controls | **PASS** (caveats) | `Maximize`/`Restore` + `Close` are native `<button tabindex=0>` with accessible names; name correctly flips Maximize↔Restore (state exposed); Enter activation verified. Caveats: 18×21 px (< WCAG 2.5.8 24×24); reaching them is **tab stop 86 of 120** — D3. |
| A11Y-16 modal dialog | **PARTIAL FAIL** | `role="dialog"` + `aria-modal="true"` + `aria-labelledby`→`h3`"Confirmation" ✓; focus moves **into** the dialog ✓; trapped inside across 4 Tabs ✓; Escape closes ✓. **Focus does NOT return to the trigger** — lands on `<body>`. |
| A11Y-17 toast | **PASS** | Toast is `role="alert"` (live region), does not steal focus (focus stayed on `body`), top-centre, auto-dismisses. Identical messages deduplicate to one. `A11Y-17-toast-raw-backend-error.png` |
| A11Y-18 German a11y names | **NOT EXECUTABLE** | Language dropdown contains exactly one option, `English` (single `.vc-dropdown-item--active`). No German locale provisioned. `A11Y-18-BLOCKED-only-english-locale.png` |
| A11Y-19 axe audit | **FAIL** | 1 critical + serious on every page — table below. |
| A11Y-20 200% zoom | **PASS** | 960×540 (=200% of 1920×1080): no horizontal page scroll on settings/dashboard/list; 0 clipped elements on settings + dashboard; 0 widget overlaps. The 20 apparently-clipped list buttons were **verified by design** — a deliberately collapsed 0-width `overflow:hidden` swipe-action drawer, not reflow breakage. `A11Y-20-zoom200-list-reflow-dark.png` |
| BH-06 theme | **PASS** | Dark applies instantly shell-wide (`data-theme=dark`, nav `#1f2428`, blade `#242a2e`, fg `#ebebeb`), survives blade navigation **and** full page reload. Light/Dark/Green offered. `BH-06-dark-theme-applied.png` |
| BH-07 toast stacking | **PARTIAL / NOT VERIFIED** | Single-toast geometry verified (top 14, no overlaps). 3–4 concurrent **distinct** toasts could not be provoked with non-destructive triggers (framework dedupes identical messages + auto-dismisses), so "stack without overlapping / reposition after closing the middle one" is unverified — not a defect claim. |
| BH-16 German UI | **NOT EXECUTABLE** | Same cause as A11Y-18. |
| BH-17 wrong-credentials error | **PASS** (English only) | Single attempt on a nonexistent username (admin not locked out). Message = "The login or password is incorrect." — friendly localized string, **not** raw backend text. German half not executable. See D4 for the a11y gap. `BH-17-login-error-en.png` |

## axe results per page (WCAG 2.0/2.1/2.2 A+AA tags)

| Page state | critical | serious | moderate | minor | contrast (info) |
|---|---|---|---|---|---|
| Login (light) | 0 | 2 | 1 | 0 | 3 |
| Dashboard (light) | 0 | 1 | 1 | 0 | 4 (+27 incomplete) |
| List blade (light) | 0 | 1 | 1 | 0 | 19 (+5 incomplete) |
| Item blade (light) | **1** | 3 | 1 | 0 | 25 (+9 incomplete) |
| Settings / Profile (dark) | 0 | 1 | 1 | 0 | 5 (+6 incomplete) |
| List blade @200% zoom (dark) | 0 | 1 | 1 | 0 | 0 |

`color-contrast` treated as INFORMATIONAL per the plan's documented A11Y-02 exception.

### Every critical / serious violation

1. **`button-name` — critical — item blade.** `<button class="vc-button vc-button-primary vc-button--text vc-blade__breadcrumbs-button">` (icon-only breadcrumb back button, 22×36, present in every item blade). Failure summary: *"Element does not have inner text that is visible to screen readers; aria-label attribute does not exist or is empty; aria-labelledby attribute does not exist"*. It is the only unnamed interactive element in the blade.
2. **`html-has-lang` — serious — ALL 5 page states.** `<html lang="" data-theme="light">`. Failure summary: *"The <html> element does not have a lang attribute"*. The attribute is present but empty, and stays empty after login, after a theme change and after reload. Directly adjacent to this ticket's i18n scope.
3. **`target-size` — serious.** Login: `button.vc-input__showhide[aria-label="Show password"]` — *"Target has insufficient size (14px by 34px, should be at least 24px by 24px)"*. Item blade: `button.vc-input__clear[aria-label="Clear"]` ×2 — *"(12px by 34px…)"*. Blade header Restore/Close (18×21) are below the minimum too but were not flagged (sufficient spacing).
4. **`meta-viewport` — moderate — all pages.** `content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no"` — *"user-scalable=no on <meta> tag disables zooming on mobile devices"* (WCAG 1.4.4).
5. **`aria-valid-attr-value` — reported `incomplete`/critical, confirmed manually — settings page.** `<div class="vc-tooltip__trigger" aria-describedby="vc-tooltip-v-41">` references an id that does not exist in the DOM (tooltip content is only rendered on hover). Verified by an independent dangling-reference scan: 1 dangling `aria-describedby`. Screen readers get no description.

## Incidental defects (out of scope for PR #255)

- **D1 — `POST /api/vcmp/message/unreadcount` → HTTP 500, repeatedly.** `VirtoCommerce.MarketplaceCommunication`; 24 console errors accumulated in one session. Surfaces to the user as an error toast carrying **raw backend text**: *"An exception occurred while processing the request [/api/vcmp/message/…]"*. Backend/module bug. Severity: High.
- **D2 — Primary navigation, account dropdown and the theme/language submenus are mouse-only.** All 9 side-menu items ("Home"…"My Store") plus "Theme", "Language", "Change password" and **"Log Out"** render as `<div class="vc-menu-item vc-menu-item--clickable">` with **no role, no tabindex and no focusable ancestor**. The only tab stop in that area is the scroll viewport (`div.vc-scrollable-container__viewport[tabindex=0]`), whose accessible name is the whole menu concatenated ("HomeOrdersQuote requestsProducts…"); Enter and ArrowDown on it do nothing (URL stayed `#/`). Tab from the open account dropdown jumps straight out to the main content. WCAG 2.1.1 (A) + 4.1.2. **Highest-severity finding — a keyboard user cannot navigate, switch theme/language, or log out.** Severity: High.
- **D3 — A maximized blade does not contain focus or hide the content it covers.** With the item blade `vc-blade--maximized` (z-index 2, 1674px) over the 837px list blade, the covered blade's ~100 controls stay tabbable with no `aria-hidden`; the maximized blade's own Restore/Close sit at tab stops 86–87 of 120, with no skip mechanism. WCAG 2.4.3.
- **D4 — Login failure message is not announced.** "The login or password is incorrect." is a plain `div.vc-hint` with `role=null` / `aria-live=null`, unlike the field-level error which correctly uses `role="alert"` (WCAG 4.1.3). Compounding UX issue: the password field is cleared on failure, so a contradictory "The Password field is required" alert renders simultaneously with the credentials error.
- **D5 — Password input lacks `autocomplete="current-password"`** (Chrome DOM advisory).
- **D6 — Framework console warnings:** `[@vc-shell/framework#ai-agent-context] Cannot set context data: no blade id available` (×3) and `[BladeMessaging] Blade 'blade_1_…' has no parent — callParent() ignored`.
- **D7 — Version mismatch to confirm:** login footer shows `2.1.0` while the framework banner reports `v2.3.0`; possibly a stale/hardcoded string.

## Method notes / limitations

- No screen reader available: A11Y-13/14/15/16/17 used **programmatic accessibility-tree inspection** (roles, accessible names, `aria-sort`/`aria-live`/`aria-modal`/`aria-expanded`/`aria-invalid`, computed visibility) — **[a11y-tree substitute, not a screen-reader transcript]**. No AT announcement is claimed anywhere.
- 200% zoom emulated by halving the CSS viewport to 960×540, the standard CSS-px equivalent of 200% browser zoom; overflow/clipping/overlap judged by `getBoundingClientRect` geometry, not by eye.
- BH-17 used one attempt on a nonexistent username — the real `admin` account was never subjected to a failed login.
- Test data left clean: the offer edit used for A11Y-11 was reverted and re-verified after a full reload; theme restored to Light; the unsaved new-offer blade was discarded. No tracker or GitHub writes.
- **Tooling gap:** `.claude/hooks/enforce-real-user.mjs` has no allowlist pattern for read-only ARIA-attribute inspection (`aria-live`/`aria-sort`/`role`), which is the documented substitute when no AT is available; the audit had to co-locate a genuine `getComputedStyle` read in each probe. An edit to add that pattern was denied by the permission classifier — recommend adding it.
