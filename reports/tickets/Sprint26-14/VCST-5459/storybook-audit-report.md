# VCST-5459 — VcChip Design Tokens · Storybook Audit

**Env:** vcst-qa Storybook (prod build, `import.meta.env.DEV=false`) · artifact `vc-theme-b2b-vue-2.54.0-pr-2386-609b` · Chrome DevTools MCP
**Scope:** VcChip UI-kit token matrix (PR vc-frontend#2386). Storybook-isolation only; storefront + VcBadge/VcButton dark regression are the frontend agent's half.
**Theme:** default light preset (AC10 contrast) + `darkMode:dark` (AC7). Dark global key = `darkMode` (not `theme`); preset global = `themePreset`.

## Verdict per AC

| AC | Verdict | Numeric evidence |
|----|---------|------------------|
| AC1 render matrix | **PASS** | AllStates = 324 chip instances = 6 variants × 8 colors × 3 sizes; all present, distinct token values. Screenshots light+dark. |
| AC2 token-backed | **PASS** | `--bg/border/text/icon-color` === `--vc-chip-<v>-<c>-*` === painted rgb for all 8 sampled pairs. Live-chain proof: overriding `--color-primary-500` → chip bg followed (green); a baked hex would not. |
| AC3 root class | **PASS** | `vc-chip--<variant>--<color>` (e.g. `vc-chip--solid--primary`) + `vc-chip--size--<s>` + `vc-chip--color--<c>`. |
| AC4 deprecations | **PASS** | `solid-light`→`soft` and `outline-dark`→`tonal` resolve to the canonical class in DOM; computed bg/border/text byte-identical to canonical. |
| AC5 clickable hover | **PASS** | bg darkens `rgb(249,158,36)` → `srgb(0.83 0.527 0.12)` (color-mix); chip + sibling rect Δtop/Δleft/Δw/Δh = 0 → BL-UI-003 clean. |
| AC6 disabled | **PASS** | All 6 variants match spec exactly (see table below). |
| AC7 dark (chip half) | **PASS** | 0 / 324 chips below 3:1 text-on-bg in dark mode; no invisible/white-on-white; borders visible. |
| AC8 icon/close color | **PASS** | icon + close glyph = icon/text token (white on solid-primary = `currentColor`). |
| AC10 contrast (light) | **PARTIAL / FAIL** | 42/48 pass 4.5:1; **6 fail** — primary & secondary in solid/surface/ghost. Inherited palette, not a PR regression (see finding). |
| BL-UI-004 truncate | **PASS** | ellipsis + nowrap + overflow:hidden; scrollW 149 > clientW 128 (active clipping); no page overflow. |
| BL-UI-005 icon center | **PASS** | icon center 30px vs text center 29.5px → Δ 0.5px ≤ 1px. |

## AC2 token equality (sample — decl = chip-token = painted, all matched)

| variant-color | bg | border | text |
|---|---|---|---|
| solid-primary | #f99e24 | #f99e24 | #ffffff |
| soft-secondary | #e7eef3 | #e7eef3 | #242b34 |
| outline-success | #ffffff | #3e845b | #1e3c2a |
| surface-info | #ffffff | #ffffff | #2b7ea8 |
| ghost-warning | transparent | transparent | #ab660e |
| tonal-danger | #fad6d6 | #de3131 | #800f0f |
| solid-neutral | #737373 | #737373 | #ffffff |
| tonal-accent | #c7e9f5 | #1b789b | #0b3949 |

Note: `--color-vc-*` override hooks are empty at root in Storybook (by design — they're per-instance override keys); the resolved chain runs through `--color-<key>-500`. Cross-component key sharing is the frontend agent's storefront scope.

## AC6 disabled matrix (neutral 100=#f5f5f5 200=#ebebeb 300=#d4d4d4 400=#a3a3a3 600=#525252)

| variant | bg | border | text | icon | spec match |
|---|---|---|---|---|---|
| solid | neutral-200 | neutral-200 | neutral-600 | neutral-400 | ✓ |
| surface | neutral-200 | neutral-200 | neutral-600 | neutral-400 | ✓ |
| soft | neutral-100 | neutral-100 | neutral-600 | neutral-400 | ✓ |
| tonal | neutral-100 | neutral-300 | neutral-600 | neutral-400 | ✓ |
| outline | white | neutral-300 | neutral-600 | neutral-400 | ✓ |
| ghost | transparent | transparent | neutral-600 | neutral-400 | ✓ |

## AC10 contrast failures (default light preset · 14px/700 bold = NOT WCAG large-text → 4.5:1 gate)

| variant-color | text-on-bg | ratio | verdict |
|---|---|---|---|
| solid-primary | white on #f99e24 | **2.11** | FAIL (<3:1) |
| surface-primary | #f99e24 on white | **2.11** | FAIL (<3:1) |
| ghost-primary | #f99e24 on white | **2.11** | FAIL (<3:1) |
| solid-secondary | on secondary | **4.05** | FAIL |
| surface-secondary | secondary text on white | **4.05** | FAIL |
| ghost-secondary | secondary text on white | **4.05** | FAIL |

Hint check: warning solid = **8.56** PASS (dark text confirmed), accent solid = **4.99** PASS. The real risks are **primary** and **secondary**, not warning/accent.

**Classification:** these are the Coffee brand palette colors themselves (`--color-primary-500` #f99e24, `--color-secondary-500` #688198) rendered faithfully through the token chain — the same values VcButton/VcBadge use via the shared `--color-*` keys. The chip correctly implements the tokens (AC2 PASS); the low contrast is a **design-system palette characteristic, not a VCST-5459 regression**. Not filed as a VcChip bug — surfaced for design-system-level review. Disabled contrast is AA-exempt (advisory only).

**AC10 secondary confirmation (team-lead follow-up).** chip-storefront flagged the storefront solid/secondary chip as white-on-neutral-500 ≈ 4.4:1. Exact computed values, default light preset:
- solid/secondary as rendered in Storybook = white text on **secondary-500 `#688198`** = **4.05:1 → FAILS AA**.
- white text on **neutral-500 `#737373`** = **4.74:1 → PASSES AA**.
- Threshold: chip text is 12px (sm) / 14px (md) at weight 700. WCAG large-text needs ≥18.66px bold (or ≥24px), so chip text does **not** qualify — the **4.5:1 normal-text** gate applies, the 3:1 relaxation does not. So 4.05:1 is a genuine AA fail, 4.74:1 a pass. chip-storefront's ≈4.4 sits between the two tokens; they should confirm which their filter chip resolves (`vc-chip--solid--secondary` → secondary-500 fails; a neutral-mapped chip passes). Same inherited-palette classification applies.

## AC7 — VcBadge + VcButton dark-mode regression (shared shade-map change)

PR #2386 also touched the shared dark shade maps (`dark/atoms/vc-badge.scss`, `dark/molecules/vc-button.scss`). Verified their `--all-states` stories in Storybook dark (`html.dark`):

| Component | Instances audited (dark) | Text-on-bg < 3:1 (washed-out / unreadable) | Verdict |
|---|---|---|---|
| VcButton | 240 | 0 | **PASS** — no washed-out/unreadable solid or soft |
| VcBadge | 1536 (incl. state permutations) | 0 | **PASS** — no washed-out/unreadable solid or soft |

Screenshots: `vcbutton-all-states-dark.png` / `-light.png`, `vcbadge-all-states-dark.png` / `vcbadge-all-colors-light.png`. Visual eyeball vs light: solid + soft shades read correctly in dark, no wrong-shade regression spotted. This is component-level only; storefront-integration dark is AC9 (below).

## AC9-dark — Storefront dark (trigger + component verification)

**Dark trigger = `html.dark`, applied by a dark theme PRESET (store/$cfg), NOT `prefers-color-scheme`.** `emulate(colorScheme:dark)` does NOT flip the storefront to dark (OS emulation adds no class) — an earlier attempt rendered light. The storefront bundle ships the full compiled `.dark .vc-*` token matrix (confirmed by chip-storefront's CSS analysis). Verified live: adding `html.dark` flips `solid--secondary` bg `#6b7280` (secondary-500) → `#d1d5db` (secondary-300) with black text — the dark-preset tokens engage. (Client-side `html.dark` flips component tokens but not the full page shell, which the preset also restyles; full-shell dark is unreachable anonymously — needs an admin preset change.)

Component dark-token render (real `html.dark` trigger injected, per team-lead authorization; read-only contrast after):

| Page | Screenshot | Dark component readings | Verdict |
|---|---|---|---|
| Search filter row (`/search` + BRAND facet) | `storefront-searchfilters-dark.png` | chip solid-secondary 14.25, tonal-success 13.54; buttons 11.55/21; badges 21/17.74 — all ≥ 3:1 | **PASS** — no washed-out/unreadable |
| PDP (Xerox WorkCentre) | `storefront-pdp-dark.png` | chip tonal-success 13.54; buttons 21/7.81; badge 21 | **PASS** |
| /account/orders | — | — | **N/A-on-this-path** — sign-in-gated + Chrome DevTools MCP has no `--secrets` (won't type creds); its only chip is `tonal--success`, redundant with the PDP shot and Storybook chip-dark (0/324). No coverage lost. |

**Authoritative dark coverage = Storybook `html.dark` audit by equivalence.** Storybook's `darkMode:dark` global applies the SAME `html.dark` trigger against the SAME compiled `.dark .vc-*` tokens the storefront ships. So the component-level Storybook dark results (chip 0/324, VcButton 0/240, VcBadge 0/1536 below 3:1) are representative of storefront dark-preset rendering; the live `html.dark` injection above independently confirms the equivalence. In dark, `solid--secondary` inverts to a light secondary-300 bg with dark text (14.25:1) — readable.

**Cross-surface reconciliation (item 3 / AC10).** The live storefront defines `--color-secondary-500 = #6b7280`, so the light-mode `solid--secondary` filter chip = white-on-#6b7280 = **4.83:1 → PASSES AA on the deployed store**. The 4.05:1 fail is specific to Storybook's `default` themePreset palette (`#688198`). The chip is faithfully token-backed in both; the environments simply define secondary-500 differently.

## Incidental / always-on

- Console: clean. Only message is Storybook's own "Accessing the Story Store is deprecated" — triggered by the audit's own probe, not the chip.
- The `resolveVariant` deprecation `console.warn` correctly absent (prod build, DEV=false) — not a defect.

## Screenshots (`screenshots/`)
`chip-all-variants-light/dark.png`, `chip-all-states-light/dark.png`, `chip-deprecations-light.png`, `chip-hover-solid-primary-light.png`, `chip-disabled-light.png`, `chip-icon-light.png`, `chip-closable-light.png`, `chip-truncate-light.png`
