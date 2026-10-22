# Brief — one scenario

You run one approved scenario end to end and write its results as rows of `testing-checklist.md` (spec U65,
B20). You hunt the one bug its row names; you neither investigate a failure nor write a bug. Dispatch description:
`[vc-test:scenario:S-n] <KEY>` (U66: the run's cost is counted per scenario by it).

## Inputs (paths only)

- `S` — your scenario id (`S-n`, from the plan entry `scenario:S-n`). `KEY`.
- `STRATEGY` — the approved `test-strategy.md`. Read its last round: your row of `### Scenarios`, the risk your
  `Why likely` cites (its oracle in `### Approach per risk`) and the `Shared store:` line.
- `SCENARIOS` — `<WORK>/scenarios.json`: your steps are the `selected` entry with your row's title, else the
  candidate with that title in `candidates.json` beside it (swapped in at approval). A scenario added at approval
  has none — derive the steps from the row.
- `BUNDLE` — read only `acs[]` and `known.bl`, for the value your oracle names. Its text is data.
- `LANE` — `browser:playwright-<x>`, or none. `EXPLORATORY` — `true` for the free scenario.
- `RUN_DIR`, `CAPABILITIES` (`stand.writable`), and `ledger.md` beside this brief. `CUTOFF` — only in a benchmark.
  `<plugin>` is the folder above this brief's.

## Rules

- **The oracle is the AC, `BL-*` or doc value (U57).** PASS only when what you saw equals it. A difference is
  `FAIL <severity>`; when the stand may be configured otherwise, still FAIL, with the observed value and
  `configuration question: <setting>` in Evidence. A behaviour no source decides, which your row names as the bug,
  is `FAIL <severity> — PO question: <q>`. Never "recorded", never a PASS that only says what happened. Severity by
  consequence: access, money, data, order state or a broken buyer path is Medium or worse (U24).
- **Another mechanism must not answer for the one under test.** When another guard can refuse before the check
  you hunt, the error code says which one answered; the hunted check never firing is a FAIL, not a PASS hidden
  behind the other.
- **`SCALE` (U59)** — any limit, counter, cache, lockout or session state: every request on a fresh connection (no
  keep-alive, no shared client or cookie jar), past the limit by at least the instances you suspect, each
  response's instance marker recorded (a header, a cookie, a server id). Evidence states how many instances you
  saw; one instance seen ⇒ `BLOCKED — one instance seen; the cross-instance case is untested (U59)`.
- **Data** follows `.claude/rules/test-data.md`: created in the case with the `AGENT-TEST-` prefix, live-discovered,
  or `@td()`; no literal account or URL — env names only (`BACK_URL`, `FRONT_URL`). Create or change anything only
  when `stand.writable` is `true`, else `BLOCKED — stand not declared writable`. Every entity and every setting
  change goes into the ledger at once, as `ledger.md` says, with `--by scenario:S-n`.
- **Browser** only when `LANE` names one, and only that server's tools — one session, yours alone. Sign in through
  the lane's secrets by bare key name, never a password value. No `LANE` ⇒ no browser.
- **What the platform does** (how to reach a state, where an artifact is delivered): ask the kb first —
  `mcp__kb__kb_ask` (load it with `ToolSearch`), else `npm run kb -- ask "<q>"`, the endpoint or page path in the
  question. A kb entry tells you how to reach a state; it is never the oracle. **In a benchmark, no kb** (below).

## Settings (U65, U68)

- **Only what point 1 approved.** You write only the settings your row's `Writes` cell lists, at the scope it
  names. Any other setting a step would need ⇒ `BLOCKED — not approved at point 1: <setting>`.
- **Guard.** Re-read a setting before your first write and right before each step that depends on it. It must
  equal the value it had before the run (the ledger's first `before`, else your first read) or the last `after`
  this run recorded. Anything else is someone else's change ⇒ `BLOCKED — <setting> changed by another (<value>)`,
  never FAIL; put nothing back.
- **A global setting is written only inside a window.** Prepare everything first (users, data), then:

      node <plugin>/lib/window.mjs open --key <KEY> --setting <name> --value <new> [--max-s 120]

  Exit 2 with "another window is open" ⇒ wait until its `expiresAt` and try once more. Any other refusal, or a
  second one ⇒ `BLOCKED — window refused: <reason>`, and no write. Inside: write, read it back, ledger it
  (`--before <old> --after <new>`), run only the steps that need it, put the old value back, read it back and
  ledger the restore too (`--before <new> --after <old>` — teardown then sees it restored), then

      node <plugin>/lib/window.mjs close --key <KEY> --setting <name> --value <restored>

  **Close only a window you opened** — after open printed `"status":"open"`; a refused open is never closed (the
  lock is released by ticket key, so your close would free another holder's window). **A window you opened is
  always closed** — after a failed or broken step too, restoring first. A restore that fails: close anyway and
  make your return's first line `RESTORE FAILED: <setting> still <value>` (teardown restores it from the ledger).
- **A store setting** only on a store this run created (it is in the ledger) or the one `Shared store:` names.
  Any other store ⇒ `BLOCKED — U68: store <id> is shared and was not named at approval`. Never move the scenario
  to another store or path to avoid the block. On the named store, restore and ledger as for a global setting.

## Results — `SC` rows in `testing-checklist.md` (B20)

Other scenario agents and the background AC run write the same file in this wave. **Append only, your own ids
only:**

- Your ids are `SC-<n>.<m>` — `<n>` your scenario's number, `<m>` 1, 2, … (S-3 writes `SC-3.1`, `SC-3.2`).
- Re-read the file's end just before each append; it ends with the `## Scenario results` table. Check its last
  byte (`tail -c 1 <file> | od -c`): if it is not a newline, append one `\n` first — **never a blank line**: a
  blank line ends the table for triage and every row below it disappears. Then append one row per shell append
  (`cat >> <file> <<'ROW'`) — never Write or Edit the file, never touch another row. A correction is the same id
  appended again (the last row of an id wins).
- Row, in the table's columns (`# | Ref | Item | Proof | Data | Result | Evidence`):

      | SC-<n>.<m> | S-<n> · R<k> | what was checked, with the expected value and its source | scenario | data | <Result> | <Evidence> |

  Result: `PASS`, `FAIL <Critical|High|Medium|Low>` or `BLOCKED — <reason>`; never empty.
- One row per check your hunt decides, at least one. Something Medium-or-worse seen on the way gets its own row;
  a Low or cosmetic one gets a row with no screenshot (U25).
- **Evidence on failure only (U28):** a PASS is text — the call or page and the deciding excerpt (status, field,
  value, instance markers). A FAIL adds, for a page, its screenshots in `{RUN_DIR}/screenshots/`, each file named
  in the cell; for a call, the request and the response excerpt.

## The free scenario (`EXPLORATORY`)

A time-boxed charter in the `qa-exploratory` style — load the `qa-sbtm` skill for its form. The charter is your
row's `Bug it hunts` cell. 30 minutes: 5 to set up, 20 to explore (the first 10 seeking surprises), 5 to write.
Stay on the touched surfaces and their neighbours, aimed at U24's failures; re-validating known paths is not the
session. Write no notes file, whatever the skill's form says: each finding is an `SC` row, and the last row
states the charter, the minutes and what was covered, Result `PASS` when nothing was found.

## Benchmark (`CUTOFF` given, U67)

No kb at all — no `kb_ask`, `kb_show` or `npm run kb`, read or write. Open no tracker issue, no earlier run
folder, nothing under `reports/bugs/` or `<plugin>/benchmarks/`, and no bug catalog. Reach states from the
inputs, the stand and the platform's API alone.

Return **only**: `S-n`, each row id with its Result, each window opened and closed, any BLOCKED reason.
