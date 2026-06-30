---
name: project-init
description: Initialize / onboard this agentic-QA plugin onto a deployment. Installs deps, asks whether it is a native-platform or a CLIENT project (custom modules/theme), picks the bug tracker (Jira / Azure Boards) and code host (GitHub / Azure Repos), captures the test-environment URL + auth (browser login or tokens, never passwords), discovers the client/platform repo split, writes project-profile.json + .mcp.json, and verifies access. The whole point is to make /qa-fix route each bug to the RIGHT repo (client vs native platform) and file to the RIGHT tracker. Use when standing the plugin up on a new machine or for a new customer.
---

# /project-init — deploy & wire this QA plugin for a customer

Stand up this plugin against a customer's infrastructure and produce a single
**deployment profile** (`project-profile.json`) that every other skill reads to
know what it's working with. **Focus: get `/qa-fix` working first** — it must
understand the infrastructure and route a found bug to the correct repository
(client module / theme / storefront fork **or** the native VirtoCommerce
platform) and to the correct bug tracker.

> **Additive, never destructive.** This skill only *adds* a profile + config. With
> no profile, the plugin keeps its original behaviour (native-platform, Jira,
> GitHub). Nothing existing is rewritten.

## What it produces

| Artifact | Purpose |
|----------|---------|
| `project-profile.json` (gitignored) | the deployment profile — read by `config.js` (→ every skill via `env.PROFILE`), `ci/lib/repo-router.ts` (client-vs-platform routing), `ci/lib/trackers/*` (which tracker) |
| `.env.<env>` + `.env.local` | env URLs + secrets (via the existing `npm run plugin:configure`) |
| `.mcp.json` + `.claude/settings.local.json` | MCP servers enabled for the chosen tracker/VCS (via `gen-mcp.mjs`) |

## Pipeline

```
0 preconditions → 1 install → 2 interview (role · type · tracker · VCS · upstream)
→ 3 base env (plugin:configure) → 4 write profile (gen-profile) → 5 discover repos
(client only) → 6 MCP (gen-mcp) → 7 verify (verify-access) → 8 done
```

All scripts live in `.claude/skills/project-init/` and are **non-interactive** —
you (the model) run the interview in prose, then call them with the answers as
flags. Run everything from the repo root.

---

## 0. Preconditions

Confirm: Node 18+, `git`, and `gh` (GitHub CLI) installed; `az` (Azure CLI) too
if the customer uses Azure DevOps. Confirm the current directory is the plugin
repo root (`manifest.json` present).

## 1. Install dependencies

```bash
npm install
npx playwright install chromium firefox
```
(Edge uses the system `msedge` channel; WebKit is not used on Windows.)

## 2. Interview (ask in prose, one topic at a time)

Ask, explain each option briefly, and **record the answers** for step 4:

1. **Who is running this?** (`operator`) — `virto-engineer` (Virto staff with
   access to the customer infra and possibly write access to VirtoCommerce repos)
   or `client` (the customer's own team; access to client repos only). If unsure,
   record `ask`. This sets the default upstream **contribution mode**:
   `virto-engineer → direct`, `client → fork`.
2. **Project type?** (`projectType`) — `platform` (a vanilla/native Virto
   deployment) or `client` (has custom modules / theme / storefront fork). Client
   unlocks steps 5 + the client-repo routing.
3. **Bug tracker?** (`tracker`) — `jira` or `azure` (Azure Boards). Collect the
   **non-secret** connection now:
   - Jira: base URL (e.g. `https://acme.atlassian.net`) + project key (e.g. `ABC`).
   - Azure: organization + project name + (optional) a state map for transitions
     (e.g. `In Review → Active`).
4. **Where does the CLIENT's code live + open PRs?** (`vcs.clientHost`, client
   only) — `github` or `azure-repos`. Collect the client **org** (GitHub org, or
   Azure org/project). Tracker and VCS are **independent** — e.g. Azure Boards +
   GitHub is fine.
5. **Upstream GitHub account** (`upstream.clientGithubAccount`) — the GitHub login
   used to (a) **file issues** on the open VirtoCommerce platform repos and
   (b) **fork-and-PR** platform fixes. The platform is always on GitHub, so this
   is needed even for an Azure-tracker/Azure-Repos client. Confirm the
   contribution mode (`fork` for a client without write access; `direct` for a
   Virto engineer with write access).

### Auth — browser login / tokens, never passwords

Guide the operator to authenticate (do **not** ask for or store passwords):

| Service | Preferred (browser/device) | Fallback (token in `.env.local`) |
|---------|----------------------------|----------------------------------|
| GitHub (PR / issue / fork) | `gh auth login --web` (or `--device`) | fine-grained PAT → `GITHUB_FIX_BUGS_TOKEN` |
| Azure DevOps (Boards + Repos) | `az login` → set `ADO_AUTH=az-login` | `ADO_PAT` |
| Jira | Atlassian MCP OAuth connector (interactive) | `JIRA_EMAIL` + `JIRA_API_TOKEN` |

