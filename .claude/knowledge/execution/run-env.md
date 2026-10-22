# The run's env — chosen per session, never by editing a shared file

A command that runs against a stand takes its env as an optional argument and binds it for its own Claude Code
session only, so two sessions in one checkout run two envs at the same time and no file another session reads
is edited. Examples: `/qa-test VCST-6314 vcptcore_dev`, `/qa-test-fast VCST-6314 vcst_6314`,
`/qa-deploy-pr VCST-6314 vcptcore_dev`. Without one, the run uses the checkout's default (`.env.test-env`,
else `vcst`). An env is a `.env.<env>` file in the project root, or in a dedicated folder (§Where an env's files
live) — a ticket's own stand included.

## Step 0 — bind the env, before anything else runs

- **The arguments name an env** — a bare word `run:use` / `env:use` accepts as one (a `.env.<word>` in the
  project root or in a `QA_ENV_PATH` folder, the ticket's own included), or `--env <env>` / `--env=<env>` ⇒
  `npm run env:use -- <env>` (a ticket run: `npm run run:use -- <TICKET> <env>`, which also binds the run folder).
- **They name none** ⇒ a ticket run (`npm run run:use -- <TICKET>`) binds the ticket's own stand when the ticket's
  `QA_ENV_PATH` folder defines exactly one env the project root does not (VCST-6314 → `vcst_6314`), and says so. Otherwise
  `npm run env:use -- --default`. It binds the default too, so the run keeps one env
  even if someone edits `.env.test-env` while it runs. When that moves a session that was on another env, it
  prints a `⚠ this session was on …` line: show it to the user, who passes the env to stay.
- **Exit 2 ⇒ STOP** and show its message: an unknown env, or a `TEST_ENV` (or, for `run:use`, a `QA_TICKET` of
  another ticket) in the session's environment that would beat the binding. Never fall back to another env silently.
- **A command run inline by another keeps the caller's binding** — `/qa-test` running `/vc-fix:qa-verify-fix`
  for a fix-ready Bug binds once, at its own Step 1a; the inline pipeline does not bind again.
- **A subagent never binds.** It shares the session id, so an `env:use` (or `run:use`) there re-binds the caller's whole run —
  `--default` would move it to the checkout's default env mid-run. Its caller passes the env (the brief's
  Environment line, and the argument of a command it hands over: `/qa-exploratory ticket <KEY> <env>`), and a
  `ticket`-mode `/qa-exploratory` skips `env:use`: it compares that argument with the session's env (a bare
  `npm run env:use` prints it) and STOPs when they differ.

## What the binding does

`env:use` writes `.vc-fix/session-env/<CLAUDE_CODE_SESSION_ID>` (gitignored). Every script the session runs
afterwards resolves `TEST_ENV` from it — `scripts/lib/resolve-test-env.js`: `TEST_ENV` → this session's binding
→ `.env.test-env` → `vcst` — and so do the subagents' scripts, because they share the session id. No
`TEST_ENV=` prefix is needed on any command. `npm run env:check` and the `[config]` line name where the env
came from; `env:use` names the file each URL came from. When no file defines the bound env any more (its folder
was removed, or a `QA_TICKET` points `<ticket>` at another ticket), every loader stops with an error instead of
running on `.env.local`'s stand: bind again.

## Where an env's files live — the project root and `QA_ENV_PATH`

An env is the same files wherever they live: `.env.<env>` (URLs, identities, `ENV_RISK`, `PASSWORDS`) and
`.env.playwright.<env>` (its passwords). Besides the project root, they may sit in dedicated folders —
`QA_ENV_PATH` in `.env.local`, `;`-separated, the first wins:

```
QA_ENV_PATH=P:\VC\_VIRTO\tickets\<ticket>\.work\self-qa;P:\VC\_VIRTO\qa-envs
```

- **Placeholders** are `QA_OUTPUT_DIR`'s — `<ticket>` (the run's ticket: `run:use`'s argument, else `QA_TICKET=<KEY>`
  in the environment, else the session's bound run; `QA_TICKET` beats a bound run as `TEST_ENV` beats the env
  binding, so `run:use` refuses another ticket while it is set), `<env>`, `<sprint>` — and nothing is appended. A
  folder whose placeholder has no value is skipped. A `<ticket>` folder is named with the key in upper case
  (`VCST-6314`): on a case-sensitive file system (Linux, macOS) a lower-case one is listed but never opened.
  `run:use --clear` also removes an env binding that only the ticket's folder defined: with no run bound, no file
  would define that env.
- **A dedicated file beats the project root key by key**, `KEY_<ENV>` pins included. A ticket's folder holds its
  own stands (`.env.vcst_6314`, `.env.vcst_6314_es` — ticket-based names) and may override a shared env for that
  ticket's runs only (a `.env.vcptcore_dev` there). Each file is self-contained: none extends another. A stand
  several tickets use belongs in a folder without `<ticket>` (`P:\VC\_VIRTO\qa-envs`).
