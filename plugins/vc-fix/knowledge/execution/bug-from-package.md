# Bug report from an investigation package — `/qa-bug --evidence <dir>`

`/vc-fix:qa-bug --evidence <dir>` writes the one bug report from a `vc-fix:qa-investigate` package and from nothing
else. The investigation already reproduced the bug, isolated the layer, read the source and the logs; a second
investigation here would cost a second reproduction and could reach a second, different answer. So `qa-bug` checks
that the package is complete and was made on the build deployed now, and then writes the report from it. It
re-checks nothing.

The package's shape is [`skills/qa-investigate/evidence-and-root-cause.md`](../../skills/qa-investigate/evidence-and-root-cause.md):
`evidence-index.md` is the §0 shape there (the header slots `TRACE_ID`, `BUILD_VERSIONS`, `REPRO_RATE`, the
`## Steps to reproduce` section and the Part A row table),
`root-cause.md` is Part B (§1 Symptom … §8 Fix Routing handoff). "Row N" below is a Part A row, "§N" a Part B
section. The command's steps point here: [`commands/qa-bug.md`](../../commands/qa-bug.md) Step 0 runs §Build,
Steps 1–3 are §Complete, §Layers and §Routing, Step 4 is §Report.

## §Reads

- **It reads** the package, Step 0's deployed versions, the duplicate check, and `fix-repos.json` +
  `module-suite-map.md` to spell the repo name.
