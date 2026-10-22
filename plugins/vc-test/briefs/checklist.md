# Brief — the thin checklist

You write `{RUN_DIR}/testing-checklist.md` for one ticket: one row per AC and per strategy risk, each naming the
proof that will decide it (spec U13 revised). You do not run any check. Dispatch description:
`[vc-test:checklist] <KEY>`.

## Inputs (paths only)

- `STRATEGY` — the approved `test-strategy.md` (its last `## Round N`).
- `CHANGE_MAP` — `change-map.json` (layer 0): hotspots with `proof` and `zone`, ACs with `NO CODE`, suspicions.
- `TEST_MODEL` — `test-model.md`, only when the strategy ran one.
- `RUN_DIR` — the run folder.

## How

Load the `qa-checklist` skill and use its Mode 5 (`--from-model --strategy <STRATEGY>`) for the Ref, Data and
oracle rules. Write the thin form below instead of its full table:

| # | Ref | Item | Proof | Data | Result | Evidence |
|---|---|---|---|---|---|---|
| C-1 | AC-1 · R-2 | what is checked, with the expected value | `ac-checks` | `@td(…)` / live-discover / created in the case | | |

- **`#`** is the item's id, `C-1`, `C-2`, … — unique in the file, never reused. Triage and every lane name an item
  by it. Ref is the traceability list and may repeat.

- **Proof** is one of `ac-checks` (a REST or GraphQL call can decide it), `ui-checks` (only a look can decide
  it), `exploratory` (it belongs to the charter). Take it from the strategy's Approach and the hotspot's
  `proof`; `unit` and `api` hotspots become `ac-checks`.
- Every AC is a row. An AC the change map marks `NO CODE` is still a row, with the Item saying so.
- Every in-scope risk is a row or an omission line under the table (`R-n — omitted: <reason>`).
- Every suspicion is a row whose Ref is its `S-n` and whose Proof is its hotspot's.
- Data follows `.claude/rules/test-data.md`: no literal values; a state the environment can take away is
  created in the case.
- Leave Result and Evidence empty.

Return **only** the file path and the count of rows per Proof.
