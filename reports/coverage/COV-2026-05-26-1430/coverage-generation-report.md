# Coverage Generation Report — COV-2026-05-26-1430

## Summary
- **Run date:** 2026-05-26
- **Scope:** Custom narrow — `/account/orders` filter / search / sort / date picker (storefront UI only)
- **Mode:** Interactive
- **Target suite:** `regression/suites/Frontend/orders/014-orders-frontend.csv`
- **Build under test:** Storefront `2.50.0-pr-2291-fed4-fed4fe16` · vcst-qa
- **Cases generated:** 28 (10 filter + 18 date-picker)
- **Cases validated (live):** 1 (ORD-052 — filter+sort)
- **Bugs surfaced:** 1 P0 (stub ready, not filed)
- **Quality gate:** PASS with caveats (see below)

## Pipeline
1. Centralized gap analysis (orchestrator) → `gap-inventory.json` (10 filter gaps)
2. Authoring batch A (qa-frontend-expert — wrong agent, see notes) → ORD-052…ORD-061
3. Review pass (test-management-specialist) → 7 minor fixes + 3 rewrites flagged; mechanical fixes applied
4. Live exploration (qa-testing-expert, Firefox) → date-picker behavior matrix + 6 anomalies
5. Authoring batch DP (test-management-specialist — correct agent) → ORD-062…ORD-079
6. Manifest reconciliation: suite 014 `testCount` 67 → 95, `estimatedMinutes` 47 → 65
7. td-refs validation post-write: PASS (1848/1848)

## Cases Added

### Batch A — Filter / Search / Sort (10)
| ID | Title | Priority | Status |
|----|-------|----------|--------|
| ORD-052 | Status filter + sort combination preserved | Critical | **Validated** |
| ORD-053 | Filter persists across detail nav + back | High | Generated |
| ORD-054 | Date range — start > end rejection | High | Generated |
| ORD-055 | Date range — same-day boundary | High | Generated |
| ORD-056 | Filter + search intersection | High | Generated |
| ORD-057 | Filter persists across pagination | High | SEED REQUIRED |
| ORD-058 | Filter state on browser refresh | High | Generated |
| ORD-059 | Partial / prefix order-number search | High | Generated |
| ORD-060 | B2B org-scoped filter | High | SEED REQUIRED |
| ORD-061 | Active filter chip removal | Medium | Generated |

### Batch DP — Date Picker (18)
| ID | Theme | Priority | Status |
|----|-------|----------|--------|
| ORD-062 | Custom Date — End boundary in GQL filter | **Critical** | Generated — **currently FAILS (A1)** |
| ORD-063–066 | Preset serialization (Last day / week / month / year) | Critical | Generated |
| ORD-067 | Start-only "from X onward" semantics | High | Generated |
| ORD-068 | End-only "up to X" semantics | High | Generated |
| ORD-069 | Persistence — End retained across panel reopen | High | Generated — **currently FAILS (A2)** |
| ORD-070 | URL absence / refresh resets filter | High | Generated |
| ORD-071 | Invalid-character masking | Medium | Generated |
| ORD-072 | Future-date acceptance | Medium | Generated |
| ORD-073 | Reset clears inputs and keeps popover open | Medium | Generated |
| ORD-074 | Calendar UI — Prev/Next month navigation | Medium | Generated |
| ORD-075 | Outside-click dismiss | Medium | Generated |
| ORD-076 | a11y — distinct accessible names for calendar buttons | Medium | Generated |
| ORD-077 | a11y — touch-target ≥ 44 px on mobile | Medium | Generated |
| ORD-078 | a11y — keyboard nav in calendar grid | Medium | Generated |
| ORD-079 | Preset → Custom switch behavior | Medium | Generated |

Two scenarios from the spec dropped as semantic duplicates: same-day boundary (covered by ORD-055), inverted range (covered by ORD-054).

## Anomalies Discovered (live exploration)

