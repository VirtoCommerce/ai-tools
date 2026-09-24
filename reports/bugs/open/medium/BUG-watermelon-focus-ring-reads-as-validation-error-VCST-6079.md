# Watermelon preset: the focus ring is the theme's accent RED, so every focused field reads as a validation error — and the genuinely invalid field does not

## Status: CONFIRMED
**Tracker:** VCST-6079 (filed 2026-09-23, 4 screenshots attached)

**Found by:** `/qa-bug` (2026-09-23), live on vcptcore-qa, real keyboard `Tab` (not scripted `.focus()`)
**Archetype:** `CONVENTION` — design-token semantics, not a component defect
**Env:** vcptcore-qa · storefront theme `2.59.0-pr-2485-8b28-8b288e09` · store `B2B-store` · chromium
**Account:** `salesrep@sales.rep` (org switcher: `Mercury123` / `Purple Pink123` / `Watermelon123`)

## Summary
The storefront's focus indicator is derived from the active preset's **accent** colour:

```scss
// client-app/assets/styles/_ui-kit-tokens.scss:16   (light)
--vc-focus-ring-color: var(--color-vc-focus-ring, var(--color-accent-500));
// client-app/assets/styles/_dark.scss:14            (dark)
--vc-focus-ring-color: var(--color-vc-focus-ring, var(--color-accent-600));
```

The **Watermelon** preset's accent ramp is the melon-flesh **red** (`color_accent_500: #ed6665`,
`color_accent_600: #e73433`), which sits at the *same hue* as the error colour
(`color_danger_500: #de3131`, hue 0°). The escape hatch `--color-vc-focus-ring` exists but **no preset
defines it** (0 occurrences across the preset files and the deployed bundle), so the fallback always wins
and Watermelon's focus ring is red.

Measured live in the same modal (`Lists → Create list`), same keystroke, three orgs of one user:

| Org / preset | accent-500 | focus ring (measured `outlineColor`) | hue | ΔE76 vs danger `#de3131` |
|---|---|---|---|---|
| `Mercury123` / Mercury | `#1b789b` | `rgb(27,120,155)` = `#1b789b` | 196° | 104.5 |
| `Purple Pink123` / Purple Pink | `#5588d5` | `rgb(85,136,213)` = `#5588d5` | 216° | 105.5 |
| **`Watermelon123` / Watermelon** | `#ed6665` | **`rgb(237,102,101)` = `#ed6665`** | **0°** | **23.1** |

Ring geometry is identical in all three (`2px solid`, `outline-offset 2px`) — only the hue differs, and
only in Watermelon does it land in the error family.

**The inversion is what makes it a defect, not a taste question.** On the very same form, the
required-and-empty **List name** field — which *is* invalid and shows *"This field is required"* — keeps a
neutral border (`#dfddd7`, measured; the `vc-input--error` modifier is not applied on this form), while the
merely-focused, perfectly valid **Description** textarea is outlined in red. So in Watermelon **the only
red-outlined control on the form is the valid one.** That is exactly the reported confusion.

Also reproduces in **dark** mode (ring `#f18685` vs danger `#c00c0f`) — same hue family, ΔE76 46.8.

## STR
1. Sign in to `{{FRONT_URL}}` as a user who belongs to an org whose white-labeling `themePresetName` is
   `Watermelon` (on vcptcore-qa: `salesrep@sales.rep`, org **Watermelon123**).
2. Account menu → **Organizations** → select **Watermelon123** (theme re-applies without reload).
3. Go to **Account → Lists** → **Create list**.
4. Press **Tab** (a real key press — a scripted `.focus()` does not trigger `:focus-visible`) until the
   **Description** textarea is focused.
5. Observe the outline. Repeat steps 2–4 with **Mercury123** and **Purple Pink123** to compare.

## Expected vs Actual
- **Expected:** the focus indicator is semantically neutral — it says *"you are here"*, never *"this is
  wrong"*. Status colours (danger / warning / success) stay reserved for status. A user should not have to
  re-read a form to work out whether a red outline means focus or an error.
