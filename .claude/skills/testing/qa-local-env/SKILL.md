---
name: qa-local-env
description: Bring up a local Virto Commerce stack (backend + storefront + DB + ES) via start-local, pinned to the ACTUAL deployed package manifest (vc-deploy-dev @ vcptcore-demo); optionally augment it with the module/PR versions a JIRA task needs. Use when asked to spin up / run / provision a local VC environment, reproduce a deployed env locally, or stand up an env to test a specific ticket.
---

# /qa-local-env — local VC environment, task-aware

Spin up a **full local Virto Commerce stack** on this machine and (optionally) pin it to the
exact module set a task needs.

- **No task arg** → reproduce the **actual deployed environment**: the baseline is the real
  `backend/packages.json` of a deploy branch (`vc-deploy-dev @ vcptcore-demo`).
- **With a task arg** (`VCST-XXXX`) → take that baseline and **augment** it with the versions
  the task requires (released bumps + per-PR pre-release builds), then bring it up.

**Launch modes** (mutually exclusive; default = full stack):

| Mode | Bare word | Brings up | Health | Use for |
|------|-----------|-----------|--------|---------|
| **full** (default) | — | platform + db + es + redis + kibana + frontend | /health + storefront | Full local reproduction |
| **backend** | `backend-only` | platform + db + es + redis (kibana OFF unless `-IncludeKibana`); **no frontend** | /health + OAuth token | API / Admin / module work — lighter |
| **frontend** | `frontend-only` | **only** the vc-frontend container; nginx proxied to a **remote** env | storefront 200 + proxied `/graphql` returns the env's data + **theme build-marker** | Storefront/theme (the fix) against real remote data — the Gate-6 hybrid |

`frontend-only` is the hybrid from the `local-frontend-proxied-to-qa-backend` memory, productised: local theme (the fix) + a remote env's real data/config. The repo stays clean — the WorkDir and vc-build's `.nuke` live under a stable temp path (`%TEMP%/vc-local-env`, override `-BaseTempDir`), not the git tree.

Engine: VirtoCommerce **start-local** (Docker Compose + PowerShell 7). This skill never
re-implements it — it generates the manifest, drives start-local non-interactively, and
health-checks the result.

> Verified end-to-end on 2026-06-24 (Windows 11 / Docker 29.5 / pwsh 7.6 / vc-build + .NET 10):
> built the vcptcore-demo baseline + the VCST-5173 xCart PR build, brought the full stack up
> (6 containers), and confirmed the new `configurationSection` field resolves. The flags and
> paths below reflect that working run, not a draft.

## Prerequisites

- **Docker Desktop** running, **PowerShell 7** (`pwsh`), **.NET SDK** + **vc-build**
  (`dotnet tool install VirtoCommerce.GlobalTool -g`), ~5 GB free disk.
- Node 18+ (for the two `.mjs` helpers). No extra npm deps.
- Files land in a gitignored working dir: `<repo>/.local-env/`. The **only** write outside it is
  `ADMIN_PASSWORD_LOCALHOST` upserted into the gitignored `<repo>/.env.local` (so the QA tooling can
  authenticate) — by design, never a tracked file.

## The pipeline

```
(resolve)        JIRA task ──► required modules/versions + PR pre-release ZIPs   [agentic, only with a task arg]
   │
gen-manifest ──► fetch baseline (vcptcore-demo) + merge requirements ──► .local-env/packages.custom.json
   │
provision   ──► bootstrap → build IF manifest changed (else reuse per-manifest image cache) → down
   │            → wipe data (unless -KeepData + unchanged image) → start
   │            → init-admin (store→Password1!, writes .env.local)                  [PowerShell + Docker]
   │
healthcheck ──► /health + storefront + OAuth (admin/Password1!) + optional GraphQL field probe
   │
wire env    ──► TEST_ENV=localhost  (.env.localhost → local ports; ADMIN_PASSWORD_LOCALHOST in .env.local)
```