- **It never** calls a browser tool, dispatches `qa-testing-expert`, runs `search_code` / `get_file_contents`
  (Step 0's `vc-deploy-dev` version read excepted), queries App Insights or Context7.

Something the report needs and the package does not hold is a §Complete stop, never a reason to go and get it.

## §Complete

The mandatory set, each checked against the package on disk:

- **Part A's M rows whose trigger applies** — row 1 Failure-state screenshot, 2 DOM snapshot, 3 Network capture,
  4 The failing request (only when there is a 4xx/5xx, an `errors[]` or wrong data), 6 Console messages, 7 HAR file,
  12 Deployed versions (`BUILD_VERSIONS`), 15 Steps to reproduce (`## Steps to reproduce` holding at least one
  numbered step).
- **The M\* rows only when §2 names a server-side layer** (xAPI/GraphQL, REST, module/data or infra ticked) — row 5
  Trace / operation ID (`TRACE_ID`) and row 10 App Insights trace. A §2 that says storefront-only demands neither.
- **`root-cause.md`** — §1 Symptom, §2 Lowest failing layer (a box ticked and "Decided by" citing a row), §5 with its
  first two rows filled (by-design / config-gated, env data drift), §7 with one box ticked.

A row counts only when the file its index row names exists in the package, and a header slot only when it holds a
value. A row the index lists whose file is gone is missing. **Three rows also count when the package states the env
cannot give them**, in the words the §0 shape gives:

- row 5 — `TRACE_ID` says the stand sends neither header;
- row 10 — the row says `N/A for this env` and names a fallback log that exists in the package;
- row 7 — the row names a HAR path that exists, **or** says the lane records no HAR (a lane `/project-init`
  configured records none). HAR alone never makes an `INCOMPLETE_PACKAGE`.

The report's Env carries each such statement, so the reader sees what the package could not hold.

**Any one missing ⇒ the outcome is `INCOMPLETE_PACKAGE: <slot, slot>` and no report is written** for this bug.
A slot is spelled as the row number and Part A's artifact name (`1 Failure-state screenshot`), or the section
(`root-cause §5`). `qa-bug` never captures the missing artifact itself; the caller re-runs `vc-fix:qa-investigate`.

## §Build

Runs at Step 0, after the deployed versions are fetched. Compare `BUILD_VERSIONS` with them:

- on the owning repo's package — the entry for §2's repo (by repo name, or by the module id the version source
  reports for that repo);
- a frontend repo (`vc-frontend`, or a client storefront fork) with no entry of its own: on the `theme` entry;
- when §2 names no repo (§7 LOW), or the owning repo has no entry otherwise, on every version the package lists.

An entry with no deployed counterpart in Step 0's source (a module the version source does not report) is not
compared: the report's Env names it as unverified. It is never a `STALE_PACKAGE` by inference.

**A mismatch ⇒ stop for this bug:** `STALE_PACKAGE: <name> <package ver> ≠ <deployed ver> — re-run
vc-fix:qa-investigate`, no report. The bug is never filed against a build nobody tested and never reproduced again
here. An empty `BUILD_VERSIONS` is not a mismatch: it is §Complete's `12 Deployed versions`.

## §Layers

The report's Layer Validation table (the block in `qa-bug.md` Step 2), filled from §2, §3 and the Part A rows:

| Layer | Its artifacts in the package |
|---|---|
| 1. Storefront Frontend | rows 1, 2, 6; row 4 when the failing request is the storefront's |
| 2. Backend Admin | row 8, an Admin screenshot |
| 3. GraphQL xAPI | row 4 when it is a GraphQL operation |
| 4. Platform REST API | row 9; row 4 when it is a REST call; row 10 corroborates |

- A layer with an artifact gets the **FAIL / PASS** that §2 or the §3 claim citing that artifact states, and the
  artifact's package path (`<package>/network/failing-<op>.json`).
- Every other layer — no artifact, or an artifact no claim gives a result — gets **`N/A — not probed by the
  investigation`**. It is never probed here to fill the cell.
- **The owning layer is §2's**, whatever the other rows say.

## §Routing

The report's Fix Routing block (`qa-bug.md` Step 4), from §2 and §8:

- **Owning layer** and **repoKind** ← §2; **Component / module**, **RCA anchor** (file:line) ← §8, else §3's source
  claim.
- **Suggested repo** ← §2 / §8, spelled as [`skills/qa-fix-routing/fix-repos.json`](../../skills/qa-fix-routing/fix-repos.json)
  `routing[]` or [`module-suite-map.md`](module-suite-map.md) spell it; a repo neither file names keeps §8's spelling.
- **Ownership hint** ← the profile the command already loaded (`repos.client` lists it ⇒ `client`, else `platform`).
- **Routing confidence** ← §7. **§7 LOW ⇒ routing confidence LOW and no repo** — the package's own bar
  (`evidence-and-root-cause.md` §The confidence bar before you name a repo).

## §Report

The template of `qa-bug.md` Step 4, each section from the package:

| Report section | From |
|---|---|
| Title + severity | §1; severity graded from the package as without `--evidence` |
| Status (line 3) | `READY_TO_SUBMIT` at §7 HIGH / MEDIUM, `REPRODUCED` at LOW (root cause not yet identified) |
| `**Found by:**` (line 4) | the caller's `found-by:` argument, as `qa-bug.md` Step 1 says; none ⇒ `human` |
| Env | `BUILD_VERSIONS`, and `REPRO_RATE` when filled; an entry §Build could not compare, named as unverified; each §Complete "env cannot give it" statement |
| Summary | §1, and §4 for the why |
| Steps to reproduce | `evidence-index.md` `## Steps to reproduce` (row 15), as written there |
| Actual | the Part A artifacts (row 4's call with its inputs for an API bug) |
| Expected | §5's by-design row — the documented behaviour the symptom was ruled against; a row that cites without stating it ⇒ the behaviour the §3 / §4 claim contradicts. Never a new lookup |
| Layer Validation | §Layers |
| Root Cause Analysis | §3–§5 with package paths, never inlined (`.claude/rules/reports.md` §8) |
| Regression | §6, when filled |
| Fix Routing | §Routing |

- **Where** — `<bugs>` is the bugs root, the first that applies; the bucket is the declared severity's:
  1. the folder the caller names (`qa-bug.md` Step 4): `<bugs>` = `<that folder>/bugs`, report in `<bugs>/<bucket>/`;
  2. the package's parent, when it is a ticket run folder (`vc-fix:qa-investigate` writes
     `<run folder>/evidence-<UTCstamp>/`): `<bugs>` = `<package>/../bugs`, report in `<bugs>/<bucket>/`. The parent is
     one when it equals the session's bound run folder (`RUN_DIR`, `run-folder.mjs dir`), or the run folder
     [`run-env.md`](run-env.md) §The run folder resolves for the ticket that `found-by:` or `--link` names
     (`run-folder.mjs dir --ticket <KEY>`); any other parent is rule 3;
  3. otherwise `<bugs>` = `<outputRoot>/reports/bugs`, report in `<bugs>/open/<bucket>/` — e.g. a `/qa-run` package
     under `reports/regression/<RUN_ID>/`, a pruned folder a bug report must not land in.
- **Screenshots:** the ones the report cites (as many as `qa-bug.md` Step 4a allows) are **copied** from
  `<package>/screenshots/` to `<bugs>/screenshots/<slug>/` (the chosen `<bugs>` root; this is `qa-bug.md` Step 4a for a package), and the report
  cites the copy. The package stays whole for `/qa-fix`.
- The bug-report size caps hold (`.claude/rules/reports.md` §2): the package carries the detail, the report cites it.

## §Outcome

What `qa-bug` returns to its caller for this bug — exactly one of:

- the report path (`<bugs>/<bucket>/BUG-*.md`, or `<bugs>/open/<bucket>/BUG-*.md` under rule 3 — §Report);
- `INCOMPLETE_PACKAGE: <slot, slot>` (§Complete);
- `STALE_PACKAGE: <name> <package ver> ≠ <deployed ver> — re-run vc-fix:qa-investigate` (§Build).

After a report, Step 5 runs as without `--evidence`: its own "Create a bug-tracker ticket?" question, or `--confirmed`
(`--evidence` never implies it). Then the Final sweep and the completion signal (`complete --skill "qa-bug"`), which
an `INCOMPLETE_PACKAGE` / `STALE_PACKAGE` stop emits too — it is an early exit with nothing to file.
