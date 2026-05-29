# Investigation — WCAG 1.4.3 Primary Color Contrast Failure

Companion to [BUG-WCAG-Primary-Color-Contrast-Systemic-Failure.md](BUG-WCAG-Primary-Color-Contrast-Systemic-Failure.md). Holds full analysis, contrast tables, fix-option trade-offs, and sign-off detail extracted from the bug body to comply with the 150-line cap in `.claude/rules/reports.md`.

## WCAG Requirements Reference

| Text Category | Minimum Contrast Ratio (AA) | Examples |
|---|---|---|
| Normal text (< 24px or < 19px bold) | **4.5:1** | Body, labels, badge text, chip text, button text 12–16px |
| Large text (≥ 24px OR ≥ 19px bold ≥ 700 weight) | **3.0:1** | Headings, large CTAs |
| UI Components (borders, icons, focus indicators) | **3.0:1** | Input borders, icon-only buttons |

All primary-colored text on the storefront uses 12–14px font sizes (measured via DOM evaluation) — these are unambiguously "normal text".

## Primary Color Scale — Full Contrast Audit

WCAG relative luminance: `L = 0.2126·R_lin + 0.7152·G_lin + 0.0722·B_lin`; ratio: `(L_lighter + 0.05) / (L_darker + 0.05)`.

| Token | Hex | Contrast vs White | Contrast vs Black | AA Normal | AA Large |
|---|---|---|---|---|---|
| `--color-primary-950` | `#1e1001` | ~20.8:1 | ~1.0:1 | PASS | PASS |
| `--color-primary-900` | `#341c02` | ~15.7:1 | ~1.3:1 | PASS | PASS |
| `--color-primary-800` | `#543008` | 11.646:1 | ~1.8:1 | PASS (AAA) | PASS |
| `--color-primary-700` | `#874f0c` | 6.658:1 | ~3.1:1 | PASS | PASS |
| `--color-primary-600` | `#b46b0f` | 4.158:1 | ~5.0:1 | **FAIL** | PASS |
| **`--color-primary-500`** | **`#f99e24`** | **2.112:1** | **~9.4:1** | **FAIL** | **FAIL** |
| `--color-primary-400` | `#ffbb5b` | 1.949:1 | ~10.7:1 | FAIL | FAIL |
| `--color-primary-300` | `#fdc77c` | 1.705:1 | ~12.3:1 | FAIL | FAIL |
| `--color-primary-200` | `#fadbaf` | 1.405:1 | ~14.9:1 | FAIL | FAIL |
| `--color-primary-100` | `#fbead2` | 1.200:1 | ~17.5:1 | FAIL | FAIL |
| `--color-primary-50` | `#fff8eb` | 1.05:1 | ~19.8:1 | FAIL | FAIL |

**Inflection point:** `--color-primary-700` is the lightest primary shade that passes AA Normal with white text. `--color-primary-600` passes AA Large only.

## CSS Token Chain

```css
:root {
  --color-primary-500: #f99e24;
  --color-additional-50: #ffffff;
}
.vc-badge--solid--primary {
  --bg-color: var(--color-primary-500);
  --border-color: var(--color-primary-500);
}
.vc-badge--solid--primary:not([class*="--warning"]) {
  --text-color: var(--color-additional-50);   /* fails 4.5:1 */
}
.vc-badge { background-color: var(--bg-color); color: var(--text-color); }
```

Identical chain applies to VcButton, VcChip, VcDialog, VcProductButton. The `warning` color class already carries the dark-text exception — primary needs the same treatment.

## Per-Component Variant Tables

### VcBadge (Atoms)

| Variant | Bg | Text | Ratio | Status |
|---|---|---|---|---|
| solid | `#f99e24` | `#ffffff` | 2.112:1 | FAIL |
| outline | `#ffffff` | `#f99e24` | 2.112:1 | FAIL |
| solid-light | `#fbead2` | `#543008` | ~11:1 | PASS |
| outline-dark | `#fbead2` | `#543008` | ~11:1 | PASS |

Failing stories: Basic, All Colors, All States.

### VcButton (Molecules)

