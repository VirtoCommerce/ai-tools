# The run's env — chosen per session, never by editing a shared file

A command that runs against a stand takes its env as an optional argument:
`/vc-fix:qa-verify-fix VCST-1234 vcptcore_dev`. Without one, the run uses the project's default
(`.env.test-env`, else `vcst`). Two sessions in one project can run two envs at the same time; no file
another session reads is edited.

## Step 0 — bind the env, before anything else runs

- **The arguments name an env** — a bare token with a `.env.<token>` file in the project, or `--env <env>`
  ⇒ `node "$pluginRoot/scripts/env/use-env.mjs" <env>` (`$pluginRoot`: [`plugin-root.md`](plugin-root.md)).
- **They name none** ⇒ the same script with `--default`. It binds the default too, so the run keeps one env
  even if someone edits `.env.test-env` while it runs.
- **Exit 2 ⇒ STOP** and show its message: an unknown env, or a `TEST_ENV` in the session's environment that
  would beat the binding. Never fall back to another env silently.
- **Run inline by another command** (the ai-tools `/qa-test` runs this pipeline for a fix-ready Bug) ⇒ the
  caller already bound the env: do not bind again.

## What the binding does

The script writes `.vc-fix/session-env/<CLAUDE_CODE_SESSION_ID>` (gitignored, in the project). Every script
the session runs afterwards resolves `TEST_ENV` from it — `scripts/lib/resolve-test-env.js`: `TEST_ENV` → this
session's binding → `.env.test-env` → `vcst` — and so do the subagents' scripts, because they share the
session id. No `TEST_ENV=` prefix is needed. `env:check` and the `[config]` line name where the env came from.

## What every dispatch brief carries

A browser lane has no shell, so the brief is the only way the env reaches it: the env, `FRONT_URL`,
`BACK_URL` (the script prints them), and the password names in the form the lanes' `--secrets` file uses —
`NAME_<ENV>` on a combined every-env file, the bare `NAME` on a single-env one.

## Limits

- **`/clear` starts a new session id.** The binding no longer applies; the next command binds again.
- **A `TEST_ENV` exported by the shell that started Claude Code beats every binding.** The script refuses a
  different env rather than pretend.
