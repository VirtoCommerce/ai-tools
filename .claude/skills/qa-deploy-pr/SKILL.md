---
name: qa-deploy-pr
description: "[QA Methodology] Gather ALL fresh CI prerelease artifacts for a change (modules + platform + vc-frontend) and deploy them together to the test env (vc-deploy-dev@<TEST_ENV branch>) in ONE manifest update: resolve a tracker ticket's linked PRs across all repos (or an explicit --module/--platform/--theme/--pr set) → each PR's latest vc3prerelease build → minimal-diff repin of backend/packages.json (AzureBlob/BlobName + PlatformVersion) and theme/artifact.json → dry-run combined diff (default) or a gated deploy PR (direct same-repo when the account has write, else a fork PR) → --verify polls the env-branch pin + /api/platform/modules per target. Never merges (a human merges to deploy); writes route through gh's keyring token; prints the web-edit URL when it can't push. Unblocks /qa-test PR#N and /qa-verify-fix."
argument-hint: "<ticket-key> [--pr owner/repo#N ...] [--module Id=Ver ...] [--platform Ver] [--theme <url>] [--env <name>] [--apply] [--verify]"
disable-model-invocation: true
---

# /qa-deploy-pr — deploy a change's PR artifacts to the test env

`/qa-test PR #N` and `/qa-verify-fix <ticket-key>` both need the change **live on the test
environment** before they test/verify — today they only *detect* whether it is deployed and
warn-and-wait. This skill closes that gap. A real change is rarely one PR: a feature/fix spans
a module + its xAPI + the storefront, each with its own fresh CI prerelease artifact. This
skill **gathers all of them and repins them together, in one manifest update**, onto the env's
`vc-deploy-dev` branch — then a human merges to deploy.

> **Ask before writing.** Dry-run is the default and writes nothing. Any write (`--apply`) is
> gated on an explicit confirmation, goes to a fork branch + a PR, and **never merges** — a
> human merges `vc-deploy-dev` to deploy. Revert the pin after verification.

## Why a deterministic script (+ a thin agent layer)

Resolution + the manifest math + the fork/PR mechanics are deterministic — they live in
**`scripts/deploy/deploy-pr-artifact.ts`** (`npm run deploy:pr`). The agent's only job is to
pick the input (ticket vs explicit set), read the resolved table, and decide whether to
`--apply`. The script reuses the repo's established building blocks: the PR→`vc3prerelease`
artifact resolver from `qa-local-env/resolve-task.mjs`, the AzureBlob/`BlobName` merge contract
from `qa-local-env/gen-manifest.mjs`, the module Id↔repo map (`config/module-repo-map.json`),
and the manifest-commit + `/api/platform/modules` patterns from `scripts/hotfix/hotfix-deliver.ts`.

## Usage

```bash
# DRY-RUN (default) — resolve every artifact, print the combined diff + web-edit URL. No writes.
npm run deploy:pr -- <ticket-key>                       # all of the ticket's linked PRs
npm run deploy:pr -- <ticket-key> --env=vcst            # explicit env (default = resolved TEST_ENV)
npm run deploy:pr -- --pr=VirtoCommerce/vc-module-cart#412 --pr=VirtoCommerce/vc-frontend#2280
npm run deploy:pr -- --module=VirtoCommerce.Cart=3.1007.0-pr-412-ab12 --theme=<vc3prerelease-url>

# VERIFY (read-only) — is the bundle already deployed on the env? (branch pin + live modules API)
npm run deploy:pr -- <ticket-key> --verify

# APPLY (gated write) — commit the bundle to your vc-deploy-dev fork + open ONE cross-fork PR.
npm run deploy:pr:apply -- <ticket-key> --env=vcst      # a human reviews + merges to deploy
```

## What it does

1. **Resolve the artifact set** = the union of the ticket's linked PRs and any explicit
   `--pr`/`--module`/`--platform`/`--theme`. Each PR yields its **latest** `vc3prerelease`
   build (`{Id}_{Version}.zip` → module/platform; `vc-theme-*.zip` → storefront). PRs whose CI
   hasn't published yet are flagged and omitted.
   - **Ticket → PRs is tracker-driven.** The explicit `--pr`/`--module` path is fully
     tracker-agnostic. Ticket-key auto-resolution uses the configured tracker's dev links
     (Jira today, via `JIRA_EMAIL`/`JIRA_API_TOKEN`); on **Azure Boards** (or when the tracker
     has no GitHub dev-links) pass the PRs explicitly with `--pr`.
   - **`vc-platform` PRs publish a CONTAINER IMAGE, not a blob zip.** Their body leaves
     `### Artifact URL:` empty and carries `Image tag: ghcr.io/VirtoCommerce/platform:<tag>`
     instead, so the resolver falls back to that line. Without it every platform PR reported
     "no vc3prerelease Artifact URL yet (CI still running?)" forever, no matter how long you waited.
