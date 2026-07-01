---
name: project-init
description: Initialize / onboard this agentic-QA plugin onto a deployment. Installs deps, asks whether it is a native-platform or a CLIENT project (custom modules/theme), picks the bug tracker (Jira / Azure Boards) and code host (GitHub / Azure Repos), captures the test-environment URLs + auth (browser login or tokens + app test-user passwords, never raw account passwords), discovers the client/platform repo split, writes project-profile.json + .mcp.json (via write-env.mjs / gen-profile.mjs / gen-mcp.mjs), and verifies access. The whole point is to make /qa-fix route each bug to the RIGHT repo (client vs native platform) and file to the RIGHT tracker. Use when standing the plugin up on a new machine or for a new customer.
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
| `.env.<env>` + `.env.local` | env URLs (`.env.<env>`, Bucket #2) + secrets/tokens/API keys (`.env.local`, Bucket #3) — collected as interview questions (steps 2b/2c) and written non-interactively by `write-env.mjs` in step 3 (per-env creds get the `_<ENV>` suffix `config.js` promotes). The guided `npm run plugin:configure` wizard remains an optional fallback |
| `.mcp.json` + `.claude/settings.local.json` | MCP servers enabled for the chosen tracker/VCS (via `gen-mcp.mjs`) |

## Pipeline

```
0 preconditions → 1 install → 2 interview (ONE uninterrupted pass:
  topology · connection details + per-env URLs · secrets/tokens/keys)
→ 3 write env files (write-env.mjs → .env.<env> + .env.local)
→ 4 write profile (gen-profile) → 5 discover repos (client only)
→ 6 MCP (gen-mcp) → 7 verify (verify-access) → 8 done
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

### 2b. Connection details + per-env URLs — second call, branched (non-secret)

**Environment (Bucket #2 → `.env.<env>`).** First check whether a `.env.<env>`
already covers this deployment (e.g. the native `.env.vcst`). **If one exists and
is correct, reuse it** — skip these questions and set `TEST_ENV` to that name. Only
ask when standing up a *new* environment:

- **env name** (`TEST_ENV`) — short id, **must match `[a-z0-9_]+`** (underscores, no
  hyphens — hyphens break the `_<ENV>` secret suffix promotion). E.g. `acme_qa`.
- **`ENV_RISK`** — `dev` | `test` | `staging` | `production` (production blocks
  admin-write suites by default).
- **`FRONT_URL`** (storefront) + **`BACK_URL`** (Admin SPA / platform) + **`STORE_ID`**
  — the three that, with the two passwords, satisfy `config.js` core-required.
- optional: `STOREFRONT_PROFILE` (`b2b`/`b2c`/`hybrid`), `MODULES_ENABLED` (CSV),
  `STORYBOOK_URL`, and the non-secret identifiers `ADMIN` (admin login, usually
  `admin`), `USER_EMAIL`, `JIRA_EMAIL` (Jira login email is an identifier, not a
  secret → it lives in `.env.<env>`, NOT `.env.local`).

**Tracker / VCS connection:**

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
**paste the token**, **use browser login instead** (where available — then leave
the token blank), or **skip** (feature stays unconfigured).

> **How to collect the actual values (important — a labelled `AskUserQuestion`
> option does NOT carry a value).** Use `AskUserQuestion` only to pick the
> **method** per secret (paste / browser-login / skip). When the operator picks
> **paste**, collect the value **in the next plain-chat turn**: ask them to reply
> with `KEY=value` lines (e.g. `ADMIN_PASSWORD=…`). One conversational message can
> carry every pasted secret at once. Do **not** try to smuggle a secret through an
> `AskUserQuestion` option label — the value is lost (only the label comes back).

**Never ask for or store a raw account password** — only app **test-user**
credentials and issued API tokens. Do not echo pasted secret values back to the
operator, into reports, or into the profile. `write-env.mjs` (step 3) receives them
over STDIN and prints key names only.

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

## 3. Write the env files (`write-env.mjs`)

Persist the interview answers with **`write-env.mjs`** — one call writes **both**
buckets and needs **no interactive pause**. Pass the answers as a **JSON object on
STDIN** (never as argv — that would leak secrets into the process list / shell
history). The script:

- writes non-secret **`envVars`** → `.env.<env>` (Bucket #2, committed),
- writes **`secrets`** → `.env.local` (Bucket #3, gitignored), auto-suffixing
  per-env credentials to `KEY_<ENV>` (global tokens like `GITHUB_FIX_BUGS_TOKEN` /
  `JIRA_API_TOKEN` / `ADO_PAT` / `POSTMAN_API_KEY` / `CONTEXT7_API_KEY` stay
  un-suffixed),
- updates each key **in place** (idempotent — safe to re-run), and prints **key
  names only**, never values.

```bash
# Build the JSON from the interview and pipe it in. `envVars` = non-secret
# identifiers (→ .env.<env>); `secrets` = passwords + tokens (→ .env.local).
# Emails (USER_EMAIL, JIRA_EMAIL, ADMIN login) are identifiers → put them in envVars.
echo '{
  "env": "acme_qa",
  "suffixCreds": true,
  "envVars": {
    "FRONT_URL": "https://front.acme.com",
    "BACK_URL": "https://back.acme.com",
    "STORE_ID": "B2B-store",
    "ENV_RISK": "test",
    "STOREFRONT_PROFILE": "hybrid",
    "ADMIN": "admin",
    "USER_EMAIL": "qa-user@acme.com",
    "JIRA_EMAIL": "jane@acme.com"
  },
  "secrets": {
    "ADMIN_PASSWORD": "<pasted>",
    "USER_PASSWORD": "<pasted>",
    "GITHUB_FIX_BUGS_TOKEN": "<pasted-or-omit-if-gh-cli>",
    "JIRA_API_TOKEN": "<pasted-or-omit-if-mcp-oauth>"
  }
}' | node .claude/skills/project-init/write-env.mjs --print
```

- Reusing an existing `.env.<env>` (e.g. native `.env.vcst`)? Omit `envVars` (or
  pass only the keys you're changing) and send just `secrets` — the URLs stay put.
- Add `--dry-run` first to preview which keys land where without writing.
- **Browser-login choices** (`gh auth login --web`, `az login`, Atlassian MCP
  OAuth): don't put a token in `secrets`; instead remind the operator to run the
  login themselves (via `!` in the prompt, e.g. `! gh auth login --web`) — you
  cannot complete an interactive login for them. Record the choice in the profile
  (`vcs.auth = gh-cli`, or `ADO_AUTH=az-login`).
- The guided `npm run plugin:configure` wizard remains an optional fallback for
  URLs + app creds (interactive; asks one env at a time).

Note the env name (e.g. `acme_qa`) — that's your `TEST_ENV` for every later run.

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
| `write-env.mjs` | write `.env.<env>` (non-secret URLs) + `.env.local` (secrets, `_<ENV>`-suffixed) from a JSON answer object on STDIN; idempotent, values never echoed |
| `gen-profile.mjs` | write/merge `project-profile.json` from interview flags |
| `discover-repos.mjs` | Platform API → proposed client/platform repo split |
| `gen-mcp.mjs` | write `.mcp.json` (OS-aware) + enable servers for the tracker/VCS |
| `verify-access.mjs` | preflight: profile, env, GitHub/Azure/Jira auth, app URLs |

> Per-env URLs (Bucket #2 → `.env.<env>`) and secrets/tokens/API keys (Bucket #3 →
> `.env.local`) are both collected as interview questions (steps 2b/2c) and written
> non-interactively by `write-env.mjs` in step 3 — no pause. Secret **values** are
> pasted in a plain-chat turn (not via `AskUserQuestion` labels) and reach the
> script over STDIN. The existing `bootstrap/install.ts` (`npm run plugin:configure`)
> wizard remains an optional interactive fallback.
