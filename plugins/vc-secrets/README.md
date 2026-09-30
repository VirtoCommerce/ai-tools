# vc-secrets

This launcher runs a **declared process** with the secrets that process needs — an MCP server, or a task that is
not one. The config entry holds a call to the launcher instead of a credential:

```json
{ "mcpServers": { "github": {
    "command": "node",
    "args": ["${VC_SECRETS}", "run", "github"] } } }
```

At launch, `vc-secrets` reads that server's declaration, resolves the secrets it names from the OS
credential store (or Azure Key Vault), injects them into **the process tree rooted at that declared
process**, and stays as its parent to forward stdio and kill the tree on exit. Two things that phrase does
not say: a sibling process gets nothing, and the declared process's own children get everything it got —
environment is inherited, and nothing can un-inherit it. The child also keeps your ambient environment, as
any spawned process does, so a credential already exported in your shell reaches it too; moving those into
declarations is what removes them. No token in `.mcp.json`, in `~/.claude.json`, in a settings `env` block,
or in a `.env` file.

**What this protects, and what it does not.** It protects credentials **at rest** — out of the files that
get committed, synced, pasted into an issue, or read by anything that can read your config — and against
**accidental exposure** through those files. It does **not** isolate a secret from the process you declared,
from that process's descendants, or from other code running as the same OS user: whatever can run commands
as you can read the same credential store directly, with or without this tool. Read the rest of this file
with that boundary in mind; nothing below quietly widens it.

