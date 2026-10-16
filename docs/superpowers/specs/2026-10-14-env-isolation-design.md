# Environment isolation — variable profiles and a stand per task (design)

**Status:** approved for planning, 2026-10-14 · **Owner:** Kirill Iusupov · **Epic:** VCST-6344 (tasks VCST-6345…6351 = T1…T7)
**Inputs:** the developer pilot (VCST-6160) blockers 3 and 4, PR #395, `/preflight` (VCST-6225), `/qa-local-env`.

## 1. Problem

The developer pilot could not run two checks at once and twice ran against the wrong stand:

- **One shared stand, no isolation.** Developer and QA runs land on the same stand; one run's data and deploys
  change what the other observes.
- **Switching stands means editing config.** `TEST_ENV` picks `.env.<env>`, but a personal `.env.local` loads
  last for every env, so a localhost `BACK_URL` there silently redirected every env (the GraphQL schema request
  that went to a local address in the pilot).
- **Passwords travel by hand**, between `.env.local` lines and per-env suffixes, and a missing one falls back
  to a default that fails login later.
- **Two runs share files**: the selected env (`.env.test-env`, one per checkout), the ticket's report folder,
  test model and tracker-comment ledger.

## 2. Goal and non-goals

**Goal.** Any person picks a stand with one command; the same checkout runs two sessions on two stands
without a collision; a developer tests on a stand nobody else is changing; a shared stand is never used by two
runs at once.

**Non-goals.** Moving knowledge and reports out of git (pilot blocker 5, its own epic). Creating new cloud
stands. Several local stacks on one machine (start-local binds fixed ports; one local stack per machine is
enough for the pilot). CI pipeline changes beyond the loader they already call.

## 3. Baseline

On `main`: `config.js` layers `.env.defaults` → `.env.${TEST_ENV}` → `.env.local` and promotes `KEY_<ENV>`
suffixes; `resolveTestEnv()` takes `TEST_ENV` from the process, then `.env.test-env`, then `vcst`;
`/preflight` checks stand health, deployed build and MCP before a run and treats a running regression's
`test-run-status.json` as a lock on that machine; `/qa-local-env <TICKET>` brings up a local stack pinned to
the deployed manifest plus the ticket's PR builds, wired as `TEST_ENV=localhost`.

**PR #395 (open)** adds per-env password files `.env.playwright.<env>`, one session per env through
`--secrets .env.playwright.${TEST_ENV:-…}`, a combined `.env.playwright.all` so switching needs no MCP restart,
per-env report folders `reports/tickets/<Sprint>/<TICKET>/<env>/`, wrong-env warnings, and about twenty
scripts moved onto `resolveTestEnv()` / `loadEnv()`. This design builds on it and does not restate it.

## 4. The model — three layers, like Postman

| Layer | Postman | Here | Committed |
|---|---|---|---|
| Global | Globals | `.env.defaults` | yes |
| Environment | Environment | `.env.<env>`; a value the env must keep is pinned as `KEY_<ENV>` | yes |
| Local | Local / current value | `.env.local` for non-secret personal overrides; passwords in `.env.playwright.<env>`, filled from vc-secrets | no |

Rules: a secret never sits in a committed file; an env's pinned `KEY_<ENV>` beats `.env.local`; the active env
is chosen per session (shell `TEST_ENV`) before per checkout (`.env.test-env`); every script reads the env
through `resolveTestEnv()` / `loadEnv()`, never by loading files itself.

## 5. Work items (one Jira task each)

