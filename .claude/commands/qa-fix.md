---
description: "Autonomous fix for an already-filed bug: triage → confirm root-cause → route to one repo → reproduce by unit test → minimal fix → self code-review → branch + PR + CI/E2E → STOP for human review. Single repo only. Never auto-merges. Interactive twin of ci/run-fix-cycle.ts."
argument-hint: "VCST-XXXX"
disable-model-invocation: true
---

# /qa-fix — Autonomous Bug Fix (interactive)

Pick up a bug **already filed by `/qa-bug`** and drive it through the auto-fix lifecycle to an open PR,
then **STOP for human review**. This is the **interactive twin** of the headless `ci/run-fix-cycle.ts`
(the same relationship `/qa-regression` has with `ci/run-regression.ts`). It **reuses** that pipeline's
infra and the shared gate ladder in `.claude/rules/quality-gates.md`.

**Designed to generalize.** The pipeline is repo-kind- and project-agnostic: it routes to **one**
allowed product repo of any kind and delegates the fix to the developer agent that matches that kind.
Adding frontend coverage, a new module pattern, or another org/customer fork is **data + an agent**, not
a rewrite:

| Repo kind (from `ci/lib/repo-router.ts`) | Repos | Developer agent | Toolchain (`REPO_PROFILES`) |
|---|---|---|---|
| `module` / `platform` | `vc-module-*`, `vc-module-x-*`, `vc-platform` | **`fullstack-backend`** (live) | .NET 10 / xUnit (+ module Admin Angular / Jasmine) |
| `frontend` | `vc-frontend` | `fullstack-frontend` *(planned extension; CI twin `ci/agents/fix-frontend-agent.md` exists today)* | Vue 3 / TS / vitest |

Routing, the repo allowlist, and the org are **config** (`ci/config/fix-repos.json`; org overridable
via `FIX_REPO_ORG` for customer forks / other projects) — `/qa-fix` reads them via
`ci/lib/repo-router.ts` (`suggestRepo` / `isAllowedRepo` / `repoProfile` / `checkoutForFix`) and the
live module graph (`ci/lib/module-registry.ts`). Workspace `.fix-workspace/`, branch
`claude/qa-autofix/VCST-XXXX`, output `reports/fixes/FIX-*/`.

## Usage
```
/qa-fix VCST-1234        # fix a bug already filed (+ reported by /qa-bug)
```
`/qa-fix` does NOT create the ticket. If `VCST-XXXX` doesn't exist or has no `/qa-bug` report, tell the
user to run `/qa-bug` first. Once invoked it **auto-continues** through all phases; **Gate 0/Gate 1**
are the automatic cut-offs (a STOP leaves the ticket filed for a human).

> **Hard orchestration rule** (as in `qa-test-lifecycle.md`): do NOT run phases inline. Each phase is
> delegated to its owning agent via the Task tool. The orchestrator only parses input, evaluates gates
> (`quality-gates.md`), transitions JIRA (ask-user-first), and prints phase verdicts.
>
> **Never auto-merge** — `merge_pull_request` / `gh pr merge` are forbidden (G7, triple-guarded).

---

## Phase 0 — Pre-flight
1. Resolve `VCST-XXXX` via Atlassian MCP (`getJiraIssue`). Confirm it's a Bug in a workable status
   (TO DO / REOPEN). Load the linked `/qa-bug` report from `reports/bugs/open/` (or `fixed/`).
2. If no ticket or no report → STOP: "Run `/qa-bug VCST-XXXX` first to reproduce + file the report."
3. `/qa-env-check endpoints`; build verify (deployed versions via GitHub MCP from `vc-deploy-dev`,
   branch `vcst-qa` by default — use the branch matching `TEST_ENV` for other envs); Context7 query on expected post-fix behavior.
4. **Write-token preflight:** confirm `GITHUB_FIX_BUGS_TOKEN` is present in `.env.local` and resolves
   to a token with push access (`GH_TOKEN="$FIX" gh api repos/VirtoCommerce/<routed-repo> --jq .permissions.push`
   → `true`). The ambient `gh` session is the **read-only** MCP token and cannot push; clone/push/PR
   must use `GH_TOKEN` ← `GITHUB_FIX_BUGS_TOKEN` (see `developers/shared-instructions.md` §GitHub
   authentication). Missing/expired token → STOP before clone.
