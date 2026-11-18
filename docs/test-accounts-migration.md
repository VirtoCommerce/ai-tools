# Moving to test-accounts.local.json

Nov 17, 2026 · Elena Mutykova

The logins and passwords of every test account now live in one file, `test-accounts.local.json`, at the repo root. The move is done once per machine and takes about 10 minutes.

## What changed

Test-account credentials used to live in nine places: logins in `.env.<env>` and `.env.defaults`, passwords in `.env.local` (with and without the `_<ENV>` suffix), in `.env.playwright.<env>`, `.env.playwright.master`, in two generated files for the lanes, and in seeder code (`Password1!`). After every seed and every env switch you had to add lines to `.env.local` by hand and run `secrets:sync`.

|  | Before | Now |
| --- | --- | --- |
| Test-account logins and passwords | 9 places | one file, `test-accounts.local.json` |
| A new account after seeding | add it to `.env.local` by hand | the seeder records the login and password itself |
| Passwords for the Playwright lanes | `npm run secrets:sync`, a `--secrets` file | the lane reads the file into memory, no sync |
| Switching env | re-sync and reconnect | nothing to do |
| Tokens and API keys | `.env.local` | vc-secrets (or `.env.local` for now) |
| Personal Jira credentials (`JIRA_EMAIL`, `JIRA_PASSWORD`) | `.env.local` | same place, never in the shared file |

In the file each account's login and password sit side by side. Shared passwords that many fixtures sign in with (`DEFAULT_TEST_PASSWORD` and the like) are written once, under `shared`:

```json
"envs": { "vcst": {
  "accounts": {
    "USER":  { "login": "…", "password": "…" },
    "ADMIN": { "login": "admin", "password": "…" },
    "agent-test-x@test-agent.com": { "password": { "use": "DEFAULT_TEST_PASSWORD" } }
  },
  "shared": { "TEST_USER_PASSWORD": "…" }
} }
```

Suites, seeders and runners have not changed: the loader serves the same variables (`{{USER_EMAIL}}`, `{{USER_PASSWORD}}`).

## The move: what to do once on your machine

