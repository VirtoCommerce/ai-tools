# VCST-5459 — AC / Verification Spine

**Story:** [UI-kit] Implement design tokens in VcChip component · Medium/P2 · status Testing
**PR:** [vc-frontend#2386](https://github.com/VirtoCommerce/vc-frontend/pull/2386) `feat(VCST-5459): implement ui-kit design tokens in vc-chip` (open) · also linked VCST-5506
**Artifact:** `vc-theme-b2b-vue-2.54.0-pr-2386-609b` · **Deployed to QA Storybook: CONFIRMED** (all new stories present)

> Ticket has **no description and no acceptance criteria**. Step 1b (BA Mode-B critique) skipped — nothing to critique. The conditions below are **derived from the PR contract** (the implicit DoD of "implement design tokens in VcChip"). Each is verified live in Step 6.

## Change contract (from diff)
- `_ui-kit-tokens.scss` (+261): full `--vc-chip-*` matrix = 6 variants × 8 colors × 4 props (bg/border/text/icon), each `var(--color-vc-<key>, <fallback>)` sharing VcButton/VcBadge `--color-vc-*` override keys.
- `vc-chip.vue`: root class `vc-chip--variant--${variant}` → **`vc-chip--${canonicalVariant}--${color}`**; token-driven SCSS via `@each $variant × $color`; hover via `color-mix`; disabled rewritten; `resolveVariant` compat.
- `vc-chip.types.d.ts`: variant union `solid|soft|outline|surface|ghost|tonal` + deprecated `solid-light|outline-dark`.
- `vc-chip.stories.ts`: new per-variant stories + `AllVariantsClickable` matrix + `Deprecations` story.
- **Dark mode (shared regression surface):** `dark/molecules/vc-chip.scss` rewrite; `dark/atoms/vc-badge.scss` + `dark/molecules/vc-button.scss` shade-map changes → **VcBadge & VcButton dark mode must not regress.**

## Verification conditions

| ID | Condition | Verify where | Owner | Impl verdict |
|----|-----------|--------------|-------|-------------|
| AC1 | 6 canonical variants (solid/soft/outline/surface/ghost/tonal) × 8 colors × 3 sizes all render, each visually distinct & correct | Storybook AllVariants/AllStates | ui-ux | ✅ **PASS** — 324 instances render, distinct tokens (light+dark) |
| AC2 | Chip colors token-backed — computed `--bg/border/text/icon-color` resolve through `--vc-chip-*` → `--color-vc-*`/`--color-*` chain (not hard-coded); shares keys with VcButton/VcBadge | Storybook (computed styles) | ui-ux | ✅ **PASS** — decl===token===painted on 8 pairs; live `--color-primary-500` override followed |
| AC3 | Root class is `vc-chip--{variant}--{color}` | Storybook DOM | ui-ux | ✅ **PASS** — confirmed in Storybook + storefront DOM |
| AC4 | Legacy aliases render identically to canonical: `solid-light`≡soft, `outline-dark`≡tonal (+`no-border`≡surface, `no-background`≡ghost) | Storybook Deprecations | ui-ux | ✅ **PASS** — resolve to canonical class; computed bg/border/text byte-identical |
| AC5 | Clickable hover darkens (color-mix) with **no layout shift** (BL-UI-003: border-color change, not width) | Storybook AllVariantsClickable | ui-ux | ✅ **PASS** — chip+sibling rect Δ=0 (Storybook & storefront) |
| AC6 | Disabled: solid/surface→neutral-200 bg, outline→neutral-300 border, soft/tonal→neutral-100; text neutral-600, icon neutral-400 | Storybook Disabled | ui-ux | ✅ **PASS** — all 6 variants exact (Storybook); N/A in-wild storefront |
| AC7 | Dark mode correct for all chip variants/colors **AND VcBadge + VcButton dark mode not regressed** (shared shade maps changed) | Storybook (dark, `html.dark`) | ui-ux | ✅ **PASS (component-level, authoritative)** — Storybook dark uses `html.dark` = the storefront's real dark trigger. chip 0/324, VcButton 0/240, VcBadge 0/1536 below 3:1; no wrong-shade regression |
| AC8 | Icon + close-button color follow icon/text tokens | Storybook Icon/Closable | ui-ux | ✅ **PASS** |
| AC9 | Storefront chip usages render correctly, no visual/functional regression, light + dark | storefront pages | frontend + ui-ux | ✅ **PASS** — light (filter/reset/stock/status chips render+function); **dark CSS-confirmed**: deployed bundle compiles the full `.dark .vc-chip/.vc-badge/.vc-button--*` matrix (gated on `html.dark`, applied by a dark preset), so the PR's dark overrides reach the storefront and are rendering-equivalent to the Storybook dark audit (same `html.dark` trigger + tokens). Live dark screenshot not obtainable (store on light Coffee preset; anon users can't switch) — not worth a config change given the CSS equivalence |
| AC10 | Contrast (text/bg) meets WCAG AA on default light presets; clickable chip touch target ≥44px @375px (BL-UI-006) | Storybook + storefront | ui-ux + frontend | ⚠️ **PARTIAL (advisory)** — see note. Live deployed theme secondary chip = 4.83:1 **PASS**; the 6 "fails" are Storybook-`default`-preset artifacts. Touch-target 28<44px = **pre-existing** |

