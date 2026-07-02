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
| `.env.<env>` + `.env.local` | Both are scaffolded as **commented templates** the operator fills in — no values are asked in the interview (only the env name). `scaffold-env.mjs` writes `.env.<env>` (Bucket #2: URLs/identifiers/tracker connection); `scaffold-secrets.mjs` writes `.env.local` (Bucket #3: secrets, per-env creds `_<ENV>`-suffixed). Each placeholder carries what/where comments. The guided `npm run plugin:configure` wizard remains an optional fallback |
| `.mcp.json` + `.claude/settings.local.json` | MCP servers enabled for the chosen tracker/VCS (via `gen-mcp.mjs`) |

## Pipeline

```
0 preconditions → 1 install → 2 interview (topology + ENV NAME only — no values)
→ 3a scaffold-env (.env.<env> template) + 3b scaffold-secrets (.env.local template)
   + 3c operator fills BOTH files, then pause
→ 4 write profile (gen-profile, after fill) → 5 discover repos (client only)
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
> everything you need is already in this skill. The interview is tiny:
>   1. **Topology** — operator · projectType · tracker as one `AskUserQuestion`
>      block (enum choices; code host is a client-only follow-up).
>   2. **ENV_NAME** — a **plain chat question** ("what should the environment be
>      named?"); the operator replies with the value. `AskUserQuestion` is not used
>      for it (it always renders ≥2 option buttons — no option-less input), and a
>      `show_widget` input is avoided (renders unreliably). Plain chat is the stable
>      way to collect one free-text value.
>
> That is **all** that is asked. There is **no value form and no per-value
> questions**. Step 3 writes BOTH env files (`.env.<env>` and `.env.local`) as
> commented templates; the operator fills them, then verify-access (step 7) checks.

### 2a. Topology — one `AskUserQuestion` block (enum choices)

Ask these three as a single `AskUserQuestion` call:

1. **operator** — `virto-engineer` (Virto staff, may have write access to
   VirtoCommerce repos → default contribution mode `direct`) or `client`
   (customer team, client repos only → default `fork`). Unsure → `ask`.
2. **projectType** — `platform` (vanilla/native Virto) or `client` (custom
   modules / theme / storefront fork → unlocks step 5 + client routing).
3. **tracker** — `jira` or `azure` (Azure Boards).

**Only for `projectType=client`**, ask a follow-up `AskUserQuestion` with the
remaining client **enum** choices: **code host** (`github` or `azure-repos`) and
**contribution mode** (`fork` — client without upstream write, the default — or
`direct`). Tracker and VCS are **independent** (Azure Boards + GitHub is fine); the
platform upstream is **always** GitHub. (For `platform`, both are irrelevant.)

**Every enum choice is asked here, up front.** Every free-text *value* is a placeholder
in the ONE scaffolded file (step 3), never a mid-pipeline chat question — so do NOT ask
the client org in chat. Two client-routing subtleties:
- **`CLIENT_REPO_ORG`** is scaffolded **only for `--client-vcs github`** (a distinct
  GitHub org). For `azure-repos` it is redundant with `ADO_ORG`/`ADO_PROJECT` and is
  NOT emitted — derive the client org from `ADO_ORG` at step 4.
- **The upstream fork account is NOT asked or scaffolded.** It is the owner of the
  GitHub fix token / gh session, which gen-profile derives at step 4 (`gh api user` /
  GET /user → `login`); the fix pipeline auto-creates the fork under it (`gh repo
  fork`). Only ask if the operator wants the fork under a *different* org.

### 2b. ENV_NAME — one plain chat question

Ask, in plain chat, what the environment should be named (it becomes `TEST_ENV`).
The operator replies with the value. Do **not** use `AskUserQuestion` (always ≥2
option buttons — no option-less input) or a `show_widget` input (unreliable) for
this — a plain chat question is the stable way to collect one free-text value.

Normalise mixed case / spaces / hyphens to `[a-z0-9_]+` (e.g. `My QA` → `my_qa`)
and tell the operator what you used. Do **not** ask for any other value — URLs, IDs,
emails, passwords, tokens are all placeholders the operator fills into the two
template files created in step 3.

### 2c. Existing-env guard — check `.env.<name>` BEFORE scaffolding

After you have the normalised name, **check whether `.env.<name>` already exists**
(`test -f .env.<name>`, or list `.env.*`). This must happen before step 3 so the
operator never silently reuses (or half-overwrites) an env they forgot about.

- **Not found** → proceed to step 3 with this name.
- **Found** → this is a real decision — surface it with `AskUserQuestion` (two
  options), never auto-pick:
  1. **Use the existing environment** — keep the name; step 3 (`scaffold-env`) is
     idempotent and only *adds* missing keys, never clobbers filled values. Best
     when reusing a native env (`.env.vcst`, `.env.vcptcore`, `.env.virtostart`)
     or resuming a prior init.
  2. **Create a new one with a different name** — the operator supplies a fresh
     name (ask again in plain chat); re-run this 2c guard on the new name.

  Show the operator *what* the existing file already contains at a glance (the set
  of keys, values masked) so they can decide — but never print secret values.

## 3. Scaffold the two env templates, then hand off for filling

Using just the env name + topology, create **both** env files as commented
templates. No values are collected here — the operator fills them.

### 3a. `.env.<env>` template (`scaffold-env.mjs`)

Non-secret per-env placeholders (URLs / `STORE_ID` / `ADMIN` / `USER_EMAIL` /
`ENV_RISK` + the tracker connection), each with a what / example comment:

```bash
node .claude/skills/project-init/scaffold-env.mjs --env myqa --tracker jira --print
# client project → also emit the routing identifiers as placeholders (ONE file to fill):
node .claude/skills/project-init/scaffold-env.mjs --env acme --tracker azure \
  --project-type client --contribution-mode fork --print
```
Flags: `--env <name>` (required), `--tracker jira|azure`, `--project-type
platform|client`, `--client-vcs github|azure-repos`, `--contribution-mode fork|direct`.
`ENV_RISK` and `ADMIN` are pre-filled with safe defaults; everything else is empty.
**For `--project-type client --client-vcs github` it also emits `CLIENT_REPO_ORG`** (the
client's GitHub org). For `--client-vcs azure-repos` nothing extra is emitted (client org
= `ADO_ORG`/`ADO_PROJECT`). The fork account is never scaffolded — it is derived from the
GitHub token owner at step 4. Idempotent — a re-run only adds missing keys, never clobbers.

### 3b. `.env.local` template (`scaffold-secrets.mjs`)

Secret placeholders the topology needs, each with what / why / where-to-get
comments. Per-env creds get the `_<ENV>` suffix `config.js` promotes; browser-login
auth emits no token line:

```bash
node .claude/skills/project-init/scaffold-secrets.mjs \
  --env myqa --tracker jira --jira-auth token \
  --client-vcs github --github-auth pat --print
# client on Azure with session auth for both axes → emits ONLY the app passwords:
node .claude/skills/project-init/scaffold-secrets.mjs \
  --env acme --tracker azure --client-vcs azure-repos \
  --ado-auth az-login --github-auth gh-cli --print
```
Flags — **one per auth axis, each from its own interview question**: `--jira-auth
token|oauth` (Jira) · `--ado-auth pat|az-login` (Azure Boards + Repos; `az-login` ⇒ no
`ADO_PAT`, uses the `az` session) · `--github-auth pat|gh-cli` (client GitHub repos
and/or the platform upstream fork-PR; `gh-cli` ⇒ no `GITHUB_FIX_BUGS_TOKEN`, uses the gh
session) · `--extras postman,context7`. (Legacy `--vcs-auth pat|gh-cli|az-login` is still
honoured as a fallback.) Idempotent, placeholders written empty.

### 3c. Tell the operator: two files created — fill them, then verify

Print a message that:
- says **two files were created**: `.env.<env>` (non-secret URLs/identifiers) and
  `.env.local` (secrets, gitignored),
- lists the placeholder keys each emitted,
- tells the operator to open both files and fill every value (the inline comments
  say what each is and where to get it), and
- says that once filled, **verify-access (step 7) will check everything works**.

**Then pause — wait for the operator to confirm both files are filled** before
continuing. Do not proceed on empty placeholders. (Browser-login choices — `gh auth
login --web`, `az login`, Atlassian MCP OAuth — have no `.env.local` token line;
remind the operator to run that login instead.)

**Make the wait VISUALLY OBVIOUS.** A plain "let me know when done" reads as narration,
not a question — the operator can't tell the pipeline has stopped for them. End the
message with an unmistakable, set-apart call-to-action on its own line, e.g. a blockquote
banner: `> ⏸️ **WAITING FOR YOU** — fill both files, then reply **“готово / done”**.`
Do not append any further tool calls or steps after it — the turn ends there so the
prompt-for-input is the last thing on screen. (Same principle wherever the pipeline
blocks on the operator: reuse this banner.)

Note the env name (e.g. `myqa`) — that's your `TEST_ENV` for every later run.

## 4. Write the deployment profile

**After the operator has filled the files**, call `gen-profile.mjs`. Read the
connection/routing values back from the now-filled `.env.<env>` and pass them as flags:
tracker (`JIRA_BASE_URL` / `JIRA_PROJECT_KEY`, or `ADO_ORG` / `ADO_PROJECT`). For a
client project: `--client-org` = `CLIENT_REPO_ORG` (GitHub host) **or** `ADO_ORG` (azure
host); and for `--contribution-mode fork`, **derive `--upstream-account` from the GitHub
token owner** — `gh api user --jq .login` (or GET /user with `GITHUB_FIX_BUGS_TOKEN`) —
do NOT ask it in chat. (contribution mode / code host were the enum answers from step 2a):

```bash
node .claude/skills/project-init/gen-profile.mjs \
  --project-type client --operator client \
  --tracker jira --tracker-base-url https://acme.atlassian.net --tracker-project ABC \
  --client-vcs github --client-org acme-corp \
  --upstream-account jane-doe --contribution-mode fork --vcs-auth gh-cli --print
```
For Azure: `--tracker azure --azure-org acme --azure-project Web --client-vcs azure-repos --vcs-auth az-login`.

## 5. Discover the repo split (client projects only)

Propose the client/platform repo map from the live Platform API **and** a scan of the
client's own code host, then **show it to the operator to confirm/correct** (a starting
point, not gospel):

```bash
node .claude/skills/project-init/discover-repos.mjs --client-org acme-corp \
  --client-vcs azure-repos --out .local-env/repos.json --print
# (add --insecure only for a QA env with a self-signed cert)
```
- Installed modules are classified client-vs-platform by owner / id-namespace / Azure
  URL (a custom `vc-module-*` under the client org ⇒ client).
- The **storefront / theme / frontend** repo is NOT a platform module, so it is not in
  the modules API. The script **scans the client's repos** (Azure Repos via `ADO_PAT`,
  or GitHub via the fix token — pass `--client-vcs`) and adds any name matching the
  theme/frontend heuristic as `kind: "frontend"`. **Only if NONE matches** does it print
  a notice → then **ask the operator to name the storefront/theme repo** and add it.
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

## 7. Verify access — full readiness checkup

Run with the env selected (so per-env creds resolve). **Pass `FORCE_COLOR=1`** —
the table colours the Status column green/yellow/red, but the script auto-disables
colour when stdout is not a TTY, and the harness runs this through a pipe (not a
TTY), so without `FORCE_COLOR=1` the operator only ever sees a plain table. (`NO_COLOR`
still wins as the opt-out; a human running it directly in a terminal gets colour
automatically.)

```bash
FORCE_COLOR=1 TEST_ENV=<env> node .claude/skills/project-init/verify-access.mjs
```

Prints a bordered readiness table + a **READY / NOT READY** verdict for `/qa-fix`.
Checks (PASS / FAIL / WARN / SKIP): deployment profile · core env vars · storefront
URL · admin/platform URL · **admin login** (real `POST {BACK_URL}/connect/token`
password grant — proves `ADMIN`/`ADMIN_PASSWORD` actually authenticate) · storefront
user login (soft WARN — storefront users may auth via xAPI) · tracker token (Jira
`GET /myself` or Azure DevOps auth) · **GitHub fix token** (validates the PAT and
reports its permission on the upstream repo — `push` ⇒ direct PR possible) · gh CLI
session.

Resolve every **FAIL** before declaring success (exit code is non-zero while any
FAIL remains). **WARN** is non-blocking; **SKIP** means a feature isn't configured
(fine if unused). Secret values are never printed.

**Session auth is really probed, not assumed.** For `--ado-auth az-login` the check mints
an ADO token from the `az` session and hits the org's `_apis/projects` — an active `az`
session that is not a member of the org (or is in a different tenant) answers a 203 HTML
sign-in page and is reported **FAIL** (not a false PASS). GitHub `gh-cli` is checked via
`gh auth status`. **The pipeline never runs the blocking browser login itself** (an inline
`az login` / `gh auth login` can hang for minutes): on a session FAIL, tell the operator
to run the exact command **in their own terminal** — `az login --tenant <org-tenant>` (or
`gh auth login --web`) — then **re-run verify-access**. Use the ⏸️ waiting banner. (Or fall
back to a PAT: set `ADO_PAT` / `GITHUB_FIX_BUGS_TOKEN`.)

**After the readiness table it also prints the MCP-servers section** — confirms
`.mcp.json` was created and lists each enabled server with its auth status:
`OK` (local, no auth) · `AUTHORIZED` (token/key/az present) · `NEEDS OAUTH`
(atlassian / figma — authorize interactively in the client) · `NO KEY` (optional
server, key unset). It ends with a reminder of which servers still need interactive
OAuth. (The live per-server connection state is only known to the client after a
reload; the script reports the *configured* auth readiness.)

**Surface the result in your reply — do NOT leave it only in the script's stdout.**
The table is emitted as tool output, which many clients collapse or hide, so the
operator may never see it. **Restate the readiness table AND the MCP-server status as
Markdown tables in your chat message**, mapping each row to the surface it proves —
**front** = `FRONT_URL` (+ storefront user login), **back** = `BACK_URL` + admin
login, **Jira/tracker** = tracker token, **Git** = GitHub PAT + gh CLI — and end with
the `N PASS · N FAIL · N WARN · N SKIP` line and the READY / NOT READY verdict. (Run
the script with `FORCE_COLOR=1` for the terminal; mirror it in Markdown for the chat.)

## 8. Done

Present this as an explicit, labelled **Step 8** in your reply (the operator tracks the
pipeline by step number). Summarise what was written (profile path, tracker, VCS, repo
counts), list the remaining **manual** actions (reload the IDE for `.mcp.json`; any
interactive OAuth still pending, e.g. Atlassian), and point the operator at the first run:

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
| `scaffold-env.mjs` | write a commented `.env.<env>` **template** (non-secret URL/identifier/tracker placeholders + what/example comments) for the operator to fill; topology-driven, idempotent |
| `scaffold-secrets.mjs` | write a commented `.env.local` **template** (secret placeholders + what/why/where per secret) for the operator to fill; topology-driven, idempotent |
| `write-env.mjs` | (non-interactive helper) write `.env.<env>` / `.env.local` from a JSON answer object on STDIN when values ARE known programmatically; idempotent, values never echoed |
| `gen-profile.mjs` | write/merge `project-profile.json` from interview flags |
| `discover-repos.mjs` | Platform API → proposed client/platform repo split |
| `gen-mcp.mjs` | write `.mcp.json` (OS-aware) + enable servers for the tracker/VCS |
| `verify-access.mjs` | full `/qa-fix` readiness table + verdict: profile · core env · URLs · **real admin login** · storefront-user soft-probe · tracker token · **GitHub PAT + upstream push perm** · gh CLI |

> The interview asks only topology + the **env name** — no values. Both env files
> are scaffolded as commented templates the operator fills in: `scaffold-env.mjs` →
> `.env.<env>` (Bucket #2, non-secret) and `scaffold-secrets.mjs` → `.env.local`
> (Bucket #3, secrets). verify-access then checks the filled values. The existing
> `bootstrap/install.ts` (`npm run plugin:configure`) wizard remains an optional
> interactive fallback.
