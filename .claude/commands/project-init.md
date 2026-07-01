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
   project type · tracker · code host) in one `AskUserQuestion` call; (b) values
   **one field = one question**, covering every field the topology needs (do NOT
   cap the count). Offer option choices ONLY for predefined/enum fields (`ENV_RISK`,
   `STOREFRONT_PROFILE`, topology); for unique/free-text fields (env name, URLs,
   `STORE_ID`, emails, tracker base URL+key, passwords, tokens) ask for the value
   directly — never invented options. Non-secret identifiers → `.env.<env>`/profile;
   secrets (`ADMIN_PASSWORD`/`USER_PASSWORD`, `GITHUB_FIX_BUGS_TOKEN`,
   `JIRA_API_TOKEN`, `ADO_PAT`, optional `POSTMAN_API_KEY`/`CONTEXT7_API_KEY`) →
   `.env.local`; browser-login (`gh auth login`, `az login`, Atlassian MCP) = leave
   the token unset. Reuse an existing `.env.<env>` by skipping the Environment-URL
   questions. Never a raw account password.
3. Write env files with `write-env.mjs` (JSON answer object on STDIN, no pause):
   non-secret URLs → `.env.<env>`, secrets → `.env.local` (per-env creds
   `_<ENV>`-suffixed, global tokens un-suffixed), idempotent, values never echoed.
   `npm run plugin:configure` remains an optional interactive fallback.
4. Write the profile (`gen-profile.mjs`).
5. Discover the client/platform repo split (`discover-repos.mjs`, client only) → confirm.
6. Generate `.mcp.json` (`gen-mcp.mjs`) → restart MCP servers.
7. Verify access (`verify-access.mjs`).
8. Done → `/qa-fix <TICKET>`.

For `--check`, skip to step 7: run `node .claude/skills/project-init/verify-access.mjs`.
