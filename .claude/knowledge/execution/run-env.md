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
  `QA_ENV_PATH` folder defines exactly one env (VCST-6314 → `vcst_6314`), and says so. Otherwise
  `npm run env:use -- --default`. It binds the default too, so the run keeps one env
  even if someone edits `.env.test-env` while it runs. When that moves a session that was on another env, it
  prints a `⚠ this session was on …` line: show it to the user, who passes the env to stay.
- **Exit 2 ⇒ STOP** and show its message: an unknown env, or a `TEST_ENV` in the session's environment that
  would beat the binding. Never fall back to another env silently.
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
came from; `env:use` names the file each URL came from.

## Where an env's files live — the project root and `QA_ENV_PATH`

An env is the same files wherever they live: `.env.<env>` (URLs, identities, `ENV_RISK`, `PASSWORDS`) and
`.env.playwright.<env>` (its passwords). Besides the project root, they may sit in dedicated folders —
`QA_ENV_PATH` in `.env.local`, `;`-separated, the first wins:

```
QA_ENV_PATH=P:\VC\_VIRTO\tickets\<ticket>\.work\self-qa;P:\VC\_VIRTO\qa-envs
```

- **Placeholders** are `QA_OUTPUT_DIR`'s — `<ticket>` (the run's ticket: `run:use`'s argument, else the session's
  bound run; outside a session `QA_TICKET=<KEY>`), `<env>`, `<sprint>` — and nothing is appended. A folder whose
  placeholder has no value is skipped.
- **A dedicated file beats the project root key by key**, `KEY_<ENV>` pins included. A ticket's folder holds its
  own stands (`.env.vcst_6314`, `.env.vcst_6314_es` — ticket-based names) and may override a shared env for that
  ticket's runs only (a `.env.vcptcore_dev` there). Each file is self-contained: none extends another. A stand
  several tickets use belongs in a folder without `<ticket>` (`P:\VC\_VIRTO\qa-envs`).
- **The order every loader applies** is `scripts/lib/env-layers.mjs` `layered` — config.js, `load-env.mjs`, the
  seeders, the runners, deploy, the vc-fix plugin's copy. An "unknown env" error lists the project root's envs only.

## Master stands — one password for every test account

- **`.env.playwright.master`** (project root, gitignored) holds `MASTER_PASSWORD=…`: one strong value for every
  master stand, local and cloud. It must pass the platform's password policy (by default 8+ characters with an
  upper- and a lowercase letter), because the seeders set it on accounts.
- **`PASSWORDS=master`** in the stand's own env file opts it in: the project root's `.env.<env>` for an env the
  repo defines, else its file in its `QA_ENV_PATH` folder. A line in `.env.local` or a ticket folder's override of a
  repo env is ignored with a warning: it would switch a stand others use, and seeding would reset that stand's
  accounts to the master password. The stand's file then holds no passwords. Every test-account
  password variable resolves to the master value (the role registry, and every name the suites and test-data
  type); other accounts on the stand keep their own. A shared stand keeps per-env passwords unless the team agrees.
- **The lanes type `MASTER_PASSWORD` in every password field.** `npm run secrets:sync:all` copies it into
  `.env.playwright.all` as one stable line, so a new master stand needs no re-sync and no reconnect. The
  `enforce-secret-token` hook blocks `MASTER_PASSWORD` in a session whose stand did not opt in.

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
- **A local stand is not a deploy target:** `/qa-deploy-pr` refuses an env whose `BACK_URL` is on this machine.
- **One stand per run, not one run per stand:** nothing here stops two sessions from testing on the same stand
  at once. That is a lease question (VCST-6349), not this file's.
