# vc-test — preview

One testing flow for a Virto Commerce ticket ([spec](../../docs/superpowers/specs/2026-10-15-vc-test-plugin-design.md)).
It gathers the ticket's context, maps the change, and scores scenarios that hunt significant bugs. You approve the
scenario list at one human point. Each scenario then gets its own agent, and one more agent proves the ACs in the
background. After that come triage, a Medium-only investigation, and a verdict that reports tokens and minutes
per step.

**Preview.** `/vc-test:ticket-context` and `/vc-test:qa-test-strategy` are this plugin's own code, but both still
read documents that live only in a checkout of `ai-tools`: `/qa-test-strategy` its technique vocabulary, risk framework,
data rules and visual-axis floors (P2 moves them); `/ticket-context` some repository scripts (P1d-3). `/vc-test:qa-ticket`
also calls triage and investigation from there. `/vc-test:init` and the scripts below work in any project.

## Install

```
/plugin install vc-test@ai-tools        # pulls in vc-init (≥ 0.4.1) and vc-fix
/project-init                           # vc-init: the profile, tokens in vc-secrets, test accounts
/vc-test:init                           # vc-test: which envs a run may write to, the knowledge store
```

`vc-test` has its own dependencies: `dotenv` for the env loader it carries, and `@playwright/test` for `.spec`
runs in a project without its own Playwright. In an install, run `npm install --omit=dev --prefix <the plugin's
folder>` once; `/vc-test:init` says so when they are missing. A checkout of this repository already has them.

## What is here

| Path | Does |
|---|---|
| `commands/init.md` | `/vc-test:init`. Writes the profile's `test` block through vc-init's `profile-set.mjs` and lists missing accounts with their `/project-init --add-user` command. It never asks for or writes a password |
| `skills/ticket-context/`, `agents/ticket-context-analyst.md` | `/vc-test:ticket-context`: one gated context bundle for one ticket |
| `skills/qa-test-strategy/`, `agents/strategy-verifier.md` | `/vc-test:qa-test-strategy`: the floors, the gate, and an independent read-only verifier on a Critical risk |
| `commands/qa-ticket.md` | `/vc-test:qa-ticket <KEY> [<env>] [--yes] [--dry-run] [--benchmark]`, the QA run (preview) |
| `lib/profile.mjs` | The read-only profile loader. A missing profile is a STOP ("run /project-init"), never a default |
| `lib/capabilities.mjs` | What this install can do: connectors, stand URLs, MCP servers, the knowledge store, the project's scripts. A stand is writable only by declaration (`test.environments`) and only when `BACK_URL` is the declared stand |
| `lib/deployed.mjs` | F6. It reads module, platform and theme versions from the stand. Run it as `node "$VC_RUN" runner plugin deployed --key <KEY>`, because it needs the admin login. A side it cannot read is UNKNOWN, never "not deployed"; a module the stand has not installed, or disabled on a load error, is never DEPLOYED |
| `lib/knowledge-store.mjs` | The one reader and writer of project and platform knowledge. A client project never writes to the platform store, text is scrubbed, and nothing lands outside the store. It has committed tests (`knowledge-store.test.mjs`) |
| `harness/playwright.config.mjs` | The config vc-init's runner runs `.spec` files under. `testDir` is the project |
| `lib/plan-run.mjs`, `score-scenarios.mjs`, `window.mjs`, `teardown.mjs`, `run-cost.mjs`, … | The run's deterministic steps (P0); see each file's header |
| `briefs/` | One brief per agent of a run |
| `scripts/lib/` | The env loader, copied from vc-fix (`plugins/CLAUDE.md`: a plugin carries its own) |
