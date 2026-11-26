# Test accounts — working with the store

How a person or a session gets, keeps and shares test-account credentials. The store's format and why it is
JSON: [`docs/superpowers/specs/2026-11-17-test-accounts-store-design.md`](../../../docs/superpowers/specs/2026-11-17-test-accounts-store-design.md).
Its shape: [`templates/test-accounts.example.json`](../../../templates/test-accounts.example.json). Where it sits in
the load order: [`run-env.md`](run-env.md). How a lane types a password: [`browser-lanes.md`](browser-lanes.md)
§Browser login secrets.

**One rule carries the rest: the whole team works from the same `test-accounts.local.json`.** It holds every
env's accounts at once (`envs.<env>`), so switching env reseeds nothing, changes no password and reconnects no
lane. A password changes only when a seeder had no value for it — and then only in the copy of the person who
ran it.

## Commands

| Command | What it answers | Writes |
|---|---|---|
| `npm run creds:check [-- <env>]` | which password names an env still lacks; a credential left in a `.env` file; which running lane is behind the store | nothing |
| `npm run creds:verify [-- <env>...]` | does every account in the store still SIGN IN on its stand (one attempt per account, never locks one out); an account whose login no longer exists there is `GONE`, with the command that removes it; one refused with the right password (no failed attempt counted — a fixture on another store, refused on purpose) is reported, not failed | nothing |
| `npm run creds:forget -- <env> <login\|KEY>... [--dry-run]` | removes a `GONE` entry: a login, or a retired persona by its KEY — that env's own entry only | store |
| `npm run creds:migrate` | dry run: would moving the old `.env` credentials into the store change any value | nothing |
| `npm run creds:migrate -- --apply` | the move itself, proven; deletes its backup when the proof is green (`--keep-backup` keeps it) | store, `.env.*`, `.mcp.json` |

Every one prints names and counts, never a value.

## First time on this repo (or after pulling the store change)

1. **Have a team copy?** Put it at the repo root as `test-accounts.local.json`. Skip step 2.
2. **Coming from the old `.env.local` / `.env.playwright.*` files?** `npm run creds:migrate`, read the dry run,
   then `npm run creds:migrate -- --apply`. It rebuilds the logins from git history and points the `.mcp.json`
   lanes at `scripts/lanes/playwright-lane.mjs`.
3. **Restart Claude Code** — the lanes read the store at start.
4. `npm run creds:check -- <env>` for the envs you work on. A gap is a name to get from the team copy, not to make up.

**Starting from nothing is not enough to seed a shared stand:** the seeder signs in as the stand's admin, so
`envs.<env>.accounts.ADMIN` needs its login and password before the first seed. Get the rest from the team copy:
an account that already exists on a shared stand keeps its password — a seeder never resets it to a generated one.

## A seed on a shared stand

1. `npm run creds:check -- <env>` first. No gaps ⇒ the seed generates nothing.
2. Seed. A line `X had no value … generated one and recorded it` means your copy now differs from the team's:
   update the team copy and say so.
3. After someone else seeded, `npm run creds:verify -- <env>` proves your copy still signs in.
4. Reconnect the `playwright-*` servers in `/mcp` when `creds:check` names a lane as behind — never while browser
   suites are running (a reconnect kills their sessions).

**One password per stand:** `PASSWORDS=master` in its `.env.<env>` makes every test account there sign in with the
store's `master`, so the team syncs one value. The first seed after turning it on moves the stand's accounts to
`master`. Never on a production stand ([`run-env.md`](run-env.md) §Master stands — one password for every test account).

## A new env

1. `.env.<env>` with its URLs and settings — at the root, or in a `QA_ENV_PATH` folder for a ticket's own stand.
2. `envs.<env>.accounts.ADMIN` (login + password) in the store. Seeders record every account they create.
3. `npm run creds:check -- <env>`, then reconnect the lanes.

A stand with `ENV_RISK=production` is never given to a lane, by design.

## A new account

- **Created by a seeder:** nothing to do — it records the login and password. Share the updated copy.
- **Made by hand:** add it under `envs.<env>.accounts`. A role the suites call by name (`USER`, `ORG_USER`, …) is
  keyed by that name; a seeded fixture is keyed by its login with `{ "use": "<SHARED_NAME>" }`. A new
  `{{X_PASSWORD}}` in test-data: `npm run td:validate:credentials` says whether the store knows it.

## An account deleted

- **By a seeder's teardown:** nothing to do — the step that deleted the account removes its entry
  (`envs.<env>.accounts.<login>`; `accountUnset`, also inside `deleteUserByEmail`). A `--dry-run` teardown says
  which entries it would remove. A new seeder that deletes an account it recorded calls `accountUnset(login)` right
  after the delete. A named account (`SR_REP_X`) is kept: a re-seed brings the account back under that name.
- **Any other way** (by hand, a retired persona, a stand rebuilt): `npm run creds:verify -- <env>` reports it
  `GONE` and prints the `npm run creds:forget -- <env> …` that removes it. Share the updated copy.

## What a session does — and never does

- **Signs in** by typing the password's NAME, `NAME_<ENV>` (`USER_PASSWORD_VCST`), or `MASTER_PASSWORD` on a
  master stand — through a `playwright-*` lane only ([`../../rules/vc-browser.md`](../../rules/vc-browser.md)).
- **Reads a credential** through `process.env` after importing `config.js`, never off one `.env` file
  ([`../../rules/test-data.md`](../../rules/test-data.md) §Resolving a variable).
- **Calls an account missing** only after `creds:check`, and a password wrong only after `creds:verify` — an
  unset name in one checkout is not a missing account on the stand.
- **Never** prints, pastes or commits a value, sends the store through chat, Teams or mail, or puts a token or
  API key in it (that is vc-secrets; the loader rejects token-shaped names).
- **Never** reseeds a shared stand to "fix" a password without the operator's yes — that changes it for everyone.

## Not solved yet

- **No sync between copies.** The team copy is passed by hand through the team's secret store; nothing merges two
  copies that diverged.
- **Admin passwords of shared stands** live in the store like any other; vc-secrets would hold them more safely.
- **The plugins** (vc-init `/project-init`, vc-fix, vc-test) read the store from their releases that carry it.
