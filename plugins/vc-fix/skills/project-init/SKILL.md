---
name: project-init
description: Initialize / onboard this agentic-QA plugin onto a deployment. Installs deps, then asks the operator only what genuinely shapes the config — the environment NAME, the bug tracker (Jira / Azure Boards), the code host (GitHub / Azure Repos), and an auth preference per axis (PAT recommended, else browser/CLI login). Everything else — whether it is a native-platform or a CLIENT project, the client org, the contribution mode, the fork account — is DERIVED from the token + the filled env + a live module/repo scan. Writes project-profile.json + .env.<env> + .env.local + .mcp.json and verifies access. The whole point is to make /qa-fix route each bug to the RIGHT repo (client custom code vs native platform) and file to the RIGHT tracker. Use when standing the plugin up on a new machine or for a new customer.
---

# /project-init — deploy & wire this QA plugin for a customer

Stand up this plugin against a customer's infrastructure and produce a single
**deployment profile** (`project-profile.json`) that every other skill reads to
know what it's working with. **Focus: get `/qa-fix` working first** — it must
understand the infrastructure and route a found bug to the correct repository
(client module / theme / storefront fork **or** the native VirtoCommerce
platform) and to the correct bug tracker.

> **Ask only what shapes the config; DERIVE the rest.** The interview is three
> answers — **env name · tracker · code host** — plus a soft auth preference per
> axis. `projectType` (native-platform vs client), the client org, the
> contribution mode (fork vs direct), and the fork account are **not asked** —
> they are derived from the token's permissions + the filled `.env` + a live
> module/repo scan. Ask again only on a *genuine* ambiguity.

> **Additive, never destructive.** This skill only *adds* a profile + config. With
> no profile, the plugin keeps its original behaviour (native-platform, Jira,
> GitHub). Nothing existing is rewritten.

## What it produces

