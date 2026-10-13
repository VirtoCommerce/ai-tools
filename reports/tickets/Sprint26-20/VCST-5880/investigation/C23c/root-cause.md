## Root-Cause Worksheet: C23c (VCST-5880 triage, out of scope)

### 1. Symptom
The selected compare category tab, and the catalog's active-filter chips, show white text on slate #688198. The contrast is 4.05:1, short of 4.5:1.

### 2. Lowest failing layer
Storefront CSS token only.
- repoKind: `frontend`
- Repo: **`VirtoCommerce/vc-frontend`**
- Confidence: **HIGH**

### 3. Evidence → claim chain
| # | Claim | Evidence |
|---|---|---|
| 1 | The selected tab is `VcButton color="secondary"`, with variant `solid` when selected | `client-app/pages/compare-products.vue` L117-124 (`color="secondary"`, `:variant="… ? 'solid' : 'outline'"`); live class `vc-button--solid--secondary` |
| 2 | The solid-secondary pair is white on secondary-500 | `client-app/assets/styles/_ui-kit-tokens.scss` L32 `--vc-button-solid-secondary-bg → --color-secondary-500` and L34 `--vc-button-solid-secondary-text → --color-additional-50` |
| 3 | The chip uses the same pair | `_ui-kit-tokens.scss` L554 `--vc-chip-solid-secondary-bg → secondary-500` and L556 `--vc-chip-solid-secondary-text → additional-50`; live "Show in stock" chip measures #fff on #688198 |
| 4 | secondary-500 is #688198 in the shipped preset | `client-app/assets/presets/default.json` `"color_secondary_500": "#688198"` (secondary-600 `#516477` would give 6.11:1) |

### 4. The "why"
The ui-kit places white text on `--color-secondary-500`. The shipped preset sets that colour to #688198, which reaches only 4.05:1 against white. Every solid-secondary button and chip therefore misses AA by a small margin.

### 5. Alternatives ruled out
| Alternative | How ruled out |
|---|---|
| Compare-only styling | Nothing on the compare page overrides the colour. The identical pair shows on the catalog filter chip, which is a different component (VcChip), through the same preset colour |
| Preset or env drift | Live `--color-secondary-500` equals vc-frontend `default.json` |
| Introduced by PR #2518 | BASELINE `2.60.0-pr-2511` shows the same 4.05:1. The PR diff touches no token |
| Flaky | The computed style is deterministic |

### 6. Regression archaeology
Not applicable. This is not a "used to work" symptom.

### Fix direction (not a decision)
Use `--color-secondary-600` for the solid-secondary background, or darken the preset's `color_secondary_500`. Both are design-system changes in the same files as C23b, and could ship as one token-contrast fix.

### Severity on evidence: **Low**
It is a systemic AA fail, but a near miss (4.05 against 4.5) on short bold labels that stay legible. It is far less severe than C23b's 2.11:1.
