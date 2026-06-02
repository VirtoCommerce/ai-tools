# Regression Report — REG-2026-05-26-1530

## Summary
- **Scope:** Suite 014 — new cases ORD-052..ORD-079 only (28 cases authored in run `COV-2026-05-26-1430`)
- **Selection:** `014:new-cases-subset` (custom subset, not a standard manifest selection)
- **Env:** vcst-qa @ Storefront `2.50.0-pr-2291-fed4-fed4fe16`
- **Browser:** `playwright-chrome` (one slot)
- **User:** `{{USER_EMAIL}}` (BMW-Group, 22 orders visible)
- **Duration:** 28 minutes (11:38 → 12:06 UTC)
- **Quality gate:** PASS (no Critical bugs; 1 new P1 bug surfaced for review)

## Counts

| Verdict | Count | % |
|---------|-------|---|
| PASS | 23 | 82.1% |
| FAIL | 4 | 14.3% |
| SKIPPED | 1 | 3.6% |
| BLOCKED | 0 | 0.0% |

Of the 4 FAILs: 1 is a genuine new finding (ORD-054), 2 are intentional regression trip-wires for known a11y anomalies (ORD-076, ORD-077 — predicted in CSV), 1 is a minor UX inconsistency (ORD-075).

## Failures

| ID | Title | Verdict | Notes | Evidence |
|----|-------|---------|-------|----------|
| ORD-054 | Date Range — Start > End validation | **FAIL — NEW BUG** | Inverted range (Start=05/26 > End=04/26) silently accepted; no validation; End dropped from GQL filter (`createddate:["...05-25Z" TO]`). Chip shows Start only. 0 rows. | `screenshots/ORD-054-FAIL-inverted-range-end-dropped.png` |
| ORD-075 | Outside-click discards un-applied entries | FAIL — minor UX | Outside-click correctly closes popover and doesn't apply filter (no chip, no GQL fired) BUT typed-but-unapplied values remain visible in inputs on reopen instead of being discarded. Data layer clean; UI retention inconsistent with CSV's discard expectation. | `screenshots/ORD-075-FAIL-unapplied-values-retained.png` |
| ORD-076 | Distinct accessible names for calendar buttons | FAIL — known a11y A6 | Both "Open calendar" buttons share identical `aria-label="Open calendar"`. WCAG 2.4.6 / 1.3.1. CSV correctly predicted FAIL. | `screenshots/ORD-076-FAIL-duplicate-aria-labels.png` |
| ORD-077 | Touch target ≥ 44px on mobile | FAIL — known a11y A5 | Both date inputs render at 36px at 375×812 viewport. WCAG 2.5.5 / Apple HIG 44px minimum. CSV correctly predicted FAIL. | `screenshots/ORD-077-FAIL-touch-target-36px.png` |

## Skipped

| ID | Title | Reason |
|----|-------|--------|
| ORD-057 | Status Filter Persists Across Pagination | BMW-Group has Payment required=10 / Processing=10 / New=2; no status exceeds page size, no pagination control surfaces. Needs seeded order set with >10 in one status. |

## Passes — comma-separated

ORD-052, ORD-053, ORD-055, ORD-056, ORD-058, ORD-059, ORD-060, ORD-061, ORD-062, ORD-063, ORD-064, ORD-065, ORD-066, ORD-067, ORD-068, ORD-069, ORD-070, ORD-071, ORD-072, ORD-073, ORD-074, ORD-078, ORD-079.

## Cross-Browser Cross-Reference

| Case | Firefox (manual repro 2026-05-26) | Chrome (this run) | Verdict |
|------|----------------------------------|-------------------|---------|
| ORD-052 (filter + sort) | PASS | PASS | Consistent |
| ORD-062 (Custom range GQL bounds) | PASS — both bounds present | PASS — both bounds present | Consistent — A1/A2 anomaly remains REFUTED |
| ORD-069 (End retained on panel reopen) | PASS | PASS | Consistent — A2 anomaly remains REFUTED |

The original P0 bug claim (A1) from the exploration agent is now definitively refuted across both browsers. The bug report at `reports/bugs/closed/BUG-Order-History-Date-Picker-End-Dropped-CANNOT-REPRODUCE.md` stays CLOSED.

## Bugs Found

### NEW — P1 — Inverted date range silently accepted; End dropped from GraphQL filter

