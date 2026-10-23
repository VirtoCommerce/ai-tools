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

**Never ask what the host already says.** `state.facts` holds what was read from the host's own files,
each with where it came from: the tracker kind, the Azure DevOps organization and project, the code host
kind, the website environments. Fill those in and SAY what was filled and from where — one line each —
instead of asking. The operator corrects a line only if it is wrong. `STORE_ID` is detected from the
storefront by normalize-env (one HTTP request to the URL the operator gives), so it is never asked either.

## The flow — host check, ONE question round, logins one by one, ONE hand-off

### 1. Host check (§0-host)

`detect-governance.mjs` prints `candidates`, `machineWide`, `detected`, the `governance` block it would
write and the host's `state`. Confirm the detected plugin (name it and its `source`) is this project's
governance — fold this into the question round below when nothing else needs an answer first. No
candidate but a `machineWide` one ⇒ ask once whether that plugin governs this project; yes ⇒ re-run with
`--governance <plugin@marketplace>`.

`confirmed: false` ⇒ the host's setup left no trace here (none of its servers is switched off);
`likelyFresh: true` adds that a role still has several servers on, the look of an untouched install (show
`reasons`). Neither is a verdict — a person may keep several servers on legitimately. Ask whether the
host's setup has run in this folder, in the question round. No ⇒ STOP: tell the operator to run it
here, restart Claude Code, and re-run `/project-init`; do not run any part of it yourself.

### 2. What was filled in — show, do not ask

One block, before any question:

```
Filled in from <host> (correct me only if a line is wrong):
  tracker        Azure Boards          — <facts.tracker.from>
  ADO org        <org>                 — <facts.adoOrg.from>
  ADO project    <project>             — <facts.adoProject.from>
  code host      Azure Repos           — <facts.clientVcs.from>
  environments   qa, uat               — <facts.envs.from>
  servers        tracker <k> · test management <k> · browsers <k1, k2, k3>
  test users     passwords in <host>'s own secret tool (its password slots)
```

A fact that is absent is asked in the round below instead.

### 3. ONE question round