| Variant | Bg | Text | Ratio | Status |
|---|---|---|---|---|
| solid | `#f99e24` | `#ffffff` | 2.112:1 | FAIL |
| solid:hover | `#b46b0f` | `#ffffff` | 4.158:1 | FAIL (Normal) |
| outline | `#ffffff` | `#f99e24` | 2.112:1 | FAIL |
| outline:hover | `#f99e24` | `#ffffff` | 2.112:1 | FAIL |
| no-border | transparent | `#f99e24` | 2.112:1 | FAIL |
| no-background | transparent | `#f99e24` | 2.112:1 | FAIL |
| solid-light | `#fbead2` | `#543008` | ~11:1 | PASS |

~22 stories; primary failure affects 15+ across solid / outline / text / ghost variants.

### VcChip (Molecules)

| Variant | Bg | Text | Ratio | Status |
|---|---|---|---|---|
| solid | `#f99e24` | `#ffffff` | 2.112:1 | FAIL |
| outline | `#ffffff` | `#f99e24` | 2.112:1 | FAIL |

### VcDialog (Atoms)

Axe flags Serious color-contrast on primary-colored confirm buttons / action headers inside the dialog — same token chain.

### VcProductButton (Organisms)

Outline (white bg, `#f99e24` text + border) and link/text (orange text on white) — both 2.112:1 FAIL. Affects Add-to-Wishlist, Compare, similar PDP action CTAs.

### VcQuantityStepper (Organisms)

Icon-only "+" button on `--color-primary-500` background. WCAG 1.4.11 Non-text Contrast 3.0:1 may apply (icon vs bg). Automated scan did not flag this — **manual review recommended**.

## Storefront Page-by-Page Failing Elements

### Homepage

| Element | Bg | Text | Ratio |
|---|---|---|---|
| Cart badge "92" (`vc-badge--outline--primary`, 12px/700) | `#ffffff` | `#f99e24` | 2.112:1 |
| Search button (solid) | `#f99e24` | `#ffffff` icon | 2.112:1 |
| Nav icon buttons | `#ffffff` | `#f99e24` | 2.112:1 |

### Catalog Page

| Element | Bg | Text | Ratio |
|---|---|---|---|
| "X Variationen" outline button (12px/900) | `#ffffff` | `#f99e24` | 2.112:1 |
| Add-to-cart "+" (solid, 12px/900) | `#f99e24` | `#ffffff` | 2.112:1 |
| Header "Storybook" badge | `#ffffff` | `#f99e24` | 2.112:1 |

### 404 / Error Page

| Element | Bg | Text | Ratio |
|---|---|---|---|
| "STARTSEITE" CTA (14px/900) | `#f99e24` | `#ffffff` | 2.112:1 |

Critical recovery path — affects stressed users with low vision landing on broken URLs.

### Product Detail (Lays Chips PDP)

| Element | Bg | Text | Ratio |
|---|---|---|---|
| Qty stepper "+" (12px icon) | `#f99e24` | `#ffffff` | 2.112:1 |
| "Abholstandorte prüfen" link (14px/400) | `#ffffff` | `#f99e24` | 2.112:1 |
| Action icons (wishlist, share, 16–20px) | `#ffffff` | `#f99e24` | 2.112:1 |

### Storefront Impact Summary

| Page Type | Failing Elements | User Impact |
|---|---|---|
| Every page | Cart badge, search button, nav icons | Low-vision users cannot read cart count, identify search/nav affordances |
| Product listings | "X Variationen", add-to-cart "+" | Miss key product interactions |
| Product detail | Pickup link, action icons, qty stepper | Critical purchase-flow elements inaccessible |
| 404 / Error | Primary CTA button | Recovery path inaccessible |

**Sitewide systemic failure — not isolated.**

## Fix Options

### Option 1 — Dark Text on Primary Backgrounds (RECOMMENDED)

```css
/* CURRENT */
.vc-badge--solid--primary:not([class*="--warning"]) {
  --text-color: var(--color-additional-50);  /* white — 2.112:1 FAIL */
}
/* FIX */
.vc-badge--solid--primary:not([class*="--warning"]) {
  --text-color: var(--color-primary-950);    /* ~20.8:1 PASS AAA */
  /* or var(--color-neutral-950) — near-black, ~18–20:1 PASS AAA */
}
```

Same fix to all `--text-color: var(--color-additional-50)` primary solid/hover rules in VcButton / VcChip / VcDialog / VcProductButton (estimated 8–12 CSS rules).