| Artifact | Purpose |
|----------|---------|
| `project-profile.json` (gitignored) | the deployment profile — read by `config.js` (→ every skill via `env.PROFILE`), `ci/lib/repo-router.ts` (client-vs-platform routing), `ci/lib/trackers/*` (which tracker) |
| `.env.<env>` + `.env.local` | Both scaffolded as **commented templates** the operator fills in — no values are asked in the interview. `scaffold-env.mjs` writes `.env.<env>` (Bucket #2: URLs/identifiers/tracker connection); `scaffold-secrets.mjs` writes `.env.local` (Bucket #3: secrets, per-env creds `_<ENV>`-suffixed). Each placeholder carries what/where comments. |
| `.mcp.json` + `.claude/settings.local.json` | MCP servers enabled for the chosen tracker/VCS (via `gen-mcp.mjs`). The Playwright servers are configured entirely via CLI flags (`--browser` / `--isolated` / `--viewport-size` / `--output-dir`) — no config files are shipped or copied. Only `playwright-chrome` is enabled by default; `playwright-firefox` / `playwright-edge` stay defined for opt-in cross-browser runs. |

## Pipeline

```
0 preconditions → 1 install → 2 interview (env name · tracker · code host · auth pref · self-diagnostics consent)
→ 3 scaffold BOTH env templates + operator fills + pause
→ 4 discover repos (ALWAYS) → projectType · clientOrg · repo split · storefront
→ 4b discover tracker (Azure) → per-type states · role→state map · apiBase · projectId
→ 5 derive block (derive-context) → auth-fact · contributionMode · forkAccount · operator
→ 6 write profile (gen-profile: repos-json + tracker-json + derived flags) → 7 MCP (gen-mcp)
→ 8 verify (verify-access) → 9 done
```

All scripts live in the plugin's own `skills/project-init/` directory and are
**non-interactive** — you (the model) collect the interview answers, run the scan +
derive scripts, then call the writers with the results as flags.

### Where things go — read this once (two roots, kept separate)

- **Plugin install directory** (`$CLAUDE_PLUGIN_ROOT` — the versioned marketplace cache
  when the plugin is installed, or this checkout when developing): holds the read-only
  scripts, templates, and source MCP configs. **Invoke every generator by its ABSOLUTE
  path here** — `node "$CLAUDE_PLUGIN_ROOT/skills/project-init/<name>.mjs" …`. Do **not**
  use a bare relative `node skills/…` path: your Bash working directory is the deployment
  project, not the plugin, so a relative path won't resolve once the plugin is installed
  from the marketplace. (The bash examples below show the bare path for brevity — always
  prefix it with `$CLAUDE_PLUGIN_ROOT/`.)
- **Deployment project directory** (your Bash cwd — the folder Claude Code was launched
  in): where **all generated state lands** — `project-profile.json`, `.env.<env>`,
  `.env.local`, `.mcp.json`, and `.claude/settings.local.json`. The generators default
  their output there
  automatically (symmetric with the readers: `config.js` dotenv-loads `.env.*` and
  `loadProjectProfile()` reads the profile from cwd). You do **not** pass an output path in
  the normal flow. `VC_FIX_HOME=<dir>` overrides the output root only for out-of-project /
  CI callers — the interactive flow never sets it.

**Every generator flag you need is documented in the steps below — never inspect the
`.mjs` scripts (and never pass `--help`: unrecognised flags are treated as booleans and
the script runs anyway, writing a default file).**

---

## 0. Preconditions — confirm the working directory, then detect AND install tooling

### 0a. Confirm the deployment project directory (everything lands here)

Run `pwd` and show the operator the current directory. **This is your deployment project
home** — everything `/project-init` generates (profile, env files, `.mcp.json`, MCP
configs) is written here, and every later run (`/qa-fix`, `/qa-bug`) reads its config from
here. Confirm with `AskUserQuestion`:

- **Yes — initialize here (`<cwd>`)** (Recommended) → proceed.
- **No — wrong folder** → **STOP.** Tell the operator to relaunch Claude Code from their
  deployment project directory, then re-run `/project-init`. (The Bash working directory is
  fixed to wherever Claude Code was launched and cannot be moved outside it mid-session, so
  the project home must be chosen at launch — not with `cd`.)

Then resolve the **plugin directory** once, so you can invoke the generators by absolute
path: `echo "$CLAUDE_PLUGIN_ROOT"`. If it prints a path, use it. If empty, locate the
installed plugin (e.g. under `~/.claude/plugins/`, or the absolute directory this SKILL.md
loaded from). Use it as the `$CLAUDE_PLUGIN_ROOT/skills/project-init/…` prefix for every
generator call in the steps below.

### 0b. Detect AND install the required tooling

Run a detection pass, then **install whatever is missing** — do not just report a
gap and move on (that leaves `/qa-fix` unable to open PRs).

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
( cd "$CLAUDE_PLUGIN_ROOT" && npm install )   # into the PLUGIN's node_modules (subshell — your cwd is unchanged)
npx playwright install chromium firefox       # browser binaries (global cache — cwd-independent)
```
(Edge uses the system `msedge` channel; WebKit is not used on Windows.) This step
must run before any generator/verify script. **Install inside the plugin (`( cd
"$CLAUDE_PLUGIN_ROOT" && npm install )`), NOT a bare `npm install`** — several scripts
(`discover-repos`, `derive-context`, `verify-access`, `ensure-session`) import `dotenv`,
and Node resolves that bare specifier from the *script's own* directory (the plugin), not
your project cwd. A bare `npm install` would install into the project and leave those
scripts unable to find `dotenv`. The subshell `( … )` keeps your project cwd unchanged
(don't use a bare `cd`, which the harness resets when it leaves the project).

## 2. Interview — three answers + an auth preference, THEN scaffold

> **No mid-interview reconnaissance.** Do **not** read files, inspect the `.mjs`
> scripts, or run any other Bash **between** the interview steps. Ask the questions,
> then run step 3. Only these answers are collected — **no operator / projectType /
> contribution-mode question** (those are derived in steps 4–5).

### 2a. ENV_NAME — one plain chat question

Ask, in plain chat, what the environment should be named (it becomes `TEST_ENV`).
The operator replies with the value. Do **not** use `AskUserQuestion` (always ≥2
option buttons — no option-less input) or a `show_widget` input (unreliable) for
this — a plain chat question is the stable way to collect one free-text value.
Normalise mixed case / spaces / hyphens to `[a-z0-9_]+` (e.g. `My QA` → `my_qa`)
and tell the operator what you used.

### 2b. Tracker + code host — one `AskUserQuestion` block

Ask these two enums together:

1. **tracker** — `jira` or `azure` (Azure Boards). What the bug-tracker skills work
   against + which tracker MCP is enabled.
2. **code host** — `github` or `azure-repos`. Where the **client's own** code lives
   (drives routing + how a client PR is opened). Tracker and code host are
   **independent** (Azure Boards + GitHub is fine). The platform upstream is
   **always** GitHub, whatever the client host.

### 2c. Existing-env guard — check `.env.<name>` BEFORE scaffolding

After you have the normalised name, **check whether `.env.<name>` already exists**
(`test -f .env.<name>`, or list `.env.*`). This must happen before step 3.

- **Not found** → proceed.
- **Found** → surface it with `AskUserQuestion` (two options), never auto-pick:
  1. **Use the existing environment** — keep the name; scaffolding is idempotent
     and only *adds* missing keys, never clobbers filled values.
  2. **Create a new one with a different name** — ask again in plain chat; re-run
     this 2c guard on the new name.

  Show the operator the set of keys the existing file already contains (values
  masked) so they can decide — never print secret values.

### 2d. Auth preference — one `AskUserQuestion` block (PAT recommended)

Now that tracker + host are known, ask an auth preference **only for the applicable
axes**, each as a question in a single `AskUserQuestion` call. **A PAT is the
recommended option** (more reliable / non-interactive); the alternative is a browser
/ CLI login. **You are NOT collecting the token in chat** — the choice only decides
whether step 3 emits a *token placeholder to fill in `.env.local`* (PAT) or *no token
line + a login to run* (session). verify-access (step 8) confirms whichever is
actually present.

Applicable axes:

| Axis | When applicable | Options |
|------|-----------------|---------|
| **GitHub** | **always** (the platform upstream is always GitHub; and the client host may be GitHub) | `PAT` (Recommended) → `GITHUB_FIX_BUGS_TOKEN` placeholder · `Browser login` → `gh auth login` |
| **Azure DevOps** | tracker = `azure` **OR** code host = `azure-repos` | `PAT` (Recommended) → `ADO_PAT` placeholder · `Browser login` → `az login` |
| **Jira** | tracker = `jira` | `API token` (Recommended) → `JIRA_API_TOKEN` placeholder · `Atlassian MCP OAuth` (no token line) |

Map the answers to the scaffold flags: `--github-auth pat|gh-cli`, `--ado-auth
pat|az-login`, `--jira-auth token|oauth`.

### 2e. Self-diagnostics & upstream-feedback consent — one `AskUserQuestion` (two questions)

Ask the two self-diagnostics consent decisions together, in a **single** `AskUserQuestion`
call with two questions. These are the SAME decisions `/project-init --check` surfaces via
`reconcile-profile.mjs` `MANAGED_FIELDS` — use the wording/options below verbatim so the
fresh interview and the reconcile path never diverge. Make each `default` the Recommended
(first) option.

1. **selfDiagnostics** (local capture opt-in):
   - Question: *"Enable vc-fix self-diagnostics for this project? The passive
     session-telemetry hook records how the plugin's OWN skills ran (to `<project>/.vc-fix/`,
     gitignored) so `/vc-self-check` can spot plugin quality issues. It never sends anything
     without a separate consent step and never touches your code."*
   - Options: **Yes (recommended)** → `true` · **No** → `false` (hook stays a full no-op).
2. **feedback.mode** (upstream delivery consent — gates ONLY outbound `deliver`, never local
   capture/diagnosis; nothing is ever sent without scrubbing all client identifiers first):
   - Question: *"When vc-fix self-diagnostics finds a plugin quality issue, how should it be
     contributed back to VirtoCommerce to improve the plugin?"*
   - Options: **Ask each time (recommended)** → `ask` (dry-run + a single
     Show-diff/Send/Don't-send decision) · **Automatic** → `auto` (file the scrubbed GitHub
     Issue automatically; PR/fork-PR handed off as commands) · **Off** → `off` (nothing
     leaves the machine — the DIAG stays local).

Carry both answers to step 6: `--self-diagnostics <true|false>` and `--feedback-mode
<ask|auto|off>`. (If selfDiagnostics = No, feedback.mode is moot — capture is off — but pass
it anyway; it is harmless and keeps the profile explicit.)

## 3. Scaffold the two env templates, then hand off for filling

Using the env name + tracker + code host + auth preferences, create **both** env
files as commented templates. No values are collected here — the operator fills them.
**Do NOT pass `--project-type` / `--client-org`** — projectType and the client org are
derived by the scan (step 4), not chosen; leaving them off means scaffold-env emits no
`CLIENT_REPO_ORG` placeholder (it is derived).

### 3a. `.env.<env>` template (`scaffold-env.mjs`)

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/project-init/scaffold-env.mjs" --env myqa --tracker jira --client-vcs github --print
# Azure Repos client on Jira → ADO_ORG/ADO_PROJECT are emitted for the code host too:
node "$CLAUDE_PLUGIN_ROOT/skills/project-init/scaffold-env.mjs" --env acme --tracker jira --client-vcs azure-repos --print
```
Flags: `--env <name>` (required), `--tracker jira|azure`, `--client-vcs
github|azure-repos`. `ENV_RISK` and `ADMIN` are pre-filled with safe defaults;
everything else is empty. `ADO_ORG`/`ADO_PROJECT` are emitted when the tracker is
Azure **or** the code host is Azure Repos. Idempotent — a re-run only adds missing
keys, never clobbers.

### 3b. `.env.local` template (`scaffold-secrets.mjs`)

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/project-init/scaffold-secrets.mjs" \
  --env myqa --tracker jira --jira-auth token \
  --client-vcs github --github-auth pat --print
# client on Azure with session auth for both axes → app passwords + optional MCP keys only:
node "$CLAUDE_PLUGIN_ROOT/skills/project-init/scaffold-secrets.mjs" \
  --env acme --tracker azure --client-vcs azure-repos \
  --ado-auth az-login --github-auth gh-cli --print
```
Flags — **one per auth axis, from step 2d**: `--jira-auth token|oauth` · `--ado-auth
pat|az-login` (`az-login` ⇒ no `ADO_PAT`) · `--github-auth pat|gh-cli` (`gh-cli` ⇒ no
`GITHUB_FIX_BUGS_TOKEN`). App test-user passwords (`ADMIN_PASSWORD`/`USER_PASSWORD`,
`_<ENV>`-suffixed) are always emitted. **`POSTMAN_API_KEY` + `CONTEXT7_API_KEY` are
always emitted too, but as OPTIONAL placeholders** (blank ⇒ that MCP server stays
disabled; not needed for `/qa-fix`) — each with a "which tool it powers" comment.
(`--extras` is retained for back-compat but no longer gates them.) Idempotent.

### 3c. Tell the operator: two files created — fill them, then pause

Print a message that:
- says **two files were created**: `.env.<env>` (non-secret URLs/identifiers) and
  `.env.local` (secrets, gitignored),
- lists the placeholder keys each emitted,
- tells the operator to open both files and fill every value (the inline comments
  say what each is and where to get it), and
- says that once filled, the scan + verify (steps 4 + 8) proceed.

For any **browser-login** choice (github `gh auth login`, ado `az login`, Jira
Atlassian MCP OAuth) there is no token line — remind the operator to run that login
instead (see step 8's `ensure-session.mjs` for the driven flow).

**Then pause — wait for the operator to confirm both files are filled.** Make the
wait VISUALLY OBVIOUS: end the message with an unmistakable, set-apart call-to-action
on its own line — a blockquote banner such as
`> ⏸️ **WAITING FOR YOU** — fill in both files, then reply "done".`
Do not append any further tool calls after it — the turn ends there so the prompt
is the last thing on screen. (Reuse this banner wherever the pipeline blocks on the
operator.)

Note the env name (e.g. `myqa`) — that's your `TEST_ENV` for every later run.

## 4. Discover the repo split — ALWAYS run; it is the source of projectType

**After the files are filled**, run the scan **unconditionally** (it needs no
`--client-org` — clients are recognised by module owner / id-namespace). It classifies
installed modules client-vs-platform, scans the client's code host for the
storefront/theme repo, and **derives `projectType` + `clientOrg`**:

```bash
TEST_ENV=<env> node "$CLAUDE_PLUGIN_ROOT/skills/project-init/discover-repos.mjs" \
  --client-vcs <github|azure-repos> --out .local-env/repos.json --print
# (add --insecure only for a QA env with a self-signed cert)
```
It writes `{ projectType, clientOrg, client:[…], platform:[…] }`:
- **projectType** = `client` if any client module was found, the host is `azure-repos`
  (native VC always lives on GitHub), or a clientOrg resolved; else `platform` (native
  VC — the original default, every repo platform-owned).
- **clientOrg** = the owner of the discovered client modules (`ADO_ORG` for an
  azure-repos host).
- The **storefront/theme/frontend** repo is not a platform module; the scan lists the
  client's repos (Azure Repos via `ADO_PAT` / `az`, or GitHub via the fix token) and
  adds any name matching the theme/frontend heuristic as `kind:"frontend"`. It also
  captures each repo's **`defaultBranch`** (so `checkoutForFix` doesn't blind-guess `main`)
  and **best-effort provenance** for a storefront fork — `upstream` (the vc-frontend repo it
  was forked from) + `upstreamRef`. **`upstreamRef` is now a CONCRETE, VERIFIED upstream tag
  — the fork line's BASE (e.g. `2.49.0`), not the bare MAJOR.MINOR line label.** The scan
  takes the fork's `package.json` `version` (kept as `forkVersion`, e.g. `"2.49.7"`), reduces
  it to its `MAJOR.MINOR` line (`2.49`), then `git ls-remote --tags <upstream>` and picks the
  smallest existing tag on that line (its base) — the guaranteed common ancestor ≤ the fork
  (the fork's own patch has no upstream tag; the bare line label isn't a git ref — both 422 on
  `vc-frontend`). It records `upstreamRefResolved: true`. If the line was never tagged it falls
  back to the highest earlier tag; if ls-remote fails (offline / no token) it keeps the line
  label with `upstreamRefResolved: false` and ASKS. The resolved baseline appears both in the
  scan map (`… @ 2.49.0 (verified)`) and in the `verify-access` readiness table (**"Storefront
  upstream ref"** row). **This is what lets `/qa-fix` Gate 1b tell a client customization from
  an unmodified-platform bug** — if it couldn't be derived/verified, ASK the operator for the
  vc-frontend line base tag and set `repos.client[].upstreamRef` (e.g. `2.49` → `2.49.0`).

**Show the proposed map to the operator to confirm/correct** — a starting point, not
gospel. **Genuine-ambiguity asks (only these):**
- host = `github`, **no** client modules found, org not resolvable → ask the operator:
  native platform (no client repos), or name the client GitHub org.
- **no** storefront/theme repo matched → ask the operator to name it; add it to
  `repos.client` as `kind:"frontend"`.

## 4b. Discover the tracker status model — Azure Boards only

**This step is what lets `/qa-fix` transition tickets by role WITHOUT asking the operator.**
Scan the tracker's work-item TYPES and, per type, its allowed STATES (a custom process is
common — Bug/Task/User story can each differ), and derive a `role → System.State` map. Skip
for Jira (transitions are discovered live at runtime; the scan would add nothing):

```bash
# Azure Boards:
node "$CLAUDE_PLUGIN_ROOT/skills/project-init/discover-tracker.mjs" \
  --tracker azure --org "$ADO_ORG" --project "$ADO_PROJECT" \
  --types "Bug,Task,User story" --out .local-env/tracker.json --print
# Jira (format facts only — no state scan needed):
node "$CLAUDE_PLUGIN_ROOT/skills/project-init/discover-tracker.mjs" --tracker jira --out .local-env/tracker.json
```

It writes `.local-env/tracker.json`: `{ kind, ticketKeyFormat, crossLinkToken, apiBase,
projectId, workItemTypes:{<Type>:{states:[…]}}, roleStates:{in-progress,in-review,
ready-for-test,done} }`. Auth = `ADO_PAT` (Basic) or an `az login` session — the same creds
the operator filled in step 3; if neither is present yet, this step FAILS loudly (fix the ADO
auth, don't skip it — an empty `roleStates` makes `/qa-fix` fall back to asking on every
transition). Step 6 ingests it via `--tracker-json`. **Show the derived `roleStates` to the
operator to confirm** (e.g. a custom board maps `in-progress → Active`, `in-review → On Review`,
`ready-for-test → Ready for QA`) — the heuristic is a starting point; correct a mismapped role
by hand-editing `.local-env/tracker.json` (or the profile) before continuing.

`--out` is optional (accepts `--out <path>`; the default flag set here writes it so step 6 can
read it). If you omit `--out`, capture the printed JSON and pass its path to step 6 another way.

## 5. Derive the rest — no questions

Run the **derive block**: it reads the filled env + live sessions and derives the auth
actually present, the contribution mode, the fork account, and the operator role:

```bash
TEST_ENV=<env> node "$CLAUDE_PLUGIN_ROOT/skills/project-init/derive-context.mjs" \
  --tracker <jira|azure> --client-vcs <github|azure-repos>
```
It prints ONE JSON object on stdout (notes on stderr):
```json
{ "auth": { "github": "pat|gh-cli|none", "ado": "pat|az-login|none|n/a", "jira": "token|none|n/a" },
  "github": { "login": "...", "upstreamPerm": "push|pull...", "contributionMode": "direct|fork",
              "forkAccount": "...", "via": "PAT|gh CLI" },
  "operator": "virto-engineer|client", "upstreamOrg": "VirtoCommerce" }
```
- **contributionMode / operator** — from the token's permission on
  `VirtoCommerce/vc-platform`: `push`/`maintain`/`admin` ⇒ `direct` / `virto-engineer`;
  otherwise ⇒ `fork` / `client` (you PR from your own fork). No token / offline ⇒
  safe default `fork` (verify-access confirms).
- **forkAccount** — the GitHub token owner's login (PR head = `<forkAccount>:<branch>`;
  only used when `contributionMode=fork`).

Capture these values for step 6.

## 6. Write the deployment profile

Write the profile from the **scan output + derived values** (projectType + clientOrg
come from the repos-json — no flags for them). Read the tracker connection back from the
filled `.env.<env>`:

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/project-init/gen-profile.mjs" \
  --repos-json .local-env/repos.json \
  --tracker-json .local-env/tracker.json \
  --runtime-mode plugin \
  --tracker jira --tracker-base-url https://acme.atlassian.net --tracker-project ABC \
  --client-vcs github \
  --operator <derived> --contribution-mode <derived> \
  --upstream-account <forkAccount, only if fork> \
  --self-diagnostics <true|false, from step 2e> --feedback-mode <ask|auto|off, from step 2e> \
  --vcs-auth <derived: client host's auth — github⇒gh-cli|pat, azure-repos⇒az-login|pat> --print
# Azure Boards + Azure Repos:
#   ... --tracker azure --azure-org acme --azure-project Web --client-vcs azure-repos --vcs-auth pat ...
```
`--repos-json` supplies `projectType`, `vcs.clientOrg`, and the client/platform repo
lists in one shot. **`--tracker-json .local-env/tracker.json`** (from step 4b) bakes the
tracker status model (per-type states, `roleStates`, `apiBase`, `projectId`, `ticketKeyFormat`,
`crossLinkToken`) and flips `transitionPolicy` to `auto` — WITHOUT it the Azure profile has an
empty `roleStates` and `/qa-fix` falls back to asking on every transition. **`--runtime-mode
plugin`** is REQUIRED when running from an installed plugin: gen-profile's env auto-detect
(`$CLAUDE_PLUGIN_ROOT`) is unreliable because that var is not exported into the node process,
so pass the flag explicitly — this sets `runtime.mode=plugin` / `helpersRunnable=false` so the
interactive commands read the baked profile facts. (Developing directly in the agent repo?
Omit the flag → `agent-project`.) Explicit `--project-type` / `--client-org` flags still
override, but in the normal flow you do **not** pass them — the scan is authoritative.

If step 4 surfaced a storefront/theme repo the scan couldn't classify, hand-edit
`project-profile.json` `repos.client` to add it (or fix any miscategorised entry).

**No plugin path is baked into the profile — it is resolved at runtime.** gen-profile does
NOT write `paths.pluginRoot` (a versioned cache dir `…/vc-fix/<version>` would freeze to a
stale/deleted version on the next upgrade). Instead every command's `node "$pluginRoot/skills/…"`
resolves `$pluginRoot` = the ACTIVE (enabled) install at call time via `claude plugin list --json`
(fallback: a highest-semver scan of `~/.claude/plugins/cache/*/vc-fix/`). See
[`knowledge/execution/plugin-root.md`](../../knowledge/execution/plugin-root.md). Result:
**no re-run of `/project-init` after an upgrade**, no version-stamped path, no stale link.

## 7. Generate `.mcp.json`

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/project-init/gen-mcp.mjs" --tracker jira --client-vcs github \
  --with context7            # add postman,figma,devtools as needed
```
Enables playwright×3 + github + the tracker's MCP (atlassian for Jira; azure-mcp
for Azure). **Remind the operator to restart the MCP servers** (reload the IDE)
for the new config to take effect.

## 8. Verify access — full readiness checkup

Run with the env selected (so per-env creds resolve). **Pass `FORCE_COLOR=1`** —
the table colours the Status column, but the script auto-disables colour when stdout
is not a TTY and the harness runs this through a pipe, so without `FORCE_COLOR=1` the
operator only ever sees a plain table.

```bash
FORCE_COLOR=1 TEST_ENV=<env> node "$CLAUDE_PLUGIN_ROOT/skills/project-init/verify-access.mjs"
```

Prints a bordered readiness table + a **READY / NOT READY** verdict for `/qa-fix`.
Checks (PASS / FAIL / WARN / SKIP): deployment profile · **plugin root** (`claude plugin list --json`
resolves the active vc-fix install and `skills/qa-fix-routing/ado.mjs` is present under it;
WARN if the `claude` CLI isn't on PATH) · core env vars · storefront
URL · admin/platform URL · **admin login** (real `POST {BACK_URL}/connect/token`
password grant) · storefront user login (soft WARN) · tracker token (Jira `GET /myself`
or a **real ADO org probe**) · **GitHub fix token / gh session** (validates the token and
its permission on the upstream — shared with the derive block via `probe-lib.mjs`, so
what verify reports and what the profile stored can't drift) · **client repos** (for a
client deployment, each `repos.client` entry is probed for reach + push on its own host —
GitHub `permissions.push` or an Azure Repos `_apis/git/repositories/<repo>` JSON hit — so a
dead client-repo token surfaces here, not at Gate 2; native platform ⇒ SKIP) · **Storefront
upstream ref** (a client frontend fork's `upstreamRef` resolves in `vc-frontend` — PASS; missing /
`upstreamRefResolved:false` / doesn't resolve — WARN, since Gate 1b reconstructs/asks; no fork ⇒
SKIP). Resolve every **FAIL**
(exit code is non-zero while any FAIL remains); **WARN** is non-blocking; **SKIP** means
a feature isn't configured.

**Session auth is really probed, not assumed.** For an `az-login` / `gh-cli` axis the
check mints a real token and hits the org / upstream — an active session that is not a
member (or is in a different tenant) is reported **FAIL**, not a false PASS. On a session
FAIL, do NOT make the operator hand-craft commands — run **`ensure-session.mjs`** (it
auto-discovers the ADO org's tenant and drives `az login --tenant <guid>` /
`gh auth login --web`, then re-probes):

```bash
TEST_ENV=<env> node "$CLAUDE_PLUGIN_ROOT/skills/project-init/ensure-session.mjs"           # establish
TEST_ENV=<env> node "$CLAUDE_PLUGIN_ROOT/skills/project-init/ensure-session.mjs" --check   # probe only
```
`az login` / `gh auth login` are **blocking** — **launch `ensure-session.mjs` in the
background** and let the operator complete the single browser consent, then re-run
verify-access. For a fully non-interactive setup use a PAT instead.

**After the readiness table it also prints the MCP-servers section** — `OK` (local) ·
`AUTHORIZED` (token/key/az present) · `NEEDS OAUTH` (atlassian / figma) · `NO KEY`
(optional server, key unset).

**Surface the result in your reply — do NOT leave it only in the script's stdout.**
The table is tool output, which many clients collapse or hide. **Restate the readiness
table AND the MCP-server status as Markdown tables in your chat message**, mapping each
row to the surface it proves — **front** = `FRONT_URL` (+ storefront user login),
**back** = `BACK_URL` + admin login, **Jira/tracker** = tracker token, **Git** = GitHub
token + gh CLI — and end with the `N PASS · N FAIL · N WARN · N SKIP` line and the
READY / NOT READY verdict.

## 9. Done

Present this as an explicit, labelled **Step 9** in your reply (the operator tracks the
pipeline by step number). Summarise what was written (profile path, tracker, VCS, repo
counts, derived projectType / contributionMode), list the remaining **manual** actions
(reload the IDE for `.mcp.json`; any interactive OAuth still pending, e.g. Atlassian),
and point the operator at the first run:

```
/qa-fix VCST-1234        # (or your tracker's key) — now routes to the right repo
```

---

## `--check` — reconcile an existing profile, then verify

`/project-init --check` is for a deployment that is ALREADY onboarded — most often
**after a plugin upgrade**. The schema (`PROFILE_DEFAULTS` in `scripts/lib/project-profile.mjs`)
evolves between versions — fields are **added** (e.g. `selfDiagnostics`), **removed**
(e.g. the old baked `pluginRoot`), or need a fresh **rescan** (repos / tracker role model
drift) — but the on-disk `project-profile.json` was written once and goes stale. `--check`
brings it back in line with the current schema, then runs the readiness table. It does
**NOT** re-run the interview.

### Step A — reconcile the profile (deterministic, dry-run first)

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/project-init/reconcile-profile.mjs" --print
```

`reconcile-profile.mjs` diffs the profile against the current schema and prints a JSON
report — no writes, no scans, no questions of its own:

- **`added`** — schema fields missing from the profile that have a SAFE default (filled
  automatically on `--write`). Discriminated blocks (`tracker.azure`, `vcs.azure`) follow
  the same rule `gen-profile` uses, so a Jira+GitHub profile is never re-grown an `azure:{}`.
- **`removed`** — obsolete fields no longer in the schema (pruned on `--write`). **Open
  maps** (`tracker.azure.roleStates`/`stateMap`/`workItemTypes`) and **arrays** (`repos.*`)
  are kept wholesale — their contents are data, not schema.
- **`pending`** — fields whose value is the OPERATOR's decision (a privacy / behaviour
  opt-in, e.g. `selfDiagnostics`). Each carries its own `question` + `options`; **never**
  auto-filled.