Public VirtoCommerce repos only need a normal GitHub account (scope `public_repo`
is enough to fork + file issues).

## 3. Base environment

Reuse the existing wizard for app URLs + credentials (don't duplicate it):

```bash
npm run plugin:configure          # writes .env.<env> + .env.local (FRONT_URL, BACK_URL, STORE_ID, app creds)
```
Note the env name chosen (e.g. `acme_qa`) — that's your `TEST_ENV`.

## 4. Write the deployment profile

Call `gen-profile.mjs` with the interview answers (non-secret only):

```bash
node .claude/skills/project-init/gen-profile.mjs \
  --project-type client --operator client \
  --tracker jira --tracker-base-url https://acme.atlassian.net --tracker-project ABC \
  --client-vcs github --client-org acme-corp \
  --upstream-account jane-doe --contribution-mode fork --vcs-auth gh-cli --print
```
For Azure: `--tracker azure --azure-org acme --azure-project Web --client-vcs azure-repos --vcs-auth az-login`.

## 5. Discover the repo split (client projects only)

Propose the client/platform repo map from the live Platform API, then **show it
to the operator to confirm/correct** (it's a starting point, not gospel):

```bash
node .claude/skills/project-init/discover-repos.mjs --client-org acme-corp --out .local-env/repos.json --print
# (add --insecure only for a QA env with a self-signed cert)
```
- The **storefront / theme / frontend** repo is NOT in the modules API. Ask the
  operator for it and add it to the client list (kind `frontend`).
- After the operator confirms, merge the map into the profile:

```bash
node .claude/skills/project-init/gen-profile.mjs --repos-json .local-env/repos.json --merge --print
```
Then hand-edit `project-profile.json` `repos.client` to add the theme/frontend
repo and fix any miscategorised entry.

## 6. Generate `.mcp.json`

```bash
node .claude/skills/project-init/gen-mcp.mjs --tracker jira --client-vcs github \
  --with context7            # add postman,figma,devtools as needed
```
Enables playwright×3 + github + the tracker's MCP (atlassian for Jira; azure-mcp
for Azure). **Remind the operator to restart the MCP servers** (reload the IDE)
for the new config to take effect.

## 7. Verify access

```bash
node .claude/skills/project-init/verify-access.mjs
```
Resolve any `FAIL` (missing login/token/URL) before declaring success. `SKIP`
means a feature isn't configured (fine if unused).

## 8. Done

Summarise what was written (profile path, tracker, VCS, repo counts) and point
the operator at the first run:

```
/qa-fix VCST-1234        # (or your tracker's key) — now routes to the right repo
```

---

## How this makes `/qa-fix` route correctly

Once the profile exists, the fix pipeline uses it automatically:

- **Ownership** — `repoOwnership(repo)` (from `repo-router.ts`) returns `client`
  for repos under the client org / in `repos.client`, else `platform`.
- **Client bug** → fix + PR into the client repo (GitHub or Azure Repos per
  `vcs.clientHost`).
- **Platform bug, fixable** (passes the G0/G1 gates: simple, single-repo,
  non-breaking) → fix + PR to the VirtoCommerce repo (a **fork-PR** when
  `contributionMode=fork`, a direct PR for a Virto engineer with write access).
- **Platform bug, NOT fixable** (multi-module / complex / breaking) → **file a
  GitHub issue** on the open upstream repo (no PR), per the customer's GitHub
  account. This is the platform equivalent of a STOP/hand-off.
- **Tracker** — comments + status transitions go to Jira or Azure Boards per
  `tracker.kind` (Azure has no named transitions, so the adapter maps the
  pipeline status to a `System.State` via the profile's `stateMap`).

Gate ladder is unchanged — see `.claude/rules/quality-gates.md`. Never auto-merges.

## Re-running

Safe to re-run. `gen-profile`/`gen-mcp` overwrite their outputs; `--merge` layers
onto the existing profile. To reconfigure one dimension, re-run `gen-profile`
with just those flags + `--merge`.

## Scripts

| Script | Role |
|--------|------|
| `gen-profile.mjs` | write/merge `project-profile.json` from interview flags |
| `discover-repos.mjs` | Platform API → proposed client/platform repo split |
| `gen-mcp.mjs` | write `.mcp.json` (OS-aware) + enable servers for the tracker/VCS |
| `verify-access.mjs` | preflight: profile, env, GitHub/Azure/Jira auth, app URLs |

> Base env (URLs + app creds) is handled by the existing `bootstrap/install.ts`
> (`npm run plugin:configure`) — this skill does not duplicate it.
