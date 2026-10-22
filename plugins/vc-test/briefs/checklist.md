# Brief — the thin checklist (the background AC rows)

You write `{RUN_DIR}/testing-checklist.md` for one ticket: one row per AC, each decided in the background by the
API/script run `ac-checks` (spec U13 revised by U65). The risks are hunted by the scenarios, whose rows the
orchestrator merges under the scenarios' table after each wave; you write none for them. You do not run any check.
Dispatch description: `[vc-test:checklist] <KEY>`.

## Inputs (paths only)

- `STRATEGY` — the approved `test-strategy.md` (its last `## Round N`).
- `CHANGE_MAP` — `change-map.json` (layer 0): ACs with `NO CODE`, hotspots with `proof` and `zone`, suspicions.
- `RUN_DIR` — the run folder. `CUTOFF` — only in a benchmark.

## How

Load the `qa-checklist` skill and use its Mode 5 (`--from-model --strategy <STRATEGY>`; this run has no model)
for the Ref, Data and oracle rules — for AC rows only. Write the thin form below instead of its full table:

| # | Ref | Item | Proof | Data | Result | Evidence |
|---|---|---|---|---|---|---|
| C-1 | AC-1 · R2 | what is checked, with the expected value | `ac-checks` | `@td(…)` / live-discover / created in the case | | |

- **`#`** is the item's id, `C-1`, `C-2`, … — unique in the file, never reused. Triage and the verdict name an item
  by it. Ref is the traceability list and may repeat.
- **Proof is `ac-checks` on every row.** An AC that only a look can decide is still a row: `ac-checks` gives it
  `BLOCKED — needs a look (U65: no ui-checks lane)` and the verdict lists its residual risk.
- Every AC is a row. An AC the change map marks `NO CODE` is still a row, with the Item saying so.
- Every suspicion whose hotspot's `proof` is `unit` or `api` is a row whose Ref is its `S-n`, so the verdict can
  mark it confirmed or refuted. A suspicion that needs a page or a session is left to the scenarios.
- **An item whose Ref names an AC or a `BL-*` states the value it expects from that source** — a limit, a
  lifetime, an interval — and decides PASS or FAIL on it, even when the stand's configuration is unknown. Never
  write "record the observed value, no PASS/FAIL" (spec U57).
- **An item on a limit, counter, cache, lockout or session state gets a second row with technique `SCALE`**:
  the same check with requests spread over fresh connections so they can reach more than one backend instance
  (spec U59).
- Data follows `.claude/rules/test-data.md`: no literal values; a state the environment can take away is
  created in the case.
- Leave Result and Evidence empty.

**End the file with the scenarios' table, empty, and nothing after it** — the orchestrator merges the scenarios'
`SC` rows under it from their row files (B20). The separator line is the file's last line and ends with one newline;
no blank line after it (a blank line ends the table for triage):

    ## Scenario results

    | # | Ref | Item | Proof | Data | Result | Evidence |
    |---|---|---|---|---|---|---|

**Benchmark (`CUTOFF` given, U67):** read only your inputs above and the `qa-checklist` skill (`<plugin>` is the
folder above this brief's). Never `docs/superpowers/**`, `.superpowers/**`, `.claude/worktrees/**`,
`<plugin>/benchmarks/**` or git history (no `git log`, `show`, `blame`, `diff`); never resolve a U-id by grepping
the spec — a U-id here is a label, this brief is the whole rule. No kb, no earlier run folder, nothing under
`reports/bugs/`, no bug catalog.

Return **only** the file path and the count of rows.