Behaviour contract: the stack is **rebuilt only when the manifest (or frontend ZIP) changed**
(gen-manifest re-fetches the live baseline each run, so upstream version drift triggers a rebuild).
Each successful build is snapshotted under a **per-manifest cache tag** (`vc-platform:cache-<hash>`);
switching back to a manifest you already built (baseline↔task) **retags the cached image live instead
of rebuilding** — no multi-minute restore. **Fresh DB by default** — provision wipes the data volumes
(DB + search index + cache) so the env is deterministic; pass **`-KeepData`** for a fast warm restart
that reuses the existing DB, honoured **only when the live image is unchanged** (any rebuild/cache-retag
forces a wipe, for schema + module-DLL safety). On a fresh DB the admin password is changed from the
seed `store` to **`Password1!`** and written to `.env.local`. The inputs are the optional `VCST-XXXX`
task and the DB provider — a bare `postgres|mysql|sqlserver` token (default postgres **only for a new
env**; the bootstrapped engine is **kept** on re-runs unless you pass a provider explicitly; legacy
`--db <provider>` still accepted).

### 1. Resolve the task (only with a task arg — deterministic)

`resolve-task.mjs` turns a JIRA key into build inputs over REST — no hand-reading the ticket:

```bash
node .claude/skills/testing/qa-local-env/resolve-task.mjs VCST-5173
node .claude/skills/testing/qa-local-env/resolve-task.mjs VCST-5173 --gen --print   # also run gen-manifest
```
It (1) fetches the issue + comments + GitHub dev-status, collecting linked PRs from the dev-status
API **and** a regex over the description/comments; (2) reads each PR body and extracts the CI
pre-release `Artifact URL` from the `vc3prerelease` blob; (3) classifies each:
- **backend module** (`VirtoCommerce.X_<ver>.zip`) → `--prerelease VirtoCommerce.X=<ver>` (for gen-manifest),
- **frontend theme** (`vc-frontend` PR / `vc-theme-*.zip`) → `-FrontendUrl <url>` (for provision),
- deploy / docs / artifact-less PRs → skipped.

**Env:** `JIRA_EMAIL` + `JIRA_API_TOKEN` in `.env.local` (same Atlassian account, else 401) +
`GIT_TOKEN`. Prose prerequisites ("Catalog 3.1028.0+") are NOT parsed — the baseline almost always
satisfies them; pass a genuine bump explicitly via `--require <Id>=<ver>` / `--platform <ver>`
(forwarded to gen-manifest). Worked example VCST-5173 resolves to `VirtoCommerce.XCart=3.1022.0-pr-122-972d`
(backend) **and** the `vc-theme-b2b-vue-2.52.0-pr-2327-*` frontend build.

### 2. Generate the manifest (deterministic)

```bash
# baseline only (reproduce vcptcore-demo exactly)
node .claude/skills/testing/qa-local-env/gen-manifest.mjs --print

# with task augmentation (flags from the resolve step)
node .claude/skills/testing/qa-local-env/gen-manifest.mjs \
  --prerelease VirtoCommerce.XCart=3.1022.0-pr-122-972d \
  --require VirtoCommerce.Catalog=3.1028.0 \
  --platform 3.1034.0 --print
```
Merge rules: released → `GithubReleases` source; PR build → `AzureBlob` (vc3prerelease) source
with the Id removed from `GithubReleases` (no duplicate). `--require`/`--platform` only ever raise,
never lower. Offline? `--baseline-file <path>`. Other env? `--branch <deploy-branch>`.

