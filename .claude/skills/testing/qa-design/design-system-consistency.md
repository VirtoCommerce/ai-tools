# Design System Consistency — Coffee Theme

> Reference file for ui-ux-expert agent. Read when validating that a component honors the active design system. Canonical invariants: [BL-UI-002 (spacing grid)](../../../agents/knowledge/business-logic.md#bl-ui-002-spacing-grid-compliance-p2-ux) and [BL-UI-005 (alignment)](../../../agents/knowledge/business-logic.md#bl-ui-005-alignment-in-horizontal-groups-p2-ux). Canonical helper: [`scripts/lib/measure-layout.ts`](../../../../scripts/lib/measure-layout.ts). Canonical suite: [`048b-layout-stability.csv`](../../../../regression/suites/Frontend/cross-cutting/048b-layout-stability.csv).

---

## Core principle — read live tokens, never hardcode

Coffee is a **multi-preset theme** (6 light + 3 dark variants — see [reference_theme_presets](../../../../memory/reference_theme_presets.md) memory). Exact color hex, typography stack, and shadow values rotate per preset and per store config. **Hardcoded values in this file would be wrong half the time.** Always read tokens from the live page.

### Live-token extraction snippet

```js
// Run via browser_evaluate against the page under test
(() => {
  const root = getComputedStyle(document.documentElement);
  const tokens = {};
  // Walk every CSS variable declared on :root
  for (let i = 0; i < document.styleSheets.length; i++) {
    try {
      for (const rule of document.styleSheets[i].cssRules) {
        if (rule.selectorText === ':root') {
          for (const prop of rule.style) {
            if (prop.startsWith('--')) tokens[prop] = root.getPropertyValue(prop).trim();
          }
        }
      }
    } catch (e) { /* cross-origin sheet — skip */ }
  }
  return tokens;
})()
```

The result is your ground truth for this run. Diff component computed styles against `tokens["--color-primary"]`, `tokens["--spacing-md"]`, etc. — never against a hardcoded hex in this file.

---

## Spacing — BL-UI-002 (canonical)

**Allowed computed values**, in px: `{0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 56, 64, 80, 96}`

Anything outside this set (13 px, 27 px, 41 px, etc.) is a violation, regardless of how the rendered output looks.

**Audit protocol** (replaces the eyeball checklist):

```js
// Pass the snippet from scripts/lib/measure-layout.ts
import { spacingAuditSnippet, classifySpacing } from '../../../../scripts/lib/measure-layout';

// Step 1 — agent runs:
const result = await browser_evaluate(spacingAuditSnippet('.product-card, .product-card *'));
// Step 2 — agent classifies:
const finding = classifySpacing(result);  // → { invariant: 'BL-UI-002', severity, message, evidence }
```

Audit at multiple viewports — some breakpoints introduce token overrides.

---

## Colors

| Token type | Where to find | What to verify |
|------------|---------------|----------------|
| Brand / Primary | `--color-primary`, `--color-secondary`, `--color-accent` on `:root` | Every `<button>`, link, badge using brand styling reads from a variable, not a literal hex |
| Semantic | `--color-success`, `--color-warning`, `--color-danger`, `--color-info` | Alerts, toasts, validation errors, badges |
| Neutral | `--color-text`, `--color-text-muted`, `--color-bg`, `--color-bg-alt`, `--color-border` | Body, captions, surfaces, dividers |
| State | `--color-link-hover`, `--color-button-disabled`, etc. | Hover, focus, disabled, active variants |

**Violation pattern:** `background-color: #0066CC` or `color: rgb(40, 167, 69)` in computed styles — should be a `var(--…)` reference. Test by toggling the theme preset: if a literal hex doesn't change but everything else does, the literal is hardcoded.

**Cross-check against [storefront-config-flags.md](../../../agents/knowledge/storefront-config-flags.md)** for active preset → expected token shifts.

---

## Typography

Coffee preset typography varies by store. Read at runtime:

```js
// Body text
getComputedStyle(document.body).fontFamily
getComputedStyle(document.body).fontSize
getComputedStyle(document.body).lineHeight

// Headings — sample h1..h6
['h1','h2','h3','h4','h5','h6'].map(tag => {
  const el = document.querySelector(tag);
  return el ? { tag, font: getComputedStyle(el).fontFamily, size: getComputedStyle(el).fontSize, weight: getComputedStyle(el).fontWeight } : null;
}).filter(Boolean)
```

**Checks:**
- Same `font-family` across all `<button>` elements (no Helvetica leaking into a Coffee-themed surface)
- Heading scale forms a monotonic sequence (h1 ≥ h2 ≥ h3 ≥ …)
- `font-weight` values are in `{400, 500, 600, 700}` (no `633` or `font-weight: bold` mixed with numeric)
- Body `font-size` ≥ 14 px (mobile readability — also a WCAG concern)
- Line-height ratio ≈ 1.2–1.8 (no `line-height: 0.9` causing text to clip)

**Violation pattern:** PDP uses `font-family: Inter` while cart uses `font-family: system-ui` — theme bleed from a hardcoded style.

---

## Border radius & shadows

Read from `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-full` and `--shadow-sm`, `--shadow-md`, `--shadow-lg`. **Verify** every elevated surface (card, modal, dropdown, button) uses a token. **Violation pattern:** `border-radius: 7px` (off-grid) or `box-shadow: 2px 2px 4px black` (hardcoded, no token).

---

## Icons

Coffee uses a consistent icon library (likely from vc-frontend). Audit:

- All icons render at one of `{16, 20, 24, 32, 40, 48}` px square (`rect.width === rect.height` and in the allowed set)
- All icons inherit `color` from the parent (read `getComputedStyle(svg).color`) — no `fill: black` hardcoded
- Stroke width consistent across icon set (sample a few — should match)
- No PNG icons mixed with SVG (signal of late-stage hardcoding)

---

## Animations

| Token | Allowed values |
|-------|----------------|
| Duration | `--duration-fast` (≈ 150 ms), `--duration-normal` (≈ 300 ms), `--duration-slow` (≈ 500 ms) — or the literal values from `:root` |
| Easing | `--easing-standard` (ease-in-out), `--easing-decelerate` (ease-out), `--easing-accelerate` (ease-in) |

**Violation pattern:** `transition: all 247ms cubic-bezier(0.12, 0.34, ...)` — off-token. Theme switch FOUC (flicker) on transitions = also flag (see [BL-UI-001](../../../agents/knowledge/business-logic.md#bl-ui-001-layout-stability-on-initial-render-p2-ux)).

---

## Findings → Filings

A single design-system audit produces 0–N findings. Decision tree for what to file:

1. **One component, one violation** → file individual bug via [/qa-bug](../../../commands/qa-bug.md) tagged with the violated `BL-UI-NNN`.
2. **One component, multiple violations** → file ONE bug per component listing all violations (don't fragment).
3. **Multiple components share the same violation** (e.g. five components all use the same off-token color) → file ONE rollup bug describing the systemic drift. Title: `Design System Drift — [violation type] across [N] components`. Reference [BL-UI-002](../../../agents/knowledge/business-logic.md#bl-ui-002-spacing-grid-compliance-p2-ux) or whichever invariant.
4. **Token itself is wrong** (e.g. theme switch broke `--color-primary` resolution) → P1 bug, the design system is broken, not the components.

---

## Bug report template (design-system violation)

```markdown
Summary: [Component] — Design System Violation — [Issue]
Example: VcButton — BL-UI-002 spacing off-grid (padding 13px)

**Component:** [Component name + variant]
**Location:** [Storybook URL or storefront route]
**Invariant violated:** BL-UI-NNN (link to business-logic.md)
**Active theme preset:** [Coffee variant name — read from `<html data-theme>` or `--theme-name`]

**Observed (computed):**
- `padding-top: 13px` (off-grid — BL-UI-002 requires ∈ {0,4,8,12,16,20,24,32,…})
- Token used: literal value, not `var(--spacing-*)`

**Expected:**
- Nearest grid value: 12 px (or 16 px depending on density intent)
- Source: `var(--spacing-md)` (currently resolves to `16px` for active preset)

**Evidence:**
- [Screenshot]
- Computed-style dump: [paste the spacingAuditSnippet result]
- Theme preset at capture time: [name]

**Impact:**
- Visual inconsistency with adjacent components using the token
- Theme switch will not propagate (literal won't update)
- Snowballs across components that copy this pattern

**Severity:** Medium (visual/system) — promote to High if the violation is on revenue-critical surface (checkout, cart, PDP add-to-cart).
**Priority:** P2 (P1 if rolled up across N≥5 components)
**Labels:** design-system, BL-UI-NNN, [component-name], [active-preset]
```
