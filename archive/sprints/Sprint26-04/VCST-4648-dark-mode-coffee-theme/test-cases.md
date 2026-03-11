# Test Checklist — VCST-4648: Implement Dark Mode (Coffee Theme)

**JIRA:** [VCST-4648](https://virtocommerce.atlassian.net/browse/VCST-4648)
**PR:** [vc-frontend#2200](https://github.com/VirtoCommerce/vc-frontend/pull/2200)
**Status:** Testing
**Assignee:** Maya Diachkovskaia
**Sprint:** Sprint 26-04
**Theme:** Coffee (QA environment)
**Date:** 2026-03-04

---

## Scope Summary

VCST-4648 implements a dark mode for the Coffee theme preset. Key implementation details from PR #2200:

- New `coffee.dark.json` palette defines all dark-mode CSS custom property values
- `useDarkMode` composable manages three modes: **system** / **light** / **dark**
- Preference is persisted to `localStorage` under key `vc-color-mode`
- Runtime injection writes CSS variables into a `<style id="vc-theme-variables">` tag
- FOUC (Flash of Unstyled Content) prevention script inserted in `index.html`
- `DarkModeToggle` component placed in the **header** and **mobile menu**
- `_dark.scss` provides additional SCSS overrides for edge cases not covered by CSS variables
- New i18n strings added for toggle control labels

Related stories:
- [VCST-4627](https://virtocommerce.atlassian.net/browse/VCST-4627) — Dark Themes (Spike, Done)
- [VCST-4702](https://virtocommerce.atlassian.net/browse/VCST-4702) — Implement Dark Mode (Mercury theme, In review)
- [VCST-4718](https://virtocommerce.atlassian.net/browse/VCST-4718) — Implement Dark Mode (Watermelon theme, In progress)

---

## Legend

| Symbol | Meaning |
|--------|---------|
| [ ] | Not executed |
| [P] | Pass |
| [F] | Fail — link to bug report |
| [B] | Blocked |
| P0 | Critical — blocks release if failing |
| P1 | High — must pass before sign-off |
| P2 | Medium — should pass; regression risk |
| P3 | Low — nice to have; edge case |

---

## Section 1 — Toggle UI: Presence and Placement

### 1.1 Desktop Header Toggle

| # | Priority | Test | Expected Result | Status | Notes |
|---|----------|------|-----------------|--------|-------|
| TC-DM-001 | P0 | Navigate to `FRONT_URL` (unauthenticated). Inspect the top header bar. | A theme toggle control is visible in the header between the currency selector and "Call us" link. | [ ] | Header label from sitemap: "Theme toggle" |
| TC-DM-002 | P0 | Inspect the toggle control — confirm it exposes three discrete options: **Light**, **Dark**, **System** (or equivalent icon-based variants). | Three distinct mode options are present and selectable. | [ ] | |
| TC-DM-003 | P1 | Sign in as a registered user (`USER_EMAIL`). Confirm the theme toggle remains in the header after authentication. | Toggle is still present and functional in the authenticated header layout. | [ ] | Header changes on auth — must re-validate presence |
| TC-DM-004 | P1 | Navigate to any catalog page (`/catalog`). Confirm toggle persists in the header during navigation. | Toggle is present on all pages that include the global header. | [ ] | |

### 1.2 Mobile Menu Toggle

| # | Priority | Test | Expected Result | Status | Notes |
|---|----------|------|-----------------|--------|-------|
| TC-DM-005 | P0 | Resize browser to 375 x 812 (mobile viewport). Open the mobile navigation menu (hamburger icon). | A `DarkModeToggle` component is visible inside the mobile menu. | [ ] | |
| TC-DM-006 | P1 | On mobile, confirm the toggle in the mobile menu offers the same three modes (Light / Dark / System) as the desktop header. | Both surfaces expose identical mode options. | [ ] | |
| TC-DM-007 | P2 | Set dark mode via the mobile menu toggle. Close the menu. | Dark theme is applied to the page behind the menu without requiring a page reload. | [ ] | |

---

## Section 2 — Mode Switching: Light / Dark / System

### 2.1 Switching to Dark Mode

| # | Priority | Test | Expected Result | Status | Notes |
|---|----------|------|-----------------|--------|-------|
| TC-DM-010 | P0 | With the page in Light mode (default), click the toggle and select **Dark**. | The page background transitions to a dark palette immediately. No full page reload occurs. | [ ] | |
| TC-DM-011 | P0 | After selecting Dark mode, inspect `document.documentElement` class list in DevTools. | The `<html>` element has the class `dark` applied. | [ ] | Implementation injects `html.dark` |
| TC-DM-012 | P0 | After selecting Dark mode, inspect `localStorage.getItem('vc-color-mode')` in DevTools console. | Value is `"dark"`. | [ ] | Key: `vc-color-mode` |
| TC-DM-013 | P0 | Verify the `<style id="vc-theme-variables">` tag contains dark palette CSS variable values after switching to Dark mode. | CSS custom properties in the style tag reflect `coffee.dark.json` values (dark background, light text). | [ ] | |

### 2.2 Switching to Light Mode

| # | Priority | Test | Expected Result | Status | Notes |
|---|----------|------|-----------------|--------|-------|
| TC-DM-014 | P0 | From Dark mode, click the toggle and select **Light**. | Page transitions back to light palette immediately. `html.dark` class is removed. | [ ] | |
| TC-DM-015 | P1 | After switching to Light, inspect `localStorage.getItem('vc-color-mode')`. | Value is `"light"`. | [ ] | |

### 2.3 System Mode (Auto)

| # | Priority | Test | Expected Result | Status | Notes |
|---|----------|------|-----------------|--------|-------|
| TC-DM-016 | P1 | Select **System** (Auto) mode. In DevTools, emulate a dark OS preference (`prefers-color-scheme: dark`). | Page adopts dark palette automatically, matching the OS preference. | [ ] | DevTools: Rendering panel > Emulate CSS media |
| TC-DM-017 | P1 | With System mode active, emulate a light OS preference. | Page adopts light palette automatically. | [ ] | |
| TC-DM-018 | P1 | Select System mode. Inspect `localStorage.getItem('vc-color-mode')`. | Value is `"system"` (or key is absent if the implementation uses absence to mean system). | [ ] | Verify actual stored value from implementation |
| TC-DM-019 | P2 | In System mode with dark OS preference active, manually switch to Light. Page goes light. Then switch back to System. | System mode re-reads OS preference; page returns to dark (matching OS). | [ ] | |

---

## Section 3 — Persistence and Session Behaviour

| # | Priority | Test | Expected Result | Status | Notes |
|---|----------|------|-----------------|--------|-------|
| TC-DM-020 | P0 | Set **Dark** mode. Reload the page (F5 / Ctrl+R). | Dark mode is still active immediately on reload — no flash of light content before the dark mode is applied. | [ ] | FOUC prevention script in `index.html` |
| TC-DM-021 | P0 | Set **Dark** mode. Close the browser tab and open `FRONT_URL` in a new tab. | Dark mode is active on page load. `localStorage` value persists across tabs. | [ ] | |
| TC-DM-022 | P1 | Set **Dark** mode. Navigate to several pages in sequence: `/catalog`, `/products-with-options`, `/cart`, `/account/dashboard`. | Dark mode persists across all page navigations without reverting to light. | [ ] | |
| TC-DM-023 | P1 | Set **Dark** mode while unauthenticated. Sign in as `USER_EMAIL`. | Dark mode preference is preserved after sign-in. | [ ] | Preference is stored in localStorage, not server-side |
| TC-DM-024 | P2 | Set **Dark** mode while authenticated. Sign out. | Dark mode preference is preserved after sign-out (localStorage is not cleared on logout). | [ ] | |
| TC-DM-025 | P2 | Open `FRONT_URL` in two browser tabs simultaneously. Set Dark mode in Tab 1. Switch to Tab 2 (without reload). | Tab 2 does NOT automatically change (localStorage events are cross-tab but the composable may not react). Document actual behaviour. | [ ] | Observe and document — no hard assertion on cross-tab sync unless spec requires it |
| TC-DM-026 | P3 | Clear `localStorage` manually via DevTools. Reload the page. | The page loads in the default mode (Light or System — verify which is the product default). | [ ] | |

---

## Section 4 — Visual Coverage: Pages and Components

For each item below, switch to Dark mode and verify that all interactive and content elements render with correct contrast, no hardcoded light colours bleeding through, and no invisible text.

### 4.1 Core Pages

| # | Priority | Page / URL | What to Verify | Status | Notes |
|---|----------|-----------|----------------|--------|-------|
| TC-DM-030 | P0 | Homepage `/` | Hero banner, category tiles, promotional banners, footer — all readable in dark. | [ ] | |
| TC-DM-031 | P0 | Catalog `/catalog` | Product cards, facet sidebar, sort dropdown, pagination controls. | [ ] | |
| TC-DM-032 | P0 | Product Detail Page (any PDP) | Product images, title, price, description, "Add to Cart" button, quantity stepper. | [ ] | Use `/products-with-options/configurable-caps-shirts/configurable-hat` |
| TC-DM-033 | P0 | Cart `/cart` | Cart line items, quantity steppers, totals panel, "Proceed to Checkout" button, "Save for Later" link. | [ ] | |
| TC-DM-034 | P0 | Checkout flow | All checkout steps: shipping address, delivery method, payment form, order summary. | [ ] | Verify Skyflow iframe background if visible |
| TC-DM-035 | P1 | Search results `/search?q=hoodie` | Search input field, result cards, no-results state. | [ ] | |
| TC-DM-036 | P1 | Account dashboard `/account/dashboard` | Dashboard sidebar, order cards, monthly spend chart. | [ ] | Authenticated only |
| TC-DM-037 | P1 | Order history `/account/orders` | Order table rows, status badges, filter/sort controls. | [ ] | |
| TC-DM-038 | P1 | Sign-in page `/sign-in` | Form fields, labels, "Sign in" button, error states. | [ ] | |
| TC-DM-039 | P1 | Sign-up page `/sign-up` | Registration form fields, submit button, validation messages. | [ ] | |
| TC-DM-040 | P2 | Quote requests `/account/quotes` | Quote list, status badges, action buttons. | [ ] | |
| TC-DM-041 | P2 | Company members `/company/members` | Member table, role badges, invite modal. | [ ] | |
| TC-DM-042 | P2 | Bulk order `/bulk-order` | Input grid, quantity fields, "Add to Cart" button. | [ ] | |
| TC-DM-043 | P2 | Compare `/compare` | Product comparison table — no white cells bleeding into dark background. | [ ] | |
| TC-DM-044 | P2 | Lists `/account/lists` | List titles, item rows, action icons. | [ ] | |
| TC-DM-045 | P3 | Contacts `/contacts` | Static content page — readable text and links in dark. | [ ] | |

### 4.2 UI Components

| # | Priority | Component | What to Verify | Status | Notes |
|---|----------|-----------|----------------|--------|-------|
| TC-DM-050 | P1 | Header | Logo, navigation links, icon buttons (cart, lists, compare), account menu button — all visible in dark. | [ ] | |
| TC-DM-051 | P1 | Footer | Footer links, copyright text — not invisible on dark background. | [ ] | |
| TC-DM-052 | P1 | Modal / Dialog | Background overlay, modal card background, close button — visible and accessible in dark. Verify on pickup-location modal and any checkout modals. | [ ] | |
| TC-DM-053 | P1 | Dropdown menus | Language selector, currency selector, "All Products" nav dropdown — items readable in dark. | [ ] | |
| TC-DM-054 | P1 | Facet sidebar | Filter checkboxes, colour swatches, range sliders, "Clear" links — all visible. | [ ] | |
| TC-DM-055 | P1 | Form inputs | Text inputs, select fields, date pickers — field background/border/text contrast meets readability. | [ ] | Inspect on checkout address form |
| TC-DM-056 | P1 | Buttons (primary, secondary, ghost) | CTA colours are not lost on dark background. "Add to Cart" primary button retains brand colour. | [ ] | |
| TC-DM-057 | P1 | Toast / Notification banners | Success, error, info toasts — text contrast is sufficient in dark. | [ ] | Trigger by adding item to cart |
| TC-DM-058 | P2 | Quantity stepper | +/- buttons and qty field are visible and correctly styled in dark. | [ ] | |
| TC-DM-059 | P2 | Price badges (sale, discount %) | Red sale price and strikethrough original price are readable in dark. | [ ] | |
| TC-DM-060 | P2 | Breadcrumbs | Links and separator characters are not invisible in dark. | [ ] | |
| TC-DM-061 | P2 | Pagination controls | Page number buttons and prev/next arrows are clearly visible. | [ ] | |
| TC-DM-062 | P2 | Skeleton loaders | Loading placeholders (shimmer) are visible in dark — not blending with dark background. | [ ] | |
| TC-DM-063 | P3 | Product image backgrounds | White-background product images display acceptably within dark cards. | [ ] | May be intentionally unaddressed by design |
| TC-DM-064 | P3 | Star rating component | Stars and rating text are legible in dark. | [ ] | |

---

## Section 5 — i18n and Localisation

| # | Priority | Test | Expected Result | Status | Notes |
|---|----------|------|-----------------|--------|-------|
| TC-DM-070 | P1 | Set the storefront language to **English**. Open the theme toggle. | Toggle labels ("Light", "Dark", "Auto"/"System") are shown in English. | [ ] | |
| TC-DM-071 | P1 | Set language to **Deutsch (de)**. Open the theme toggle. | Toggle labels appear in German (or the translation key is resolved — not shown as a raw key string). | [ ] | |
| TC-DM-072 | P2 | Set language to **русский (ru)**. Open the theme toggle. | Toggle labels appear in Russian or the i18n fallback is graceful (English). No raw translation key shown. | [ ] | |
| TC-DM-073 | P2 | Verify that no new i18n strings remain untranslated (shown as `t('key')` or raw key format) in any language on the dark mode toggle. | All translation keys resolve to human-readable strings. | [ ] | |

---

## Section 6 — Accessibility (WCAG 2.1 AA)

| # | Priority | Test | Expected Result | Status | Notes |
|---|----------|------|-----------------|--------|-------|
| TC-DM-080 | P1 | With dark mode active, run a contrast check on body text against the dark background. | Minimum 4.5:1 contrast ratio for normal text, 3:1 for large text (WCAG AA). | [ ] | Use DevTools accessibility panel or axe |
| TC-DM-081 | P1 | With dark mode active, verify CTA buttons ("Add to Cart", "Proceed to Checkout") meet contrast ratio requirements against their dark-mode background. | Button text contrast >= 4.5:1. | [ ] | |
| TC-DM-082 | P1 | Verify the `DarkModeToggle` control has an accessible `aria-label` or `aria-labelledby` attribute. | Screen readers can announce the toggle purpose. | [ ] | Inspect DOM in DevTools |
| TC-DM-083 | P1 | Keyboard-navigate to the theme toggle using Tab key. Activate with Space/Enter. | Toggle is reachable by keyboard, activates correctly, and focus outline is visible in both light and dark modes. | [ ] | |
| TC-DM-084 | P2 | With dark mode active on the sign-in page, verify placeholder text in form inputs meets contrast requirements. | Placeholder contrast >= 3:1 against input background (WCAG 1.4.3 advisory). | [ ] | |
| TC-DM-085 | P2 | With dark mode active, verify that focus rings on interactive elements are visible. | Focus indicators are not invisible due to dark background matching the focus ring colour. | [ ] | |

---

## Section 7 — FOUC (Flash of Unstyled Content) Prevention

| # | Priority | Test | Expected Result | Status | Notes |
|---|----------|------|-----------------|--------|-------|
| TC-DM-090 | P0 | With `vc-color-mode=dark` in localStorage, do a hard reload (Ctrl+Shift+R / Cmd+Shift+R). Observe the very first paint. | Page renders in dark mode from the first visible frame — no white flash before dark styles apply. | [ ] | The FOUC prevention script in `index.html` must execute before first paint |
| TC-DM-091 | P1 | With System mode + dark OS preference, do a hard reload. | Page renders in dark mode from the first visible frame. | [ ] | |
| TC-DM-092 | P2 | With `vc-color-mode=light` in localStorage, do a hard reload. | No dark flash before light styles apply. | [ ] | Less common but validate both directions |
| TC-DM-093 | P2 | Simulate a slow connection (DevTools: Network throttle → "Slow 3G"). Hard-reload with dark mode set. | Dark mode is applied before any stylesheets finish loading — the FOUC script must not depend on stylesheet load order. | [ ] | |

---

## Section 8 — Cross-Browser and Responsive

| # | Priority | Test | Expected Result | Status | Notes |
|---|----------|------|-----------------|--------|-------|
| TC-DM-100 | P1 | Open `FRONT_URL` in **Chrome** (playwright-chrome). Set dark mode. Navigate to homepage, catalog, cart. | Dark mode renders correctly across all three pages. | [ ] | |
| TC-DM-101 | P1 | Open `FRONT_URL` in **Firefox** (playwright-firefox). Set dark mode. Navigate to homepage, catalog, cart. | Dark mode renders correctly — no Firefox-specific CSS variable resolution issues. | [ ] | |
| TC-DM-102 | P1 | Open `FRONT_URL` in **Edge** (playwright-edge). Set dark mode. Navigate to homepage, catalog, cart. | Dark mode renders correctly in Edge. | [ ] | |
| TC-DM-103 | P1 | Set viewport to **1920x1080** (desktop). Verify dark mode layout. | No layout shifts or overlapping elements in dark mode at full desktop width. | [ ] | |
| TC-DM-104 | P1 | Set viewport to **768x1024** (tablet). Verify dark mode layout. | Dark mode renders correctly at tablet breakpoint. | [ ] | |
| TC-DM-105 | P1 | Set viewport to **375x812** (mobile). Verify dark mode layout. | Dark mode renders correctly at mobile breakpoint. Mobile menu toggle is accessible. | [ ] | |
| TC-DM-106 | P2 | Set viewport to **1280x720** (standard laptop). Verify no dark mode layout regressions. | Dark mode renders correctly at 1280px wide. | [ ] | |

---

## Section 9 — JavaScript Console Errors

| # | Priority | Test | Expected Result | Status | Notes |
|---|----------|------|-----------------|--------|-------|
| TC-DM-110 | P0 | Open DevTools console. Switch from Light to Dark mode. Switch from Dark to Light. Switch to System. | Zero JavaScript errors or unhandled promise rejections in the console during all three mode transitions. | [ ] | PR notes a Cursor Bugbot flag on localStorage parsing — verify this is resolved |
| TC-DM-111 | P0 | Hard reload in dark mode. Check console immediately after page load. | No errors from the FOUC prevention script or `useDarkMode` composable initialisation. | [ ] | |
| TC-DM-112 | P1 | Navigate across 5+ pages with dark mode active. Check console for accumulated errors. | No repeated or newly appearing errors tied to theme variables or CSS injection. | [ ] | |
| TC-DM-113 | P2 | Open the page with a corrupted `vc-color-mode` value (e.g., set `localStorage.setItem('vc-color-mode', 'invalid')`) then reload. | Page does not throw an unhandled exception — falls back gracefully to Light or System mode. | [ ] | PR noted a localStorage parsing bug flagged by Bugbot |

---

## Section 10 — Regression: Critical Revenue Flows in Dark Mode

Verify that dark mode does not break any critical user journeys. These are acceptance gates — failure in any P0 item here is a blocker.

| # | Priority | Flow | Steps | Expected Result | Status | Notes |
|---|----------|------|-------|-----------------|--------|-------|
| TC-DM-120 | P0 | Sign in flow | 1. Set dark mode. 2. Navigate to `/sign-in`. 3. Enter `USER_EMAIL` and `USER_PASSWORD`. 4. Click "Sign in". | Sign-in succeeds; user is redirected to dashboard or homepage. No UI breakage in dark mode. | [ ] | |
| TC-DM-121 | P0 | Add to cart | 1. Dark mode active. 2. Open `/products-with-options/configurable-caps-shirts/configurable-hat`. 3. Click "Add to Cart". | Item added successfully; cart count increments; success toast is readable in dark mode. | [ ] | |
| TC-DM-122 | P0 | Cart → Checkout navigation | 1. Dark mode active, item in cart. 2. Navigate to `/cart`. 3. Click "Proceed to Checkout". | Checkout page loads with dark theme applied; all form fields and section headings are readable. | [ ] | |
| TC-DM-123 | P0 | Checkout — shipping step | 1. On checkout in dark mode. 2. Fill in a shipping address. 3. Select a shipping method. | Shipping section renders correctly; address fields are legible; shipping method cards are readable. | [ ] | |
| TC-DM-124 | P0 | Checkout — payment step | 1. On checkout payment step in dark mode. 2. Enter Skyflow card details (use `SKYFLOW_VISA`, `SKYFLOW_EXPIRY`, `SKYFLOW_CVV`). | Skyflow payment iframe renders; card fields are visible; "Place Order" button is accessible. | [ ] | Skyflow iframe may not inherit dark CSS vars — check readability |
| TC-DM-125 | P0 | Place order | 1. Dark mode active. 2. Complete checkout. 3. Click "Place Order". | Order confirmation page displays in dark mode. Order number visible. | [ ] | |
| TC-DM-126 | P1 | Global search | 1. Dark mode active. 2. Click the search input. 3. Type "hoodie". 4. Submit search. | Search results page renders in dark; result cards, filters, and headings are all readable. | [ ] | |
| TC-DM-127 | P1 | Order history | 1. Authenticated, dark mode. 2. Navigate to `/account/orders`. | Order history table renders in dark; row text, status badges, and action links are readable. | [ ] | |
| TC-DM-128 | P1 | Registration | 1. Dark mode active (unauthenticated). 2. Navigate to `/sign-up`. 3. Fill in all fields. 4. Click "Create account". | Registration form is fully legible in dark; validation messages are readable; success/error state visible. | [ ] | |

---

## Section 11 — Edge Cases

| # | Priority | Test | Expected Result | Status | Notes |
|---|----------|------|-----------------|--------|-------|
| TC-DM-130 | P2 | Toggle rapidly between Light and Dark (5+ clicks in quick succession). | No visual corruption, no JS errors, final state matches last selection. | [ ] | Debounce/race condition check |
| TC-DM-131 | P2 | Switch to Dark mode mid-checkout (after entering shipping address, before payment). | Theme switches without resetting checkout form state. | [ ] | Vue reactivity stability |
| TC-DM-132 | P2 | Add item to cart in Light mode. Switch to Dark mode. Reload. | Cart items persist after mode change and reload. | [ ] | Verify localStorage for both cart and theme are independent |
| TC-DM-133 | P2 | Switch between all 14 language locales while Dark mode is active. | Dark mode remains active across all language switches. Toggle labels translate correctly (or fall back to English). | [ ] | |
| TC-DM-134 | P2 | Open storefront in a private/incognito window (no localStorage). | Page loads with the default mode (Light or System). No JS error about missing localStorage key. | [ ] | |
| TC-DM-135 | P2 | Switch to Dark mode while a modal is open (e.g., the ship-to selector modal). | Modal adopts dark theme correctly; no white modal box on dark background. | [ ] | |
| TC-DM-136 | P3 | Print preview with dark mode active (`Ctrl+P`). | Print preview shows light/legible output (browsers typically strip dark mode for print). Document actual behaviour. | [ ] | Informational — no hard pass/fail unless design spec addresses it |
| TC-DM-137 | P3 | Open storefront with JavaScript disabled. | Site either degrades gracefully (shows light mode static CSS) or shows a standard no-JS fallback message. No blank page. | [ ] | |

---

## Section 12 — Theme Isolation (Coffee vs Other Themes)

The Coffee dark mode must not affect other themes (Mercury, Watermelon, etc.).

| # | Priority | Test | Expected Result | Status | Notes |
|---|----------|------|-----------------|--------|-------|
| TC-DM-140 | P1 | Confirm the `coffee.dark.json` palette is scoped only to the Coffee theme preset. | CSS variables from coffee.dark.json are not applied when a different theme is active. | [ ] | Verify via `configPlugin` scoping — inspect `vc-theme-variables` style tag when not on Coffee theme |
| TC-DM-141 | P2 | If a Mercury or Watermelon theme environment is accessible, toggle dark mode there. | Dark mode on non-Coffee themes either has no effect (VCST-4702/4718 pending) or shows graceful degradation — not a broken UI. | [ ] | Note: VCST-4702 (Mercury) is In Review; VCST-4718 (Watermelon) is In Progress |

---

## Delegation Notes

| Agent | Test Case IDs | Rationale |
|-------|--------------|-----------|
| **qa-frontend-expert** (playwright-chrome) | TC-DM-010 to TC-DM-045, TC-DM-120 to TC-DM-128 | Storefront E2E flows, visual coverage across pages |
| **qa-testing-expert** (playwright-firefox) | TC-DM-090 to TC-DM-093 (FOUC), TC-DM-100 to TC-DM-106 (cross-browser), TC-DM-130 to TC-DM-137 (edge cases) | Interactive debugging, FOUC testing, cross-browser |
| **ui-ux-expert** (Chrome DevTools MCP) | TC-DM-080 to TC-DM-085 (accessibility), TC-DM-050 to TC-DM-064 (components) | Storybook component checks, WCAG contrast validation |
| **qa-backend-expert** | TC-DM-011 to TC-DM-013 (CSS variable inspection), TC-DM-110 to TC-DM-113 (console errors) | DOM/CSS state validation, localStorage verification |

---

## Test Execution Notes

- **Environment:** QA (`FRONT_URL`)
- **Theme:** Coffee (default QA theme)
- **Browser primary:** playwright-chrome
- **Dark mode toggle location:** Top header bar (desktop), mobile menu (mobile)
- **localStorage key:** `vc-color-mode`
- **CSS injection target:** `<style id="vc-theme-variables">`
- **Dark class applied to:** `<html class="dark">`
- **Known risk:** SonarCloud passed; one Bugbot concern on localStorage parsing (TC-DM-113 covers this)
- **Search index lag:** Not applicable for this feature (theme is client-side only)
- **Payment iframe:** Skyflow card fields render in an iframe — dark CSS variables may not propagate across iframe boundaries (TC-DM-124)

---

## Test Case Count Summary

| Priority | Count |
|----------|-------|
| P0 | 17 |
| P1 | 35 |
| P2 | 28 |
| P3 | 7 |
| **Total** | **87** |

---

*Generated by test-management-specialist on 2026-03-04*
*Ticket: [VCST-4648](https://virtocommerce.atlassian.net/browse/VCST-4648)*
*PR: [vc-frontend#2200](https://github.com/VirtoCommerce/vc-frontend/pull/2200)*
