# Sales Rep hub breadcrumb slash separators are announced to screen readers — missing `aria-hidden` — P2

**Severity:** Medium (P2) · **Type:** Accessibility (WCAG 1.3.1 Info and Relationships; 1.4.3 Contrast) + `vs. DESIGN` DRIFT
**Provenance:** **IN-SCOPE** — two pre-existing routes set it correctly; these new routes do not
**Invariants:** `BL-A11Y-001..004` · **Case:** `SR-CO-016` / checklist row **V1** · **Ticket:** VCST-5733

**Env:** vcst-qa @ theme `2.57.0-pr-2444-5946-59465f5e` · Platform 3.1063.0

## Summary
The `/` separators in the Sales Rep hub breadcrumb are rendered **without `aria-hidden="true"`**, so a
screen reader announces each one as content between the crumb labels. They also measure **2.52:1** in
light mode and **3.88:1** in dark — below AA for text.

The two facts interact, and the interaction is the finding: **the contrast is harmless while the element
is `aria-hidden`** (a decorative glyph conveys nothing, so 1.4.3 does not apply to it). Omitting
`aria-hidden` is what converts a purely decorative under-contrast character into announced,
under-contrast content. So the omission is the defect, not the colour.

## Why it is IN-SCOPE — with controls
| Route | `aria-hidden` on the slash |
|---|---|
| `/catalog` (pre-existing) | ✅ present |
| PDP (pre-existing) | ✅ present |
| `/company/customer-orders` (new) | ❌ **absent** |
| `/company/my-customers/{org}/orders` (new) | ❌ **absent** |

Two pre-existing routes honour it, so this is not an inherited platform limitation — it is a gap on the
routes this PR adds.

## It is also a `vs. DESIGN` DRIFT
The design system declares it explicitly. From `preview/vc-breadcrumbs.html` in design project
`5aca50fb-2b9e-4beb-9312-425b32cccce8` ("✴️ VC New Front Design 2026"):

```html
<li class="vc-breadcrumbs__item"><span class="vc-breadcrumbs__slash" aria-hidden="true">/</span></li>
```

The same file also declares `.vc-breadcrumbs__slash { margin: 0 8px; color: var(--color-neutral-400); user-select: none; }`.

**Invariant and spec agree here**, so this is a plain DRIFT and **not** `AMBIGUOUS` — there is no conflict
to escalate, just an implementation that diverges from its own declared spec.

## Steps to Reproduce
1. Sign in as a sales rep and open `{{FRONT_URL}}/company/my-customers/@td(ORG_TECHFLOW.platform_id)/orders`.
2. Inspect the breadcrumb `<span class="vc-breadcrumbs__slash">` elements — check for `aria-hidden`.
3. Measure the slash colour against its background, in light **and** dark mode.
4. For the control, repeat on `/catalog` and on any PDP.

## Expected vs Actual
- **Expected:** each slash carries `aria-hidden="true"` (per the design spec and the two control routes), so it is skipped by assistive tech and its contrast is irrelevant.
- **Actual:** no `aria-hidden`; the glyph is announced, and at 2.52:1 (light) / 3.88:1 (dark) it is announced content below the AA text threshold.

## Evidence
`reports/tickets/Sprint26-17/VCST-5733/design-report.md` (finding **VIS-05**) ·
`reports/tickets/Sprint26-17/VCST-5733/summary.json` → `visual.invariant_failures[]`

## Notes
Above the `/qa-test` 5d severity floor, so filed as a **Sub-task of VCST-5733** (IN-SCOPE). Fixing
`aria-hidden` alone resolves both halves; raising the slash contrast without it would leave the element
announced and is the weaker fix.
