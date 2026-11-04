# On desktop, the header search Clear (X) closes the dropdown instead of keeping its empty-input state — **P3**

## Status: READY_TO_SUBMIT
**Found by:** agent — regression REG-2026-10-28-1013
**Tracker:** VCST-6613 (Relates VCST-6417) · case `SRCH-NEW-004` (suite 004) · KB-DE781776
**Env:** vcst · platform 3.1090.0 · theme 2.61.0-alpha.2605 · Chromium 1920 (and Firefox in the run)

## STR
Anonymous, desktop: click the header **Search** input, type `hoodie`, click **Clear** (X).

## Actual
The input is empty and still focused. The dropdown closes and does not reopen on a click into the focused input. Clearing with Ctrl+A and Backspace keeps it open, and so does mobile.

## Expected
The dropdown stays open in its empty-input state ("Start typing to search" / history), as the case SRCH-NEW-004 expects `{SPEC}`.

## Layer Validation
| Layer | Result | Evidence |
|---|---|---|
| 1 Storefront | FAIL | `evidence/SRCH-NEW-004/03-chromium-1920-after-clear-dropdown-closed-attempt2.png` |
| 2–4 | N/A | no request involved |

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend · **repoKind:** frontend · **Ownership hint:** platform
- **Component / module:** header search bar
- **RCA anchor:** `client-app/shared/layout/components/header/_internal/search-bar/search-bar.vue:186` `reset()` → `hideSearchDropdown()`
- **Routing confidence:** MEDIUM (the hide call is explicit, so whether it is intended is open)
