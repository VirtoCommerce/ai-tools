# qa-suite-sync — Phase 1, scope

Supporting file for [`qa-suite-sync`](SKILL.md). Read it at Phase 1, every run.

### Phase 1 — SCOPE (Resolve Input)

Parse any input type to produce a unified scope: **affected suites + change inventory**.

**For change sources (PR, JIRA, module, diff, changelog):**

These inputs trigger Phase 2 (Sync) automatically — code changed, so existing cases may be stale.

**PR (`PR <owner/repo>#NNN`):**
0. **Name the repo.** A bare `PR #NNN` resolves against this ai-tools checkout, not the product repo. Take
   `<owner/repo>` from the input, else from the linked ticket; none ⇒ ask the user. Never guess it.
1. Run `gh pr view <number> --repo <owner/repo> --json title,body,labels,mergedAt` to get PR metadata
2. Get the changed file list from the paginated API — `gh api repos/<owner/repo>/pulls/<number>/files --paginate -q '.[].filename'`
   (`gh pr view --json files` stops at 100 files without saying so)
3. Classify files:
   - `.cs` / `.csproj` → Backend module changes
   - `.vue` / `.tsx` / `.jsx` / `.ts` → Frontend/storefront changes
   - `.graphql` / `*Query.cs` / `*Mutation.cs` → API contract changes
   - `*.json` (config) → Configuration changes
4. Extract from PR body/title: feature keywords, affected modules, breaking changes

**JIRA ticket (`VCST-XXXX`):**
1. Try Atlassian MCP (`getJiraIssue`) — if unavailable, ask user for ticket details
2. Extract: summary, components, acceptance criteria, linked PRs, comments
3. For each linked PR: run the PR analysis above
4. Map JIRA components to VC modules
5. Promotion of the ticket's `Draft` cases is not this skill's: the router runs `qa-case-promotion` after it.

**Module (`module <name>`):**
1. Match `<name>` against module names in `.claude/knowledge/execution/module-suite-map.md`
2. Query VirtoOZ (connector; Context7 fallback) for the module's current docs
3. Read the module repo's own `README.md` + `docs/` at the tag of the deployed version (`.claude/knowledge/agents/qa/shared-instructions.md` §Module repo docs); a README claim a case relies on is quoted with its file URL at that tag
4. If a specific version is known: check GitHub releases via `gh api repos/VirtoCommerce/vc-module-<name>/releases/latest`

**Diff (`diff`) and Changelog (`changelog <version>`):** §Diff and §Changelog below.

**For direct scopes (suite, domain):**

These inputs skip Phase 2 (no code change to sync against) and go straight to gap analysis and review —
except the mind-map suspects in scope, which Phase 2 syncs (`models.md` §Phase 2).

- `suite <ID>` → resolve via `config/test-suites.json`
- `domain <name>` → resolve all suites in the domain via `config/test-suites.json` selections

**Phase 1 output — Unified Scope:**
```
{
  "inputType": "change-source | direct-scope",
  "source": "PR <owner/repo>#123 | VCST-1234 | module orders | diff | changelog 3.850.0 | suite 04c | domain orders",
  "affectedSuites": ["04a", "04c", "20", "15"],
  "changeInventory": {                         // only for change sources
    "changedModules": ["Orders", "Cart"],
    "changedLayers": ["backend", "graphql", "storefront"],
    "changedFiles": ["src/...", ...],
    "breakingChanges": ["Removed field X from Order response", ...],
    "newFeatures": ["Added bulk order status endpoint", ...],
    "affectedAPIs": ["/api/order/customerOrders", "mutation changeOrderStatus"],
    "affectedPages": ["/cart", "/account/orders", ...]
  }
}
```


**Diff (`diff`) — detect deployed platform + theme changes:**

Step 1 — Fetch current deploy state via GitHub MCP:
1. `backend/packages.json` — platform version + all module IDs and versions
2. `theme/artifact.json` — theme package URL with version

