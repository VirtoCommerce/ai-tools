# /project-init on a host-governed project

Read this when §0-host confirmed a host governance plugin. On such a project the client's own plugin
injects binding rules, ships the approved MCP servers and keeps every secret in its own wrapper; vc-init,
vc-fix and vc-perf are **guests**. The host's rules outrank this skill — where they forbid a step, the
step is skipped, never worked around.

## What runs, what does not

| Step | Host-governed |
|---|---|
| §0b self-diagnostics consent | **not asked**; `selfDiagnostics: false` (nothing of ours records the client's sessions) |
| §0d vc-secrets check, `install-bridge` | **skipped** — no vc-secrets, no `$VC_RUN` |
| §0e tooling | `gh`/`az` are not installed for us; Node + git only |
| §1 deps | as usual |
| §2 interview | env name · tracker · code host — **no auth question** (§2d skipped) |
| §3a `.env.<env>` | as usual (non-secret URLs / identifiers) |
| §3b `.env.local` | as usual — test-user password placeholders only |
| §3c `write-secrets-decl`, §3d token pause, §3e token gate | **skipped** |
| §3e normalize-env | as usual |
| §4 `discover-repos`, §4b `discover-tracker`, §5 `derive-context` | **skipped** — the client code host and tracker are read through the host's MCP servers at run time, never with a PAT or `az`. Each script also stands down by itself if run (one `host-governed` line, exit 0) |
| §6 `gen-profile` | runs, with `--governance <host>` (+ any `--gov-<role>` the operator changed) and the tracker / code host answers; `--repos-json` / `--tracker-json` absent |
| §7 `sync-browser-secrets` | **skipped** — the browser lanes are the host's |
| §7 `gen-mcp` | **skipped entirely** — `.mcp.json`, `enabledMcpjsonServers` and the settings `env` are the host's; nothing is written or pruned |
| §7 `write-agent-rules` | **skipped** — the browser lanes and the rules that govern them are the host's (the script stands down by itself) |
| §8 `verify-access` | runs directly (not through `$VC_RUN`) and prints the **host-mode readiness table**: the host plugin installed, each mapped server present among the servers it ships, the non-secret URLs. It resolves no secret |
| §9 `next-steps` | runs as usual; the tracker asks it lists name the host's tracker server |
| `ensure-session` | **skipped** — no `az login`, no `gh auth login` |
| `--check` Step M (`migrate-secrets`) | **skipped** — secrets are the host's to manage |

## Confirming the servers

`detect-governance.mjs` prints the host's default `servers` per role (tracker, codeHost, github,
telemetry, testManagement, browsers). Show them as ONE table and ask with `AskUserQuestion`: accept, or
correct a role. **Which host server serves the tracker and which the code host is the operator's answer —
never inferred** from a server's name. Pass a correction to gen-profile as `--gov-tracker <key>`,
`--gov-code-host <key>`, `--gov-github <key>`, `--gov-telemetry <key>`, `--gov-test-management <key>`,
`--gov-browsers <k1,k2>`.

## Writing the profile early

Right after the confirmation, write the profile stub so every later script sees the decision:

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/project-init/gen-profile.mjs" --governance <host> [--gov-<role> <key> …] \
  --self-diagnostics false --runtime-mode plugin
```

§6 re-runs gen-profile with the tracker / code host answers; the `governance` block is kept across that
re-run (and across `--check`) unless `--governance none` clears it.

## At run time

vc-fix reads `governance.servers.*` and uses those MCP servers (its `knowledge/execution/host-governance.md`).
The `$VC_RUN` bridge refuses every token-bearing tool on such a project (exit 78, naming the server to
use), and self-diagnostics delivery is disabled — nothing leaves for the VirtoCommerce GitHub.

## Not host-governed after all

`--governance none` (at §0-host or on gen-profile) records `governance.host: null` and the normal flow
runs. An explicit `--governance <host|none>` always wins over detection.