- **`rescan`** — fields that should be re-derived from a live scan (repos / tracker).

`status:"no-profile"` ⇒ never onboarded — run the **full interview** instead, don't reconcile.
`status:"current"` ⇒ nothing stale — skip to **Step C**.

### Step B — resolve decisions + rescans, then write

- For each **`pending`** entry, ask the operator with **`AskUserQuestion`**, using the
  entry's own `question` + `options` (make the `default` value the Recommended option).
- For each **`rescan`** entry, re-run the matching discovery (`discover-repos` /
  `discover-tracker`) and fold the result back via `gen-profile --merge` (§ Re-running).
- Then apply everything in one write, one `--set path=value` per resolved decision:

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/project-init/reconcile-profile.mjs" --write \
  --set selfDiagnostics=<true|false> \
  --set feedback.mode=<auto|ask|off>
```

`feedback.mode` (VCST-5509) is the DELIVERY-consent opt-in — it gates only the outbound
`/vc-self-check deliver` step, never local capture/diagnosis. Default `ask` = a dry-run +
a single Show-diff/Send/Don't-send decision; `auto` = the Issue route files automatically
(scrubbed) and a PR/fork-PR is handed off as commands; `off` = nothing ever leaves the
machine. It surfaces as its own `pending` entry with a three-way `question`/`options`.

`--write` applies the structural adds/removes plus any `--set` decisions. Unresolved
`pending`/`rescan` fields are left **absent** — safe, because a missing field reads as its
safe default (no `selfDiagnostics` ⇒ the telemetry hook is a full no-op; no `feedback`
⇒ delivery falls back to `ask` — a dry-run + confirm, never an unattended send) — and stay
in the report so a later `--check` can finish
them. Reconciling is **idempotent**: once done,
the report is `current`.

If a `--write` would remove **≥5 fields** it returns `status:"needs-force"` and writes
nothing — that many removals usually means a schema mismatch (reconciling against a leaner
schema than the one that wrote the profile), not stale fields. **Review the `removed` list**;
only if the removals are genuinely intended, re-run with `--force`.

### Step C — verify access

Run the readiness table (§8) so a stale token / URL / login surfaces too:

```bash
FORCE_COLOR=1 TEST_ENV=<env> node "$CLAUDE_PLUGIN_ROOT/skills/project-init/verify-access.mjs"
```

**Restate BOTH** the reconciliation summary (added / removed / decided) **and** the
readiness table in your reply.

---

## How this makes `/qa-fix` route correctly

Once the profile exists, the fix pipeline uses it automatically:

- **Ownership** — `repoOwnership(repo)` (from `repo-router.ts`) returns `client`
  for repos under the client org / in `repos.client`, else `platform`.
- **Client bug** → fix + PR into the client repo (GitHub or Azure Repos per
  `vcs.clientHost`).
- **Platform bug, fixable** (passes the G0/G1 gates) → fix + PR to the VirtoCommerce
  repo (a **fork-PR** when `contributionMode=fork`, a direct PR for a Virto engineer
  with write access).
- **Platform bug, NOT fixable** (multi-module / complex / breaking) → **file a
  GitHub issue** on the open upstream repo (no PR).
- **Tracker** — comments + status transitions go to Jira or Azure Boards per
  `tracker.kind`.

Client-code containment (`.claude/rules/quality-gates.md` §2a) is enforced regardless:
client code never leaves the client project. Gate ladder is unchanged. Never auto-merges.

## Re-running

Safe to re-run. `gen-profile`/`gen-mcp` overwrite their outputs; `--merge` layers
onto the existing profile. To reconfigure one dimension, re-run `gen-profile`
with just those flags + `--merge`. To re-derive after a token/session change, re-run
`discover-repos` + `discover-tracker` + `derive-context` and regenerate the profile.

**Existing profiles** written before the verified-`upstreamRef` change are safe to leave —
Gate 1b reconstructs a resolvable ref on the fly. A `/project-init` re-run (or just re-running
`discover-repos`) refreshes them to a concrete tag; alternatively an operator can hand-fix
`repos.client[].upstreamRef` from the bare line label to that line's base tag (e.g. `2.49` →
`2.49.0`).

## Scripts

| Script | Role |
|--------|------|
| `scaffold-env.mjs` | write a commented `.env.<env>` **template** (non-secret URL/identifier/tracker placeholders + what/example comments); topology-driven, idempotent |
| `scaffold-secrets.mjs` | write a commented `.env.local` **template** (secret placeholders + what/why/where per secret); topology-driven, idempotent |
| `write-env.mjs` | (non-interactive helper) write `.env.<env>` / `.env.local` from a JSON answer object on STDIN when values ARE known programmatically; idempotent |
| `discover-repos.mjs` | ALWAYS-run scan: Platform API modules → client/platform split, client-host scan for the storefront repo, and **derives projectType + clientOrg**; bakes per-repo `contribution`/`integrationBranch`/`toolchain`/`localVerify`; emits `{ projectType, clientOrg, client, platform }` |
| `discover-tracker.mjs` | **Azure-only** scan of work-item types → per-type `states` + a `role→state` map (`roleStates`), plus `apiBase`/`projectId`/`ticketKeyFormat`/`crossLinkToken`; emits `.local-env/tracker.json` for `gen-profile --tracker-json`. Jira: format facts only (transitions discovered live). Enables `/qa-fix`'s silent role-based transitions |
| `derive-context.mjs` | the **derive block**: reads the filled env + sessions, probes the upstream permission, emits JSON — auth actually present per axis, contributionMode, forkAccount, operator |
| `probe-lib.mjs` | shared side-effect-free probes (GitHub-upstream permission, ADO tenant/auth) used by BOTH `verify-access` and `derive-context` so their results can't drift |
| `gen-profile.mjs` | write/merge `project-profile.json` from the repos-json (projectType/clientOrg/repos) + derived flags (operator/contributionMode/upstream-account/vcs-auth) + tracker connection |
| `reconcile-profile.mjs` | **`--check` migration**: diff an existing profile against the current `PROFILE_DEFAULTS` schema → JSON report of `added` (safe-default) / `removed` (obsolete, open-maps+arrays preserved) / `pending` (operator-decision fields with `question`+`options`, e.g. `selfDiagnostics`) / `rescan` (re-derive live). Deterministic, dry-run by default; `--write` applies structural changes + `--set path=value` decisions. Idempotent. Mirrors `gen-profile`'s `tracker.azure`/`vcs.azure` discriminated pruning |
| `gen-mcp.mjs` | write `.mcp.json` (OS-aware) into the project + enable servers for the tracker/VCS. Playwright servers are flags-only (`--browser` / `--isolated` / `--viewport-size` / `--output-dir`) — no config files; only `playwright-chrome` is enabled by default |
| `lib/paths.mjs` | shared path helper — `outputRoot()` (`VC_FIX_HOME` \|\| `process.cwd()`, where generated state goes) + `pluginRoot()` (`CLAUDE_PLUGIN_ROOT` \|\| resolved from `import.meta.url`, used by a running script to find its own read-only plugin assets). Keeps every generator writing to the project and reading templates from the plugin. (Commands resolve their launch path via `claude plugin list --json` — see `knowledge/execution/plugin-root.md`.) |
| `verify-access.mjs` | full `/qa-fix` readiness table + verdict; prints an untruncated "To resolve" block (incl. an auto-discovered `az login --tenant <guid>`) |
| `ensure-session.mjs` | establish the browser-login sessions WITHOUT hand-crafted commands: auto-discovers the ADO org tenant and drives `az login --tenant <guid>` / `gh auth login --web`; `--check` probes only. Run in the background (the login blocks on the browser). |

> The interview asks only **env name · tracker · code host** + an auth preference
> per axis + the **self-diagnostics consent** (step 2e: `selfDiagnostics` capture
> opt-in + `feedback.mode` upstream-delivery consent — same two decisions the `--check`
> reconcile surfaces). Both env files are scaffolded as commented templates the operator fills;
> the scan (step 4) derives projectType + clientOrg, the derive block (step 5) derives
> contribution mode + fork account + operator, and verify-access (step 8) confirms.
> The existing `bootstrap/install.ts` (`npm run plugin:configure`) wizard remains an
> optional interactive fallback.