What it does not do: there is deliberately **no command that prints a secret value**, and no verb that
runs an arbitrary command with secrets attached. Only declared servers and tasks are launched — and, when
a repository declares them, only after you [trust](#trusting-a-repositorys-declarations) that
declaration. Since a task inherits stdio, a *declared* task can of course print what it was given
(`{"command": "printenv"}`). That is why a task's argv belongs in a reviewed declaration: the guarantee
is that the caller cannot choose the command, not that a reviewer can stop reading.

This plugin ships **no MCP servers**. Each server is declared by whoever needs it — a repo for the
team's servers, a person for their own.

## Skills

| Skill | What it does |
|---|---|
| `install` | Put the shim at a stable path and print the settings entry plus the commands that use it |
| `doctor` | Resolve everything a live server needs and report what is broken |
| `migrate` | One-time: move user-scope secrets stored under the pre-plugin flat `mcpw:<name>` credential (or `~/.config/mcpw/secrets/<name>.gpg`) to their namespaced keys. A repository's secret is skipped |

`install` deliberately installs a **shim**, not a copy of the launcher: plugin files live in a cache
directory whose path carries the version, so a copy would keep running an old launcher after an
update while the plugin's commands moved on. The shim resolves the plugin's current location on every
launch, so an ordinary plugin update needs no reinstall.

From a terminal, everything runs through the shim, by its literal path — `install` prints the exact
commands, and every other verb takes the same form, so there is nothing to configure first. (If you'd
rather type a short name than paste the path each time, export it as `VC_SECRETS` from your shell's
own startup file — that's a convenience you set up yourself, not something this tool needs or
writes.) The `settings.json` entry `install` also prints is separate and unrelated to your terminal:
it reaches only the processes Claude Code itself starts, which is why a wrapped MCP server needs it
but a command you type by hand does not:

| Verb | |
|---|---|
| `set <name>` | Store one secret. Hidden prompt; the value never appears in argv. Only works for a name already declared — it refuses an unknown one. |
| `login <name>` | Sign in to the `oauth` entry `<name>` in a browser and store its token. Refuses an entry a repository declares until your user file acknowledges its app registration. |
| `logout <name>` | Delete the stored token for that entry, and print which entries were removed and how many were already absent. A `login` still waiting on its browser tab can finish afterwards and store a token again — close that tab. |
| `run <server>` | Resolve and run that server on stdio, staying as its parent. This is what an MCP entry calls. |
| `task <name>` | Same, for a declared non-MCP command — a load-test harness, a migration step. |
| `doctor` | Diagnose. Exits non-zero on any `FAIL`, so it works as a gate. |
| `unlock` | Warm the gpg agent for the session (gpg backend only) — decrypts whichever of the current or the older stored file exists. No-op on Windows and macOS. |
| `migrate` | Copy legacy-prefix entries to namespaced keys, for user-scope declarations only: a legacy entry is your own value, so it is never copied into a repository's namespace, and the repository's secrets are skipped with a line saying so. Idempotent. |
| `emit-config <client>` | Print the MCP entries for every declared server in that client's format — `claude-code`, `cursor` or `codex`. Stdout is exactly what you paste; the guidance goes to stderr, including a note for each repository server you have not trusted yet. See [Clients](#clients). |
| `trust` | Show what this repository's declarations would run — command, args, env names and `literal:` values, and the `projectId` — and, on a `y` typed at a terminal, record it. Refuses without an interactive terminal, before showing anything. See [Trusting a repository's declarations](#trusting-a-repositorys-declarations). |
| `untrust [path]` | Remove the trust record for `path` (default: the repository you are in). Needs no terminal and no declaration. |

## Declarations

Reviewable, and committed where they belong. Three homes, precedence
**local > project > user** — the same relationship `settings.local.json` has to `settings.json`:

| Scope | File | Committed | For |
|---|---|---|---|
| `project` | `<repo>/.claude/vc-secrets.json` | yes | the team's servers |
| `local` | `<repo>/.claude/vc-secrets.local.json` | no, gitignore it | yours, in this repo only |
| `user` | `~/.claude/vc-secrets.json` | no | yours, everywhere |

A server or task whose winning entry is in a `project` or `local` file needs [your trust](#trusting-a-repositorys-declarations)
before it launches; a `user` one does not, since you wrote it. `local` is gated with `project` although it
is nominally yours: the launcher cannot tell a tracked file from an untracked one without running `git`
inside a repository it has not yet decided to trust, and it will not do that.

```jsonc
{
  "schemaVersion": 1,
  "projectId": "my-module",              // required once a project-scope secret exists
  "secrets": {
    "ado-pat": { "backend": "local" },
    "monitor-sp": { "backend": "keyvault", "vault": "myvault", "secret": "sp-nonprod", "format": "json" }
  },
  "servers": {
    "azure-devops": {
      "command": "npx",
      "args": ["-y", "@azure-devops/mcp@2.8.1", "my-org", "-a", "envvar"],
      "env": { "ADO_MCP_AUTH_TOKEN": "secret:ado-pat" }
    },
    "monitor": {
      "command": "dnx",
      "args": ["Azure.Mcp@3.0.0-beta.27", "--yes", "server", "start", "--read-only"],
      "env": { "AZURE_CLIENT_SECRET": "secret:monitor-sp.clientSecret" }
    }
  }
}
```

### Tasks: the same thing, for what is not an MCP server

Plenty of things need a credential without being an MCP server — a load-test harness, a one-off
migration step, a script calling an API. Declare those as `tasks` and run them with `task <name>`:

```jsonc
"tasks": {
  "loadtest": { "command": "bash", "args": ["run.sh"], "env": { "API_PASSWORD": "secret:api-user" } }
}
```

Identical validation, identical injection, and the same process-group teardown path — a server and a task
escalate to SIGKILL on different clocks. The important part is
what is **absent**: there is no verb that takes a command from the caller. `vc-secrets exec -- <cmd>`
would be the convenient version of this, and it would also be a secret printer — `exec -- printenv` —
which is exactly what a tool with no read command must not acquire. A task's argv lives in the
declaration, so it is reviewed in a pull request like a server's — and, when a repository declares it,
refused until you have trusted it — and the caller chooses only *which declared* task to run.

What this does not reach: a credential that must appear inside a URL or an argument the tool then
writes somewhere (a git remote with an embedded token, for instance). Injecting it into the
environment does not help there; that case wants a git credential helper, not this.

- A pinned version belongs here, not in `.mcp.json` — this file is the single source of a wrapped
  server's argv.
- **Every `env` value carries its kind**: `secret:<name>` for a reference, `oauth:<name>` for a token
  acquired by signing in, `literal:<value>` for a constant. Anything else is refused when the
  declaration loads. A pasted credential has no shape it can hide in — the reader who forgets the prefix
  gets an error, not a plaintext token in the file this tool exists to empty. It also ends the near-miss
  family: `secrets:<name>` with the plural no longer means anything, so it cannot be silently accepted
  as a constant.
- `secret:<name>` resolves the whole value; `secret:<name>.<field>` needs `"format": "json"`.
- `oauth:<name>` takes no `.<field>` — a token is not a JSON document. `vc-secrets login <name>` acquires and
  stores the token; launching a server that references an `oauth:` value hands it to the child and keeps
  it fresh for as long as the launch lives. One `oauth:` reference per launch — a second is refused, rather
  than silently renewing whichever of the two was written last — and the child must run a node new enough
  for `--import`, which is how a renewed token reaches it.
- `literal:` is stripped once: `literal:literal:x` sets the value `literal:x`.
- The rule covers `env`, which is where a credential belongs if it must be given to a process at all.
  `args` stay free text — a token there would be visible in the machine's process list anyway, so it is
  reviewable text rather than a surface this tool can defend. A control character (a newline, a tab,
  an escape) in `command` or in an `env` key is refused when the declaration loads: nothing
  legitimate needs one there, and the trust review, the refusal lines and `doctor` all print them. An `args` element may hold one -- a multi-line `sh -c` script is fine --
  and the review prints `args` escaped.
- `projectId` is **declared, never derived.** A git worktree has a different path from its main
  checkout, so a path-derived identity would hide the secrets you already set. It may appear in the
  project or the local file; if in both, they must agree. `user` is reserved.
- Being declared, it is also **claimable**: two repos that write the same `projectId` share one
  namespace, and a developer with both checked out gives each the other's secrets. So the separation
  between projects is a convention this tool keeps for you, not a boundary it enforces against a
  declaration that wants to cross it. Don't copy a `projectId` between repos.

### Signed-in tokens: the `oauth` block

An `oauth:<name>` reference names an entry here. It describes the app registration to sign in against,
and the server process that is meant to hold the token:

```jsonc
"oauth": {
  "ado": {
    "tenantId": "<tenant-guid>",
    "clientId": "<client-id>",
    "scopes": ["<resource>/.default", "offline_access"],
    "targetPackage": "@azure-devops/mcp",
    "binName": "mcp-server-azuredevops"
  }
}
```

- `tenantId` and `clientId` come from the declaration — nothing about a tenant or a registration is built
  into this tool.
- `scopes` must include `offline_access`. Without it the sign-in returns no refresh token, and
  `vc-secrets login` refuses it.
- `targetPackage` is **required**: the npm package of the server the token is meant for. A renewed token
  is delivered only into a node process whose entry file is that package's `dist/index.js` (or, with
  `binName`, a file of that name), because the launch environment reaches every node process below it
  — `npx` and its helpers included — and being started there is not evidence of being the server. It is
  a package **name**, held to the npm naming rules, never a pattern: a declaration names the server it
  means, and cannot write an expression that matches more. The match is by path segment, so an unscoped
  name also matches a scoped package of the same name (`@other/<name>`), and a `binName` matches any
  file so named — within the launched server's own process tree, which already holds the token it was
  started with.
- **`dist/index.js` is a convention this matcher assumes, not a path it reads from the package.** It
  holds for many MCP servers and fails for any package whose `bin` points somewhere else —
  `@playwright/mcp` and `mcp-remote` both do. For those the package alternative matches nothing at all,
  so `binName` is the only way to reach them and is **not** optional there. Read both halves of the
  package's own `bin` entry rather than assuming either: the key is what `binName` wants, and the value
  is what tells you whether the package alternative is live at all.
- `binName` is optional where that convention holds: the package's executable, as `npx` normally starts
  it (`node_modules/.bin/<bin>`). It is its own key because a bin name is not derivable from the package
  name — the example's package ships the bin `mcp-server-azuredevops`, not `mcp`. **Leave it out and a
  server started through its `.bin` shim never receives a renewed token**: it runs on the token it was
  launched with, and loses access when that expires. The launcher reports the miss on its second renewal
  tick, naming the target the declaration asked for — and that line is the only report there is, so a
  server that quietly loses access is worth a look at the launcher's stderr.
- `authorized` works as it does for a secret: in your user file it names the project servers allowed to
  use the token, and anywhere else it is ignored with a warning.

Every key's shape is checked when the declaration loads, including the two keys only a launch reads.
Whether `scopes` includes `offline_access` is not, and surfaces at `login`.

A project or local file may declare an `oauth` block, but the tenant and the client then come from the
repository — so a committed declaration could otherwise have a delegated token minted against any app
registration it names. Your consent is keyed by that pair, in your user file, and names the server
that consumes the token with its shape exactly as declared — the same comparison a secret's
authorization gets. For the `azure-devops` server above, with its env value changed to `oauth:ado`:

```json
{
  "registrations": {
    "<tenant-guid>": {
      "<client-id>": {
        "servers": {
          "azure-devops": {
            "command": "npx",
            "args": ["-y", "@azure-devops/mcp@2.8.1", "my-org", "-a", "envvar"],
            "envKeys": ["ADO_MCP_AUTH_TOKEN"]
          }
        }
      }
    }
  }
}
```

`vc-secrets login <name>` refuses a repository-declared entry with no such block, and says which key to
add. `registrations` takes effect only in the user file, and tenant ids match without regard to case.
`doctor` reports this crossing the same way it reports a secret's: `INFO` when the entry is authorized,
`FAIL` with the block to paste when it is not, and `INFO` naming the block to add when the entry has no
registration block and no project- or local-scope launchable has claimed it -- whether nothing
references it at all, or only a user-scope launchable does (which needs no authorization, since you
would be writing both sides).

## Trusting a repository's declarations

The client approved `node "$VC_SECRETS" run gh` once, usually at user scope. What `gh` *runs* is decided by
whichever `.claude/vc-secrets.json` or `.claude/vc-secrets.local.json` the launcher finds walking up from
the working directory — so without a gate, any repository you open could make an entry you approved run
its own command, with no prompt, and a declaration that names no secret is never checked by `authorized`
at all. Codex's "Open restricted" mode for untrusted folders does not close this: it still starts the
MCP servers in your user config, which is why the launcher gates repository declarations itself.

The rule: a server or task whose **winning** entry is in a `project` or `local` file is not launched until
you have trusted exactly what that entry declares. Run `vc-secrets trust` in the repository:

```
server "gh" (project, /work/repo/.claude/vc-secrets.json) -- shadows your user-scope "gh"
    command: npx
    args: ["-y","gh-mcp"]
    env: T=secret:pat, LABEL=literal:nightly
projectId: my-repo
Trust these for /work/repo? [y/N]
```

- What is recorded is the **declared** shape — `command`, `args` and `env` as written (`secret:pat`, not a
  value) — and the repository's `projectId`, in `~/.config/vc-secrets/trust.json` (`$XDG_CONFIG_HOME`
  honoured), keyed by the repository root. The review prints the command, every argument and every
  `literal:` value whole, never cut, because it is what you are approving and a literal such as `PATH`
  decides which binary runs. The refusal lines, `doctor` and `emit-config` name only the env keys and never
  a value, since they travel into a client's logs.
