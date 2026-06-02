# /qa-design — /account/lists

**Date:** 2026-05-15
**Target type:** Page (in-matrix)
**Target:** `/account/lists`
**Matrix scope:** LAYOUT-PAGE-CLS-LISTS-001, LAYOUT-SPC-001, LAYOUT-OVF-006 (BL-UI-006 n/a per Pages matrix)
**Storybook story:** N/A — page target (Storybook hosts components, not pages)
**Storefront URL:** `${FRONT_URL}/account/lists`
**Account:** `mutykovaelena@gmail.com` (USER_EMAIL on vcst-qa, personal account, 9 existing lists)
**Storefront version:** 2.49.0-alpha.2342 · Coffee theme confirmed (`--color-primary-500: #996c5a`) · Locale en-US
**Viewports:** 375 (eff. 485 px after chrome reservation) / 768 / 1280
**Browser:** Chrome DevTools MCP
**Suite mapping:** `regression/suites/Frontend/cross-cutting/048b-layout-stability.csv`

## Invariant Results

| Invariant | 375 | 768 | 1280 | Notes |
|-----------|-----|-----|------|-------|
| BL-UI-001 CLS (LAYOUT-PAGE-CLS-LISTS-001) | **P0 — FAIL** (CLS 0.483, 4 shifts) | **FAIL** (CLS 0.137, 3 shifts) | PASS (CLS 0.064, 5 shifts) | Skeleton → grid swap. Severity escalates at mobile because mobile card height >> skeleton placeholder height. |
| BL-UI-002 spacing-grid (LAYOUT-SPC-001) | PASS | **FAIL** (3 off-grid values) | **FAIL** (same 3 off-grid values) | Tailwind half-step values (`space-y-2.5`, `pb-9`, `pl-2.5`) violate 4-px grid at md+; mobile path uses on-grid `space-y-3` / `pb-6`. |
| BL-UI-004 overflow (LAYOUT-OVF-006) | PASS | PASS | PASS | No horizontal scroll. All clipping is intentional ellipsis truncation on long descriptions / shared-list URLs / ship-to header. |
| BL-UI-006 touch targets | n/a | n/a | n/a | Per Pages coverage matrix — account pages cover touch targets transitively under VcButton. |

## Findings

### [BL-UI-001] LAYOUT-PAGE-CLS-LISTS-001 — Skeleton → grid CLS exceeds budget at mobile and tablet

- **375 px:** CLS = 0.483 (P0, threshold 0.25), 4 shifts
- **768 px:** CLS = 0.137 (FAIL, threshold 0.10), 3 shifts
- **1280 px:** CLS = 0.064 (PASS), 5 shifts
- **Root cause hypothesis:** `VcWidgetSkeleton` placeholder uses a fixed height calibrated for desktop flex-row card layout (~64 px). At narrow viewports cards reflow to stacked-content layout (~taller), so the swap delta grows proportionally and the cumulative shift score blows past the budget.
- **Evidence:**
  - `tests/Sprint-current/qa-design/account-lists-2026-05-15/storefront/375/LAYOUT-PAGE-CLS-LISTS-001-375-FAIL.png`
  - `tests/Sprint-current/qa-design/account-lists-2026-05-15/storefront/768/LAYOUT-PAGE-CLS-LISTS-001-768-FAIL.png`
  - `tests/Sprint-current/qa-design/account-lists-2026-05-15/storefront/375/LAYOUT-PAGE-CLS-LISTS-001-375.json`
  - `tests/Sprint-current/qa-design/account-lists-2026-05-15/storefront/768/LAYOUT-PAGE-CLS-LISTS-001-768.json`

### [BL-UI-002] LAYOUT-SPC-001 — Three off-grid spacing values at md+ breakpoints

| Element | Property | Measured | Nearest grid value | Active viewports |
|---------|----------|----------|--------------------|------------------|
| `.vc-container.account-shell` | `padding-bottom` | 36 px | 32 or 40 | 768 / 1280 (mobile uses 24 px — on-grid) |
| `.link-lists__wrapper` (sidebar sub-list indent) | `padding-left` | 10 px | 8 or 12 | All breakpoints |
| List card separator (`md:space-y-2.5` child `margin-top`) | `margin-top` | 10 px | 8 or 12 | md+ only (mobile uses `space-y-3` = 12 px — on-grid) |

- **Note on tokens:** vc-frontend does not define `--spacing-*` CSS custom properties on `:root`; spacing is applied via Tailwind utilities directly. The 4-px grid invariant is therefore evaluated against the Tailwind step scale — half-step utilities (`2.5`, `3.5`) are off-grid by convention.
- **Evidence:**
  - `tests/Sprint-current/qa-design/account-lists-2026-05-15/storefront/1280/LAYOUT-SPC-001-1280-FAIL.png`
  - `tests/Sprint-current/qa-design/account-lists-2026-05-15/storefront/1280/LAYOUT-SPC-001-1280.json`
  - `tests/Sprint-current/qa-design/account-lists-2026-05-15/storefront/768/LAYOUT-SPC-001-768.json`

### [BL-UI-004] LAYOUT-OVF-006 — PASS

- No horizontal scroll at any viewport (`scrollWidth ≤ innerWidth` at 375 / 768 / 1280).
- Intentional clipping cases verified:
  - `span.ship-to-selector__selected` — header address ellipsis (design intent)
  - `div.vc-container__bg > svg` — decorative oversized background, clipped on purpose
  - `div.truncate` on long descriptions and shared-list URLs — `overflow:hidden; text-overflow:ellipsis; white-space:nowrap` correctly applied; long URL (608 px scrollWidth) clips cleanly to 405 px with ellipsis
- **Evidence:** `tests/Sprint-current/qa-design/account-lists-2026-05-15/storefront/{375,768,1280}/LAYOUT-OVF-006-*.json`

## Data Quality Note (not a layout bug)

One list ("New list_10/9/2025_yutyut") has a raw shared-list URL stored as its description text (`https://vcst-qa-storefront.govirto.com/shared-list/f840dcc0-...`). It renders correctly via ellipsis truncation — no layout bug. Worth flagging to the test data owner so the fixture is sanitized.

## Viewport Reservation Note

Chrome DevTools MCP `resize_page` sets the outer browser window, so a target of 375 px yields an effective `document.documentElement.clientWidth` of 485 px after browser chrome + scrollbar reservation (~15 px gutter). The 485 px effective viewport still triggers the single-column mobile layout (sidebar hidden, full-width cards) — functionally equivalent to the intended mobile audit. All "375" results in this report are recorded against the 485 px effective viewport.

## Recommended Filings (if user approves)

1. **[P0] CLS regression on /account/lists at mobile/tablet** — LAYOUT-PAGE-CLS-LISTS-001. Skeleton placeholder height does not match mobile card layout → CLS 0.483 at 375 px (5× budget), 0.137 at 768 px. Fix: give the skeleton a viewport-aware `min-height` matching the mobile stacked-card layout, or SSR the first paint of the grid, or use `aspect-ratio` reservation.
2. **[Medium] Off-grid spacing at md+ breakpoints** — LAYOUT-SPC-001. Three Tailwind half-step values violate the 4-px grid: `.account-shell pb-9` (36 px), `.link-lists__wrapper pl-2.5` (10 px), card list `md:space-y-2.5` (10 px). Fix: round each to the adjacent grid step (8 / 12 / 32 / 40). Mobile already uses `space-y-3` correctly.
