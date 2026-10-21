# Environment isolation — variable profiles and a stand per task (design)

**Status:** approved for planning, 2026-10-14 · **Owner:** Kirill Iusupov · **Epic:** VCST-6344 (tasks VCST-6345…6351 = T1…T7)
**Inputs:** the developer pilot (VCST-6160) blockers 3 and 4, PR #395, `/preflight` (VCST-6225), `/qa-local-env`.
**Amended 2026-10-19 (T6 · VCST-6350):** local stands are the workspace's ticket stands, several at once, their env
files kept outside the repo, with one master password — §11. D5 and T6's `--stand local` are superseded.

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
stands. ~~Several local stacks on one machine~~ — in scope since the 2026-10-19 amendment (§11): each ticket's
stand has its own ports. CI pipeline changes beyond the loader they already call.

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
| Dedicated (§11) | — | the env's own `.env.<env>` / `.env.playwright.<env>` in a `QA_ENV_PATH` folder (a ticket's stand, a machine's cloud stands); beats the rows above key by key | no |

Rules: a secret never sits in a committed file; an env's pinned `KEY_<ENV>` beats `.env.local`; the active env
is chosen per session (shell `TEST_ENV`) before per checkout (`.env.test-env`); every script reads the env
through `resolveTestEnv()` / `loadEnv()`, never by loading files itself — since §11 one implementation of the
order, `scripts/lib/env-layers.mjs`, byte-identical in the vc-fix plugin.

## 5. Work items (one Jira task each)

| # | Task | Done when | Needs |
|---|---|---|---|
| T1 · VCST-6345 | **Land PR #395.** Review; split into loader + guards · per-env secrets + combined file · per-env report folders if review stalls | Merged; `env:check` passes on `vcst` and `vcptcore_dev`; CI green | — |
| T2 · VCST-6346 | **Passwords from vc-secrets.** Each `.env.playwright.<env>` is materialised from the OS credential store or Azure Key Vault by a declared vc-secrets task; `.env.playwright.all` rebuilds on change; `/preflight` warns when it is stale | A new teammate gets every stand's passwords without anyone sending them; a changed password reaches the next run with no manual step | T1 |
| T3 · VCST-6347 | **`env:use` / `env:list` / `env:show`.** `env:use <env>` writes `.env.test-env` (or prints the shell line for a per-session switch) and runs `/preflight`; `env:list` lists stands with risk and lease state; `env:show` prints every resolved key with its layer, secrets masked | Switching is one command; `env:show` answers "where did this value come from" for any key | T1 |
| T4 · VCST-6348 | **Remaining per-run collisions.** Test model and tracker-comment ledger keyed by ticket **and** env; vc-fix commands write the per-env report layout; self-diagnostics records `testEnv` from `resolveTestEnv()` (both containment copies in one commit) | One ticket runs on two stands in parallel and no file is written by both | T1 |
| T5 · VCST-6349 | **Lease for shared stands.** §6. `/preflight` blocks a busy stand, acquires the lease when READY, the run's close releases it, a lease expires after its TTL | Two people starting a run on one shared stand: the second is blocked with the holder's name, ticket and expiry | T1 |
| T6 · VCST-6350 | **Local stands for developers** — amended 2026-10-19, §11: the workspace's ticket stands, each an env whose files live in the ticket's folder (`QA_ENV_PATH`), with one master password. ~~`/qa-test-fast --stand local` … switches the session to `localhost`~~ | A ticket's stand is an env with no file in the repo (`/qa-test-fast VCST-6314 vcst_6314`); two local stands run in parallel; `PASSWORDS=master` stands sign in with `MASTER_PASSWORD`; `/qa-deploy-pr` refuses a local stand | T1, T3 |
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
| D5 | ~~One local stack per machine (`TEST_ENV=localhost`); parallel local stacks are out of scope.~~ Superseded 2026-10-19 by D6. |
| D6 | Local stands are the workspace's ticket stands — one per ticket, own ports, a shared database (data interference accepted) — several at once. An env's files may live outside the repo, in `QA_ENV_PATH` folders; a dedicated file beats the repo's key by key. |
| D7 | One master password (`.env.playwright.master`, `MASTER_PASSWORD`) for every stand that opts in with `PASSWORDS=master`, local and cloud; its lanes type `MASTER_PASSWORD`. Shared stands keep per-env passwords unless the team agrees. |
| D8 | No `--stand` flag and no switch to `localhost`: the stand is the command's env argument, as for any env. |

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