| # | Severity | Symptom | Disposition |
|---|----------|---------|-------------|
| A1 | **P0** | Custom-date End silently dropped from GraphQL `filter` — `createddate:["...Z" TO]` with no upper bound. Reproduced 3/3 attempts. Presets unaffected. | Bug stub at `bug-stub-A1.md` — NOT filed (awaiting approval) |
| A2 | High | End input blank when Filters panel is reopened after Apply (root cause same as A1) | Covered by ORD-069 (regression trip-wire) |
| A3 | Medium | No client-side validation for inverted range (Start > End) | Covered by ORD-054 |
| A4 | Low/UX | Reset button closes the Filters popover (should keep it open) | Covered by ORD-073 |
| A5 | Low/a11y | Mobile input height 36 px (< 44 px touch target); no native picker fallback | Covered by ORD-077 |
| A6 | Low/a11y | Both "Open calendar" buttons share identical `aria-label` | Covered by ORD-076 |

## Quality Gate

| Check | Result |
|-------|--------|
| All new cases conform to `test-case-template.md` (15 cols) | PASS |
| All `@td()` / `{{VAR}}` refs resolve (`validate-td-refs.ts`) | PASS (1848/1848) |
| ORD-052 live-validated (P0 of Batch A) | PASS |
| No cross-batch duplicates | PASS (2 DP candidates dropped as dups of ORD-054 / ORD-055) |
| BL/ECL hygiene applied to new cases | PARTIAL — interim `BL-ORD-001`; new `BL-ORD-010` proposed (see Follow-ups) |
| Manifest `testCount` reconciled | PASS (67 → 95) |

## Out-of-Scope Findings (carry forward)

1. **Proposed new invariant `BL-ORD-010: Order list query behavior`** (filtering, sorting, pagination, scope isolation). All 22 cases citing filter behavior in suite 014 currently use `BL-ORD-001` as interim — needs a proper BL entry through normal promotion. **NOT promoted by this run** (per `feedback_business_logic_promotion`).

2. **Pre-existing miscitations:** ORD-006, ORD-015–025, ORD-027 still cite `BL-ORD-003` (partial fulfillment) for filter behavior. Fix in a follow-up sweep.

3. **Pre-existing unresolved env var:** `{{SAMPLE_TRACKING_NUMBER}}` referenced by `CHK-024` does not resolve in any `.env*` file. Owner: env maintainer.

4. **Date-picker probes deferred (BLOCKED in exploration):**
   - Browser back-nav from order detail — does Custom filter survive?
   - Calendar popup UX at 375 px mobile viewport
   - Culture/locale switch — does `MM/DD/YYYY` change to `DD/MM/YYYY` for en-GB? Localized month names in calendar?
   - Multi-tab behavior — apply filter in tab A, observe tab B
   - Arrow + Enter keyboard nav inside calendar grid (ORD-078 written but not validated)

5. **Process finding:** `/qa-coverage-generation` Step 2 batch routing assigns Batch A to `qa-frontend-expert`, but **test case authoring is `test-management-specialist`'s charter**. The Batch A cases needed a downstream review pass to apply test-management hygiene. Recommendation: update the command spec to route authoring to test-management-specialist and reserve qa-frontend-expert for the P0 validation step.

## Deliverables

- `reports/coverage/COV-2026-05-26-1430/gap-inventory.json`
- `reports/coverage/COV-2026-05-26-1430/gap-analysis.md`
- `reports/coverage/COV-2026-05-26-1430/batch-A-results.json`
- `reports/coverage/COV-2026-05-26-1430/batch-DP-results.json`
- `reports/coverage/COV-2026-05-26-1430/review-ORD-052-to-061.md`
- `reports/coverage/COV-2026-05-26-1430/date-picker-exploration.md`
- `reports/coverage/COV-2026-05-26-1430/bug-stub-A1.md` ← **action item: review and file**
- `reports/coverage/COV-2026-05-26-1430/diff-preview.md`
- `reports/coverage/COV-2026-05-26-1430/diff-preview-DP.md`
- `reports/coverage/COV-2026-05-26-1430/screenshots/` — 15 PNGs (3 validation + 12 exploration)

## Next Actions for User

1. Review `bug-stub-A1.md` — decide whether to file as JIRA (data-correctness P0).
2. Decide whether to promote `BL-ORD-010` invariant — if yes, add to `business-logic.md` via the standard promotion process.
3. Schedule re-validation of ORD-062 and ORD-069 once A1 is fixed.
4. (Optional) Sweep ORD-006/015–025/027 to replace `BL-ORD-003` → `BL-ORD-001`.
