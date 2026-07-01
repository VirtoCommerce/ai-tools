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
| `.env.<env>` + `.env.local` | env URLs (`.env.<env>`) + secrets/tokens/API keys (`.env.local`) — collected as interview questions (step 2c) and written in step 3; the guided `npm run plugin:configure` wizard remains an optional fallback |
| `.mcp.json` + `.claude/settings.local.json` | MCP servers enabled for the chosen tracker/VCS (via `gen-mcp.mjs`) |

## Pipeline

```
0 preconditions → 1 install → 2 interview (ONE uninterrupted pass:
  topology · connection details · secrets/tokens/keys)
→ 3 write env secrets (.env.local) → 4 write profile (gen-profile)
→ 5 discover repos (client only) → 6 MCP (gen-mcp) → 7 verify (verify-access) → 8 done
```

All scripts live in `.claude/skills/project-init/` and are **non-interactive** —
you (the model) collect every interview answer first, then call the scripts with
the answers as flags. Run everything from the repo root. **Every generator flag
you need is documented in steps 3–7 — never inspect the `.mjs` scripts (and never
pass `--help`: unrecognised flags are treated as booleans and the script runs
anyway, writing a default file).**

---

## 0. Preconditions — detect AND install the required tooling

Run a detection pass, then **install whatever is missing** — do not just report a
gap and move on (that leaves `/qa-fix` unable to open PRs). Confirm the current
directory is the plugin repo root (`manifest.json` present).

- **Node 18+** and **git** — hard prerequisites. If absent, STOP and ask the
  operator to install them (cannot be auto-installed reliably).
- **`gh` (GitHub CLI)** — **required** (platform upstream + client GitHub
  PRs/issues). Install now if missing.
- **`az` (Azure CLI)** — required **only** if the operator picks Azure
  Boards/Repos in step 2. Install it then (or now if you already know).

Install commands (pick by OS). System installs need `sudo`, which prompts — have
the operator run them via `!` in the prompt (e.g. `! sudo pacman -S github-cli`):

| Tool | Debian/Ubuntu | Arch/CachyOS | macOS (brew) | Windows (winget) |
|------|---------------|--------------|--------------|------------------|
| `gh` | `sudo apt install gh` | `sudo pacman -S github-cli` | `brew install gh` | `winget install GitHub.cli` |
| `az` | `curl -sL https://aka.ms/InstallAzureCLIDeb \| sudo bash` | `sudo pacman -S azure-cli` | `brew install azure-cli` | `winget install Microsoft.AzureCLI` |

Detect with `command -v gh` / `command -v az`; re-check after install before
proceeding.

## 1. Install dependencies

Install the plugin's own package dependencies + the Playwright browsers:

```bash
npm install                                   # Node package dependencies (package.json)
npx playwright install chromium firefox       # browser binaries for the MCP servers
```
(Edge uses the system `msedge` channel; WebKit is not used on Windows.) This step
must run before any generator/verify script — they import from `node_modules`.

## 2. Interview — ask everything in ONE pass, THEN run the scripts

> **No pauses, no mid-interview reconnaissance.** Collect *every* answer below
> before you run a single generator script. Do **not** read files, inspect the
> `.mjs` scripts, or run any other Bash **between questions** — everything you
> need is already in this skill. Ask the **topology** choices in one
> `AskUserQuestion` call, then ask the **connection details + secrets** in a
> second call **immediately after**, with **no other tool use in between**.
> Branch the second call on the first call's answers (e.g. ask Jira details only
> if `tracker=jira`; skip the code-host / client-org / repo questions for a
> `platform` project). Two back-to-back question calls = no thinking pause.

### 2a. Topology — first `AskUserQuestion` call (categorical)

1. **operator** — `virto-engineer` (Virto staff, may have write access to
   VirtoCommerce repos → default contribution mode `direct`) or `client`
   (customer team, client repos only → default `fork`). Unsure → `ask`.
2. **projectType** — `platform` (vanilla/native Virto) or `client` (custom
   modules / theme / storefront fork → unlocks step 5 + client routing).
3. **tracker** — `jira` or `azure` (Azure Boards).
4. **code host** (client projects only) — `github` or `azure-repos` (where the
   CLIENT's code lives + PRs open). Tracker and VCS are **independent** (Azure
   Boards + GitHub is fine). The platform upstream is **always** GitHub.

