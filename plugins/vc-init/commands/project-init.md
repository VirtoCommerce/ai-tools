---
description: "Initialize / onboard the Virto Commerce QA plugins for a deployment — check vc-secrets, install deps, ask only env name + bug tracker (Jira/Azure Boards) + code host (GitHub/Azure Repos) + an auth preference, then DERIVE the rest (native-platform vs CLIENT project, client org, contribution mode, fork account) from the token + filled env + a live module/repo scan. Every PAT is stored by the operator in vc-secrets and reaches a process only through the $VC_RUN bridge. Writes project-profile.json + .env + the vc-secrets declarations + .mcp.json, verifies access. Every installed plugin reads that profile. Backed by the /project-init skill."
argument-hint: "(no args — interactive) | --add-env (add another environment to an onboarded project) | --add-user (add another storefront user or admin to an environment) | --check (reconcile an existing profile, move plaintext tokens into vc-secrets, verify) | --governance <host|none> (override host-governance detection)"

---

# /project-init — deploy & wire the QA plugins for a customer

Bring the Virto Commerce plugins (vc-fix, vc-perf, …) up on a new machine / for a new customer and
produce the **deployment profile** (`project-profile.json`) that every installed plugin reads — the
tracker (Jira or Azure Boards), the code host and its repositories (client module / theme / storefront
fork **or** native VirtoCommerce platform), the stands.

Methodology + helper scripts: the [`/project-init` skill](../skills/project-init/SKILL.md). This
plugin (vc-init) is the ONLY writer of the profile; vc-fix and vc-perf stop with "run /project-init"
when it is absent.

**Tokens never pass through chat or a file.** The operator stores each PAT with
`node "<VC_SECRETS>" set <name>` in their own terminal and approves the declarations with
`node "<VC_SECRETS>" trust`; every script that needs a token runs as `node "$VC_RUN" <tool> …`.

**Ask only what shapes the config; DERIVE the rest.** Interview = **env name ·
tracker · code host** + an auth preference per axis. `projectType`, client org,
contribution mode, and fork account are **not asked** — they come from the token's
permissions + the filled env + a live module/repo scan.

## Usage

```
/project-init            # run the full onboarding interview + pipeline
/project-init --add-env  # add another environment (URLs + per-env passwords) to an onboarded project
/project-init --add-user # add another storefront user or admin to one or more environments
/project-init --check    # reconcile an existing profile, move plaintext tokens into vc-secrets, then verify
```

## Flow (the skill drives this)

**Host-governed project first (§0-host).** `detect-governance.mjs` looks for a client governance plugin
(`--governance <host|none>` overrides). If the operator confirms one, the skill follows its
`host-governed.md`: profile + non-secret env files only — no vc-secrets, no `$VC_RUN`, no `.mcp.json`, no
PAT, no `az login`, self-diagnostics off; the host's rules win.

0. Preconditions — **(0a)** confirm the working directory (`pwd` + `AskUserQuestion`); wrong folder →
   STOP (cwd is fixed at launch). Resolve the plugin dir once (`echo "$CLAUDE_PLUGIN_ROOT"`).
   **(0b)** self-diagnostics capture consent FIRST, written immediately on Yes. **(0d)** vc-secrets
   shim — `check-secrets.mjs --preflight` installs it itself when missing (no `~/.claude/settings.json`
   edit: §7 writes `VC_SECRETS` into the project's `.claude/settings.local.json`); STOP only when it
   cannot. Then
   `install-bridge.mjs` → the literal `VC_RUN=<path>` used for the rest of the session. **(0e)**
   detect **and install** missing tooling: `gh` (required), `az` (only if Azure is chosen).
1. Install deps into **every installed plugin's** folder (`install-deps.mjs` — every installed plugin of the marketplace, found at run time;
   Claude Code installs none) + Playwright browsers (`npx playwright install chromium firefox`).
2. Interview — **no mid-interview reconnaissance**: (a) **ENV_NAME** as a plain chat question;
   (b) **tracker + code host** as one `AskUserQuestion` block; (c) **existing-env guard**; (d) **auth
   preference** per applicable axis (github always; ado if azure tracker/host; jira if jira) — **PAT is
   Recommended**, else browser/CLI login. The token is NOT typed in chat — the choice decides whether
   a vc-secrets secret is declared (PAT) or a login is run (session). **Do NOT ask about upstream
   `feedback.mode`** (PR #172 item 4) — it stays at its `ask` default.
3. Scaffold + hand off: `scaffold-env.mjs` → `.env.<env>` (per-env URLs) + the tracker / code-host connection
   into `.env.local` (once, same for every env); `scaffold-secrets.mjs` → the test-user passwords in `.env.local`; `write-secrets-decl.mjs` → `.claude/vc-secrets.local.json` (one
   secret per PAT axis + the bridge tasks). Show the operator what to fill, the `trust` command when
   the declarations changed, and the token block from `check-secrets.mjs --steps` (what / where / the
   `set <name>` command per token) — then **pause** with the waiting banner, no tool calls after it.
   On "done": **token gate** `check-secrets.mjs` (reads doctor's lines; exit 1 ⇒ show the remaining
   `trust`/`set` commands and wait again), then `normalize-env.mjs` (exit 1 ⇒ STOP).
4. **Discover repos — ALWAYS** (`node "$VC_RUN" onboard discover-repos --client-vcs …`): derive
   `projectType` + `clientOrg` → `.local-env/repos.json`. Show the FULL table `render-scan.mjs --repos`
   prints (default branch + PR target per repo) and the question as the turn's LAST message (plain chat —
   a table above a tool call is collapsed out of view); confirm on the answer. Ask ONLY on a
   genuine ambiguity.
