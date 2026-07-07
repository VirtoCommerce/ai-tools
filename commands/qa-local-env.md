---
description: "Spin up a local Virto Commerce stack via start-local, pinned to the actual deployed manifest (vc-deploy-dev @ vcptcore-demo). With a VCST-XXXX arg, augment the baseline with the module/PR versions the task needs. backend-only / frontend-only modes + latest/alpha theme supported. Backed by the /qa-local-env skill."
argument-hint: "[VCST-XXXX] [postgres|mysql|sqlserver] [backend-only|frontend-only] [latest|alpha]"
disable-model-invocation: true
---

# /qa-local-env — local environment, task-aware

Bring up a full local VC stack (backend + storefront + DB + Redis + Elasticsearch) on this
machine via VirtoCommerce **start-local**, pinned to the **actual deployed package manifest**.
Methodology + helper scripts: the [`/qa-local-env` skill](../skills/qa-local-env/SKILL.md).

## Usage
```
/qa-local-env                          # reproduce the deployed env (vcptcore-demo baseline) — FULL stack
/qa-local-env VCST-5173                # baseline + the modules/PR builds the task needs
/qa-local-env VCST-5173 sqlserver      # same, on SQL Server (postgres only for a NEW env; also mysql)
/qa-local-env sqlserver                # baseline on SQL Server
/qa-local-env backend-only             # platform + db + es + redis only (no frontend, no kibana)
/qa-local-env frontend-only            # ONLY vc-frontend, proxied to a remote env (asks which one)
/qa-local-env VCST-5344 frontend-only  # local theme from the task's PR, API → chosen remote env
/qa-local-env latest                   # full stack with the latest GA storefront theme (clean x.y.z)
/qa-local-env alpha                    # full stack with the newest alpha theme (the build vcst-dev runs)
/qa-local-env alpha frontend-only      # newest alpha theme, proxied to a chosen remote env
```
**DB provider** is just a bare word — `postgres` (default for a NEW env) | `mysql` | `sqlserver` — in
any position; the legacy `--db <provider>` form is still accepted. Anything matching `VCST-\d+` is the
task; the rest is the provider. **The provider is kept** across runs: on an already-bootstrapped env it
is honoured only when you pass it explicitly, so a bare re-run never re-bootstraps just to flip engines.

**Theme channel** is a bare word too — `latest` | `alpha` — for the vc-frontend storefront theme.
Resolve it with `node skills/qa-local-env/resolve-theme.mjs <latest|alpha> --url` and
pass the printed ZIP URL as provision's `-FrontendUrl`. `latest` = newest GA release (`vc-theme-b2b-vue-x.y.z`);
`alpha` = newest rolling alpha build (`…-alpha.NNNN`, the build `vcst-dev` runs). Both come from the
**vc3prerelease blob** (the same anonymous `packages` container CI publishes every theme to). A
`VCST-XXXX` task's own PR theme still wins over a channel keyword (resolve-task → `-FrontendUrl`); a
specific PR build is `resolve-theme.mjs pr <N>`. Works in both full and `frontend-only` modes.

**Launch mode** is a bare word too — `backend-only` | `frontend-only` (mutually exclusive; default =
full stack). Map it to provision's `-Mode backend|frontend`. **backend-only** = platform + db + es +
redis (no frontend container; kibana off unless `-IncludeKibana`); same build + fresh-DB + admin path
as full. **frontend-only** = ONLY the vc-frontend container with a generated nginx config (local theme
+ API proxied to a remote env); needs a bind target (next section). The repo stays clean — WorkDir +
vc-build's `.nuke` live under `%TEMP%/vc-local-env` (override provision's `-BaseTempDir`).
**Fresh DB by default** — provision wipes the data volumes, so the env is deterministic (no stale data
migrated against a rebuilt image). Seed fixtures with `npm run seed:*`. **Image build is skipped when
the manifest is unchanged, and reused from a per-manifest cache** when you switch back to a manifest you
already built (baseline↔task) — no multi-minute rebuild. Pass `-KeepData` for a fast **warm restart**
(reuses the existing DB) — honoured only when the live image is unchanged; any rebuild forces a wipe.
Admin is always **`Password1!`**.

## What to do when invoked

> **Mode routing first.** If the args contain `frontend-only` → jump to the **frontend-only flow**
> below (no manifest, no platform build). If `backend-only` → run the normal flow with provision
> `-Mode backend` (skip the storefront in step 4; nothing else changes). Otherwise = full stack.

