---
description: "Upgrade a deployed environment to the LATEST released modules + platform and the latest GREEN dev alpha of the storefront theme. Compare the env's vc-deploy-dev backend/packages.json against VirtoCommerce/vc-modules modules_v3.json (modules) and the latest vc-platform release (platform — it is NOT in modules_v3.json), and theme/artifact.json against the newest vc-frontend dev alpha whose Theme CI run is green; print ONE diff table; move PR/alpha pins to the release that contains them and ASK only where no release exists yet; then ask once before opening ONE deploy PR. Read-only until the operator says yes; never merges — a human merges to deploy."
argument-hint: "<env>"
disable-model-invocation: true
---

# /qa-env-upgrade — bring an environment up to the latest releases

## Usage

```
/qa-env-upgrade vcst                # vcst-qa
/qa-env-upgrade vcptcore_qa1        # any env that has a .env.<env> file
/qa-env-upgrade vcptcore_regression
```

What you get, in order:

1. **A table** — platform + every module against the latest release, and the storefront theme against
   the newest `dev` alpha whose CI run is fully green, one status per row.
   Nothing has been written at this point; you can stop here.
2. **Questions, only where the answer is not obvious** — a module running a PR or alpha build that no
   release contains yet (typically a feature still in testing). You choose: keep the build, switch to the
   release, or decide per module.
3. **One yes/no**: open a deploy PR into the env's `vc-deploy-dev` branch. *No* leaves everything as is.
4. **On yes — a PR link.** The command does not merge. Someone with merge rights on `vc-deploy-dev` reviews
   and merges it; the merge deploys. Give it a minute or two after the deploy Action goes green before
   checking versions on the env.

Out of scope: adding or removing modules, hotfix delivery (`/qa-hotfix-check`),
deploying a ticket's PR builds (`/qa-deploy-pr`).

Requires `GIT_TOKEN` with read access to `VirtoCommerce/vc-deploy-dev` (write access to open the PR
directly; without it you get a fork PR or a web-edit link).

## Procedure

Input: `$ARGUMENTS` = the **environment name** in `TEST_ENV` form (`vcst`, `vcptcore`, `vcptcore_qa1`,
`vcptcore_stable`, …). No env given → STOP and ask for it; never default to one.

Deploy plumbing — a **Mechanic** ([`authoring-standard.md`](../knowledge/agents/authoring-standard.md) §5.2):
it states nothing about platform behaviour, so it carries no `kb` step.

**Safety contract.** Steps 1–6 only READ. Step 7 is the only write, and only after the operator's yes in
step 6. Never merge, never force-push, never touch a branch other than the named env's.

**Tooling.** Talk to GitHub through its REST API from Node `fetch` with `GIT_TOKEN`, read from
`process.env` **after** importing `config.js` (`gh` may not be installed). The `[config] TEST_ENV=…`
banner config.js prints is the session's default env, not the target — ignore it. Every helper script,
download and draft goes into the session scratchpad, never into the repo. Compare versions numerically
per component (`3.1009.0` > `3.999.0`), never as strings.

## 1. Resolve the environment (never hardcode a branch)

