# VCST-4535 — Re-test 2 Execution Report

**Ticket:** [VCST-4535](https://virtocommerce.atlassian.net/browse/VCST-4535) — `[UI-kit] VcTable - implement VcTableColumn subcomponent for declarative column config (better DX)`
**Date:** 2026-05-07
**Sprint:** 26-09
**Build tested:** `vc-theme-b2b-vue-2.49.0-pr-2261-79f5-79f53122` (NEW; prior re-test was `156b-156bb3bb`)
**Platform:** `3.1025.0` (unchanged)
**PR:** [vc-frontend #2261](https://github.com/VirtoCommerce/vc-frontend/pull/2261), open, head SHA `79f5312201264bc26d6b2d597a16db27a220cb54`
**Trigger:** Maya Diachkovskaia (developer) confirmed fixes in JIRA comment 96905 on 2026-05-07: "please check updated orders table as well"
**Browsers:** Chrome DevTools MCP (Storybook) + playwright-chrome (storefront)
**Re-test verdict:** **PASS WITH NOTES — 1 fix shipped, 1 fix NOT shipped**

---

## Re-test scope

| Item | Severity | Surface | Prior status | Re-test status |
|---|---|---|---|---|
| **BUG-A** — rowStyle `opacity: 0.5` reduces contrast to 3.94:1 (WCAG 1.4.3) | P2 a11y | Storybook "Row Inline Style" | OPEN | ✅ **FIXED** |
| **BUG-2** — Space key does not activate `<tr role="button" tabindex="0">` (WCAG 4.1.2) | P2 a11y | Storybook "Row Click" + storefront `/account/orders` | OPEN | ❌ **NOT FIXED** |
| **AMBIGUOUS 1.4.6** — Fixed-column visual separator | Design | Storybook | Unclear | ✅ **RESOLVED** (separator added) |
| **R4 / R5** — Regression on the new declarative API | — | orders.vue + Storybook stories | n/a | ✅ **CLEAN** |

---

## R1.1 Storybook "Row Click" — Space-key activation (BUG-2)

**Result: ❌ FAIL — fix not shipped**

Compiled bundle inspection (Storybook artifact deployed at vcst-qa-storybook):

```js
onKeydown: C2(s2 => Q.value && V.$emit("rowClick", L, F), ["enter"])
```

`C2` is Vue 3's `withKeys()`. The modifier array contains **only `["enter"]`** — Space is absent.

Behavioral evidence:
- Tab to row → visible focus ring ✓
- Press **Space** → no `row-click` event in Storybook Actions panel; `defaultPrevented` remained `false`
- Press **Enter** on the same row → `row-click` fires correctly (regression intact)
- axe-core: 0 violations on the story (note: axe-core validates `role="button"` + `tabindex="0"` structurally but cannot detect missing keyboard event handling at runtime — passing axe ≠ fix delivered)

**Required fix:** change `withKeys(handler, ["enter"])` → `withKeys(handler, ["enter", "space"])` and call `event.preventDefault()` inside the handler to suppress native page-scroll on Space.

Evidence: `tests/Sprint-current/VCST-4535/storybook-screenshots/retest2/r1-1-row-click-space-fail.png`

---

## R1.2 Storefront `/account/orders` — Space-key activation (BUG-2)

**Result: ❌ FAIL — fix not shipped (consistent with Storybook)**

Behavioral evidence on `https://vcst-qa-storefront.govirto.com/account/orders` (TechFlow B2B user, build verified `2.49.0-pr-2261-79f5-79f53122`):

| Action | Expected | Actual |
|---|---|---|
| HTML attrs on first row | `role="button" tabindex="0"` | ✓ Present |
| Tab focus | Visible focus ring | ✓ 2px Coffee-theme outline |
| **Space** on focused row | Open detail in new tab + suppress scroll | ❌ Page scrolled `window.scrollY` 0 → 686; `window.open` NOT called; no navigation |
| **Enter** on focused row | Open detail in new tab | ✓ `window.open('/account/orders/51eb29e5-…', '_blank')`; no scroll |
| Mouse click | Open detail in new tab | ✓ `_blank` open |
| Ctrl+click | Open detail in new tab (by-design) | ✓ Same handler |

`preventDefault()` is also missing on the Space path (page scrolls when user presses Space on a focused row — bad UX even if you ignore the activation gap).

Evidence:
- `tests/Sprint-current/VCST-4535/screenshots/retest2/r1-2-orders-baseline.png`
- `tests/Sprint-current/VCST-4535/screenshots/retest2/r1-2-orders-row-focused.png`
- `tests/Sprint-current/VCST-4535/screenshots/retest2/r1-2-orders-html-attrs.png`
- `tests/Sprint-current/VCST-4535/screenshots/retest2/r1-2-orders-space-fail.png`
- HAR / network: `tests/Sprint-current/VCST-4535/har/orders-retest2-network.txt`
- Console: `tests/Sprint-current/VCST-4535/har/orders-retest2-console.log`

---

## R2 Storybook "Row Inline Style" — rowStyle contrast (BUG-A)

**Result: ✅ PASS — fix shipped**

The `rowStyle` function changed from `opacity: 0.5` to `color: var(--color-neutral-500); pointer-events: none;`.

Computed style on the Inactive row (Bob Johnson):

| Element | `color` | Background | Contrast | WCAG AA (4.5:1) |
|---|---|---|---|---|
| Name cell | `rgb(115, 115, 115)` (`#737373`) | `#FFFFFF` | **4.74:1** | ✅ Pass |
| Email cell | `rgb(115, 115, 115)` | `#FFFFFF` | **4.74:1** | ✅ Pass |
| Inactive badge | `rgb(115, 115, 115)` | `#FAFAFA` (effective near-white) | **4.54:1** | ✅ Pass |

`opacity` is no longer applied to the row — the dimming illusion is preserved with a higher-contrast neutral token.

axe-core scan on the story: **0 violations** (was 3 `color-contrast` violations in prior build — Bob Johnson's name cell, email cell, Inactive badge).

Evidence: `tests/Sprint-current/VCST-4535/storybook-screenshots/retest2/r2-1-rowstyle-contrast-fixed.png`

---

## R3 Fixed-column separator (AMBIGUOUS 1.4.6)

**Result: ✅ RESOLVED — separator added**

New CSS pseudo-element rules were added for all `--fixed--start` and `--fixed--end` variants (header, data, skeleton):

```css
[class*="--fixed--start"]::after,
[class*="--fixed--end"]::before {
  width: 0.125rem;          /* 2px */
  background-color: var(--color-neutral-300);
  position: absolute;
}
```

Clean design-token implementation. Visual separator now renders on Coffee theme.

---

## R4 — orders.vue regression sweep (new declarative API)

PR description: `orders.vue` migrated desktop rendering to `<VcTableColumn>` and uses `@row-click`. Regression to confirm no functional regressions vs prior `156bb3bb` build.

| ID | Check | Result |
|---|---|---|
| R4.1 | All expected columns render (Order # / PO / Invoice / Date / Status / Total) | ✅ PASS |
| R4.2 | Order# in list = order detail URL (BL-ORD-005) | ✅ PASS — `CO260505-00032` ↔ `/account/orders/51eb29e5-…` ↔ `<h1>Order #CO260505-00032</h1>` |
| R4.3 | Status labels human-readable, NOT raw enum (BL-ORD-001) | ✅ PASS — `Payment required`, `Processing` |
| R4.4 | Mouse click on row → new tab | ✅ PASS |
| R4.5 | Ctrl+click → new tab (by-design) | ✅ PASS |
| R4.6 | Sticky header on scroll | ⚪ N/A — table fits viewport |
| R4.7 | Empty state (filter to 0) | ✅ PASS — "There are no results found" + RESET SEARCH |
| R4.8 | Console errors / Vue warnings | ✅ PASS — 0 Vue warnings; pre-existing catalog image 404s only |
| R4.9 | GraphQL `/graphql` request | ✅ PASS — 10/10 POST = 200 |

---

## R5 — Storybook smoke (other VcTable stories)

5/5 stories pass — Default, Sticky Header Container, Loading, Empty, Sticky Column. Zero axe violations, zero console errors.

---

## Verdict on the ticket as a whole

**PASS_WITH_NOTES (unchanged level — but the OPEN bug list shrinks)**

| Tracker | Disposition |
|---|---|
| BUG-A (P2 a11y, contrast) | **CLOSE** — fix verified |
| BUG-2 (P2 a11y, Space key) | **STILL OPEN** — return to dev |
| AMBIGUOUS 1.4.6 | **CLOSE** — resolved |

All AC for the underlying VcTableColumn declarative API remain functionally met (verified in prior + this round). The only blocker preventing a clean PASS is BUG-2.

## Recommendation

**Do NOT transition VCST-4535 to TESTED yet.** Two paths:

1. **Recommended:** Return to dev for BUG-2 fix (one-line change in the row keydown handler), then re-deploy and re-test that single story + storefront row.
2. Accept BUG-2 as a follow-up: file BUG-2 as a separate JIRA ticket (P2 a11y), mark VCST-4535 as TESTED, and let BUG-2 follow its own bug lifecycle.

Per memory `feedback_pr_deploy_workflow.md`, the PR is open and being iterated on the same artifact tag — the simpler path is option 1.

## Artifacts

- Re-test checklist: `tests/Sprint-current/VCST-4535/retest-checklist.md`
- Storybook re-test report: `tests/Sprint-current/VCST-4535/storybook-retest2-report.md`
- Storefront re-test report: `tests/Sprint-current/VCST-4535/orders-retest2-report.md`
- This consolidated report: `tests/Sprint-current/VCST-4535/retest2-execution-report.md`
- Summary JSON: `tests/Sprint-current/VCST-4535/summary-retest2.json`
- Storybook screenshots: `tests/Sprint-current/VCST-4535/storybook-screenshots/retest2/`
- Storefront screenshots: `tests/Sprint-current/VCST-4535/screenshots/retest2/`
- HAR/console: `tests/Sprint-current/VCST-4535/har/orders-retest2-network.txt`, `…/orders-retest2-console.log`