2. **Compute one combined diff** against the env-branch `backend/packages.json` (each module →
   AzureBlob `{Id,Version,BlobName}`, dropped from `GithubReleases`; platform →
   `PlatformVersion`+`PlatformImageTag`) and `theme/artifact.json` (the theme URL).
3. **Deliver** per the gate below.
4. **`--verify`** reports, per target, whether it is pinned on the branch and its live
   `/api/platform/modules` version (platform → `/health`; theme → branch URL match).

## Environments (branch ↔ TEST_ENV — never hardcode)

| env (`--env`/`TEST_ENV`) | `vc-deploy-dev` branch | source |
|---|---|---|
| `vcst` (default QA) | `vcst-qa` | `BRANCH_MAP` (`.env.vcst` has no DEPLOY_* block) |
| `vcptcore` (second QA) | `vcptcore-qa` | `BRANCH_MAP` — the branch carries a `-qa` suffix the env name doesn't; there is **no** bare `vcptcore` branch |
| `virtostart` | same name | convention |
| `vcptcore_stable` / `vcptcore_regression` | `vcptcore-stable` / `-regression` | `.env.vcptcore_<key>` `DEPLOY_*` |

Both QA envs are `BRANCH_MAP` entries, not convention: env name ≠ branch name for either. A new env
whose branch differs from its name needs a `BRANCH_MAP` row or a `DEPLOY_BRANCH` in its `.env.<env>`.

`--verify`'s live column needs the env's admin password. It is read in `config.js`'s own promotion
form first — `ADMIN_PASSWORD_<ENV>` (e.g. `ADMIN_PASSWORD_VCPTCORE`) — then the
`ADMIN_PASSWORD_VCPTCORE_<STABLE|REGRESSION>` forms, then generic `ADMIN_PASSWORD`. A missing
per-env password degrades `--verify` to branch-pin-only (`live` reads `?`), it never fails the run.

**`JIRA_EMAIL` belongs in `.env.local`, next to `JIRA_API_TOKEN`** — they are the two halves of one
Basic-auth pair. A committed `.env.<env>` copy pins one teammate's identity against every other
teammate's token, and Jira answers **404 on a ticket that exists** (not 401), which reads as "bad
ticket key" rather than "bad auth". Ticket resolution is also non-fatal whenever explicit
`--pr`/`--module`/`--platform`/`--theme` targets are given — the key then only labels the branch/PR.

`BACK_URL` (for `--verify`) + any `DEPLOY_REPO`/`DEPLOY_BRANCH`/`DEPLOY_PACKAGES_PATH` override
come from `.env.<env>`. Adding an env is config-only.

## Delivery gate (never merges; a human does)

`--apply` opens a PR and **never merges** (PR-merge is denied by the harness). It picks the
delivery path from the account's *actual* permission on the deploy repo
(`repos/{owner}/{repo}/collaborators/{me}/permission`):

- **Write / maintain / admin → a DIRECT same-repo PR** (the common case here): a branch
  `<TICKET>-<branch>-deployment` (matching the `vc-ci` convention, e.g.
  `VCST-5505-vcst-qa-deployment`) → the env branch. No fork.
- **No write → a fork PR**: fork the deploy repo to the account, push the branch, open a
  cross-fork PR into the env branch.
- **Neither works → prepare-only**: prints the minimal diff + the GitHub **web-edit URL** to
  hand to DevOps.

**Token routing (important).** Reads use the ambient fine-grained PAT (`GIT_TOKEN`), but that
token lacks fork/PR rights on `vc-deploy-dev`. **Writes go through `gh` with the keyring
classic `gho_` token** (`gh` invoked with `GITHUB_TOKEN`/`GH_TOKEN` unset) — the credential the
rest of this repo uses for VirtoCommerce writes (`reference_github_token_routing`). The old
`403 denied to Lenajava1` in `reference_deploy_module_pr_to_vcst_qa` was the *fine-grained* PAT;
the account actually has `write` via the classic token.

