# VCST-5880 — Visual axis (Step 4v) design report

**Lane:** ui-ux-expert, Chrome DevTools MCP, guest, no auth. **Target:** http://localhost/compare (vc-frontend PR #2518, theme `2.60.0-pr-2518-ee98-ee98adbd`). **Baseline:** https://vcst-qa-storefront.govirto.com/compare (theme `2.60.0-pr-2511-81f1-81f18d01`, two-table build).
**Data:** Group A `PROD_CMP_A, PROD_CMP_B, PROD_LONGNAME, PROD_CMP_FILL_1, PROD_CMP_FILL_2` (5 entries, 9 rows), added through the PDP "Add to Compare" button on both origins; `compareProducts` cleared first and again at the end. axe-core 4.10.2 (cdnjs), tags wcag2a/2aa/21a/21aa/22aa.
**Axes:** a11y **PASS for the change, FAIL pre-existing** (0 NEW violations; 3 PRE-EXISTING Serious, see F1–F3) · design-system **PASS** · `vs. DESIGN` **SKIPPED** (no Prototype/design link on VCST-5880; DesignSync not called).
**Method limits (all disclosed):** viewports below 500 px and browser zoom were set by DevTools device emulation, not the window or Ctrl+/-. Horizontal scroll was driven by setting the scroller's `scrollLeft` (the effect of a drag), not a wheel. Gecko, screen readers, the Red preset (a Storybook global) and CLS (BL-UI-001) were not measured.

## Per-item verdicts

