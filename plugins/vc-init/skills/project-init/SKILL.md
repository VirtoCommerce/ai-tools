---
name: project-init
description: "Initialize / onboard the Virto Commerce plugins (vc-fix, vc-perf, …) onto a deployment. Checks that vc-secrets is installed, installs deps, then asks the operator only what genuinely shapes the config — the environment NAME, the tracker (Jira / Azure Boards), the code host (GitHub / Azure Repos), and an auth preference per axis (PAT recommended, else browser/CLI login). Every PAT is stored in vc-secrets by the operator in a terminal — never typed in chat, never written to a file — and reaches a process only through the $VC_RUN bridge. Everything else — native-platform or CLIENT project, the client org, the contribution mode, the fork account — is DERIVED from the token + the filled env + a live module/repo scan. Writes project-profile.json + .env.<env> (per-env URLs) + .env.local (the tracker / code-host connection, the same for every env, + test-user passwords) + .mcp.json + the vc-secrets declarations + the always-loaded rule that browser work goes only through the Playwright MCP lanes (.claude/rules/vc-browser.md), and verifies access. That one profile is what every installed plugin reads — vc-fix routes a bug to the RIGHT repo and tracker with it, vc-perf finds the stand and the code with it. Use when standing the plugins up on a new machine or for a new customer. On a host-governed project (a client governance plugin owns MCP servers and secrets) it checks that the host's own setup has run (and stops with its command when it has not), reads the servers and test-user password slots that setup left, and skips every token / MCP step of ours. Day-2 modes skip the interview: `--add-env` adds another environment (URLs + per-env passwords) to an already-onboarded project; `--add-user` adds another storefront user or admin (login in `.env.<env>`, password in vc-secrets or `.env.local`); `--check` reconciles an existing profile to the current schema, moves any plaintext token into vc-secrets, then verifies."
---

# /project-init — deploy & wire this QA plugin for a customer

Stand up this plugin against a customer's infrastructure and produce a single
**deployment profile** (`project-profile.json`) that every other skill reads to
know what it's working with — the tracker, the code host and its repositories (client module /
theme / storefront fork **or** the native VirtoCommerce platform), the stands. It serves every
installed plugin, not one of them: the close (§9) says the project is ready and lists what the
operator can do now, built from the plugins actually installed.

> **Ask only what shapes the config; DERIVE the rest.** The interview is three
> answers — **env name · tracker · code host** — plus a soft auth preference per
> axis. `projectType` (native-platform vs client), the client org, the
> contribution mode (fork vs direct), and the fork account are **not asked** —
> they are derived from the token's permissions + the filled `.env` + a live
> module/repo scan. Ask again only on a *genuine* ambiguity.

> **Additive, never destructive.** This skill only *adds* a profile + config; nothing existing is
> rewritten. It is also **required**: vc-fix and vc-perf STOP with "run /project-init" when
> `project-profile.json` is absent (VCST-6402) — there are no silent native-platform defaults.

