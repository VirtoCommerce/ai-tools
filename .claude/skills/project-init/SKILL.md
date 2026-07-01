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
| `.env.<env>` + `.env.local` | `.env.<env>` (Bucket #2) holds the non-secret URLs/identifiers from the step-2b form, written by `write-env.mjs`. `.env.local` (Bucket #3) is scaffolded by `scaffold-secrets.mjs` as a **commented template** (what/why/where per secret; per-env creds get the `_<ENV>` suffix `config.js` promotes) that the operator **fills in** — secrets are never asked in the interview. The guided `npm run plugin:configure` wizard remains an optional fallback |
| `.mcp.json` + `.claude/settings.local.json` | MCP servers enabled for the chosen tracker/VCS (via `gen-mcp.mjs`) |

## Pipeline

```
0 preconditions → 1 install → 2 interview (topology + required non-secret values;
  NO secrets asked) → 3a write-env (.env.<env>) + 3b scaffold-secrets (.env.local
  template) + 3c operator fills the secret placeholders
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
>   2. **Values** — **one interactive form** with every field at once (step 2b),
>      rendered via `show_widget`. Free-text fields are plain inputs (no options);
>      only the two enums (`ENV_RISK`, `STOREFRONT_PROFILE`) offer choices. Submit
>      returns all values via `sendPrompt`.
>
> Never fabricate example values, and never split the value form into batches —
> the whole point is one form, all fields, plain inputs for anything free-text.

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

### 2b. Values — the 15-question block (one field = one question)

Collect these values in **ONE interactive form** rendered with the visualize
`show_widget` tool — **every field at once**, not split, not capped.
`AskUserQuestion` is the wrong tool for values (≥2 options/question, ≤4/call, and a
clicked option returns its *label* not a typed value), so it is not used here.

**Ask ONLY the fields needed for a working setup — no optional fields, and NO
secrets.** Secrets are never asked in the form; step 3 scaffolds a commented
`.env.local` template the operator fills in afterwards.

Build the form so that:
- **Free-text fields** render as a **plain text input** — no option buttons, no
  fabricated example values, just the input with a short label/hint.
- **Enum field** — `ENV_RISK` — renders as a `<select>`
  (`dev` | `test` | `staging` | `production`).
- A **Submit** button gathers the fields and calls `sendPrompt()` with the values
  as `KEY=value` lines (one per non-empty field); you parse them in step 3.

Widget constraints: inline CSS/JS only (strict CSP blocks external hosts);
transparent background; visually-hidden `<h2 class="sr-only">` summary. **Fallback:**
if the widget can't render (headless / no visualize MCP), ask the operator to paste
the same `KEY=value` block in chat.

**Form fields — required only (native platform + Jira + GitHub, new env):**

1. `ENV_NAME` — env id, `[a-z0-9_]+` only (no hyphens — the `_<ENV>` suffix
   promotion depends on it)
2. `ENV_RISK` *(enum)* — `dev` | `test` | `staging` | `production`
3. `FRONT_URL` — storefront URL
4. `BACK_URL` — Admin SPA / platform URL
5. `STORE_ID` — store identifier
6. `ADMIN` — admin login (usually `admin`; identifier, not the password)
7. `USER_EMAIL` — storefront test-user email
8. `JIRA_BASE_URL` — e.g. `https://acme.atlassian.net`
9. `JIRA_PROJECT_KEY` — e.g. `VCST`
10. `JIRA_EMAIL` — Jira login email (identifier)

**Do NOT add** optional fields — `STOREFRONT_PROFILE` (defaults `hybrid`),
`MODULES_ENABLED`, `STORYBOOK_URL` — they have safe defaults and only clutter the
form. **Do NOT add** any secret field.

**Adapt per topology (still form-only, still no secrets):**
- **Reused `.env.<env>`** (e.g. native `.env.vcst`) — drop the env-URL fields
  (1, 3–7); keep the env name + tracker fields.
- **Azure Boards** — replace the Jira fields with `ADO_ORG`, `ADO_PROJECT`
  (+ optional `In Review→Active` state map).
- **client project** — add `CLIENT_ORG`, the storefront/theme repo (kind
  `frontend`), and `UPSTREAM_ACCOUNT` + contribution mode.

Non-secret identifiers → `.env.<env>` / the profile. **Secrets are handled entirely
by the step-3 `.env.local` template — the form never touches them** (their
where-to-get guidance lives in that template's comments).

## 3. Write env values + scaffold the secrets template

### 3a. Non-secret values → `.env.<env>` (`write-env.mjs`)

Take the form answers (all non-secret) and set aside the tracker connection values
(`JIRA_BASE_URL`/`JIRA_PROJECT_KEY` or `ADO_*`) for `gen-profile` in step 4. Persist
the rest as `envVars` with **`write-env.mjs`** — a JSON object on **STDIN** (never
argv). To keep values out of the process list / shell history, write the JSON to a
scratch file and pipe it in, then delete it:

```bash
# scratch.json = { "env":"myqa", "envVars": { ENV_RISK, FRONT_URL, BACK_URL,
#   STORE_ID, ADMIN, USER_EMAIL, JIRA_EMAIL, JIRA_BASE_URL, JIRA_PROJECT_KEY } }
node .claude/skills/project-init/write-env.mjs --print < scratch.json
```

`write-env.mjs` writes `envVars` → `.env.<env>` (Bucket #2), updates each key in
place (idempotent), prints key names only. (It *can* also write a `secrets` block,
but this flow does **not** pass one — secrets are scaffolded below, not collected.)
Reusing an existing `.env.<env>`? Omit `envVars` entirely.

### 3b. Secrets template → `.env.local` (`scaffold-secrets.mjs`)

Generate a **commented `.env.local` template** — one placeholder per secret the
topology needs, each with what / why / where-to-get comments. Per-env creds get the
`_<ENV>` suffix `config.js` promotes; browser-login auth emits no token line.

```bash
node .claude/skills/project-init/scaffold-secrets.mjs \
  --env myqa --tracker jira --jira-auth token \
  --client-vcs github --vcs-auth pat --print
```
Flags: `--jira-auth token|oauth`, `--vcs-auth pat|gh-cli|az-login`,
`--extras postman,context7`. Idempotent — a re-run adds only missing placeholders,
never clobbers a filled value. Placeholders are written empty so `config.js` treats
them as unset until filled.

### 3c. Tell the operator to fill it, then pause

Print a message that:
- lists the placeholder keys `scaffold-secrets` emitted,
- tells the operator to open `.env.local` and fill each value (the inline comments
  say where to get each), and
- says **verify-access (step 7) will then check them**.

**Wait for the operator to confirm they've filled `.env.local`** before running
verify — do not proceed on empty placeholders. (Browser-login choices — `gh auth
login --web`, `az login`, Atlassian MCP OAuth — have no `.env.local` line; remind
the operator to run the login instead.)

Note the env name (e.g. `myqa`) — that's your `TEST_ENV` for every later run.

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
| `write-env.mjs` | write `.env.<env>` (non-secret URLs) — and, if passed, `.env.local` secrets (`_<ENV>`-suffixed) — from a JSON answer object on STDIN; idempotent, values never echoed |
| `scaffold-secrets.mjs` | write a commented `.env.local` **template** (placeholders + what/why/where per secret) for the operator to fill; topology-driven, idempotent |
| `gen-profile.mjs` | write/merge `project-profile.json` from interview flags |
| `discover-repos.mjs` | Platform API → proposed client/platform repo split |
| `gen-mcp.mjs` | write `.mcp.json` (OS-aware) + enable servers for the tracker/VCS |
| `verify-access.mjs` | preflight: profile, env, GitHub/Azure/Jira auth, app URLs |

> Non-secret per-env values (Bucket #2 → `.env.<env>`) are entered in the step-2b
> `show_widget` form (required fields only; free-text = plain inputs, the one enum =
> a select; Submit returns them) and written by `write-env.mjs`. **Secrets are never
> asked** — `scaffold-secrets.mjs` writes a commented `.env.local` template (Bucket
> #3) that the operator fills in, then verify-access checks it. The existing
> `bootstrap/install.ts` (`npm run plugin:configure`) wizard remains an optional
> interactive fallback.
