# /project-init — Interview Redesign (handoff)

> Working note for the next session. Goal: **a configured project + config files for
> working with environments, trackers, and repositories**, asking the operator only what
> genuinely shapes the config — everything else is DERIVED from the token + the filled env
> + a module/repo scan. Talk to the operator in Russian; all external content (GitHub
> PR/issue, Azure Boards, code comments) in English. Branch: `feat/project-init`.

## What /project-init is
Onboards this plugin onto a deployment and writes `project-profile.json` + `.env.<env>` +
`.env.local` + `.mcp.json`, so `/qa-fix` routes each bug to the right repo (client custom
code vs native VirtoCommerce platform) and the right tracker. Key files:

| File | Role |
|------|------|
| `.claude/skills/project-init/SKILL.md` | methodology (steps 0–8) |
| `.claude/commands/project-init.md` | command (compact mirror) |
| `.claude/skills/project-init/scaffold-env.mjs` | `.env.<env>` template |
| `.claude/skills/project-init/scaffold-secrets.mjs` | `.env.local` template (auth axes `--ado-auth`/`--github-auth`/`--jira-auth`) |
| `.claude/skills/project-init/gen-profile.mjs` | writes `project-profile.json` from flags |
| `.claude/skills/project-init/discover-repos.mjs` | scan modules + client repos (classify + theme scan) |
| `.claude/skills/project-init/gen-mcp.mjs` | `.mcp.json` |
| `.claude/skills/project-init/verify-access.mjs` | readiness table + real probes (ADO/GitHub/admin) |
| `.claude/skills/project-init/ensure-session.mjs` | browser login without hand-typed commands (auto-tenant + az/gh login) |
| `scripts/lib/project-profile.mjs` | `PROFILE_DEFAULTS` + `loadProjectProfile` (backfills defaults) |
| `ci/lib/repo-router.ts` | `repoOwnership` / `contributionPlan` / `assertUpstreamAllowed` |
| `ci/lib/vcs/index.ts` | `getVcs` / `getUpstreamVcs` (containment guard) |
| `.claude/rules/quality-gates.md` | §2a client-code containment (hard security invariant) |

## Already done (pushed to `feat/project-init`, range `468fa0e..ac2a64f`, ~11 commits)
- Colored readiness table (FORCE_COLOR + adaptive width ≤100 cols, "To resolve" block).
- Existing-`.env` guard before scaffolding (step 2c): reuse vs new name.
- Prune inapplicable azure blocks from the profile (written only for azure).
- **Client-code containment** (§2a + `developers/shared-instructions.md` +
  `assertUpstreamAllowed` in repo-router + `getUpstreamVcs(deps, repo)` asserts platform):
  CLIENT CODE NEVER LEAVES THE CLIENT PROJECT; upstream = platform contribution only.
- Independent auth axes (`--ado-auth`/`--github-auth`); session auth is really probed
  (az/ADO org-level `_apis/projects`, gh via `gh auth token` + `/repos/<upstream>`);
  auto-discover the ADO tenant from `X-VSS-ResourceTenant`; `ensure-session.mjs` drives
  browser SSO (WAM broker off on Windows).
- `discover-repos`: `classify()` uses clientOrg + id-namespace + Azure-URL; client-host
  theme scan (az/PAT for Azure Repos, gh for GitHub); `_<ENV>` promotion; `mkdir -p` for `--out`.
- Client identifiers: `CLIENT_REPO_ORG` only for a github host; the fork account is derived
  from the token owner, not asked.
- Not committed on purpose: `package-lock.json` (npm-install churn).

## THE TASK — agreed interview redesign

### Keep as questions (they shape the config; not derivable)
1. **env name** (text) — required, becomes `TEST_ENV`.
2. **tracker** (`jira` / `azure`) — required (profile + which MCP/connection fields + what the skills work against).
3. **code host** (`github` / `azure-repos`) — where the client code lives (routing / PR branch).

### Auth — still ask, but reframed
Present the options with **PAT marked "(Recommended)"** (more reliable) and offer to enter it.
If a PAT is **not** entered → default to **browser/CLI** attempts (`az login` / `gh auth login`,
driven by `ensure-session.mjs`). Filled PAT = token mode; empty = session. Per applicable
axis (Jira / ADO / GitHub), gated by the chosen tracker + host.

