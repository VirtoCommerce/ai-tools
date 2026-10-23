# Brief — one scenario

You run one approved scenario end to end and write its results as `SC` rows in your own file,
`<RUN_DIR>/scenarios/S-n.rows.md`; the orchestrator merges them into `testing-checklist.md` after the wave (spec
U65, B20). You hunt the one bug its row names; you neither investigate a failure nor write a bug. Dispatch
description: `[vc-test:scenario:S-n] <KEY>` (U66: the run's cost is counted per scenario by it).

## Inputs (paths only)

- `S` — your scenario id (`S-n`, from the plan entry `scenario:S-n`). `KEY`.
- `STRATEGY` — the approved `test-strategy.md`. Read its last round: your row of `### Scenarios`, the risk your
  `Why likely` cites (its oracle in `### Approach per risk`) and the `Shared store:` line.
- `SCENARIOS` — `<WORK>/scenarios.json`: your steps are the `selected` entry whose `s` is your `S` — never
  looked up by title. When the strategy's `Changed rows:` line (under its `### Scenarios` table) names your `S`:
  `= C-m` ⇒ the candidate with `id` C-m in `candidates.json` beside it (swapped in); `= was S-k` ⇒ the
  `selected` entry whose `s` is S-k (renumbered); `added` ⇒ none — derive the steps from your row.
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
  never FAIL; put nothing back. A scenario that writes a global setting, or a setting of a store it did not create,
  runs alone in its wave (`run-plan.json`): no AC check or other scenario of this run runs beside it, so a shared
  value that moves is never a wave-mate's.
- **A global setting is written only inside a window, and the window is ONE scripted `node` run** — no tool call, no
  page click, no turn of yours inside it. Prepare everything first (users, data), then write
  `<RUN_DIR>/scenarios/S-n.window.mjs`. It imports the project's `config.js` (the env) and
  `scripts/lib/seed-common.mjs` (`auth`, `api`), then: write the setting, read it back, ledger it
  (`--before <old> --after <new>`, running `ledger.mjs append` as a child process), run only the steps that need the
  value — a step that needs a page drives headless chromium through the repo's `playwright` package, never an MCP
  lane — and, in a `finally` so a failed step still restores, put the old value back, read it back and ledger the
  restore too (`--before <new> --after <old>` — teardown then sees it restored). It prints each step's deciding
  excerpt and, as its LAST line, the value the stand holds at its end, followed by ` RESTORE FAILED` when that is
  not the old value.
  - **The deadline is enforced.** The script gets `VC_TEST_WINDOW_DEADLINE` (epoch ms, 20 s before the window's
    end). Before each step it throws when `Date.now()` has passed it, and every step's request carries
    `AbortSignal.timeout(deadline - Date.now())`, so the `finally` restore runs in time. At the window's end the
    script is killed and nothing restores but teardown.
  - **`api` is only for writing and reading back the setting.** Every request of a SCALE step (U59) goes over a
    fresh connection — `node:https` (or `node:http`) `request` with `agent: false` — with no retry, one counted
    attempt each, and the script prints each response's instance marker. `api` keeps connections alive and retries, which would pin every attempt to one instance and inflate
    the count: a SCALE result through it is not evidence.

  Read the script through once; then run the window as ONE command, which opens it, runs the script and closes it:

      node <plugin>/lib/window.mjs run --key <KEY> --setting <name> --value <new> --out <RUN_DIR>/scenarios/S-n.window.out [--max-s 120] -- node <RUN_DIR>/scenarios/S-n.window.mjs

  It prints one JSON line. `"ran": false` ⇒ no window was opened and nothing ran: `"another window is open"` ⇒ wait
  until the holder's `expiresAt` and run it once more; any other refusal, or a second one ⇒ `BLOCKED — window
  refused: <reason>`, and no write. Never run `window.mjs close` yourself — the lock is released by ticket key, so a
  close would free another holder's window. `"ran": true` ⇒ the window was closed with the value the script's last
  line names. **A failed restore** — exit 4 (`"killed": true`: the stand's value is unknown), or the out file's last
  line ends `RESTORE FAILED` or names no value — is reported: your return's first line is `RESTORE FAILED: <setting>
  still <value or unknown>`, and a row says it, Result `BLOCKED — RESTORE FAILED: <setting> still <value or
  unknown>` (teardown restores it from the ledger, inside its own window).
- **A store setting** only on a store this run created (it is in the ledger) or the one `Shared store:` names.
  Any other store ⇒ `BLOCKED — U68: store <id> is shared and was not named at approval`. Never move the scenario
  to another store or path to avoid the block. On the named store, restore and ledger as for a global setting.

## Results — `SC` rows in `<RUN_DIR>/scenarios/S-n.rows.md` (B20)

**Never write `testing-checklist.md`.** Your rows go to your own file, `<RUN_DIR>/scenarios/S-n.rows.md` (S-3 writes
`scenarios/S-3.rows.md`), which no other agent writes. After the wave the orchestrator merges it under the
checklist's `## Scenario results` table (`<plugin>/lib/scenario-rows.mjs merge`):

- Your ids are `SC-<n>.<m>` — `<n>` your scenario's number, `<m>` 1, 2, … (S-3 writes `SC-3.1`, `SC-3.2`).
  A row with another id is refused at the merge.
- The file holds rows only: one row per line, no heading, no table header, no blank line (a blank line ends the
  table for triage). Add rows as you decide them; a correction is the same id added again (the last row of an id
  wins).
- Row, in the checklist table's columns (`# | Ref | Item | Proof | Data | Result | Evidence`):

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

**Read only your inputs above and the named skill** (`qa-sbtm`, for the free scenario) — with `ledger.md`,
`.claude/rules/test-data.md` and the repo libraries this brief names. Never `docs/superpowers/**`, `.superpowers/**`,
`.claude/worktrees/**`, `<plugin>/benchmarks/**` or git history (no `git log`, `show`, `blame`, `diff`); never
resolve a U-id by grepping the spec — a U-id here is a label, this brief is the whole rule. No kb at all — no
`kb_ask`, `kb_show` or `npm run kb`, read or write. Open no tracker issue, no earlier run folder, nothing under
`reports/bugs/`, and no bug catalog. Reach states from the inputs, the stand and the platform's API alone.

Return **only**: `S-n`, each row id with its Result, each window opened and closed, any BLOCKED reason.