| # | Verdict | Observed (PR vs baseline) | Evidence |
|---|---|---|---|
| 1/5 | PASS (see F4) | PR: exactly **1** `table "Compare products"` (baseline: 2 unnamed tables). Verbose native tree: table > rowgroup > row > [cell (corner), columnheader x5]; then row > [rowheader, cell x5] x9 = 46 cells, 9 rowheaders, 10 rows. Computed `display`: table block, thead block (sticky, top 128px, overflow auto, tabindex -1), tbody block (overflow auto), tr flex, th flex, td flex, corner td flex (sticky), column th/value td `contain: inline-size`, row th sticky. Roles survive the overrides in Chromium. | `4v-pr-1920-light.png` |
| 2 | PASS | 5 columnheaders named by the product alone ("AGENT-TEST-Compare-Alpha"). Baseline names are "Alpha Remove from compare Alpha Add to cart". | AX dump |
| 4 | PASS | rowheader name = label; description present only on Price per unit ("Price, excl. VAT, per unit.") and Min. order qty ("MOQ ..."); other 7 rows carry no `aria-describedby`. Each id resolves to its own row. Baseline names are "Price per unit Price, excl... Pin ..." (content concatenation). | AX dump |
| 13 | PASS | 1920/1280/768/375 x light/dark, both builds: column left/right edges header vs body delta 0.0 px; column widths 232.6/192/192/112; row heights identical lists (50, 57 at 1280/768, 50/57/74/75 at 375); sticky-header top 128 = site-header bottom 128 (gap 0, compact 107 px) at 1920, 90/81 identical at 375; no document horizontal overflow at any width. At the end of horizontal scroll (768: 497 px, 375: 311 px) header and body scrollLeft are equal, edge delta 0, corner x=25/7 and row-label x pinned, same as baseline. | `4v-{pr,base}-{1920,1280,768,375}-{light,dark}.png`, `4v-{pr,base}-1920-light-scrolled.png`, `4v-{pr,base}-375-light-scrolled.png` |
| 21 | PASS | Emulated 200% (960 px), 400% (480 px, crosses md) and 320 px: 1 table, 5 columnheaders, 9 rowheaders, 6 cells/row (corner empty below md), 46 cells; no clipped overflow:hidden element; no document overflow; table scrolls inside itself. | `4v-pr-zoom200.png`, `4v-pr-zoom400.png`, `4v-pr-zoom400-320-table.png` |
| 22 | PASS | Tab order from the page heading: Clear all, Group A tab, All, Differences, Clear category, then per product Remove > name link > Add to cart (x5), then Pin x4 in body order = visual order. `THEAD` never took focus. Every stop `:focus-visible` with a 2 px solid `rgb(27,120,155)` ring (about 5:1 on white). No trap. Info icons are not Tab stops (role=img). | `4v-pr-1920-focus-body-pin.png` |
| 23 | FAIL, all PRE-EXISTING | Desktop 1920 light, PR = baseline: 3 `color-contrast` Serious (F1). Mobile 375: 2 contrast + 1 `scrollable-region-focusable` (F2), identical on baseline. **0 NEW.** Baseline additionally lists `th-has-data-cells` (incomplete) on the header table; the PR does not (33 vs 32 passes). | axe output |
| 27 | PASS + WARN | 375: Remove 32x32, Add to cart 38x38, product link 87x32.8; **Pin is not rendered below md**. 768: Pin 26x26, Remove 32x32, Add 38x38, link 121x32.8. None < 24 (no FAIL); all < 44 (WARN); identical on baseline. | script output |
| 28 | PASS | Corner `td` bg = `--color-additional-50` (#ffffff light, #0a090b dark), thead bg the same, row-th bg the same token, borders `--color-neutral-200`/#2b2d34 family, padding 12/16/12/12, gap 12, row cells 10/12 (on the Tailwind scale), colours via tokens. Dark values equal the baseline's sticky container bg (#0a090b). | token dump |
| 29 | SKIPPED | No design link on the ticket. | — |

## Findings (provenance, suspected severity). Not filed.

| ID | Finding | Provenance | Rule | Sev |
|---|---|---|---|---|
| F1 | 3 contrast failures at desktop: "Clear all" #f99e24 on #fff **2.11:1**; "Group A" tab chip #fff on #688198 **4.05:1**; inactive "Differences" #737373 on #f5f5f5 **4.34:1**. The PR description reports only the third. | **PRE-EXISTING** (identical on baseline) | BL-A11Y-003, WCAG 1.4.3 | High (2.11:1 is the worst) |
| F2 | At 375 the body scroller has horizontal overflow (672 > 361) but no focusable content (Pin hidden), so it cannot be scrolled by keyboard. axe `scrollable-region-focusable`, Serious. | **PRE-EXISTING** (baseline `.compare-table__scroll`, same) | BL-A11Y-001, WCAG 2.1.1 | Medium |
| F3 | At <= 768 the All/Differences segmented control has a 2 px gap (BL-UI-006 asks 8 px). Targets are 32 px tall, so 2.5.8 is met. | **PRE-EXISTING** | BL-UI-006 | Low |
| F4 | AX tree: the `tbody` is an `ignored` node when the body is not scrollable (1920: 1 rowgroup exposed, the thead; rows are still children of the table). When it overflows (480 px) it is exposed (2 rowgroups). The brief expected rowgroup > row on the body side. Table navigation (rows, columns, headers) is unaffected. | NEW structure, not a defect | WCAG 1.3.1 | Info |
| F5 | At the bottom of the page at 375 the sticky header rect is at y=81, 9 px under the 90 px fixed site header (the sticky box is pushed up by its container end). | **PRE-EXISTING** (same numbers on baseline) | BL-UI-003 | Low |

## Invariants
BL-A11Y-001/002/004: the change satisfies them (names, order, focus); F2 is the only pre-existing break. BL-A11Y-003: F1 pre-existing. BL-UI-003/004/005: no shift, no overflow, header/body edges and row heights equal. BL-UI-006: no FAIL. BL-UI-001 (CLS): not measured, INCONCLUSIVE. Oracle gap acknowledged: no BL covers table/cell association; WCAG 1.3.1 used directly.

## Not run / manual
Gecko native tree and screen readers (items 6, 26); axe in the dark preset; the Red preset; CLS.
KB: captured KB-34C7A8DD (baseline two-table structure and noisy names; no PR-build behaviour captured). kb_ask returned no certified entry (kb_none recorded).
