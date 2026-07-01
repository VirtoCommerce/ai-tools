---
description: "Initialize / onboard this QA plugin for a deployment — install deps, choose native-platform vs CLIENT project, pick bug tracker (Jira/Azure Boards) + code host (GitHub/Azure Repos), capture the test-env URL + browser-login/token auth, discover the client/platform repo split, write project-profile.json + .mcp.json, verify access. Makes /qa-fix route bugs to the right repo + tracker. Backed by the /project-init skill."
argument-hint: "(no args — interactive) | --check (verify an existing setup)"
disable-model-invocation: true
---

# /project-init — deploy & wire this QA plugin for a customer

Bring this agentic-QA plugin up on a new machine / for a new customer and produce
the **deployment profile** (`project-profile.json`) that every skill reads — so
`/qa-fix` knows the infrastructure and routes each bug to the right repository
(client module / theme / storefront fork **or** native VirtoCommerce platform)
and the right bug tracker (Jira or Azure Boards).

Methodology + helper scripts: the [`/project-init` skill](../skills/project-init/SKILL.md).

**Additive & safe:** only adds a profile + config; with no profile the plugin
keeps its original behaviour (native-platform / Jira / GitHub). Never auto-merges.

## Usage

```
/project-init            # run the full onboarding interview + pipeline
/project-init --check    # just run verify-access.mjs against the current setup
```

## Flow (the skill drives this)

0. Preconditions — detect **and install** missing tooling: `gh` (required),
   `az` (only if Azure is chosen); STOP if Node 18+/`git` are absent.
1. Install deps (`npm install` + Playwright browsers).
2. Interview — **no mid-interview reconnaissance**: one `AskUserQuestion` block with
   operator · project type · tracker · **ENV_NAME** (env name entered via the Other
   input; becomes `TEST_ENV` → must match `[a-z0-9_]+`, normalise if needed). Code
   host is a client-only follow-up. **No value form, no per-value questions, no
   separate chat prompt for the name.**
3. Scaffold BOTH env files as commented templates: (3a) `scaffold-env.mjs` →
   `.env.<env>` (non-secret URLs/identifiers/tracker placeholders); (3b)
   `scaffold-secrets.mjs` → `.env.local` (secret placeholders; per-env creds
   `_<ENV>`-suffixed, browser-login auth emits no token line); (3c) tell the operator
   **two files were created — fill both** (inline comments say what/where), then
   **pause** — verify (step 7) checks them. Never a raw account password.
4. Write the profile (`gen-profile.mjs`).
5. Discover the client/platform repo split (`discover-repos.mjs`, client only) → confirm.
6. Generate `.mcp.json` (`gen-mcp.mjs`) → restart MCP servers.
7. Verify access (`verify-access.mjs`).
8. Done → `/qa-fix <TICKET>`.

For `--check`, skip to step 7: run `node .claude/skills/project-init/verify-access.mjs`.