Mirror `resolveEnvCoords()` in [`scripts/deploy/deploy-pr-artifact.ts`](../../scripts/deploy/deploy-pr-artifact.ts)
(it is not exported — read it, don't import it):

- env file = `.env.vcptcore_<stable|regression>` for those two, else `.env.<env>`; missing → STOP.
- repo = `DEPLOY_REPO` from that file, else the script's default; branch = `DEPLOY_BRANCH`, else the
  script's `BRANCH_MAP[<env>]` (read it from the file each run), else the env name with `_`→`-`;
  manifest path = `DEPLOY_PACKAGES_PATH`, else the script's default. `BACK_URL` from the same file.
- `GET /repos/{repo}/branches/{branch}` → 404 means STOP and report what was tried.
- Open PRs into that branch whose head starts with `env-upgrade-` → list them and ask whether to go on;
  two upgrade PRs on one branch would conflict.

## 2. Read the env manifest

Fetch the file at the branch (`Accept: application/vnd.github.raw`). Keep the **raw text byte-for-byte**
(snapshot for step 7) and the parsed JSON. Shape:

- top level: `PlatformVersion`, `PlatformImage` (the container repo), `PlatformImageTag`, `Sources[]`.
- `Sources[]` entry `Name: "AzureBlob"` (vc3prerelease) — prerelease pins, usually BlobName-only
  `{ "BlobName": "<Id>_<version>.zip" }`, sometimes `{ Id, Version, BlobName }`. Split a BlobName at the
  first `_` that is followed by a digit.
- `Sources[]` entry `Name: "GithubReleases"` — release pins `{ "Id", "Version" }`.

A **release** version can sit in `AzureBlob` too — modules whose repo is private (the deploy downloads
anonymously, so a `GithubReleases` pin of them 404s). Such a pin stays in `AzureBlob`: its target is checked
and moved there (§7), never into `GithubReleases`.

One pin per Id per env. An Id pinned in both sources → `DUPLICATE` row, not bumped. Scope is only the
modules already pinned; this command never adds or removes a module.

## 3. Targets

**Modules — `https://raw.githubusercontent.com/VirtoCommerce/vc-modules/master/modules_v3.json`.** Each entry has
`Id`, `ProjectUrl`, `Versions[]` (up to two). Its **latest release** is the version with an empty
`VersionTag` **and** a `PackageUrl` on `github.com/…/releases/download/…`. A version with
`VersionTag: alpha.N` or a `vc3prerelease` URL is NOT a release, although its `Version` field shows no
suffix. An entry with only alpha versions has no release target.

**Platform — not in the feed.** `GET /repos/VirtoCommerce/vc-platform/releases/latest` (not draft, not
prerelease) → `tag_name`.

**Theme — the newest GREEN `dev` alpha of `themeRepo` (`config/module-repo-map.json`).** Theme alphas are not
in the feed or in GitHub releases; they are blobs in `https://vc3prerelease.blob.core.windows.net/packages`.

1. Version = `version` in the theme repo's `package.json` on its default branch (`dev`) → `X.Y.Z`.
2. List blobs with `?restype=container&comp=list&prefix=vc-theme-b2b-vue-X.Y.Z-alpha.` (anonymous; the
   listing is alphabetical and paged — always use this narrow prefix). Keep only `…-alpha.<N>.zip`: a
   longer suffix is a feature-branch build. Sort by `N` **numerically**.
3. Map each alpha to its CI run: walk `dev` commits from the head (`/commits?sha=dev`) and for each call
   `/actions/runs?head_sha=<sha>`, keeping `theme-ci.yml` push runs on `dev`. Do NOT list runs with
   `branch=dev&event=push` — that filter returned nothing newer than two weeks back (measured 2026-10-02). The blob's `Last-Modified` falls inside one run's `Publish to Blob` step window
   (`started_at`–`completed_at`); the name carries no sha, so this window is the only link.
4. Target = the highest `N` whose run has `conclusion: success`. A red run can still have published (its
   failure came after the publish step) — such an alpha exists but is never the target. No green run among
   the current version's alphas → the theme row is `NO_RELEASE`, nothing changes.

Theme pin = `URL` in the branch's theme file (`DEPLOY_THEME_PATH`, else the script's default). Kinds: a
`vc-theme-b2b-vue-X.Y.Z.zip` / `vc-frontend-X.Y.Z.zip` GitHub release asset; a plain alpha; a
feature-branch alpha; a PR build `…-pr-<N>-<sha>…`. Statuses (same names as for modules):
`EQUAL` = the target alpha; `BEHIND` = a release or older alpha → the target; `AHEAD` = a newer alpha than
the target (it came from a red run) → keep; PR build → `GET /pulls/{N}` in the theme repo: merged and
`/compare/{merge_sha}...{target alpha's head_sha}` is `ahead` or `identical` → `PRERELEASE→RELEASE` (→
target), else `PRERELEASE?`; feature-branch alpha → `PRERELEASE?`. The target blob must answer `HEAD` 200
anonymously, else `BLOCKED_ASSET`.

## 4. Classify every module and the platform

