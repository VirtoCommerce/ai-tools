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
2. Interview — **no mid-interview reconnaissance**: (a) topology (operator ·
   project type · tracker · code host) in one `AskUserQuestion` call; (b) the
   **required non-secret values** in **one interactive `show_widget` form** (all at
   once) — free-text fields are plain inputs (no options), only `ENV_RISK` is a
   select; Submit returns them via `sendPrompt` (fallback: paste a `KEY=value` block
   in chat). **No optional fields and NO secrets in the form.**
3. Write env: (3a) `write-env.mjs` writes the non-secret values → `.env.<env>`; (3b)
   `scaffold-secrets.mjs` writes a commented `.env.local` **template** (placeholder +
   what/why/where per secret; per-env creds `_<ENV>`-suffixed, browser-login auth
   emits no token line); (3c) tell the operator to fill `.env.local` and **pause** —
   verify (step 7) checks it. Never a raw account password.
4. Write the profile (`gen-profile.mjs`).
5. Discover the client/platform repo split (`discover-repos.mjs`, client only) → confirm.
6. Generate `.mcp.json` (`gen-mcp.mjs`) → restart MCP servers.
7. Verify access (`verify-access.mjs`).
8. Done → `/qa-fix <TICKET>`.

For `--check`, skip to step 7: run `node .claude/skills/project-init/verify-access.mjs`.
