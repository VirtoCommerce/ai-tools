# A ticket run's folder — everything the run writes, in one place

Every file a ticket run writes lands in its run folder, one folder per ticket and env, so two runs (two tickets,
or one ticket on two envs) never write the same file, and the repo's shared copies are read, never overwritten.

## Where it is

- **`QA_OUTPUT_DIR` in `.env.local`** — a path template with optional `<ticket>`, `<env>` and `<sprint>`:
  `QA_OUTPUT_DIR=P:\VC\_VIRTO\tickets\<ticket>\.work\self-testing`.
- **The folder always names the ticket and the env.** A template without `<ticket>` gets `\<ticket>` appended,
  then one without `<env>` gets `\<env>`: `C:\temp\test-reports` → `C:\temp\test-reports\VCST-6314\vcptcore_dev`.
- **Unset ⇒ `reports/tickets/<sprint>/<ticket>/<env>/`** in the repo.
- Write the template unquoted or single-quoted: inside double quotes dotenv reads the `\n` of `C:\temp\new` as a
  line break. The rules live in `scripts/lib/run-dir.mjs`.

## Step 0 — bind it

`npm run run:use -- <TICKET> [<env>]` binds the session's env ([`run-env.md`](run-env.md)) **and** its run folder,
creates the folder, and prints `RUN_DIR=…`, `SCREENSHOTS=…` (§Screenshots), the env facts every brief carries,
and the ticket's prior run folders. `npm run --silent run:dir` reprints the folder at any later step, in a subagent too (it shares the
session); `-- --ticket <KEY> --prior` lists a ticket's run folders and `-- --all` every ticket's. Every path
below is relative to `{RUN_DIR}`, and a brief whose agent writes a file names the full path
(`Screenshot output: {SCREENSHOTS}`).

## Screenshots

A Playwright lane writes only inside its allowed roots (its output folder and the project), resolves a
relative path against the project root, and creates no folder — a path outside the roots fails with
*outside allowed roots*, even an absolute path into the project whose drive letter differs in case. So
`run:use` creates `screenshots/` and prints `SCREENSHOTS=` in the form a lane can write: **project-relative**
when the run folder is inside the project. **Outside the project** a lane started with `--allow-unrestricted-file-access` in its `.mcp.json`
args writes the absolute path directly. Without the flag it refuses the path: the capture is saved with a bare
filename (on `@playwright/mcp` 0.0.77 it lands in the project root) and moved into `{RUN_DIR}/screenshots/`
with `mv` right after. The flag also lifts the lane's limit on reading local files, so it is the operator's
call ([`browser-lanes.md`](browser-lanes.md)).

**Only the run's orchestrator binds.** Subagents share the session, so one that works on another ticket (a
per-bug verify-fix in `/qa-test --iterate`) resolves that ticket's folder with
`npm run run:dir -- --ticket <KEY>` and never runs `run:use`, which would re-bind the whole session.

## The layout

| What | Inside `{RUN_DIR}` | Before |
|---|---|---|
| summary, verdict, strategy, checklist, design and triage reports | `summary.json` · `verdict.md` · `test-strategy.md` · `testing-checklist.md` · `design-report.md` · `triage-report.md` | `reports/tickets/<Sprint>/<TICKET>/` |
| screenshots, evidence packages | `screenshots/` · `evidence-<UTCstamp>/` | the same folder |
| the test model | `test-model.md` | `reports/ba/test-models/<TICKET>-<date>.md` |
| the ticket's exploratory session report | `exploratory/SBTM-<charter>-<date>.md` | `reports/exploratory/` |
| bug reports and their screenshots | `bugs/<critical-high\|medium\|low>/BUG-*.md` · `bugs/screenshots/<slug>/` | `reports/bugs/open/…` |
| a domain map or mind map the run builds or updates | `knowledge/domain/<slug>.md` · `knowledge/domain/<slug>.mind-map.json` | `.claude/knowledge/domain/` |
| the GraphQL schema snapshot, its cache, the fixtures report | `knowledge/api/graphql-schema.md` · `.graphql-schema.cache.json` · `graphql-fixtures-validation.md` | `.claude/knowledge/api/` · `scripts/` · `reports/` |
| `/qa-verify-fix`'s files | `verification-report.md` · `verification-summary.json` · `evidence.html` | `reports/tickets/<Sprint>/<TICKET>/` |

`schema:refresh`, `graphql:fixtures:validate(:refresh)` and `bundle-evidence` write into the bound run by
themselves. Every other step takes its path from this table.

## Reading

- **Own copy first, then the repo's.** The domain map comes from `knowledge/domain/` when this run built or
  updated it, else from `.claude/knowledge/domain/`. The GraphQL schema comes from `knowledge/api/` once this
  run refreshed it.
- **Prior artifacts are read from every run folder of the ticket** that `run:use` listed (all envs, and the
  older `reports/tickets/<Sprint>/<TICKET>/` layout). That covers a test model to amend, strategy rounds to
  count, and an earlier verdict on the same build. They are written only into this run's own folder.
- **Bug dedupe** reads `reports/bugs/**` plus the `bugs/` folder of every run folder of the ticket.

## Promotion is by hand

`{RUN_DIR}/knowledge/` mirrors `.claude/knowledge/`, `{RUN_DIR}/bugs/<severity>/` mirrors
`reports/bugs/open/<severity>/` (its `screenshots/` mirrors `reports/bugs/screenshots/`), and `test-model.md` is
promoted as `reports/ba/test-models/<TICKET>-<date>.md`, so promoting a run's map, schema, model or bug into the
shared copy is a plain copy that the operator decides on. Until
then, the next ticket reads the repo's copy. `.claude/knowledge/` itself is an interim home: the target is a
knowledge base, not git.

## Not in the run folder

- **`/qa-test` FULL's new Draft cases** (`regression/suites/`), `tc:alloc` and fixture updates. They are the
  case corpus, its C1 regression runs them from there, and one author per suite already governs them.
- **Remote writes**: the kb, the Artifact page, and the tracker comment — one per ticket **per env**,
  because `.tracker-comments.json` keys its entries by both.
- **`tokens:sync`**: it is generated from the storefront source, not from a stand.