### 2b. Connection details — second call, branched (non-secret)

- **Jira** → base URL (e.g. `https://acme.atlassian.net`) + project key (e.g. `ABC`).
- **Azure Boards** → organization + project + optional transition state map
  (e.g. `In Review → Active`).
- **Client project** → client **org** (GitHub org, or Azure org/project) **and**
  the **storefront/theme repo** (it is NOT in the modules API — the operator must
  name it; it becomes a `frontend`-kind client repo).
- **upstream GitHub account** (`upstream.clientGithubAccount`) — the login used to
  file issues on + fork-and-PR the open VirtoCommerce platform repos. Needed even
  for an Azure client (the platform is on GitHub). Confirm the contribution mode
  (`fork` = client without write access; `direct` = Virto engineer with write
  access). A normal GitHub account (`public_repo`) is enough to fork + file issues.

### 2c. Secrets, tokens & API keys — same second call (ask, don't assume)

**Collect secrets as questions** — one per relevant service. Only ask for what the
chosen tracker/VCS actually needs (no `ADO_PAT` for a Jira+GitHub setup). For
**each** token, tell the operator **where to get it** and offer three choices:
**paste the token** (via the "Other" free-text option), **use browser login
instead** (where available — then leave the token blank), or **skip** (feature
stays unconfigured). **Never ask for or store a raw account password** — only app
**test-user** credentials and issued API tokens. Do not echo pasted secret values
back to the operator, into reports, or into the profile.

| Secret (`.env.local` var) | Needed for | Browser-login alternative | Where to get the token |
|---|---|---|---|
| `ADMIN_PASSWORD` *(required)* | Admin / back-office login — every run | — | The deployment's admin **test** account (customer / ops). Local start-local stack: `Password1!` |
| `USER_PASSWORD` *(required)* | Storefront test-user login | — | The deployment's storefront **test** account |
| `GITHUB_FIX_BUGS_TOKEN` (fine-grained PAT) | `/qa-fix` PR + issue (GitHub) | `gh auth login --web` (leave token blank) | github.com → **Settings → Developer settings → Personal access tokens → Fine-grained tokens**. Perms: *Contents* + *Pull requests* = Read/Write (`public_repo` is enough to fork + file issues on VirtoCommerce) |
| `JIRA_API_TOKEN` (+ `JIRA_EMAIL`) | Jira comments + transitions | Atlassian MCP OAuth (interactive) | **id.atlassian.com → Manage account → Security → API tokens → Create API token** |
| `ADO_PAT` | Azure Boards + Repos | `az login` → set `ADO_AUTH=az-login` | **dev.azure.com → User settings → Personal access tokens**. Scopes: *Work Items* R/W, *Code* R/W |
| `POSTMAN_API_KEY` *(optional)* | postman MCP | — | **postman.com → Settings → API keys** |
| `CONTEXT7_API_KEY` *(optional)* | context7 MCP | — | **context7.com dashboard → API key** |

Record every pasted value for step 3. If the operator chose a browser login,
note it (e.g. `vcs.auth = gh-cli`, `ADO_AUTH=az-login`) instead of a token.

## 3. Write env secrets (`.env.local`)

Write the collected secrets/tokens/keys from step 2c into `.env.local` (gitignored
— create it if absent, update a key **in place** if present). This is
question-driven so there is **no interactive wizard pause**. The non-secret env
**URLs** (`FRONT_URL`, `BACK_URL`, `STORE_ID`) belong in `.env.<env>`; if they are
not set yet, add them from the interview or run the guided wizard once:

```bash
npm run plugin:configure          # OPTIONAL — guided wizard for URLs + app creds
```
Note the env name (e.g. `acme_qa`) — that's your `TEST_ENV`. For browser-login
choices, remind the operator to run the login command themselves (via `!` in the
prompt, e.g. `! gh auth login --web`) — you cannot complete an interactive login
for them.

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

> Secrets/tokens/API keys are collected as interview questions (step 2c) and
> written to `.env.local` in step 3 — no interactive pause. Non-secret env URLs
> live in `.env.<env>`; the existing `bootstrap/install.ts`
> (`npm run plugin:configure`) wizard remains an optional fallback for URLs +
> app creds.
