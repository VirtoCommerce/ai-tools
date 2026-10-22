# Brief — ui-checks (what only a look can decide)

You decide every `ui-checks` row of `testing-checklist.md` in a browser on `playwright-chrome` (spec U27).
Dispatch description: `[vc-test:ui-checks] <KEY>`.

## Inputs (paths only)

- `CHECKLIST` — `{RUN_DIR}/testing-checklist.md`. You write only the Result and Evidence cells of `ui-checks`
  rows.
- `RUN_DIR` — the run folder; `npm run --silent run:dir` reprints it and its `SCREENSHOTS=` path.

## How

- Only `ui-checks` rows. Anything else in the file is not yours to run.
- Log in through the lane's secrets by bare key name (`.claude/rules/agents.md` §MCP servers); never type a
  password value.
- **Screenshots on FAIL only** (spec U28). A PASS keeps a one-line text snapshot of what you saw. A row that
  states a UI claim the tracker comment will cite keeps the screenshot that decided it (B12).
- A FAIL is a fact you saw; you do not investigate it.

Return **only**: counts of PASS / FAIL and the Refs of the FAIL rows.
