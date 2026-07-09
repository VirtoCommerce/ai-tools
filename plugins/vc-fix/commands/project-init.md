---
description: "Initialize / onboard this QA plugin for a deployment — install deps, ask only env name + bug tracker (Jira/Azure Boards) + code host (GitHub/Azure Repos) + an auth preference, then DERIVE the rest (native-platform vs CLIENT project, client org, contribution mode, fork account) from the token + filled env + a live module/repo scan. Writes project-profile.json + .env + .mcp.json, verifies access. Makes /qa-fix route bugs to the right repo + tracker. Backed by the /project-init skill."
argument-hint: "(no args — interactive) | --check (verify an existing setup)"
disable-model-invocation: true
---

# /project-init — deploy & wire this QA plugin for a customer

Bring this agentic-QA plugin up on a new machine / for a new customer and produce
the **deployment profile** (`project-profile.json`) that every skill reads — so
`/qa-fix` knows the infrastructure and routes each bug to the right repository
(client module / theme / storefront fork **or** native VirtoCommerce platform)
and the right bug tracker (Jira or Azure Boards).

Methodology + helper scripts: the [`/project-init` skill](../skills/project-init/SKILL.md).

**Additive & safe:** only adds a profile + config; with no profile the plugin
keeps its original behaviour (native-platform / Jira / GitHub). Never auto-merges.

**Ask only what shapes the config; DERIVE the rest.** Interview = **env name ·
tracker · code host** + an auth preference per axis. `projectType`, client org,
contribution mode, and fork account are **not asked** — they come from the token's
permissions + the filled env + a live module/repo scan.

## Usage

```
/project-init            # run the full onboarding interview + pipeline
/project-init --check    # just run verify-access.mjs against the current setup
```

## Flow (the skill drives this)

0. Preconditions — **(0a)** confirm the working directory: `pwd`, show it, and confirm via
   `AskUserQuestion` that this is the deployment project (everything is generated here and
   read from here). Wrong folder → STOP, tell the operator to relaunch Claude Code from the
   right directory (cwd is fixed at launch, not movable with `cd`). Resolve the plugin dir
   once (`echo "$CLAUDE_PLUGIN_ROOT"`) — prefix every generator call with it. **(0b)** detect
   **and install** missing tooling: `gh` (required), `az` (only if Azure is chosen); STOP if
   Node 18+/`git` are absent.
1. Install deps into the **plugin** (`( cd "$CLAUDE_PLUGIN_ROOT" && npm install )` — subshell, NOT
   a bare `npm install`, which would land in the project; scripts resolve `dotenv` from the plugin's
   own `node_modules`) + Playwright browsers (`npx playwright install chromium firefox`).
2. Interview — **no mid-interview reconnaissance**: (a) **ENV_NAME** as a plain chat
   question (operator replies; becomes `TEST_ENV` → normalise to `[a-z0-9_]+`; not via
   AskUserQuestion / widget); (b) **tracker + code host** as one `AskUserQuestion` block
   (independent — Azure Boards + GitHub is fine; upstream is always GitHub); (c)
   **existing-env guard** — if `.env.<name>` exists, ask via `AskUserQuestion` to
   **reuse** (scaffold only adds missing keys) or **new name** (re-check) — never
   auto-pick; (d) **auth preference** as one `AskUserQuestion` block for the applicable
   axes (github always; ado if azure tracker/host; jira if jira) — **PAT is Recommended**,
   else browser/CLI login. The token is NOT typed in chat — the choice only decides
   whether a token placeholder is emitted to `.env.local` (PAT) or a login is run
   (session). **No operator / projectType / contribution-mode question** — derived later.
3. Scaffold BOTH env files as commented templates: (3a) `scaffold-env.mjs --tracker …
   --client-vcs …` → `.env.<env>` (ADO_ORG/ADO_PROJECT emitted for an azure tracker OR
   azure-repos host; **do NOT pass --project-type/--client-org** — client org is derived);
   (3b) `scaffold-secrets.mjs` → `.env.local` (auth axes `--jira-auth`/`--ado-auth`/
   `--github-auth`; session auth emits no token line); (3c) tell the operator **two files
   created — fill both** (inline comments say what/where), then **pause**. Never a raw
   account password. **End the pause with a visually unmistakable waiting banner** (e.g. a
   blockquote `> ⏸️ WAITING FOR YOU — fill in both files, then "done"`) as the last line, no
   tool calls after it — a plain "let me know" reads as narration, not a prompt.
4. **Discover repos — ALWAYS** (`discover-repos.mjs --client-vcs …`, no `--client-org`):
   classify installed modules + scan the client host for the storefront/theme repo, and
   **derive `projectType` + `clientOrg`** → `.local-env/repos.json`
   (`{ projectType, clientOrg, client, platform }`). Show the map; confirm. Ask ONLY on a
   genuine ambiguity (github host + no client modules + no org → native platform vs client
   org; or no storefront repo matched → name it).
5. **Derive block** (`derive-context.mjs --tracker … --client-vcs …`): reads the filled
   env + sessions, probes the upstream permission, prints JSON — auth actually present per
   axis, `contributionMode` (push⇒direct, else fork), `forkAccount` (token owner),
   `operator`. Capture for step 6.
6. Write the profile (`gen-profile.mjs --repos-json .local-env/repos.json` supplies
   projectType/clientOrg/repos; + tracker connection from the filled `.env.<env>`; +
   derived `--operator`/`--contribution-mode`/`--upstream-account` (fork only)/`--vcs-auth`).
   Do NOT pass `--project-type`/`--client-org` — the scan is authoritative.
7. Generate `.mcp.json` (`gen-mcp.mjs`) → restart MCP servers.
8. Verify access — `FORCE_COLOR=1 TEST_ENV=<env> node "$CLAUDE_PLUGIN_ROOT/skills/project-init/verify-access.mjs"`
   (`FORCE_COLOR=1` so the Status column renders — the script auto-disables colour on a
   non-TTY, and the harness runs it through a pipe) prints a full readiness table +
   READY/NOT-READY verdict (profile · core env · URLs · real admin login · storefront-user
   soft-probe · tracker token · GitHub token + upstream perm · gh CLI). Resolve every FAIL.
   **Restate the readiness table AND the MCP-server status as Markdown tables in your
   reply** (tool output is often collapsed/hidden), mapping rows to surfaces
   (front=FRONT_URL, back=BACK_URL+admin login, Jira=tracker token, Git=GitHub token+gh
   CLI) + the PASS/FAIL/WARN/verdict line. For a **session-auth FAIL** (az/ADO or gh),
   don't make the operator type commands — run `ensure-session.mjs` **in the background**
   (it auto-discovers the ADO tenant and drives `az login --tenant <guid>` /
   `gh auth login --web`), let them complete the one browser consent, then re-run.
9. Done → present as an explicit labelled **Step 9**: summary (incl. derived projectType /
   contributionMode) + manual actions (reload IDE for `.mcp.json`, pending OAuth) + first
   run `/qa-fix <TICKET>`.

For `--check`, skip to step 8: `FORCE_COLOR=1 TEST_ENV=<env> node "$CLAUDE_PLUGIN_ROOT/skills/project-init/verify-access.mjs"`.