- **An override never moves a shared stand.** The loader warns when it changes a project env's `BACK_URL`,
  `FRONT_URL` or `ENV_RISK` (the lanes sign in at those URLs with that env's passwords), and a deploy ignores it:
  `/qa-deploy-pr` and `deploy:upgrade` read an env the project root defines from the root's files only. A
  ticket's own stand gets its own env name.
- **The order every loader applies** is `scripts/lib/env-layers.mjs` `layered` — config.js, `load-env.mjs`, the
  seeders, the runners, deploy, the vc-fix plugin's copy. An "unknown env" error lists the project root's envs only.

## Master stands — one password for every test account

- **`.env.playwright.master`** (project root, gitignored) holds `MASTER_PASSWORD=…`: one strong value for every
  master stand, local and cloud. It must pass the platform's password policy (by default 8+ characters with an
  upper- and a lowercase letter), because the seeders set it on accounts.
- **`PASSWORDS=master`** in the stand's own env file opts it in: the project root's `.env.<env>` for an env the
  repo defines, else its file in its `QA_ENV_PATH` folder. A line in `.env.local` or a ticket folder's override of a
  repo env is ignored with a warning, and one in the process environment (inherited, or passed by CI) is ignored too:
  each would switch a stand others use, and seeding would reset that stand's accounts to the master password. The
  stand's file then holds no passwords. Without `.env.playwright.master` its test-account passwords are unset, never
  another stand's. Every test-account
  password variable resolves to the master value: the role registry, every name the suites and test-data type,
  and the platform admin's `ADMIN_PASSWORD` — the seeders sign in as the admin, so the stand's admin must use the
  master password too (a seeder's `invalid_grant` there says so). Accounts nothing names keep their own, so a value
  that is not an account's password — a deliberately wrong or a new password in a case — is never named
  `*_PASSWORD`: on a master stand it would equal the master password. A
  production stand (`ENV_RISK=production`) is never a master stand: its `PASSWORDS=master` is ignored with a
  warning. A shared stand keeps per-env passwords unless the team agrees.
- **The lanes type `MASTER_PASSWORD` in every password field.** `npm run secrets:sync:all` copies it into
  `.env.playwright.all` as one stable line, so a new master stand needs no re-sync and no reconnect. The
  `enforce-secret-token` hook blocks the master password — `MASTER_PASSWORD`, or any name whose value is a copy of
  it — in a session whose stand did not opt in, or that no binding, `TEST_ENV` or `.env.test-env` chose, and when
  it cannot resolve the stand at all (no `node_modules`, an env file it cannot layer).

## What every dispatch brief carries

A browser lane has no shell, so the brief is the only way the env reaches it. `env:use` prints the env, its
URLs and how the lanes type its passwords; copy them into the brief's Environment line
([`../../templates/agent-dispatch.md`](../../templates/agent-dispatch.md)): the env, `FRONT_URL`, `BACK_URL`,
and the password form — `MASTER_PASSWORD` in every password field on a master stand, else `NAME_<ENV>`
(`ORG_USER_PASSWORD_VCPTCORE_DEV`) when the lanes read the combined `.env.playwright.all`, the bare `NAME` on a
single-env file ([`browser-lanes.md`](browser-lanes.md) §Browser login secrets). A `⚠ passwords` line from
`env:use` means a sign-in on this env would type another env's passwords, or none: fix it
(`npm run secrets:sync:all`, reconnect the `playwright-*` servers) before any browser lane starts.

## Limits

- **`/clear` starts a new session id.** The binding no longer applies; the next command binds again, and a
  bare command in between resolves `.env.test-env`.
- **A `TEST_ENV` exported by the shell that started Claude Code beats every binding** (a CLI session started
  from a terminal with `TEST_ENV` set). `env:use` refuses a different env rather than pretend.
- **The installed `vc-fix` plugin resolves the env with its own copy of the resolver**: its steps follow a
  binding, the `QA_ENV_PATH` folders and master stands only from the plugin release that carries them. Until
  then, name the env in what you pass to them.
- **vc-init's own loader keeps the order before `QA_ENV_PATH`:** its `sync-browser-secrets.mjs` (`/project-init`)
  reads the project root's files only — no dedicated folders, no master stands. A stand in a `QA_ENV_PATH` folder,
  or a master stand, gets its lane passwords from `npm run secrets:sync:all` here.
- **A local stand is not a deploy target:** `/qa-deploy-pr` refuses an env whose `BACK_URL` is on this machine:
  localhost, a loopback or unspecified address (IPv4 or IPv6, IPv4-mapped included) or a Docker `*.docker.internal`
  name. Other names for it — `localhost.`, its hostname or LAN address — and a `BACK_URL` with no scheme are not
  recognised: write a local stand's `BACK_URL` as `http://localhost:<port>`.
- **One stand per run, not one run per stand:** nothing here stops two sessions from testing on the same stand
  at once. That is a lease question (VCST-6349), not this file's.
