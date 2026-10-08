# Configuration checklist marks a whitespace-only optional Text section "completed" — **P3**

## Status: CONFIRMED (live: 4a chrome, firefox lane, C1 `REG-2026-10-06-1857` CFG-CHK-014 — 2026-10-06)
**Found by:** agent — testing VCST-6027 (`/qa-test` FULL, found-in-testing)
**Tracker:** not filed — below the severity floor (Low). Named in the VCST-6027 QA comment.
**Oracle:** `{HYPOTHESIS}` — the ticket and `BL-CAT-006` are silent on whitespace; the same composable already treats
whitespace as empty for a REQUIRED Text section (PR #2527 `useConfigurableProduct.test.ts`). PO to confirm.
**Provenance:** IN-SCOPE (the checklist row is new in PR #2527); the `customText:"   "` payload is pre-existing.
**Build:** vc-frontend PR #2527 `2.59.0-pr-2527-d089-d08928e7` on http://localhost, API vcst-qa.

## Steps
1. Open `@td(CFG_FILE_DRIVEN_COND.url)` (CFG-025) → upload a file to Design Upload → choose Finish Type = Matte.
2. Click **Review** on the "Notes — optional" checklist row → type three spaces into Notes.

**Expected:** the row stays yellow "Notes — optional" + Review (a blank value is not a value).
**Actual:** row turns green "Notes (completed)"; the radio switches to "Custom option"; counter "3 / 200";
`CreateConfiguredLineItem` sends `customText: "   "`. Same on CFG-034 Message.

**Evidence:** `reports/tickets/Sprint26-20/VCST-6027/screenshots/VCST-6027-4a-c12-whitespace-optional-green-required-red.png`,
`VCST-6027-ff-14-notes-whitespace-completed.png` · case `CFG-CHK-014` (072, Draft).
**Fix Routing:** `VirtoCommerce/vc-frontend` · `useConfigurableProduct` — trim before treating optional Text as selected.
