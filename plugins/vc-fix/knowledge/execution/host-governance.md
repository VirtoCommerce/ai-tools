# Host-governed projects — the host's servers, the host's rules

Some client projects run their own **governance plugin**: it injects binding rules into every session,
ships the project's approved MCP servers, and keeps every secret in its own wrapper. On such a project
the vc-* plugins are a **guest**. `/project-init` (vc-init) records it in `project-profile.json`:

```json
"governance": { "host": "<plugin>@<marketplace>", "secrets": "host",
                "servers": { "tracker": "…", "codeHost": "…", "github": "…", "telemetry": "…",
                             "testManagement": "…", "browsers": ["…"] },
                "stand": { "writable": false },
                "websiteAuth": "host-secrets|manual-operator", "envs": { "<env>": "<host env>" },
                "codeAccess": "none|read|write" }
```

**The rule, whenever `governance.host` is set:**

1. **Every tracker, code-host, GitHub, telemetry and test-management operation goes through the MCP
   server named in `governance.servers.<role>`** — the host's tools, with the host's sign-in. Never
   `node "$VC_RUN" …` (the bridge refuses every token-bearing tool there, exit 78, naming the server to
   use), never a PAT, never `az login`, never `.env.local`, never an MCP server of ours.
2. **The host's injected rules outrank ours.** Where a vc-fix command, agent or knowledge file says
   otherwise — a write, a resource, a delivery channel — the host's rule wins, and the step is done its
   way or reported as not possible.
3. **Stands are read-only** (`governance.stand.writable: false`): no seeding, no data mutation.
4. **Nothing leaves for VirtoCommerce.** Self-diagnostics delivery is disabled (`deliver` refuses), and
   capture is off by default.

Map a step by its role: work items, comments, transitions ⇒ `servers.tracker`; clone, branch, PR on the
client's code ⇒ `servers.codeHost`; the VirtoCommerce upstream ⇒ `servers.github`; logs ⇒
`servers.telemetry`; test cases ⇒ `servers.testManagement`; a browser lane ⇒ one of
`servers.browsers`. A role with no server mapped is a capability the project does not grant — STOP and
say so; do not reach for a substitute.

**The client's code — `governance.codeAccess`:**

- `read` — read the client's repos (`repos.client`, `access: "read"`) through `servers.codeHost` — its
  file and search tools — for the root cause, a reproduction, a review. Never a branch, a push or a PR:
  `/qa-fix` stops after its root-cause step and hands the fix to a person.
- `write` — the `/qa-fix` path, but every branch, push and PR through `servers.codeHost` (the client repos'
  `contribution.prApi` is `host-mcp`): never `gh`, never the ADO REST, never a clone with credentials of
  ours — the bridge refuses them here (exit 78). What the host's server cannot do (e.g. push file
  changes) is handed to a person with the diff.
- `none` / empty — no code at all: say so and STOP where code is needed.

**Signing in to the client's website as a test user:**

- `websiteAuth: "host-secrets"` — the host keeps each test user's password in a SLOT of its secret wrapper and
  hands it to its browser servers. The user's block in `.env.<env>` reads
  `# vc-init user <SLOT> (<role>) — <note>. … NAME: <HOSTENV>_<SLOT>_PASSWORD (…)` followed by
  `<SLOT>_LOGIN=<login>`; pick the user by its note, type the login as text, and type the password by
  that NAME — `browser_type(text="QA_USER1_PASSWORD")`. Never the value, never `<SLOT>_PASSWORD`
  without the environment prefix, never a user from another environment's file. A NAME the browser
  types back literally means the slot is empty: STOP and ask the operator to fill it
  (`/project-init --add-user` prints the command).
- `websiteAuth: "manual-operator"` — no password reaches an agent. Ask the operator to sign in in the
  visible browser window, wait for "done", and keep working in that session; a restarted browser server
  needs a new sign-in.
- Only the environments in `governance.envs`, and never an origin the host blocks.
