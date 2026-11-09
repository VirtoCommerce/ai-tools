# Triage — VCST-6157 (ticket mode)

Run: VCST-6157 · 2026-11-05 · env vcst · source testing-checklist.md · floor `--min-severity P2`
Non-passing: 17 (8 FAIL, 9 BLOCKED) · real-bug candidates: 4 (2 needs-review, 2 below floor) · test-defects: 7 · dismissed: 6
Phase 2 skipped (ticket mode). `--fix` not passed (ignored in ticket mode). Classifier: 2 Sonnet batches.

## 1. Real-bug candidates at or above the floor — needs-review (none reproduced live yet)

| Case | Sev | Repo | Root cause | Evidence |
|---|---|---|---|---|
| VIS-2 | P2 Medium | vc-module-sales-rep | At 768 px the Customers / Status / Priorities selects (min-width 208/176/208 px) do not wrap; Priorities is cut off and the page scrolls sideways (scrollWidth 860 > 753). BL-UI-004. MEDIUM confidence | `screenshots/vis-*768*.png` |
| VIS-1 | High (lane) | vc-module-sales-rep | At 1280 px the fixed-layout table gives the new Customer column ~64 px of text, so every customer reads "AGENT-TEST-…" and AcmeCorp/AcmeWest look identical. Classifier: KNOWN_ISSUE (ticket comment F2, "by decision") — but F2 names only the Task column, not the Customer column this PR adds; kept as REAL_BUG / LOW for human review (ambiguity rule) | `screenshots/vis-*1280*.png` |

## 2. Test-case fixes (recommended; the checklist is the caller's to change)

| Case | Class | Fix |
|---|---|---|
| C-1, C-5, C-9, C-10, C-11 | TEST_STEPS_DEFECT | UI half routed to the API-only `ac-checks` lane. Re-point Proof to `visual`; C-9 is decided by VIS-3 + SC-12.1/12.2. Still unobserved: desktop subline without customer (C-1), Highest/Lowest dots (C-5), Reset keeps search term (C-10), Customer select for non-Call types (C-11) |
| C-17 | TEST_STEPS_DEFECT | Check ran (24 fresh connections, correct counts); reword to not require naming the instance (KB-6B6030B5, SC-2.2 saw 4 routes) |
| SC-9.6 | TEST_DATA_DEFECT | No filter rule on vcst restricts priority or linked type; provision one, or move to a unit test of `ApplyPriorities` / `ApplyCustomersAsync` |

## 3. Dismissed

| Case | Class | Reason |
|---|---|---|
| VIS-3 | KNOWN_ISSUE | Design drift, advisory: search typed into the VcSelect trigger; multi-select works |
| VIS-4 | KNOWN_ISSUE | Popup drift predates the PR; the new Customer select matches the frame |
| VIS-5 | KNOWN_ISSUE | "1 items selected" = ticket comment F5 (ui-kit VcSelect) |
| SC-8.1 | KNOWN_ISSUE | Stale Edit popup unlinks the customer — current behaviour per KB-EA1CB4BF; **PO question**, not filed |
| PIX-1 | ENV | No checkout of vc-module-sales-rep for the pixel lane |
| SC-2.3 | ENV | vcst runs SQL Server; the PostgreSQL case-sensitivity half needs a PostgreSQL stand |

## 4. Below floor (not investigated, not drafted)

| Case | Sev | Root cause | Evidence |
|---|---|---|---|
| SC-12.7 | P3 Low | REST search: `priority: High` + `priorities: []` returns every priority; `priorities: [Low]` overrides `priority` instead of AND. PO question; repo ambiguous | request/response in row SC-12.7 |
| SC-12.8 | P3 Low | Default "Due today" chip stays on a customer pick → "0 tasks" while the calendar shows that customer's tasks on Nov 6–7. PO question | `screenshots/s12-acme-due-today-empty.png` |

No tracker ticket filed, no fix triggered — human decides.
