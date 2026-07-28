---
description: "Initialize / onboard this QA plugin for a deployment — install deps, ask only env name + bug tracker (Jira/Azure Boards) + code host (GitHub/Azure Repos) + an auth preference, then DERIVE the rest (native-platform vs CLIENT project, client org, contribution mode, fork account) from the token + filled env + a live module/repo scan. Writes project-profile.json + .env + .mcp.json, verifies access. Makes /qa-fix route bugs to the right repo + tracker. Backed by the /project-init skill."
argument-hint: "(no args — interactive) | --add-env (add another environment to an onboarded project) | --check (reconcile an existing profile + verify)"
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
/project-init --add-env  # add another environment (URLs + per-env access keys) to an onboarded project
/project-init --check    # reconcile an existing profile to the current schema, then verify
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
   **(e) Self-diagnostics consent (opt-in — ASK, never assume)** as one `AskUserQuestion`
   block: `selfDiagnostics` (local telemetry capture to `.vc-fix/`, Yes recommended) +
   `feedback.mode` (upstream delivery: `ask` recommended / `auto` / `off`). This MUST be asked —
   the persisted default is `false`/opt-out (PROFILE_DEFAULTS), so a run that skips this question
   leaves capture OFF; capture is enabled ONLY by the operator's explicit Yes here (passed to
   step 6 as `--self-diagnostics`/`--feedback-mode`). The SKILL's §0b additionally writes the Yes
   immediately (a `gen-profile --self-diagnostics true` stub) so `/project-init`'s own run is captured.
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
4b. **Discover tracker — Azure Boards only** (`discover-tracker.mjs --tracker azure --org "$ADO_ORG"
   --project "$ADO_PROJECT" --types "Bug,Task,User story" --out .local-env/tracker.json`): scan
   work-item types → per-type `states` + a `role→state` map (`roleStates`) + `apiBase`/`projectId`/
   `ticketKeyFormat`/`crossLinkToken`. Confirm the `roleStates` with the operator. **Without this the
   Azure profile's `roleStates` is empty and `/qa-fix` asks on every transition.** Jira → format facts
   only (`--tracker jira`), transitions discovered live.
5. **Derive block** (`derive-context.mjs --tracker … --client-vcs …`): reads the filled
   env + sessions, probes the upstream permission, prints JSON — auth actually present per
   axis, `contributionMode` (push⇒direct, else fork), `forkAccount` (token owner),
   `operator`. Capture for step 6.
6. Write the profile (`gen-profile.mjs --repos-json .local-env/repos.json` supplies
   projectType/clientOrg/repos; **`--tracker-json .local-env/tracker.json`** bakes the tracker
   status model + flips `transitionPolicy=auto`; **`--runtime-mode plugin`** when run from an
   installed plugin — the `$CLAUDE_PLUGIN_ROOT` env auto-detect is unreliable, so pass it explicitly;
   + tracker connection from the filled `.env.<env>`; + derived `--operator`/`--contribution-mode`/
   `--upstream-account` (fork only)/`--vcs-auth`; **+ `--self-diagnostics <yes|no>` and
   `--feedback-mode <ask|auto|off>` from the §2e consent answer** — always pass them explicitly so
   the written value reflects the operator's choice, not the safe opt-out default). Do NOT pass
   `--project-type`/`--client-org` — the scan is authoritative.
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

### `--add-env` — add another environment to an already-onboarded project

For a deployment that is ALREADY onboarded (a `project-profile.json` exists) and you want to
point the plugin at **another deployment target** — a second QA env, staging, a customer's
second site — that shares the **same project topology** (tracker, code host, repos,
contribution mode). An environment is just a new **URL set + its access creds**; it does
**NOT** re-run the interview, re-scan repos, rewrite the profile, or regenerate `.mcp.json`
(those are project-level, env-agnostic). The skill's **`--add-env`** section drives this:

1. **Precondition** — `project-profile.json` must exist (if not, run the full `/project-init`
   instead). Confirm cwd (0a). Read `tracker.kind` + `vcs.clientHost` from the profile —
   **do not ask them again** (they're project-level).
2. **Env name** — **ask "what should the new environment be named?" as a plain chat question**
   (like §2a — no positional arg); normalise to `[a-z0-9_]+` and tell the operator what you
   used. **Then the existing-env guard** (2c): check `.env.<name>` — if it already exists,
   `AskUserQuestion` to reuse it (scaffold is add-only, never clobbers) or pick a new name
   (re-ask + re-check). Not found → proceed.
3. **Scaffold the new env's two files** — `scaffold-env.mjs --env <new> --tracker <kind>
   --client-vcs <host>` → `.env.<new>` (its own URLs/identifiers); `scaffold-secrets.mjs
   --env <new> --tracker <kind> --client-vcs <host>` → adds the `_<ENV>`-suffixed per-env app
   passwords (`ADMIN_PASSWORD_<ENV>`/`USER_PASSWORD_<ENV>`) to `.env.local`. Cross-env tokens
   already present (GitHub/Jira/ADO) are **untouched** (idempotent add-only). Tell the operator
   to fill both, then **pause** with the waiting banner.
4. **Verify** the new env: `FORCE_COLOR=1 TEST_ENV=<new> node
   "$CLAUDE_PLUGIN_ROOT/skills/project-init/verify-access.mjs"`; restate the readiness table.
5. **Done** → `TEST_ENV=<new>` selects the new environment for `/qa-fix`, `/qa-bug`, etc.
   (A different **tracker or code host** is a different *project*, not an environment — run a
   fresh `/project-init` in its own directory for that.)

### `--check` — reconcile an existing setup (after a plugin upgrade), then verify

Do **not** re-run the interview. The skill's **`--check`** section drives this:

1. **Reconcile** the profile to the current schema (dry-run):
   `node "$CLAUDE_PLUGIN_ROOT/skills/project-init/reconcile-profile.mjs" --print` — prints
   `added` (safe defaults) / `removed` (obsolete fields) / `pending` (operator-decision
   fields, each with a `question`+`options` — e.g. `selfDiagnostics`) / `rescan` (re-derive
   live). `no-profile` ⇒ run the full interview instead; `current` ⇒ nothing stale.
2. **Ask** each `pending` decision via `AskUserQuestion` (default = Recommended); re-run
   `discover-*` for any `rescan`; then apply:
   `node "$CLAUDE_PLUGIN_ROOT/skills/project-init/reconcile-profile.mjs" --write --set <path>=<value>`.
3. **Verify**: `FORCE_COLOR=1 TEST_ENV=<env> node "$CLAUDE_PLUGIN_ROOT/skills/project-init/verify-access.mjs"`.

Restate both the reconciliation summary and the readiness table in your reply.

### Signal completion (self-diagnostics — the LAST action of EVERY path)

`/project-init` is exactly where self-capture is first enabled (§0b writes the `selfDiagnostics:true`
stub so its OWN run is captured), so its terminal step MUST emit the completion signal like every
other terminal command — otherwise a slash-only run with no Skill span leaves the collector thinking
there was no plugin activity and never surfaces its clean/health line. As the **last action** of
whichever path ran — the full interview (Step 9), `--add-env` (step 5), or `--check` (step 3) — run
this once (best-effort, silent, never blocks):

```bash
node "$CLAUDE_PLUGIN_ROOT/hooks/session-telemetry.mjs" complete --skill "project-init"
```

So the collector prints its one-line status **exactly once** after the run. No-op when capture is off.
Details: [`knowledge/diagnostics/skill-expectations.md`](../knowledge/diagnostics/skill-expectations.md)
§Signal completion.
