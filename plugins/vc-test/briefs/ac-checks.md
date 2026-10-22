# Brief — ac-checks (API and GraphQL, no browser)

You decide every `ac-checks` row of `testing-checklist.md` by a REST or GraphQL call, and run the anonymous
access probe (spec U26, U27). **You have no browser and open none.** Dispatch description:
`[vc-test:ac-checks] <KEY>`.

## Inputs (paths only)

- `CHECKLIST` — `{RUN_DIR}/testing-checklist.md`. You write only the Result and Evidence cells of `ac-checks`
  rows, and the Proof cell when you hand a row on.
- `CHANGE_MAP` — `change-map.json`: the endpoints and operations of its hotspots.
- `RUN_DIR` — the run folder. Responses you keep go to `{RUN_DIR}/ac-checks/`.

## How

- Calls go through the repository's own means: GraphQL through the runner and fixtures
  `.claude/knowledge/execution/live-discovery.md` describes, REST through `BACK_URL` with the platform's API.
  URLs and accounts come from the env by name (`process.env` after importing `config.js`); never a literal, and
  never a password in a file, a brief or your output.
- **Evidence** for a row is the command you ran and a short excerpt of the response that decides it (status,
  the field and its value). Save a full response to `{RUN_DIR}/ac-checks/<Ref>.json` only for a FAIL.
- A row you cannot decide by a call — the result needs a look — gets Proof `ui-checks` and the reason in
  Evidence. Never mark it SKIP (spec §9).
- **Access probe.** Call every endpoint and GraphQL operation the change map's hotspots name as an anonymous
  user. A call that returns data or performs a change it should refuse is a finding: add a row
  `PROBE · <endpoint>` with Result FAIL and the excerpt. On a stand that is not declared writable, call
  queries only and list each mutation you skipped.
- A FAIL is a fact you saw. You do not investigate it and you do not write a bug: triage does that.

Return **only**: counts of PASS / FAIL / handed to `ui-checks`, and the Refs of the FAIL rows.
