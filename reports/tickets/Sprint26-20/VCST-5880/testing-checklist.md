# VCST-5880 — Testing checklist (FULL)

**Target:** storefront http://localhost (vc-frontend PR #2518, theme `2.60.0-pr-2518-ee98-ee98adbd`, marker `X-VC-Local-Theme: fe-31e719531329`), API proxied to vcst-qa (Platform 3.1078.0, store B2B-store). **Baseline:** vcst-qa storefront, theme `2.60.0-pr-2511`, the pre-fix compare table.
**Model:** `reports/ba/test-models/VCST-5880-2026-10-12.md` (scenarios 1–20). **Discovery:** `reports/exploratory/SBTM-VCST-5880-2026-10-12.md`.
**Data:** Group A `@td(PROD_CMP_A|PROD_CMP_B|PROD_LONGNAME|PROD_CMP_FILL_1|PROD_CMP_FILL_2)`, with pairwise-distinct prices, so a one-column shift shows up. Group C `@td(PROD_CMP_C)`. `@td(PROD_CMP_VARIATIONS)` · `@td(CFG_LAPTOP)`. Clear `compareProducts` before each item. Guest session.
**Coverage legend:** `CMP-0xx` = a case in `098-product-compare.csv` (CMP-036..053 authored this run, `Draft`; CMP-037 `Manual`) · `CHECK` = covered here only. Every `PENDING-A` was resolved at 3-cases.
**Undeclared purpose:** none; Part 0 is carried forward from VCST-5735.

