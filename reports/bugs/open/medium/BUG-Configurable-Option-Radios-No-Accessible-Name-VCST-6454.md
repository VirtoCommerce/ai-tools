# BUG: [Configurable products][a11y] Product-option radios on a configurable PDP have no accessible name — Medium

## Status: READY_TO_SUBMIT
**Found by:** agent — testing VCST-6398
**Tracker:** [VCST-6454](https://virtocommerce.atlassian.net/browse/VCST-6454) (standalone Bug, relates to VCST-6398; labels found-by-agent, found-in-testing; auto-fix labels withheld — vc-frontend-next is not in the /qa-fix allowed repo set)

**Severity:** Medium (P2) · **Type:** Accessibility (WCAG 4.1.2 / 3.3.2, Level A) · **Relationship:** found while testing VCST-6398; outside its changed code — standalone, does not block it
**Env:** vcst (`{{FRONT_URL}}`), guest, Chrome DevTools 1920x1080, axe-core 4.10.2, 2026-10-20
**Build:** theme vc-frontend-next `3.1.0-pr-11-d67b-d67b0e0a`
**Oracle:** BL-A11Y-002 · WCAG 4.1.2 Name, Role, Value

## Summary
In Product-type sections of a configurable product page, each option radio has an empty `label[for]` and no `aria-label` / `aria-labelledby`. Screen readers announce "radio button, not checked" with no product name; the radiogroup itself is named after the section. axe reports `label` (critical).

## Preconditions
Guest; a configurable product with Product-type sections (e.g. the Vintage Wedding cake `/product/c94d730a-…` or Bed with Additional Options).

## Steps to reproduce
1. Open the configurable product page.
2. Run axe (wcag2a…wcag22aa), or read the accessibility tree for the option radios.
3. Expand the optional sections and repeat.

## Expected
Each radio is announced with its option's name (e.g. the product name, or "None").

## Actual
- Wedding cake: `label` critical on 3 nodes in the default state, 18 after expanding the 4 optional sections (including the 4 "None" rows).
- Bed with Additional Options: 2 nodes in the default state; all 8 radios in the DOM unnamed.
- DevTools AX tree shows bare `radio` nodes.

![Unnamed option radios in a section](../../screenshots/Configurable-Option-Radios-No-Accessible-Name/V8-cake-top-radiogroup.png)

## Layer Validation
| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront Frontend | FAIL | `reports/tickets/Sprint26-21/VCST-6398/evidence-V8/a11y/` (AX snapshots, axe summaries) |
| 2. Backend Admin | N/A | — |
| 3. GraphQL xAPI | N/A | option names are present in the data (rendered in VcProductTitle) |
| 4. Platform REST API | N/A | — |

**Owning layer:** Layer 1 — Storefront.

## Root Cause Analysis
- `client-app/shared/catalog/components/configuration/option-product.vue:4-9` and `option-product-none.vue:4` render a bare `<VcRadioButton>` with no `ariaLabel`, `label` or slot; the product name sits in a separate `VcProductTitle` nothing links to the input.
- `vc-radio-button.vue` already accepts `ariaLabel`; its missing-name warning is gated by `import.meta.env.DEV`, so production is silent.
- Byte-identical at vc-frontend-next PR #11 base, head d67b0e0a and `dev`; same in upstream vc-frontend main / 2.60.0. Never named.
- kb: KB-FF7C9595 (confirmed), KB-F4FD0938 (source).
- Incidental (not triaged): axe `image-alt` critical ×4 on the cake PDP with sections expanded.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend-next (same code upstream in VirtoCommerce/vc-frontend)
- **repoKind:** frontend
- **Ownership hint:** platform
- **Component / module:** configurable product configuration — `option-product.vue`, `option-product-none.vue`
- **RCA anchor:** `client-app/shared/catalog/components/configuration/option-product.vue:4` `<VcRadioButton`
- **Routing confidence:** HIGH — pass `:aria-label="product.name"` (and the translated "None") in the two option files; no ui-kit change