1. **Preconditions** — confirm Docker is running + `pwsh` (PowerShell 7) + `vc-build` exist
   (`provision.ps1` runs this preflight too). Bail with the install hint if missing.
2. **Resolve + generate the manifest** —
   - **Baseline (no task arg):** `node skills/qa-local-env/gen-manifest.mjs --print`.
   - **With `VCST-XXXX`:** `node skills/qa-local-env/resolve-task.mjs VCST-XXXX --gen --print`.
     resolve-task reads JIRA + GitHub over REST (needs `JIRA_EMAIL`+`JIRA_API_TOKEN` in `.env.local`),
     finds the task's per-PR builds, classifies **backend module** (→ `--prerelease`, fed to gen-manifest)
     vs **frontend theme** (→ a `-FrontendUrl` it prints for the next step), and writes the manifest.
     Show the user the resolved PRs/flags. Capture the printed `-FrontendUrl "<url>"` if present.
3. **Provision** (run via background mode — heavy) —
   `pwsh -File skills/qa-local-env/provision.ps1 -Action up -Manifest .local-env/packages.custom.json`
   (map the DB provider — a bare `postgres|mysql|sqlserver` token, or the legacy `--db <provider>` — to
   `-DbProvider` only if switching engines; add `-FrontendUrl "<url>"` from step 2 if the task had a
   frontend PR build, **or** from a `latest`/`alpha` theme keyword via
   `resolve-theme.mjs <latest|alpha> --url` — a task PR theme wins over a channel keyword;
   add `-KeepData` only for a deliberate warm restart).
   provision rebuilds iff the manifest changed (else reuses the per-manifest image cache), brings the
   stack `down`, wipes the data volumes (fresh DB unless `-KeepData` + unchanged image), starts, then
   runs `init-admin.mjs` LAST (admin → `Password1!`, writes `.env.local`). Comes up **without catalog
   data** — seed via `npm run seed:*`.
4. **Health-check** —
   `node skills/qa-local-env/healthcheck.mjs --token --password 'Password1!'`; for a
   task, add a `--graphql` schema probe of the task's new field. Report UP/DOWN per endpoint.
5. **Wire env** — set `TEST_ENV=localhost` (the committed `.env.localhost` profile targets the local
   ports; `ADMIN_PASSWORD_LOCALHOST=Password1!` was already written to `.env.local` by init-admin).
   Offer `npm run seed:configurable` if the task needs a configurable product.

## Frontend-only flow (`frontend-only`)

Brings up ONLY the vc-frontend container, proxied to a remote env — local theme (the fix) + real
remote data/config. No manifest, no platform/db/es build.

1. **Pick the bind target** — build the menu **automatically from the `.env.*` profiles that define a
   `BACK_URL`** (`.env.vcst`, `.env.vcptcore`, `.env.virtostart`, `.env.vcptcore_qa1`). Exclude
   `.env.localhost`, but offer a **"custom BACK_URL"** option (for binding to a local `backend-only`
   stack → `http://localhost:8090`). Ask the user via the question tool. From the chosen profile read
   **`BACK_URL`** (→ `-BindBackendUrl`) and **`STORE_ID`** (→ `-BindStoreId`) so the theme's store id
   matches the remote.
2. **Resolve the theme** (priority): explicit `-FrontendUrl <zip>` → with `VCST-XXXX`, the task's PR
   theme (`resolve-task.mjs VCST-XXXX` → its `-FrontendUrl`) → a `latest`/`alpha` channel keyword
   (`resolve-theme.mjs <latest|alpha> --url` → `-FrontendUrl`) → else the latest vc-frontend GitHub
   release (provision's default; nothing to pass).
3. **Provision** (background — the theme image build can take a minute) —
   `pwsh -File skills/qa-local-env/provision.ps1 -Action up -Mode frontend -BindBackendUrl "<BACK_URL>" -BindStoreId "<STORE_ID>" [-FrontendUrl "<zip>"]`.
   provision generates the nginx config (local `/` + static, remote API), runs `virtolocal-frontend-only`
   on port 80, validates `nginx -t`, then health-checks (storefront 200 + proxied `/graphql` returns
   the remote env's data + the `X-VC-Local-Theme` build-marker matches).
4. **Verify + hand off** — report the storefront link (`http://localhost`) and the bound backend.
   Run the STR against the local theme with `qa-frontend-expert`. Teardown: `-Action stop` (removes
   the `virtolocal-frontend-only` container **and** brings down the main stack if one is up — `stop`
   always runs both, so it also tears down a `backend-only` env you may have bound to).

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
