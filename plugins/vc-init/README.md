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

Nothing to set up by hand before it: `/project-init` installs the vc-secrets shim itself (§0d) and writes
`VC_SECRETS` into the project's `.claude/settings.local.json` next to `VC_RUN` — no edit to
`~/.claude/settings.json`, and the settings stay in the project folder. Restart Claude Code when it finishes.

## `/project-init`

```
/project-init            # the full interview + pipeline
/project-init --add-env  # another environment (URLs + per-env passwords) for an onboarded project
/project-init --add-user # another storefront user or admin (login + where its password goes) for an env
/project-init --check    # reconcile the profile, move any plaintext token into vc-secrets, verify
```

What it writes into the project (all gitignored):

| File | Holds |
|---|---|
| `project-profile.json` | the deployment profile (`schemaVersion` 3): tracker, code host, repos, `auth.{github,ado,jira}`, `governance` |
| `.env.<env>` | per-env URLs and identifiers (no secret) |
| `.env.local` | what is the same for every env — the tracker / code-host connection (`JIRA_BASE_URL`, `JIRA_PROJECT_KEY`, `JIRA_EMAIL` / `ADO_ORG`, `ADO_PROJECT`, `CLIENT_REPO_ORG`) — and the test-user passwords of the roles not kept in vc-secrets (below) |
| `.claude/vc-secrets.local.json` | the vc-secrets declarations: one `local` secret per PAT axis (`github-pat`, `ado-pat`, `jira-token`), the bridge's `vc-init-*` tasks, the GitHub MCP server; with the passwords in vc-secrets also, per env, its password secrets, `vc-init-onboard.<env>` and the `playwright-<lane>.<env>` servers |
| `.mcp.json` + `.claude/settings.local.json` | MCP servers; the settings `env` holds `VC_RUN` and `VC_SECRETS` (paths) and no token |

One more file is meant to be **committed**: `.claude/rules/vc-browser.md`, the always-loaded rule that every
browser action goes through a Playwright MCP lane — never the built-in browser pane, Claude in Chrome,
Chrome DevTools or a browser started from a shell, none of which can type a password. It sits in the project,
not in a plugin, so it binds every plugin in it, including ones installed later (`write-agent-rules.mjs`,
source `templates/rules/`).

The token step: `/project-init` prints, per token, what it is, where to create it and the exact command
— `node "<VC_SECRETS>" set github-pat` — plus `node "<VC_SECRETS>" trust` when the declarations are new or
changed. The operator runs them in a terminal and replies "done"; `check-secrets.mjs` then reads
`vc-secrets doctor` and names whatever is still missing.

**Test-user passwords** go one of two ways, chosen at the auth question separately for admins and for
storefront users (typically admins in vc-secrets, users in `.env.local`, which is easier to edit):

- **vc-secrets (recommended)** — no password in any file. One secret per password per environment
  (`admin-password-<env>`, `user-password-<env>`), stored with `set` like a token. Each Playwright lane in
  `.mcp.json` is `node ${VC_RUN} playwright <lane>`: the bridge picks the current `TEST_ENV` and runs the
  declared vc-secrets server `playwright-<lane>.<env>`, which starts the pinned `@playwright/mcp` in-process
  (`bridge/playwright-mcp.mjs`) with the passwords as `config.secrets` — a browser agent types the NAME
  (`ADMIN_PASSWORD`), the lane types the value and masks it. The onboarding scripts that log in over the API
  run as `vc-init-onboard.<env>`. A lane also reads the passwords of the roles kept in `.env.local` for its
  env straight from that file, so a mixed setup needs no generated file. One declaration per env means an env whose passwords are not stored yet
  breaks only itself, and switching `TEST_ENV` asks for no new trust.
- **`.env.local`** — `ADMIN_PASSWORD_<ENV>` …, and `sync-browser-secrets.mjs` generates
  `.env.playwright.local`, the lanes' `--secrets` file. Use it where a script outside vc-init reads a
  password from the env files (vc-fix's module registry, seeders): those do not go through the bridge.

## Host-governed projects

Some client projects run their own governance plugin: it injects binding rules, ships the approved MCP
servers and keeps every secret in its own wrapper. There vc-init, vc-fix and vc-perf are guests, and the
host's rules win. No host is known by name: `/project-init` looks for a plugin bound to the folder (installed
for it, or enabled in its settings) that ships MCP servers and a `SessionStart` hook, the operator confirms it
(`--governance <plugin@marketplace|none>` overrides detection either way), and the profile records:

```json
"governance": { "host": "<plugin>@<marketplace>", "secrets": "host",
                "servers": { "tracker": "…", "codeHost": "…", "github": "…", "telemetry": "…",
                             "testManagement": "…", "browsers": ["…"] },
                "stand": { "writable": false },
                "websiteAuth": "host-secrets|manual-operator", "envs": { "<env>": "<host env>" } }
```

The host's own setup command runs first and sets the person up (role, sign-in, its secrets, which servers
stay on); `/project-init` never repeats it and stops with its name when it has not run. The servers per role
are read from the ones left on — by the MCP package each runs — for the operator to accept or correct; the
code host is the operator's answer, never inferred. On such a project `/project-init` writes the profile and
`.env.<env>` (URLs, and test users on the host's password slots), and **nothing else**: no vc-secrets declaration, no `$VC_RUN` shim, no token step, no `.mcp.json` and no settings
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
node "$VC_RUN" playwright chrome                      # a Playwright lane, passwords from vc-secrets (.mcp.json runs it)
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
`gh extension`/`alias`, `gh api` with a full URL or `--hostname`, any `gh api` write or GraphQL call (it reads
only), `git pull` (fetch, then merge locally), `git -c …`, `--upload-pack`, a remote on another host or with
credentials in its URL, an Azure DevOps API base off dev.azure.com / *.visualstudio.com (flag or profile).
The inner side gives gh an empty config directory and git an empty global config, takes the profile from the
declared project rather than the caller's environment, and finds vc-init through the OS account's home,
never HOME / USERPROFILE.

**Scope.** Like vc-secrets itself, this reduces accidental and prompt-injection leaks — a token printed, a
token sent to a host the caller picked, a token persisted into `.git/config`. It is not a boundary against
code already running as the user, which can read the credential store directly.

## Layout

| Path | |
|---|---|
| `skills/project-init/` | the skill and its scripts (`SKILL.md` §Scripts lists them) |
| `commands/project-init.md` | the `/project-init` command |
| `bridge/` | the dispatcher, allowlist, credential helper, redactor, plugin resolver, the Playwright lane launcher (`playwright-mcp.mjs`) — and their committed tests (`node --test "plugins/vc-init/bridge/*.test.mjs"`) |
| `vc-run-shim.mjs`, `scripts/install-bridge.mjs` | the stable `$VC_RUN` pointer and its installer |
| `scripts/lib/` | vc-init's own copies of the shared libs (plugins are self-contained) |
| `templates/.mcp.json.example` | the MCP template `gen-mcp.mjs` writes `.mcp.json` from |
