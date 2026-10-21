# VCST-6398 — PASS WITH NOTES
vc-frontend 2.60.0 merged into vc-frontend-next (PR #11 @ d67b0e0a, footer `3.1.0-pr-11-d67b-d67b0e0a` on vcst): every area of the developer checklist works except Punchout (module absent on vcst). No defect introduced by the merge reaches Medium, and the three Medium bugs filed predate it.

Deployment unverified by the bundle ("DEPLOYMENT UNKNOWN: VirtoCommerce/vc-frontend-next#11 — no CI artifact resolved for this PR"); the served chunk and vc-deploy-dev@vcst-qa both name the pr-11 build, confirmed in every lane.

| AC | Result | Evidence |
|---|---|---|
| AC-2…6 Compare: tabs, differ line, sticky header, sideways scroll, mobile bar | PASS | screenshots/A1-compare-differences-1920.png, A3-*, A4-*, A5-* |
| AC-7, AC-8 Configuration checklist rows, live states, "Review" navigation | PASS | screenshots/A7-checklist-complete.png, A8-*, A9-* |
| AC-9 SKU line in dark mode (11.2:1) | PASS | screenshots/A14-sku-dark-*.png |
| AC-10 Quantity out of range — cart explains the range; quote follows vc-frontend#2533 (positive-number only) | PASS | screenshots/A15-*, A16-rerun-*.png |
| AC-11…16 Punchout mode label | BLOCKED — module not installed on vcst (accepted P1); no-session negative PASS | screenshots/B11-*.png |
| AC-17…21 Sales Rep Hub as a plugin, upstream look, roles | PASS | screenshots/B1-*.png, B3–B8 |
| AC-22, AC-23 Missions skeletons, rewards banner | PASS | screenshots/A17-*, A18-* |
| AC-24, AC-25 Organization returns, read-only, non-holder refused | PASS | screenshots/B9-*, B10-* |
| AC-26 File attach limits and messages | PASS | screenshots/A19-*.png |
| AC-27, AC-28 view_item_list / select_item with list id and name | PASS | results/VCST-6398/har/laneA.har |
| Module Federation on by default: one GetStorePlugins, no blocking boot | PASS | B6, B8 · results/VCST-6398/har/B6-anon-cold-home.har |
| Regression, critical cases of 11 suites (vc-frontend suites — indicative on Next) | PASS — 56 pass, 5 fail, all suite expectations | reports/regression/regression-2026-10-20.md |

## Bugs
- Medium [VCST-6452](https://virtocommerce.atlassian.net/browse/VCST-6452) Quotes pages show raw i18n keys after a full-page load — reports/bugs/open/medium/BUG-Quotes-Pages-Raw-I18n-Keys-On-Hard-Load-VCST-6452.md (pre-existing)
- Medium [VCST-6453](https://virtocommerce.atlassian.net/browse/VCST-6453) Category infinite scroll: page-N view_item_list repeats earlier pages — reports/bugs/open/medium/BUG-GA4-Category-Infinite-Scroll-View-Item-List-Repeats-Previous-Pages-VCST-6453.md (pre-existing)
- Medium a11y [VCST-6454](https://virtocommerce.atlassian.net/browse/VCST-6454) Configurable option radios have no accessible name — reports/bugs/open/medium/BUG-Configurable-Option-Radios-No-Accessible-Name-VCST-6454.md (standalone, pre-existing)
- Low, not filed: configuration checklist pushes PDP CLS to 0.1015 at 1920 px (new with the merge, marginal) — reports/bugs/open/low/BUG-Configurable-PDP-CLS-Checklist-Late-Mount.md
- Low, not filed: quote detail unit price list vs proposal by width (follow-up of VCST-6375) — reports/bugs/open/low/BUG-Quote-Detail-Price-Per-Item-List-Vs-Proposal-By-Width.md
- Low, not filed: logout logs a firebase-messaging-sw.js 404 — reports/bugs/open/low/BUG-Logout-Firebase-Messaging-SW-404.md

Questions for the PO / dev, not filed:
- Compare: Differences always keeps Price, Availability and pinned rows, but "Differ: N" counts only differing rows (coded since #2452)
- Next desktop has no organization switcher (`IS_ORGANIZATION_SWITCHER_SHOWN = false`, VCST-6030) — mobile has it
- Zero-result grids send an empty view_item_list
- Quotes: should a quote line warn above stock? Today it does not, upstream included

## Not tested, and why
- AC-11…16 Punchout label on a live session — VirtoCommerce.Punchout absent on vcst; needs a stand with Punchout + this theme
- Sales Rep plugin failure path (manifest abort, widget error states) — needs request interception, which the real-user rule forbids
- Missions disabled (MSNF-004) — needs a store-wide setting flip
- "Check it out" row state and a whitespace-only parent — no fixture product has them
- Print preview of the checklist — Chrome's native print dialog took over the tab
- Regression suites are written for vc-frontend: UI/placement cases do not fit the Next design; a vc-frontend-next suite comes next

## Data
Created 1 quote, 4 cart lines, 8 local files (+ 4 orders and 1 quote by regression cases) · removed: local files 8; storefront teardown of the ledger — see summary.json.test_data · settings restored and re-read: none changed

## Context used
Strategy reports/tickets/Sprint26-21/VCST-6398/test-strategy.md · Round 1 · Model reports/ba/test-models/VCST-6398-2026-10-20.md · Checklist reports/tickets/Sprint26-21/VCST-6398/testing-checklist.md · Domain map PRESENT (configurable-products) · Mind map .claude/knowledge/domain/configurable-products.mind-map.json · Exploratory reports/exploratory/SBTM-VCST-6398-2026-10-20.md · Triage reports/tickets/Sprint26-21/VCST-6398/triage-report.md · PRs VirtoCommerce/vc-frontend-next#11 (vc-frontend #2518, #2527, #2543, #2569, #2574; #2533, #2548 not read)
