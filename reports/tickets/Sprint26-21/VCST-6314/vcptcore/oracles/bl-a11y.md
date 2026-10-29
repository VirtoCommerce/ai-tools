# BL invariants — extract (4 of 232)

> Verbatim slice of the oracle rendered from `.claude\knowledge\oracles\bl/*.yaml`, produced by `npm run bl:extract -- --domain a11y`.
> **This is a SUBSET.** Invariants outside the filter are not shown and are not absent — if the
> task turns out to touch another domain, extract that domain too rather than concluding no rule
> applies. The `BL-*` ids are the citation contract the suites use; cite them, do not renumber.

**Included:** BL-A11Y-001, BL-A11Y-002, BL-A11Y-003, BL-A11Y-004

---

### BL-A11Y-001: Keyboard operability and focus management `[P1-data]`
- **Rule:** On the accessibility-gated storefront themes, every interactive element MUST be reachable and operable via keyboard alone, in a logical DOM/tab order, with a visible focus indicator on the currently focused element (WCAG 2.1.1, 2.4.3, 2.4.7). A modal/dialog overlay MUST contain keyboard focus within itself while open — Tab from its last focusable element cycles to its first, Shift+Tab from the first cycles to the last — and closing it (via Escape or an explicit close control) MUST release the trap and return focus to the triggering control.
- **Verify:** From a neutral starting point, Tab through the surface and confirm every interactive element receives focus in DOM order with a visible focus ring. Open a modal, Tab to its last focusable element and confirm wrap to the first (Shift+Tab from the first wraps to the last). Close it and confirm focus returns to the trigger and Tab no longer reaches the closed modal's contents.
- **Violation signal:** An element skipped by Tab; `outline:none` with no visible replacement; Tab exits an open modal to page content behind it; focus remains trapped, or does not return to the trigger, after close.
- **Agents:** ui-ux-expert, qa-frontend-expert
- **Docs:** w3.org/TR/WCAG22#keyboard (SC 2.1.1), #focus-order (SC 2.4.3), #focus-visible (SC 2.4.7) — keyboard operable, logical order, visible focus
- **Docs:** w3.org/TR/WCAG22#no-keyboard-trap (SC 2.1.2) — focus can leave any component
- **Source:** `client-app/ui-kit/composables/useFocusManagement.ts` — the focusable-elements selector and the Tab-cycle keydown handler that wraps focus at the first/last element when `trapFocus` is enabled; wired into `client-app/ui-kit/components/molecules/dialog/vc-dialog.vue`.
- **Source:** VCST-5671 (Done) — overflow popover was not keyboard reachable and focus did not move into it; fixed
- **Trust:** DECLARED
- **Lifecycle:** SUSPECT — [case] SR-CO-051 failed in REG-2026-10-06-1457

### BL-A11Y-002: Accessible naming and label association `[P1-data]`
- **Rule:** Every interactive control MUST expose a non-empty, contextual accessible name to assistive technology (WCAG 4.1.2), distinct from a generic element-type label. Every visible field label MUST be programmatically associated with its input via `<label for>`/`aria-labelledby`/`aria-label` (WCAG 1.3.1). Every informative image's `alt` describes its content/purpose; a purely decorative image carries `alt=""` (WCAG 1.1.1).
- **Verify:** Capture the accessibility tree for the surface and confirm every button/link/input exposes a non-generic accessible name; confirm each visible label's `for`/`id` pairing or `aria-labelledby` resolves correctly; confirm `<img alt>` is present and non-generic (or explicitly empty for decorative images). Corroborate with an axe-core scan (`button-name`, `link-name`, `label`, `image-alt`) — zero violations required.
- **Violation signal:** An icon-only control announced as bare "button"/"link"; an input with no associated label; a product image missing `alt`; `aria-labelledby` referencing a non-existent id.
- **Agents:** ui-ux-expert, qa-frontend-expert
- **Docs:** w3.org/TR/WCAG22#name-role-value (SC 4.1.2), #info-and-relationships (SC 1.3.1), #non-text-content (SC 1.1.1) — accessible names, programmatic label association, alt text
- **Source:** `client-app/shared/cart/components/coupon-card.vue` — Apply/Remove buttons receive a dynamic, contextual `aria-label` from i18n keys via the `VcButton` `ariaLabel` prop, rather than a static generic label; `client-app/shared/wishlists/components/wishlist-card.vue` similarly attaches a contextual `aria-label` to its date block rather than relying on the bare visible date text.
- **Source:** VCST-4993 (Done) — checkout address popup search input had a wrong aria-label; fixed
- **Source:** VCST-5860 (Done) — icon toggle buttons had no accessible name; fixed
- **Trust:** DECLARED
- **Lifecycle:** SUSPECT — [case] MSNF-090 failed in REG-2026-10-01-1243

