# Compare v2 — a long unbroken property value overflows its cell and is painted over the neighbouring column — P2

## Status: FIXED — [VCST-6029](https://virtocommerce.atlassian.net/browse/VCST-6029) (screenshots attached AND embedded inline, verified via renderedFields: 2 attachment-backed `<img>`, 0 surviving wiki markup, 0 error spans)

## Resolution
- **Fixed by:** [VirtoCommerce/vc-frontend#2495](https://github.com/VirtoCommerce/vc-frontend/pull/2495) (open, unmerged at verification time) — `.compare-table__row-value`: `overflow-wrap: break-word` → `overflow-wrap: anywhere`, CSS only, one rule, applies to all 7 rows / 14 value cells.
- **Verified:** 2026-09-22, local pre-merge build of the PR's own CI theme artifact (`vc-theme-b2b-vue-2.58.0-pr-2495-c828-c828ee92.zip`), API proxied to real `vcst-qa` catalog data. STR 3/3, 10/10 checklist, live RED→GREEN discrimination matched the measurements below to the hundredth of a pixel. Full report: `reports/tickets/Sprint26-19/VCST-6029/verification-report.md` · evidence page: `reports/tickets/Sprint26-19/VCST-6029/evidence.html`.
- **Tracker:** VCST-6029 transitioned `Testing → Tested`.
- **Residual, non-blocking:** the cell still has `overflow: visible` and no `min-w-0` — `anywhere` removes the cause rather than adding a clip fallback; not reachable with current catalog data. Verified on Chromium only. Re-confirm on the shared `vcst-qa` deployment once PR #2495 merges.

**Severity:** Medium/P2 (**High at ≤~600px**) · **Type:** Rendering / CSS layout · **Archetype:** `PARITY`
**Found by:** `/qa-bug`, 2026-09-18 — user report: *"I see UI bug here one overlay another column"* + screenshot of the SKU row.
**Env:** vcst-qa · theme `2.58.0-pr-2467-1f40-1f40b001` (footer marker; vc-deploy-dev `theme/artifact.json` @ `vcst-qa`) · Platform per `vc-deploy-dev` `backend/packages.json`. PR 2467 is VCST-5378 (UCP/OAuth) — **no compare-specific PR is in play**, so the compare code in this build tracks `dev`.
**Repro browser:** Edge 153.0.4234.32 / Chromium 153.0.8010.37. (`playwright-firefox` clicks stalled — see §Lane note.)

## Summary
Every value cell in the compare table is `display: flex` with `overflow-wrap: break-word`, **no `min-width: 0`
and no `overflow: hidden`**. `break-word` does not reduce a box's min-content width, so a long unbroken token
keeps its full intrinsic width regardless of the cell's `max-width`, and the line is painted **outside** the
cell, across the next column. At desktop the two values collide at the boundary; at mobile the neighbour's
value is drawn **entirely inside** the first one — glyph on glyph, both unreadable, with no scroll affordance
to recover either.

The trigger here is the `SKU` row, which renders the product `code`. Six of the store's 4550 products carry a
32-character hex code (verified by full catalog scan). **The data is correct** — see §Not a data bug.

## Steps to Reproduce
1. Anonymous is fine (compare is localStorage-backed). Search `CHAMPAGNE COOLER STAINLESS STEEL MAT 20CM`,
   add to compare from the result card.
2. Search `CIF PROFESSIONAL GLASS & INTERIOR CLEANER BOTTLE 0,75L`, add to compare.
3. Open `{{FRONT_URL}}/compare` → tab **Everything for Kitchen** → read the **SKU** row.
4. Resize to 390px width and re-read the same row.

**Expected:** each value stays inside its own column — wrapped, broken or ellipsised — and is attributable to
exactly one product.
**Actual:** the 32-char code crosses its cell border and is painted over the adjacent column's value.

## Measurements (Range rect over the text node; cell columns are a fixed 240px)

| Viewport | cell `scrollWidth`/`clientWidth` | text-rect intersection | overruns own cell by |
|---|---|---|---|
| 1920×1080 | **254 / 239** | **2.11px** — A.right 745.61 > B.left 743.5 | 14.11px past the border box |
| 1280×900 | 254 / 239 (identical) | **2.11px** | 14.11px |
| 390×844 | **254 / 111** | **130.11px** — B (243→299.84) wholly inside A (131→373.11) | 142.11px; also past the table's right edge |

At 390px `documentElement.clientWidth == scrollWidth == 375` and `scrollParents: []` — **nothing can be
scrolled to disambiguate the two values.**

Computed style, identical on all 14 value cells across all 7 rows:
`display: flex · overflow: visible · white-space: normal · word-break: normal · overflow-wrap: break-word ·
text-overflow: clip` · desktop `width/max/min = 240/240/192px` → mobile `112px / none / 0px`.

**Not SKU-specific — table-wide.** All value cells share one class and one computed-style signature; any row
(`brand`, `original_sku`, `Manufacture`, …) breaks identically given a long unbroken value. SKU is simply the
only row whose data currently *is* one. Short values wrap and sit correctly at every viewport, so this is not
general clipping — the failure mode is exclusively *long unbroken token → no wrap, no ellipsis, overflow painted*.

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | **FAIL** | rects above · `screenshots/Compare-Table-Long-Value-Overlays-Adjacent-Column/` · console 0 errors, 0 warnings; no 4xx/5xx |
| 2. Backend Admin | PASS | Platform REST (admin token) returns `code = 9fb9c34b95b24c6094cab9b7b991ff62` — the value shown is the catalog value |
| 3. GraphQL xAPI | PASS | `products(storeId:"B2B-store", cultureName:"en-US", currencyCode:"USD")` → same `code`; `original_sku=802805` is a separate property |
| 4. Platform REST API | PASS | `GET /api/catalog/products/745e5212-684a-426a-9d26-fe507d686058` → 200, same `code` |

**Owning layer:** Layer 1 — Storefront. Lower layers all report the data correctly; only the rendering fails.

## Not a data bug
`code` genuinely is `9fb9c34b95b24c6094cab9b7b991ff62` for CHAMPAGNE COOLER (id `745e5212-…`), with
`original_sku=802805` held separately — confirmed at **both** xAPI and Platform REST. The storefront renders
the real SKU faithfully. A full scan of all 4550 products found **6** with a 32-hex `code`; the next longest
code in the catalog is 11 characters. Those six products are the reachable trigger, not the defect.

## Root Cause Analysis
`client-app/shared/compare/components/compare-table.vue` (@ `dev`), `&__row-value`:

```scss
&__row-value {
  @apply flex min-w-48 max-w-60 flex-1 items-center break-words px-3 py-2.5 text-sm font-normal text-neutral-900;
}
```

The `<td>` is a flex container and the value is a bare **anonymous text flex item** (no inner wrapper element —
confirmed in the DOM). Three facts compose:
1. `break-words` = `overflow-wrap: break-word`, which per CSS Text **does not reduce min-content width** — only
   `overflow-wrap: anywhere` / `word-break: break-all` do. The token's intrinsic width stays 242.11px.
2. The flex item's default `min-width: auto` refuses to shrink below that min-content width; the cell has no `min-w-0`.
3. The cell is `overflow: visible`, so `text-overflow: clip` is inert and the line is simply painted outside the box.

**The guard already exists elsewhere in the same file** — `&__row-label-text` uses `@apply min-w-0 truncate`, and
the product title cell (`.vc-product-title__text`) computes `overflow: hidden` + `-webkit-line-clamp: 2` +
`word-break: break-word` and duly clamps. It was simply never applied to the property-value cells.

**Fix shape (CSS only):** on `.compare-table__row-value`, add `min-w-0` plus `break-all` (or
`overflow-wrap: anywhere`), or mirror the title component's `overflow: hidden` + clamp treatment.

**Test harness note for `/qa-fix`:** `compare-table.test.ts` covers focus management only and has no overflow
coverage. This is a layout defect — jsdom cannot measure it, and asserting the class list would be a declaration
test. Prove it in a browser (rect intersection at 390px), not in vitest.

## Lane note (observation, not a defect)
`playwright-firefox` `browser_click` timed out at "performing click action" after resolving the element as
visible/enabled/stable; the target stayed `aria-pressed="false"`. Per `.claude/rules/agents.md` §Firefox, check
the MCP restart after the occlusion pref and that `@playwright/mcp` is still pinned in `.mcp.json`. Repro ran on
`playwright-edge` instead.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** `VirtoCommerce/vc-frontend`
- **repoKind:** frontend
- **Ownership hint:** platform
- **Component / module:** Compare v2 — `CompareTable` property-value cells
- **RCA anchor:** `client-app/shared/compare/components/compare-table.vue` → `&__row-value` (`@apply flex min-w-48 max-w-60 flex-1 items-center break-words …`, ~line 669 on `dev`)
- **Routing confidence:** HIGH — single file, single CSS rule; lower layers all PASS.