- **Actual:** in Watermelon the focus ring is `#ed6665` — the same hue as the error colour `#de3131`,
  ΔE76 23.1 — while the actually-invalid field carries no red at all.

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | **FAIL** | `outlineColor: rgb(237,102,101)` on the focused `<textarea>`; screenshots below |
| 2. Backend Admin | N/A | presentation-only; the Admin SPA does not render the storefront preset |
| 3. GraphQL xAPI | PASS | `whiteLabelingSettings.themePresetName = "Watermelon"` resolves correctly — preset resolution is right, the *token mapping* is the defect |
| 4. Platform REST API | PASS | `GET /api/white-labeling/organization/{id}` → `{ themePresetName: "Watermelon", isEnabled: true }` |

**Owning layer:** Layer 1 — Storefront.

## Root Cause Analysis
1. `_focus-ring.scss:6` — shared mixin `outline: var(--vc-focus-ring-width) solid var(--vc-focus-ring-color)`, applied globally via `body *:focus-visible`.
2. `_ui-kit-tokens.scss:16` — `--vc-focus-ring-color: var(--color-vc-focus-ring, var(--color-accent-500))`.
3. `presets/watermelon.json` — `"color_accent_500": "#ed6665"`, `"color_accent_600": "#e73433"`; **no `color_vc_focus_ring` key** (nor in any other preset, nor in the deployed bundle).
4. ⇒ Watermelon's focus ring = its accent red, colliding with `color_danger_500: "#de3131"`.

The defect is in the **contract**, not in `vc-textarea` / `vc-input` / `vc-menu-item` — every focusable
control in the theme inherits it, which is why the sidebar **Dashboard** link shows the same red ring.

### Recommended fix
1. **Define `color_vc_focus_ring` per preset** (the hook already exists; no code change needed) and set Watermelon's to a non-red hue — its own `color_primary_500 #aeb85f` or `color_info_500 #2b7ea8` both work. This also lets a tenant recolor the ring without touching the accent ramp.
2. *Or* change the default derivation away from `accent-*` to a guaranteed non-status token (`info-*`, or a dedicated `focus-*` ramp). Broader blast radius; only if option 1 is rejected.

Either way add a guard: a preset whose focus-ring hue lands inside the `danger` hue band should fail
`presets:check`, so the next red-accented preset cannot reintroduce this silently.

## Screenshots
![Watermelon — focused Description is red, invalid List name is not](../screenshots/BUG-watermelon-focus-ring-01-watermelon-light.png)
![Mercury — same modal, same keystroke, teal ring](../screenshots/BUG-watermelon-focus-ring-02-mercury-light.png)
![Purple Pink — blue ring](../screenshots/BUG-watermelon-focus-ring-03-purplepink-light.png)
![Watermelon dark mode — still red](../screenshots/BUG-watermelon-focus-ring-04-watermelon-dark.png)

## Related — do NOT merge with these
Three open records concern the focus ring's **contrast** (WCAG 1.4.11 — the ring is too *weak*):
`VCST-5934` (default preset, 1.82:1), `VCST-5946` (Coffee, 2.97:1), `VCST-5947` (price-facet histogram),
plus the local `reports/bugs/open/critical-high/BUG-storefront-focus-ring-token-cannot-reach-3to1.md`.
This one is the opposite axis — **semantics**, not strength: the Watermelon ring is perfectly visible and
that is precisely the problem. Fixing contrast does not fix this; fixing this does not fix contrast.

Note for `VCST-5934`: its summary says *"primary-500 used as the focus-ring colour"*. On the deployed
`2.59.0-pr-2485` build the ring resolves from **accent-500** (`_ui-kit-tokens.scss:16`), not primary — that
ticket's premise looks stale against the current token file.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** `VirtoCommerce/vc-frontend`
- **repoKind:** frontend
- **Ownership hint:** platform (native preset shipped in vc-frontend; not a client customization)
- **Component / module:** UI-kit design tokens — focus ring + colour presets
- **RCA anchor:** `client-app/assets/styles/_ui-kit-tokens.scss:16` (+ `client-app/assets/styles/_dark.scss:14`, `client-app/ui-kit/styles/_focus-ring.scss:6`, `client-app/assets/presets/watermelon.json` `color_accent_500`)
- **Routing confidence:** HIGH

## Refs
`WCAG 1.4.1` (colour not the only means of conveying status) · `.claude/knowledge/domain/white-labeling.md`
(preset resolution) · `scripts/lib/theme-presets.generated.json`
