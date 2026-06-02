# BUG-070-001 — Account menu logout button has no aria-label or data-testid

**Status:** Preliminary (unconfirmed) — needs qa-testing-expert verification
**Severity:** Low (a11y) / Medium (test infrastructure)
**Run:** REG-2026-05-04-1527
**Suite:** 070 Whitelabeling Storefront
**Test Case:** FWL-046 (Verify focus indicators visible on all branded interactive elements)
**Browser:** playwright-edge (Edge 147.0.0.0)
**Discovered During:** Phase 4 teardown (test-runner-agent template logout sequence)

## Summary

The icon-only logout button inside the account menu popup has neither an `aria-label`, a `title`, a `data-testid`, nor any visible text. This breaks both:

1. **Accessibility (WCAG 2.1 SC 4.1.2 Name, Role, Value)** — screen readers cannot announce the button's purpose.
2. **Test automation (test-runner-agent.md Phase 4 GOLDEN RULE)** — the documented selector `data-testid="main-layout.top-header.account-menu.sign-out-button"` does not match any element in the current build.

## Steps to Reproduce

1. Navigate to https://vcst-qa-storefront.govirto.com/sign-in
2. Sign in (e.g., `ricreyacrouyi-3425@yopmail.com` / `Password1!`)
3. After redirect, click the **"ACME Store / SmokeTest Runner"** button (top-right header, `aria-label="Account menu"`)
4. Observe the popup: user info row shows "SmokeTest Runner" + a small (38x38) door-shape icon button at top-right
5. Inspect the icon button via DevTools

## Observed Element

```html
<button class="vc-button group vc-button--size--sm vc-button--color--neutral ...">
  <svg ...><!-- door icon --></svg>
</button>
```

- `aria-label`: `null`
- `title`: empty string
- `data-testid`: `null`
- Visible text: empty
- Position: x≈1359, y≈65, w=38, h=38

## Expected

Per `.claude/agents/qa/test-runner-agent.md` Phase 4 GOLDEN RULE:

> Inside the popup, click the **Logout** button (selector: `data-testid="main-layout.top-header.account-menu.sign-out-button"`)

The button should have:
- `data-testid="main-layout.top-header.account-menu.sign-out-button"` (or equivalent stable selector)
- `aria-label="Logout"` or `"Sign out"` (per BL-AUTH-007)
- Optional: visible text label or tooltip

## Actual

Button has **no accessible name at all** — neither machine-readable (`aria-label`/`data-testid`/`title`) nor human-readable (no text). Only an SVG icon.

## Impact

- **A11y:** Screen reader users cannot identify the logout action. They hear "button" with no purpose hint.
- **QA automation:** The Phase 4 logout teardown step in `test-runner-agent.md` cannot find the documented selector, so HAR finalization may proceed with the user still authenticated. Affects every regression suite that relies on the template.
- **Test stability:** Tests that rely on positional click (e.g., the workaround used in this run) are fragile and break when the popup layout changes.

## Cross-references

- BL-AUTH-007 — sign-out flow business rule
- `.claude/agents/qa/test-runner-agent.md` Phase 4 (GOLDEN RULE)
- `feedback_no_signout_page.md` (memory) — confirms no `/sign-out` page; logout MUST be the popup action
- Likely affects suite 006 and suite 042 teardowns as well

## Recommended Fix

In vc-frontend, locate the account menu popup's logout button component (likely `AccountMenu.vue` or `TopHeader/AccountMenu.vue`) and add:

```vue
<button
  data-testid="main-layout.top-header.account-menu.sign-out-button"
  aria-label="$t('shared.layout.logout')"
  @click="logout"
>
  <SignOutIcon />
</button>
```

Or restore an explicit "Logout" text label inside the button.

## Console / Network Evidence

- **Console errors during test:** 0 (the missing selector causes silent test failure, not a runtime error)
- **Network:** No relevant network signal (logout endpoint is hit only after a successful click)
- **Screenshot:** `reports/regression/REG-2026-05-04-1527/070-evidence/account-menu-popup.png`