> **Version-switch tests:** the `vcptcore-demo` baseline usually already tracks the **latest** release
> of every module + platform, so `--require <Id>=<higher>` is typically a no-op (there's nothing higher).
> For a deterministic switch use **`--set <Id>=<exact version>`** (raises *or* lowers). Switch a **leaf**
> module (no dependents — e.g. a payment/shipping provider like `VirtoCommerce.Datatrans`); switching a
> module that others depend on *below* their requirement builds fine but leaves the platform 503
> ("Some modules have errors").

### 3. Provision (PowerShell + Docker)

```powershell
pwsh -File .claude/skills/testing/qa-local-env/provision.ps1 -Action up `
  -Manifest .local-env/packages.custom.json
# SQL Server:  … -Action up -Manifest .local-env/packages.custom.json -DbProvider sqlserver
# warm restart: … -Action up -Manifest .local-env/packages.custom.json -KeepData
# backend-only: … -Action up -Manifest .local-env/packages.custom.json -Mode backend [-IncludeKibana]
# frontend-only: -Action up -Mode frontend -BindBackendUrl https://vcst-qa.govirto.com [-FrontendUrl <zip>] [-BindStoreId B2B-store]
# lifecycle:   -Action bootstrap | build | start | stop | clean | remove | status | monitor
# options:     -DbProvider postgres|mysql|sqlserver  -KeepData  -FrontendUrl <zip>  -Mode full|backend|frontend
#              -IncludeKibana  -BindBackendUrl <url>  -BindStoreId <id>  -BaseTempDir <path>  -HeartbeatSec <n>  (-Branch <start-local tooling branch>, internal)
```

**Launch modes (see the table above).** `-Mode` is mutually exclusive; the command maps the bare
words `backend-only`/`frontend-only` to it. **backend-only** starts platform + db + es + redis only
(no frontend container; kibana off unless `-IncludeKibana`) and reuses the same build + fresh-DB +
init-admin path as full. **frontend-only** runs ONLY the vc-frontend container with a **generated**
nginx config (no manual `sed`): `location /` + static stay local (= the theme), while `/graphql`,
`/connect/token`, `/files`, `/cms-content`, `/revoke/token`, `/api/files`, `/hub/` are proxied to
`-BindBackendUrl` (https targets get a rewritten `Host` + `proxy_ssl_server_name on`; a `localhost`
backend is reached via `host.docker.internal`). The config is generated on the host and bind-mounted
read-only into a standalone container (`virtolocal-frontend-only`), then validated with `nginx -t`.

- **Bind target**: the agent asks which env to bind to and resolves `BACK_URL`+`STORE_ID` from the
  `.env.*` profiles (see step 0 below). `-BindBackendUrl` is REQUIRED to start a frontend-only env.
- **Theme** (priority): `-FrontendUrl <zip>` explicit → the task's PR theme (`VCST-XXXX`) → **latest
  vc-frontend GitHub release** (start-local's native default). The build is frontend-only — it skips
  the heavy platform build and reuses a per-theme image cache (`vc-frontend:cache-fe-<hash>`).
- **Theme build-marker**: the generated nginx adds an `X-VC-Local-Theme: fe-<hash>` header on `/`;
  healthcheck asserts it — a match proves `/` is the LOCAL theme of the expected build (not the
  remote storefront), while the proxied `/graphql` proves the API is the bound remote env.
**Numbered steps + per-step verdict.** Each phase prints a numbered header (`━━ Step N · <title>`) and
closes with a coloured verdict + elapsed (`✅/⚠️/❌ Step N done · mm:ss`). The verdict auto-escalates to
the worst inner mark — a single ⚠️ makes the whole step yellow, a ❌ makes it red. Inner marks: ✅ green
(pass) · ⚠️ yellow (advisory) · ❌ red (fail) · `·` grey (info) · `•` sub-action. `up`/`start`/`status`
close with a **report banner**: overall verdict, the storefront + backend links, a per-container table,
the DB mode (fresh/warm), and the next wire-up step. (UTF-8 console output is forced so the marks
survive redirection to a log file.)

**Progress monitoring on long steps.** The long, otherwise-silent steps (the docker build, the
post-start `/health` wait) route the child's thousands of raw download lines to a per-phase log file
(`.local-env/.provision-<phase>.log`) and emit ONE concise status line — `⏱ [hh:mm:ss] <phase>: <signal>`
— every `-HeartbeatSec` seconds (default **60**; `0` disables). The signal names what's happening:
running-container count (start phase) → **download size `X / Y`** or **buildkit stage `[n/total]`**
(build/pull phase) → last meaningful log line. On failure the log tail is printed inline. To poll an **in-flight** run from another shell (read-only, never touches the stack):
```powershell
pwsh -File .claude/skills/testing/qa-local-env/provision.ps1 -Action monitor
# → visual snapshot: current phase + last log line, image presence, container marks, /health
```
`up` = bootstrap (once) → build **iff manifest changed** (else reuse the per-manifest image cache) →
`down` (frees ports) → **wipe data volumes** (fresh DB; skipped only with `-KeepData` + unchanged image)
→ start → init-admin. start-local refuses to start when its ports are busy,
so provision always brings the stack `down` before starting. A different `-DbProvider` than the env
was bootstrapped with is detected and auto-re-bootstrapped for the new engine. Endpoints: storefront
`http://localhost:80`, platform/Admin/xAPI `http://localhost:8090` (`admin`/`Password1!`).

### 4. Health-check (+ task field probe)

```bash
node .claude/skills/testing/qa-local-env/healthcheck.mjs --token   # password auto-resolves (see below)
# task probe (VCST-5173): confirm the redesign fields exist in the live schema (no data/token needed)
node .claude/skills/testing/qa-local-env/healthcheck.mjs \
  --graphql '{ __type(name: "CartConfigurationItemType") { fields { name } } }'
# verify a pinned pre-release is ACTUALLY loaded (resolve-task prints the exact flags)
node .claude/skills/testing/qa-local-env/healthcheck.mjs --token \
  --expect-module VirtoCommerce.XCart=3.1022.0-pr-122-972d
# name any module that failed to load/validate (the cause of a 503 /health after a bad version switch)
node .claude/skills/testing/qa-local-env/healthcheck.mjs --token --module-errors
```
**Password:** `--password` is optional now — it defaults to `$ADMIN_PASSWORD`, else
`ADMIN_PASSWORD_LOCALHOST` from `.env.local` (written by init-admin), else the local convention
`Password1!`. (Schema/introspection probes need no token at all.) **Fast-fail:** the `/health` wait
gives up early on a persistent **503** (service up but unhealthy — e.g. module errors) instead of
burning the full `--timeout`. **`--module-errors`** lists modules with load/validation errors —
provision runs it automatically after start (`Test-ModuleHealth`).
Required checks: `/health` + storefront. OAuth + GraphQL are advisory unless a query is given.
**Verify the pin loaded — don't trust the build log.** `--expect-module Id=Version` queries
`/api/platform/modules` and compares. A pre-release artifact's `module.manifest` is **often not
version-bumped** (the `-pr-…` suffix lives only in the artifact *filename*), so the platform may
report the base/released version (e.g. pins `3.1022.0-pr-122-972d`, reports `3.1021.0`). That
mismatch is a **loud advisory**, not a hard fail — the PR binaries are likely loaded; **confirm by
behaviour/schema (`--graphql` probe of the new field), not the version number**. A **missing**
module is a hard failure. provision runs this check automatically (`Test-PinnedModules`).
**Auth (verified):** the local platform issues the OAuth password grant with **NO `client_id`**
(sending the remote-QA `internal-frontend` returns `invalid_client`); healthcheck.mjs omits it by
default. After provision's init-admin step the admin password is **`Password1!`** (the seed `store`
is rejected by the platform's password policy on change — 8+ chars + uppercase — so `Password1!` is
the policy-compliant target). GraphQL **introspection is anonymous**, so a schema field probe needs
no token.

