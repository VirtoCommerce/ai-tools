# VCST-4400 — AC Analysis & Test-Condition Traceability

**Story:** [UI-kit] Update VcIcon component: solid & outline icons support
**Type:** Story · **Priority:** Medium (P2) · **Status:** Ready for test
**PR:** [VirtoCommerce/vc-frontend#2382](https://github.com/VirtoCommerce/vc-frontend/pull/2382) — `feat(VCST-4400): implement outline icons` (open, head `100cbb5e`)
**Deployed:** vcst-qa storefront @ theme `2.54.0-pr-2382-100c-100cbb5e` (artifact.json confirms PR build is live)

> **No text ACs.** The Jira description is a pasted screenshot only. Conditions below are **derived from the PR diff + Cursor summary** (marked `{OBSERVED-from-diff}` — to be confirmed live per the assertion-grounding gate). This is a **pure visual / UI-kit** change; conditions are visual, not functional business logic.

## Derived Acceptance Conditions (DAC)

| ID | Condition (derived from diff) | Source in PR | Live verdict |
|----|-------------------------------|--------------|--------------|
| DAC-1 | **Default variant = outline.** With no `icon_variant` override, storefront icons render as outline (stroke) glyphs by default. | `settings_data.json icon_variant:"outline"`, `app-runner.ts setDefaultIconVariant(...?? "outline")`, `theme-config.ts` type | _pending_ |
| DAC-2 | **`variant="solid"` overrides render filled glyphs** where a solid is still required: in-stock chip (`cube`, `cloud`), count-in-cart (`cart`), order-status chip icon. | `in-stock.vue`, `count-in-cart.vue`, `order-status.vue` | _pending_ |
| DAC-3 | **Color migration `fill-*` → `text-*`** keeps correct icon colors — primary / danger / success / secondary / accent / neutral; no icon rendered black/uncolored/invisible. | 20+ call sites (dashboard, order-summary, credit-card, members/address dropdowns, vendor star, branches, currency arrow, etc.) | _pending_ |
| DAC-4 | **Address edit icon `edit` → `pencil`** on the address-selection button. | `address-selection.vue icon="pencil"` | _pending_ |
| DAC-5 | **Mobile header icon sizing** correct — push-messages mobile 28→24, currency arrow buckets; no over/undersized header icons on mobile. | `push-messages-mobile.vue`, `currency-selector.vue` | _pending_ |
| DAC-6 | **a11y `label` prop** — VcIcon supports optional label; decorative icons keep `aria-hidden`. | Cursor summary (VcIcon `label`), `product-reviews.vue aria-hidden` | _pending_ |
| DAC-7 | **No visual regression across broad surface** (header, catalog, PDP, cart, checkout, account, company) — icons present, aligned, sized, colored; no missing/broken (empty-box) icons. PR self-flags **Medium visual risk**. | Cursor summary risk note | _pending_ |
| DAC-8 | **Order-status chip** now renders icon as child `<VcIcon variant="solid">` (was chip `:icon` prop) — status chips still show icon + label correctly. | `order-status.vue` | _pending_ |
| DAC-9 | **strokeWidth / size-based stroke buckets** — outline icons have sensible stroke weight across sizes (xs/sm/md/lg + numeric). | Cursor summary (`strokeWidth`, size buckets) | _pending_ |

## BL-UI invariants to preserve (sized-control / layout)
- **BL-UI-001…006** (layout stability) — icon variant/size changes must not introduce CLS or misalignment.
- **Sized-control token + aspect oracle** (VCST-5413) — icons keep token-equal sizing + aspect ratio; capture the integrated render even on PASS.

## Reconciliation (Step 6b — live)

All DAC conditions **SATISFIED live** (storefront on PR build `2.54.0-pr-2382-100c-100cbb5e`; component-level confirmed on deployed Storybook which carries the PR's VcIcon stories):

| ID | Live verdict | Evidence |
|----|-------------|----------|
| DAC-1 | SATISFIED | Outline default confirmed at DOM/computed-style: `.vc-icon--outline` = fill:none, stroke:currentColor. 178/178 home, 176/192 catalog outline. |
| DAC-2 | SATISFIED | Solid overrides render filled (base `.vc-icon`, fill:currentColor): in-stock cube/cloud, count-in-cart cart, order-status chip icon. |
| DAC-3 | SATISFIED | fill→text migration: measured colors — primary/danger/success/secondary all correct; none black/invisible. Storybook: outline stroke===color 2360/2360, solid fill===color 329/329. |
| DAC-4 | SATISFIED | `[data-test-id=select-address-button]` = Lucide pencil, primary color. |
| DAC-5 | SATISFIED | Mobile ≤500px: header 10/14/24px, 0 oversized, no horizontal overflow. |
| DAC-6 | SATISFIED | Decorative icons aria-hidden (128/128); labeled icon exposes role=img + accessible name (WCAG 1.1.1/4.1.2). See minor obs #2. |
| DAC-7 | SATISFIED | 0 broken/misaligned/miscolored icons across header/catalog/PDP/cart/checkout/account/company. |
| DAC-8 | SATISFIED | Order-status chip = 1 child VcIcon (no doubling/missing), solid + label. |
| DAC-9 | SATISFIED | Storybook: strokeWidth 0.75→2.5 clean; size buckets 10→56px legible; default 1.75px@24. |

**Sized-control token+aspect oracle (VCST-5413):** 0 non-square of 2689 glyphs measured (all 1:1); integrated render captured. PASS.

**App Insights (test window 09:30:59Z→~09:48Z):** storefront `ResizeObserver loop` ×10 = NOISE (benign reflow quirk); backend `GetDashboardStatistics` 500 ×1 @09:28:01Z = pre-window, transient, not attributable to a frontend icon change (NEEDS_REVIEW, not a blocker). No correlated REAL_BUG.

**Minor observations (NOT VCST-4400 defects):**
1. Pre-existing broken CMS product-image 404s (starmarket demo host — missing test-data images; icons are inlined SVG, unaffected).
2. 1 icon-only `vc-button--size--xs` on Company members lacks an accessible name (12/13 named) — likely pre-existing; VcIcon's own a11y contract upheld.

**Verdict: PASS WITH NOTES.**