> **No token in chat, no token in a file.** A PAT (GitHub, Azure DevOps, Jira API token) is stored by
> the OPERATOR, in their own terminal, with `node "<VC_SECRETS>" set <name>` at a hidden prompt.
> You never ask for one, never see one, and never run `set` or `trust` yourself (both need a real
> terminal and both are the operator's review). Every script that needs a token runs through the
> bridge — `node "$VC_RUN" onboard <script> …` — which gets it from vc-secrets at launch.

> **Three day-2 modes** (skip the interview): **`--add-env`** — add another environment
> (URLs + per-env access creds) to an already-onboarded project (§`--add-env` below);
> **`--add-user`** — add another storefront user or admin to one or more environments
> (§`--add-user`); **`--check`** — reconcile an existing profile to the current schema after a
> plugin upgrade, then verify (§`--check`).

## What it produces

| Artifact | Purpose |
|----------|---------|
| `project-profile.json` (gitignored) | the deployment profile (`schemaVersion` 3) — read by vc-fix (`config.js`, `skills/qa-fix-routing/repo-router.ts`, `skills/qa-fix-routing/trackers/*`) and vc-perf. vc-init is its ONLY writer: other plugins persist into it through `profile-set.mjs` |
| `.env.<env>` + `.env.local` | Both scaffolded as **commented templates** the operator fills in — no values are asked in the interview. `scaffold-env.mjs` writes `.env.<env>` (per-env URLs/identifiers) and, ONCE, the project-level keys its `CATALOG` marks `scope: "project"` — the tracker / code-host connection (`JIRA_BASE_URL`/`JIRA_PROJECT_KEY`/`JIRA_EMAIL`, `ADO_ORG`/`ADO_PROJECT`, `CLIENT_REPO_ORG`), the same for every env — into `.env.local`; `scaffold-secrets.mjs` adds the test-user passwords (`_<ENV>`-suffixed) to `.env.local`. No token goes into either. |
| `.claude/vc-secrets.local.json` (gitignored) | the vc-secrets declarations (`write-secrets-decl.mjs`): one `local` secret per PAT axis (`github-pat` / `ado-pat` / `jira-token`), the `vc-init-*` tasks the `$VC_RUN` bridge dispatches to, and the GitHub MCP server. Reviewed and approved by the operator with `vc-secrets trust` |
| `.mcp.json` + `.claude/settings.local.json` | MCP servers enabled for the chosen tracker/VCS (via `gen-mcp.mjs`); `settings.local.json` `env` carries `VC_RUN` (a path, not a secret) and no token. The Playwright servers are configured entirely via CLI flags (`--browser` / `--isolated` / `--viewport-size` / `--output-dir`). Only `playwright-chrome` is enabled by default; `playwright-firefox` / `playwright-edge` stay defined for opt-in cross-browser runs. |
| `.claude/rules/vc-browser.md` (**committed**, not ignored) | the always-loaded agent rule (`write-agent-rules.mjs`, §7): every browser action goes through a Playwright MCP lane — never the built-in browser pane, Claude in Chrome, Chrome DevTools or a Bash-started browser, none of which can type a password. Lives in the project so it binds every plugin, including ones installed later. Copied from `templates/rules/` |

## Pipeline

```
0 preconditions (confirm dir · self-diagnostics consent FIRST + write flag · vc-secrets ready + bridge · install)
→ 2 interview (env name · tracker · code host · auth pref)
→ 3 scaffold BOTH env templates + vc-secrets declarations → operator fills the files, trusts, stores tokens → pause
→ 3d check-secrets (doctor gate) + normalize + validate the filled .env.<env> — STOP on either failing
→ 4 discover repos (ALWAYS, via $VC_RUN onboard) → projectType · clientOrg · repo split · storefront
→ 4b discover tracker (Azure, via $VC_RUN onboard) → per-type states · role→state map · apiBase · projectId
→ 5 derive block (via $VC_RUN onboard) → auth-fact · contributionMode · forkAccount · operator
→ 6 write profile (gen-profile: repos-json + tracker-json + derived flags) → 7 MCP (gen-mcp)
→ 8 verify (via $VC_RUN onboard) → 9 done
```

All scripts live in the plugin's own `skills/project-init/` directory and are
**non-interactive** — you (the model) collect the interview answers, run the scan +
derive scripts, then call the writers with the results as flags. Every script that talks to
GitHub, Azure DevOps or Jira with a token runs as `node "$VC_RUN" onboard <script> …` (§0d says
how `$VC_RUN` is set in this session); the writers (scaffold-*, gen-*, normalize-env,
write-secrets-decl, check-secrets, reconcile-profile) need no token and run directly.

### Output discipline — the operator is onboarding, not reading a report

Onboarding is the operator's FIRST contact with the plugin. Every extra table teaches them that
this tool is heavy, and it buries the two or three things they actually have to decide. Three
rules, applied at every step:

1. **A question goes immediately after the thing it asks about.** Never table → table → table →
   question: the operator has to scroll back, so they approve unread. One table, one question,
   nothing in between.
2. **Show what the operator can DECIDE. Summarise what they cannot.** A scan result they can
   correct earns a table. A derived fact (a token's permission, an API base) earns ONE line — or nothing. **The two
   scan results the operator CONFIRMS — the repo map (§4a) and the tracker status map (§4b) — are
   shown in FULL**, as `render-scan.mjs` prints them: a confirmation of a table the operator never
   saw is not a confirmation. Internals that only feed `/qa-fix`
   (`apiBase`, `projectId`, `forkAccount`, `upstreamRef`, local-verify commands) go into the
   profile, not onto the screen.
3. **Exceptions get the space, happy paths get a line.** Anything that resolved cleanly is one
   line; anything WARN/missing/unverified gets its own line or small table and says what to do.
   That contrast is what makes a real problem visible.

Never print the same fact twice in two shapes (a "provenance" table repeating a Notes column, a
role grid restating "all roles mapped"). If it is already on screen, reference it.

### Output FORMAT — two shapes, used consistently

Two client-side constraints decide this format; both were confirmed on a live run, not assumed:

- **Colour is unavailable.** This output is Markdown and the client paints it — an ANSI escape
  never reaches the screen.
- **`---` does NOT render as a rule** in the Claude Code terminal — it prints as three literal
  dashes. Do not use it as a separator. **Box-drawing characters always render**, because they
  are ordinary text, not markup.
- **Markdown collapses adjacent lines into one paragraph**, so a multi-line frame only survives
  inside a fenced code block — which is also what gives it a real border on both surfaces.

Reliable everywhere: box-drawing (`┌─┐│└┘`), CAPS, **bold**, `code`, emoji, fenced blocks.

**1. Step header — a framed, iconed, CAPS name in a fenced block.**

````markdown
```
┌──────────────────────────────┐
│  ⚙   ENVIRONMENT NAME        │
└──────────────────────────────┘
```
````

- Size the frame to the text (a couple of spaces of padding); do not pad to a fixed width — a
  long step name in a narrow box wraps and the frame breaks.
- **The frame replaces the separator.** It already stops the eye, so no rule is needed above it.
- **Icon per step kind** — one consistent glyph, so a returning operator recognises the phase
  before reading it:

  | Icon | Step kind | Examples |
  |---|---|---|
  | 📁 | preconditions / where things land | confirm directory |
  | 🔒 | consent + credentials | self-diagnostics consents, auth preference |
  | ⚙ | interview / configuration | environment name, tracker + code host |
  | 📝 | generating files | env templates, profile, `.mcp.json` |
  | 🔍 | scanning / deriving | repo split, tracker states, derive block |
  | ✅ | verification | readiness table |
  | 🎉 | finished | the wrap-up |

- **No step numbers.** `2a` / `4b` / `0c` are THIS file's internal numbering; they mean nothing
  to the operator. (They stay here in the doc — the model and the reviewer navigate by them.)

**2. A question asked in PLAIN CHAT — question first, WAITING last.**

```markdown
**What should this environment be named?**

It becomes `TEST_ENV` and the suffix of the env file (`.env.<name>`). Typical: `qa`, `dev`,
`staging`, or a customer short name like `acme_qa`. I normalise it to `[a-z0-9_]+`.

⏸️ **WAITING FOR YOU** — reply with the name.
```

Why this order:

- **The question comes FIRST, as its own bold line.** The original banner said only "waiting"
  while the actual ask sat buried mid-paragraph above it — a cue with no question attached, so
  the operator scrolled past both.
- **Context in the middle**, ≤2 lines: what the value becomes, typical answers, what you do to it.
- **`⏸️ WAITING FOR YOU` is the LAST line**, and names the action (`reply with the name`,
  `reply "done"`). It is the hand-off, so it belongs at the hand-off point — the operator's eye
  lands there last and knows exactly what to type.
- **Nothing follows it.** No further prose, no tool call — the turn ends so the ask stays on
  screen.
- No progress counter (operator's call — noise on a 3-question interview).

**When the question is an `AskUserQuestion`, drop the WAITING line.** That tool renders its own
picker, so the banner is duplicate chrome. Framed step header, one line of context if the
options need it, then the tool call.

**A CONFIRMATION of a scan (§4a repos, §4b statuses) is NOT an `AskUserQuestion` — it is shape 2,
and it ENDS the turn.** The desktop client folds every piece of text written BEFORE a tool call into the
collapsed activity group and shows a generated one-line summary in its place. `AskUserQuestion` is a
tool call, so a table written above it is hidden from the operator, whatever the skill says: two live
runs showed an English one-sentence summary ("I found 2 client repos …", "I've mapped out how tracker
statuses correspond …") where the table had been, under a picker asking whether "the table" was right.
Only the LAST message of a turn is shown in full. So: framed header → the table exactly as
`render-scan.mjs` printed it → the bold question → `⏸️ WAITING FOR YOU — reply "yes", or name what to
change` → end the turn, no tool call after it. The operator answers in chat.

### Where things go — read this once (three roots, kept separate)

- **Plugin install directory** (`$CLAUDE_PLUGIN_ROOT` — vc-init's versioned marketplace cache
  when installed, or this checkout when developing): holds the read-only scripts and templates.
  **Invoke every generator by its ABSOLUTE path here** — `node "$CLAUDE_PLUGIN_ROOT/skills/project-init/<name>.mjs" …`.
  Do **not** use a bare relative `node skills/…` path: your Bash working directory is the
  deployment project, not the plugin. (The bash examples below show `$CLAUDE_PLUGIN_ROOT/` — use
  the literal path you resolved in §0a.)
- **The bridge** (`$VC_RUN` — `~/.claude/plugins/data/vc-init-ai-tools/vc-run.mjs`, installed in
  §0d): a stable pointer to this plugin's `bridge/run.mjs`. Every token-holding script runs as
  `node "$VC_RUN" onboard <script> …`; it gets the token from vc-secrets at launch. `VC_RUN` reaches
  your shell only after Claude Code restarts with the settings `gen-mcp.mjs` writes — **in THIS
  session use the literal path `install-bridge.mjs` printed**, wherever this file says `$VC_RUN`.
- **Deployment project directory** (your Bash cwd — the folder Claude Code was launched
  in): where **all generated state lands** — `project-profile.json`, `.env.<env>`,
  `.env.local`, `.mcp.json`, `.claude/settings.local.json` and `.claude/vc-secrets.local.json`.
  The generators default their output there automatically (symmetric with the readers). You do
  **not** pass an output path in the normal flow. `VC_FIX_HOME=<dir>` overrides the output root
  only for out-of-project / CI callers — the interactive flow never sets it.

**Every generator flag you need is documented in the steps below — never inspect the
`.mjs` scripts (and never pass `--help`: unrecognised flags are treated as booleans and
the script runs anyway, writing a default file).**

---

## 0. Preconditions — confirm the working directory, vc-secrets, then detect AND install tooling

### 0a. Confirm the deployment project directory (everything lands here)

Run `pwd` and show the operator the current directory. **This is your deployment project
home** — everything `/project-init` generates (profile, env files, `.mcp.json`, the vc-secrets
declarations) is written here, and every later run (`/qa-fix`, `/qa-bug`) reads its config from
here. Confirm with `AskUserQuestion`:

- **Yes — initialize here (`<cwd>`)** (Recommended) → proceed.
- **No — wrong folder** → **STOP.** Tell the operator to relaunch Claude Code from their
  deployment project directory, then re-run `/project-init`. (The Bash working directory is
  fixed to wherever Claude Code was launched and cannot be moved outside it mid-session, so
  the project home must be chosen at launch — not with `cd`.)

Then resolve the **plugin directory** once, so you can invoke the generators by absolute
path: `echo "$CLAUDE_PLUGIN_ROOT"`. If it prints a path, use it. If empty, locate the
installed vc-init (`claude plugin list --json` → the enabled `vc-init@ai-tools` entry's
`installPath`, or the absolute directory this SKILL.md loaded from — two levels up). Use it as
the `$CLAUDE_PLUGIN_ROOT/…` prefix for every generator call in the steps below.

### 0-host. Is this a host-governed project? — before anything else

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/project-init/detect-governance.mjs" [--governance <plugin@marketplace|none>]
```

It looks for a plugin bound to THIS folder (installed for it, or enabled in its settings) that is not ours and ships MCP servers and a `SessionStart` hook — no host is known by name, and one installed for another folder does not count.
`detected: null`, no `machineWide` or `inactive` entry and no `--governance` ⇒ the normal flow below (a
`machineWide` / `inactive` entry is handled as [`host-governed.md`](host-governed.md) §1 says). A host found (or named with
`--governance <host>`) ⇒ confirm with `AskUserQuestion` (host-governed / not — the operator decides),
then follow [`host-governed.md`](host-governed.md) — the host's own setup command runs first, vc-init reads what it left — instead of the token steps: our plugins are a
guest there — **no vc-secrets, no `$VC_RUN`, no `.mcp.json` or settings written, no PAT, no
`az login`**, the host's rules win. `/project-init --governance <plugin@marketplace|none>` overrides detection.

### 0b. Self-diagnostics capture consent — ask FIRST, write the flag NOW

**This is the FIRST interactive decision of the whole run** — before installing tooling
and before the interview. Reason: the passive session-telemetry hook captures **opt-in**
— it is a full no-op until `project-profile.json` explicitly sets `selfDiagnostics: true`.
`/project-init` writes its profile only at the *end* of onboarding, so if we waited, its
OWN run (the most failure-prone skill a client runs) would never be captured. Asking now +
writing the flag immediately makes the rest of this run observable from this point on.

Ask with **`AskUserQuestion`** — a single question, wording taken **verbatim** from
`reconcile-profile.mjs` `MANAGED_FIELDS.selfDiagnostics.question` so the fresh interview and
`/project-init --check` never diverge (make the first option the `default`):

> *"Enable self-diagnostics for this project? A passive hook records how the skills of the
> installed plugins ran (locally in the project folder, gitignored) so `/vc-self-check` can spot
> plugin quality issues. It never sends anything without a separate consent step and never touches
> your code."*

- **Yes (recommended)** → **immediately** write a stub profile carrying just the flag, so
  capture turns on right away (`gen-profile` layers over `PROFILE_DEFAULTS`, so this writes a
  complete-but-default profile with `selfDiagnostics: true` — step 6 rewrites it fully from the
  interview + scan, so the stub is disposable):

  ```bash
  node "$CLAUDE_PLUGIN_ROOT/skills/project-init/gen-profile.mjs" --self-diagnostics true --print
  ```

- **No** → write nothing now; capture stays off for this run (opt-in). Remember the answer.

**Carry the answer to step 6** as `--self-diagnostics <true|false>` (step 6's authoritative
write re-passes it, so the final profile always reflects this decision). This is the ONLY place
`/project-init` asks the capture opt-in — no other command asks it; they just read the flag.
(Note: the `session_start` record still misses this run — `SessionStart` fired before the flag
existed — but every span + the finalize verdict are captured from the write onward. Accepted.)

### 0c. Upstream-delivery consent is NOT asked here (PR #172 item 4)

> There used to be a second consent step here for `feedback.mode` (ask / auto / off). It was
> **removed**. Asking at onboarding meant the operator had to decide how a finding should be
> contributed **before any finding existed** — a context-free question, minutes after the capture
> opt-in, about a decision only meaningful when there is actually something to send.

The delivery flow now asks **once, per finding, at the moment a BROKEN/DEGRADED finding exists**:
`/vc-self-check` spawns the diagnostician, and if it returns a routable finding the orchestrator
asks a single binary *file the issue in Virto — yes/no?* — with the exact payload on screen. So
`feedback.mode` needs no onboarding question:

- It stays at its **`ask`** default (`PROFILE_DEFAULTS`) — meaning "ask each time, per finding".
- Hand-edit `project-profile.json` (or `gen-profile --feedback-mode <v>`) to set **`auto`** (CI /
  standing consent — file directly) or **`off`** (kill switch — nothing ever leaves the machine).
- `reconcile-profile.mjs` no longer lists `feedback` as a MANAGED "ask" field, so
  `/project-init --check` fills it as a safe default and never surfaces it as a pending decision.

**Do not pass `--feedback-mode` from the interview.** §0b's `--self-diagnostics` is the ONLY
self-diagnostics answer carried to step 6.

### 0d. vc-secrets ready? — install the shim, STOP only if that fails

**Every token this onboarding needs is stored in vc-secrets** (VCST-6402), so it must be installed
and reachable BEFORE the interview — otherwise the operator answers every question and then
cannot store the first token. The shim is set up HERE, by this step, not by the operator: nothing
asks them to run `/vc-secrets:install` or to edit `~/.claude/settings.json`. `VC_SECRETS` is a
**project** setting — §7's `gen-mcp.mjs` writes it into this project's `.claude/settings.local.json`
next to `VC_RUN`. Run:

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/project-init/check-secrets.mjs" --preflight
```

- **Exit 0** (`"installed": true`) → the shim is in place (`shimState`: `installed` /
  `already up to date` / `present`) and its `doctor` runs (a `FAIL no declaration file found` from
  doctor is expected at this point — this run writes the declaration in §3). With no `VC_SECRETS` in
  the environment the script installs the shim itself, through vc-secrets' own `install-shim.mjs`
  at its documented default path; that installer writes no settings file. Note the `shim` path: it
  is the `<VC_SECRETS>` in every command you show the operator, and the literal path for this
  session (the settings `env` takes effect only after a restart).
- **Exit 2** (`"installed": false`) → **STOP before the interview.** Show the JSON's `reason` and
  `next` (the vc-secrets plugin is missing, its installer failed, or a `VC_SECRETS` set outside this
  project names a missing file), then the plain-chat waiting line (§Output FORMAT):
  `⏸️ WAITING FOR YOU — re-run /project-init once that is fixed.`

Then install the **bridge** — the stable `$VC_RUN` path every token-holding call goes through:

```bash
node "$CLAUDE_PLUGIN_ROOT/scripts/install-bridge.mjs" --data-dir "${CLAUDE_PLUGIN_DATA}"
```

Its first line is `VC_RUN=<path>`. **Remember that literal path** — it is `$VC_RUN` for the rest of
this session (the settings `env` that sets the variable takes effect only after a restart).
Idempotent: a re-run reports `already up to date`. One line to the operator: `✓ vc-secrets shim · bridge installed`.

### 0e. Detect AND install the required tooling

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

Install the npm dependencies of EVERY installed plugin of this marketplace (found at run time — vc-init, vc-fix, vc-perf, any later one) + the Playwright browsers:

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/project-init/install-deps.mjs"   # each plugin's own install folder
npx playwright install chromium firefox       # browser binaries (global cache — cwd-independent)
```
(Edge uses the system `msedge` channel; WebKit is not used on Windows. On a host-governed project skip
`playwright install`: the browser servers are the host's.) This step
must run before any generator/verify script. **Never a bare `npm install` in the project** — the
scripts import `dotenv` (vc-fix also `@playwright/mcp`), and Node resolves a bare specifier from the
*script's own* directory, i.e. each plugin's install folder. Claude Code installs no npm dependencies,
and vc-fix's tracker / code-host helpers (`ado.mjs`, `jira.mjs`) fail with "Cannot find package
'dotenv'" without them. A plugin update lands in a new version folder WITHOUT `node_modules` — which
is why `--check` runs this again.

## 2. Interview — three answers + an auth preference, THEN scaffold

> **Host-governed project?** §2 is replaced by [`host-governed.md`](host-governed.md) steps 2–4: the
> facts read from the host are shown, then `AskUserQuestion` rounds for choices, URLs and accounts.
>
> **No mid-interview reconnaissance.** Do **not** read files, inspect the `.mjs`
> scripts, or run any other Bash **between** the interview steps. Ask the questions,
> then run step 3. Only these answers are collected — **no operator / projectType /
> contribution-mode question** (those are derived in steps 4–5).

### 2a. ENV_NAME — one plain chat question

Do **not** use `AskUserQuestion` (always ≥2 option buttons — no option-less input) or a
`show_widget` input (unreliable) for this — a plain chat question is the stable way to collect
one free-text value. Emit exactly this (§Output FORMAT):

````markdown
```
┌──────────────────────────────┐
│  ⚙   ENVIRONMENT NAME        │
└──────────────────────────────┘
```

**What should this environment be named?**

It becomes `TEST_ENV` and the suffix of the env file (`.env.<name>`). Typical: `qa`, `dev`,
`staging`, or a customer short name like `acme_qa`. I normalise it to `[a-z0-9_]+`.

⏸️ **WAITING FOR YOU** — reply with the environment name.
````

End the turn there — nothing after. On the reply, normalise mixed case / spaces / hyphens to
`[a-z0-9_]+` (e.g. `My QA` → `my_qa`) and tell the operator what you used.

### 2b. Tracker + code host — one `AskUserQuestion` block

Ask these two enums together:

1. **tracker** — `jira` or `azure` (Azure Boards): where the project's work items live — bugs,
   tasks and stories alike. Ask *"Which tracker holds the project's work items?"*, options
   **Jira** ("Work items live in Jira") · **Azure Boards** ("Work items live in Azure DevOps Boards").
   Never describe it as a bug tracker: the plugins read and move every work-item type.
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
whether step 3 declares a *vc-secrets secret the operator stores in a terminal* (PAT) or
*nothing + a login to run* (session). verify-access (step 8) confirms whichever is actually present.

Applicable axes:

| Axis | When applicable | Options |
|------|-----------------|---------|
| **GitHub** | **always** (the platform upstream is always GitHub; and the client host may be GitHub) | `PAT` (Recommended) → vc-secrets `github-pat` · `Browser login` → `gh auth login` |
| **Azure DevOps** | tracker = `azure` **OR** code host = `azure-repos` | `PAT` (Recommended) → vc-secrets `ado-pat` · `Browser login` → `az login` |
| **Jira** | tracker = `jira` | `API token` (Recommended) → vc-secrets `jira-token` · `Atlassian MCP OAuth` (no token) |
| **Admin passwords** | always — **not asked** | `vc-secrets` only → `admin-password-<env>`, no file. A back-office password is never offered a file: pass `--admin-passwords vc-secrets` |
| **Storefront-user passwords** | always | `.env.local` (Recommended — easy to edit when there are many users) → `USER_PASSWORD_<ENV>` in the file · `vc-secrets` → `user-password-<env>`, no file |

Map the answers to the flags every later step takes: `--github-auth pat|gh-cli`, `--ado-auth
pat|az-login`, `--jira-auth pat|oauth`, `--admin-passwords vc-secrets` (always), `--user-passwords
vc-secrets|env-local`. **Carry the auth ones to step 6** — gen-profile writes them to `auth.*` in the
profile. The password choices are recorded by the vc-secrets declaration itself (3c), not the profile:
a role is in vc-secrets when its `ADMIN_PASSWORD` / `USER_PASSWORD` is declared in a
`vc-init-onboard.<env>` task (`lib/passwords.mjs`), and `--add-env` / `--add-user` follow that.

### 2e. URLs and logins — one value per question

**How every typed value is asked — the operator must see at once WHAT to enter.** `AskUserQuestion` shows
its options first and the free-text box last ("Type something"), so a question that names a value but
offers only exceptions reads as a riddle. Every such question therefore:

- **starts with "Enter …" and names exactly one value** — *"Enter the STOREFRONT URL of `qa`"*, never
  *"`qa` — storefront URL?"*;
- **says where to type it and shows an example**, in the question text itself: *"Choose “Type something”
  below and paste it, e.g. https://qa.shop.example.com"*;
- **has a short tab header naming the value** (`qa · storefront`, `qa · admin email`);
- **offers only real exceptions as options**, worded as an answer, not an action: *"There is no `qa`
  environment"*, *"I don't know it yet — I'll fill it in later"*, *"No admin account on `qa`"*,
  *"Same as on `uat`"*. Never an option that looks like the expected answer.

Write the questions in the operator's language. Never a password, in any question.

After 2d, the same order as on a host-governed project ([`host-governed.md`](host-governed.md) step 4):
first the project-wide connection, one value per question (*Enter the Jira base URL*, *Enter the Jira
project key*, *Enter your Jira email* — or *Enter the Azure DevOps organization / project*); then per
environment one call with four tabs (*Enter the STOREFRONT URL / ADMIN URL of `<env>`*, *Enter the
ADMIN's login*, *Enter the STOREFRONT USER's login*); then *"Add another account?"*. `STORE_ID` is not
asked (normalize-env detects it).

After §3a has scaffolded the files, write the values with `write-env.mjs` (stdin, never argv, never a file
left in the project): the first admin's login is `ADMIN`, the first storefront user's `USER_EMAIL`; every
further account is added with `add-user.mjs` (§--add-user). Where a password goes is fixed by 2d: an
admin's ALWAYS to vc-secrets; a storefront user's where the operator chose (`.env.local` or vc-secrets).
§3d then hands over only what is secret, as numbered steps (host-governed.md step 5 is the model).

## 3. Scaffold the env templates + the vc-secrets declarations, then hand off

Using the env name + tracker + code host + auth preferences, create **both** env files as
commented templates and the **vc-secrets declarations**. No values are collected here — the
operator fills the files and stores the tokens. **Do NOT pass `--project-type` / `--client-org`**
— projectType and the client org are derived by the scan (step 4), not chosen.

### 3a. `.env.<env>` template + the project settings in `.env.local` (`scaffold-env.mjs`)

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/project-init/scaffold-env.mjs" --env myqa --tracker jira --client-vcs github --print
# Azure Repos client on Jira → ADO_ORG/ADO_PROJECT are emitted for the code host too:
node "$CLAUDE_PLUGIN_ROOT/skills/project-init/scaffold-env.mjs" --env acme --tracker jira --client-vcs azure-repos --print
```
Flags: `--env <name>` (required), `--tracker jira|azure`, `--client-vcs
github|azure-repos`. `ADMIN` is pre-filled with a safe default and `STORE_ID` may stay empty (normalize-env detects it);
everything else is empty. `ADO_ORG`/`ADO_PROJECT` are emitted when the tracker is
Azure **or** the code host is Azure Repos. Idempotent — a re-run only adds missing
keys, never clobbers.

The tracker / code-host keys (`JIRA_*`, `ADO_ORG`/`ADO_PROJECT`, `CLIENT_REPO_ORG`) are one value for
the whole project, so they go to **`.env.local`**, once — never into `.env.<env>`, and a later env adds
none. A project onboarded before that has them in each `.env.<env>`: scaffold-env (and normalize-env)
moves them first (`lib/project-env.mjs`) and prints `moved to .env.local …`. When the env files hold
**different** values for one key it moves nothing and prints `NOT moved <KEY> — the files disagree`:
relay that line; the operator keeps one value in `.env.local` (or `<KEY>_<ENV>` there per env) and
deletes the rest. Once a key is kept per env, every later env gets its own `<KEY>_<NEW>` placeholder, never
a bare empty one. `write-env.mjs` never overwrites a different value already in `.env.local`: it
refuses that key (exit 1) and says so.

### 3b. `.env.local` — test-user passwords (`scaffold-secrets.mjs`)

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/project-init/scaffold-secrets.mjs" \
  --env myqa --tracker jira --jira-auth pat --client-vcs github --github-auth pat --print
```
Writes `ADMIN_PASSWORD_<ENV>` / `USER_PASSWORD_<ENV>` placeholders (app TEST accounts) and NOTHING
else — and for a role that goes to vc-secrets (`--admin-passwords` / `--user-passwords vc-secrets`) not
even its placeholder: it names the secret 3c declares instead. Its last line names the tokens this topology needs — `tokens go to vc-secrets, not .env.local:
github-pat, jira-token` — which must match what 3c declares. If it warns that `.env.local` still holds
a token in plaintext (an older onboarding), say so in one line: `/project-init --check` moves it.
Idempotent.

### 3c. vc-secrets declarations (`write-secrets-decl.mjs`)

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/project-init/write-secrets-decl.mjs" \
  --github-auth pat --ado-auth az-login --jira-auth pat --tracker jira --client-vcs github \
  --shim "<the VC_RUN path from §0d>"
```
Writes `.claude/vc-secrets.local.json` (gitignored first): one `local` secret per PAT axis
(`github-pat` / `ado-pat` / `jira-token`), the `vc-init-<group>` tasks the bridge dispatches to, and a
stable `projectId`. Prints a JSON report — keep `secrets` and `trustNeeded`. With no PAT axis at all
it declares nothing (every axis is a session login) and 3d's token block is empty. A re-run with the
same answers changes nothing and asks for no new trust.

When either role goes to vc-secrets (2d) add `--password-envs <env> --password-roles <those roles>`
(`admin`, `user` or `admin,user`): it also declares, for that env, one `local` secret per such password
(`admin-password-<env>` and/or `user-password-<env>`; `--password-names` adds others), the task `vc-init-onboard.<env>` (the onboarding scripts' API logins) and one server
`playwright-<lane>.<env>` per Playwright lane — the same lane flags gen-mcp would write, run in-process by
`bridge/playwright-mcp.mjs` with the passwords in memory only — a lane also reads the `.env.local`
role's passwords of its env itself, so mixed mode needs no generated file. Declared here, at 3c, so the
operator trusts it once: gen-mcp (§7) finds it unchanged.

### 3d. Tell the operator what to do — files, trust, tokens — then pause

Get the token block first — it is relayed **verbatim**:

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/project-init/check-secrets.mjs" --steps
```

Then, under a framed `🔒  FILL IN · TRUST · STORE TOKENS` step header (§Output FORMAT), print three
short parts, in this order:

1. **What is filled, what is left** — ONE table, `File | Field | Value / what to do`: every key 2e wrote
   (value shown, never a secret), `STORE_ID` as "detected after you reply", and only the keys still
   empty with what to put there. A storefront-user password kept in `.env.local` is a row
   "`USER_PASSWORD_<ENV>` — type it in the file in your editor, never in chat".
2. **Approve the declarations** — only when 3c reported `trustNeeded: true`: the operator runs, in
   their own terminal in the project directory, `node "<VC_SECRETS>" trust`, reads what it shows (the
   bridge command and env names, no values) and types `y`. It needs a real terminal — the `!` prefix
   in this chat has none, so it is a separate terminal window.
3. **Store each token** — the `--steps` block: per token, what it is, why, where to create it, and
   `Store: node "<VC_SECRETS>" set <name>`, which the operator runs in that terminal, pastes the token
   at the HIDDEN prompt and presses Enter. Never offer to take a token in chat; if the operator pastes
   one anyway, do not repeat it, tell them to revoke it, and continue with `set` for a new one. For each
   role kept in vc-secrets the same block lists its passwords' `set` commands — the same hidden prompt,
   never chat.

For any **browser-login** choice (`gh auth login`, `az login`, Atlassian MCP OAuth) there is no
token — remind the operator to run that login instead (step 8's `ensure-session.mjs` drives it).

Then the plain-chat question block (§Output FORMAT):

```markdown
**Filled in both files, trusted the declarations and stored the tokens?**

I check the token store first (names only — I never see a value), then normalise the env file,
scan your repos and verify every credential.

⏸️ **WAITING FOR YOU** — reply "done" when all three are finished.
```

Nothing after the block — no further tool calls; the turn ends there so the ask is the last thing
on screen. Note the env name (e.g. `myqa`) — that's your `TEST_ENV` for every later run.

### 3e. On "done" — the TOKEN GATE, then NORMALIZE + VALIDATE (MANDATORY, before the scan)

**First, the token gate** (skip only when 3c declared no secret):

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/project-init/check-secrets.mjs"
```

It runs `vc-secrets doctor` and reads its LINES — an untrusted checkout exits 0 with `SKIP … not
trusted`, so the exit code alone would pass a run that has not been approved. **Exit 1 ⇒ STOP:** show
its `next` list (the exact `trust` / `set <name>` commands still to run, names only) and re-ask with
the plain-chat block (*"Done? Reply 'done'."*). Exit 0 ⇒ one line: `✓ tokens stored: github-pat, jira-token`.

**Then normalise the env files:**

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/project-init/normalize-env.mjs" --env <env>
```

It first moves any tracker / code-host key still in a `.env.<env>` into `.env.local` (§3a), then
normalises `.env.<env>` and the project keys in `.env.local`. It rewrites each file **in place** and prints, line by line, exactly what it corrected: surrounding
quotes and padding stripped, **every trailing slash removed** from `FRONT_URL` / `BACK_URL` /
`JIRA_BASE_URL`, a pasted `https://dev.azure.com/<org>` reduced to the bare `ADO_ORG` slug. It
**exits 1** on an unfilled placeholder, a URL with no `http(s)://` scheme, or an `ADO_ORG`/
`ADO_PROJECT` that is still path-shaped, and WARNs when `FRONT_URL`/`BACK_URL` carries a path
component. Comments, ordering, and any variable the operator added themselves are untouched.

**On exit 1: STOP.** Show the errors verbatim, then re-ask with the plain-chat question block
(§Output FORMAT — *"Fixed them? Reply 'done'."*), and wait — do not scan, do not probe. Every
downstream check would otherwise fail for a reason the operator cannot see (VCST-5582 B). The rules
are not restated in this skill — `scaffold-env.mjs` `CATALOG` declares each key's type and
requiredness, and `normalize-env.mjs` reads them from there.

Relay the printed fixes to the operator in one line ("normalized N value(s): …") so they know the
file changed under them, then continue to step 4.

## 4. Discover the repo split — ALWAYS run; it is the source of projectType

**After the token gate and the normalizer (§3e)**, run the scan **unconditionally** (it needs no
`--client-org` — clients are recognised by module owner / id-namespace), through the bridge so it
reaches the client's code host with the stored token. It classifies installed modules
client-vs-platform, scans the client's code host for the storefront/theme repo, and **derives
`projectType` + `clientOrg`**:

```bash
TEST_ENV=<env> node "$VC_RUN" onboard discover-repos \
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

### 4a. Show the map and ask RIGHT THERE — one table, one question, nothing between them

The operator confirms the repo map **immediately after seeing it**. Do **not** run step 4b or 5
first: a table separated from its question by two more sections forces the operator to scroll
back, and they will approve it unread. Sequence is exactly: repo table → question → END THE TURN →
(on the answer) 4b. Plain chat, not `AskUserQuestion` (§Output FORMAT — a table above a tool call is
hidden from the operator).

**The table comes from the script, verbatim — never hand-built, never shortened:**

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/project-init/render-scan.mjs" --repos .local-env/repos.json
```

**The operator cannot see tool output** — a Bash result is collapsed or hidden in the client. So your
message, right above the question, must CONTAIN the table exactly as printed, its `| Repo |` header
line included. A prose sentence ("found 2 client repos — X (branch dev) and Y …") in its place is
the defect this step exists to prevent, even when every fact in it is right.

It prints one summary line (client repos and host, the platform-repo COUNT — never their list — the
client org, the project type) and one table: **Repo · Kind · Default branch · PR target · Notes**, a
row per client repo. Notes carries only what is repo-specific: a PR target that differs from the
default branch, a storefront fork's provenance, a module with no matching repo, a base tag that could
not be verified. Paste it into your reply as it is — it is already Markdown.

Then the question, in the same final message, and end the turn. It **refers to the table** and names a
flagged row if there is one; it never restates the map in parentheses — e.g. **"Are the repos and
branches in the table correct?"** or **"`acme-module-main` opens PRs into `dev`, not `main` — correct?"**,
then `⏸️ WAITING FOR YOU — reply "yes", or name the repo and what to change`. On a correction, fix it in
`.local-env/repos.json` before step 6.

**Genuine-ambiguity asks (only these — everything else is confirm-or-correct):**
- host = `github`, **no** client modules found, org not resolvable → ask the operator:
  native platform (no client repos), or name the client GitHub org.
- **no** storefront/theme repo matched → ask the operator to name it; add it to
  `repos.client` as `kind:"frontend"`.
- `upstreamRefResolved: false` → ask for the vc-frontend line base tag (see above).

## 4b. Discover the tracker status model — Azure Boards only

**This step is what lets `/qa-fix` transition tickets by role WITHOUT asking the operator.**
Scan the tracker's work-item TYPES and, per type, its allowed STATES (a custom process is
common — Bug/Task/User story can each differ), and derive a `role → System.State` map. Skip
for Jira (transitions are discovered live at runtime; the scan would add nothing):

```bash
# Azure Boards:
TEST_ENV=<env> node "$VC_RUN" onboard discover-tracker \
  --tracker azure --org "$ADO_ORG" --project "$ADO_PROJECT" \
  --types "Bug,Task,User story" [--team "<team>"] --out .local-env/tracker.json --print
# Jira (format facts only — no state scan needed):
TEST_ENV=<env> node "$VC_RUN" onboard discover-tracker --tracker jira --out .local-env/tracker.json
```

The Azure scan also DISCOVERS the `team` whose current sprint a newly filed work item is stamped with (`tracker.azure.team`):
it enumerates the project's teams and picks the one that owns a **date-valid** current sprint (the
project's DEFAULT team is often dormant — its `timeFrame:"current"` flag points at a long-dead sprint).
Pass **`--team "<name>"`** to override the discovery (or to disambiguate when several teams have a
current sprint — the scan leaves the team unset and asks for one). An unset team is safe: the runtime
resolver in `ado.mjs` re-validates and can still auto-select the right team at bug-create time.

It writes `.local-env/tracker.json`: `{ kind, ticketKeyFormat, crossLinkToken, apiBase,
projectId, workItemTypes:{<Type>:{states:[…]}}, roleStates:{in-progress,in-review,
ready-for-test,done} }`. Auth = the `ado-pat` the operator stored in vc-secrets (the bridge hands it over as
`ADO_PAT`) or an `az login` session; if neither is present yet, this step FAILS loudly (fix the ADO
auth, don't skip it — an empty `roleStates` makes `/qa-fix` fall back to asking on every
transition). Step 6 ingests it via `--tracker-json`.

**Show the FULL status table, then confirm — every run, stock process or custom:**

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/project-init/render-scan.mjs" --tracker .local-env/tracker.json
```

It prints ONE table: a row per role (`in-progress` … `done`, with what it means), a column per
scanned work-item type (Bug, Task, User story — the plugins move all of them, each by its own map),
each cell the state a ticket of that type is moved to; `—` where the type has no state for the role.
The board's other states are not shown — they are not decisions. Put the table in your message
verbatim (the operator cannot see tool output — §4a). Because step 6 turns on silent
`transitionPolicy=auto`, a mis-picked cell moves real work items with no further prompt — so the
operator approves the whole map, not a summary of it (D4).

Then, in the same final message, **"Is the status mapping in the table correct?"** and
`⏸️ WAITING FOR YOU — reply "yes", or name the type, the role and the state it should be` — and end the
turn (plain chat, not `AskUserQuestion`: a table above a tool call is hidden — §Output FORMAT). Do
**not** restate the mapping or give examples in the question ("done = Closed, not Resolved/HotFixed?")
— the table is the thing being approved. On a correction (if the operator names no state, offer that
type's states then), persist with
`reconcile-profile.mjs --write --set 'tracker.azure.roleStatesByType.<Type>.<role>=<state>'` (after
step 6) or by editing `roleStatesByType` in `.local-env/tracker.json` (before it). A `—` cell is asked
about at the time of that move; it does not block.

`apiBase`, `projectId`, `ticketKeyFormat` and the cross-link token stay internals: do not print them.

Also captured here: the **bug FIELD CONTRACT** per work-item type (VCST-5582 E-a) —
`tracker.fields.<Type>[]` — plus the two lists that drive the FIRST bug creation:
**`operatorQuestions`** (every required field the operator must supply a value for, whether or not it
maps to a semantic slot) and **`unmappedRequired`** (only the subset that maps to no slot). **The
happy-path one-liner MUST state the TOTAL number of first-run questions — `operatorQuestions.length`
— and name them**, e.g. `Bug: 16 fields, 8 required — filing the first bug asks 3 values once
(Environment, Reported by, Type of bug) and remembers them`. Say it about the tracker, not about a
command: do not name `/qa-bug` (or any plugin) here. Do **NOT** report only
`unmappedRequired`: on a live run it showed "1 question" (Value Area) while `operatorQuestions` held
3 more that were never surfaced, so the operator was told to expect 1 and got 4. A field the board
already answers — a `defaultValue` that is a member of a closed `allowedValues` set — is filled from
that default and is **not** a question (D1); it appears in neither list. **Surface the
`operatorQuestions` list to the operator now — never silently defer it to the first bug.** Show a table
only when `unmappedRequired` is non-empty (a required field with no semantic slot — a genuine mapping
gap to review).

`--out` is optional (accepts `--out <path>`; the default flag set here writes it so step 6 can
read it). If you omit `--out`, capture the printed JSON and pass its path to step 6 another way.

## 5. Derive the rest — no questions

Run the **derive block**: it reads the filled env + live sessions and derives the auth
actually present, the contribution mode, the fork account, and the operator role:

```bash
TEST_ENV=<env> node "$VC_RUN" onboard derive-context \
  --tracker <jira|azure> --client-vcs <github|azure-repos>
```
It prints ONE JSON object on stdout (notes on stderr):
```json
{ "auth": { "github": "pat|gh-cli|none", "ado": "pat|az-login|none|n/a", "jira": "pat|none|n/a" },
  "github": { "login": "...", "upstreamPerm": "push|pull...", "contributionMode": "direct|fork",
              "forkAccount": "...", "via": "PAT|gh CLI",
              "tokenKind": "classic|fine-grained|gh-cli|none", "forkCapable": "yes|no|unknown" },
  "operator": "virto-engineer|client", "upstreamOrg": "VirtoCommerce" }
```
- **contributionMode / operator** — from the token's permission on
  `VirtoCommerce/vc-platform`: `push`/`maintain`/`admin` ⇒ `direct` / `virto-engineer`;
  otherwise ⇒ `fork` / `client` (you PR from your own fork). No token / offline ⇒
  safe default `fork` (verify-access confirms).
- **forkAccount** — the GitHub token owner's login (PR head = `<forkAccount>:<branch>`;
  only used when `contributionMode=fork`).
- **tokenKind / forkCapable** — the token's PROBED type (VCST-5582 A). The recommended
  credential is **ONE classic PAT with `repo`** (or `gh auth login`): it covers both the
  client's own repos and the upstream, so onboarding asks for a single value.
  `contributionMode: "fork"` says WHERE a platform PR goes; `forkCapable` says whether this
  credential can actually get it there. A **fine-grained** PAT is bound to one resource owner
  and is read-only on public repos it does not own, so it reads `vc-platform` fine, is
  classified `fork`, and then 403s on fork / fork-PR / issue-create. Only `forkCapable: "yes"` is
  trusted — `"unknown"` is never assumed capable. Both land in the profile
  (`vcs.githubTokenKind` / `vcs.githubForkCapable`) so `/qa-fix` Gate 1 and
  `/vc-self-check deliver` refuse an impossible route up front, and `verify-access` shows
  the **GitHub token kind / upstream capability** row with the exact remedy.

Capture these values for step 6.

**Reporting — this step has NO question in it, so it gets no table.** Everything here is
derived, not chosen: the operator cannot approve or correct a token's permission on
`vc-platform`. Print **ONE line**:

`Derived: classic PAT (Dan-BV) with push on vc-platform → direct PRs upstream, no fork · ADO: PAT`

Then **only the exceptions**, one line each — these are the whole point of showing anything:

- `forkCapable` is not `yes` while the plan needs the upstream → the WARN + remedy (VCST-5582 A);
- an auth axis came back `none` → say which, and that it must be fixed before `/qa-fix`;
- `contributionMode` fell back to `fork` because nothing could be probed (offline / no token) →
  say it is a default, not a measurement.

`forkAccount`, `upstreamOrg`, the raw `auth` triple and the JSON itself are internals — they go
into the profile, not onto the screen.

## 6. Write the deployment profile

Write the profile from the **scan output + derived values** (projectType + clientOrg
come from the repos-json — no flags for them). Read the tracker connection back from the
filled `.env.local`:

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/project-init/gen-profile.mjs" \
  --repos-json .local-env/repos.json \
  --tracker-json .local-env/tracker.json \
  --runtime-mode plugin \
  --tracker jira --tracker-base-url https://acme.atlassian.net --tracker-project ABC \
  --client-vcs github \
  --operator <derived> --contribution-mode <derived> \
  --upstream-account <forkAccount, only if fork> \
  --github-token-kind <derived: github.tokenKind> --github-fork-capable <derived: github.forkCapable> \
  --self-diagnostics <true|false, from step 0b> \
  # NB: NO --feedback-mode (item 4) — it stays at the `ask` default; the interview never sets it. \
  --github-auth <§2d: pat|gh-cli> --jira-auth <§2d: pat|oauth> --print
# Azure Boards + Azure Repos:
#   ... --tracker azure --azure-org acme --azure-project Web --client-vcs azure-repos --github-auth pat --ado-auth pat ...
```
The `--github-auth` / `--ado-auth` / `--jira-auth` answers (§2d) land in `auth.*` — an axis that
does not apply is written as `""`; vc-fix's prompts and the bridge read them. If step 5 derived
`none` for an axis the operator chose, that is step 5's exception line — the profile still records
the CHOICE. `--repos-json` supplies `projectType`, `vcs.clientOrg`, and the client/platform repo
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
(fallback: a highest-semver scan of `~/.claude/plugins/cache/*/vc-fix/`) — vc-fix's
`knowledge/execution/plugin-root.md`. Result:
**no re-run of `/project-init` after an upgrade**, no version-stamped path, no stale link.

## 7. Generate the browser login secrets, then `.mcp.json`, then the browser rule

First the browser lanes' `--secrets` file — it must exist before gen-mcp, which passes it (absolute
path) to every Playwright server it finds on disk:

```bash
TEST_ENV=<env> node "$CLAUDE_PLUGIN_ROOT/skills/project-init/sync-browser-secrets.mjs"
```

**Any role's passwords in vc-secrets (3c declared `--password-envs`)?** Skip this command — it says so
and writes nothing. gen-mcp then writes every lane as `node ${VC_RUN} playwright <lane>`: the bridge
resolves the current env (`TEST_ENV`, else `.env.test-env`, else the only declared env) and runs the
declared server `playwright-<lane>.<env>`, which takes the vc-secrets roles from the declaration and the
`.env.local` roles from that file — so switching `TEST_ENV` needs a restart and nothing else, no
generated file, no new trust. Both roles in `.env.local`:

It writes `.env.playwright.local` (gitignored) with the CURRENT env's login passwords under their bare
names — `ADMIN_PASSWORD`, `USER_PASSWORD`, any other `*_PASSWORD` in `.env.local`; never a token. A
browser agent then types the NAME into the password field and Playwright MCP types the value and masks
it, so the password never enters the model's context or the transcript. It is per env: after switching
`TEST_ENV` or changing a password, re-run it and restart. It prints names only.

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/project-init/gen-mcp.mjs" --tracker jira --client-vcs github \
  --vc-run "<the VC_RUN path from §0d>" --warm-cache   # add --with figma,devtools as needed
```
`--warm-cache` pre-fetches the pinned npx packages into the npm cache (with an IPv4-first
DNS hint) so the first MCP start doesn't pay a registry round-trip — the #220 startup-timeout
guard. Best-effort + timeboxed; drop it to skip the network step.
Enables playwright-chrome + github + the tracker's MCP (atlassian for Jira; azure-mcp for Azure).
`postman` and `context7` are no longer offered (VCST-6402 D2 — each needed an API key in a file); a
`--with postman|context7` is skipped with a one-line note. **Remind the operator to restart Claude
Code**: the MCP servers, `VC_RUN` and `VC_SECRETS` take effect only in a new session.

**No token in any file this writes (VCST-6402).** The github server follows the GitHub auth axis
(read from `auth.github` in the profile §6 wrote; `--github-auth` overrides):

- **PAT** → `.mcp.json` holds `node ${VC_SECRETS} run github` and nothing else. The server itself is
  declared in `.claude/vc-secrets.local.json` (§3c wrote it; gen-mcp re-checks it, writing nothing when
  it matches): the pinned `mcp-remote` against the hosted GitHub MCP, with `github-pat` from vc-secrets
  in the `Authorization` header. Verified on Windows `npx.cmd`.
- **Browser login** → the hosted server with no header; Claude Code runs OAuth on first use.

`.claude/settings.local.json` `env` gets `VC_RUN` and `VC_SECRETS` (the two shims' paths, not secrets —
`${VC_SECRETS}` in `.mcp.json` expands from it, so it is the project's setting, never
`~/.claude/settings.json`; `--vc-secrets <path>` overrides the §0d shim) and **loses** every token key
an older onboarding put there (VCST-5774 kept the PAT value in it) — each removed name is printed; the
value belongs in vc-secrets (`/project-init --check` moves it). Before writing anything, gen-mcp adds
the generated files to the project's `.gitignore` (creating it if absent), and it refuses to write when
the settings file is unparsable or already tracked by git. `--inline-secrets` is refused. There is
**no `gh auth token` fallback** — the operator's CLI session is never copied into a file.

If gen-mcp reports that the vc-secrets declarations changed, the operator runs `node "<VC_SECRETS>"
trust` again before restarting.

Last, the agent rule — every browser action goes through a Playwright MCP lane:

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/project-init/write-agent-rules.mjs"
```

It copies `templates/rules/*.md` into the project's `.claude/rules/` (today `vc-browser.md`), which
Claude Code loads on every turn and every subagent dispatch, whichever plugin is running — so the rule
binds plugins installed after onboarding too. Without it agents reach for the built-in browser pane,
Claude in Chrome or Chrome DevTools to sign in to a stand and stall at the password field: none of them
types a password, and only the Playwright lanes get one (from vc-secrets or `.env.playwright.local`).
It overwrites only files carrying its own marker, leaves a same-named operator file alone, and is
**not** gitignored — tell the operator to commit it so teammates get the rule.

## 8. Verify access — full readiness checkup

Run with the env selected (so per-env creds resolve). **Pass `FORCE_COLOR=1`** —
the table colours the Status column, but the script auto-disables colour when stdout
is not a TTY and the harness runs this through a pipe, so without `FORCE_COLOR=1` the
operator only ever sees a plain table.

```bash
FORCE_COLOR=1 TEST_ENV=<env> node "$VC_RUN" onboard verify-access
node "$CLAUDE_PLUGIN_ROOT/skills/project-init/assert-profile.mjs"
```

Prints a bordered readiness table + a **READY / NOT READY** verdict for the project.
Run it THROUGH THE BRIDGE as above — a direct run sees only the session logins, so every PAT axis
would read as missing (it says so in a `Launched through $VC_RUN` WARN row).

Checks (PASS / FAIL / WARN / SKIP): deployment profile · **plugin root** (`claude plugin list --json`
resolves the active vc-init AND vc-fix installs — `skills/project-init/verify-access.mjs` and
`skills/qa-fix-routing/ado.mjs` present; WARN if the `claude` CLI isn't on PATH) · **`$VC_RUN`
bridge** (the shim §0d installed) · **vc-secrets (tokens)** (every declared token stored and the
declarations trusted — read from `vc-secrets doctor`'s lines; FAIL names the `trust` / `set <name>`
commands still to run) · core env vars · storefront
URL · admin/platform URL · **admin login** (real `POST {BACK_URL}/connect/token`
password grant) · storefront user login (the REAL store-scoped OAuth grant → PASS/FAIL, not a
"verify manually" WARN) · tracker token (Jira `GET /myself`
or a **real ADO org probe**) · **GitHub fix token / gh session** (validates the token and
its permission on the upstream — shared with the derive block via `probe-lib.mjs`, so
what verify reports and what the profile stored can't drift) · **client repos** (for a
client deployment, each `repos.client` entry is probed for reach on its own host —
GitHub `permissions.push` or an Azure Repos `_apis/git/repositories/<repo>` JSON hit — so a
dead client-repo token surfaces here, not at Gate 2; native platform ⇒ SKIP) · **Storefront
upstream ref** (a client frontend fork's `upstreamRef` resolves in `vc-frontend` — PASS; missing /
`upstreamRefResolved:false` / doesn't resolve — WARN, since Gate 1b reconstructs/asks; no fork ⇒
SKIP).

**WRITE-capability probes (the axes `/qa-fix` must write to).** A PAT/session with only
READ scope passes every read probe above but 401s the moment `/qa-fix` transitions a
ticket or pushes a branch — the gap found live in a client deployment (ADO PAT: `whoami` /
`get-workitem` / `list-refs` 200, but transition / comment / push 401). So the table also
probes write, **without mutating anything** — it sends a deliberately-invalid write request
and reads the status split (`401/403` = no write scope; `400/409/422` = scope present, the
bad request was rejected at validation; anything else ⇒ "write scope unverified"):

| Row | Axis | Probe (non-mutating) | Verdict |
|-----|------|----------------------|---------|
| **Azure Boards write (transition)** | tracker (Azure Boards only) | `PATCH _apis/wit/workitems/<known id>` with an invalid JSON-Patch body | present ⇒ PASS · no scope / ACL-403 / inconclusive ⇒ **WARN** |
| **GitHub auth (direct/fork PR)** | platform upstream (GitHub) | existing `permissions.push` on the upstream repo | fork (own fork) ⇒ PASS · no push on the proxy repo / unreadable perm ⇒ **WARN** |
| **Client repo `<name>`** | client code host | GitHub `permissions.push`; Azure Repos `POST _apis/git/repositories/<repo>/pushes` with an empty body | reachable + write ⇒ PASS · reachable but no write / inconclusive ⇒ **WARN** |

A missing write scope is a **WARN, never a NOT-READY FAIL** (`probe-lib.writeProbeSeverity`):
refusing to finish onboarding over a token that reaches the resource but lacks one write scope is
too heavy — the WARN explains exactly what to grant, the operator grants it before running
`/qa-fix`, and `/qa-fix` Gate 1 re-checks the ACTUAL routed repo anyway. The `To resolve:` block
names the exact scopes — **Azure: Work Items (Read & Write) + Code (Read & Write) + Pull Request
(contribute); GitHub: repo/PR write** — and never prints the token. Only **fundamentals** FAIL →
NOT READY (missing core env, unreachable `FRONT_URL`/`BACK_URL`, bad admin login, a totally
absent/rejected credential that can't even reach the resource, or an **exposed credential** — see
the hygiene rows below); **WARN** is non-blocking; **SKIP** means a feature isn't configured.

**Secret-hygiene rows (VCST-5774, VCST-6402).** Two rows — `Secret hygiene — .mcp.json` and
`Secret hygiene — .claude/settings.local.json` — audit the files §7 generated. Since VCST-6402 a
credential in EITHER is a defect: tokens live in vc-secrets, and an upgraded project may still carry
one in the settings `env` the VCST-5774 design put it in. The walk covers the whole server def — `headers`, `env`, `args[]`, `url`, nested
bags — because the generator substitutes placeholders at every leaf. It reports KEY PATHS only; a
credential value never reaches the table or the telemetry.

**Two nets, two confidence levels**, and that split is what keeps the row honest:

- **CERTAIN** — the known-token-shape matcher shared with `scripts/lib/redact.mjs` (`ghp_`, `glpat-`,
  `AKIA`, JWT, …). A hit is a credential whatever key it hides under, so it may block readiness.
- **SUSPECTED** — a credential-shaped key (or a `--api-key`-style flag, or a URL with inline
  credentials) whose value is opaque. This is the net that catches a token type nobody has invented
  yet, but it cannot tell a secret from a filename — so it **only ever WARNs**. That ceiling is
  what lets the key vocabulary stay wide instead of being narrowed until real names fall out of it.
  Obvious non-credentials (a path, a filename, a bare number, a short enum word) are filtered out.

Grading is by **actual exposure**:

| Situation | Row |
|---|---|
| **Certain** credential **and** the file is committable (not gitignored, **or already tracked**) | **FAIL** — blocks readiness, names the fix and says to rotate |
| **Suspected** credential, however exposed | **WARN** — never blocks; says it may equally be a filename or an id |
| Certain literal in `.mcp.json`, file not committable | WARN — `/project-init --check` moves it into vc-secrets; rotate it |
| Certain credential in `settings.local.json`, file not committable | WARN — a leftover of the VCST-5774 design; `/project-init --check` moves it into vc-secrets and gen-mcp prunes it |
| Clean but committable, or unparsable JSON | WARN |
| Outside a git repo | never FAIL on ignore-state — there is nothing to commit to |

An **already-tracked** file is the case to read carefully: `git check-ignore` reports a tracked
path as NOT ignored, and adding a `.gitignore` rule does not untrack it — so that FAIL tells the
operator to `git rm --cached <file>` and commit, then rotate. Re-running `/project-init` would not
fix it.

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
Run it directly (not through `$VC_RUN`: a session login must not see a token). `az login` / `gh auth login` are **blocking** — **launch `ensure-session.mjs` in the
background** and let the operator complete the single browser consent, then re-run
verify-access. For a fully non-interactive setup use a PAT instead.

**After the readiness table it also prints the MCP-servers section** — `OK` (local) ·
`AUTHORIZED` (token/key/az present) · `NEEDS OAUTH` (atlassian / figma) · `NO KEY`
(optional server, key unset).

**Surface the result in your reply — do NOT leave it only in the script's stdout.**
The table is tool output, which many clients collapse or hide — and so is any text you write before a
FURTHER tool call (assert-profile, next-steps). **Restate the readiness table AND the MCP-server status
as Markdown tables in the FINAL message of the run (§9)**, not between the scripts, mapping each
row to the surface it proves — **front** = `FRONT_URL` (+ storefront user login),
**back** = `BACK_URL` + admin login, **Jira/tracker** = tracker token, **Git** = GitHub
token + gh CLI — and end with the `N PASS · N FAIL · N WARN · N SKIP` line and the
READY / NOT READY verdict.

## 9. Done

Present this as an explicit, labelled **Step 9** in your reply (the operator tracks the
pipeline by step number). It is the LAST message of the run and carries everything the operator must
see — the readiness table (§8) included — because text written before a tool call is collapsed out of
view: run `next-steps.mjs` (below) FIRST, then write this message, with no tool call after it. Summarise what was written in two or three lines (profile path, tracker,
code host, repo counts, projectType), list the remaining **manual** actions (restart Claude Code so
`.mcp.json` and the settings take effect; any interactive OAuth still pending, e.g. Atlassian), then
close with what the operator can do now — printed by the script, from the profile and the plugins
actually installed:

```bash
TEST_ENV=<env> node "$CLAUDE_PLUGIN_ROOT/skills/project-init/next-steps.mjs"
```

It prints "the project is ready to work with" plus one table of asks and commands: the everyday
tracker asks (a ticket, the current sprint, my open tickets), each installed plugin's entry points
(vc-fix: `/qa-bug`, `/qa-fix`, `/qa-verify-fix`, `/qa-env-check`; vc-perf: `/perf-init` until the
perf block exists, then `/perf-loop`, `/perf-benchmark`), `/project-init --add-env` and `--check`,
and one line naming a plugin that is not installed. Relay it in the operator's language, keep the
commands as printed, and do not single out one plugin as "the" next step. On **NOT READY**, list what
to resolve first and run it only after that.

**Signal completion (self-diagnostics).** This is now emitted **automatically** — `verify-access.mjs`
(Step 8, the last script every path runs) fires the terminal-step marker itself, best-effort, so the
clean self-check line prints reliably without depending on you remembering a trailing command. You only
need to run it **manually as a fallback** if the run ended BEFORE reaching Step 8 verify-access (e.g. a
hard precondition bail at Step 0), so the collector still knows the run finished:

```bash
node "<vcFix>/hooks/session-telemetry.mjs" complete --skill "project-init"
```

(`<vcFix>` is the `vcFix` path `node "$VC_RUN" --where` prints — the collector belongs to vc-fix,
not to this plugin.)

It tells the vc-fix self-diagnostics collector this run has finished, so its one-line
clean/health status prints **exactly once** (right after this step) instead of on every
interview / file-fill / verify pause. Emit it even when the run ended early (a NOT READY
precondition bail, or "nothing to do") — a correct early exit is still a completed run. (See
vc-fix's `knowledge/diagnostics/skill-expectations.md`
§Signal completion.)

---

## `--add-env` — add another environment to an already-onboarded project

`/project-init --add-env` is for a deployment that is ALREADY onboarded (a
`project-profile.json` exists) and you want to point the plugin at **another deployment
target** — a second QA env, staging, a customer's second storefront — that shares the
**same project topology**.

**Why this is short (and touches almost nothing).** The deployment profile is
**env-agnostic**: `tracker.kind`, `vcs.clientHost`, `repos.*`, `contributionMode`, the
tracker role model — all describe the PROJECT (where bugs are filed, where code lives, which
repos exist), not a single deployment. An *environment* is only a **URL set + its access
creds** (`.env.<name>` + the `_<ENV>`-suffixed passwords in `.env.local`), selected at
runtime by `TEST_ENV`. So `--add-env`:

- **does NOT** re-run the interview, re-scan repos (`discover-repos`), re-derive
  (`derive-context`), rewrite `project-profile.json`, or regenerate `.mcp.json` — all
  env-agnostic and already done;
- **only** scaffolds the new env's two files (reusing the profile's tracker/host), then
  verifies the new env.

> A different **tracker or code host** is a different *project*, not an environment — those
> live in `project-profile.json`. For that, run a fresh full `/project-init` in its own
> project directory; don't try to bend `--add-env` to it.

### Step A — precondition + read the project topology (no questions)

1. `project-profile.json` must exist in the cwd. If it doesn't → this project was never
   onboarded: run the **full interview** (`/project-init`, no args) instead. Confirm the cwd
   (§0a) — everything still lands here.
2. Read `tracker.kind` and `vcs.clientHost` from `project-profile.json` (e.g.
   `node -e "const p=require('./project-profile.json');console.log(p.tracker.kind,p.vcs.clientHost)"`,
   or just read the file). **Do NOT ask them again** — they are project-level and already
   decided. These become the `--tracker` / `--client-vcs` flags below.

### Step B — ask the env name, then the existing-env guard

- **Ask the env name** as a **plain chat** question (like §2a — *"what should the new
  environment be named?"*; not `AskUserQuestion`/widget, and no positional arg). The operator
  replies; normalise to `[a-z0-9_]+` (e.g. `Staging 2` → `staging_2`) and tell them what you used.
- **Existing-env guard** (§2c): check `.env.<name>` first. Found → `AskUserQuestion` to
  **reuse** it (scaffolding is add-only, never clobbers filled values) or **pick a new name**
  (re-ask the plain-chat name question + re-check). Not found → proceed.

### Step C — scaffold the new env's two files, then pause

Same scaffolders as the full flow (§3), reusing the tracker/host read from the profile:

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/project-init/scaffold-env.mjs"     --env <new> --tracker <kind> --client-vcs <host> --print
node "$CLAUDE_PLUGIN_ROOT/skills/project-init/scaffold-secrets.mjs" --env <new> --tracker <kind> --client-vcs <host> --print
```

- `scaffold-env` writes `.env.<new>` — the new deployment's URLs/identifiers (`FRONT_URL`,
  `BACK_URL`, store/culture). All empty for the operator to fill. The **project-level** connection
  (`JIRA_*`, `ADO_ORG`/`ADO_PROJECT`, `CLIENT_REPO_ORG`) is already in `.env.local` and is NOT
  re-emitted — a project that still has it in its old env files gets it moved there now (§3a). Don't
  ask the operator to re-enter tracker/org values they gave at onboarding.
- `scaffold-secrets` adds ONLY the `_<ENV>`-suffixed per-env app passwords
  (`ADMIN_PASSWORD_<NEW>` / `USER_PASSWORD_<NEW>`) to the shared `.env.local`. **Passwords in vc-secrets**
  (`node "$VC_RUN" --where` lists `passwordEnvs`)? `scaffold-secrets` then skips the vc-secrets role's
  placeholder by itself (it reads the declaration), and you declare the new env — the same roles as the
  others — and show its steps:
  `node "$CLAUDE_PLUGIN_ROOT/skills/project-init/write-secrets-decl.mjs" --from-profile --password-envs <new> --shim "$VC_RUN"`
  and `check-secrets.mjs --steps`. The new env's lanes and onboard task change the declarations, so the
  pause asks for `trust` plus a `set` per password; an env whose passwords are not stored yet breaks only
  its own lanes. **Tokens are
  project-level**: the `github-pat` / `ado-pat` / `jira-token` stored in vc-secrets at onboarding
  serve every environment, so `--add-env` declares nothing and asks no trust. (A new env reachable
  only with a *different* tracker/GitHub token is the "different project" case above.)

Tell the operator both were touched and what genuinely needs filling — **the new env's URLs + its
admin/user passwords** (the empty project-level tracker/org placeholders are covered by the profile) —
then **pause** with the unmistakable waiting banner (§3d) — no tool calls after it.

### Step D — verify the new environment

```bash
FORCE_COLOR=1 TEST_ENV=<new> node "$VC_RUN" onboard verify-access
node "$CLAUDE_PLUGIN_ROOT/skills/project-init/assert-profile.mjs"
```

Run with `TEST_ENV=<new>` so the per-env creds resolve. This confirms the new env's URLs +
**real admin login** + the (project-level, vc-secrets) tracker/GitHub tokens all work for this target.
`project-profile.json` and `.mcp.json` are **unchanged** (env-agnostic). **Restate the
readiness table** in your reply (§8). Then present **Done**: `TEST_ENV=<new>` (per run, or via
your shell) selects the new environment for every plugin, and close with
`TEST_ENV=<new> node "$CLAUDE_PLUGIN_ROOT/skills/project-init/next-steps.mjs"` (§9). Before a browser run
on the new env, `TEST_ENV=<new> node "$CLAUDE_PLUGIN_ROOT/skills/project-init/sync-browser-secrets.mjs"`
and a restart give the Playwright lanes that env's passwords (§7) — with the passwords in vc-secrets,
`TEST_ENV=<new>` and a restart alone do.

Completion is signalled **automatically** by `verify-access.mjs` above (it fires the terminal-step
marker itself). Only if this path ended before running verify-access, run it manually as a fallback:
`node "<vcFix>/hooks/session-telemetry.mjs" complete --skill "project-init"` (`<vcFix>` from `node "$VC_RUN" --where`).

---

## `--add-user` — add another test user to an environment

`/project-init --add-user` gives an already-onboarded project one more storefront user or admin — a
second buyer, a support admin — on one or more environments, without the interview. A test user is a
KEY with two values: the login, which is not a secret and goes into `.env.<env>` as `<KEY>_LOGIN`, and
the password `<KEY>_PASSWORD`, which you never see. Where the password goes follows where that env
keeps its ROLE's passwords (§2d): in vc-secrets (`<key>-password-<env>`, bound into that env's lanes and
onboard task) or in `.env.local` (`<KEY>_PASSWORD_<ENV>=`, for the operator to fill) — typically an
admin to vc-secrets and a storefront user to `.env.local`. `add-user.mjs` does both writes; you only ask.

1. **Precondition + scan** (no question): `project-profile.json` must exist (else run the full
   interview). List the environments, where each role's passwords live and the users they already have:
   ```bash
   node "$CLAUDE_PLUGIN_ROOT/skills/project-init/add-user.mjs" --list
   ```
   Show it as ONE table (env · admin passwords · user passwords · users with their logins).
2. **Ask** in one `AskUserQuestion` block: which environment(s) (multi-select, from the scan) and the
   role — `Storefront user` or `Admin`.
3. **Ask the KEY** in a second `AskUserQuestion`, single-select: the options are the scan's
   `nextKeys.<role>` (`USER2`, `USER3`, `USER4` — or `ADMIN2`, … — free in every env), the first one
   marked `(Recommended)`; the operator's own KEY goes in **Other** (upper snake case, e.g. `BUYER`). Do
   not ask the KEY in prose. A KEY already listed in an env is reused there only on the operator's
   explicit "replace" (`--replace`).
4. **Ask the login** as plain chat, ONE question per chosen env: *"Enter the email / login of `<KEY>` on
   `<env>`."* — a login usually differs per env. Never ask for the password.
5. **Write**, once per chosen env:
   ```bash
   node "$CLAUDE_PLUGIN_ROOT/skills/project-init/add-user.mjs" --env <env> --key <KEY> --role user|admin --login <login> --shim "$VC_RUN"
   ```
   A refusal (bad KEY, built-in `ADMIN`/`USER`, a token-shaped name, an unknown env) is relayed and
   re-asked. Collect every report's `steps`.
6. **Hand off** under a `🔒  STORE THE PASSWORD` header: the `steps` verbatim, deduplicated — for
   vc-secrets `trust` (when a declaration changed) and `set <key>-password-<env>`, typed at the hidden
   prompt in their own terminal; for `.env.local` the line to fill and the sync-browser-secrets command —
   then the restart. Close with the report's `agent` line: an agent logs in with `<KEY>_LOGIN` and types
   the password by its NAME (`browser_type(text="<KEY>_PASSWORD")`). The user itself must already exist
   on the stand — this mode only hands its credentials to the agents.

**Host-governed with `governance.websiteAuth: "host-secrets"`:** the host declares fixed password SLOTS per
website environment, so `--list` shows each env's host env and its slots (free or whose), the KEY
question offers the free slots (`USER1` …), and you ask one more line — a note describing the account
(`--note`, kept as a comment next to its login). Write with `--env <env> --slot <SLOT> --role user|admin
--login <login> --note "<note>"`; the hand-off is storing the slot's secret with the host's wrapper (the
report's `steps`: hidden input, the operator's terminal), and the agent types the slot's password NAME
(e.g. `QA_USER1_PASSWORD`).
An env not mapped to a host env is refused with the `gen-profile --gov-envs` fix ([`host-governed.md`](host-governed.md)).

---

## `--check` — reconcile an existing profile, then verify

`/project-init --check` is for a deployment that is ALREADY onboarded — most often
**after a plugin upgrade**. The schema (`PROFILE_DEFAULTS` in `scripts/lib/project-profile.mjs`)
evolves between versions — fields are **added** (e.g. `selfDiagnostics`), **removed**
(e.g. the old baked `pluginRoot`), or need a fresh **rescan** (repos / tracker role model
drift) — but the on-disk `project-profile.json` was written once and goes stale. `--check`
brings it back in line with the current schema, then runs the readiness table. It does
**NOT** re-run the interview.

### Step 0 — vc-secrets ready + the bridge (same as §0d), and the plugins' dependencies

A plugin update lands in a new version folder without `node_modules`, so run §1's
`install-deps.mjs` first.

Run §0d first — `check-secrets.mjs --preflight`, STOP on exit 2, then `install-bridge.mjs`. An
upgrade from a pre-VCST-6402 onboarding has no vc-secrets yet, and every later step needs it.

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
`status:"newer-schema"` ⇒ the profile was written by a NEWER vc-init than this one — STOP and tell the
operator to update vc-init; nothing was changed.

### Step B — resolve decisions + rescans, then write

- For each **`pending`** entry, ask the operator with **`AskUserQuestion`**, using the
  entry's own `question` + `options` (make the `default` value the Recommended option).
- For each **`rescan`** entry, re-run the matching discovery (`discover-repos` /
  `discover-tracker`) and fold the result back via `gen-profile --merge` (§ Re-running). An Azure
  profile with an **empty `tracker.fields`** is reported here as `{ path: "tracker.fields", source:
  "discover-tracker" }` (VCST-5582 E5) — an upgraded install whose original scan predates the
  `$expand=all` fix re-derives the bug field contract on `--check`, no full re-onboarding needed.
- A **schema-1 profile** (written before VCST-6402) carries a single `vcs.auth` that described only
  the client host. Reconcile migrates what it can into `auth.*` (reported `via:
  "migrated-from-vcs.auth"`) and lists each axis it could not know as `{ path: "auth.<axis>",
  source: "derive-context" }`. Run `TEST_ENV=<env> node "$VC_RUN" onboard derive-context --tracker
  <kind> --client-vcs <host>` and pass its `auth.<axis>` back as `--set auth.<axis>=<pat|gh-cli|az-login|oauth>`
  (derive's `none` ⇒ ask the operator which they want, as in §2d).
- Then apply everything in one write, one `--set path=value` per resolved decision:

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/project-init/reconcile-profile.mjs" --write \
  --set selfDiagnostics=<true|false> --set auth.jira=<pat|oauth>
```

Then bring the vc-secrets declarations in line with the reconciled `auth.*` — idempotent, it writes
nothing (and asks no new trust) when they already match:

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/project-init/write-secrets-decl.mjs" --from-profile --shim "<VC_RUN path>"
```

When it reports `trustNeeded: true` or a secret is not stored yet, run the §3d token block (trust +
`set`) and the §3e token gate before Step C.

`selfDiagnostics` is the CAPTURE opt-in and the ONLY self-diagnostics decision `--check` asks.
`feedback.mode` (VCST-5509) — the DELIVERY consent — is **no longer a managed "ask" field**
(item 4): it fills as a safe default (`ask`) and is never surfaced as a pending decision. To
change it, hand-edit `project-profile.json` or re-run `gen-profile --feedback-mode <auto|ask|off>`.
`ask` = the per-finding binary offer at delivery time; `auto` = file the Issue directly; `off` =
nothing ever leaves the machine.

`--write` applies the structural adds/removes plus any `--set` decisions. Unresolved
`pending`/`rescan` fields are left **absent** — safe, because a missing field reads as its
safe default (no `selfDiagnostics` ⇒ capture stays **OFF** — the opt-in gate; set
`selfDiagnostics:true` to opt in; no `feedback` ⇒ delivery falls back to `ask` — a per-finding
offer + confirm, never an unattended send) — and stay in the report so a later `--check` can finish
them. Reconciling is **idempotent**: once done, the report is `current`.

If a `--write` would remove **≥5 fields** it returns `status:"needs-force"` and writes
nothing — that many removals usually means a schema mismatch (reconciling against a leaner
schema than the one that wrote the profile), not stale fields. **Review the `removed` list**;
only if the removals are genuinely intended, re-run with `--force`.

### Step M — move every plaintext token into vc-secrets, then strip it (VCST-6402)

An install onboarded before VCST-6402 keeps its tokens in files: `.env.local` (`GITHUB_FIX_BUGS_TOKEN`,
`ADO_PAT`, `JIRA_API_TOKEN`, also `_<ENV>`-suffixed), `.claude/settings.local.json` `env`
(`GITHUB_PERSONAL_ACCESS_TOKEN` from the VCST-5774 design), a literal in `.mcp.json`, and the remote URL
of an Azure Repos checkout under `.fix-workspace/`. Find them — names and locations only, never a value:

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/project-init/migrate-secrets.mjs" --scan
```

Exit 0 (`clean`) ⇒ skip to Step C. Otherwise show the findings as ONE table (file · key · axis ·
committed?) and, for every axis listed under `rotate`, say plainly that the token sat in a file that is
or was in git history and must be **rotated** (a new token created and the old one revoked), not merely
moved. Then:

1. The declarations must match the reconciled profile — Step B's `write-secrets-decl.mjs --from-profile`.
2. The operator stores each token in vc-secrets — the §3d token block (`check-secrets.mjs --steps`):
   `trust` when the declarations changed, `set <name>` per token (the CURRENT value, or the new one when
   rotating — pasted at the hidden prompt, never in chat). Pause with the waiting line.
3. On "done": the §3e token gate (`check-secrets.mjs`), then strip what now works:

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/project-init/migrate-secrets.mjs" --strip --vc-run "<VC_RUN path>"
```

`--strip` probes each axis through the bridge (`gh api user` · `ado whoami` · `jira myself`) and removes
that axis's plaintext copies ONLY when its probe passes — a failing axis keeps its file copy, because it
may be the only working one. A postman/context7 key is stripped unconditionally (those servers are gone).
`.mcp.json` is never edited here: re-run gen-mcp (§7), which rewrites it without any token and prunes
the settings `env`.

**Passwords.** Once the declaration keeps an env's passwords in vc-secrets, `--scan` also lists each
`<NAME>_<ENV>` of that env in an `.env` file and a leftover `.env.playwright.local`; `--strip` removes a
password line when `vc-secrets doctor` reports its secret stored (verify-access then proves the login) and
deletes `.env.playwright.local`. To move an existing project's passwords there: `write-secrets-decl.mjs
--from-profile --password-envs <every env>`, the §3d steps (`trust`, `set` per password), `--strip`,
then gen-mcp. Only vc-init's onboarding scripts read a password from vc-secrets today: a script outside
vc-init that logs in over the API with `ADMIN_PASSWORD` from `.env.local` (vc-fix's module registry,
seeders) finds it empty after the move — keep `.env.local` (option A) where those are used. Relay `stripped`, `remaining` and `next` in one short table; a `remaining` entry is
the operator's to-do, named, not a silent leftover.

### Step C — normalize the env file, then verify access

First re-run the §3d normalizer — an env file edited by hand since onboarding can have
re-acquired a trailing slash or a quoted value, and every probe below would then fail for an
invisible reason:

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/project-init/normalize-env.mjs" --env <env>
```

Then refresh the browser login secrets (§7 — a changed password or env leaves them stale), the agent
rules (§7 — a plugin upgrade may bring a new or changed one) and the readiness table (§8), so a stale token / URL / login surfaces too:

```bash
TEST_ENV=<env> node "$CLAUDE_PLUGIN_ROOT/skills/project-init/sync-browser-secrets.mjs"
node "$CLAUDE_PLUGIN_ROOT/skills/project-init/write-agent-rules.mjs"   # §7: add / update the browser rule
```

```bash
FORCE_COLOR=1 TEST_ENV=<env> node "$VC_RUN" onboard verify-access
node "$CLAUDE_PLUGIN_ROOT/skills/project-init/assert-profile.mjs"
```

**Restate all three** — the reconciliation summary (added / removed / decided), any value the
normalizer corrected, and the readiness table — in your reply, then on READY close with
`next-steps.mjs` (§9). A normalizer exit 1 (unfilled
placeholder / missing scheme) is a **STOP**: report it and skip the readiness table, which would
only produce misleading failures.

Completion is signalled **automatically** by `verify-access.mjs` above (it fires the terminal-step
marker itself). Only if this path ended before running verify-access, run it manually as a fallback:
`node "<vcFix>/hooks/session-telemetry.mjs" complete --skill "project-init"` (`<vcFix>` from `node "$VC_RUN" --where`).

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

Client-code containment (vc-fix's `.claude/rules/quality-gates.md` §2a) is enforced regardless:
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
| `scaffold-env.mjs` | write a commented `.env.<env>` **template** (non-secret URL/identifier/tracker placeholders + what/example comments); topology-driven, idempotent. **Calls `lib/gitignore.mjs` `ensureProjectIgnores()` BEFORE it writes**, so the file it is about to create is already covered (VCST-5774). |
| `scaffold-secrets.mjs` | add the commented test-user password placeholders to `.env.local` (what/why/where per value); reports which tokens this topology stores in vc-secrets and warns on a plaintext token still in `.env.local`; idempotent. **Calls `lib/gitignore.mjs` `ensureProjectIgnores()` BEFORE it writes**, so the file it is about to create is already covered (VCST-5774). |
| `lib/gitignore.mjs` | the ONE list of what onboarding generates that must never be committed, plus the append-only writer. Shared because FOUR scripts create such files at four different steps and each must protect its own **before** creating it — while only `gen-mcp` (§7) wrote the block, `.env.local` (§3b) sat unignored through the operator's fill-in pause and through any run that aborted before §7. Idempotent, so four calls cost one read and produce one block |
| `write-secrets-decl.mjs` | write `.claude/vc-secrets.local.json` — one `local` secret per PAT axis, the `vc-init-<group>` bridge tasks, the GitHub MCP server, a stable `projectId`. Owns only those keys, writes nothing when unchanged (so trust is re-asked only when the PAT axes change). `--from-profile` reads `auth.*`. `--password-envs` / `--password-names`: per env the password secrets, `vc-init-onboard.<env>` and the `playwright-<lane>.<env>` servers (`lib/passwords.mjs`, `lib/playwright-lanes.mjs`) |
| `add-user.mjs` | **`--add-user`**: `--list` — every `.env.<env>`, its password mode and its users; `--env --key --role --login` — writes `<KEY>_LOGIN` into `.env.<env>` and declares `<KEY>_PASSWORD` in that env's vc-secrets declaration or adds its `.env.local` placeholder; prints the operator's `steps`. Never sees a password |
| `check-secrets.mjs` | `--preflight` (§0d): is vc-secrets installed and runnable · `--steps` (§3d): the token block — what/why/where + the exact `set <name>` command per token (and each declared password's) · default (§3e): the TOKEN GATE — reads `vc-secrets doctor`'s lines and exits 1 with the `trust` / `set` commands still to run. Never sees a value |
| `lib/token-guide.mjs` | what/why/where of each onboarding token (`github-pat`, `ado-pat`, `jira-token`) — the texts that used to sit in `.env.local` comments |
| `lib/vc-secrets-doctor.mjs` | runs `vc-secrets doctor` through the shim and parses its OK/FAIL/SKIP lines into a verdict (shared by check-secrets and verify-access) |
| `profile-set.mjs` | the ONE path another plugin writes the profile through: `/qa-bug` (`--set tracker.fieldDefaults.*` / `fieldMap.*`), `/perf-init` (`--merge perf=<json>`). Allowlisted paths only; exit 2 = no profile |
| `../../scripts/install-bridge.mjs` | copy `vc-run-shim.mjs` to `~/.claude/plugins/data/vc-init-ai-tools/vc-run.mjs` (§0d) and print `VC_RUN=<path>` |
| `../../bridge/run.mjs` | the `$VC_RUN` dispatcher: allowlist (`bridge/allowlist.mjs`) → `vc-secrets task vc-init-<group>` for a PAT axis, else the tool directly; inner side builds an allowlisted env, pins git to `bridge/git-credential.mjs`, redacts output (`bridge/redact.mjs`) |
| `normalize-env.mjs` | **run on the operator's "done" (§3e) and in `--check` Step C** — move any tracker / code-host key left in a `.env.<env>` into `.env.local` (`lib/project-env.mjs`; a key the env files disagree on is reported, never moved), then normalize the hand-filled `.env.<env>` and the project keys in `.env.local` IN PLACE (quotes / padding / **all** trailing slashes; a pasted `dev.azure.com/<org>` → the bare slug) and validate it: exit 1 on an unfilled placeholder, a URL with no `http(s)://`, or a path-shaped `ADO_ORG`/`ADO_PROJECT`; WARN on a path component in `FRONT_URL`/`BACK_URL`. Prints every fix. Rules come from `scaffold-env.mjs` `CATALOG` (`type` + no-`def`), never a private copy |
| `write-env.mjs` | (non-interactive helper) write `.env.<env>` / `.env.local` from a JSON answer object on STDIN when values ARE known programmatically — a `scope: "project"` key in `envVars` lands in `.env.local`; idempotent |
| `lib/project-env.mjs` | where the project-level keys live (`.env.local`) and the one-time move out of every `.env.<env>` that scaffold-env + normalize-env run; the shared `.env.local` header |
| `discover-repos.mjs` | ALWAYS-run scan: Platform API modules → client/platform split, client-host scan for the storefront repo, and **derives projectType + clientOrg**; bakes per-repo `contribution`/`integrationBranch`/`toolchain`/`localVerify`; emits `{ projectType, clientOrg, client, platform }` |
| `discover-tracker.mjs` | **Azure-only** scan of work-item types → per-type `states` + a `role→state` map (`roleStates`), plus `apiBase`/`projectId`/`ticketKeyFormat`/`crossLinkToken`; emits `.local-env/tracker.json` for `gen-profile --tracker-json`. Jira: format facts only (transitions discovered live). Enables `/qa-fix`'s silent role-based transitions |
| `derive-context.mjs` | the **derive block**: reads the filled env + sessions, probes the upstream permission, emits JSON — auth actually present per axis, contributionMode, forkAccount, operator |
| `probe-lib.mjs` | shared side-effect-free probes (GitHub-upstream permission, ADO tenant/auth) used by BOTH `verify-access` and `derive-context` so their results can't drift |
| `gen-profile.mjs` | write/merge `project-profile.json` (`schemaVersion` 3) from the repos-json (projectType/clientOrg/repos) + derived flags (operator/contributionMode/upstream-account) + the auth axes (`--github-auth` / `--ado-auth` / `--jira-auth` → `auth.*`) + tracker connection + `--governance <host|none>` / `--gov-<role>` (§0-host); keeps an existing `perf` and `governance` block |
| `reconcile-profile.mjs` | **`--check` migration**: diff an existing profile against the current `PROFILE_DEFAULTS` schema → JSON report of `added` (safe-default) / `removed` (obsolete, open-maps+arrays preserved) / `pending` (operator-decision fields with `question`+`options`, e.g. `selfDiagnostics`) / `rescan` (re-derive live). Deterministic, dry-run by default; `--write` applies structural changes + `--set path=value` decisions. Idempotent. Mirrors `gen-profile`'s `tracker.azure`/`vcs.azure` discriminated pruning. Migrates a schema-1 `vcs.auth` into `auth.*` and refuses a profile from a newer vc-init |
| `gen-mcp.mjs` | write `.mcp.json` (OS-aware) into the project + enable servers for the tracker/VCS. **No token in any file (VCST-6402):** github follows `auth.github` — PAT ⇒ `node ${VC_SECRETS} run github` plus the `servers.github` vc-secrets declaration (`lib/github-mcp.mjs`, pinned mcp-remote), session ⇒ the hosted server with OAuth; settings `env` gets `VC_RUN` and loses every token key; postman/context7 removed; `--inline-secrets` refused. **Refuses to write at all when the settings file is unparsable or already git-tracked** — a rewrite would delete the operator's keys, and no `.gitignore` rule can untrack a tracked file (VCST-5774). Playwright servers are flags-only (`--browser` / `--isolated` / `--viewport-size` / `--output-dir`) — no config files; only `playwright-chrome` is enabled by default |
| `lib/paths.mjs` | shared path helper — `outputRoot()` (`VC_FIX_HOME` \|\| `process.cwd()`, where generated state goes) + `pluginRoot()` (`CLAUDE_PLUGIN_ROOT` \|\| resolved from `import.meta.url`, used by a running script to find its own read-only plugin assets). Keeps every generator writing to the project and reading templates from the plugin. (Commands resolve their launch path via `claude plugin list --json` — see vc-fix's `knowledge/execution/plugin-root.md`.) |
| `verify-access.mjs` | full `/qa-fix` readiness table + verdict, incl. the two **secret-hygiene** rows that audit `.mcp.json` + `.claude/settings.local.json` for an exposed credential (graded by committability: tracked/not-ignored ⇒ FAIL); prints an untruncated "To resolve" block (incl. an auto-discovered `az login --tenant <guid>`). Also **reports every non-PASS row as self-diagnostics telemetry** (`lib/diag-obs.mjs` → the collector's `obs` subcommand) — the table used to be rendered and discarded, so a WARN the operator could plainly read was invisible to `/vc-self-check` and the run self-diagnosed "no plugin issues detected" (VCST-5582 H). Exit code is unchanged: 0 unless a hard FAIL |
| `assert-profile.mjs` | asserts the **SHAPE** of the profile just written and records each degradation as a `degraded_artifact` observation: empty `tracker.fields` (⇒ `/qa-bug` sends "unverified defaults"), `roleStatesComplete:false`, unmapped required fields, empty `repos.client` on a client project, an unresolved storefront `upstreamRef`, `githubForkCapable != "yes"` while the upstream path is needed. Complements `verify-access` (which probes ACCESS): a scan can return empty with no HTTP error, and what `/qa-fix` reads at runtime is the persisted shape. Read-only, **always exits 0** — a diagnostic, not a second readiness gate |
| `migrate-secrets.mjs` | **`--check` Step M**: `--scan` lists every token left in a file (`.env*`, settings `env`, `.mcp.json`, `.fix-workspace/*/.git/config` remote URLs, the profile) by NAME and LOCATION and flags the ones in git history (⇒ rotate); `--strip` removes an axis's plaintext copies only after its bridge probe passes. With passwords in vc-secrets also their `.env` lines (once stored) and `.env.playwright.local` |
| `detect-governance.mjs` | §0-host: find a host governance plugin bound to this folder by its shape (`lib/governance.mjs` hostCandidates — no host named) and print the `governance` block it would write plus the host's `state` — whether its own setup ran here, the servers it left on, its test-user password slots (`lib/host-adapter.mjs`, read-only); `--governance <host|none>` overrides |
| `render-scan.mjs` | §4a/§4b: the operator's confirmation tables, verbatim — `--repos` (client repos with default branch + PR target) and `--tracker` (role → state per work-item type) |
| `next-steps.mjs` | §9: "the project is ready" + what to do now, from the profile and the installed plugins (`--plugins a,b` overrides detection) |
| `sync-browser-secrets.mjs` | §7: generate `.env.playwright.local` (Playwright `--secrets`) from the current env's passwords — the agent types the NAME, the MCP types the value; `--check` exits 1 when stale |
| `write-agent-rules.mjs` | §7 / `--check` Step C: copy `templates/rules/*.md` (the browser-only-through-Playwright rule) into the project's `.claude/rules/`, so it binds every plugin, current and future; overwrites only its own marked files; `--check` exits 1 when missing or stale. Stands down when host-governed |
| `install-deps.mjs` | §1 / `--check`: `npm install --omit=dev` in the folder of every installed plugin of this marketplace (from `claude plugin list`, not a fixed list) that lacks a runtime dependency (`--check` only reports) |
| `ensure-session.mjs` | establish the browser-login sessions WITHOUT hand-crafted commands: auto-discovers the ADO org tenant and drives `az login --tenant <guid>` / `gh auth login --web`; `--check` probes only. Run in the background (the login blocks on the browser). Run it DIRECTLY, never through `$VC_RUN` — a session login must not see a token (gh refuses to log in while GH_TOKEN is set). |

> The interview asks only **env name · tracker · code host** + an auth preference
> per axis. The **self-diagnostics capture opt-in** (`selfDiagnostics`) is asked FIRST, as
> step 0b, and the flag is written immediately on Yes — the ONE self-diagnostics decision
> `--check` also surfaces. The **`feedback.mode` upstream-delivery consent is NOT asked** (item 4):
> it stays at its `ask` default and the delivery flow asks once, per finding, at send time.
> Both env files are scaffolded as commented templates the operator fills;
> the scan (step 4) derives projectType + clientOrg, the derive block (step 5) derives
> contribution mode + fork account + operator, and verify-access (step 8) confirms.
