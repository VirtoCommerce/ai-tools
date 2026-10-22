# /project-init on a host-governed project

Read this when §0-host confirmed a host governance plugin. On such a project the client's own plugin
injects binding rules, ships the approved MCP servers and keeps every secret in its own wrapper; vc-init,
vc-fix and vc-perf are **guests**. The host's rules outrank this skill — where they forbid a step, the
step is skipped, never worked around.

**Two setups, one each.** The host's own setup command (`state.setupCommands` — its skills or commands
named for setup / init / onboarding) sets the PERSON up on the host: their role, the sign-in, the host's
secrets, which of its servers stay on. vc-init never runs, repeats or replaces it. `/project-init` then
sets the PROJECT up for our plugins: the profile, the env files and the test users — reading what the
host's setup left behind (`lib/host-adapter.mjs`, read-only).

**No host is known by name.** A candidate is a plugin bound to THIS folder — installed for it (project or
local scope) or enabled in its `.claude/settings*.json` — that is not one of ours and ships MCP servers
and a `SessionStart` hook. A plugin installed for another folder never counts, so a Virto checkout stays
on the normal flow. One installed for the whole machine is listed under `machineWide` and only offered.

## §0-host — confirm, then check the host's setup ran

`detect-governance.mjs` prints `candidates`, `machineWide`, `detected`, the `governance` block it would
write and the host's `state`. Confirm with `AskUserQuestion`: the detected plugin (name it and its
`source`) is this project's governance, or not. No candidate but a `machineWide` one ⇒ ask once whether
that plugin governs this project; yes ⇒ re-run with `--governance <plugin@marketplace>`. Then read `state`:

- **`setUp: false`** ⇒ STOP. Show `reasons` in one line and tell the operator to run
  the host's setup (`state.setupCommands`) in this folder, restart Claude Code, and re-run
  `/project-init`. Do not run any part of it yourself.
- **`setUp: true`** ⇒ show `governance.servers` as ONE table (role → host server, `—` for none). They
  were read from the servers the host's setup left ON here, each by the MCP package it runs
  (`state.enabled[].kind`); ask: accept, or correct a role. The code host is never inferred: ask whether
  the person's host role reaches the code, and if so it is usually the tracker's server. A role with no
  server stays empty — never offer a substitute. Write
  the profile stub at once:

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/project-init/gen-profile.mjs" --governance <host> \
  --gov-tracker <k> --gov-code-host <k|""> --gov-test-management <k|""> --gov-browsers <k1,k2> \
  --gov-website-auth <state.websiteAuth> --self-diagnostics false --runtime-mode plugin
```

## What runs, what does not

| Step | Host-governed |
|---|---|
| §0b self-diagnostics consent | **not asked**; `selfDiagnostics: false` (nothing of ours records the client's sessions) |
| §0d vc-secrets check, `install-bridge` | **skipped** — no vc-secrets, no `$VC_RUN` |
| §0e tooling | `gh`/`az` are not installed for us; Node + git only |
| §1 deps | as usual |
| §2 interview | env name · tracker · code host — **no auth question** (§2d skipped); then map the env (below) |
| §3a `.env.<env>` | URLs only — no built-in `ADMIN` / `USER_EMAIL`: test users take the host's slots |
| §3b `.env.local` | **no password placeholder** — no test-user password lives in a file of ours |
| §3c `write-secrets-decl`, §3d token pause, §3e token gate | **skipped** |
| §3e normalize-env | as usual |
| §4 `discover-repos`, §4b `discover-tracker`, §5 `derive-context` | **skipped** — read through the host's MCP servers at run time; each script stands down by itself |
| §6 `gen-profile` | runs with `--governance <host>` and the tracker / code host answers; the servers and env map confirmed earlier are kept |
| §7 `sync-browser-secrets`, `gen-mcp`, `write-agent-rules` | **skipped** — servers, browser lanes and their rules are the host's |
| §8 `verify-access` | the **host-mode readiness table**: host plugin, each role's server, the host's setup ran here, the profile matches the servers on, every test user's password slot, the URLs. It resolves no secret |
| §9 `next-steps` | as usual; tracker asks name the host's tracker server |
| `ensure-session`, `--check` Step M | **skipped** |

## The environment and its test users

`state.hostEnvs` are the host's website environments (e.g. `qa`, `uat`). Map each `.env.<env>` to one —
ask when the names differ: `gen-profile --gov-envs <env>=<host env>` (adds, never drops; a same-named
env maps by itself). Then:

- **`websiteAuth: "host-secrets"`** — the host's browser servers launch with test-user password SLOTS
  (`<ENV>_<SLOT>_PASSWORD` from a secret reference). Add users with `/project-init --add-user`: it offers
  the free slots, writes the login and a one-line note to `.env.<env>`, and hands the operator the way to
  store that slot's secret with the host's wrapper (hidden input, their own terminal).
- **`websiteAuth: "manual-operator"`** — the host declares no slots: the operator signs in by hand in the
  browser window; no password is asked for or stored.

## At run time

vc-fix reads `governance.*` and uses those MCP servers and slots (its
`knowledge/execution/host-governance.md`). The `$VC_RUN` bridge refuses every token-bearing tool on
such a project (exit 78, naming the server to use), and self-diagnostics delivery is disabled.

## Not host-governed after all

`--governance none` (at §0-host or on gen-profile) records `governance.host: null` and the normal flow
runs. An explicit `--governance <host|none>` always wins over detection.
