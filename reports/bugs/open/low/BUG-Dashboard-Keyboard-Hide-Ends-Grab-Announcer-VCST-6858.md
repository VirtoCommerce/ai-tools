# BUG — Dashboard edit mode: ArrowDown on a grabbed stat card hides it and ends the grab, while the announcement says "space to drop it"

## Status: READY_TO_SUBMIT
**Tracker:** VCST-6858 (Relates VCST-6841)
**Found by:** agent — testing VCST-6841

**Severity:** Low (P3) · A11y — keyboard-only layout editing · Storefront `/account/dashboard`

## Env
- Stand: vcst-qa (B2B-store); storefront vc-frontend-next 3.3.0-pr-23-7be3-7be3dfdd (also the theme vcst-qa deploys); Platform 3.1097.0, XFrontend 3.1010.0
- Browser: Firefox (Playwright lane), 1280–1920 wide · Repro rate: 3/3
- Storefront-only: no request on the keypress

## Summary
After Space grabs a stat card, the live region tells the user "up and down to hide or show it, space to drop it". ArrowDown hides the card and silently ends the grab ("Avg order value hidden."); the next Space grabs it again instead of dropping it. The behaviour is coded on purpose — the instruction text is wrong.

## Steps to reproduce
1. Sign in as a B2B buyer of store B2B-store; open **/account/dashboard**; activate **Edit layout** with the keyboard.
2. Tab to the **Reorder Avg order value** handle of a visible stat card.
3. Press **Space** — announcement: "Avg order value grabbed. Position 4 of 4. Use the left and right arrow keys to move it, up and down to hide or show it, space to drop it, escape to cancel."
4. Press **ArrowDown**.
5. **Escape**, then **Cancel** (nothing saved).

## Actual
- The card moves to **Hidden stats**; the live region says only "Avg order value hidden."; `aria-pressed` returns to `false`; no block is grabbed.
- Space now re-grabs the card; "space to drop it" no longer applies.

![](../../screenshots/Dashboard-Keyboard-Hide-Ends-Grab-Announcer/failure-hidden-after-arrowdown.png)

## Expected
- The announced keys match the behaviour: either the instruction says that up/down hides or shows the block and drops it, or the grab continues until Space.

## Layer Validation
| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | FAIL | package `network/announcer.json`, `screenshots/dom-failure.txt` |
| 2. Backend Admin | N/A — not probed by the investigation | — |
| 3. GraphQL xAPI | N/A — not probed by the investigation | — |
| 4. Platform REST API | N/A — not probed by the investigation | — |

**Owning layer:** Layer 1 — Storefront

## Root Cause Analysis
- `vc-frontend` `client-app/shared/dashboard/composables/_internal/useKeyboardSort.ts:101-111` — `toggleHidden` releases the grab on purpose ("the grab is released rather than followed across containers").
- `vc-frontend` `locales/en.json:1241` `grabbed_parkable` — "…up and down to hide or show it, space to drop it…" (and the other 12 locales).
- Upstream feature #2552 (VCST-6078) merged into Next by vc-frontend-next #23; not in the stable bundles.
- Detail: `.vc-fix/vc-test/VCST-6841/vcst/goal/20261116T103947Z/bugs/F-1/`.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend
- **repoKind:** frontend
- **Ownership hint:** platform
- **Component / module:** account dashboard layout editor (keyboard sort + its announcements)
- **RCA anchor:** `locales/en.json:1241` `grabbed_parkable` (or `useKeyboardSort.ts:110`)
- **Routing confidence:** HIGH (two fix options — copy vs behaviour — a product choice)