Everything with a fixed set of answers goes into ONE `AskUserQuestion` call (at most four questions; only
the ones that apply): the host is this project's governance · the host's setup has run here (only when
`confirmed: false`) · which server serves each role in `state.choices` (telemetry included — which one is
production is never guessed) · whether the person's role on the host reaches the client's code (yes ⇒ the
code host is the tracker's server; no ⇒ empty). Then ONE plain-chat message asks for every free-text
value at once, as a short form the operator answers in one reply:

```
For each environment (qa, uat — or rename / drop one):
  storefront URL:
  admin (back office) URL:
How many test accounts per environment: admins __, storefront users __
```

Never invent a URL; an origin the host blocks (its browser config's `blockedOrigins`) is refused.

Write the profile once these answers are in — `state.genProfile` with the answers applied, plus the
tracker / code host facts — and the env files:

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/project-init/gen-profile.mjs" <state.genProfile, answers applied> \
  --tracker <facts.tracker> --azure-org <facts.adoOrg> --azure-project <facts.adoProject> \
  --client-vcs <facts.clientVcs> --gov-envs <env>=<host env>,… --self-diagnostics false --runtime-mode plugin
```

(`--gov-envs` only for an env whose name differs from the host's.) Then §3a scaffold-env for each env,
write the URLs and the ADO coordinates with write-env, and §3e normalize-env (it detects `STORE_ID`).

### 4. Logins, one account at a time — admins first, then storefront users

For each account the operator counted, in order: all admins of the first environment, then its storefront
users, then the next environment. One plain-chat question per account:

```
<env> · admin 1 of 2 — login (email) and one line about the account, e.g. "buyer in org A, approval limit":
```

Never ask for a password. Each answer goes straight in, taking the next free slot of that environment:

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/project-init/add-user.mjs" --env <env> --slot <next free slot> \
  --role admin|user --login <login> --note "<the line>"
```

### 5. ONE hand-off — what is filled, what is left, where the passwords go

After §8 verify-access, one message the operator can follow top to bottom:

```
Files written (all in this folder, all gitignored):
| File                 | Field                  | Value / what to do                 |
|----------------------|------------------------|------------------------------------|
| project-profile.json | governance, tracker    | written — nothing to do            |
| .env.qa              | FRONT_URL, BACK_URL    | written                            |
| .env.qa              | STORE_ID               | detected: <id>                     |
| .env.qa              | USER1_LOGIN …          | written, one per account           |
| .env.local           | ADO_ORG, ADO_PROJECT   | written                            |

Passwords — in YOUR OWN terminal, one command per account (hidden input; paste, Enter; never in the chat):
  <the add-user reports' store commands, one per line, each with the account's login as a comment>

Then: restart Claude Code — the host's browser servers read the passwords at start.
```

Every password goes to the host's slot — admins and storefront users alike: the host's browser servers
read passwords only from its own secret tool, and an agent may never read one from a file to type it. So
no storage question is asked on a host-governed project.

## What runs, what does not

| Step | Host-governed |
|---|---|
| §0b self-diagnostics consent | **not asked**; `selfDiagnostics: false` (nothing of ours records the client's sessions) |
| §0d vc-secrets check, `install-bridge` | **skipped** — no vc-secrets, no `$VC_RUN` |
| §0e tooling | `gh`/`az` are not installed for us; Node + git only |
| §1 deps | `install-deps` as usual; **no `playwright install`** — the browser servers are the host's |
| §2 interview | replaced by steps 2–4 above: facts shown, one question round, logins one by one. §2b and §2d are **not asked** |
| §3a `.env.<env>` | URLs only — no built-in `ADMIN` / `USER_EMAIL`: test users take the host's slots. The file is gitignored |
| §3b `.env.local` | **no password placeholder** — the tracker / code-host connection only |
| §3c `write-secrets-decl`, §3d token pause, §3e token gate | **skipped** |
| §3e normalize-env | as usual — it requests the storefront URL once to detect `STORE_ID` |
| §4 `discover-repos`, §4b `discover-tracker`, §5 `derive-context` | **skipped** — read through the host's MCP servers at run time; each script stands down by itself |
| §6 `gen-profile` | written in step 3 with the facts and answers; recorded as a client project that files nothing upstream |
| §7 `sync-browser-secrets`, `gen-mcp`, `write-agent-rules` | **skipped** — servers, browser lanes and their rules are the host's |
| §8 `verify-access` | the **host-mode readiness table**: host plugin, each role's server, the host's setup ran here, the profile matches the servers on, each env's test users and their slots (a filled slot is NOT checked — no secret is resolved), the URLs |
| §9 `next-steps` | as usual; tracker asks name the host's tracker server; no `/qa-fix` without a code host |
| `ensure-session`, `--check` Step M | **skipped** |

## Environments and test users later

`state.hostEnvs` are the host's website environments. A same-named `.env.<env>` maps by itself; another
name needs `gen-profile --gov-envs <env>=<host env>` (adds, never drops). A slot is one password, so it
belongs to one user across every `.env.<env>` mapped to the same host environment.

- **`websiteAuth: "host-secrets"`** — add a user any time with `/project-init --add-user`: the free slots
  are offered, the login and a note go to `.env.<env>`, and the operator stores the password with the
  host's tool.
- **`websiteAuth: "manual-operator"`** — the host declares no slots: the operator signs in by hand in the
  browser window; no password is asked for or stored.

## At run time

vc-fix reads `governance.*` and uses those MCP servers and slots (its
`knowledge/execution/host-governance.md`). The `$VC_RUN` bridge refuses every token-bearing tool on
such a project (exit 78, naming the server to use), and self-diagnostics delivery is disabled.

## Not host-governed after all

`--governance none` (at §0-host or on gen-profile) records `governance.host: null` and the normal flow
runs. An explicit `--governance <host|none>` always wins over detection.