### 5. Wire the QA tooling to the local stack

The committed **`.env.localhost`** profile already points at the local ports
(`FRONT_URL=http://localhost`, `BACK_URL=http://localhost:8090`, `ADMIN=admin`). To use it:

```powershell
$env:TEST_ENV = "localhost"
```
provision's init-admin step already wrote `ADMIN_PASSWORD_LOCALHOST=Password1!` to **`.env.local`**
(gitignored; config.js promotes the `_LOCALHOST` suffix when `TEST_ENV=localhost`). Add
`USER_EMAIL`/`USER_PASSWORD_LOCALHOST` there too for storefront-user suites. Then any existing skill
(`/qa-test`, `/qa-regression`, the GraphQL runner) runs against the local stack. Validate with
`npm run env:check` or `/qa-env-check`.

### Seeding data

Every run comes up on a **fresh, empty DB** (no catalog data). Populate it with the **repo seeders**:
`npm run seed:catalog` / `seed:configurable` / `seed:b2b` … (see `/qa-seed-data`). They create clean
fixtures compatible with the pinned module versions and authenticate via `TEST_ENV=localhost`
(`Password1!`). For VCST-5173's configurable product (Text/Product/File sections) use
`npm run seed:configurable`.

> start-local's own demo importer was dropped from this skill — the bundled demo is unreliable against
> newer pinned module versions (e.g. Catalog rejects the sample property name `NFC_`). Use the repo
> seeders, which stay compatible.