## 11. Amendment 2026-10-19 — env files in dedicated folders, master stands (T6)

The workspace now runs every ticket on its own stand (`P:\VC\_VIRTO\tickets\<KEY>`: own ports, a shared
database), and dedicated cloud stands are replacing the shared `vcptcore-dev` / `-qa`. One ticket may be tested
on its local stand, then on a cloud stand. So:

1. **An env is the same files in more places.** `QA_ENV_PATH` (in `.env.local`) lists folders, `;`-separated, the
   first winning, with `QA_OUTPUT_DIR`'s placeholders (`<ticket>` = the run's ticket, `<env>`, `<sprint>`) and
   nothing appended. Each may hold `.env.<env>` and `.env.playwright.<env>`. A dedicated file beats the repo's key
   by key, after the `KEY_<ENV>` promotion; a ticket's folder may hold its own stands (`vcst_6314`,
   `vcst_6314_es`) and override a shared env for that ticket's runs. Files are self-contained (no `extends`).
2. **One loader.** `scripts/lib/env-layers.mjs` holds the order; config.js, `load-env.mjs`, the seeders, the
   GraphQL / layout runners, deploy, the ticket-context skill and the vc-fix plugin (a byte-identical copy) apply
   it. The kb token resolver and the hotfix scripts keep their own reads (tokens; the vcptcore stands at the root).
3. **Env detection is one lookup** (`findEnv`, with the run's ticket): `env:use`, `run:use`, `/preflight --env`,
   `deploy:pr`. An "unknown env" error lists the repo's envs only. No `env:list` / `env:show` (T3 stays as built).
4. **Master stands.** `PASSWORDS=master` in a stand's own env file (the root `.env.<env>` for a repo env, never an
   override or `.env.local`, so a shared stand cannot be switched for one ticket): every test-account password variable (the role
   registry and every name the suites and test-data type) resolves to `MASTER_PASSWORD` from
   `.env.playwright.master`, so the seeders set it; the lanes type `MASTER_PASSWORD` in every password field.
   `secrets:sync` / `secrets:sync:all` copy it as one stable line — a new master stand needs no re-sync and no MCP
   reconnect — and give a master stand no per-name entries. `enforce-secret-token` blocks `MASTER_PASSWORD` in a
   session whose stand did not opt in, and a copy older than the master file.
5. **The `--secrets` model is unchanged for other stands.** `secrets:sync:all` also reads every ticket's folder,
   refuses a name whose value differs between a shared env and a ticket's override of it, and writes atomically.
6. **`/qa-deploy-pr`** loads through the same loader (a dedicated cloud stand's `DEPLOY_BRANCH` and `BACK_URL`
   come from its own files) and refuses an env whose `BACK_URL` is on this machine. **`/preflight`** on a local
   stand reads no vc-deploy-dev manifest (`declared: local stand`); `deployed` and `--expect` confirm the stand
   runs the PR's build — T6's second done-when.

**Out of scope, decided:** the seeding rework (an admin-only credential, per-run disposable users) and an
operator sign-in mode next to `PASSWORDS` (`OPERATOR_SIGNIN=<roles>`), both a later PR; the kb secret gate reading
hosts and secrets from the dedicated folders (a follow-up); T2 for local stands; data isolation on the shared
database. Later, outside ai-tools: the workspace's ticket set-up writes the ticket's `.env.<env>`.
