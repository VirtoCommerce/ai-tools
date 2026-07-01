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

> **No pauses, no mid-interview reconnaissance.** Do **not** read files, inspect
> the `.mjs` scripts, or run any other Bash **between** the interview steps —
> everything you need is already in this skill. The interview has two parts:
>   1. **Topology** — one `AskUserQuestion` call (categorical; step 2a).
>   2. **Values** — **one field = one question** (step 2b): ask for every value the
>      topology needs, one per question, and do **not** cap how many you ask.
>
> **Offer choices ONLY for fields with a predefined set** (`ENV_RISK`,
> `STOREFRONT_PROFILE`, the topology fields). For a **unique / free-text** value
> (env name, URLs, `STORE_ID`, emails, tracker base URL / project key, passwords,
> tokens) present **just a value prompt — never invented option buttons**.

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

### 2b. Values — per-field questions (one field = one question)

Ask the operator for every value the chosen topology needs, **one field per
question**, and **do not cap how many questions you ask** — cover all fields.

**Two kinds of field:**
- **Predefined / enum** — `ENV_RISK` (`dev`|`test`|`staging`|`production`),
  `STOREFRONT_PROFILE` (`b2b`|`b2c`|`hybrid`), and the topology fields. Present the
  allowed choices as options.
- **Unique / free-text** — env name, `FRONT_URL`, `BACK_URL`, `STORE_ID`, `ADMIN`
  login, `USER_EMAIL`, `JIRA_EMAIL`, tracker base URL / project key, and every
  secret (passwords, tokens, API keys). Ask for the value **directly with a
  one-line hint of what it is — do NOT fabricate option choices** for these.

**Mechanism.** `AskUserQuestion` requires ≥2 options per question (and caps at 4
questions/call), so use it **only for the enum + topology fields**. Ask the
free-text value fields **directly in the chat** — a numbered list, one field per
line, each just a value prompt (that is how "just an input, no options" is
honored). Skip a field only when its value is already known (pre-answered) or the
env is being reused.

**What each value is / where it goes:**
- `ENV_NAME` must match `[a-z0-9_]+` (underscores, no hyphens — the `_<ENV>` secret
  suffix promotion depends on it).
- Non-secret identifiers (URLs, `STORE_ID`, `ADMIN` login, `USER_EMAIL`,
  `JIRA_EMAIL`, tracker base URL / project key) → `.env.<env>` / the profile.
- Secrets (`*_PASSWORD`, `*_TOKEN`, API keys) → `.env.local` (gitignored). Only app
  **test-user** passwords + issued tokens — **never a raw account password**. Do
  not echo pasted secret values back into chat, reports, or the profile.
- Browser-login auth — leave that token unset; the operator runs the login
  themselves (`gh auth login --web`, `az login`, Atlassian MCP OAuth). Record the
  choice for the profile (`vcs.auth = gh-cli`, `ADO_AUTH=az-login`).
- **Reusing an existing `.env.<env>`** (e.g. native `.env.vcst`)? Skip the
  Environment-URL questions; ask only the tracker connection + secrets.

**Fields by topology (ask the ones that apply):**
- **always:** `ENV_NAME`, `ENV_RISK` *(enum)*, `FRONT_URL`, `BACK_URL`, `STORE_ID`,
  `ADMIN`, `USER_EMAIL`, `ADMIN_PASSWORD`, `USER_PASSWORD` (+ optional
  `STOREFRONT_PROFILE` *(enum)*, `MODULES_ENABLED`, `STORYBOOK_URL`).
- **Jira:** `JIRA_BASE_URL`, `JIRA_PROJECT_KEY`, `JIRA_EMAIL`, and `JIRA_API_TOKEN`
  (unless Atlassian MCP OAuth).
- **Azure Boards:** `ADO_ORG`, `ADO_PROJECT` (+ optional `In Review→Active` state
  map) and `ADO_PAT` (unless `az login`).
- **GitHub VCS:** `GITHUB_FIX_BUGS_TOKEN` (unless `gh` CLI login).
- **Azure Repos:** covered by `ADO_PAT` / `az login`.
- **client project:** `CLIENT_ORG`, the storefront/theme repo (kind `frontend`),
  `UPSTREAM_ACCOUNT` + contribution mode.
- **optional MCP:** `POSTMAN_API_KEY`, `CONTEXT7_API_KEY`.

**Where to get each token** (share the relevant rows when you ask):

| Token | Browser-login alternative | Where to get it |
|---|---|---|
| `GITHUB_FIX_BUGS_TOKEN` (fine-grained PAT) | `gh auth login --web` (leave unset) | github.com → **Settings → Developer settings → Personal access tokens → Fine-grained**. *Contents* + *Pull requests* = R/W (`public_repo` is enough to fork + file issues) |
| `JIRA_API_TOKEN` (+ `JIRA_EMAIL`) | Atlassian MCP OAuth (interactive) | **id.atlassian.com → Security → API tokens → Create** |
| `ADO_PAT` | `az login` → `ADO_AUTH=az-login` | **dev.azure.com → User settings → Personal access tokens** (*Work Items* R/W, *Code* R/W) |
| `POSTMAN_API_KEY` *(optional)* | — | **postman.com → Settings → API keys** |
| `CONTEXT7_API_KEY` *(optional)* | — | **context7.com dashboard → API key** |

## 3. Write the env files (`write-env.mjs`)

Collect the operator's per-field answers (step 2b) and split them into **non-secret
identifiers** (`envVars`) and **secrets** (`*_PASSWORD`/`*_TOKEN`/API keys), setting
aside the tracker connection values (`JIRA_BASE_URL`/`JIRA_PROJECT_KEY` or `ADO_*`)
for `gen-profile` in step 4.
Then persist with **`write-env.mjs`** — one call writes **both** buckets and needs
**no interactive pause**. Pass the answers as a **JSON object on STDIN** (never as
argv — that would leak secrets into the process list / shell history). The script:

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
