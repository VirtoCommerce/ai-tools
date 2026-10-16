# A whitespace-only required parent Text reveals its dependent configuration section — **P3**

## Status: CONFIRMED (live: 3x chrome, 4a chrome, C1 `REG-2026-10-06-1857` CFG-CHK-028; reproduced on the DEPLOYED theme — 2026-10-06)
**Found by:** agent — testing VCST-6027 (`/qa-test` FULL, incidental)
**Tracker:** not filed — below the severity floor (Low). Named in the VCST-6027 QA comment.
**Oracle:** `{HYPOTHESIS}` — the gate (`BL-CAT-006`) and the row both treat the whitespace value as empty, while the
`dependsOnSectionId` visibility check treats it as a value; the two predicates disagree on one state. PO to confirm.
**Provenance:** PRE-EXISTING — reproduced on https://vcst-qa-storefront.govirto.com (theme `2.59.0-pr-2476-43b1`,
no checklist), so not caused by PR #2527; the new checklist only makes it visible as an extra "Style Pack — optional" row.

## Steps
1. Open `@td(CFG_TEXT_DRIVEN_COND.url)` (CFG-024: Engraving Line 1 — Text, REQUIRED → Style Pack depends on it).
2. Type three spaces into Engraving Line 1.

**Expected:** Engraving stays required and its dependent Style Pack section stays hidden (no value ⇒ no reveal).
**Actual:** Engraving row stays red "— required" and Add to cart stays disabled, but the Style Pack section and a
"Style Pack — optional" checklist row appear.

**Evidence:** `reports/tickets/Sprint26-20/VCST-6027/screenshots/VCST-6027-4a-c13-cfg024-whitespace-parent-reveals-child.png`,
`VCST-6027-3x-cfg024-whitespace-reveals-child.png` · case `CFG-CHK-028` (072, Draft).
**Fix Routing:** `VirtoCommerce/vc-frontend` · `useConfigurableProduct` section visibility (`dependsOnSectionId`) — use the trimmed value.