Pin kinds: plain `X.Y.Z` = release; `X.Y.Z-pr-<N>-<sha>` = PR build; `X.Y.Z-alpha.<N>` = dev build (no
commit sha in the name); `X.Y.Z-alpha.<N>-<branch>` = feature-branch build → `PRERELEASE?` ("feature
branch `<branch>`"); any other suffix → `PRERELEASE?` with reason "unrecognised suffix". Platform: a
`PlatformImageTag` that is not plain `X.Y.Z` or differs from `PlatformVersion` is a prerelease image → `PRERELEASE?`.

| Status | Condition | Action |
|---|---|---|
| `EQUAL` | release pin == latest release | none |
| `BEHIND` | release pin < latest release | → latest release |
| `AHEAD` | release pin > latest release | none, report — never downgrade |
| `PRERELEASE→RELEASE` | PR/alpha pin, a release containing it exists (§5) | → latest release |
| `PRERELEASE?` | PR/alpha pin, no release contains it | **ask** (step 6) |
| `NOT_IN_FEED` | Id absent from the feed (custom, client, private) | none, list |
| `NO_RELEASE` | feed holds only alpha versions | none, list |
| `DUPLICATE` | Id in both sources | none, list |

## 5. Does a prerelease pin have a release?

Repo = `modules[<Id>]` in `config/module-repo-map.json` (a bare repo name under `VirtoCommerce/`), else the feed's `ProjectUrl`.

- **PR build** → `GET /repos/{repo}/pulls/{N}`. Not merged → `PRERELEASE?` ("PR open" / "closed
  unmerged"). Merged → `merge_commit_sha`. List the repo's releases (paginate; skip draft, prerelease and
  non-`X.Y.Z` tags), take those ≥ the pin's `X.Y.Z` in ascending order, and `GET
  /compare/{tag}...{merge_sha}`: `status` `behind` or `identical` ⇒ the tag contains the PR. First hit wins.
  None hits → check the latest release's commit subjects for `(#N)` (hotfix cherry-picks are made without
  `-x`, so the sha alone misses them). Still nothing → `PRERELEASE?` ("merged, not released yet").
- **Alpha build** → no sha to compare. `X.Y.Z-alpha.N` is a dev build that precedes release `X.Y.Z`, so a
  release ≥ `X.Y.Z` ⇒ `PRERELEASE→RELEASE` (note "by version" — the last alpha of a version is built minutes before its release); otherwise `PRERELEASE?`.
- **Group the `PRERELEASE?` rows by feature**: rows sharing a tracker key (`VCST-1234`) — from the PR title,
  or from the branch name of a feature-branch build — are one feature and get ONE question. Include in the
  group the theme row and any `NOT_IN_FEED` PR build with the same key, so the operator sees the whole feature. Moving only part of a feature to releases breaks it.
- Where the latest release is LOWER than the pin's `X.Y.Z`, replacing the pin is a downgrade — say so in
  the question.

## 6. Questions, checks, the table

Order matters: the checks judge the end state, and the end state is not known until the operator has
answered. So: **ask → check → table → yes.**

1. **Questions first** — one `AskUserQuestion` per feature group (≤4 per call). Give the pins, the PR
   links and their state, what the release would be, and whether that is a downgrade. Options: *Keep the
   PR/alpha builds (Recommended when the PR is open)* · *Replace with release* · *Decide per module*. Each
   *Replace* adds that group's rows to the proposed changes as `PRERELEASE→RELEASE`.
2. **Checks** on the **proposed end state** (current pins + every proposed change, the approved replacements
   included). Run them **to a fixed point**: a failed check drops its change, and dropping one can break
   another (a dependant now needs a version that will not be deployed, an XCMS/PageBuilder partner loses
   its pair) — so after any drop, recompute the end state and re-run every check; stop when a pass drops
   nothing. A dropped change keeps the reason it was first dropped for (and the dependant names what it
   depended on).
   - **Platform floor:** each target module version's `PlatformVersion` (from its feed entry) ≤ target
     platform; else either the platform must move or that module stays — say which.
   - **Dependencies:** each non-optional `Dependencies[]` `{Id, Version}` of a target module that is pinned on
     the env must be ≥ that version in the end state; else `DEP_CONFLICT`, not bumped.
   - **Coupled:** `VirtoCommerce.XCMS` and `VirtoCommerce.PageBuilderModule` move together or not at all.
   - **Downloadable, without a token** (the deploy fetches anonymously; one 404 rolls back the whole install):
     `HEAD` each target module `PackageUrl` (follow redirects) → 200 — for a target that will sit in
     `AzureBlob` (§2, §7), `HEAD` `<ServiceUri>/<Container>/<Id>_<target>.zip` instead; the platform release
     carries `VirtoCommerce.Platform.<v>.zip` → `HEAD` 200; the image exists — anonymous token from
     `https://ghcr.io/token?scope=repository:<PlatformImage path>:pull`, then `HEAD
     https://ghcr.io/v2/<path>/manifests/<v>` with OCI/Docker manifest `Accept` headers → 200. Any miss →
     `BLOCKED_ASSET`, not bumped.
   - **Live column (optional):** `<BACK_URL>/api/platform/modules` with an admin token. Admin credentials via
     `config.js` promotion (`ADMIN_PASSWORD_<ENV>`, as in `resolveEnvCoords()`); any failure → `?`, carry on.

   A *Replace* the checks drop is reported back as such ("you approved X → release; blocked because …").
3. **The table** — one header line and one table, platform first, then by status (changes, kept, blocked,
   rest), then Id:

   ```
   Env: <env> · <repo>@<branch> · feed fetched <ISO time> · platform latest <x.y.z>

   | Component | On env | Live | Latest release | Status | Action / note |
   |---|---|---|---|---|---|
   ```

   Collapse `EQUAL` into one line ("N other modules already match"). Then: `N to change · N equal · N
   kept · N blocked`, the result of each check in one line (with how many passes it took).
4. **Then one yes/no**: "Open a deploy PR into `<branch>` with these N changes? A human merges." Nothing to
   change → say the env is up to date and stop.

## 7. On yes — edit, verify, deliver

**Edit the raw text minimally** — keep line endings, indentation and odd whitespace exactly as found:

- platform: change only the values of the `PlatformVersion` and `PlatformImageTag` lines.
- theme: in the theme file change only the `URL` value. Re-read it before writing too (step 1 below).
- `BEHIND`: change only the `Version` line inside that Id's `GithubReleases` block — or, for an `AzureBlob`
  release pin, only its `BlobName` (and `Version`, if the entry has one).
- `PRERELEASE→RELEASE`, public repo: delete the Id's `{ … }` block from `AzureBlob` (if it was the last
  element, drop the now-trailing comma of the previous `}`), and insert `{ "Id": …, "Version": … },` blocks
  at the top of `GithubReleases.Modules`, indented like their siblings.
