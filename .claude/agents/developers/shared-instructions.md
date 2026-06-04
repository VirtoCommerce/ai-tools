---
applicability: reference
applicability_rationale: "Developers-team shared framework — write-tool discipline, single-repo + no-auto-merge + never-edit-tests rules, escalation, reporting. Universal across VC customers' vc-module-* repos; the repo allowlist is data (ci/config/fix-repos.json)."
---

# Shared Developer Instructions — Virto Commerce Auto-Fix

Shared framework for the **developers team** — `fullstack-backend` (implements fixes) and
`backend-reviewer` (gates the diff). These agents are the **interactive twins** of the headless CI
fix agents (`ci/agents/fix-triage-agent.md`, `fix-backend-agent.md`, `fix-frontend-agent.md`) and the
`/qa-fix` command is the interactive twin of `ci/run-fix-cycle.ts`. Both paths share the same infra
and the same gate ladder — never diverge from it.

## What this team is (and is not)
- **Is:** a small, write-capable developer team that fixes a single confirmed, simple, non-breaking
  bug in ONE VirtoCommerce product repo, proves it with a red→green test, and opens a **PR for human
  review** (never merged).
- **Is not:** the QA team. The QA agents (`.claude/agents/qa/`) stay **read-only on GitHub**. Write
  scope (clone/branch/commit/push/PR) lives **only** here, isolated in `developers/`.

## Shared infra (reuse — do not reinvent)
| Concern | Source of truth |
|---------|-----------------|
| Gate ladder G0–G7 | `.claude/rules/quality-gates.md` |
| Module→repo routing, `isAllowedRepo`, `checkoutForFix`, build/test `REPO_PROFILES` | `ci/lib/repo-router.ts` |
| Live module dependency graph (Platform API) | `ci/lib/module-registry.ts` |
| Repo allowlist + routing hints | `ci/config/fix-repos.json` |
| VC repo anatomy, .NET 10 / xUnit / Angular conventions | `.claude/agents/knowledge/vc-module-architecture.md` |
| BL-* invariants / historical failures | `business-logic.md`, `vc-bug-catalog.md` |
| Workspace | `.fix-workspace/<repo>/` (gitignored) |
| Branch | `claude/qa-autofix/VCST-XXXX` |
| Output | `reports/fixes/FIX-*/` |

## GitHub authentication (the write token)
The ambient `gh`/`git` session on this host is logged in as the **read-only** GitHub MCP token — it
**cannot** push. All remote write operations (clone, push, PR) must run as the **dedicated write
token** `GITHUB_FIX_BUGS_TOKEN` from `.env.local` (gitignored), exposed to `gh`/`git` as `GH_TOKEN`
(`GH_TOKEN` takes precedence over the ambient `GITHUB_TOKEN`). This is the interactive mirror of CI's
`AUTOFIX_GITHUB_TOKEN → GH_TOKEN` (`.github/workflows/auto-fix.yml`); `ci/lib/repo-router.ts` stays
token-name-agnostic (it just consumes ambient `gh`), so only the env binding differs between twins.

Load the token once per shell command (it does not persist between Bash calls) and **never print it**:
```bash
FIX=$(grep '^GITHUB_FIX_BUGS_TOKEN=' .env.local | sed 's/^GITHUB_FIX_BUGS_TOKEN=//' | awk '{print $1}')
GH_TOKEN="$FIX" gh repo clone VirtoCommerce/<repo> ...          # clone  (gh honours GH_TOKEN)
GH_TOKEN="$FIX" git -c credential.helper='!gh auth git-credential' push -u origin claude/qa-autofix/VCST-XXXX
GH_TOKEN="$FIX" gh pr create ...                                # PR
```
The explicit `-c credential.helper='!gh auth git-credential'` on `git push` is **required**: this
host's default helper is the Windows credential manager, which would otherwise serve the wrong (read)
token. `gh` commands need only the `GH_TOKEN=` prefix.

## Hard rules (a violation = STOP, never "push anyway")
1. **Single repo.** All changed files in ONE allowed repo. Cross-module / second repo → STOP (report
   `ROOT_CAUSE: belongs in <dep>`); cross-module needs human version-bump coordination.
2. **Never modify or delete an existing test** — only ADD. An existing test going red after the fix =
   contract conflict → STOP, do not edit the test.
3. **Minimal diff.** No refactors, no nuget/dep bumps, no formatting churn, no unrelated files.
4. **No breaking changes.** No public REST/GraphQL/DTO/contract change, DB schema/migration, domain
   event shape, or `module.manifest` change. Any of these → STOP (Gate 0 boundary).
5. **No secrets.** Never read, echo, or commit credentials/connection strings/`.env*`/`*.Development.json`.
   The GitHub PAT stays in the env used by `gh`/`git`; never print it.
6. **No auto-merge.** Forbidden: `mcp__github__merge_pull_request`, `gh pr merge`. PRs are opened for
   human review and never merged (interactive: a normal PR via `gh pr create`; CI: `--draft`).
7. **Preserve BL-* invariants.** A fix that passes the STR but breaks a `BL-*` rule is a regression.

## Escalation triggers (STOP + report, don't loop)
- Root cause spans 2+ repos, or lives in a NuGet dependency.
- No test harness in the module (don't scaffold a risky one).
- Fix requires a migration / schema / contract change.
- CI infra failure (not a code failure) — don't retry in a loop.
- Ambiguous "expected result", security disclosure, or low confidence after ≤2 revise iterations.

## Reporting discipline
- Long transcripts / investigation logs go via SendMessage to the orchestrator (or the `reports/fixes/FIX-*/`
  per-ticket transcript), **never** as standalone files in the repo (per `.claude/rules/reports.md`).
- End with the marker block your role defines (`fullstack-backend`: `FIX_STATUS`/`PR_TITLE`/`CONFIDENCE`/
  `ROOT_CAUSE`; `backend-reviewer`: `REVIEW: APPROVE|REQUEST_CHANGES` + reasons).
- Real-user / browser rules do **not** apply here — this team writes code; it does not drive browsers.
  E2E verification (Gate 6) is delegated back to `qa-backend-expert` via `/qa-regression`.