5. Create the run dir `reports/fixes/FIX-YYYY-MM-DD-HHMM/` (heavy artifacts gitignored).

## Phase 1 — Triage (Gate 0) + Root-cause + Repo route (Gate 1)
> **Owner:** `qa-lead-orchestrator` (triage) → `qa-backend-expert` (root-cause). Reuses the
> `ci/agents/fix-triage-agent.md` criteria and `ci/lib/repo-router.ts`.

- **Gate 0 — fix-eligibility triage** (`/qa-defect classify` + `/qa-risk`): proceed ONLY if the bug is
  a **simple, low-risk, localized, non-breaking, code-fixable** defect. **BAIL** (before any clone) on
  by-design / config-gated / env-data-drift / API-only-repro / security-disclosure / no-STR / needs
  refactoring / breaking change / ambiguous. On BAIL: comment the ticket out-of-auto-fix-scope + reason,
  leave at TO DO, end.
- **Gate 1 — single target repo:** if the `/qa-bug` report carries a **Fix Routing block** (Suggested repo
  + `repoKind` + RCA anchor + routing confidence — see `qa-bug.md` Step 4), read it **verbatim as the
  primary signal** and *confirm* it (don't re-derive from scratch): validate the named repo with
  `isAllowedRepo()` and verify the RCA anchor with `mcp__github__search_code`. Only when the block is
  absent, confidence is LOW, or the anchor doesn't confirm, fall back to deriving the route from the
  **owning layer** + RCA via `suggestRepo()`. Either way: resolve to exactly ONE allowed repo, determine
  the repo **kind** (`repoKind`) → pick the matching developer agent (table above). Multi-repo /
  off-allowlist / no-match → STOP, comment, hand off. Never guess. (If the routed kind has no developer
  agent enabled yet — e.g. `frontend` before `fullstack-frontend` ships — STOP with "routed to <repo>
  (<kind>); no developer agent enabled for this kind yet — handing off"; the ticket stays filed.)
- On PASS: transition JIRA **TO DO → IN PROGRESS** ("Take to development"; ask user first) with a
  comment naming the routed repo + kind.

## Phase 2 — Clone + Reproduce (Gate 2)
> **Owner:** the routed developer agent (`fullstack-backend` for module/platform; `fullstack-frontend`
> for frontend). Skills: `/dotnet-unit-test` + `/angular-admin` (backend) or the frontend test skill.

- Clone the one routed repo into `.fix-workspace/` on branch `claude/qa-autofix/VCST-XXXX` (reuse
  `checkoutForFix`; base = detected default branch). Use the repo's own test command (`repoProfile`).
- Add a NEW failing test encoding the STR/RCA → confirm **RED**. Trivial-skip allowed for one-line
  guards/typos (note in PR body).

## Phase 3 — Implement fix (Gate 3)
> **Owner:** the routed developer agent.
- Smallest correct change to production code → test **GREEN**; **all pre-existing tests stay green &
  UNMODIFIED**; BL-* preserved. Existing test breaks → STOP (contract conflict). Build + test clean
  (per `repoProfile`).

## Phase 4 — Self code-review (Gate 4)
> **Owner:** `backend-reviewer` (the kind-appropriate reviewer). Reviews the local diff before any PR.
> `APPROVE` → continue; `REQUEST_CHANGES` → developer revises (≤2 iterations); still not approved → STOP.

## Phase 5 — Branch + PR
> **Owner:** the routed developer agent.
- `git commit` (Conventional Commits + JIRA key), **authored as the human token-owner with Claude as
  `Co-Authored-By`** (NOT a bot author — CLA Assistant blocks bot-authored commits; pattern in
  `developers/shared-instructions.md` §Commit identity) → `git push -u origin claude/qa-autofix/VCST-XXXX`
  → `gh pr create` (a **normal PR for human review — not auto-merged**), **PR title `VCST-XXXX: Fix
  <summary>`** (JIRA key first — distinct from the Conventional-Commits commit message; see
  `developers/shared-instructions.md` §PR title), body from the agent's PR template ("DO NOT MERGE until
  human review"; backend adds "needs deploy verification"), label, link JIRA.
- Transition JIRA **IN PROGRESS → IN REVIEW** ("Go to review"; ask user first) with the PR link.

## Phase 6 — Await CI + E2E (Gates 5 & 6)
> **Owner:** orchestrator (CI poll) + `qa-backend-expert` / `qa-frontend-expert` (E2E, by kind).
- **Gate 5 (CI):** poll `gh pr checks` / `mcp__github__get_pull_request_status` until the repo's
  GitHub Actions are all `success` + `mergeable` — **including the SonarCloud quality gate** (the
  `test-and-sonar` / `SonarCloud Code Analysis` check) and `license/cla`. Background polling, not blocking
  sleeps. RED → developer self-corrects in the SAME repo (≤2 iterations), re-push, re-poll. **Sonar QG
  red → fix the valid findings on the changed lines** (real bug/vuln/hotspot, or add new-code coverage)
  within minimal-diff + never-edit-existing-tests; don't chase pre-existing debt or off-diff nitpicks.
  Persistent RED / cross-repo / repo-owned QG threshold → STOP + hand off.
- **Gate 6 (E2E):** once the PR's artifact deploys to QA, the kind-appropriate QA expert runs
  `/qa-regression <group>` (Backend or Frontend suites for the affected area, from `module-suite-map.md`).
  Backend is static-only pre-deploy → the PR carries **"needs deploy verification"** and G6 closes
  post-merge via the regression pipeline + `/qa-verify-fix`.

## Phase 7 — STOP for human review (Gate 7)
- Transition JIRA **IN REVIEW → READY FOR TEST** ("Ready to test"; ask user first) with "CI green +
  E2E result + awaiting human review/merge".
- Write `reports/fixes/FIX-*/fix-report.md` + `summary.json` (ticket, repo, kind, branch, PR URL, gate
  results, confidence). Print the PR link. **End.** Never merge. Post-merge verification is the separate
  `/qa-verify-fix VCST-XXXX`.

---

## Autonomous / scheduled runs
Run `/qa-fix` unattended as a **Claude Code Routine** (`/schedule`) rather than custom cron — the
routine runs headless on a cron (min 1h) over the GitHub + Atlassian connectors and can invoke this
command (e.g. *"scan JIRA for `labels = qa-autofix`, run `/qa-fix` on the top N eligible, open PRs"*).
This is why the work branch is **`claude/`-prefixed** (`claude/qa-autofix/VCST-XXXX`): routines may
only push `claude/*` branches by default. The headless `ci/run-fix-cycle.ts` + `auto-fix.yml` remain
available for CI-on-PR; the routine is the lighter scheduled trigger.

## Rules
- Single repo of any allowed kind; a STOP at any gate leaves the ticket filed for human handoff (see
  `.claude/rules/quality-gates.md`).
- Code review (Gate 4) delegates the mechanical bug/cleanup pass to the built-in **`/code-review`**
  skill; `backend-reviewer` adds only the VC-specific gate checklist on top.
- Reuse `ci/config/fix-repos.json` + `ci/lib/repo-router.ts` + `ci/lib/module-registry.ts` — do not
  reinvent routing/checkout. Other org / customer fork → `FIX_REPO_ORG`. Workspace `.fix-workspace/`,
  branch `claude/qa-autofix/VCST-XXXX`, output `reports/fixes/FIX-*/`.
- Never modify existing tests (ADD only). Never auto-merge. Never echo the GitHub PAT. All remote
  git/gh writes run as `GH_TOKEN` ← `GITHUB_FIX_BUGS_TOKEN` (`.env.local`), not the ambient read-only
  token, and commits are **authored as the human token-owner + `Co-Authored-By: Claude`** (CLA
  Assistant blocks bot-authored commits) — exact command patterns in
  `developers/shared-instructions.md` §GitHub authentication / §Commit identity.
- Ask before every JIRA transition (consistent with `/qa-bug` Step 5 and `/qa-verify-fix` Step 6).
- Reports follow `.claude/rules/reports.md` (the `reports/fixes/` category; long logs via SendMessage).