Do it after [PR #678](https://github.com/VirtoCommerce/ai-tools/pull/678) and [PR #679](https://github.com/VirtoCommerce/ai-tools/pull/679) are merged into `main`. No browser suites should be running during the move.

1. Update the repo and dependencies:

   ```bash
   git checkout main && git pull
   npm ci
   ```
2. Pick your case.
   - **You have working `.env.local` and `.env.playwright.*` files** (you have run suites on this machine) → steps 3–4.
   - **New machine or fresh clone** → get the team's `test-accounts.local.json` from the lead via the team's secret store, put it at the repo root, copy the `playwright-*` lanes from `templates/.mcp.json.example` into your `.mcp.json` → go straight to step 5.
3. Dry run of the migration (writes nothing):

   ```bash
   npm run creds:migrate
   ```

   Look for the line `proof (simulated): … every credential resolves as before` in the output. Next to it is the list of files that will be cleaned. Any `✗` line in the proof — stop, and post in a comment on this doc.
4. Apply the migration:

   ```bash
   npm run creds:migrate -- --apply
   ```

   It creates `test-accounts.local.json`, backs up the old files to `.vc-fix/creds-backup/<time>/`, removes the credentials from `.env.local`, deletes `.env.playwright.*` and rewrites the lanes in `.mcp.json`. It should end with the line `proof (the real tree): … every credential resolves as before`. When that proof passes, the backup is deleted (it holds the old passwords in plain text); `--keep-backup` keeps it.
5. **Restart Claude Code** — the Playwright lanes start again and read the new file.
6. Check:

   ```bash
   npm run creds:check
   npm run creds:verify
   ```

   `creds:check` shows, per env, which names have no password, and that the lanes hold the current values (`✓ lane … holds what test-accounts.local.json says`). `creds:verify` tries to sign in with every account on its stand. Both print names only, never values.
7. Nothing to clean up after a green migration: the backup is already gone. Ran it with `--keep-backup`, or have backups from earlier runs (the migration names them, it does not delete them)? Delete `.vc-fix/creds-backup/` once everything works — it holds the old passwords in plain text.

Running `creds:migrate` again is safe: if the file already exists, it only picks up credentials left behind in `.env` files, and it never brings back what was removed from the file.

## The .mcp.json file — Playwright lanes

The lanes no longer read a `--secrets` file: each `playwright-*` starts through the launcher `scripts/lanes/playwright-lane.mjs`, which takes the passwords from `test-accounts.local.json`. `.mcp.json` is per machine (in `.gitignore`), so everyone has to change their own.

- **Through the migration (step 4)** — `npm run creds:migrate -- --apply` rewrites all four lanes itself (the old copy stays in the backup only if the proof fails, or with `--keep-backup`). Other servers (github, kb, atlassian…) are left alone.
- **By hand** (new machine, or your own `.mcp.json` not made from the template) — in each of `playwright-chrome`, `playwright-firefox`, `playwright-edge`, `playwright-mobile`, replace `args` as in the example below (or copy from `templates/.mcp.json.example`). The lane name after `playwright-lane.mjs` must match the server name.

Before (Windows):

```json
"playwright-chrome": {
  "command": "cmd",
  "args": ["/c", "npx", "@playwright/mcp@0.0.83",
           "--config", "config/mcp-playwright-chrome.config.json",
           "--secrets", ".env.playwright.all"]
}
```

Now:

```json
"playwright-chrome": {
  "command": "cmd",
  "args": ["/c", "npx", "-y", "-p", "@playwright/mcp@0.0.83",
           "node", "scripts/lanes/playwright-lane.mjs", "playwright-chrome", "@playwright/mcp@0.0.83",
           "--config", "config/mcp-playwright-chrome.config.json"]
}
```

macOS / Linux — before:

```json
"playwright-chrome": {
  "command": "npx",
  "args": ["@playwright/mcp@0.0.83",
           "--config", "config/mcp-playwright-chrome.config.json",
           "--secrets", ".env.playwright.all"]
}
```

macOS / Linux — now:

```json
"playwright-chrome": {
  "command": "npx",
  "args": ["-y", "-p", "@playwright/mcp@0.0.83",
           "node", "scripts/lanes/playwright-lane.mjs", "playwright-chrome", "@playwright/mcp@0.0.83",
           "--config", "config/mcp-playwright-chrome.config.json"]
}
```

The only difference from Windows is at the start: no `"command": "cmd"` and `"/c"`, just `"command": "npx"`. There must be no `--secrets` on any system — the launcher rejects it.

After the edit, restart Claude Code and run `npm run creds:check`: every lane should have the line `✓ lane playwright-… holds what test-accounts.local.json says`. If you see `lanes: none running from scripts/lanes/playwright-lane.mjs` instead, the lanes are still the old ones.

## Working from here on

| Task | What to do |
| --- | --- |
| Find an account's login and password | `test-accounts.local.json` → `envs.<env>.accounts.<NAME>`; accounts that are the same on every env are in the top-level `accounts`. A password `{ "use": "X" }` means "the shared password X from `shared`" |
| Seed new accounts | just run the seeder: it records the login and password of every account it creates. If a password variable has no value yet, the seeder generates a strong one and records it |
| Add an account by hand | under `envs.<env>.accounts` add `"NAME": { "login": "…", "password": "…" }`; suites see `{{NAME_EMAIL}}` and `{{NAME_PASSWORD}}` |
| Sign in in the browser through a lane | type the name with the env: `USER_PASSWORD_VCST`; on a master stand, `MASTER_PASSWORD` |
| Switch env | `npm run env:use -- <env>`; no need to reconnect the lanes |
| After the file changed (a seed, an edit) | reconnect the `playwright-*` lanes in `/mcp` (not while suites are running); `creds:check` tells you which lane is behind |
| Share passwords with a teammate | only the whole file, through the team's secret store; after seeding a shared stand, update the team copy |

Template of the file, names without values: `templates/test-accounts.example.json`.

## What not to do

- Don't put test-account logins and passwords back into `.env.local` or `.env.<env>`: the loader warns about them, and the file wins anyway.
- Don't put tokens, API keys or personal service credentials (Jira, GitHub, Azure DevOps) into `test-accounts.local.json`: the file rejects them. They belong in vc-secrets or `.env.local`.
- Don't commit the file (it is in `.gitignore`), and don't send it or any password in chat or Teams.
- Don't type the password itself or `{{USER_PASSWORD}}` in a lane — only the name `USER_PASSWORD_<ENV>`; the hook blocks the mistake.
- Don't look for or run `npm run secrets:sync` — it no longer exists.

## If something is wrong

| Symptom | What to do |
| --- | --- |
| `[env] N test-account credential(s) still in .env.local …` | `npm run creds:migrate`, then `-- --apply` |
| `test-accounts.local.json is in the older format (version 1)` | `npm run creds:migrate -- --apply` — converts the file |
| Hook: `… was not started by scripts/lanes/playwright-lane.mjs` | the lane started from the old `.mcp.json`: `npm run creds:migrate -- --apply` (rewrites the lanes) and restart Claude Code |
| Hook: `… changed in test-accounts.local.json after this lane started` | reconnect the lane in `/mcp` |
| Hook: `"USER_PASSWORD" is not a name this lane holds` | type the name with the env: `USER_PASSWORD_VCST` |
| `creds:check`: `⚠ vcst: … none for TEST_USER_PASSWORD` | this env has no such password: seed the account or add it to the file |
| `creds:verify`: an account does not sign in | the password in the file does not match the stand: get the current file from the team or reseed the account |
| The migration prints `✗ … differs` or `is lost` | nothing was written; post the output in a comment on this doc (it holds names only) |

The final proof failed? Then the backup stays in `.vc-fix/creds-backup/<time>/` and the migration prints where to restore from — put the old files back from there. After a green migration there is no backup (unless `--keep-backup`).

## Client projects (the vc-init plugin)

In client projects with the plugins `vc-init` 0.8.0 / `vc-fix` 0.19.0 / `vc-test` 0.19.0, the same file is the default store.

1. Update the plugins (`/plugin update`) and restart Claude Code.
2. Run `/project-init --check`: at step M it moves the passwords from `.env.local` and the logins from `.env.<env>` into `test-accounts.local.json`, checks that everything resolves as before, and rewrites the lanes.
3. Type `ADMIN_PASSWORD_<ENV>` — it works for any env. The bare name `ADMIN_PASSWORD` works only on a lane started with `--vc-env` or in a project with a single env; in a project with several envs, a bare name fails to sign in.

Passwords can still be kept in vc-secrets (`--admin-passwords vc-secrets`, `--user-passwords vc-secrets`): the migration leaves those values alone, and they beat the file. Projects whose passwords the host manages (host-governed) do not change.
