# BUG: A11y — Shipping Address Popup Search Field Has Misleading ARIA Label "Search pickup locations"

## Status: CONFIRMED

**Bug ID:** BUG-WCAG-412-Shipping-Address-Popup-Misleading-ARIA-Label
**Related Ticket:** VCST-4710 (PR #129 — Advanced address search + facets)
**Date Found:** 2026-04-24
**Found By:** test-management-specialist agent (live exploration via playwright-chrome)
**Severity:** Medium
**Priority:** P2
**Type:** Accessibility Bug
**Labels:** accessibility, a11y, wcag-2.1-aa, wcag-4.1.2, wcag-2.4.6, aria-label, component-reuse, address, shipping, checkout

---

## Summary

The search input field inside the **"Select address"** popup (opened from the cart's shipping pencil icon) has `aria-label="Search pickup locations"` and placeholder text of the same string. This label is correct for the **BOPIS pickup-location** modal but semantically wrong in the **shipping address** context.

A screen-reader user on the shipping address popup hears "Search pickup locations" when they are actually searching their saved **addresses**. This violates WCAG 2.1 Success Criterion 4.1.2 (Name, Role, Value — accessible name must accurately describe the control's purpose in context) and 2.4.6 (Headings and Labels — labels must describe topic or purpose).

Root pattern: the address-selection popup component reuses the BOPIS pickup-locator search component verbatim; the aria-label was not parameterized when the component was reused for address selection in PR #129.

---

## Environment

| Field | Value |
|-------|-------|
| URL | `{{FRONT_URL}}` (storefront QA) |
| Browser | Chromium via `playwright-chrome` MCP |
| Viewport | 1920x1080 (Desktop) |
| Date | 2026-04-24 |
| Related Feature | VCST-4710 / PR #129 (advanced address search + facets) |
| Component | Address-selection popup search input |

**Credentials used for reproduction (both accounts reproduce the bug):**
- B2B user: `{{USER_EMAIL}}` / `{{USER_PASSWORD}}` (TechFlow org member)
- Personal user: `{{USER2_EMAIL}}` / `{{USER2_PASSWORD}}` (no org membership)

---

## Steps to Reproduce

1. Sign in to the storefront with any account (B2B or personal).
2. Add any product to cart.
3. Navigate to the cart page.
4. Click the pencil (edit) icon in the Shipping Details section.
5. Observe the "Select address" popup opens.
6. Inspect the search input:
   - In DevTools: note the `aria-label` attribute and the `placeholder` attribute.
   - Or: use a screen reader (NVDA / VoiceOver) to hear how the input is announced when focused.

---

## Expected Result

The search input's accessible name describes the purpose in the current context. One of:

- `aria-label="Search addresses"`, or
- `aria-label="Search saved addresses"`, or
- `<label>` element near the field reading "Search addresses" (preferred — visible to all users).

The accessible name must match the popup's purpose (selecting a shipping address), not its sibling component's purpose (selecting a pickup location).

---

## Actual Result

The search input has:

```html
<input
  aria-label="Search pickup locations"
  placeholder="Search "
  type="text"
/>
```

Screen readers announce: *"Search pickup locations, edit text"* when the user focuses the field in the shipping address popup.

---

## Evidence

- Screenshot (B2B session): `tests/Sprint-current/VCST-4710/evidence/select-address-popup-initial.png`
- Screenshot (personal session): `tests/Sprint-current/VCST-4710/evidence/select-address-popup-personal-user.png`
- Screenshot (facet open): `tests/Sprint-current/VCST-4710/evidence/select-address-popup-country-facet.png`
- Console errors: none
- Network errors: none
- Reproduced on 2 accounts (B2B + personal) — not user-specific or org-specific

---

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | **FAIL** | screenshots above; `aria-label="Search pickup locations"` on address-popup search input |
| 2. Backend Admin | N/A | accessibility attribute is frontend-only |
| 3. GraphQL xAPI | N/A | accessibility attribute is frontend-only |
| 4. Platform REST API | N/A | accessibility attribute is frontend-only |

**Owning layer:** Layer 1 (Storefront Frontend — `vc-frontend` theme)

---

## Root Cause Analysis

- **Suspected root:** Component reuse without parameterizing the accessible-name prop. The address-selection popup was added in PR #129 / VCST-4710 using (or extending) the existing BOPIS pickup-locator modal component. The aria-label literal `"Search pickup locations"` was originally added to the BOPIS component (see closed bug `reports/bugs/closed/BUG-WCAG-131-BOPIS-Pickup-Modal-Search-Input-No-Label.md`, fixed 2026-02-27 via VCST-4565) and was not replaced or made prop-configurable when the component was reused for address selection.
- **Source file to investigate:** `vc-frontend` — search for the literal string `"Search pickup locations"`. Likely file: a shared `ModalSearch` / `LocationSearch` component inside `client-app/shared/modules/checkout/components/` or `client-app/shared/components/ui/modal-search/`. The aria-label should be replaced with a prop (e.g., `searchAriaLabel: string`) passed from the parent (pickup modal passes `"Search pickup locations"`, address popup passes `"Search addresses"`).
- **Recent changes:** PR #129 (VCST-4710) introduced the address-popup advanced search. The aria-label inheritance was a side effect of reusing the existing search input component without parameterization.
- **App Insights:** N/A (accessibility attribute is static markup; no server-side telemetry).

---

## Impact

- **Who:** Screen-reader users selecting a shipping address at checkout.
- **How severe:** Cognitive confusion and incorrect mental model — users hear "pickup locations" when the popup is actually for addresses. Does NOT block the transaction (sighted users are unaffected by the aria-label; they read the popup title "Select address" which is correct).
- **Scope:** Affects both B2B and personal account users (confirmed in reproduction). Affects every shipping-address-selection flow from the cart page.
- **Compliance:** WCAG 2.1 Level A (4.1.2 Name, Role, Value) and Level AA (2.4.6 Headings and Labels).

---

## Additional Observations

- The placeholder text on the address popup is `"Search "` (trailing space, no descriptive word) — confirming the placeholder was partially genericized but the aria-label was not.
- The State/Province facet absence for non-US/CA addresses (noted during same exploration session) is **by design**, not a bug — see `memory/project_address_state_facet.md`. Do not conflate with this issue.

---

## References

- JIRA: not filed (awaiting user review of this report)
- Related (closed, different popup): `reports/bugs/closed/BUG-WCAG-131-BOPIS-Pickup-Modal-Search-Input-No-Label.md` (VCST-4565 — missing label on BOPIS pickup modal, fixed by adding this exact aria-label)
- Source PR: #129 (VCST-4710 — advanced address search + facets)
- Test cases affected: SA-024 through SA-030 in `tests/Sprint-current/VCST-4710/test-cases/select-shipping-address-popup.csv` exercise this popup
