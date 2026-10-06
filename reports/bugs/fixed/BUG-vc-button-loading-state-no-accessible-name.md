# VcButton in loading state has no accessible name (scanner modal Browse button) `[Medium]`

## Status: FIXED — VCST-6096 · fix PR VirtoCommerce/vc-frontend#2528 (verified 2026-10-05, PR still open)

**Severity:** Medium (P2) · **Type:** Accessibility, WCAG 4.1.2 Name, Role, Value · axe-core `button-name` (**critical**) · **Archetype:** `RENDER` (accessible name)
**Found by:** /qa-test VCST-2945 (2026-09-28) · **standalone, pre-existing** UI-kit defect (see Provenance)
**Env:** vcst-qa · theme `2.59.0-pr-2501-7e0c` (vc-frontend PR #2501, open) · store `B2B-store` · Chromium · 1920 px and 390 px

## Summary

While a `VcButton` has `loading` set, its label is removed from the accessibility tree, and the spinner that
replaces it has no name. A screen reader announces an unlabelled, dimmed button. The visible trigger is the
**Browse** button in the **Barcode scan** modal. Because that modal never leaves loading without a camera
(related bug below), the button stays unnamed for as long as the modal is open. The mechanism is in the shared
component, so any `VcButton` with `loading` and no `aria-label`/`title` has the same gap while it loads.

## Steps to Reproduce

1. Open `{{FRONT_URL}}` in a browser with no camera, or deny the camera permission.
2. Click **Barcode scan** in the header search bar. The modal opens with Browse showing a spinner.
3. Inspect the Browse button in the accessibility tree, or run axe-core on the dialog.

## Expected vs Actual

- **Expected:** the button keeps its name while loading ("Browse", optionally with a busy state such as
  `aria-busy="true"` or "Browse, loading"). BL-A11Y-002 requires an accessible name on every control.
- **Actual:** the accessibility snapshot of the dialog shows `button "Cancel"` next to `button [disabled]`,
  with no name. axe-core reports `button-name`, impact critical, on `.barcode-scanner-modal__action-browse`.

## Layer Validation

| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront | **FAIL** | accessibility snapshot above; screenshots below |
| 2–4. Admin / xAPI / REST | N/A | presentation only |

**Owning layer:** Layer 1 — Storefront (UI kit).

## Root Cause Analysis

`client-app/ui-kit/components/molecules/button/vc-button.vue`:

- In loading state, `.vc-button__content` receives `@apply invisible` (l.475–477). `visibility: hidden`
  removes the slot text from the accessibility tree, not just from the screen.
- The loader `<span class="vc-button__loader"><span class="vc-button__loader-icon"></span></span>` (l.51–55)
  has no text, no `role` and no `aria-label`.
- `:aria-label="ariaLabel || title"` (l.10) is the only fallback. Callers that name the button by slot text,
  such as Browse in `barcode-scanner-modal.vue` l.42–47, are left with nothing.

**Suggested fix (one place, every caller):** hide the content visually but keep it in the accessibility tree
(`opacity-0` instead of `invisible`), and set `aria-busy="true"` while `loading`. Alternatively, add an sr-only
"Loading" label to the loader. Check the Storybook `VcButton` loading stories for a visual regression.

## Provenance

**PRE-EXISTING.** Neither `vc-button.vue` nor `barcode-scanner-modal.vue` is in PR #2501's file list. The
defect doesn't fail VCST-2945 and is filed standalone (a11y findings never block a feature story).

## Evidence

- Browse spinner, 1920 px: ![desktop](reports/bugs/screenshots/vc-button-loading-no-accessible-name/scanner-modal-browse-loading-1920.png)
- Browse spinner, 390 px: ![mobile](reports/bugs/screenshots/vc-button-loading-no-accessible-name/scanner-modal-browse-loading-390.png)
- axe-core result: `reports/tickets/Sprint26-19/VCST-2945/design-report.md` finding 1

**Related:**
- `reports/bugs/open/medium/BUG-storefront-barcode-scanner-modal-dead-end-without-camera.md` — the reason this
  loading state never ends.
- `reports/bugs/open/medium/BUG-storefront-mobile-account-menu-button-no-accessible-name.md` — a different
  control (mobile header account menu), same WCAG criterion. Not a duplicate.
- `reports/bugs/open/critical-high/BUG-vc-textarea-has-no-accessible-name-shared-ui-kit.md` — the same class of
  UI-kit naming gap in another component.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend
- **repoKind:** frontend
- **Ownership hint:** platform
- **Component / module:** UI kit `VcButton` (molecule), loading state
- **RCA anchor:** `client-app/ui-kit/components/molecules/button/vc-button.vue` `&__content { #{$loading} & { @apply invisible; } }` (l.475) + `vc-button__loader` (l.51)
- **Routing confidence:** HIGH (single file; shared component, so review the Storybook stories)

Found by: /qa-test VCST-2945 (2026-09-28)

## Resolution

- **Fixed in:** vc-frontend PR #2528 (theme `2.59.0-pr-2528-9ed3-9ed3b99e`), still open at verification time. `vc-button.vue` hides loading content with `opacity-0` instead of `invisible`, so the label stays in the accessibility tree, and sets `aria-busy="true"` while loading.
- **Tracker:** VCST-6096 → Tested (2026-10-05). Comment 111378.
- **Verified:** 2026-10-05 via `/qa-test VCST-6096 localhost` → `/qa-verify-fix`, local storefront proxied to vcst-qa. RED on vcst-qa `2.59.0-pr-2524` (unnamed Browse, axe `button-name` critical) → GREEN 3/3 on the PR build ("Browse files", `aria-busy="true"`, axe 0), checklist 10/10, button size unchanged (161 × 44).
- **Evidence:** `reports/tickets/Sprint26-20/VCST-6096/evidence.html`, `verification-summary.json`, `axe-*.json`, `screenshots/`.
