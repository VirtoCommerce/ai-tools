# The run's env — chosen per session, never by editing a shared file

A command that runs against a stand takes its env as an optional argument and binds it for its own Claude Code
session only, so two sessions in one checkout run two envs at the same time and no file another session reads
is edited. Examples: `/qa-test VCST-6314 vcptcore_dev`, `/qa-test-fast VCST-6314 vcptcore_dev`,
`/qa-deploy-pr VCST-6314 vcptcore_dev`. Without one, the run uses the checkout's default (`.env.test-env`,
else `vcst`).

## Step 0 — bind the env, before anything else runs

- **The arguments name an env** — a bare token with a `.env.<token>` file next to it, or `--env <env>` /
  `--env=<env>` ⇒ `npm run env:use -- <env>`.
- **They name none** ⇒ `npm run env:use -- --default`. It binds the default too, so the run keeps one env
  even if someone edits `.env.test-env` while it runs.
- **Exit 2 ⇒ STOP** and show its message: an unknown env, or a `TEST_ENV` in the session's environment that
  would beat the binding. Never fall back to another env silently.
- **A command run inline by another keeps the caller's binding** — `/qa-test` running `/vc-fix:qa-verify-fix`
  for a fix-ready Bug binds once, at its own Step 1a; the inline pipeline does not bind again.

## What the binding does

`env:use` writes `.vc-fix/session-env/<CLAUDE_CODE_SESSION_ID>` (gitignored). Every script the session runs
afterwards resolves `TEST_ENV` from it — `scripts/lib/resolve-test-env.js`: `TEST_ENV` → this session's binding
→ `.env.test-env` → `vcst` — and so do the subagents' scripts, because they share the session id. No
`TEST_ENV=` prefix is needed on any command. `npm run env:check` and the `[config]` line name where the env
came from.

## What every dispatch brief carries

A browser lane has no shell, so the brief is the only way the env reaches it. `env:use` prints the env, its
URLs and how the lanes type its passwords; copy them into the brief's Environment line
([`../../templates/agent-dispatch.md`](../../templates/agent-dispatch.md)): the env, `FRONT_URL`, `BACK_URL`,
and the password form — `NAME_<ENV>` (`ORG_USER_PASSWORD_VCPTCORE_DEV`) when the lanes read the combined
`.env.playwright.all`, the bare `NAME` on a single-env file
([`browser-lanes.md`](browser-lanes.md) §Browser login secrets). A `⚠ passwords` line from `env:use` means a
sign-in on this env would type another env's passwords: fix it (`npm run secrets:sync:all`, reconnect the
`playwright-*` servers) before any browser lane starts.

## Limits

- **`/clear` starts a new session id.** The binding no longer applies; the next command binds again, and a
  bare command in between resolves `.env.test-env`.
- **A `TEST_ENV` exported by the shell that started Claude Code beats every binding** (a CLI session started
  from a terminal with `TEST_ENV` set). `env:use` refuses a different env rather than pretend.
- **The installed `vc-fix` plugin resolves the env with its own copy of the resolver**: its steps follow a
  binding only from the plugin release that carries it. Until then, name the env in what you pass to them.
- **One stand per run, not one run per stand:** nothing here stops two sessions from testing on the same stand
  at once. That is a lease question (VCST-6349), not this file's.
