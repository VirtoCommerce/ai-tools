# Test-account credentials — one store (design)

Status: accepted 2026-11-17. Supersedes D4 of `2026-10-14-env-isolation-design.md` for test-account
credentials; tokens and API keys stay as that design and `plugins/CLAUDE.md` describe them (vc-secrets).

## 1. Problem

A test account's login and password lived in up to nine places: logins in the tracked `.env.<env>` and
`.env.defaults`, passwords in `.env.local` (bare and `_<ENV>`-suffixed), `.env.playwright.<env>` in the root
and in `QA_ENV_PATH` folders, `.env.playwright.master`, two generated `--secrets` files
(`.env.playwright.local`, `.env.playwright.all`), password literals in the committed templates, and a
`'Password1!'` fallback in about 25 places in the seeders. No seeder wrote down the password it set. So after
every seed, and after every env switch, a person added lines to `.env.local` by hand and re-ran
`secrets:sync[:all]` before a lane could sign in.

## 2. Decision

| # | Decision |
|---|---|
| S1 | **One store per checkout: `test-accounts.local.json`** in the project root, gitignored. It holds every test account's login AND password, for every env, and the master password. Nothing else holds them. |
| S2 | **vc-secrets holds tokens and API keys only.** A token- or key-shaped name (`TOKEN`, `API`, `KEY`, `SECRET`) is refused by the store. |
| S3 | **Names do not change.** A key is the variable the suites, test-data and seeders already use (`ORG_USER_EMAIL`, `ORG_USER_PASSWORD`, `ADMIN`, `DEFAULT_TEST_PASSWORD`); the loader exposes it under that name. No `_<ENV>` suffix inside the store: the env is the section. |
| S4 | **Two levels only:** `defaults` (every env) and `envs.<env>` (that env, wins). The store beats every `.env*` file; a credential key still found in one is reported as a leftover. |
| S5 | **No generated secrets file.** A Playwright lane starts through `scripts/lanes/playwright-lane.mjs`, which reads the store and hands Playwright MCP the passwords in memory (`config.secrets`, the mechanism of `plugins/vc-init/bridge/playwright-mcp.mjs`). `secrets:sync[:all]` and `.env.playwright.*` are gone. |
| S6 | **What a lane types is unchanged:** `NAME_<ENV>` for every non-production env, `MASTER_PASSWORD` on a master stand. One set of lanes serves every env, so an env switch needs no reconnect. |
| S7 | **A lane leaves a manifest** (`.vc-fix/lanes/<lane>.json`: start time, names, salted fingerprints — never a value). The secret-token hook, the pre-flight and `env:use` compare it with the store and say "reconnect <lane>" when the store changed under a running lane. |
| S8 | **The seeder that sets a password records it.** Creating an account, or resetting its password, writes the login and the password into `envs.<TEST_ENV>`. A password variable with no value gets a generated one (platform policy-compliant) at the moment the account is created, never a shared literal. An existing account whose password is unknown is left alone and named. |
| S9 | **Migration is provable.** `npm run creds:migrate` reads every old source (git history for the logins removed from tracked files), writes the store, and proves that, for every env, every credential variable resolves to the same value as before. Only then does it back up and clean the old files and point `.mcp.json` lanes at the launcher. |

## 3. File

```json
{
  "version": 1,
  "master": "<MASTER_PASSWORD, optional>",
  "defaults": { "DEFAULT_TEST_PASSWORD": "…", "SALES_REP_EMAIL": "…" },
  "envs": {
    "vcst":       { "ADMIN": "…", "ADMIN_PASSWORD": "…", "USER_EMAIL": "…", "USER_PASSWORD": "…" },
    "virtostart": { "…": "…" }
  }
}
```

The shape, with names and no values, is `templates/test-accounts.example.json` (tracked). It is also what
`td:validate:credentials` reads as the list of declared names.

## 4. Where the store sits in the load order

`.env.defaults` → `.env.<env>` → `.env.local` → `KEY_<ENV>` promotion → `QA_ENV_PATH` folders' `.env.<env>` →
**store `defaults` → store `envs.<env>`** → `PASSWORDS=master` (every test-account password = `master`).
One implementation: `scripts/lib/env-layers.mjs`.

## 5. Sharing with the team

The store is per checkout, like `.env.local` was. A teammate gets it once, whole, from the team's secret store,
instead of a dozen lines across several files. A seeder run on a shared stand records what it set, so the
person who seeded passes on one file.

## 6. Out of scope here

The plugins' copies (`plugins/vc-fix`, `plugins/vc-test` env loaders; `plugins/vc-init` `/project-init`
scaffolding of `.env.local` passwords and option B) move to the store in a follow-up with their version bumps.
Until then a client project keeps working as before: without a store the loader behaves as it did.
