# W4 — Sales Rep hub · REG-2026-11-26-0512-W4

Owner Elena Kutasina · vcst · Platform 3.1101.0 · theme 2.63.0-alpha.2681 · shared accounts · `seed:sales-rep` + `seed:sales-rep-call` re-run before the wave.

| Suite | Planned | Pass | Fail | Blocked | Skipped | Ambiguous |
|---|---|---|---|---|---|---|
| 089 My Customers | 76 | 58 | 2 | 10 | 1 | 5 |
| 091 Customer Profile | 73 | 60 | 1 | 10 | 2 | 0 |
| 093 Hub Dashboard | 80 | 58 | 0 | 19 | 1 | 2 |
| 093b Hub Dashboard (2) | 16 | 6 | 0 | 10 | 0 | 0 |
| 116 Reports | 30 | 14 | 2 | 13 | 0 | 1 |

## Before morning triage (owner) — 67 FAIL/BLOCKED without a ledger row
- **No clear product defect.** SR-RPT-012 (AOV current month not drawn as projected — open spec question, KB-E6F61C02); SR-RPT-026 (Last-year toggles: no pressed state, KB-DB9F0923 — may be a snapshot limit).
- **Investigate:** "My activity" widget shows "Some tracked activity couldn't be loaded" while `SalesRepActivities` answers 200.
- **Probably stale (communication modal redesign, VCST-6256 / SalesRep 3.1029.0):** SR-FE-031/032 ("Send message", generic subtitle), SR-FE-038/040/041/050/065 ambiguous. Layout payload has 4 regions incl. `fullWidth` (SR-CP-050 FAIL, SR-CP-045, SR-HD-020 — KB-00179371). My Customers columns now YTD purchases / Last year / My last order / Actions; label "Sales Rep Hub".
- **Environment / runner:** `[EXCLUSIVE]` → WX (SR-FE-003, SR-HD-003, SR-HD-106, SR-CP-003); interception / API planting not allowed (089 SR-FE-025/037/053/070; 091 SR-CP-018/048/051–053/056; 093 SR-HD-010/014/022/034–037/039–041/045/056–058/060; 093b SR-HD-101/102/108–111/113/114; 116 SR-RPT-027/029); fixtures — 116 needs more current-month orders (SR-RPT-002–005/009/011/019/023/025; SR-RPT-028 only days 1–5), no filter rules (SR-FE-046/047, SR-HD-011), max YTD order count 7 (SR-FE-052), no multi-org rep (SR-FE-042), SR_REP_NOCUSTOMERS_ORGCTX has no password (SR-FE-030), admin-only steps (SR-FE-018, SR-HD-048), AcmeCorp cart not empty (SR-HD-062); Firefox `browser_resize` hung ~30 min (SR-RPT-018, SR-HD-115 not re-run).
- **Runner sizing:** single-dispatch runners ran out of budget after ~11 cases; rows were re-run in chunks of ~20 and merged by hand — some passes are DOM/screenshot only, without the API cross-check.
- **Cleanup left:** two real communications to AcmeCorp (Push + Email "AGENT-TEST-SR-COMM…"); SR_REP_LAYOUT / SR_REP_DOCS layouts each carry a saved document; one SR_REP_PRIMARY Firefox session still signed in.