| # | Task | Done when | Needs |
|---|---|---|---|
| T1 · VCST-6345 | **Land PR #395.** Review; split into loader + guards · per-env secrets + combined file · per-env report folders if review stalls | Merged; `env:check` passes on `vcst` and `vcptcore_dev`; CI green | — |
| T2 · VCST-6346 | **Passwords from vc-secrets.** Each `.env.playwright.<env>` is materialised from the OS credential store or Azure Key Vault by a declared vc-secrets task; `.env.playwright.all` rebuilds on change; `/preflight` warns when it is stale | A new teammate gets every stand's passwords without anyone sending them; a changed password reaches the next run with no manual step | T1 |
| T3 · VCST-6347 | **`env:use` / `env:list` / `env:show`.** `env:use <env>` writes `.env.test-env` (or prints the shell line for a per-session switch) and runs `/preflight`; `env:list` lists stands with risk and lease state; `env:show` prints every resolved key with its layer, secrets masked | Switching is one command; `env:show` answers "where did this value come from" for any key | T1 |
| T4 · VCST-6348 | **Remaining per-run collisions.** Test model and tracker-comment ledger keyed by ticket **and** env; vc-fix commands write the per-env report layout; self-diagnostics records `testEnv` from `resolveTestEnv()` (both containment copies in one commit) | One ticket runs on two stands in parallel and no file is written by both | T1 |
| T5 · VCST-6349 | **Lease for shared stands.** §6. `/preflight` blocks a busy stand, acquires the lease when READY, the run's close releases it, a lease expires after its TTL | Two people starting a run on one shared stand: the second is blocked with the holder's name, ticket and expiry | T1 |
| T6 · VCST-6350 | **Local stand for developers.** `/qa-test-fast --stand local` (pilot default) runs `/qa-local-env <TICKET>`, switches the session to `localhost`, and passes the ticket's PR build to `/preflight --expect` | A developer tests their PR without touching a shared stand; `/preflight` confirms the local build is the PR's | T1, T3 |
| T7 · VCST-6351 | **Runbook and pilot re-run.** One page: choose a stand, switch, lease, local stack, passwords; re-run the pilot on a new ticket and record time and rounds | The runbook is linked from `CLAUDE.md` §Environment; the re-run's numbers are added to the pilot results doc | T2–T6 |

T2–T5 can run in parallel once T1 is merged.

## 6. Lease for shared stands (T5)

**Store: one GitHub Issue per shared stand in `VirtoCommerce/ai-tools`,** labelled `stand` and
`stand:<env>`. Chosen over Jira (status noise on the board, slower API) and over a file in `vc-deploy-dev`
(write access to the deploy repo is not something every tester should need). `gh` is already a prerequisite.

- **Lease** = label `stand:busy` + assignee + one comment holding `{owner, ticket, runId, until}`. The comment is
  the record; the label is the fast check.
- **Acquire** at `/preflight` READY for a write-capable scope (`ticket`, `ticket-fast`, `regression`). A GitHub
  write is outward-facing, so it is confirmed once per run; `--yes` / `--ci` skips the question.
- **Busy** ⇒ BLOCK naming owner, ticket and `until`. **Expired** ⇒ WARN and offer take-over.
- **Release** at the run's close step; a crashed run's lease ends at `until`. Default TTL 4 h, extendable.
- **Not leased:** `ENV_RISK=production` stands (never written by runs) and local stacks.
- **Atomicity:** acquire re-reads the issue after writing; if another `stand:busy` comment is newer and
  unexpired, the later writer backs off. Races are rare (people, not machines, start runs) and fail loud.

## 7. Decisions

| # | Decision |
|---|---|
| D1 | #395 lands first; nothing in this epic re-implements what it adds. |
| D2 | Stand per task = **both**: developers on a local stack (T6), QA and regression on a leased shared stand (T5). |
| D3 | Lease store = GitHub Issues in `ai-tools` (§6). |
| D4 | Passwords' source of truth = vc-secrets (credential store / Key Vault); `.env.playwright.<env>` is a gitignored, generated copy because Playwright MCP takes `--secrets` only as a file. |
| D5 | One local stack per machine (`TEST_ENV=localhost`); parallel local stacks are out of scope. |

## 8. Risks

- **#395 drifts** while open (86 files): every week it waits, T2–T6 rebase on a moving target. Mitigation: split.
- **A generated password file is a secret at rest.** Same exposure as today's hand-made file; it stays
  gitignored and covered by the kb secret gate and `enforce-secret-token`.
- **Lease discipline**: a run that never closes holds a stand until TTL. Mitigation: TTL + take-over.
- **Key Vault access** may not be granted to everyone; the OS credential store is the fallback.

## 9. Validation

T7 re-runs the pilot on a fresh ticket: no config file edited by hand, no request to the wrong stand, a
developer run and a QA run in parallel, and time and QA rounds compared with VCST-5989 / VCST-5884.

## 10. Open questions

- TTL default (4 h) and who may break a lease that has not expired.
- Which shared stands enter the lease pool first (`vcptcore_dev`, `vcptcore_qa1` proposed).
