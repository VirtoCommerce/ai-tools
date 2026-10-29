# VCST-6589 — fix verification on vcptcore-qa

**Verdict: VERIFIED WITH NOTES** · 2026-10-28 · Edge (playwright-edge), admin

**Build:** PageBuilderModule `3.1040.0-pr-181-812c` = PR [#181](https://github.com/VirtoCommerce/vc-module-pagebuilder/pull/181) head `812c83bd` (open, base `dev`; Jira link in the PR points to VCST-4935, not VCST-6589)
**Fix:** `linkPageSelect.vue` — `VcSelect` gets `tw-min-w-0`; `MultilanguagePageDetails.vue` — `.languages-table__link > td > * { width: 0; min-width: 100% }` so the link row cannot widen the table.

## RED → GREEN

| | Build | Blade | Result |
|---|---|---|---|
| RED (baseline) | `3.1039.0-pr-175` | ~770 px, next to the list | Cancel cut to "Ca", Link off-screen, zh-CN Unlink hidden — tester's screenshots on the bug (`reports/bugs/fixed/BUG-PageBuilder-Link-Existing-Row-Overflows-Narrow-Blade-VCST-4935*.png`) |
| GREEN run 1 | pr-181 | 837 px (1920×1080) | table 759 px; Cancel / Link / Unlink inside the blade |
| GREEN run 2 | pr-181 | 560 px (1366×768) | table 483 px; value 464 px truncated to 229 px (`text-overflow: ellipsis`); Cancel / Link / Unlink inside |
| GREEN run 3 | pr-181 | 517 px (1280×720), STR repeated after Cancel | table 439 px; value truncated to 186 px; Cancel / Link (enabled) / Unlink inside |

Same page as the report: multilanguage page **123** (zh-CN Draft), fr-FR → Link existing → `AGENT-TEST-VCST4935-gql134-fr (/agent-test-vcst4935-gql134-fr)`. **Link was not clicked** — no data changed.

Screenshots: `screenshots/run1-narrow-blade-pr181.png`, `screenshots/run3-1280-blade517-pr181.png` (run 2: measured, link row below the fold in the shot).

## Checklist

| # | Check | Result |
|---|---|---|
| 1 | STR reproduced on the fixed build, 3/3 | PASS |
| 2 | Cancel and Link inside the blade with a long title | PASS (3 widths) |
| 3 | Other rows keep their buttons (zh-CN Unlink) | PASS |
| 4 | Root cause addressed — table width no longer follows the select | PASS (table < blade at every width) |
| 5 | Link disabled until a page is chosen, enabled after | PASS |
| 6 | Cancel closes the row; reopening works | PASS |
| 7 | Maximized blade unchanged | PASS (1920 layout as before) |
| 8 | No new console errors | PASS — only a SignalR handshake retry at app start (stand just redeployed), reconnected |

## Notes (non-blocking)

- At 1280 the truncated value shows as `AGENT-TEST-VCST4935-gc` with no visible "…": `text-overflow: ellipsis` is computed, but the end of the text sits under the clear (×) icon. Cosmetic.
- Below ~1300 px the Create / Link existing pair wraps to two lines in each row — by design (`tw-flex-wrap` on the actions), not part of this fix.
- PR #181 is linked to VCST-4935 in its description; VCST-6589 has no linked PR in Jira.