## Note — storefront dark-mode trigger (reconciled)
The two agents' OS `colorScheme:dark` emulation diverged, now resolved: the storefront's dark theme is **activated by a dark theme preset that applies `html.dark`** (6 light + 3 dark presets; default Coffee), **not** by `prefers-color-scheme`. So OS-emulation does not render the storefront dark (matches chip-storefront's "rendered light" result; chip-storybook's "storefront dark" shots were effectively light — its palette-500 contrast reads remain valid as they are preset-level, not light/dark-dependent). Consequence: the PR's dark component SCSS is `html.dark`-scoped and is authoritatively verified in **Storybook** (which uses the same `html.dark` trigger); a live storefront-dark capture would require switching the store to a dark preset (a shared-env config change), deferred for this P2. **This dark-trigger architecture is pre-existing — not introduced by VCST-5459.**

## Step 6a — App Insights test-window correlation (2026-07-20 14:53→15:30 UTC)
Storefront exceptions: **0** · Backend 5xx: **0** → no correlated errors. Consistent with a CSS-only change; corroborates live console-clean.

## AC10 contrast — classification (not a VCST-5459 fail)
6 variant×color pairs fail WCAG AA 4.5:1 (chip text 12–14px bold ⇒ normal-text gate, not large-text): `primary` @2.11:1 and `secondary` @4.05:1 in `solid`/`surface`/`ghost`. The applied-filter chip (`solid--secondary`, real user-facing) hits 4.05:1. These are the **brand palette values themselves** (`--color-primary-500` #f99e24, `--color-secondary-500` #688198), rendered faithfully via the shared `--color-*` tokens — identical to what VcButton/VcBadge already ship (and identical to the pre-PR chip solid behavior). The chip **correctly implements the tokens (AC2 PASS)**, so this is a **design-system-wide palette characteristic**, not a defect introduced by this ticket. → Recommend a separate shared-token contrast rollup (affects button/badge/chip equally); NOT a reason to fail/reopen VCST-5459.

**Known limitation:** the `resolveVariant` deprecation `console.warn` is `import.meta.env.DEV`-gated → **not observable in the prod Storybook build**. AC4 verified visually (alias≡canonical render), not via the warning.

**BL-UI invariants in scope:** BL-UI-003 (no state-induced shift on hover), BL-UI-004 (chip text truncation boundary), BL-UI-005 (icon/text centering in chip), BL-UI-006 (clickable touch target).
