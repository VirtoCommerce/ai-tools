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

## The flow — host check, AskUserQuestion rounds, ONE hand-off

### 1. Host check (§0-host)

`detect-governance.mjs` prints `candidates`, `machineWide`, `detected`, the `governance` block it would
write and the host's `state`. Confirm the detected plugin (name it and its `source`) is this project's
governance — fold this into the question round below when nothing else needs an answer first. No
candidate but a `machineWide` one ⇒ ask once whether that plugin governs this project; yes ⇒ re-run with
`--governance <plugin@marketplace>`. An `inactive` one (installed for this folder, but its settings no
longer switch it on — e.g. the folder's `.claude/settings.json` was deleted) ⇒ STOP: Claude Code does not
load it, so neither its rules nor its servers are here. Tell the operator to switch it on again with the
host's own install instructions (for this folder's scope) and restart Claude Code; never edit the settings
for them.

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
production is never guessed) · only when the code probe (3a) READ the repos: may the agent open PRs on
the client's repos (the person's host role grants writing) — yes ⇒ `write`, no ⇒ `read`. URLs and
accounts follow in step 4, also as `AskUserQuestion` rounds.

Never invent a URL; an origin the host blocks (its browser config's `blockedOrigins`) is refused.

Write the profile once the question round is answered — `state.genProfile` with the answers applied,
plus the tracker / code host facts:

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/project-init/gen-profile.mjs" <state.genProfile, answers applied> \
  --tracker <facts.tracker> --azure-org <facts.adoOrg> --azure-project <facts.adoProject> \
  --client-vcs <facts.clientVcs> --gov-envs <env>=<host env>,… --self-diagnostics false --runtime-mode plugin
```

(`--gov-envs` only for an env whose name differs from the host's.) Then §3a scaffold-env for each env.

### 3a. Code access — probe it, never ask it; then scan the repos

Whether the person reaches the client's code is a fact of their host role, not of the host's
documentation — so it is PROBED, before the question round, through the tracker's server (an Azure
DevOps server reaches Azure Repos): call its list-repositories tool for the project (e.g.
`repo_list_repos_by_project`). The operator approves the call when Claude Code asks.

- **It returns repos** ⇒ the person can READ the code: `codeAccess` is at least `read`, the code host
  is the tracker's server. Scan them as the normal flow does (§4), only through the host's server:
  write the listing as JSON (`{ host, org, project, access, repos: [{ name, id, defaultBranch }] }`,
  `access` from the question round), run
  `discover-repos.mjs --listing-json <file> --out repos.json`. It answers `needs-files` with the repos
  whose files it needs: for each in `needs.packageJson` read the root `/package.json` (the file tool,
  e.g. `repo_get_file_content`) into `packageJson` (`null` when absent); for each in `needs.moduleIds`
  list `/src` and read `/src/<X>.Web/module.manifest`, putting each `<id>` into `moduleIds` (`[]` when
  none). Re-run until it writes `repos.json`, then `gen-profile --repos-json repos.json --merge
  --gov-code-host <tracker server> --gov-code-access read|write`. Keep the listing in a temp file,
  not in the project.
- **It is refused or errors** ⇒ `--gov-code-access none`, no code host, no scan.
- **The call is blocked by Claude Code itself** (a permission prompt the operator declined, or an
  automatic refusal) ⇒ say so, record nothing, and ask the operator to run the same request in their
  own words; never work around it.

### 4. URLs and test accounts — AskUserQuestion, no file

Every answer comes through `AskUserQuestion` — no form typed in the chat, no file to fill. A typed value
(a URL, a login, a note) is the question's **Other** answer: each question offers its sensible fixed
choices as options and the operator types anything else there. At most four questions per call, so:

1. **URLs** — one call per two environments, one question per URL: *"`qa` — storefront URL?"*, *"`qa` —
   admin (back office) URL?"*. Options: `Skip this environment` · `Leave empty for now`; the URL is typed
   as Other. Never invent a URL; an origin the host blocks is refused and asked again.
2. **How many accounts** — one call, two questions per environment: admins / storefront users, options
   `0` · `1` · `2` · `3` (Other for more — at most the free host password slots of that environment).
3. **Each account, admins first** — one call per two accounts, two questions each: *"`qa` · admin 1 of 2 —
   login?"* (options: `Skip this account` · `Same login as on <previous env>` when there is one; the
   login typed as Other) and *"`qa` · admin 1 — what is this account?"* (options: a few typical notes —
   `Main admin`, `Buyer`, `Approver`, `Read-only user`; Other for anything else). Never a password.

Write each answer as it arrives:

```bash
# URLs (and the ADO coordinates read from the host) — values on stdin, never argv:
node "$CLAUDE_PLUGIN_ROOT/skills/project-init/write-env.mjs" < answers.json
# each account, into the next free slot of its environment:
node "$CLAUDE_PLUGIN_ROOT/skills/project-init/add-user.mjs" --env <env> --slot <next free slot>   --role admin|user --login <login> --note "<the note>"
```

Pipe the write-env JSON from the command line (`echo '<json>' | …`), never a file left in the project.
Collect every add-user report's `steps` for the hand-off. Then §3e normalize-env (it detects `STORE_ID`).

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
| §2 interview | replaced by steps 2–4 above: facts shown, then `AskUserQuestion` rounds (choices, URLs, accounts). §2b and §2d are **not asked** |
| §3a `.env.<env>` | URLs only — no built-in `ADMIN` / `USER_EMAIL`: test users take the host's slots. The file is gitignored |
| §3b `.env.local` | **no password placeholder** — the tracker / code-host connection only |
| §3c `write-secrets-decl`, §3d token pause, §3e token gate | **skipped** |
| §3e normalize-env | as usual — it requests the storefront URL once to detect `STORE_ID` |
| §4 `discover-repos` | **through the host**: step 3a — a listing read with the host's server, `--listing-json`; without one it stands down. VirtoCommerce modules are not listed (the modules API needs an admin sign-in, which is the host's) |
| §4b `discover-tracker`, §5 `derive-context` | **skipped** — read through the host's MCP servers at run time; each script stands down by itself |
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