## Worked example — VCST-5173 (`[Cart] Configurable products redesign`)

Requirements (from the dev's QA Test Plan comment): xCart from PR **vc-module-x-cart#122**,
Catalog ≥ 3.1028.0, Platform ≥ 3.1034.0. Baseline `vcptcore-demo` already has Platform **3.1039.0**
and Catalog **3.1029.0** (both satisfied) and XCart **3.1021.0** (released). So the only change is
the XCart PR pin:

```bash
node .claude/skills/testing/qa-local-env/gen-manifest.mjs \
  --prerelease VirtoCommerce.XCart=3.1022.0-pr-122-972d --print
# → removes XCart 3.1021.0 from GithubReleases, adds {BlobName: VirtoCommerce.XCart_3.1022.0-pr-122-972d.zip}
#   to the AzureBlob (vc3prerelease) source
pwsh -File .claude/skills/testing/qa-local-env/provision.ps1 -Action up -Manifest .local-env/packages.custom.json
# verify the PR redesign is in the live schema (no data needed, introspection is anonymous):
node .claude/skills/testing/qa-local-env/healthcheck.mjs \
  --graphql '{ __type(name: "CartConfigurationItemType") { fields { name } } }'
```
**Version caveat (verified 2026-06-24, re-checked later):** this PR's pre-release `module.manifest`
is **not** version-bumped — the platform reports XCart **`3.1021.0`** (same as the release), even
though the loaded binaries ARE the PR #122 build (DLL built 2026-06-20). So `--expect-module
VirtoCommerce.XCart=3.1022.0-pr-122-972d` reports a **version mismatch** (advisory): do not trust the
number, trust the schema. The redesign flattened the type — `CartConfigurationItemType` now exposes
`sectionId`, `type`, `selectedForCheckout`, `customText`, `files`, `salePrice` (no nested
`configurationSection` object). Confirm whatever field the *current* PR adds, not a stale field name.
To exercise it against real data — after seeding and configuring a product into a cart:
```graphql
{ cart(storeId: "B2B-store", cultureName: "en-US", currencyCode: "USD") {
    items { configurationItems { id sectionId type customText selectedForCheckout } } } }
```

## Verified facts & gotchas (Phase 0, 2026-06-24)

- **Pre-release pins are NOT distinguishable by version** — see the Version caveat above. The CI
  artifact filename carries `-pr-N-sha` but `module.manifest` often keeps the un-bumped base version,
  so `/api/platform/modules` reports the released number. provision auto-runs `--expect-module`
  (`Test-PinnedModules`) and flags this loudly; the real confirmation that the PR code is loaded is a
  behaviour/schema `--graphql` probe, not the version. resolve-task prints both the `--expect-module`
  flags and a reminder to probe the schema.
- **Admin lockout from the module-check probe — prevented.** start-local's post-start "Checking
  installed modules" probe authenticates with the seed `store`. Since every run starts on a fresh DB,
  the seed password IS `store`, so the probe succeeds — but to be safe provision still patches the
  probe (`check-installed-modules.ps1`) to honour `$env:VC_MODULECHECK_PASSWORD` and sets it to `store`
  before start, so the probe never fails-and-locks before `init-admin` rotates the password to
  `Password1!`. (The old preserved-DB lockout self-heal is gone — there are no preserved DBs anymore.)
- **start-local refuses to start if a port is busy**, and the OS can lag freeing a just-removed
  container's port (seen on ES `:9200`) right after `down` → a spurious start failure. provision waits
  the ports out (`Wait-PortsFree`) before starting.
- **start-VC-solution's exit code is not authoritative** — its seed-password module probe can make it
  exit 1 even when the platform is healthy. provision runs it `-AllowFail` and gates on the real
  `/health` (`Wait-PlatformReady`) instead.
- **Everything lives in `<WorkDir>/VirtoLocal/`** (start-local's default basename). provision.ps1 runs
  all start-local scripts from `<WorkDir>` with the basename `VirtoLocal`, never a nested path — the
  docker compose project name resolves to `virtolocal` and the platform container is
  `virtolocal-vc-platform-web-1` (which `start-VC-solution`'s module check expects). A nested path
  breaks the container-name derivation.
- **The start-local scripts prompt** (`Read-Host`): `VirtoLocal_create_local_files.ps1` (vc-build
  update / proceed-build) and `build-VC-solution.ps1` (frontend URL / proceed-run). provision.ps1
  feeds them via piped stdin and always passes `-customFrontendUrl ""`. Don't call them on a bare
  `-NonInteractive` shell without stdin.
- **`pwsh -File` passes args as strings**, so a `[bool]` param (e.g. `-skipSampleData`) rejects even
  `"0"`/`"1"`. provision.ps1 calls the non-prompting lifecycle scripts **in-process** (`& script @splat`)
  with typed booleans; only the prompting scripts go through `pwsh -File`.
- **`vc-build install` consumes the deploy manifest as-is** — it builds the platform from
  `PlatformVersion` (3.1039.0) and ignores the deploy-only fields (`ManifestVersion`, `PlatformImage`,
  `PlatformImageTag`). All 82 GithubReleases modules installed cleanly.
- **AzureBlob pre-release entries are keyed by `BlobName`**, not `{Id,Version}` (verified — see the
  manifest section). The vc3prerelease blob is anonymous-readable; no Azure token needed.
- **First build is heavy** (~2.3 GB platform image, `docker build --no-cache`, several minutes);
  module install + first start (DB migration) add a few more. Subsequent `start`/`stop` are fast.
  **Why a re-run can still rebuild:** switching baseline↔task (or task↔task) changes module versions
  → a different manifest → a legitimate rebuild. The **per-manifest image cache** (`*:cache-<hash>`,
  newest 4 kept per repo) avoids this on the *second* visit to a manifest — it retags the prior image
  live instead of rebuilding. The big *recurring* cost is the **fresh-DB migration** on every start
  (83-module init); use `-KeepData` (warm DB, same-image only) when you don't need a pristine DB.
- **`.env.localhost`** is the local profile (`TEST_ENV=localhost`) — do NOT create `.env.localdocker`;
  `.env.local` is the gitignored secrets file, not an env profile.
- **`-DbProvider` only binds at bootstrap, and is kept on re-runs.** start-local bakes the DB engine
  into the generated `docker-compose.yml` + `.env`. provision records the bootstrapped engine in
  `.local-env/.bootstrapped-db.txt` (fallback: `DB_PROVIDER` in the generated `.env`). On a re-run it
  **keeps that engine unless you pass `-DbProvider` explicitly** (so a bare re-run never re-bootstraps
  just to honour the `postgres` default). An *explicit* switch auto-tears-down + re-bootstraps for the
  new engine (the DB is wiped anyway). `-Action remove` clears the marker so the next `up` bootstraps fresh.

## Teardown

```powershell
pwsh -File .claude/skills/testing/qa-local-env/provision.ps1 -Action stop     # pause: containers down, files + cache kept
pwsh -File .claude/skills/testing/qa-local-env/provision.ps1 -Action clean    # stop + wipe data volumes (fresh DB next start)
pwsh -File .claude/skills/testing/qa-local-env/provision.ps1 -Action remove   # destroy containers + volumes + temp files
```
- **stop** = pause. Data volumes + temp files + image cache untouched. Brings **both** down: the main
  compose stack (`stop-VC-solution`) **and** the standalone `virtolocal-frontend-only` container when
  present — `stop` always runs both, so a `frontend-only` env bound to a live local `backend-only` stack
  tears down the backend too. Stop only the frontend by removing its container directly
  (`docker rm -f virtolocal-frontend-only`) if you need to keep the backend up.
- **remove** = full teardown of the *run*: removes containers + volumes, deletes the temp WorkDir and
  any stray `.nuke`, but **KEEPS** the per-manifest/per-theme image cache (`vc-platform`/`vc-frontend:cache-*`)
  so the next `up` rebuilds fast. (To reclaim that disk, `docker image prune` the `cache-*` tags manually.)
- The WorkDir + `.nuke` default to `%TEMP%/vc-local-env` (override `-BaseTempDir`) — nothing is written
  into the repo. The OS may clear `%TEMP%` on reboot, losing only the rebuild-skip fingerprints (Docker
  images survive → at most one extra rebuild); use `-BaseTempDir ~/.vc-local-env` if you need it to persist.