### BL-A11Y-003: Color contrast and non-color status differentiation `[P1-data]`
- **Rule:** On the accessibility-gated storefront themes, body/paragraph text MUST meet contrast ≥ 4.5:1 against its background, and large text (≥18px, or ≥14px bold) ≥ 3:1 (WCAG 1.4.3). UI-component boundaries and meaning-bearing graphical/icon affordances MUST meet ≥ 3:1 against their adjacent background (WCAG 1.4.11). Status/meaning (error, success, warning) MUST NOT be conveyed by color alone (WCAG 1.4.1).
- **Verify:** Run an axe-core `color-contrast` scan against the surface on an accessibility-gated theme; zero violations required. For a color-conveyed status, confirm an accompanying icon/text label independent of color, and recheck under a colorblind-vision emulation.
- **Violation signal:** A foreground/background pair below the 4.5:1/3:1 threshold; an axe `color-contrast` violation; a status relying on red/green alone with no icon or text.
- **Agents:** ui-ux-expert, qa-frontend-expert
- **Docs:** w3.org/TR/WCAG22#contrast-minimum (SC 1.4.3), #non-text-contrast (SC 1.4.11), #use-of-color (SC 1.4.1) — 4.5:1 / 3:1 contrast; no colour-only meaning
- **Source:** `client-app/shared/wishlists/components/wishlist-card.vue` — the card's icon foreground is styled via a semantic design token rather than a raw hex value, routing contrast through the design-token system that governs compliance.
- **Source:** VCST-5911 (Done) — storefront status dot below 3:1 and status conveyed by colour alone; fixed
- **Trust:** DECLARED
- **Lifecycle:** SUSPECT — [case] MSNF-090 failed in REG-2026-10-01-1243

### BL-A11Y-004: Programmatic status, state, and role correctness (axe-clean) `[P1-data]`
- **Rule:** Every ARIA role/state/property a component sets MUST be valid, complete, and reflect the control's actual state (WCAG 4.1.2). A message appearing asynchronously in response to a user action MUST be exposed to assistive technology at the moment it appears — via `role="alert"`/`aria-live`, or an explicit focus shift plus `aria-describedby` linkage to the field it concerns — not by visual styling alone (WCAG 4.1.3; WCAG 3.3.1 for field-level errors). A surface MUST be free of axe-core Critical/Serious violations.
- **Verify:** Trigger the async state (invalid submit, coupon apply, menu/tab toggle) and confirm the resulting node carries `role="alert"`/a live region or receives focus, with a field-level error additionally carrying a matching `aria-describedby`. Run a full axe-core scan; zero Critical/Serious violations required.
- **Violation signal:** An error/status message with no `role="alert"`/`aria-live` and no focus shift; `aria-expanded`/`aria-selected` not toggling with visible state; an axe Critical or Serious violation.
- **Agents:** ui-ux-expert, qa-frontend-expert
- **Docs:** w3.org/TR/WCAG22#name-role-value (SC 4.1.2), #status-messages (SC 4.1.3), #error-identification (SC 3.3.1) — valid state, status messages exposed to AT, errors identified
- **Source:** `client-app/shared/cart/components/coupon-card.vue` — the coupon-apply error paragraph is conditionally mounted with `role="alert"` only when an error exists, so its appearance in the DOM itself triggers the assistive-technology alert announcement.
- **Source:** VCST-5912 (Done) — quantity spinbutton exposed aria-invalid=true and a wrong aria-valuenow on untouched render; fixed
- **Trust:** DECLARED
- **Lifecycle:** SUSPECT — [bug] VCST-5878 compare table body scroller below md has no focusable content (axe scrollable-region-focusable, Serious) — pre-existing; CMP-047 failed on it in REG-2026-10-12-1832

---

