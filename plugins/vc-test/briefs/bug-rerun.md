# Brief — one prior bug re-run

In a round ≥ 2 you re-run one prior bug's reproduction on this round's build and write ONE `PB` row in your own file,
`<RUN_DIR>/scenarios/PB-n.rows.md`; the orchestrator merges it into `testing-checklist.md` after the wave
(`skills/qa-test-strategy/rounds.md` §Round N, P4). You answer one question: is the bug fixed? You neither
investigate a failure nor write a bug, and a bug still failing is never filed again (P6). Dispatch description:
`[vc-test:bug:PB-n] <KEY>`.

## Inputs (paths only)

- `PB` — your prior bug's id (`PB-n`, from the plan entry `bug:PB-n`). `KEY`.
- `STRATEGY` — the approved `test-strategy.md`. Read its last round: your row of `### Prior bugs`
  (`| PB | Bug | Severity | Found | Reproduction | R |`) and the risk its `R` names — its `### Risks` row and its
  oracle in `### Approach per risk`.
- `LANE` — `browser:playwright-<x>` for a `package` reproduction; none for `spec` (the runner needs no browser) and
  for `none` (nothing to run).
- `RUN_DIR`, `CAPABILITIES` (`stand.writable`), and `ledger.md` beside this brief. `<plugin>` is the folder above
  this brief's. Every path in the row is relative to the project root.

## How — by the row's Reproduction

- **`spec <path>`** — run it through the bridge runner, nothing else:

      node "$VC_RUN" runner playwright <path>

  The spec's own assertions are the oracle. Green ⇒ `PASS — FIXED`. Red ⇒ `FAIL <severity> — NOT FIXED: <the failing
  assertion's expected and actual>`. A refusal by the runner, or a spec that cannot start (a missing import, no
  stand) ⇒ `BLOCKED — <the runner's line>`; never read a run that did not reach the assertion as fixed or not.
- **`package <path>`** — the bug's evidence package (`vc-fix:qa-investigate`). Read its `root-cause.md`: its
  reproduction steps and the expected result are your steps and your oracle. Follow them on `LANE`, at least 3
  attempts as `vc-fix:qa-investigate` does before you call the bug gone: the bug seen on any attempt ⇒
  `FAIL <severity> — NOT FIXED: <observed>`; the expected result on every attempt ⇒ `PASS — FIXED`. A package
  with no `root-cause.md` or no steps ⇒ `BLOCKED — the package records no reproduction steps`.
- **`none`** — nothing to run. Write the row with Result `BLOCKED — no reproduction recorded` at once and stop: no
  guess at steps, no exploration (the blocked High caps the round, as it must).

`<severity>` is the row's Severity unless what you saw is worse (U24: access, money, data, order state or a broken
buyer path is Medium or worse).

## Rules

- **Browser** only when `LANE` names one, and only that server's tools — one session, yours alone. Sign in through
  the lane's secrets by bare key name, never a password value. No `LANE` ⇒ no browser.
- **Data** follows `.claude/rules/test-data.md`: created with the `AGENT-TEST-` prefix, live-discovered, or `@td()`;
  no literal account or URL — env names only (`BACK_URL`, `FRONT_URL`). Create or change anything only when
  `stand.writable` is `true`, else `BLOCKED — stand not declared writable`. Every entity and every setting change
  goes into the ledger at once, as `ledger.md` says, with `--by bug:PB-n`. **You write no global setting and no
  setting of a shared store:** a reproduction that needs one ⇒ `BLOCKED — needs a setting window (U68)`.
- **What the platform does** (how to reach a state): ask the kb first — `mcp__kb__kb_ask` (load it with
  `ToolSearch`), else `npm run kb -- ask "<q>"`, the endpoint or page path in the question. A kb entry tells you
  how to reach a state; it is never the oracle.

## Result — one `PB` row in `<RUN_DIR>/scenarios/PB-n.rows.md`

**Never write `testing-checklist.md`.** The file holds your one row, on one line, no heading, no header, no blank
line; a correction is the same id added again (the last row of an id wins). Any other id is refused at the merge. The row has the checklist
table's seven columns (`# | Ref | Item | Proof | Data | Result | Evidence`):

    | PB-<n> | PB-<n> · R<k> | <what was done: the spec run, or the steps and attempts>; expected <the oracle> | <spec, package or none> | <data> | <Result> | <observed> |

`R<k>` is your row's `R` — it is what attributes the result to the risk. Proof is the Reproduction's kind; Data the
`@td()` aliases, live-discovered or `AGENT-TEST-` entities you used, or `—`. Result is `PASS — FIXED`,
`FAIL <severity> — NOT FIXED: <observed>` or `BLOCKED — <why>`; never empty. Evidence is what you observed — the
spec's failing assertion, or the deciding status, field and value; a FAIL on a page also names its screenshots in
`{RUN_DIR}/screenshots/`. A PASS is text.

Return **only**: `PB-n` and its Result.
