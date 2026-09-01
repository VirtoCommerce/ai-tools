# The design system's focus-ring token is arithmetically incapable of 3:1 — every `vc-button` / `vc-input` focus ring measures **1.63:1** — **P1**

## Status: CONFIRMED
**Found by:** `/qa-design VCST-5346` (2026-08-28) · confirmed by a **real keyboard Tab**, not scripted focus
**Tracker:** no new ticket — root cause added as a comment to the existing **VCST-5653** ([UI-Kit] Focus indicators — WCAG 1.4.11 / 2.4.7), with a recommendation to raise it to High
**Archetype:** `CONVENTION`

**Env:** vcst-qa @ Theme `2.57.0-pr-2396-5924`, store `B2B-store`, preset **Red** (`--color-primary-500 #e52121`), chrome. Reproduces on any surface with a focusable control, not just missions.

## Summary
The focus indicator fails WCAG 1.4.11 / 2.4.11 **because the token contract specifies it that way**, so this is not a component defect and cannot be fixed per component. The design system declares:

```css
--outline-color: rgb(from var(--color-primary-500) r g b / 0.4);
--focus-color:   rgb(from var(--color-primary-500) r g b / 0.3);
```

With the Red preset, 30 % of `#e52121` over white composites to `rgb(247.2, 188.4, 188.4)` → **1.63:1** against the white field it sits on; the live measurement was `rgb(247,188,188)`, an exact match. A ≤40 % alpha ring cannot reach 3:1 against white for **any** mid-luminance hue, so no recolor of `--color-primary-500` fixes it — the alpha is the defect.

## STR
1. Open `{{FRONT_URL}}/sign-in` (or any page with a `vc-input` / `vc-button`).
2. Press **Tab** to move focus onto the email field, then onto a button. Use a real key press — a scripted `.focus()` does not trigger `:focus-visible`.
3. Measure the ring colour against the adjacent background.

## Expected vs Actual
- **Expected:** ≥ 3:1 between the focus indicator and adjacent colours (WCAG 1.4.11); the indicator is the only thing telling a keyboard user where they are.
- **Actual:** 1.63:1 on `vc-input__container` and `vc-button`.

## Recommended fix
Raise the alpha (an opaque or ≥ 0.8 ring clears 3:1 for the current presets), or give the ring its own dedicated token rather than deriving it from `primary-500` — a derived ring inherits every tenant recolor, including ones that cannot satisfy the criterion. Fix belongs in `client-app/assets/styles/preflight.scss` + `_colors.scss`, not in any component.

## Notes — this is an `AMBIGUOUS` verdict, escalated
The implementation matches the design spec **exactly**, and the spec conflicts with a WCAG success criterion. Per `/qa-design` precedence (`BL-UI invariant > design spec > UX heuristic`) a spec match never rescues an invariant failure, and a spec that contradicts WCAG is escalated rather than obeyed. Owner is the design system, not the missions feature. P1 on the same basis as `BL-UI-006`: accessibility carries legal risk and blocks a whole class of keyboard-only users.

Pinned by unit test `scripts/unit/measure-layout-color.test.ts` → *"focus ring: 30% primary over white reproduces the measured 1.63:1"*.

## Refs
`WCAG 1.4.11`, `WCAG 2.4.11` · `PROPOSED-BL-UI-009` · `BL-A11Y-001` · full audit: `reports/tickets/Sprint26-17/VCST-5346/design-report.md` (N3)
