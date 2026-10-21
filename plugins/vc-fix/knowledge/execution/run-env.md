# The run's env — chosen per session, never by editing a shared file

A command that runs against a stand takes its env as an optional argument:
`/vc-fix:qa-verify-fix VCST-1234 vcptcore_dev`. Without one, the run uses the project's default
(`.env.test-env`, else `vcst`). Two sessions in one project can run two envs at the same time; no file
another session reads is edited.

## Step 0 — bind the env, before anything else runs

- **The arguments name an env** — a bare word the script accepts as one (a `.env.<word>` in the project or in
  a `QA_ENV_PATH` folder, §Where an env's files live), or `--env <env>`
  ⇒ `node "$pluginRoot/scripts/env/use-env.mjs" <env>` (`$pluginRoot`: [`plugin-root.md`](plugin-root.md)).
- **They name none** ⇒ for a ticket run (`run-folder.mjs use <TICKET>`) the ticket's own stand when the
  ticket's `QA_ENV_PATH` folder defines exactly one env; otherwise the same script with `--default`. It binds the default too, so the run keeps one env
  even if someone edits `.env.test-env` while it runs. When that moves a session that was on another env, it
  prints a `⚠ this session was on …` line: show it to the user, who passes the env to stay.
- **Exit 2 ⇒ STOP** and show its message: an unknown env, or a `TEST_ENV` in the session's environment that
  would beat the binding. Never fall back to another env silently.
- **Run inline by another command** (the ai-tools `/qa-test` runs this pipeline for a fix-ready Bug) ⇒ the
  caller already bound the env: do not bind again.
- **A subagent never binds.** It shares the session id, so binding there re-binds the caller's whole run
  (`--default` would move it to the project's default env mid-run). Pass the env to it in the brief instead.

## What the binding does

The script writes `.vc-fix/session-env/<CLAUDE_CODE_SESSION_ID>` (gitignored, in the project). Every script
the session runs afterwards resolves `TEST_ENV` from it — `scripts/lib/resolve-test-env.js`: `TEST_ENV` → this
session's binding → `.env.test-env` → `vcst` — and so do the subagents' scripts, because they share the
session id. No `TEST_ENV=` prefix is needed. `env:check` and the `[config]` line name where the env came from.

## Where an env's files live

An env is the same files wherever they live: `.env.<env>` and `.env.playwright.<env>`. Besides the project, they
may sit in dedicated folders — `QA_ENV_PATH` in `.env.local`, `;`-separated, the first wins
(`QA_ENV_PATH=P:\VC\_VIRTO\tickets\<ticket>\.work\self-qa;P:\VC\_VIRTO\qa-envs`), with `QA_OUTPUT_DIR`'s
placeholders and nothing appended; `<ticket>` is the run's ticket (`run-folder.mjs use`'s argument, else the
session's bound run; outside a session `QA_TICKET=<KEY>`). A dedicated file beats the project's key by key,
pins included: a ticket's folder holds its own stands and may override a shared env for that ticket's runs.
`scripts/lib/env-layers.mjs` is the order, byte-identical with the ai-tools repo's.

**Master stands:** `PASSWORDS=master` in a stand's own env file (the project's `.env.<env>` for an env the project
defines, else its `QA_ENV_PATH` file; nowhere else) means every test account on it signs in with ONE
password, `MASTER_PASSWORD` in the project's `.env.playwright.master`; every test-account password variable
resolves to it, and a lane types `MASTER_PASSWORD` in every password field.

## What every dispatch brief carries

A browser lane has no shell, so the brief is the only way the env reaches it: the env, `FRONT_URL`,
`BACK_URL` (the script prints them), and the password names in the form the lanes' `--secrets` file uses —
`MASTER_PASSWORD` on a master stand (the script says so), else `NAME_<ENV>` on a combined every-env file, the
bare `NAME` on a single-env one.

## The run folder — where a ticket run writes

A ticket run writes every file into one folder per ticket and env, so two runs (two tickets, or one ticket
on two envs) never write the same file.

- **Bind it at Step 0 instead of the env alone:** `node "$pluginRoot/scripts/env/run-folder.mjs" use <ticket-key> [<env>]`
  binds the env as above **and** the run folder, creates the folder, and prints `RUN_DIR=…` and the ticket's
  prior run folders. `… dir` prints the folder again at any later step, in a subagent too.
- **Where it is:** `QA_OUTPUT_DIR` in `.env.local`, a path template with optional `<ticket>`, `<env>` and
  `<sprint>` (`QA_OUTPUT_DIR=P:\VC\_VIRTO\tickets\<ticket>\.work\self-testing`). A template without
  `<ticket>` gets `\<ticket>` appended, then one without `<env>` gets `\<env>`. Unset ⇒
  `reports/tickets/<sprint>/<ticket-key>/<env>/` in the project, or `reports/tickets/<ticket-key>/<env>/` when the
  project has no `reports/tickets/Sprint<n>-<n>` folder. Once the first one exists, a ticket's new runs go to
  `<sprint>/<ticket-key>/<env>/`; `… use` still lists its earlier folder among the prior runs. Write it unquoted or
  single-quoted.
- **What lands there:** `/qa-verify-fix`'s `verification-report.md`, `verification-summary.json`,
  `evidence.html` and screenshots; an investigation package as `evidence-<UTCstamp>/`; a bug report the run
  files, as `bugs/<critical-high|medium|low>/BUG-*.md` with its screenshots in `bugs/screenshots/<slug>/`.
  `/qa-bug` writes there only when its caller names the run folder; standalone it writes `reports/bugs/`.
- **Screenshots:** a Playwright lane writes only inside its allowed roots (its output folder and the project)
  and creates no folder. `use` creates `screenshots/` and prints `SCREENSHOTS=` in the form a lane can write —
  project-relative inside the project. Outside it, a lane started with `--allow-unrestricted-file-access`
  writes the absolute path; without the flag it refuses it, so save the capture with a bare filename and `mv`
  it into the folder. The flag also lifts the lane's limit on reading local files: the operator's call.
- **Reading:** prior artifacts come from every run folder of the ticket that `use` listed (all envs, and the
  older `reports/tickets/<Sprint>/<ticket-key>/` layout); they are written only into this run's folder.
  Moving a run's bug report into `reports/bugs/open/` is the operator's call.
- **Run inline by another command** for its own ticket (the ai-tools `/qa-test` on a fix-ready Bug): the
  caller bound the folder, do not bind again. **For another ticket** (a per-bug verify in `/qa-test --iterate`):
  `… dir --ticket <ticket-key>` resolves that ticket's folder. Never `use` there: it re-binds the whole session.

## Limits

- **`/clear` starts a new session id.** The binding no longer applies; the next command binds again.
- **A `TEST_ENV` exported by the shell that started Claude Code beats every binding.** The script refuses a
  different env rather than pretend.