Use GitHub MCP: `get_file_contents` with `owner: "VirtoCommerce"`, `repo: "vc-deploy-dev"`, `branch: "vcst-qa"` (default; use the branch matching `TEST_ENV` for other envs) for each file.

Step 2 — Compare against last known state:
- Compare with `reports/full-cycle/last-deploy-state.json` (if exists)
- Diff module versions: identify which modules have new versions
- Diff theme version: if changed → theme/UI deployment

Step 3 — Map changes to suites:

| What changed | Affected suites |
|---|---|
| Backend module version changed | Map module name to suites via `.claude/knowledge/execution/module-suite-map.md` |
| `PlatformVersion` changed | All suites (platform upgrade) — run `critical` selection |
| Theme version changed | Frontend suites |
| Nothing changed | No sync needed — skip Phase 2 |

Step 4 — Save current state, **at close-out (SKILL.md step 10), not now** — only once Phase 2 has completed, so an aborted run does not consume the delta:
- Write `reports/full-cycle/last-deploy-state.json` with both files' content

Step 5 — Also check test repo changes:
- `git diff --name-only` for changes to test files in this repo
- Merge with deploy-detected affected suites (deduplicate)

**Changelog (`changelog <version>`):**
1. **Resolve through the local ledger** — `.claude/knowledge/domain/release-ledger.md`. §4 (component → month index) maps the version to its month; §2/§3 give that month's feature list with each feature's `component@version`, docs deep link and **⚠ BREAKING** flag; the digest URL is the citation. This is a local file read, no MCP call.
   - Context7 does not carry release notes (why: `docs/decisions/qa-test-evolution.md` §`/qa-test-lifecycle` changelog source). Fall back to Context7 only if the ledger's `generated:` date is >45 days old, or the version predates its window (§5 states the oldest month indexed).
2. **Confirm against GitHub Releases** — the authoritative version + date, and the escape hatch for a version the ledger predates:
   ```bash
   gh api repos/VirtoCommerce/vc-platform/releases/tags/<version>
   ```
   Tags are bare semver for `vc-platform` / `vc-module-*` / `vc-frontend` (`3.1054.0`, `2.56.0`) but `v`-prefixed for `vc-shell` (`v2.5.0`) — normalize before querying. If `GITHUB_TOKEN` is set but invalid, `gh` fails with `401 Bad credentials` on every call; prefix with `env -u GITHUB_TOKEN` to fall through to the `gh` keyring account.
   - Module release bodies are one terse HTML bullet (`<h3>🎯 Development</h3><ul><li>Documents library (#12)</li></ul>`) — authoritative for *when*, near-useless for *what*. Only `vc-frontend` and `vc-shell` carry prose, and those carry `VCST-*` keys per PR, which is what lets a change be traced back to a ticket.
3. **Extract** new features, breaking changes, deprecated APIs, module updates — mostly already structured by step 1. **Note the boundary:** the ledger is `exhaustive: false`, so an absent feature is *unknown*, not *nonexistent*; and it records what was **released upstream**, never what is **deployed** on the env under test (`agent-dispatch.md § Build Verification`).

## Scope-to-Phase Mapping

| Input | Ph1 Scope | Ph2 Sync | Ph3 Gen | Ph4 Review | Ph5 Verify | Ph6 Verdict |
|-------|:---------:|:--------:|:-------:|:----------:|:----------:|:-----------:|
| `PR <owner/repo>#N`, `VCST-XXXX`, `module <name>`, `diff`, `changelog <ver>` | Yes | Yes | Yes | Yes | Yes | Yes |
| `suite <ids>`, `domain <name>` | Yes | Skip | Yes | Yes | Yes | Yes |

Phase 5 is SKIPPED (with the reason) only when no new or changed case needs a live check, or no browser lane is available — G8 is then not evaluated.

---
