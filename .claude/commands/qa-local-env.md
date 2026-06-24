---
description: "Spin up a local Virto Commerce stack via start-local, pinned to the actual deployed manifest (vc-deploy-dev @ vcptcore-demo). With a VCST-XXXX arg, augment the baseline with the module/PR versions the task needs. Backed by the /qa-local-env skill."
argument-hint: "[VCST-XXXX] [--db postgres|mysql|sqlserver]"
disable-model-invocation: true
---

# /qa-local-env — local environment, task-aware

Bring up a full local VC stack (backend + storefront + DB + Redis + Elasticsearch) on this
machine via VirtoCommerce **start-local**, pinned to the **actual deployed package manifest**.
Methodology + helper scripts: the [`/qa-local-env` skill](../skills/testing/qa-local-env/SKILL.md).

## Usage
```
/qa-local-env                          # reproduce the deployed env (vcptcore-demo baseline)
/qa-local-env VCST-5173                # baseline + the modules/PR builds the task needs
/qa-local-env VCST-5173 --db sqlserver # same, on SQL Server (default postgres; also mysql)
```
**Every run is a fresh DB** — provision always wipes the data volumes, so the env is deterministic
(no stale data migrated against a rebuilt image). Seed fixtures with `npm run seed:*`. The expensive
image build is still skipped when the manifest is unchanged; admin is always **`Password1!`**.

## What to do when invoked

1. **Preconditions** — confirm Docker is running + `pwsh` (PowerShell 7) + `vc-build` exist
   (`provision.ps1` runs this preflight too). Bail with the install hint if missing.
2. **Resolve + generate the manifest** —
   - **Baseline (no task arg):** `node .claude/skills/testing/qa-local-env/gen-manifest.mjs --print`.
   - **With `VCST-XXXX`:** `node .claude/skills/testing/qa-local-env/resolve-task.mjs VCST-XXXX --gen --print`.
     resolve-task reads JIRA + GitHub over REST (needs `JIRA_EMAIL`+`JIRA_API_TOKEN` in `.env.local`),
     finds the task's per-PR builds, classifies **backend module** (→ `--prerelease`, fed to gen-manifest)
     vs **frontend theme** (→ a `-FrontendUrl` it prints for the next step), and writes the manifest.
     Show the user the resolved PRs/flags. Capture the printed `-FrontendUrl "<url>"` if present.
3. **Provision** (run via background mode — heavy) —
   `pwsh -File .claude/skills/testing/qa-local-env/provision.ps1 -Action up -Manifest .local-env/packages.custom.json`
   (map `--db` → `-DbProvider`; add `-FrontendUrl "<url>"` from step 2 if the task had a frontend PR build).
   provision rebuilds iff the manifest changed, brings the stack `down`, **always wipes the data
   volumes** (fresh DB every run), starts, then runs `init-admin.mjs` LAST (admin → `Password1!`,
   writes `.env.local`). Comes up **without catalog data** — seed via `npm run seed:*`.
4. **Health-check** —
   `node .claude/skills/testing/qa-local-env/healthcheck.mjs --token --password 'Password1!'`; for a
   task, add a `--graphql` schema probe of the task's new field. Report UP/DOWN per endpoint.
5. **Wire env** — set `TEST_ENV=localhost` (the committed `.env.localhost` profile targets the local
   ports; `ADMIN_PASSWORD_LOCALHOST=Password1!` was already written to `.env.local` by init-admin).
   Offer `npm run seed:configurable` if the task needs a configurable product.

## Rules
- This command has side effects (Docker build + containers) — it never runs automatically.
- Single machine only; the stack is local. Never push the generated manifest or `.local-env/` (gitignored).
- Heavy steps (first build ~minutes, ~2.3 GB platform image) — run `provision.ps1` via the harness's
  background mode and report progress, don't block. provision emits a **heartbeat** line every
  `-HeartbeatSec` s (default 60) on the silent steps (build + `/health` wait) and routes the raw docker
  download spam to `.local-env/.provision-<phase>.log`; poll an in-flight run from another shell with
  `provision.ps1 -Action monitor` (read-only snapshot). Verified end-to-end on 2026-06-24.
- Local OAuth uses **no** `client_id`; admin is **`Password1!`** after init-admin (seed `store` fails
  the platform password policy on change). `healthcheck.mjs` / `init-admin.mjs` handle this.