### Drop from questions — DERIVE instead
4. **operator** (client/virto-engineer) — REMOVE. Derive `contributionMode` from the token's
   permission on the upstream (`VirtoCommerce/vc-platform`: `push` ⇒ `direct`, `pull` ⇒ `fork`).
   verify-access already probes this.
5. **projectType** (platform/client) — REMOVE. Derive from the module/repo scan: any
   non-VirtoCommerce / Azure-hosted module or a separate storefront repo ⇒ `client`; all under
   VirtoCommerce ⇒ `platform`.
6. **contribution mode** — REMOVE (same as operator — from token permission).

### Also build out
- Make the module/repo **scan ALWAYS run** and be the source of `projectType` (+ confirm code
  host, clientOrg, repo split, storefront). Today discovery is client-only and does not set
  `projectType`.
- Bring the **GitHub-client branch** to parity with azure-repos: `CLIENT_REPO_ORG` (github) +
  discovery via the GitHub API + client PR via `gh` into the client GitHub org.
- `gen-profile`: accept the **derived** operator/projectType/contributionMode, not answer-flags.
- Rewrite `SKILL.md` + `project-init.md` for the new flow (interview = env + tracker + code-host;
  auth-as-recommendation; discovery → projectType; a derive block).

### Target flow
```
1. Ask: env name · tracker · code host        (minimal but meaningful)
2. Auth: PAT placeholders "recommended, fill; empty ⇒ browser/CLI"
3. Scaffold .env/.env.local (tailored by tracker+host) → operator fills ONCE
4. Scan modules/repos (always) → projectType, clientOrg, repo split, storefront
5. Derive (no questions): auth (PAT/session), contributionMode (token perm), forkAccount (token owner)
6. Write the profile from derived values → verify-access confirms (ask ONLY on genuine ambiguity)
```

## How to test (live client Azure deployment — NOT secrets)
Used `TEST_ENV` names: `leo` / `leo_qa` (a new one is fine). This deployment's profile:
`projectType=client`, `tracker=azure` (ADO org **Lakeshirt-LEO**, project **LEO**, tenant
**59364e0a-e918-4ea3-83b5-18b6472d33c9**), `code host=azure-repos`, `contributionMode=fork`,
`forkAccount=Dan-BV`. `FRONT_URL=https://qa-frontend-leo.govirto.com/`,
`BACK_URL=https://qa-admin-leo.govirto.com/`, `STORE_ID=LEO`, `ADMIN=danil@admin.com`.
Discovery finds: 53 platform repos + client module `Lakeshirt-LEO/leo-main-module` (azure-repos)
+ storefront `Lakeshirt-LEO/frontend` (kind frontend). Secrets (passwords/PATs) live in
`.env.local` (gitignored), filled by the operator. `az` and `gh` (Dan-BV) sessions are active.
Local verify: `FORCE_COLOR=1 TEST_ENV=<env> node .claude/skills/project-init/verify-access.mjs`.

## Process rules
- Run artifacts (`.env.<env>`, `.env.local`, `.mcp.json`, `project-profile.json`, `.local-env/`)
  are gitignored; clean them between runs; do NOT commit.
- Commit in meaningful sets; do NOT commit `package-lock.json`; end commit messages with
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- NEVER run a blocking `az login` / `gh auth login` inline (it hangs) — only via
  `ensure-session.mjs` in the background (`run_in_background`); the operator completes the browser.
- End a "fill the files" pause with a visual banner `> ⏸️ ЖДУ ТЕБЯ …` as the last line, no tool
  call after it.
- Mirror results (the readiness table) as Markdown IN the chat reply (tool output may be hidden).
- Don't ask for values that are filled in the env file; ask all enums up front in one block.
- Branch `feat/project-init`. Never auto-merge.

## Start by
Re-read `SKILL.md`, `scaffold-env.mjs`, `scaffold-secrets.mjs`, `gen-profile.mjs`,
`discover-repos.mjs`, and `repo-router.ts`; then propose the edit plan for this redesign and,
after the operator's OK, implement.
