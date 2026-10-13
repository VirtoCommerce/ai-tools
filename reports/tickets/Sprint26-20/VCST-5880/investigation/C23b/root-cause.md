## Root-Cause Worksheet — C23b (VCST-5880 triage, out of scope)

### 1. Symptom
The `/compare` "Clear all" label is orange (#f99e24) on white, at 2.11:1. So is every outline-primary button label, and every white label on a solid-primary button, across the storefront.

### 2. Lowest failing layer
Storefront only. This is a CSS design token: no API is involved, and the network capture shows no failing call.
→ repoKind `frontend` → repo **`VirtoCommerce/vc-frontend`**. Confidence: **HIGH**.

### 3. Evidence → claim chain
| # | Claim | Evidence |
|---|---|---|
| 1 | "Clear all" is a `VcButton variant="outline"` with the default color (primary) | `client-app/pages/compare-products.vue` L27-36 (`variant="outline"`, no `color`); live class `vc-button--outline--primary` |
| 2 | The outline-primary text token resolves to primary-500 | `client-app/assets/styles/_ui-kit-tokens.scss` L115 `--vc-button-outline-primary-text: var(--color-vc-text-outline-primary, var(--color-primary-500))`; live `--vc-button-outline-primary-text = #f99e24` |
| 3 | primary-500 is #f99e24 in the shipped presets | `client-app/assets/presets/default.json` L7 and `mercury.json` L7: `"color_primary_500": "#f99e24"`; live `--color-primary-500 = #f99e24` |
| 4 | The solid-primary pair is white on primary-500 | `_ui-kit-tokens.scss` L27 (`--vc-button-solid-primary-bg → primary-500`) and L29 (`--vc-button-solid-primary-text → additional-50`) |
| 5 | Outline-primary is the outlier among sibling tokens | `_ui-kit-tokens.scss` L120 outline-secondary text → `secondary-600`; L135 outline-warning text → `warning-700`; L377 `--vc-badge-outline-primary-text → primary-800`; L638 `--vc-chip-outline-primary-text → primary-800`. Only the button outline-primary (and danger/accent/neutral) text sits on -500 |
| 6 | It shows on many surfaces, not only compare | measurement table in `evidence-index.md`: `/compare`, catalog card, `/cart`, header badge; plus KB-4EF50E94 (`/company/tasks`, `/company/calendar`, `/account/lists`) |

### 4. The "why"
The ui-kit maps the outline-primary label colour, and the solid-primary background, to `--color-primary-500`. The shipped presets set that to a light orange, #f99e24, which reaches only 2.11:1 against white. Every component that uses the primary button variants therefore inherits a WCAG 1.4.3 AA failure.

### 5. Alternatives ruled out
| Alternative | How ruled out |
|---|---|
| Compare-only styling | `compare-products.vue` adds no colour override (class `hidden md:inline-flex` only). The identical token value is measured on catalog and `/cart` |
| Env/client-preset override (data drift) | The live `--color-primary-500` equals the value in vc-frontend's own `default.json` / `mercury.json`. VirtoOZ (Storefront Dev Guide › Visual Theme Customization) documents presets as the source of `--color-*`, with no contrast guarantee stated |
| Introduced by PR #2518 | BASELINE `2.60.0-pr-2511` measures the same 2.11:1. `compare-table.vue` diff `dev`↔`fix/VCST-5880` touches no colour token |
| By design (brand colour) | A brand colour is a preset choice, but the ui-kit already uses darker shades for text in sibling tokens (row 5). So text-on-white contrast is evidently intended, and outline-primary breaks that convention |
| Flaky | Deterministic computed style, identical on 2 builds and 5 surfaces |

### 6. Regression archaeology
Not a "used to work" symptom. The behaviour is the same on 2.59.0 (KB-4EF50E94) and on 2.60 BASELINE and PR. Skipped.

### Fix direction (for /qa-fix, not a decision)
Point `--vc-button-outline-primary-text` at `--color-primary-700` (or `-600`), like the outline secondary and warning tokens do. For solid-primary, either darken the preset's `color_primary_500` or switch `--vc-button-solid-primary-text` to a dark foreground. This is a design-system decision, so a designer should sign off. Files: `client-app/assets/styles/_ui-kit-tokens.scss`, `client-app/assets/presets/{default,mercury}.json`.

### Severity on evidence: **High**
The failure is systemic: the brand primary colour fails on the main CTA variants storefront-wide (outline and solid primary, plus badges), not on one compare control.
