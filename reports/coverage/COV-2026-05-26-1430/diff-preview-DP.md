# Diff Preview — Batch DP (Date Picker cases)

**Suite:** `regression/suites/Frontend/orders/014-orders-frontend.csv`
**Append range:** ORD-062 → ORD-079 (18 new rows)
**Anchor row:** ORD-061 (last pre-existing row)

---

## Anchor (ORD-061 — last existing row, unchanged)

```
"ORD-061","Order List - Active Filter Chip Removal Affects Only That Filter",
"Orders > Filtering","Medium","BL-ORD-001","ECL-3.2", ...
"Coverage Gap Analysis — COV-2026-05-26-1430 — GAP-OHF-010","Generated"
```

---

## New rows appended after ORD-061

| ID | Title | Priority | Section | Automation_Status | DP-ref |
|----|-------|----------|---------|-------------------|--------|
| ORD-062 | Date Picker — Custom Range End Boundary Dropped from GraphQL Filter (P0 Bug Probe) | Critical | Orders > Date Filter | Generated — currently FAILS due to A1 | DP-01 |
| ORD-063 | Date Picker — 'Last Day' Preset Sends Both Bounds in GraphQL Filter | Critical | Orders > Date Filter | Generated | DP-02 |
| ORD-064 | Date Picker — 'Last Week' Preset Sends Both Bounds in GraphQL Filter | Critical | Orders > Date Filter | Generated | DP-03 |
| ORD-065 | Date Picker — 'Last Month' Preset Sends Both Bounds in GraphQL Filter | Critical | Orders > Date Filter | Generated | DP-04 |
| ORD-066 | Date Picker — 'Last Year' Preset Sends Both Bounds in GraphQL Filter | Critical | Orders > Date Filter | Generated | DP-05 |
| ORD-067 | Date Picker — Start-Only Entry Produces 'From X Onward' Open-Ended Filter | High | Orders > Date Filter | Generated | DP-06 |
| ORD-068 | Date Picker — End-Only Entry Produces 'Up To X' Open-Ended Filter | High | Orders > Date Filter | Generated | DP-07 |
| ORD-069 | Date Picker — Applied Custom Range Persists in Panel on Reopen (End Value Retained) | High | Orders > Date Filter | Generated — currently FAILS due to A1/A2 | DP-08 |
| ORD-070 | Date Picker — Page Refresh Resets Custom Date Filter (No URL Persistence) | High | Orders > Date Filter | Generated | DP-09 |
| ORD-071 | Date Picker — Invalid Character Masking in Date Inputs | Medium | Orders > Date Filter | Generated | DP-10 |
| ORD-072 | Date Picker — Future Date Accepted Without Rejection | Medium | Orders > Date Filter | Generated | DP-11 |
| ORD-073 | Date Picker — Reset Clears Inputs and Closes Popover (Current Behavior Documentation) | Medium | Orders > Date Filter | Generated | DP-12 |
| ORD-074 | Date Picker — Calendar UI Opens, Month Navigation Works, Date Selection Populates Input | Medium | Orders > Date Filter | Generated | DP-13 |
| ORD-075 | Date Picker — Outside-Click Dismisses Panel and Discards Un-Applied Entries | Medium | Orders > Date Filter | Generated | DP-14 |
| ORD-076 | Date Picker — Both 'Open Calendar' Buttons Have Distinct Accessible Names | Medium | Orders > Date Filter | Generated | DP-15 |
| ORD-077 | Date Picker — Touch Target Height for Date Inputs is at Least 44px on Mobile Viewport | Medium | Orders > Date Filter | Generated | DP-16 |
| ORD-078 | Date Picker — Keyboard Navigation in Calendar Grid (Arrow + Enter Selects, Escape Closes) | Medium | Orders > Date Filter | Generated | DP-17 |
| ORD-079 | Date Picker — Switching from Preset to Custom Shows Empty Inputs | Medium | Orders > Date Filter | Generated | DP-18 |

---

## Dedup decisions (2 spec rows consumed without generating a case)

| Spec row | Spec theme | Existing case | Decision |
|----------|------------|---------------|----------|
| Row 3 | Same-day boundary (Start = End = D) | ORD-055 | DROP — ORD-055 is a full same-day boundary case with monotonic-count assertion. No semantic gap. |
| Row 4 | Inverted range (Start > End) | ORD-054 | DROP — ORD-054 covers inverted range with [COND:] branches for validation-error vs auto-swap. No semantic gap. |

---

## Key authoring decisions

- **GraphQL filter-body assertions (ORD-062–066):** `[NETWORK] POST /graphql GetOrders` plus `[API]` predicate asserting both Lucene bounds present. This is the primary regression signal for A1.
- **Known-failing cases (ORD-062, ORD-069):** `Automation_Status` annotates the A1/A2 root cause. These cases will FAIL until the bug is fixed — correct behavior.
- **live-discover pattern:** All cases deriving dates (ORD-062, 067, 068, 070) use `[KEY] live-discover` in Steps; no hardcoded ISO timestamps or order numbers.
- **`[COND:]` gates:** Used in ORD-069 (two acceptable reopen outcomes), ORD-073 (popover-open vs popover-closed for Reset A4 anomaly).
- **Section:** `Orders > Date Filter` (new sub-section, consistent with existing `Orders > Filtering` convention).
- **BL-ORD-001** used as interim citation per review-ORD-052-to-061 guidance. BL-ORD-010 proposed but not yet promoted.