- `PRERELEASE→RELEASE`, private repo (§2 — `GET /repos/{repo}` with the token shows `private: true`): the
  pin stays in `AzureBlob`; change only its `BlobName` to `<Id>_<release>.zip` (and `Version`, if the entry
  has one). The step-6 download check has already `HEAD`ed that blob.

**Verify before writing:** the result parses; recompute every pin old → new and require the set of changes
to equal exactly what the operator approved; no Id in two sources; no other top-level key and no source header (`Name`, `ModuleSources`, …)
changed — compare by VALUE (`JSON.stringify`), since arrays compared with `!==` always differ. Any
mismatch → STOP and show it.

**Deliver** (write permission = `GET /repos/{repo}/collaborators/{login}/permission` is write/maintain/admin):

1. Re-read each file you change at the branch head. Not byte-identical to the step-2 snapshot → STOP: someone changed
   the env; re-run the command.
2. Create `refs/heads/env-upgrade-<branch>-<YYYYMMDD>` (taken → add `-2`, `-3`) at the branch head.
3. `PUT /contents/<path>` with `branch: env-upgrade-…` (the step-2 branch — without it GitHub writes to
   the repo's DEFAULT branch, unreviewed), the file `sha`, author/committer = the operator's `git config user.name` /
   `user.email`. Message `<env>: upgrade to latest releases (<N> components)` + one line per changed
   component + the session's commit attribution.
4. Open the PR into `<branch>`, same title. Body (in English): a *Changed* table (component, was, now,
   why — PR link and the release that contains it), a *Kept on purpose* table (each `PRERELEASE?` the
   operator kept, `DEP_CONFLICT`, `BLOCKED_ASSET`, with reason), "the other N modules already match", the
   check results, and the merge note below. End with the session's PR attribution.
5. Confirm `GET /pulls/{n}/files` shows only the manifest (and the theme file, if it changed). Write both
   files on the same branch, one `PUT` each, in one PR. Report the PR URL.

No write permission → the fork path or the web-edit URL of the `/qa-deploy-pr` delivery gate
([`../skills/qa-deploy-pr/SKILL.md`](../skills/qa-deploy-pr/SKILL.md) §Delivery gate).

**Merge note** (PR body and the final message): a human merges; the merge triggers the deploy. Right after
it the env can serve the OLD build for a minute or two, so check `/api/platform/modules` only after the
deploy Action is green **and** the versions have actually changed.

## Never

- Never downgrade, never add or remove a module, never call an alpha a release.
- Never pin a theme alpha from a red CI run, a feature-branch alpha (`-alpha.N-<branch>`) or a PR build as the target.
- Never write before the step-6 yes; never merge; never edit another env's branch.
- Never transcribe versions, module lists or env→branch mappings into this file — read them live each run.
