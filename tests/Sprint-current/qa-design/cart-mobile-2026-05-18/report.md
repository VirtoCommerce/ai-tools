# /qa-design — /cart (mobile)

**Date:** 2026-05-18
**Target type:** Page
**Target:** /cart (Page Inventory row 4 — required, P0 revenue path)
**Matrix scope:** all 4 invariants — LAYOUT-CLS-003 + 004, LAYOUT-SPC-002 + 003, LAYOUT-OVF-004, LAYOUT-TGT-002 + 003
**Storefront URL:** https://vcst-qa-storefront.govirto.com/cart
**Viewport:** 375 × 900 only (strict mobile per arg "mobile")

## Build under test

| Field | Value |
|-------|-------|
| Platform | 3.1026.0 |
| Theme | `vc-theme-b2b-vue-2.49.0-pr-2292-f131-f131d346` (PR #2292 deployed) |
| Browser | Chrome DevTools MCP (`emulate(viewport: "375x900x2,mobile,touch")`) |
| Locale | en-US |
| Theme | Coffee (store-configured baseline) |
| User | `USER_EMAIL` from `.env` (`mutykovaelena@gmail.com`) |

## Cart state at audit start

- Capri-Sun (unavailable, qty 1)
- CIF PROFESSIONAL (qty 2)
- Champagne Cooler (qty 1)
- SHOT (disabled / no-stock)

No items added or removed for setup; audit ran against pre-existing cart state. Plus "Saved for later" and "Recently browsed" sections rendered below the cart.

## Invariant Results (375 px only)

| Invariant | Sub-case | Result | Value |
|-----------|----------|:------:|-------|
| **BL-UI-001 CLS** | (a) Page load | **FAIL P0** | 0.376 (2 shifts) |
| BL-UI-001 CLS | (b) Qty change | PASS | 0.000116 (1 micro-shift) |
| BL-UI-001 CLS | (c) Item remove | PASS | 0.000 |
| **BL-UI-002 spacing** | `.vc-line-item` direct | PASS | 0 off-grid |
| **BL-UI-002 spacing** | `.vc-line-item` descendants (deep) | **FAIL** | 50 off-grid entries |
| BL-UI-002 spacing | `.vc-layout__sidebar-container` | PASS | 0 off-grid |
| BL-UI-004 overflow | Horizontal scroll | PASS | `documentScrolls = false` |
| **BL-UI-004 overflow** | Title overflow (natural + stress probe) | **FAIL** | 3 anchors y-clipped + 120-char probe silently clipped (98 px scroll vs 49 px client) |
| **BL-UI-006 touch targets** | Size | **FAIL** | 63 undersized elements |
| **BL-UI-006 touch targets** | Gap | **FAIL** | 16 pairs < 8 px gap |

**Overall: 4 PASS / 5 FAIL (incl. 1 P0)**

---

## Findings

### F-CART-001 — BL-UI-001 — Page-load CLS P0 FAIL (0.376, 2 shifts)

| Field | Value |
|-------|-------|
| Invariant | BL-UI-001 — Layout stability (CLS ≤ 0.10 PASS / ≥ 0.25 P0) |
| Severity | **P0 revenue path** (/cart) |
| Sub-case | Page load |
| Measured CLS | **0.376** (3.8× budget) — 2 shifts |
| Root cause hypothesis | Async cart-data resolution: skeleton/placeholder dimensions don't match resolved line-item + sidebar content, producing two large shifts when data lands. Same skeleton-snap pattern as VCST-5110 on `/account/lists`. |
| Companion sub-cases | Qty change (b) and remove (c) both PASS — defect is isolated to **initial page-load async resolution**, not user interactions. |
| Evidence | `storefront/375/BL-UI-001-375px-pageload-CLS-P0-FAIL.png` |

**Suggested fix:** Reserve explicit dimensions for cart skeleton placeholders matching final line-item height + sidebar summary height (same pattern as VCST-5110, but on /cart). Server-side render the cart summary on first paint if possible.

---

### F-CART-002 — BL-UI-002 — 50 off-grid spacing values in line-item descendants

| Field | Value |
|-------|-------|
| Invariant | BL-UI-002 — Spacing grid `{0,4,8,12,16,20,24,32,40,48,56,64,80,96}` px |
| Severity | Medium |
| Selector | `.vc-line-item` descendants (`VcCheckbox`, `VcInput`, `VcQuantityStepper` embedded in line items) |
| Off-grid count | 50 |
| Note | Direct `.vc-line-item` element is PASS — violations are in nested component children |

**Sample off-grid values:**

| Element | Property | Computed | Nearest grid |
|---------|----------|----------|--------------|
| Checkbox wrapper | padding | 2 px | 0 or 4 |
| Qty input | margin | 1 px | 0 |
| Property row | margin-bottom | 3 px | 4 |
| Badge / qty display | padding | 5.008 / 7.008 px | 4 or 8 |
| Stepper gap | gap | 6 px | 8 |

**Note on `5.008` / `7.008`:** Fractional rem→px conversion at non-standard root font size. Suggests utility tokens computed against a `:root { font-size }` other than the default 16 px.

**Suggested fix:** Audit token usage in `VcCheckbox`, `VcQuantityStepper`, `VcInput`; replace hard-coded `padding: 0.31rem` / `0.44rem` with named tokens that round to the grid.

Evidence: `storefront/375/BL-UI-002-375px-spacing-offgrid-FAIL.png`

---

### F-CART-003 — BL-UI-004 — Product title overflow silently clipped (no ellipsis)

| Field | Value |
|-------|-------|
| Invariant | BL-UI-004 — Content boundary (no silent overflow) |
| Severity | Medium |
| Selector | `.vc-product-title__text a` |
| Affected | 3 title anchors y-clipped naturally (in "Saved for later" / "Recently browsed"); 120-char stress probe on `CIF PROFESSIONAL` cart line confirmed silent clipping (scrollHeight 98 vs clientHeight 49) |
| CSS issue | `overflow: hidden` declared without `text-overflow: ellipsis` or `-webkit-line-clamp` → content vanishes with no truncation indicator |
| Probe restoration | Original textContent restored after stress probe |

**Suggested fix:** Add `-webkit-line-clamp: 2` + `display: -webkit-box` + `-webkit-box-orient: vertical`, OR add `text-overflow: ellipsis` + `white-space: nowrap` (single-line). The /account/lists overflow finding from earlier today (commented on VCST-5110) has the same root-cause family — consider a shared utility class for title-truncation across cart and lists.

Evidence: `storefront/375/BL-UI-004-375px-title-overflow-hidden-FAIL.png`

---

### F-CART-004 — BL-UI-006 — 63 undersized touch targets at 375 px

| Field | Value |
|-------|-------|
| Invariant | BL-UI-006 — Touch target ≥ 44 × 44 px at ≤ 768 px viewport (WCAG 2.5.5) |
| Severity | **High** (qty stepper is the revenue path on mobile — see memory `feedback_qty_stepper_as_add_to_cart`) |
| Undersized count | 63 elements |

**Critical undersized controls:**

| Element | Measured | Required | Gap to fix |
|---------|---------|----------|------------|
| Qty stepper `−` (Decrease) | 32 × 32 px | 44 × 44 px | 12 px each side |
| Qty stepper `+` (Increase) | 32 × 32 px | 44 × 44 px | 12 px each side |
| Line-item checkbox | 20 × 20 px | 44 × 44 px | 24 px each side |
| Remove-from-cart button | 38 × 38 px | 44 × 44 px | 6 px each side |
| Vendor / select checkbox | 20 × 20 px | 44 × 44 px | 24 px each side |

The qty stepper `+`/`−` is the **primary add-to-cart entry point** for B2B-store on mobile (B2B-store has no "Add to Cart" button on PDP — see memory `feedback_qty_stepper_as_add_to_cart`). Being 12 px short of the WCAG minimum on a revenue-critical control is a serious mobile-UX failure.

**Suggested fix:** Bump `.vc-quantity-stepper button` to `min-width: 44px; min-height: 44px;` at `≤ 768 px` (or globally). Same for `.vc-checkbox` interactive target (the visual 20 px box can stay; expand the hit area via `::before` pseudo or padding). Bump `[data-test-id="remove-item-button"]` to 44 × 44.

Evidence: `storefront/375/BL-UI-006-375px-touch-targets-undersized-FAIL.png`

---

### F-CART-005 — BL-UI-006 — 16 interactive pairs < 8 px gap (stepper input/buttons 1 px)

| Field | Value |
|-------|-------|
| Invariant | BL-UI-006 — ≥ 8 px gap between adjacent interactive elements at ≤ 768 px |
| Severity | **High** (compounds F-CART-004 on the same stepper) |
| Critical pair | Qty `spinbutton` and adjacent `+`/`−` buttons separated by **1 px** — effectively zero tap-spacing |
| Total < 8 px pairs | 16 |

When the stepper buttons are already 32 × 32 (12 px shy of minimum) AND only 1 px from the input, the tap zone is hostile to typical thumb input — users will frequently mis-target. This pair of defects (F-CART-004 + F-CART-005) is the same root cause: the quantity-stepper sub-component's mobile layout.

**Suggested fix:** Increase stepper-control internal spacing to ≥ 8 px gap; combined with the 44 × 44 size bump in F-CART-004, this resolves both. Bundle into one stepper-component update.

Evidence: shares `BL-UI-006-375px-touch-targets-undersized-FAIL.png` (no separate screenshot — same UI region).

---

## Cross-finding observations

1. **Two of the five findings live on `VcQuantityStepper`** (F-CART-004 stepper buttons 32×32 + F-CART-005 stepper gap 1 px). A single stepper-component fix resolves both. This is the highest-leverage repair on this audit.

2. **The page-load CLS (F-CART-001) is the same defect family as VCST-5110** — async data resolution snapping skeleton-to-content. Different page, same root cause (skeleton dimensions don't match content). Worth flagging to the dev team handling VCST-5110: if they introduce a "skeleton mirrors content dimensions" pattern, it can apply to /cart too.

3. **The title-overflow defect (F-CART-003) shares root-cause family with the /account/lists overflow** found earlier today (commented on VCST-5110). A shared text-truncation utility class for cart titles + wishlist titles + wishlist descriptions would resolve both.

4. **The off-grid 5.008 / 7.008 px values (F-CART-002)** point at fractional rem-to-px conversion. Suggests a non-default `:root { font-size }` somewhere — worth checking the theme root font-size against the design-system contract.

5. **BL-UI-001 sub-cases (b) qty change + (c) item remove both PASS.** The CLS defect is exclusively at initial paint — user interactions are stable.

---

## Findings → Filings (decision)

| # | Finding | Severity | Existing JIRA? | Recommendation |
|---|---------|----------|----------------|----------------|
| F-CART-001 | BL-UI-001 page-load CLS (P0) | P0 | None on /cart (VCST-5110 is /account/lists) | **File new bug** — same defect family as VCST-5110 but on a different page; revenue-critical |
| F-CART-002 | BL-UI-002 off-grid spacing × 50 | Medium | None | File new bug — VcQuantityStepper / VcCheckbox / VcInput design-system drift |
| F-CART-003 | BL-UI-004 title overflow | Medium | Related family on VCST-5110 (description); could file new or roll up | File new — different page, different selector |
| F-CART-004 | BL-UI-006 touch targets × 63 | **High** | None | **File new bug** — revenue-critical mobile UX failure on stepper + checkbox + remove |
| F-CART-005 | BL-UI-006 gap × 16 | **High** | Same root cause as F-CART-004 | **Bundle with F-CART-004** — single stepper-component fix resolves both |
