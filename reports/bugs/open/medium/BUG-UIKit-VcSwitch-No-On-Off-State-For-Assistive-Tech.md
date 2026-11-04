# BUG: [UI-kit][a11y] VcSwitch does not expose its on/off state to assistive technology and renders two controls with the same name (WCAG 4.1.2) — Medium

## Status: SUBMITTED
**Found by:** agent — testing VCST-6255
**Tracker:** [VCST-6684](https://virtocommerce.atlassian.net/browse/VCST-6684) (standalone Bug, relates to VCST-6255; labels found-by-agent, found-in-testing)

**Severity:** Medium (P2) · **Type:** Accessibility (BL-A11Y) · **Relationship:** standalone + Relates VCST-6255 (PRE-EXISTING component, surfaced by VCST-6255)
**Env:** vcptcore (`{{FRONT_URL}}`), playwright-edge / playwright-chrome 1920x1080, 2026-11-04
**Build:** theme 2.62.0-pr-2624-0539 (the component is byte-identical on vc-frontend `dev`) · VirtoCommerce.SalesRep 3.1017.0-pr-28-9f00
**Oracle:** WCAG 2.2 SC 4.1.2 Name, Role, Value; BL-A11Y-001/002

## Summary
`VcSwitch` (vc-frontend `client-app/ui-kit/components/atoms/switch/vc-switch.vue`) renders a label `<button>` and a track `<button>` that carry the same `aria-label`, with no `role="switch"` and no `aria-checked`/`aria-pressed`. The only element that holds the state, `<input type="checkbox" :aria-checked>`, is hidden with `display: none` (`@apply hidden`), so it is not in the accessibility tree. A screen-reader user hears "Show last year on Monthly sales, button" whether the switch is on or off.

## Steps to reproduce
1. Sign in as a sales rep (@td(SR_REP_PRIMARY)) and open Sales Rep hub → Reporting (`/company/customer-sales`).
2. Inspect the "Last year" switch of the Monthly sales chart in the accessibility tree; toggle it on.
3. Repeat on any other `VcSwitch`, e.g. `/account/notifications` (push messages).

## Expected
One focusable control per switch with `role="switch"` and `aria-checked="true|false"` that follows the state (or a native checkbox that stays in the accessibility tree).

## Actual
- Two buttons per switch, both named "Show last year on Monthly sales" (and "… on Average order value"); neither has a role of switch or a checked/pressed state, before or after toggling.
- The checkbox carrying `aria-checked` is `display: none`.
- Track contrast in light mode: 1.48:1 off, 2.11:1 on (WCAG 1.4.11 needs 3:1).

![Last year switch — no state exposed](../../../tickets/Sprint26-22/VCST-6255/vcptcore/screenshots/4v-06-last-year-on-sales.png)

## Root Cause Analysis
- `vc-switch.vue` template: `<button class="vc-switch__label" :aria-label="ariaLabel || name" tabindex="-1">`, `<button class="vc-switch__bg" :aria-label="ariaLabel || name">`, `<input type="checkbox" :aria-checked="modelValue">`; style `input { @apply hidden; }`.
- Last changed by VCST-4365 "improve VcSwitch a11y" (#2106, 2025-12-19), which added names but not state. Unchanged in vc-frontend PR #2624.
- Consumers: Sales Rep Reporting (2 switches), push-messages `notifications.vue`, `vc-push-messages.vue`.

## Fix Routing
- **Repo:** VirtoCommerce/vc-frontend · **Component:** `client-app/ui-kit/components/atoms/switch/vc-switch.vue`
- **Suggested fix:** give the track button `role="switch"` + `:aria-checked="modelValue"`, mark the label button `aria-hidden="true"` (it is already `tabindex="-1"`), and raise the track contrast to 3:1.