4b. **Discover tracker — Azure Boards only** (`node "$VC_RUN" onboard discover-tracker --tracker azure …`):
   per-type `states` + a `role→state` map + the bug field contract. Show the FULL status table
   `render-scan.mjs --tracker` prints (role → state for each work-item type), again as the turn's last
   message; confirm on the answer.
5. **Derive block** (`node "$VC_RUN" onboard derive-context --tracker … --client-vcs …`): auth actually
   present per axis, `contributionMode`, `forkAccount`, `operator`.
6. Write the profile (`gen-profile.mjs --repos-json … --tracker-json … --runtime-mode plugin` + tracker
   connection + derived flags + `--github-auth`/`--ado-auth`/`--jira-auth` from 2d + `--self-diagnostics`
   from 0b). Do NOT pass `--project-type`/`--client-org` — the scan is authoritative.
7. Browser login secrets (`sync-browser-secrets.mjs` → `.env.playwright.local`: the agent types a password's
   NAME, Playwright MCP types the value — skipped when 3c put the passwords in vc-secrets, where each lane
   is `node ${VC_RUN} playwright <lane>` and no file exists), then `.mcp.json` (`gen-mcp.mjs`) → restart MCP servers.
8. Verify access — `FORCE_COLOR=1 TEST_ENV=<env> node "$VC_RUN" onboard verify-access` then
   `node "$CLAUDE_PLUGIN_ROOT/skills/project-init/assert-profile.mjs"`. **Restate the readiness table
   AND the MCP-server status as Markdown tables in your reply.** For a **session-auth FAIL** run
   `ensure-session.mjs` directly (never through `$VC_RUN`) **in the background**.
9. Done → an explicit labelled **Step 9**: summary + manual actions (restart Claude Code so `VC_RUN`
   and `.mcp.json` take effect, pending OAuth) + what to do now from `next-steps.mjs` — "the project is
   ready to work with" and the asks/commands of the plugins actually installed.

### `--add-env` — add another environment to an already-onboarded project

For a deployment that is ALREADY onboarded and needs **another deployment target** sharing the same
project topology. An environment is a new **URL set + its per-env passwords**; tokens are
project-level (vc-secrets) and are not touched. The skill's **`--add-env`** section drives this:
precondition (profile exists; read `tracker.kind` + `vcs.clientHost` — never re-ask) → env name +
existing-env guard → `scaffold-env.mjs` + `scaffold-secrets.mjs` for the new env → pause → verify with
`TEST_ENV=<new> node "$VC_RUN" onboard verify-access`.

### `--add-user` — add another storefront user or admin

For an onboarded project that needs one more test user on one or more environments. The skill's
**`--add-user`** section drives this: `add-user.mjs --list` (environments, their password mode, their
users) → ask the env(s), the role, the KEY and the login per env — never the password →
`add-user.mjs --env <env> --key <KEY> --role user|admin --login <login>` per env → hand the operator its
`steps` (`trust` + `set <key>-password-<env>` in a terminal, or the `.env.local` line to fill) → restart.
An agent then logs in with `<KEY>_LOGIN` and types `<KEY>_PASSWORD` by name.

### `--check` — reconcile an existing setup (after a plugin upgrade), then verify

Do **not** re-run the interview. The skill's **`--check`** section drives this:

0. vc-secrets ready + the bridge (as §0d); `install-deps.mjs` (a plugin update has no `node_modules`).
1. **Reconcile** the profile to the current schema (dry-run): `reconcile-profile.mjs --print` —
   `added` / `removed` / `pending` / `rescan` (a schema-1 profile's auth axes are re-derived through
   `node "$VC_RUN" onboard derive-context`). `no-profile` ⇒ run the full interview instead.
2. **Ask** each `pending` decision via `AskUserQuestion`; re-run `discover-*` for any `rescan`; then
   apply with `reconcile-profile.mjs --write --set <path>=<value>` and bring the declarations in line
   with `write-secrets-decl.mjs --from-profile`.
3. **Move plaintext tokens** — the migration step of the skill finds every token left in a file and,
   once the vc-secrets copy works, strips it.
4. **Verify**: `FORCE_COLOR=1 TEST_ENV=<env> node "$VC_RUN" onboard verify-access`.

Restate the reconciliation summary, the migration report and the readiness table in your reply.

### Signal completion (self-diagnostics — the LAST action of EVERY path)

`verify-access.mjs` fires the terminal-step marker itself. Only if a path ended before it ran, run the
fallback once (best-effort, silent): `node "<vcFix>/hooks/session-telemetry.mjs" complete --skill "project-init"`,
where `<vcFix>` is the `vcFix` path `node "$VC_RUN" --where` prints — the collector is vc-fix's. No-op
when capture is off. Details: vc-fix's `knowledge/diagnostics/skill-expectations.md` §Signal completion.