| # | Condition (atomic) | Source | Covered by | Lane | Verdict |
|---|---|---|---|---|---|
| 1 | Exactly ONE `table` holds the product header row and the attribute rows, in the browser's **native** AX tree (Chromium) | C1 · {SPEC} | CMP-036 | 4v DevTools + 4a chrome | |
| 2 | Each product is a `columnheader` named by the product alone (aria-label) | C2 · BL-A11Y-002 | CMP-036, #10 | 4v + 4a | |
| 3 | Each body value is a `cell` in its product's column: the price under each header equals THAT product's price (3 and 5 entries) | C3 · {SPEC} | CMP-036, #3 | 4a | |
| 4 | Each attribute is a `rowheader` named by its label; the explanation is exposed as a description; rows without one carry no `aria-describedby` | C4 · BL-A11Y-002/004 | CMP-044 | 4v + 4a | |
| 5 | Table roles survive `display:block` (table/thead/tbody) and `flex` (tr/th/td): Chromium native tree | C5 · 1d DRIFT | CMP-036 | 4v | |
| 6 | Same in **Gecko**, via the native tree | C5 · 1d DRIFT | CMP-037 (Manual — Firefox Accessibility Inspector; not reachable from agent lanes, 3x) | manual | |
| 7 | Corner: desktop holds All / Differences / readout / Clear category; at 375 an empty `td`. Header-row cell count = 1 + N at both widths | C6 · 1d DRIFT | CMP-039 | 4a | |
| 8 | Sticky header stays flush below the site header; compact header keeps N `columnheader`s with names and `scope` after re-creation | C7, C8 | CMP-040 | 4a | |
| 9 | Header and body scroll in step: wheel/drag on the body, Tab into an off-screen header control (5 entries, 1280 and 800) | C7 · BL-UI-005 | CMP-041 · CMP-024 | 4a | |
| 10 | **Header and body stay in step when focus moves header → body (Tab onto the first row Pin) and back, and through pin/unpin, at 800 px** | 3x reverse focus edge · BL-UI-005 | CMP-052 | 4a **Chromium re-run of the 3x Gecko FAIL** | |
| 11 | A control focused by Shift+Tab in a scrolled column is not hidden under the sticky corner | 3x · BL-A11Y-001 (2.4.11) | CMP-053 | 4a + baseline | |
| 12 | Mobile 375: one table, empty corner + N `columnheader`s, tabs outside, cells map; no document horizontal scroll | C9 · BL-UI-004 | CMP-039 · CMP-009 | 4a | |
| 13 | Layout unchanged vs the baseline at 1920/1280/768/375 (column x-edges, row heights, sticky offset), light + dark; corner and labels stay pinned at the end of a horizontal scroll | C10 · BL-UI-001/003/004/005 | CMP-048 · CMP-025 | 4v | |
| 14 | A long unbroken product name neither widens its column nor paints over the next column (1920 and 600) | VC-UI-006 · BL-UI-004/005 | CMP-042 | 4a | |
| 15 | A long unbroken VALUE token in a cell: same | VC-UI-006 | **WAIVED (residual risk, ratified at 3-cases)** — no fixture carries a long unbroken value; seeding one on a shared vcst fixture mid-run was declined. CMP-042 covers the header-cell half. Owner: `/qa-generate-data` follow-up (VC-UI-006 value-cell shape) | — | WAIVED |
| 16 | A missing property renders `–` in its own cell, so cells per row always equal products | 3x grounding (row 3) | CMP-038 | 4a | |
| 17 | Pin a described row, then Differences: each `aria-describedby` resolves to its own row's explanation; ids unique | gap-AC-4 · BL-A11Y-004 | CMP-043 | 4a | |
| 18 | Plain + configurable + variations headers: each named by the product alone, with Customize / Variations / Add to cart operable inside | gap-AC-6 · BL-A11Y-002 | CMP-045 · CMP-034 | 4a | |
| 19 | Tab switch A↔C and removing a column leave exactly N headers over N cells | gap-AC-5/16 | CMP-046 | 4a | |
| 20 | One entry: 1 `columnheader`, 1 `cell` per row, Differences disabled; empty list exposes no table | gap-AC-7 | CMP-051 | 4a | |
| 21 | Zoom 200% / 400%: one table, same mapping, nothing clipped | gap-AC-10 · UIP-VIEW | CMP-049 · CMP-031 | 4v | |
| 22 | Keyboard: Tab order header → body, visible focus, off-screen controls scrolled into view, `thead` (tabindex −1) not a Tab stop, no trap | gap-AC-9 · BL-A11Y-001 | CMP-050 | 4v + 4a | |
| 23 | axe-core desktop + mobile: 0 Critical/Serious. The inactive "Differences" tab contrast issue is tagged PRE-EXISTING | gap-AC-12 · BL-A11Y-003/004 | CMP-047 | 4v | |
| 24 | Add to cart from a product header cell really adds the line (rendered cart, not the response) | journey L6 · BL-CART-007 · VC-CART-004 | CMP-036 | 4a | |
| 25 | At 375 the icon-only Clear all is named "Clear all"; Clear category is reachable | 3x · BL-A11Y-002 | CHECK (4a: accessible-name read) · CMP-003 covers reachability only | 4a | |
| 26 | Screen reader in table mode announces the product + attribute with each cell (NVDA; JAWS if available) | C11 · ticket STR 4 | MANUAL-CONFIRM — no AT in agent lanes; WebKit/VoiceOver WAIVED (no macOS) | manual | |
| 27 | Touch targets of Pin / Remove / Add to cart at 375 | gap-AC-15 · BL-UI-006 | CHECK | 4v | |
| 28 | Design-system tokens on the changed cells (corner background, dark preset) | visual axis | CHECK | 4v | |
| 29 | `vs. DESIGN` | visual axis | **SKIPPED: the ticket carries no Prototype/design link** | — | |
| 30 | Page height of viewport+300 px at the compact threshold: no freeze; scroll bounce is PRE-EXISTING (identical on the baseline, KB-C5E27085) | PR "found, not fixed" · BL-UI-003 | CHECK (3x observed) | — | PRE-EXISTING |
| 31 | Fork BREAKING class removals/renames listed for release notes | gap-AC-17 | 5-docs | — | |
| 32 | RTL locale: header/body sync and the sticky corner flip | gap-AC-11 · BL-UI-005 | **WAIVED: B2B-store offers no RTL culture (15 cultures read live, none RTL)** | — | WAIVED |

**Existing cases confirmed by 3x (tc:scope, input to 2a):** CMP-003, CMP-009, CMP-010, CMP-024, CAT-COMP-004 · NOT REACHED: CMP-025, CMP-031, CMP-034 · BROKEN-MECHANICS: none.
**Not filed (below severity floor):** _filled at 5-report_