- **Any change** — a different `command`, different `args`, an env key added, removed or re-pointed, a
  different `projectId` (it decides whose namespace a project-scope `secret:<name>` resolves in; a user-scope
  one resolves under `user`) — refuses
  the launch until you run `trust` again. Trusting replaces the repository's record, so an entry that has
  gone from the declarations is gone from the record too, and a later re-declaration of the same name
  starts untrusted.
- It needs an **interactive terminal**, as a confirmation of intent rather than a boundary. Both stdin and
  stderr must be terminals, and on Linux and macOS your answer is read from the controlling terminal
  (`/dev/tty`), not from stdin. That refuses a pipe, a redirected stream, a script and an agent's plain shell
  tool, and it does so before printing the review, so a caller that cannot answer is not shown the
  `literal:` values either. It does **not** stop a process that deliberately allocates a pseudo-terminal — `script`, `expect`, a
  pty library on any OS, ConPTY or winpty on Windows — and on Windows only the stdin/stderr check applies,
  because there is no `/dev/tty` to read from. The guard hook sees only the client's write tools, so this is
  what stands between the record and a `trust` that answered a pipe; see
  [Scope of the protection](#scope-of-the-protection). `untrust` removes trust and needs neither a terminal
  nor a declaration.
- On a launch (`run`, `task`) the check happens before anything is resolved: an untrusted repository does
  not trigger a keystore prompt or a token refresh that way. `doctor` is not a launch: it reads every declared
  secret it would check (a Key Vault secret that no enabled server consumes needs `--all`), because
  `secrets` declarations are not gated (they execute nothing). Only a launch of a repository's launchable
  depends on the trust file, so your own user-scope servers never do; `doctor` and `emit-config` read it to
  report on the repository's. A trust file that cannot be read refuses repository launches
  rather than reading as empty or as trusted, and `doctor` names it.
- `secrets`, `oauth` and `vaults` declarations are not gated — they execute nothing — and a secret crossing
  still needs its own `authorized` block. Trusting a server does not grant it your secret.
- `doctor` prints a `FAIL` for each repository launchable that is untrusted or has changed since, and does
  not run the `--version` probe on it: that probe would execute the very command the gate refuses.
  `emit-config` still emits every server and notes on stderr which ones are not trusted yet.
- Each git worktree is its own repository root and is trusted separately.

Trust covers the argv and env declarations, not what they lead to; see
[Scope of the protection](#scope-of-the-protection).

## Where a secret is stored, and under what key

Keys are namespaced by the declaration's home, so a project's secrets and your personal ones never
share a key:

| Declared in | Key |
|---|---|
| project or local (same project) | `vc-secrets:<projectId>:<name>` |
| user | `vc-secrets:user:<name>` |

Precedence is the client's own, and deliberately so: Claude Code resolves a server defined in several
scopes as local, then project, then user, taking **the whole entry** from the winner rather than merging
fields. The same name in more than one home is therefore normal here too, across the user boundary
included — and `doctor` reports every such collision with the home that won, which is how the client
answers the same ambiguity when it shows you the effective set. The report is not the whole answer: a
winner from a repository still has to be [trusted](#trusting-a-repositorys-declarations) before it
launches, so a repository that shadows one of your own names does not get to run its own command under
the approval you gave the name.

A project-declared server may **reference** a user-scope secret — one personal PAT used from several repos
is the ordinary case, and declaring it per project would put copies of the same credential in as many
namespaces, each of which you would then have to remember to rotate. But naming your secret is not consent
to receive it. You authorize the **shape** that may, in your own file:

```json
{
  "secrets": {
    "personal-pat": {
      "backend": "local",
      "authorized": {
        "servers": {
          "gh": { "command": "npx", "args": ["-y", "gh-mcp"], "envKeys": ["T"] }
        }
      }
    }
  }
}
```

A launch compares the declaration against that block and refuses on any difference — a changed `command`,
changed `args`, an added env key. `doctor` reports each crossing: `INFO` when it is authorized, `FAIL` with
the block to paste when it is not, built from the declaration as it stands so you read the command before
approving it. `authorized` takes effect only in the user file; anywhere else the party asking for the
approval would be the one writing it, and the loader says so and ignores it.

The shape, rather than the name, is what has to match, and the reason is one level of indirection: your
`.mcp.json` entry says `node "$VC_SECRETS" run gh`, and that is what the MCP client asks you to approve.
The declaration deciding what `gh` actually runs sits below that approval — rewrite it and the client sees
no change to re-ask about. So an approved name is not an approved command. Two records pin it, and they
answer different questions: your **trust** in the repository pins the command and env of every server or
task that repository declares, whether or not a secret is involved; `authorized` still decides which
command may receive *your* secret, and stays in your user file where no repository can write it.

Your own user-scope servers and tasks need no block: you wrote both sides, and there is no one to
authorize against.

**A `keyvault` secret needs the same authorization even when the project declares it**, and this is the one
place the rule is not about which file the declaration sits in. A project-declared `local` secret is already
harmless: its key is namespaced to the project, so it reads what *you* set for that project and nothing
else — the `set` you ran is the authorization. A vault read has no such act behind it. `keyFor` is not
consulted; the vault and secret name are read from the declaration as written, and the read is paid for by
whatever identity `az` holds, which the repository does not own. So a committed declaration naming any vault
your login can reach would otherwise hand over that secret. The vault and the secret name stay in the
repository, where they belong; the authorization is keyed by that pair in your file:

```json
{
  "vaults": {
    "team-nonprod": {
      "db-password": {
        "servers": { "api": { "command": "npx", "args": ["-y", "api-mcp"], "envKeys": ["DB_PASSWORD"] } }
      }
    }
  }
}
```

Same comparison, same `doctor` output, same paste. `vaults` takes effect only in the user file — in a
repository file it is ignored with a warning, for the reason `authorized` is user-scope only.

One consequence worth knowing: when a project declares a secret whose name you also use personally, the
project's entry wins **and keys the project's namespace**, so its server reads
`vc-secrets:<projectId>:<name>` and not your personal value. Nothing silently borrows the other's
credential; the two simply live under different keys.

The value itself lives where your platform keeps credentials: a Credential Manager generic
credential (Windows), a Keychain generic password (macOS), or a gpg-encrypted file under
`~/.config/vc-secrets/secrets/<scope>/` (Linux/WSL, `$XDG_CONFIG_HOME` honoured). Use `set` rather
than writing these by hand — it gets the file mode, the atomic replace and the key shape right.

## Clients

| Client | MCP config | Servers key | Launcher reference | Minimum version |
|---|---|---|---|---|
| Claude Code | `<repo>/.mcp.json`, `~/.claude.json` (local and user scopes) | `mcpServers` | `${VC_SECRETS}` | none |
| Cursor | `<repo>/.cursor/mcp.json`, `~/.cursor/mcp.json` | `mcpServers` | `${env:VC_SECRETS}` | **UNKNOWN** |
| Codex | `~/.codex/config.toml` | `mcp_servers` | none — the entry carries a literal path | none |

`UNKNOWN` is not "no floor". Nobody has measured which Cursor version this works on, and rendering
that as "none" would be a claim rather than a gap. `emit-config` says the same thing when it prints
an entry for that client.

Codex's "Open restricted" mode for untrusted folders does **not** stop the MCP entries in your user config
from starting, and those entries are exactly `node <shim> run <name>` — so a repository's declaration
could run through one. That is why the launcher gates repository declarations itself; see
[Trusting a repository's declarations](#trusting-a-repositorys-declarations).

`emit-config <client>` generates the entries from your declaration, which already names every
server. Its stdout is exactly what you paste; the guidance goes to stderr, so a redirect produces a
valid file.

## Setup

Every verb reads the declaration, so write one first — `<repo>/.claude/vc-secrets.json` for the team's
secrets, `~/.claude/vc-secrets.json` for your own. On a fresh machine, skipping this step means every
verb below throws. Then, for a repository's servers and tasks, read them and run `vc-secrets trust` in
that repository from a terminal — a launch refuses them until you have, and again after any change to
them. Your own user-scope ones need no such step.

Then follow your client's branch. They differ in three things and nothing else: how the plugin is
installed, whether the shim is needed at all, and — on one of them — whether the hook is trusted.
Each branch ends by running `doctor`, which is the verification: a setup check that lives only in a
repository cannot reach the people who need it, so it ships as a verb of the tool.

### Claude Code

Install from the marketplace. Run the `install` skill once per machine and paste the printed `env`
entry into `~/.claude/settings.json`, then restart — a wrapped server picks the variable up only on
start. `install` prints rather than writes: that file is yours, and a tool that edits a developer's
global settings unasked is a tool nobody trusts twice. Paste `emit-config claude-code` into
`<repo>/.mcp.json`, or use `claude mcp add-json --scope user|local` for your own. Then:

```bash
node "<the path install printed>" set <name>  # <name> must be one of the secrets your declaration lists
node "<the path install printed>" unlock      # gpg backend only, once per session, in a real terminal
node "<the path install printed>" doctor      # expect no FAIL
```

### Cursor

Load the plugin from `~/.cursor/plugins/local`. That is the only install route documented here, and
deliberately so: Cursor's marketplace reads its own manifest file, which this repository does not
ship, so "install it from the marketplace" would be an instruction nobody has performed.

Cursor's entry uses a variable rather than a baked path, but something still has to stand behind it:
run the `install` skill once per machine and set `VC_SECRETS` to the shim path it prints. Cursor reads
that as `${env:VC_SECRETS}` from your environment, so export it from your shell's own startup file —
the `env` entry `install` prints is another client's mechanism and does nothing here.

Then paste `emit-config cursor` into `<repo>/.cursor/mcp.json` or `~/.cursor/mcp.json` and run
`doctor`. If the plugin does not appear in Cursor's own plugin list, that is the symptom of the
unestablished version floor, and a trace log is the only other place it shows.

### Codex

Add this checkout as a marketplace source and install `vc-secrets` from it — the repository's
existing `.claude-plugin/marketplace.json` is one of the manifest paths Codex accepts, so nothing
needs publishing. Enable the plugin in `~/.codex/config.toml`.

Then run the `install` skill once per machine. Codex expands no variables in its config, so
`emit-config codex` bakes the shim's absolute path into every entry — and the shim is a file that
`install` creates. Skip this and the pasted entries name a file nothing wrote, so every wrapped
server fails at launch with a module-not-found naming a path you never chose. You do **not** need the
`env` entry that `install` also prints: that is read by another client and nothing here uses it.

Paste `emit-config codex` into `~/.codex/config.toml`, run `doctor`, and trust the hook.

> **The guard does not run here until you trust it.** A plugin-provided hook arrives untrusted: it is
> listed and not executed until a `trusted_hash` for it exists under `[hooks.state."<key>"]` in your
> **user** config — and a plugin cannot ship that entry, by design. So "installed and enabled" does
> not mean the guard is active. Verify by attempting an edit to a declaration file and seeing it
> refused. A bypass flag exists and is the wrong answer for a guard.
>
> **If the edit goes through, there are two causes and this probe cannot tell them apart.** The likely
> one is that the hook is untrusted — check the client's own hooks view, trust it, and repeat. The
> other is that the shared hook file's matcher never selected the hook for this client's write tool at
> all, in which case trusting changes nothing and the guard is inert here. That second cause is a
> standing assumption recorded in `hooks/targets.mjs`, and this probe is its only detector, so a
> repeat that still goes through after trusting is the finding worth reporting rather than working
> around.

## Knobs

| Variable | Effect |
|---|---|
| `VC_SECRETS` | Where the shim lives; referenced from `.mcp.json` so no repo hardcodes a plugin path |
| `VC_SECRETS_LOCAL_BACKEND` | Override the detected backend (`wcm` / `keychain` / `gpg`). WSL is **not** treated as Windows |
| `VC_SECRETS_GPG_RECIPIENT` | Encrypt to a specific key instead of your default |
| `VC_SECRETS_POWERSHELL` | Set to `pwsh` if Constrained Language Mode blocks the in-box PowerShell's `Add-Type` |
| `VC_SECRETS_TIMING` | `1` prints the resolve-phase duration to stderr. The probe drops it from the launcher it spawns — that line would otherwise be the last one before a silent server death, and get read as a launcher refusal |
| `VC_SECRETS_CONFIG_DIR` | Test support — read declarations from one directory. That directory is a project root like any other and needs [trust](#trusting-a-repositorys-declarations): exempting it would let anything able to set this variable name a directory of its own and skip the gate. It is one of several launcher-environment inputs the gate does not defend; see [Scope of the protection](#scope-of-the-protection). `doctor` warns whenever it is set |

## When something fails

| Symptom | Meaning |
|---|---|
| `decryption failed: Operation cancelled` | gpg agent is cold — `unlock` in a terminal |
| `FAIL` on every local secret at once | the shell cannot reach the credential store (a sandboxed or restricted one cannot); rerun where it can |
| `secret "x" is only under the legacy key` | Run `migrate` — the value cannot be re-typed, the store never gives it back. `doctor` says this for user-scope secrets only: `migrate` skips a repository's (a legacy entry is yours, not the repository's), which shows as an ordinary `secret "x" not resolvable` — `set` it |
| `projectId disagrees` | The project and local files name different ids; they key the same secrets |
| `server "x" is declared by <file> ... and is not trusted` | A repository declares it and you have not trusted it. Read the declaration, then run `vc-secrets trust` in the repository named at the end of the line, from a terminal |
| `server "x" changed since you trusted it: ...` | The declaration differs from what you trusted; the line lists what. If you accept it, run `vc-secrets trust` again in that repository. If you did not make the change, that is the finding |
| `the trust file ... could not be read (...)` / `the trust file ... is unusable` | The trust file is unreadable or malformed (invalid JSON reads as *could not be read*), or from a newer launcher. Repository launches are refused until it reads: fix or delete it and run `trust` again in each repository |
| `vc-secrets trust requires an interactive terminal` | Run it yourself in a terminal. A pipe, a script and an agent's plain shell tool are refused; a process that allocates its own pseudo-terminal is not, so this is a confirmation of intent — see [Scope of the protection](#scope-of-the-protection) |
| `schemaVersion N needs a newer vc-secrets` | The declaration is ahead of the installed plugin — update the plugin |
| `Missing environment variables: VC_SECRETS` | The variable was never set on this machine — run the `install` skill |
| A wrapped server shows failed in `/mcp` | `doctor` first (secret?), then the probe for the binary: take the `installPath` of `vc-secrets@vc-tools` from `~/.claude/plugins/installed_plugins.json`, then `node <installPath>/vc-secrets-probe.mjs <server>` |

The probe completes a real `initialize` handshake through `run`. When nothing answers it names which
of three things happened instead of printing one message for all: the launcher could not obtain a
token (routine — nobody has signed in yet; the probe repeats the launcher's own
`vc-secrets login <entry>` remedy when the launcher printed one), the launcher refused for some other
reason (quoted verbatim), or the server binary exited without answering. Only the last means the
binary is broken. `doctor` covers the separate question of whether the secret resolves at all.

## Why an edit to a declaration gets blocked

The plugin ships a `PreToolUse` hook that denies agent writes to four things: a declaration file, the
trust file, the installed shim, and this package's own code. A declaration decides which command receives
which secret, so it changes through a human PR; the trust file records which repository declarations you
approved to run, so it changes only through `trust` and `untrust`; the shim sits on the path of every launch
and no plugin update overwrites it; and the package's modules are what handle the token once a declaration
has named it.

The criterion for that third group is not "does this file touch a token". It has three prongs and a
file needs one of them: **loaded into a process that holds a token**, **relaxing what an agent may do
without a human** — switching this guard off is the extreme of that, a skill's invocation policy the
ordinary case — or **deciding the content of a file that does either**.

The first prong is an `import`, which runs its target when the importing module is evaluated — so
everything the launcher imports executes in the process that reads the keystore, and everything the
preload imports executes inside the MCP server process, which holds the token in its environment.
`vc-secrets-error.mjs` is in both — directly in the launcher, and in the server process by way of
`vc-secrets-target.mjs` — while reading like the most
harmless file in the package. The second prong covers the hook itself, its payload reader, the two hook
registration files, the three client manifests, and the skill files — the manifests are the cheapest
entry of all, since `.cursor-plugin/plugin.json` is the only thing that points a client at
`hooks/hooks-cursor.json`, so repointing one key makes a guarded registration inert without editing it —
a test pins that value, so the repointing is not silent, but the detector is a suite somebody has to run.
The third covers `scripts/install-shim.mjs`, which nothing on the token path imports and decides what the installed
shim contains on the next install, together with `vc-secrets-shim.mjs`, whose bytes are what it copies.

Two things stay writable: the package's own test files, and `README.md`. A guard that freezes the files
the package is worked on is a guard somebody switches off wholesale, which costs more than what it was
protecting; and this file grants nothing — no frontmatter, no permission grant, no key any client reads,
and nothing executes it.

`vc-secrets-probe.mjs` was writable too, on the grounds that nothing on the run path imports it. That is
true and it answers the wrong question. What decides the risk is who **runs** the probe — the `doctor`
skill's own text tells an agent to — and what the probe may import: it already imports the launcher, so
every export the launcher has is one line away. It is guarded.

The skill files are **not** in that writable group, though they look like it, and the three are guarded for two
different reasons. `install` and `migrate` carry `disable-model-invocation: true`, which is what keeps a
verb that copies a file and a verb that rewrites keystore entries human-invoked; `install` also carries
`allowed-tools`, a standing permission grant. `skills/install/agents/openai.yaml` and
`skills/migrate/agents/openai.yaml` say the invocation half of the same thing to another client
(`allow_implicit_invocation: false` — a restriction, not a grant); `doctor` has no such file on purpose.
`doctor` carries neither key — it is the one skill a model may invoke unprompted, and its body is the
command that then runs. An edit to any of them changes what an agent may do; an edit to `README.md`
misinforms a reader.

Some guarded names are guarded **only inside the package directory**: `clients.mjs`, `clients.json`,
`hooks/targets.mjs`, the hook registrations, the client manifests and the skill files. Those names
belong to half the repositories on any machine and this hook runs in all of them, so claiming them
outright would refuse edits in projects that have never heard of vc-secrets. The cost is a workspace
rooted at the package itself, where they arrive with no directory in front of them — and it is worth
being plain about which half that leaves open: `hooks/targets.mjs` and the registrations, the off
switches. The launcher and the hook itself stay covered there, being matched by file.

One off switch **inside this repository** is knowingly out of reach: `.claude-plugin/marketplace.json`
at the repo root — not in this package — is what makes the package a plugin at all, and its name is not
the package's to claim. Outside the repository there are two more, both already described above: the
client's own enable flag, and, on Codex, a hook that stays untrusted until you trust it.

What the hook actually sees differs per client, and the guard reads each shape rather than assuming
one: on Claude Code the matcher selects `Edit`, `Write` and `NotebookEdit`; on Cursor the hook
receives every tool call and the guard filters; on Codex the paths live inside `apply_patch` text and
one patch can name several files, so the guard reads them all. A payload it cannot parse is reported
rather than passed in silence — that message is the difference between "nothing to block here" and "I
could not tell".

In all three it stays a speed bump: the same change made through a shell command goes past it. It
surfaces an unexpected edit; it is not a boundary. Editing those files in your own editor is the
intended path.

### Checking it by hand

Six payloads, fed to the hook directly. The three that must exit **0** are the ones worth running: a
guard is easy to check when it refuses and impossible to check when it stays silent, so the probes
that pin the silence are the ones worth the keystrokes.

They answer one question — whether this hook reads payloads correctly, or has gone quiet on a shape it
cannot parse. They say nothing about whether your client invokes it at all: they pipe JSON straight
into `node` and never involve the client, so they pass unchanged on a machine where the hook is
untrusted, or where the matcher never selects it for that client's write tool. For that question the
in-client edit attempt described under **Codex** above is still the only detector.

`printf`, not `echo`: `sh`'s `echo` expands `\n`, which turns probe 2's JSON into a broken document
that the guard declines at exit 0 — a probe that reports success by failing to parse.

```bash
H=./hooks/guard-declarations.mjs     # the copy you mean to check, named directly -- CLAUDE_PLUGIN_ROOT
                                     # is not reliably set in a shell, and unset it becomes /hooks/...
p() { printf '%s' "$2" | node "$H"; echo "  -> exit $?  ($1)"; }

# 1. a relative path from a write tool                         BLOCK, exit 2
p "declaration, relative" '{"tool_name":"Write","tool_input":{"file_path":".claude/vc-secrets.json"}}'

# 2. the same file named inside a patch, not in a path field   BLOCK, exit 2
p "declaration, in a patch" '{"tool_name":"apply_patch","tool_input":{"command":"*** Begin Patch\n*** Update File: .claude/vc-secrets.json\n*** End Patch"}}'

# 3. one of this package's own modules, at any path            BLOCK, exit 2
#    (deliberately OUTSIDE a vc-secrets/ directory: inside one, a directory-scoped
#     pattern would pass this too, and the point here is that it matches by file)
p "module" '{"tool_name":"Edit","tool_input":{"file_path":"some-other-checkout/src/vc-secrets-cache.mjs"}}'

# 4. somebody else's directory that merely ENDS in .claude     ALLOW, exit 0
p "not our declaration" '{"tool_name":"Write","tool_input":{"file_path":"vendor.claude/vc-secrets.json"}}'

# 5. a write whose payload this guard cannot read              ALLOW, exit 0, and it says so
p "unreadable payload" '{"tool_name":"Write","tool_input":{"filePath":".claude/vc-secrets.json"}}'

# 6. an input that is not JSON at all                          ALLOW, exit 0, and it names the reason
#    The value is deliberately unquoted, which is what makes this a leak check rather than a
#    formality: V8's own parse message for it quotes a window of the input, and the input on this fd
#    is the client's tool payload -- the file content about to be written.
p "unreadable input" '{"tool_name":"Write","tool_input":{"file_path":SHOULD-NOT-APPEAR}}'
```

Probes 4 and 5 both exit 0, and the difference is the line probe 5 prints:
`vc-secrets guard: unrecognised Write payload -- not inspected`. That sentence is the whole point of
the pair — without it, a client whose payload shape this guard has never seen is indistinguishable
from a client with nothing to block, and the guard is inert while reading as clean.

Probe 6 is the third exit-0 case, and it pins the other silence: an input this guard cannot parse at
all. It must print `vc-secrets guard: could not read its input (not valid JSON) -- not inspected`, and
that line must **not** contain `SHOULD-NOT-APPEAR`. V8's own message for the same input is
`Unexpected token 'S', ..."ile_path":SHOULD-NOT"... is not valid JSON` — a window onto the payload,
which on this fd is the content of the file the client was about to write. A guard that forwards that
message to stderr publishes whatever it failed to parse, a secret in a `.env` included.

## Scope of the protection

This removes plaintext-at-rest on the MCP path and shrinks the accidental and prompt-injection
surface. It is **not** a boundary against a deliberately malicious agent running the same backend
tools itself, editing a declaration, or tampering with `PATH` — inside one OS user account there is
no such boundary. A real one needs a broker under a separate account.

A changed repository declaration is refused until you [trust](#trusting-a-repositorys-declarations) it
again, so a repository can no longer swap the command behind a name you approved. `trust` demands an
interactive terminal, which refuses a pipe, a script and an agent's plain shell tool but not a process that
deliberately allocates a pseudo-terminal (`script`, `expect`, a pty library, ConPTY or winpty): it is a
confirmation of intent, not a boundary. The gaps that remain are worth stating plainly. Trust covers the **argv and env declarations**, not the files they name: a
declared `node ./server.js` stays trusted while `server.js` changes underneath it, and the same holds for
a script, or for the project `.npmrc` that `npx` reads. Nor does it cover `PATH`, which decides what
`npx` or `node` resolves to. Trust is also only as good as the reading you gave the review, and the guard
that protects the record is a speed bump, not a boundary.

The gate also stands on the **launcher's own environment**, which it does not defend. What a repository
declares is checked; what the process running the launcher was started with is not. `XDG_CONFIG_HOME` or
`HOME` relocates the trust file, `VC_SECRETS_CONFIG_DIR` names another project root, and `NODE_OPTIONS` on
the launcher process itself runs code inside the process that holds every secret. Anything that can set
those can already do what the gate exists to prevent.

Two things it does harden regardless: `NODE_OPTIONS`, `LD_PRELOAD`, `LD_AUDIT`, `LD_LIBRARY_PATH`,
`DYLD_INSERT_LIBRARIES`, and `DYLD_LIBRARY_PATH` are refused as declaration `env` keys and stripped
from every child the launcher spawns, so a declaration cannot inject code into the process that holds
a secret. And a backend's stderr is redacted of any resolved value before it is reported, with the
in-process copy dropped right after the child starts.