**Minimal diff.** The manifest edit is done as **text surgery** on the raw file (remove the
`GithubReleases {Id,Version}` block, add a `BlobName`-only AzureBlob entry / swap the theme
URL / bump `PlatformVersion`), so the PR is a clean few-line diff — not the whole-file
`JSON.stringify` reformat. It verifies the result parses + carries exactly the intended change
and **falls back to a full reserialize** (with a "hide whitespace" note) only if the manifest
shape is unexpected.

## Gotchas (baked into the output)

- **Irregular manifest indent:** the manifest *may* use an indent `JSON.stringify` can't reproduce,
  so the edit is done as raw-text surgery and only falls back to a full reserialize on an unexpected
  or ambiguous shape — then the PR body says to review with "Hide whitespace changes". Two shapes
  that used to trip the fallback are now handled minimally: an **empty `"Modules": []`** AzureBlob
  source (a branch's first-ever prerelease pin — `vcptcore-stable` and `-regression` are both here
  today) and a **re-pin of an already-pinned module** (whose blob entry carries an `Id` the
  GithubReleases scan used to match by mistake). Note most env branches now round-trip through
  `JSON.stringify(…, 2)` **exactly**, where a plain reserialize is only 0–2 lines worse — the surgery
  layer is belt-and-braces plus "don't reformat DevOps's file", not a big win. Don't grow it further
  on diff-size grounds.
- **A reserialize is a normal outcome, not a defect.** The surgery deliberately **refuses to guess**:
  an ambiguous or unrecognised shape returns the safe reserialize instead of an edit, because a
  wrong-but-valid manifest deploys the wrong build. Known bail-outs: a module pinned twice, two
  entries sharing a line, a `BlobName` with no derivable version, a `Version` field that isn't at
  the entry's own indent.
- **Prerelease pins are BlobName-only:** AzureBlob prerelease entries are `{ "BlobName":
  "<Id>_<version>.zip" }` with NO `Id` field — `--verify` recognises this shape, so a deployed
  prerelease reads as PINNED/LIVE (not a false MISSING). Entries written by the reserialize path
  instead carry `Id`+`Version`+`BlobName`; both work, and since `pinnedModule()` prefers an explicit
  `Version` over the filename-derived one, a re-pin rewrites that field too rather than leaving it
  stale (a stale `Version` would make the table and `--verify` report the wrong version). The
  end-state is asserted before anything is committed: `pinnedModule()` must resolve to exactly the
  intended `{version, blobName}`, from exactly one entry, or the run reserializes.
- **Prerelease version not bumped:** a PR artifact's `module.manifest` often keeps the base
  version (the `-pr-…` suffix lives only in the filename), so a live-version mismatch in
  `--verify` is an **ADVISORY**, not a failure — confirm by behaviour.
- **`PlatformVersion` ≠ `PlatformImageTag` — they are two fields with two consumers.** `deploy-backend.yml`
  reads **only** `PlatformImageTag` (→ the docker `PLATFORM_TAG` build-arg), so that is the field that
  decides which platform actually runs; nothing in the deploy repo reads `PlatformVersion`. A platform PR
  pin therefore keeps `PlatformVersion` at the tag's **base semver** (`3.1053.0`) and puts the full
  `3.1053.0-pr-3092-…-2588d613` tag in `PlatformImageTag`. Writing the tag into both left `PlatformVersion`
  a non-semver string; checking only `PlatformVersion` in `--verify` reported **PINNED** for a branch still
  running the old container. `--platform` accepts a bare version, a bare PR tag, a full `ghcr.io/…:<tag>`
  ref, or an explicit `Ver=tag` split.
- **A platform PR pin also jumps the base version.** A PR branched off `dev` builds at `dev`'s version, so
  pinning it moves the env off its current release (e.g. `3.1051.0` → `3.1053.0`) on top of the PR's own
  change. That is inherent to testing a platform PR build — note it, and revert the pin after verifying.
- **Stale SPA bundle:** after a deploy, clear the Playwright/MCP browser cache before verifying
  admin-SPA/storefront bundles (memory `feedback_mcp_browser_cache`).

## STOP / rules

- Never merge. End at an open PR (or a prepared diff) for a human. Revert the pin after verify.
- One env at a time; env coords are data, never hardcoded.
- If no artifact resolves (all linked PRs still building, or none linked), STOP and report —
  do not guess a version.