Dark-text options against `#f99e24`: `#171717` (8.489:1), `#1e1001` (~20.8:1), `#0a0a0a` (9.375:1), `#262626` (7.166:1). Recommend `#171717` or `--color-neutral-900`.

**Pros:** minimal CSS change; orange brand preserved; no token restructuring; reuses existing warning-color exception pattern.
**Cons:** visual change (dark text on orange instead of white) needs design sign-off.

### Option 2 — Darken Primary Token to primary-700

```css
--color-primary: var(--color-primary-700);   /* #874f0c — 6.658:1 PASS */
/* or override the token: --color-primary-500: #874f0c; */
```

Minimum primary shade for AA Normal vs white is ~`#954f00` (exactly 4.5:1); `#874f0c` provides comfortable margin.
**Pros:** white text preserved; one token change propagates everywhere.
**Cons:** **brand color shifts from bright orange to dark amber/brown** — requires brand review.

### Option 3 — Dual-Token Pattern (Best long-term)

```css
:root {
  --color-primary-500: #f99e24;     /* brand orange preserved */
  --color-on-primary: #171717;      /* dark text FOR USE ON orange */
  --color-primary-text: #874f0c;    /* dark orange FOR USE AS TEXT on white */
}
.vc-badge--solid--primary:not([class*="--warning"])   { --text-color: var(--color-on-primary); }
.vc-badge--outline--primary:not([class*="--warning"]) { --text-color: var(--color-primary-text); }
```

**Pros:** brand orange preserved; compliant in solid + outline; encodes Material-style "on-primary" pattern.
**Cons:** most work; design token spec update required.

### Comparison

| Option | Brand Color | Text Color Change | Effort | AA | Recommended |
|---|---|---|---|---|---|
| 1: Dark text | unchanged | white → `#171717` | Low | PASS | **Yes, ship now** |
| 2: Darken primary | orange → brown | none | Low | PASS | Not preferred |
| 3: Dual token | unchanged | white → dark / orange → dark-orange | Medium | PASS | Best long-term |

**Path:** Implement Option 1 immediately. Plan Option 3 as a follow-up design system improvement.

## Secondary Color Issue

`--color-secondary-500: #688198` produces **4.052:1** vs white — below 4.5:1 AA Normal. Affects secondary solid buttons / badges / chips on normal-sized text. Quick fix: `#4a5f70` or apply dark-text pattern. **Track as related but separate issue.**

## Severity / Release Assessment

**Blocking for production release:**

1. **Legal compliance:** ADA (US), EN 301 549 (EU), AODA (Canada) require WCAG 2.1 AA. Failed contrast on primary CTAs is a documented violation.
2. **Sitewide:** affects every page.
3. **Critical flows:** Add-to-Cart, Checkout, primary CTAs all failing.
4. **Low fix risk:** ~8–12 CSS lines.

**If a strict deadline blocks immediate fix:** P1 next sprint, file accessibility exception with compliance team, document in public a11y statement, deploy before any audit/legal review. **Recommendation: do not ship to production without fixing.**

## Recommended JIRA Ticket

- **Summary:** [A11y P1] Systemic WCAG 1.4.3 Failure — Primary Color `#f99e24` Insufficient Contrast (2.112:1, need 4.5:1)
- **Type:** Bug · **Priority:** P1
- **Labels:** `accessibility`, `a11y`, `wcag-2.1-aa`, `contrast`, `design-system`, `blocking`
- **Components:** VcBadge, VcButton, VcChip, VcDialog, VcProductButton, Storefront
- **Fix:** Change `--text-color` for all primary solid/outline rules from `var(--color-additional-50)` to `var(--color-neutral-900)` (Option 1).

## Sign-Off

| Criteria | Status | Notes |
|---|---|---|
| Matches Figma | Unknown | Design may intentionally spec white-on-orange — needs design review |
| Design System Compliant | FAIL | Token chain internally consistent; token value violates WCAG |
| WCAG 2.1 AA | FAIL | 6 Serious violations, 2.112:1 measured |
| Keyboard Accessible | PASS | Focus / nav unaffected |
| Color Contrast ≥ 4.5:1 | FAIL | Primary 2.112:1; Secondary 4.052:1 borderline |
| Storefront Impact | FAIL | Sitewide |

**Overall: BLOCKED — do not release.**
