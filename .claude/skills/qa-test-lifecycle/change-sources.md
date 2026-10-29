# /qa-test-lifecycle — diff and changelog inputs

Supporting file for [`/qa-test-lifecycle`](../../commands/qa-test-lifecycle.md), moved here from the command to keep the command under its BUDGET-004 baseline. Read it in Phase 1 only when the input is `diff` or `changelog <version>`.

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

Step 4 — Save current state, **at Phase 6 close-out, not now** — only once Phase 2 has completed, and never under `--report-only`, so an aborted run does not consume the delta:
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
