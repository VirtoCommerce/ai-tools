# VCST-5459 — Storefront Integration Report (VcChip design tokens)

**Env:** vcst-qa storefront @ **Theme 2.54.0-pr-2386-609b-609b552a** (PR #2386 build) · **playwright-chrome** · 2026-07-20
**Scope:** storefront integration + shared-component (VcBadge/VcButton) dark-mode regression. Storybook-side ACs owned by chip-storybook.

## Step 0 — Deployment: CONFIRMED ✅
Storefront runs the PR #2386 theme. Verified two ways:
- Footer version string: `Ver. 2.54.0-pr-2386-609b-609b552a`.
- Chip root class is the **new** contract `vc-chip--{variant}--{color}` (e.g. `vc-chip--solid--secondary`, `vc-chip--outline--secondary`, `vc-chip--tonal--success`). The old `vc-chip--variant--*` form is absent.

## VcChip usages found live (chip roles on the storefront)
| Role | Where | Variant/color observed | Verdict |
|------|-------|------------------------|---------|
| Applied-filter chip (closable) | search/catalog filter row | `solid--secondary` (neutral-500 bg, white text/×) | ✅ |
| Reset-filters chip (clickable) | search/catalog filter row | `outline--secondary` (white bg, gray border) | ✅ |
| Stock/quantity chip (status) | product cards + PDP "In stock" | `tonal--success` sm rounded (bg rgb(200,233,203), text rgb(30,60,42)) | ✅ |
| Order-status chip | /account/orders | `tonal--success` — "Completed" | ✅ |

> Product **label/tag** and **discount** ("-46%") surfaces are **VcBadge**, not VcChip (parent `vc-badge__content`) — folded into the AC7 badge regression check.

## Per-AC verdicts (storefront-owned)
| AC | Result | Evidence |
|----|--------|----------|
| **AC9** chips render correctly, no visual/functional regression (light) | ✅ PASS | All 4 chip roles render with correct token-backed colors, legible text, aligned icons/×. Functional: applying Brand facet filtered 3,495→7 results; closing a chip cleared the filter; "Reset filters" clickable chip cleared all facets. `storefront-search-light.png`, `storefront-multichip-row-light.png`, `storefront-orders-statuschip-light.png` |
| **AC5 / BL-UI-003** clickable chip hover, no layout shift | ✅ PASS | Hovering "Reset filters": geometry unchanged (x=641 w=109 h=28 before & after; neighbor unchanged); only content bg darkened via color-mix (white→light gray), border unchanged. |
| **AC7 (regression half)** VcBadge + VcButton dark not regressed | ✅ PASS (by equivalence + CSS-confirmed) | Storefront bundle compiles the full `html.dark` component dark-token matrix (`.dark .vc-badge--{solid,soft,outline}--*`, `.dark .vc-button[class*=vc-button--solid--]`, `.dark .vc-button--color--*:focus`). Dark is `html.dark`-triggered by a dark preset. chip-storybook's Storybook audit uses the same `html.dark` trigger + same tokens → representative: VcButton 0/240, VcBadge 0/1536 < 3:1 in dark, no wrong-shade. See Dark-mode section. |
| **AC9 (dark half)** chips render in dark | ✅ PASS (by equivalence + CSS-confirmed) | Storefront compiles `.dark .vc-chip--solid--*` (+ `.dark .vc-chip[class*=vc-chip--solid--]{--text-color:var(--color-additional-950)}`); same html.dark trigger as Storybook (chip 0/324 < 3:1). |
| **AC10 (touch half)** clickable chip ≥44×44px, ≥8px spacing @375px | ⚠️ PARTIAL | Same-row gap = **8px** ✅. Chip **height = 28px** (status chips 24px) — **below the 44px BL-UI-006 hit-area target**. See Observations. `storefront-filterchips-mobile-light.png` |
| **AC6** disabled chip neutral style | N/A | No disabled chip instance encountered in real storefront usage. |

## Dark-mode (AC7 regression half + AC9 dark half) — finding + open item
The storefront has **no in-UI dark toggle**; dark styling is gated by `@media (prefers-color-scheme: dark)` in the compiled CSS (the lone `.dark` class covers only range-slider thumbs). Emulating that preference requires Chrome DevTools MCP (playwright-chrome cannot emulate colorScheme at runtime).

**Finding + resolution:** With `colorScheme:dark` emulated **and confirmed active** (`matchMedia('(prefers-color-scheme: dark)').matches === true`), the **storefront rendered LIGHT** — body text `rgb(10,10,10)`, `html { color-scheme: normal }`, no `.dark` class / `data-theme`. Evidence: `screenshots/storefront-darkEmulated-rendered-light.png`.
- **Why (resolved):** storefront dark mode is **preset-driven, NOT OS-driven**. The theme ships presets (6 light + 3 dark, default Coffee); dark is activated by selecting a **dark preset** (store/$cfg setting) which applies an **`html.dark`** class — so OS `prefers-color-scheme` emulation is the wrong lever and correctly left the storefront light (store is on the light Coffee preset). **Expected behaviour, not a defect.**
- **Dark SCSS reaches the storefront — CONFIRMED by static CSS analysis** (`assets/index-*.css`): the bundle compiles the full `html.dark` component dark-token matrix — `.dark .vc-chip--solid--*` (+ `.dark .vc-chip[class*=vc-chip--solid--]{--text-color:var(--color-additional-950)}`), `.dark .vc-badge--{solid,soft,outline}--{all colors}`, `.dark .vc-button[class*=vc-button--solid--]` + `.dark .vc-button--color--*:focus`. So the PR's dark-tuned VcChip/VcBadge/VcButton overrides ARE present and reachable when a dark preset is active. (Rules out the "dark styles not reaching the storefront" concern.)
- **AC7/AC9-dark = PASS by equivalence:** Storybook's `darkMode:dark` global applies the SAME `html.dark` trigger and the SAME compiled `.dark .vc-*` tokens the storefront ships → chip-storybook's Storybook dark audit (chip 0/324, VcButton 0/240, VcBadge 0/1536 < 3:1; no wrong-shade) is representative of the storefront's dark-preset rendering.
- **Live storefront dark capture N/A:** store is on a light preset and anonymous users can't switch presets, so a live dark render needs an admin preset change — not worth it given the equivalence + CSS confirmation above.
- **Process note:** my self-service OS-emulation attempt was aborted because Chrome DevTools MCP was not exclusively free (single shared page co-used by chip-storybook); I backed off per the no-shared-browser rule and reset the emulation to `auto`. The CSS analysis above needs no browser.

## Exploratory (Risk / SFDPOT)
- **Multi-chip wrapping (BL-UI-004):** 3 brand chips incl. CJK "Brand: BlackBerry/黑莓" + "Show in stock" + "Reset filters" — one desktop row, no overflow, labels carry `text-overflow: ellipsis` + `white-space: nowrap`. At 375px the row wraps cleanly. No truncation defect observed (brand names fit the max-width at desktop). ✅
- **Rapid add/remove of filter chips:** applying/removing multiple Brand facets and "Reset filters" behaved correctly each time; no stale chips, no console exceptions. ✅
- **B2B authenticated context:** chips render identically when logged in as the B2B org user (TechFlow). ✅

## Incidental findings (always-on detection)
| # | Type | Finding |
|---|------|---------|
| 1 | Observation / Risk | **Filter/clickable chip touch target = 28px tall (status 24px) < 44px** at 375px (BL-UI-006). Pre-existing — PR #2386 did not change chip sizes (contract preserves the 3 sizes), so **not a VCST-5459 regression**; flagged for a standing a11y/usability decision. |
| 2 | Question → **RESOLVED** | Solid-`secondary` filter chip white-on-#6b7280: chip-storybook's live-token read = **4.83:1 → PASSES AA** (my ≈4.4 estimate was close). The Storybook `default`-preset 4.05:1 fail is a preset-palette artifact, not the storefront. Storefront chip contrast is fine. |
| 3 | Observation | Console errors are **product-image 404s only** (`starmarket-platform.demo.govirto.com` unresolved host; `AGENT-TEST-CFG-020-*.png` 404) — stale test-data, not chip/JS/code. No unhandled exceptions on any chip page. |

## Cross-layer
- CONSOLE: no JS exceptions (only image 404s). NETWORK: no 4xx/5xx on GraphQL; `/graphql` 200s + WS subscription connects. No `errors[]` in responses touched.
- HAR: `test-results/chrome/har/` (per-lane).
