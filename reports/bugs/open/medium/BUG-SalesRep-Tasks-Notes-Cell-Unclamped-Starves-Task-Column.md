# BUG: A long Notes value has no line clamp, so the Notes column starves the Task column — **REOPEN of VCST-5732 item "manual #1"**

## Status: CONFIRMED · **REOPEN** — reported fixed on 2026-09-18, is not fixed
**Severity: Medium** (P2) · layout/readability on the rep's primary work surface; not revenue-critical.
**Found by:** `/qa-test VCST-5732` re-test, 2026-09-21 · **IN-SCOPE** for VCST-5732.
**Archetype:** `RENDER`

**Env:** vcptcore-qa @ theme `2.58.0-pr-2464-2971-2971a77b` · `SalesRep 3.1009.0-pr-16-e348` ·
`TaskManagement 3.1005.0` · store `B2B-store` · chrome · 1920x1080.

## Why this is a REOPEN and not a new finding
The original item (VCST-5732, QA comment 2026-09-18 01:22, "manual #1") was answered on 2026-09-18 with a
correct diagnosis and a partial fix. **All three named mechanisms did ship:** Notes capped at 1000 with a
live counter, Title clamped to two lines, and the developer's own insight was right — *"the layout break
was not a length problem: the table is auto-layout, so a long title grew its own column and the truncate
never engaged."*

**That analysis applies verbatim to the Notes cell, which received no clamp.** The Title column was
protected; the Notes column now does exactly what the Title column used to do.

## Steps to Reproduce (~1 min)
1. Sign in to the storefront as a sales rep (`@td(SR_REP_PRIMARY)`; password via the `SR_REP_PASSWORD`
   secret) → `/company/calendar`.
2. Select any day → **Add task**. Title: anything short. Notes: paste ~900–1000 characters of ordinary
   prose — the counter will read e.g. `922 / 1000`, comfortably inside the new cap.
3. Save, then read the day list.

## Expected vs Actual
- **Expected:** the row does not widen its own column; the task title stays legible. (The developer's own
  framing of the fix.)
- **Actual:** the Notes cell renders its full value with no line clamp and no max-height:

| | Task column | Notes column | Row height |
|---|---|---|---|
| Normal row | ≈330 px | ≈190 px | 1 line |
| With a 922-char note | **≈170 px** | **≈345 px** | **≈350 px** (~20 wrapped lines) |

The task title — the row's primary identifier — is squeezed to
`AGENT-TEST-TASK LongXXXXXXXXXXXX…` in a sliver of a column, while the note gets double the space.

## Why the 1000-char cap does not close it
The cap makes the damage **bounded**, not acceptable: it guarantees *up to* ~20 lines per row. This was
tested twice on purpose — once with 1000 unbreakable characters (worst case, ~30 lines) and once with
**realistic B2B prose with normal word breaks, 922 characters**. The realistic case still collapses the
Task column. A rep writing an ordinary follow-up note reaches this.

## Business rule
`BL-UI-002` / `BL-UI-006` shape — content must not make an adjacent control or identifier unreadable.
Note the surrounding gap: **no `BL-*` invariant exists for sales-rep task classification or for this
table's layout contract** (recorded in the run's `summary.json.oracle_gaps`), so this is judged against
the developer's own stated fix goal plus the two mockups on the ticket, not against a promoted invariant.

## Recommended fix shape
Line-clamp the Notes cell (2–3 lines + ellipsis, full text on hover and in the edit modal) **and**
constrain the Notes column width so it cannot borrow from Task. The Title clamp already shipped and is the
pattern to copy.

## Provenance
**IN-SCOPE, CARRIED** — introduced by neither this build nor an unrelated one: it is the unfixed half of a
finding this ticket already owns. Filing it as a Sub-task of VCST-5732 (rather than a standalone) is what
keeps it attached to the ticket that caused it.

## Fix Routing
`vc-frontend` — the Sales Rep tasks day-list table component (same file as the Title clamp shipped in
PR #2464). Single repo, storefront only.

## Evidence
`reports/tickets/Sprint26-19/VCST-5732/screenshots/laneA-10.png` (1000 unbreakable chars),
`laneA-11.png` (922 chars of ordinary prose), `laneA-02.png` (normal row, for the column baseline).
HAR: `test-results/chrome/har/session.har`.
