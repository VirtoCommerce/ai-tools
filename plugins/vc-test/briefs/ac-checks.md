# Brief — ac-checks (the background AC run: API and GraphQL, no browser)

You decide every `ac-checks` row of `testing-checklist.md` by a REST or GraphQL call, and run the anonymous
access probe (spec U26, U27, U65). The scenario agents run beside you. **You have no browser and open none.**
Dispatch description: `[vc-test:ac-checks] <KEY>`.

## Inputs (paths only)

- `CHECKLIST` — `{RUN_DIR}/testing-checklist.md`. You write only the Result and Evidence cells of `ac-checks`
  rows, and the probe rows below. No other agent writes the file while you run (the scenarios write their own row
  files, merged by the orchestrator after the wave); change only your own rows and never touch the
  `## Scenario results` table.
- `CHANGE_MAP` — `change-map.json`: the endpoints and operations of its hotspots.
- `STRATEGY` — `test-strategy.md`, read only for its last round's `Shared store:` line. `CUTOFF` — only in a
  benchmark.
- `RUN_DIR` — the run folder. Responses you keep go to `{RUN_DIR}/ac-checks/`.
- `CAPABILITIES` — `capabilities.json`; its `stand.writable` decides whether you may create or change data.
- `KEY` and `ledger.md` (beside this brief) — every entity you create and every setting you change is recorded as
  it says, with `--by ac-checks`. The run tears down from that ledger only. `<plugin>` is the folder above this
  brief's.

## How

- Calls go through the repository's own means: GraphQL through the runner and fixtures
  `.claude/knowledge/execution/live-discovery.md` describes, REST through `BACK_URL` with the platform's API.
  URLs and accounts come from the env by name (`process.env` after importing `config.js`); never a literal, and
  never a password in a file, a brief or your output.
- **Evidence** for a row is the command you ran and a short excerpt of the response that decides it (status,
  the field and its value). Save a full response to `{RUN_DIR}/ac-checks/<Ref>.json` only for a FAIL.
- A row you cannot decide by a call — the result needs a look — gets Result `BLOCKED — needs a look (U65: no
  ui-checks lane)` and what a look would have to decide in Evidence. Never mark it SKIP (spec §9).
- **Access probe.** Call every endpoint and GraphQL operation the change map's hotspots name as an anonymous
  user. A call that returns data or performs a change it should refuse is a finding: add a row at the end of the
  AC table (above `## Scenario results`) with the next free `C-n`, Ref `PROBE · <endpoint>`, Result
  `FAIL <severity>` and the excerpt. When `stand.writable` is `false`, call queries only, list each mutation you
  skipped, and give an item that needs a write Result `BLOCKED — stand not declared writable`.
- **The row's expected value is the oracle** (spec U57). An observation that differs is FAIL; if the stand may be
  configured otherwise, write FAIL with the observed value and "configuration question: <setting>" in Evidence —
  never a PASS that only records what happened.
- **A `SCALE` row** (spec U59): send every request on a fresh connection (no keep-alive, no shared client), repeat
  past the limit by at least the number of instances you suspect, and record any instance marker the responses
  carry (a header, a cookie, a server id). Seeing one instance only is `BLOCKED — one instance seen`, never PASS.
- **Settings (U68).** **You never write a global setting:** a row that needs one is
  `BLOCKED — needs a global window (U68)`, and a scenario covers it. A scenario that writes a global setting runs in
  a wave of its own (`run-plan.json`), never beside you, so no global value this run flips moves under your checks.
  A store setting only on a store this run created or the strategy's `Shared store:`, restored when done; each write
  and its restore go into the ledger. Re-read a setting before you write it and before each row that depends on it;
  a value that is neither its value before the run nor this run's last ledger `after` is another's change ⇒
  `BLOCKED`, never FAIL.
- A FAIL is a fact you saw. You do not investigate it and you do not write a bug: triage does that.

**Benchmark (`CUTOFF` given, U67):** read only your inputs above, `ledger.md` and the files `live-discovery.md`
names. Never `docs/superpowers/**`, `.superpowers/**`, `.claude/worktrees/**`, `<plugin>/benchmarks/**` or git
history (no `git log`, `show`, `blame`, `diff`); never resolve a U-id by grepping the spec — a U-id here is a label,
this brief is the whole rule. No kb, no earlier run folder, nothing under `reports/bugs/`, no bug catalog.

Return **only**: counts of PASS / FAIL / BLOCKED (and how many BLOCKED need a look or a global window), and the
`#` ids of the FAIL rows.