**Affected:** ORD-054
**Summary:** When the user enters Start > End (e.g., Start=05/26/2026, End=04/26/2026) in the Custom-date inputs:
- Apply button is enabled (no client-side validation)
- No error message, no auto-swap
- GQL `GetOrders` filter is sent with only the lower bound: `createddate:["2026-05-25T22:00:00.000Z" TO]` — End value silently dropped at apply-time
- Filter chip shows "Start: 5/26/2026" only — no End indicator
- Result list: 0 rows (because no orders dated after 5/26)
- User has no feedback that End was ignored

**Severity rationale:** P1 (not P0) because this only fires on user-invalid input. It is *not* the previously-claimed "End dropped from valid Custom ranges" — that claim was refuted. This is a defensive-validation gap with a silent-data-loss side effect.

**Distinction from refuted A1:** Valid ranges (Start ≤ End) correctly send both bounds, confirmed across Firefox and Chrome by ORD-062. Only inverted ranges trigger the End-drop. The frontend likely runs `toEndDateFilterValue()` through a path that returns undefined when End < Start, silently dropping it instead of refusing the Apply.

**Recommended fix paths** (for engineering — not binding):
- Add client-side validation: when Start > End, either disable Apply, auto-swap, or show inline error.
- OR: send the invalid range to the backend anyway and let server return an empty result with an error message.
- OR: keep the silent-drop but surface an inline note on the End field.

**Recommended next QA step:** Second-source confirmation per `feedback_verify_payload_bugs_second_source` — manual user repro on Chrome OR an agent repro on Firefox/Edge before filing JIRA. The first false-positive (A1) cost a session of cleanup; the verification protocol is non-optional.

### Known / documented — not filing

- **P3 — ORD-075 — Outside-click retains un-applied values on reopen.** Data layer clean (no GQL fired, no chip). Only UI state retention. UX nit; not a regression worth filing on its own.
- **P2 — ORD-076 — Duplicate `aria-label="Open calendar"` (a11y A6).** Already in exploration report. Suite case is the formal regression trip-wire.
- **P2 — ORD-077 — Touch target 36px on mobile (a11y A5).** Already in exploration report. Suite case is the formal regression trip-wire.

## Notable run observations

- **ORD-053** — Order detail opens in a **new tab** (per memory `project_vctable_rowclick_newtab` — by-design VcTable behavior). The case verifies persistence via tab independence rather than browser-back. Smart adaptation.
- **ORD-060** — B2B org-scope verified via the "All orders" toggle. `GetOrganizationOrders` xAPI explicitly carries `organizationId` (9d32a961-fe81-4243-a2d1-f6c9a317e5d3) and surfaces a "Buyer name" column with Alice May alongside Elena Mutykova — confirming multi-buyer org-scope works. No cross-org leak.
- **ORD-074** — The calendar UI is actually **single-month per input** (one calendar per Start, one per End), NOT dual-month side-by-side as the original exploration claimed. Case content should be updated next time someone touches it.
- **ORD-055** — Minor UX glitch: Apply button required Tab/blur to re-enable after End-only change (dirty-state detection lag). Worked around via Tab; case ultimately PASSED.

## Skipped/Stale artifacts

- `screenshots/ORD-055-FAIL-single-day-end-bound-dropped.png` exists but ORD-055 was marked PASS — appears to be a screenshot taken during the transient pre-Tab state. Safe to ignore.

## Test-data follow-ups (out-of-scope for this run)

- ORD-057 needs `SEED REQUIRED` setup: ≥15 orders in a single status (e.g., 15+ Processing orders) so pagination surfaces in a single-status filtered view. Recommend adding to the next `/qa-seed-data` profile sweep.
- ORD-074 description needs updating: calendar is single-month, not dual-month.

## Files

- Results JSON: `reports/regression/REG-2026-05-26-1530/suite-014-subset-results.json`
- Input CSV (subset): `reports/regression/REG-2026-05-26-1530/suite-014-new-cases-subset.csv`
- Screenshots: `reports/regression/REG-2026-05-26-1530/screenshots/` (6 PNGs)
- Status tracker: `reports/regression/test-run-status.json`

## Next Actions

1. **ORD-054 NEW bug** — confirm via second-source repro before JIRA filing (user manual OR Firefox agent). Stub-ready in this report.
2. **ORD-074 case content** — update to reflect single-month calendar (not dual).
3. **ORD-057 SEED** — add to seed profile if regression coverage needs >page-size single-status state.
4. **Update Automation_Status** for the now-validated cases (ORD-053, ORD-055, ORD-056, ORD-058, ORD-059, ORD-060, ORD-061, ORD-067, ORD-068, ORD-069, ORD-070, ORD-071, ORD-072, ORD-073, ORD-074, ORD-078, ORD-079) from `Generated` to `Automated` (or `Validated` per suite convention).
