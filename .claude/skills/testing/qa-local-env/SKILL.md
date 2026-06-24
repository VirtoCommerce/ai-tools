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
provision   ──► bootstrap → build IF manifest changed → down → [wipe data if -Clean] → start
   │            → init-admin (store→Password1!, writes .env.local)                  [PowerShell + Docker]
   │
healthcheck ──► /health + storefront + OAuth (admin/Password1!) + optional GraphQL field probe
   │
wire env    ──► TEST_ENV=localhost  (.env.localhost → local ports; ADMIN_PASSWORD_LOCALHOST in .env.local)
```

Behaviour contract: the stack is **rebuilt only when the manifest changed** (gen-manifest re-fetches
the live baseline each run, so upstream version drift triggers a rebuild; `-Rebuild` forces one).
**DB data persists by default** across runs; `-Clean` wipes all data volumes for a fresh DB. On a
fresh DB the admin password is changed from the seed `store` to **`Password1!`** (idempotent on a
preserved DB) and written to `.env.local`.

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
# fresh DB:  … -Action up -Manifest .local-env/packages.custom.json -Clean
# lifecycle: -Action bootstrap | build | start | stop | clean | remove | status
# options:   -Clean (wipe all data volumes)  -Rebuild (force build)  -WithSampleData (demo import, best-effort)
#            -DbProvider postgres|mysql|sqlserver  -FrontendUrl <zip>
```
`up` = bootstrap (once) → build **iff manifest changed** → `down` (frees ports, keeps volumes) →
`[wipe data if -Clean]` → start → init-admin. start-local refuses to start when its ports are busy,
so provision always brings the stack `down` before starting. Endpoints: storefront
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

The stack comes up **without catalog data** by default. Two ways to populate it:

- **Repo seeders (reliable, recommended):** `npm run seed:catalog` / `seed:configurable` / `seed:b2b` …
  (see `/qa-seed-data`). They create clean fixtures compatible with the pinned module versions and
  authenticate via `TEST_ENV=localhost` (`Password1!`). For VCST-5173's configurable product
  (Text/Product/File sections) use `npm run seed:configurable`.
- **start-local demo import (opt-in, best-effort):** `provision.ps1 -Action up … -WithSampleData`.
  Installs the full VC demo on a fresh DB, but the bundled demo can fail against newer module
  versions — observed 2026-06-24: Catalog import rejects a sample product property named `NFC_`
  (must start/end with a letter or digit), so the demo catalog does not fully land. provision warns
  and continues. Prefer the repo seeders unless you specifically want the full demo store.

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
- **Re-running over a PRESERVED DB used to lock the admin account — now prevented.** start-local's
  post-start "Checking installed modules" probe authenticates with the seed `store`; once a prior
  init-admin rotated admin to `Password1!`, those failures tripped Identity lockout (15-min, `Lockout`
  in appsettings) AND the platform cached the locked user, so init-admin then failed with the *correct*
  password. **Prevention (current):** provision patches the probe (`check-installed-modules.ps1`) to
  honour `$env:VC_MODULECHECK_PASSWORD` and sets it to the password the probe will actually meet
  (`store` on a fresh DB, `Password1!` on a preserved one) — so the probe succeeds and never locks,
  and re-runs skip the costly restart. **Fallback (kept):** if a lock still happens (e.g. an
  externally-created DB with a different admin password), `Initialize-Admin` on a non-fresh DB clears
  `LockoutEnd`/`AccessFailedCount` in `vc-db`, `docker restart`s the platform to flush the cache, and
  retries once (clearing the DB alone is not enough — the cache requires the restart).
- **start-local refuses to start if a port is busy**, and the OS can lag freeing a just-removed
  container's port (seen on ES `:9200`) right after `down` → a spurious start failure. provision waits
  the ports out (`Wait-PortsFree`) before starting.
- **start-VC-solution's exit code is not authoritative on a preserved DB** — its seed-password module
  probe makes it exit 1 even when the platform is healthy. provision runs it `-AllowFail` and gates on
  the real `/health` (`Wait-PlatformReady`) instead.
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
- **`.env.localhost`** is the local profile (`TEST_ENV=localhost`) — do NOT create `.env.localdocker`;
  `.env.local` is the gitignored secrets file, not an env profile.

## Teardown

```powershell
pwsh -File .claude/skills/testing/qa-local-env/provision.ps1 -Action stop     # pause, keep data
pwsh -File .claude/skills/testing/qa-local-env/provision.ps1 -Action remove   # destroy containers + volumes
```
