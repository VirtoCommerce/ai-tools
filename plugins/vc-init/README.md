# vc-init — onboarding for the Virto Commerce QA plugins

`/project-init` stands the QA plugins (`vc-fix`, `vc-perf`) up on a deployment: it asks only the
environment name, the bug tracker (Jira / Azure Boards), the code host (GitHub / Azure Repos) and an
auth preference per axis, derives everything else from a live scan, and writes the **deployment
profile** (`project-profile.json`) every other command reads.

Two rules shape it (VCST-6402):

- **vc-init is the only writer of the profile.** vc-fix and vc-perf read it — and STOP with
  "run /project-init" when it is missing; there are no silent native-platform defaults. A plugin that
  must persist something writes through `skills/project-init/profile-set.mjs` (`/qa-bug`'s first-run field
  answers, `/perf-init`'s `perf` block).
- **No token in any file.** GitHub, Azure DevOps and Jira tokens are stored in
  [`vc-secrets`](../vc-secrets/README.md) by the operator, in a terminal, at a hidden prompt — never typed
  into the chat, never written to `.env.local`, `.mcp.json` or a settings `env`. A process receives a token
  only through the **`$VC_RUN` bridge**.

## Install

```
/plugin marketplace add VirtoCommerce/ai-tools
/plugin install vc-fix@ai-tools      # pulls in vc-init and vc-secrets
```

Once per machine: run `/vc-secrets:install`, add the `{"env": {"VC_SECRETS": "…"}}` line it prints to
`~/.claude/settings.json`, restart Claude Code. `/project-init` checks this first and stops with these steps
when it is missing.

## `/project-init`

```
/project-init            # the full interview + pipeline
/project-init --add-env  # another environment (URLs + per-env passwords) for an onboarded project
/project-init --check    # reconcile the profile, move any plaintext token into vc-secrets, verify
```

What it writes into the project (all gitignored):

| File | Holds |
|---|---|
| `project-profile.json` | the deployment profile (`schemaVersion` 3): tracker, code host, repos, `auth.{github,ado,jira}`, `governance` |
| `.env.<env>` | URLs and identifiers (no secret) |
| `.env.local` | test-user passwords only |
| `.claude/vc-secrets.local.json` | the vc-secrets declarations: one `local` secret per PAT axis (`github-pat`, `ado-pat`, `jira-token`), the bridge's `vc-init-*` tasks, the GitHub MCP server |
| `.mcp.json` + `.claude/settings.local.json` | MCP servers; the settings `env` holds `VC_RUN` (a path) and no token |

The token step: `/project-init` prints, per token, what it is, where to create it and the exact command
— `node "<VC_SECRETS>" set github-pat` — plus `node "<VC_SECRETS>" trust` when the declarations are new or
changed. The operator runs them in a terminal and replies "done"; `check-secrets.mjs` then reads
`vc-secrets doctor` and names whatever is still missing.

## Host-governed projects

Some client projects run their own governance plugin: it injects binding rules, ships the approved MCP
servers and keeps every secret in its own wrapper. There vc-init, vc-fix and vc-perf are guests, and the
host's rules win. The first known host is `opus-governance` (`lib/governance.mjs` holds the registry).

`/project-init` detects one (the install registry, the project's `enabledPlugins`), the operator confirms
it (`--governance <host|none>` overrides detection either way), and the profile records:

```json
"governance": { "host": "opus-governance", "secrets": "host",
                "servers": { "tracker": "…", "codeHost": "…", "github": "…", "telemetry": "…",
                             "testManagement": "…", "browsers": ["…"] },
                "stand": { "writable": false } }
```

The host's default server per role is shown for the operator to accept or correct — which server is the
tracker and which the code host is the operator's answer, never inferred. On such a project
`/project-init` writes the profile, `.env.<env>` and the test-user password placeholders, and **nothing
else**: no vc-secrets declaration, no `$VC_RUN` shim, no token step, no `.mcp.json` and no settings
`enabledMcpjsonServers`/`env`, no `az login`, no repo or tracker discovery (done through the host's
servers at run time), self-diagnostics off with no consent question. `verify-access` prints a host-mode
table: the host plugin installed and each mapped server among the servers it ships.

At run time the bridge refuses every token-bearing tool (exit 78, naming the server to use), self-diagnostics
delivery is disabled, and vc-fix follows its `knowledge/execution/host-governance.md`. `governance.host: null`
(the default) is the normal flow. Detail: `skills/project-init/host-governed.md`.

## The `$VC_RUN` bridge

```
node "$VC_RUN" gh pr create …                         # GitHub CLI
node "$VC_RUN" git-gh -C .fix-workspace/repo push …   # git on github.com
node "$VC_RUN" git-ado clone https://dev.azure.com/…  # git on Azure Repos
node "$VC_RUN" ado comment --id 967 --text-file c.txt # vc-fix's Azure DevOps CLI
node "$VC_RUN" jira edit-comment --key ABC-1 --id …   # vc-fix's Jira CLI (host pinned to the profile)
node "$VC_RUN" deliver …                              # vc-fix self-diagnostics delivery
node "$VC_RUN" onboard verify-access                  # /project-init's own token-holding scripts
node "$VC_RUN" --where                                # what the bridge resolves
```

`$VC_RUN` is a stable shim (`~/.claude/plugins/data/vc-init-ai-tools/vc-run.mjs`, installed by
`scripts/install-bridge.mjs`) that resolves the current vc-init install on every call, so a plugin update
never changes the command the operator approved with `vc-secrets trust`.

- **Outer side** (what the caller runs; holds no secret): checks the command line against
  `bridge/allowlist.mjs`; when the project declares the task `vc-init-<group>` (a PAT axis) it runs
  `vc-secrets task vc-init-<group>`, otherwise (a session login — `gh auth login`, `az login`, Atlassian
  OAuth) it runs the tool directly.
- **Inner side** (started by vc-secrets with the secret): re-checks the command line, refuses another
  group's tool, builds the child's environment from an allowlist plus the group's secret, pins git to
  `bridge/git-credential.mjs` (answers only github.com / Azure DevOps hosts) with repository hooks and
  non-https transports off, and masks every spelling of the secret in the child's output.

Refused through the bridge, among others: `gh auth …` (prints the token), `gh pr merge` (no auto-merge),
`gh extension`/`alias`, `gh api` with a full URL or `--hostname`, `git -c …`, `--upload-pack`, a remote on
another host or with credentials in its URL, `ado --api-base` off Azure DevOps.

**Scope.** Like vc-secrets itself, this reduces accidental and prompt-injection leaks — a token printed, a
token sent to a host the caller picked, a token persisted into `.git/config`. It is not a boundary against
code already running as the user, which can read the credential store directly.

## Layout

| Path | |
|---|---|
| `skills/project-init/` | the skill and its scripts (`SKILL.md` §Scripts lists them) |
| `commands/project-init.md` | the `/project-init` command |
| `bridge/` | the dispatcher, allowlist, credential helper, redactor, plugin resolver — and their committed tests (`node --test "plugins/vc-init/bridge/*.test.mjs"`) |
| `vc-run-shim.mjs`, `scripts/install-bridge.mjs` | the stable `$VC_RUN` pointer and its installer |
| `scripts/lib/` | vc-init's own copies of the shared libs (plugins are self-contained) |
| `templates/.mcp.json.example` | the MCP template `gen-mcp.mjs` writes `.mcp.json` from |
