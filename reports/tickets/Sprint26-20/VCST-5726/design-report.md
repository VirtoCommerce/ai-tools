# VCST-5726 — Design / a11y report (Step 4v re-dispatch)

**Env:** vcptcore_qa1, PageBuilderModule 3.1035.0-pr-171-61df · Chrome (playwright-chrome), 1920x1080, admin · Asset Library > AGENT-TEST-VCST5726 > p500 (500 assets, grid, 20/page)
**Scope note:** BL-A11Y-001/002 are storefront-theme oracles; on this admin surface deviations are ADVISORY WCAG findings (do not fail a functional ticket).
**vs. DESIGN:** SKIPPED — ticket has no Prototype link.

| Axis | Verdict |
|---|---|
| V-01 keyboard + names | PASS with advisory findings (A-1, A-2, A-3) |
| V-02 CLS (BL-UI-001) | PASS — CLS 0 |
| V-03 i18n | PASS for visible strings; advisory A-4 (aria-labels English in de) |

## V-01
- Accessible names OK: nav "Pagination"; buttons "First page", "Previous page", "Page N", "Next page", "Last page"; comboboxes "Items per page", "Sort by". Current page exposes `aria-current="page"`.
- Disabled state: First/Previous are native `disabled` on page 1 and are skipped by Tab (correct).
- Tab order logical: page-size combobox > its "Toggle dropdown" > Page 1 > 2 ... > Next > Last. Enter on Next moved to page 2 and kept focus on Next (asset-020 first row). Sort select: Click, ArrowDown, Enter re-sorted the list (keyboard operable).
- A-1 (Medium, WCAG 1.4.11 / 2.4.7): paginator focus ring is `box-shadow 0 0 0 3px rgb(218,237,247)` on white, about 1.2:1 (computed); well under 3:1. Visible but very faint. Screenshot `4v-focus-page1.png`.
- A-2 (Low, WCAG 2.1.1/2.4.3 noise): each select has an extra tab stop "Toggle dropdown" (DIV, no button role) besides the combobox.
- A-3 (Low, WCAG 4.1.2): the selected option of the Sort listbox shows no accessible name in the snapshot (others do: "Name (Z-A)" etc.).
- axe-core 4.10.2 on `main` (wcag2a/aa/21/22aa): 1 violation, color-contrast 3.01:1 on breadcrumb current item `span[title="p500"]` (#319ed4 on #fff) — not the new paginator, pre-existing breadcrumb. 21 incomplete: card "N refs" badge sits on an image, bg undeterminable (manual).
- Visual finding (caught by visual review, not a snippet): in grid at 1920 the "N Refs" badge is clipped/overlapped by the Copy-URL button ("0 Re..."), visible in `4v-de-sort-open.png` and `4v-pagesize-open.png`. Medium (cosmetic; refs count unreadable). Likely pre-existing card layout, not paginator.

## V-02 BL-UI-001
- PerformanceObserver('layout-shift') installed on p500 before paging. Unthrottled 1>2>3: CLS total 0.000 (0 entries).
- Fast 3G (CDP: 562 ms latency, 1.6 Mbps down) pages 3>4>5: CLS total 0.000 (0 entries). Throttle reset afterwards.
- Caveat: only grid paging by keyboard (Next) was measured; no sort/page-size change shift measured.

## V-03
- en: all strings translated ("Items per page", "Sort by", Name (A-Z)/(Z-A), Recently modified, Largest first).
- de (Deutsch, via profile Language menu): "Eintraege pro Seite", "Sortieren nach", Name (A-Z), "Zuletzt geaendert", "Groesste zuerst" — no raw keys. Language restored to English (UI preference only).
- A-4 (Low, WCAG 3.1.2 / localisation): in de the paginator aria-labels stay English: "Pagination", "First page", "Previous page", "Page N", "Next page", "Last page", and "Toggle dropdown" (framework). Not visible text; screen-reader impact only.
- Not checked: language-specific string overflow at 375/768 (only 1920 captured).

## Not done / limits
- Viewports 375/768/1280 and Coffee/Red presets not run (admin Manager, no storefront presets; viewport sweep not requested for V rows).
- Screen-reader output not verifiable. Findings are not filed.

Screenshots: `screenshots/4v-pagesize-open.png`, `4v-focus-page1.png`, `4v-grid-page5-last-tab.png`, `4v-sort-open.png`, `4v-de-sort-open.png`, `4v-en-restored.png`.
