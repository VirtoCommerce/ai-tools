# Host-governed projects — the host's servers, the host's rules

Some client projects run their own **governance plugin**: it injects binding rules into every session,
ships the project's approved MCP servers, and keeps every secret in its own wrapper. On such a project
the vc-* plugins are a **guest**. `/project-init` (vc-init) records it in `project-profile.json`:

```json
"governance": { "host": "<host plugin key>", "secrets": "host",
                "servers": { "tracker": "…", "codeHost": "…", "github": "…", "telemetry": "…",
                             "testManagement": "…", "browsers": ["…"] },
                "stand": { "writable": false } }
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
