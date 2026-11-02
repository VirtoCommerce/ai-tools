# /qa-test-lifecycle split — thin router + `qa-suite-sync` + `qa-case-promotion` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the 49K-char `/qa-test-lifecycle` command into a ~4K router over two skills — `qa-suite-sync` (keep cases current, by default doing the whole job) and `qa-case-promotion` (take cases out of `Draft`) — with the promotion's two risky manual steps moved into scripts.

**Architecture:** The command parses the input and tells the agent to read one skill's `SKILL.md` whole and follow it; a ticket input runs sync, then promotion. Each skill keeps a spine `SKILL.md` and moves per-phase detail into supporting files read on demand. Two TypeScript helpers in `qa-case-promotion/scripts/` reuse the byte-preserving CSV editor already in `scripts/test-cases/promote-cases.ts`.

**Tech Stack:** Markdown prompts (Claude Code commands/skills), TypeScript run via `npx tsx`, `csv-parse`, `node:test`.

**Spec:** no separate design document — the decisions agreed in the session are the spec and are copied verbatim into §Decisions below. Current source material: `.claude/commands/qa-test-lifecycle.md` and `.claude/skills/qa-test-lifecycle/{change-sources,ci-mode,promote,report-template}.md` (uncommitted, created by the 2026-10-29 `/prompt-review --fix` pass).

## Decisions (from the session — not open)

1. Variant B: thin router command + two skills. **The command keeps its name** `/qa-test-lifecycle` (236 references, incl. code).
2. Skill names: **`qa-suite-sync`** and **`qa-case-promotion`**.
3. **The default run does the whole job, no flags:** sync stale cases (update, rewrite or delete), write the missing cases, review and fix, verify every new/changed case on the stand, fix what verification shows, verdict + report in chat.
4. **Flags removed:** `--skip-sync`, `--skip-generate`, `--skip-data`, `--skip-verify`, `--no-auto-fix`, `--layer`, `--report-only`, `--ci`, and `--promote-only` (replaced by the input `promote VCST-XXXX`). **No `--dry-run`.** `--run-id` stays, optional.
5. **CI mode is removed from the command and skills entirely. Do not touch `ci/`, `.github/workflows/`, `package.json` `ci:*` scripts or `.claude/rules/regression.md` §4** ("оставь в покое ci").
6. What stays the user's decision: deleting a case, rewriting what a case expects, new cases — asked as **one list per run**; filing a bug — per candidate.
7. Subagents never ask the user: they return `pendingApprovals[]`; the orchestrator asks and re-dispatches (already in the current command — carry it over).

## Global Constraints

- Every command / `SKILL.md` ≤ **19,000 chars** (BUDGET-004, `npm run context:check`); target the command ≤ 4,500 and each `SKILL.md` ≤ 15,000. Supporting files are exempt.
- Cite, never restate (`CLAUDE.md` §Where the rules live). No counts, rosters or constants transcribed.
- Skill frontmatter: `name` = directory name, `description` starts with `[QA Method]`, `argument-hint` present (`.claude/skills/README.md` §Frontmatter Reference).
- **NO CODE ⇒ NO UNIT TEST; code gets TEMPORARY tests, deleted before commit** (`.claude/knowledge/execution/when-to-write-a-test.md`). No new committed `scripts/unit/` file.
- `kb` step per `.claude/knowledge/agents/authoring-standard.md` §5: `qa-suite-sync` is Dispatcher + Judge (brief line + read step, already present); `qa-case-promotion` is a Mechanic (says nothing about the base).
- Promotion out of `Draft` is never automatic; `Automated` only from a run via `tc:promote`, never hand-written.
- One writer per suite CSV for the whole change (`.claude/rules/regression.md` §Suite inventory).
- Moves are verbatim; rewording is a separate edit in the same task, never hidden inside a move.

## Review Focus

1. **Ticket-key boundary** — `VCST-56` must not match a row stamped `VCST-5628`, nor `VCST-5628` match `VCST-56280`. Test in Task 1.
2. **A row `/qa-regression` 6.5 already flipped** (`Automated`, still stamped with the ticket) is not a promotion source, and `flip review` refuses a non-`Draft` row rather than overwriting it. Tests in Tasks 1 and 2.
3. **A suite CSV the byte-preserving editor cannot place** (non-canonical header, unparsable) → refuse, file unchanged. Test in Task 2.
4. **A ticket with both in-suite rows and a legacy CSV** → both reported, neither dropped. Test in Task 1.
5. **A removed flag typed from habit or old docs** (`--promote-only`, `--skip-verify`, `--ci`) → the command stops and prints the new syntax; it never silently ignores it. Check in Task 5, step 3.

---

### Task 0: Branch

The working tree sits on `vcst-6630-password-expiry-oracles` (PR #574, unrelated) and carries uncommitted `reports/` deletions that are not ours.

- [ ] **Step 1:** `git stash push -u -- .claude/commands/qa-test-lifecycle.md .claude/skills/qa-test-lifecycle docs/decisions/qa-test-evolution.md scripts/maintenance/.prompt-size-baseline.json docs/superpowers/plans/2026-10-29-qa-test-lifecycle-split.md` then `git switch -c claude/qa-test-lifecycle-split origin/main` then `git stash pop`.
- [ ] **Step 2:** `git status --short` shows only those paths changed (the `reports/` deletions stay on the old branch's tree — if they followed, leave them unstaged and never `git add` them).

### Task 1: `find-source.ts` — what can be promoted for a ticket

**Files:**
- Create: `.claude/skills/qa-case-promotion/scripts/find-source.ts`
- Temporary test (delete in Task 6): `.claude/skills/qa-case-promotion/scripts/find-source.test.ts`

**Interfaces:**
- Consumes: `priorRunDirs({ ticket, root })` and `TICKET_KEY` from `scripts/lib/run-dir.mjs`; `csv-parse/sync`.
- Produces:
  ```ts
  export interface PromotionSource {
    ticket: string;
    inSuite: { caseId: string; suiteCsv: string }[];          // repo-relative, forward slashes
    legacy: { casesCsv: string; summaryJson: string | null }[];
  }
  export function findPromotionSource(ticket: string, opts?: { suitesRoot?: string; runRoot?: string }): PromotionSource;
  ```
  CLI: `npx tsx .claude/skills/qa-case-promotion/scripts/find-source.ts <TICKET>` → the JSON on stdout; exit **0** something found, **1** nothing, **2** bad usage (ticket fails `TICKET_KEY`). Guard the CLI with the `isCli` pattern of `promote-cases.ts`.

- [ ] **Step 1: Write the failing tests** (temp dirs under `os.tmpdir()`, a canonical 15-column header copied from any suite):
  - `finds a Draft row whose References carries the ticket` → `inSuite` = `[{caseId:"TC-1", suiteCsv}]`
  - `skips a non-Draft row with the ticket` (`Automated`) → `inSuite` = `[]`
  - `matches the ticket key on a boundary` — rows stamped `VCST-5628` and `VCST-56280`; `findPromotionSource("VCST-5628")` returns only the first; `findPromotionSource("VCST-56")` returns none
  - `finds a legacy test-cases.csv` under `<runRoot>/Sprint26-15/VCST-5628/` (and one env level deeper) with `summaryJson` set when the sibling exists, `null` otherwise
  - `reports both kinds together`
- [ ] **Step 2:** `npx tsx --test .claude/skills/qa-case-promotion/scripts/find-source.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement.** Walk `suitesRoot` (default `regression/suites`) for `*.csv`; parse with `columns: true, bom: true, relax_column_count: true`; a row qualifies when `Automation_Status.trim() === "Draft"` and `References` matches `new RegExp(\`(?<![A-Za-z0-9-])${key}(?![0-9])\`)`. Legacy: `priorRunDirs({ ticket, root: runRoot })`, keep dirs (and their direct subdirs) holding `test-cases.csv`.
- [ ] **Step 4:** re-run → PASS. Then on the real corpus: `npx tsx .claude/skills/qa-case-promotion/scripts/find-source.ts VCST-5628` → exit 1 or a plausible list (the corpus holds ~1 `Draft` cell today).

### Task 2: `flip.ts` — snapshot, restore, in-place `Draft → Reviewed`

**Files:**
- Create: `.claude/skills/qa-case-promotion/scripts/flip.ts`
- Temporary test (delete in Task 6): `.claude/skills/qa-case-promotion/scripts/flip.test.ts`

**Interfaces:**
- Consumes: `applyCellEdits(text, edits)`, `appendStamp(references, verb, label, date)`, `CellEdit` from `scripts/test-cases/promote-cases.ts`.
- Produces:
  ```ts
  export function planReviewFlip(text: string, ticket: string, ids: string[], date: string):
    { edits: Map<string, CellEdit>; refused: { id: string; reason: string }[] };
  export function snapshot(files: string[]): Record<string, string>;   // file → blob sha (git hash-object -w)
  export function restore(map: Record<string, string>): void;           // git cat-file -p <sha> > file
  ```
  CLI (`npx tsx .claude/skills/qa-case-promotion/scripts/flip.ts …`):
  - `snapshot <file>...` → JSON map on stdout
  - `restore <snapshot.json>`
  - `review <suiteCsv> --ticket <KEY> --ids <A,B> [--date YYYY-MM-DD] [--apply]` — dry run by default (prints per-id old → new), `--apply` writes. Exit **0** flipped/flippable, **1** nothing to flip, **2** refused (any `refused` entry, or `applyCellEdits` errors — then nothing is written).
  - The edit per id: `Automation_Status: "Reviewed"`, `References: appendStamp(old, "Promoted", ticket, date)`.

- [ ] **Step 1: Write the failing tests:**
  - `flips Draft to Reviewed and stamps References` — output differs from input **only** in those two cells of that row (compare the other rows' raw lines byte-for-byte)
  - `refuses a row that is not Draft` → `refused[0].reason` mentions the current status; `--apply` exits 2 and the file is unchanged
  - `refuses an id that is not in the suite`
  - `refuses a non-canonical header` (header with a renamed column) → exit 2, file unchanged
  - `stamp is idempotent` — flipping twice (second time on a `Draft` restored copy) never doubles `Promoted: VCST-5628 (2026-10-29)`
  - `snapshot then restore round-trips a file` (edit the file in between; restore brings the original bytes back)
- [ ] **Step 2:** `npx tsx --test .claude/skills/qa-case-promotion/scripts/flip.test.ts` → FAIL.
- [ ] **Step 3: Implement** with the interfaces above; read current cell values via `csv-parse` (`columns: true`), write only via `applyCellEdits`.
- [ ] **Step 4:** re-run → PASS.

### Task 3: `qa-case-promotion` skill

**Files:**
- Create: `.claude/skills/qa-case-promotion/SKILL.md`
- Source to move from, then delete: `.claude/skills/qa-test-lifecycle/promote.md`; the `## Promotion` section of `.claude/skills/qa-test-lifecycle/report-template.md`

**Interfaces:**
- Consumes: Task 1 and Task 2 CLIs; `npm run tc:promote` (`<RUN_ID|latest> --ids <ids> [--apply]`), `npm run suites:review`, `td:validate`, `graphql:lint-labels`, `suites:sync`, `suites:lint`, `scripts/test-cases/append-test-cases-to-suite.ts --check-global-ids`.
- Produces: the skill the router sends `promote VCST-XXXX [--run-id <id>]` to, and the "Promotion" report section.

- [ ] **Step 1:** Frontmatter: `name: qa-case-promotion`; `description: "[QA Method] Take a ticket's test cases out of Draft: find its Draft rows in regression/suites (or a legacy run-scoped test-cases.csv), re-derive eligibility (G10), get approval, flip Draft -> Automated from a run or Draft -> Reviewed in place, re-gate (G12). Reached through /qa-test-lifecycle promote VCST-XXXX or after a ticket run. Not for authoring or fixing cases (qa-suite-sync) or flipping already-grounded cases after a regression (/qa-regression Step 6.5)."`; `argument-hint: "VCST-XXXX [--run-id <RUN_ID|latest>]"`. Model-invocable (the approval gate is inside).
- [ ] **Step 2:** Body = `promote.md` steps 1–6 + G12, with these changes only:
  - New **step 0**: run `find-source.ts <KEY>`; exit 1 ⇒ "nothing to promote", stop.
  - "Snapshot before any write" → `flip.ts snapshot <files> > <scratch>/snapshot.json`; every revert → `flip.ts restore`.
  - Step 4i → with a run: `tc:promote <RUN_ID|latest> --ids …` (no `--run-id` given ⇒ `latest`; cases it holds with `PR-002` fall to the Reviewed flip); Reviewed flip → `flip.ts review … --apply` after a dry run.
  - Delete every `--ci` / `--report-only` / `--promote-only` mention; "never runs under `--ci`" goes.
  - Append the report section from `report-template.md` `## Promotion`.
- [ ] **Step 3:** `wc -c .claude/skills/qa-case-promotion/SKILL.md` < 15000.

### Task 4: `qa-suite-sync` skill

**Files:**
- Create: `.claude/skills/qa-suite-sync/SKILL.md` and supporting `scope.md`, `sync.md`, `generate.md`, `review.md`, `verify.md`, `briefs.md`, `report-template.md`
- Move from: `.claude/commands/qa-test-lifecycle.md` (Pre-Flight, Phases 1–6 minus 6P, Scope-to-Phase, Delegation Protocol, Integration, Rules), `.claude/skills/qa-test-lifecycle/change-sources.md` (→ `scope.md`), `report-template.md` minus `## Promotion` (→ `report-template.md`)
- Delete: `.claude/skills/qa-test-lifecycle/ci-mode.md` (CI mode is gone)

**Interfaces:**
- Consumes: `/preflight lifecycle`, `npm run regression:select -- --repo <repo> --changed-files <file> --json` (PR file list → suites), agents `test-management-specialist`, `qa-testing-expert` (`playwright-firefox`).
- Produces: the skill the router sends every non-`promote` input to; `SKILL.md` ends with "if the input was a ticket, continue with `qa-case-promotion`".

- [ ] **Step 1: Move verbatim** each phase into its supporting file (one file per phase; `briefs.md` = Delegation Protocol; `scope.md` = Phase 1 + `change-sources.md`). Drop Phase 1 step 5 (promotion-source detection now lives in Task 1).
- [ ] **Step 2: Write `SKILL.md`** — frontmatter `name: qa-suite-sync`, `description: "[QA Method] Keep regression-suite cases true to the product after a PR, ticket, module update, deploy diff or release, or for a suite/domain: sync stale cases (update, rewrite, delete), write missing ones, review and fix, verify every new or changed case live, fix, verdict. Reached through /qa-test-lifecycle. Not for testing a ticket (/qa-test), promotion out of Draft (qa-case-promotion), a whole-suite triangulation sweep (/qa-review-tests --triangulate)."`, `argument-hint: "PR <owner/repo>#N | VCST-XXXX | module <name> | diff | changelog <ver> | suite <ids> | domain <name>"`. Body: the default flow (Decision 3) as numbered steps, each naming its supporting file and when to read it; the approvals rule (Decisions 6–7); pre-flight; gates G1–G11 + verdicts; the deduplicated Rules.
- [ ] **Step 3: Remove the flags** (Decision 4) from every moved file: `grep -nE -- '--(skip-[a-z]+|no-auto-fix|layer|report-only|ci|promote-only)\b' .claude/skills/qa-suite-sync/*.md` → no hits. The 4b write-scope table keeps one column (default). Phase 5 runs whenever there is a new/changed case; no browser lane ⇒ SKIPPED with the reason.
- [ ] **Step 4: Order** in `SKILL.md`: dispatch 2–4 → put `pendingApprovals` to the user → re-dispatch approved → 4a-bis triangulation (orchestrator) → Phase 5 → fix round (≤ 2 verify→fix iterations, then report what is left) → gates → report → diff state save (`scope.md` Step 4).
- [ ] **Step 5:** `wc -c .claude/skills/qa-suite-sync/SKILL.md` < 15000.

### Task 4b: `retire.ts` — deprecate or remove cases (added 2026-10-29: "сьюты раздуваются, нужно удалять старые кейсы")

There is no case-removal tool (`tc:demote` only writes `Manual`). Suites grow; old cases must go.

**Files:**
- Create: `.claude/skills/qa-suite-sync/scripts/retire.ts`
- Temporary test (delete in Task 6): `.claude/skills/qa-suite-sync/scripts/retire.test.ts`

**Interfaces:**
- Consumes: `applyCellEdits`, `appendStamp` (`scripts/test-cases/promote-cases.ts`); `isCanonicalHeader` (`scripts/test-cases/append-test-cases-to-suite.ts`); `snapshot`/`restore` CLI of `qa-case-promotion/scripts/flip.ts`.
- Produces:
  ```ts
  export function planDeprecate(text: string, ids: string[], reason: string, date: string):
    { edits: Map<string, CellEdit>; refused: { id: string; reason: string }[] };
  export function deprecatedIds(text: string): string[];
  export function removeRows(text: string, ids: string[]): { text: string; removed: string[]; errors: string[] };
  export function reuseWarnings(removed: string[], remainingIds: string[]): string[];   // removed id >= max of its prefix
  ```
  CLI: `retire.ts deprecate <suite.csv> --ids A,B --reason "<text>" [--date] [--apply]` (→ `Deprecated`, stamp `Deprecated: <reason> (<date>)`); `retire.ts remove <suite.csv> (--ids A,B | --deprecated) [--apply]` (byte-preserving row removal, re-parse proves only those records left; prints reuse warnings and "run npm run suites:sync"). Exit 0 / 1 nothing / 2 refused, nothing written.

- [ ] **Step 1: failing tests** — deprecate stamps + others untouched; deprecate refuses unknown and already-`Deprecated`; remove deletes exactly the rows (a multi-line quoted cell elsewhere stays byte-identical); `--deprecated` selects every `Deprecated` row; non-canonical header → exit 2, file unchanged; removing the highest id of a prefix warns, a middle one does not.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** run → PASS; dry run on a real suite.
- [ ] **Step 5:** `qa-suite-sync` `sync.md` 2c BROKEN path and SKILL.md approvals: deletion = `retire.ts remove` (default for an obsolete case), `deprecate` when the case must stay visible; both after approval, both behind a `flip.ts snapshot`.

### Task 5: Thin router command

**Files:**
- Rewrite: `.claude/commands/qa-test-lifecycle.md`
- Delete: `.claude/skills/qa-test-lifecycle/` (empty after Tasks 3–4)

- [ ] **Step 1:** Frontmatter `description` (when / not-for, routes to the two skills), `argument-hint: "PR <owner/repo>#N | VCST-XXXX | module <name> | diff | changelog <ver> | suite <ids> | domain <name> | promote VCST-XXXX [--run-id <id>]"`.
- [ ] **Step 2:** Body (≤ 4,500 chars), modelled on `.claude/commands/qa-run.md`: one line of purpose; usage block; routing table — any input except `promote` → read `.claude/skills/qa-suite-sync/SKILL.md` whole and follow it; a `VCST-XXXX` input → after it, read `.claude/skills/qa-case-promotion/SKILL.md` (it stops by itself when `find-source` exits 1); `promote VCST-XXXX [--run-id]` → `qa-case-promotion` only. "Read the file", not the Skill tool.
- [ ] **Step 3:** Rule: **any other `--flag` ⇒ stop and print the usage block** — name the removed flags and the replacement (`--promote-only` → `promote VCST-XXXX`).
- [ ] **Step 4:** `wc -c .claude/commands/qa-test-lifecycle.md` < 4500; `grep -c '' ` of the router shows no phase detail (no `#### 2a` etc.).

### Task 6: Callers, indexes, gates

**Files:**
- Modify: `.claude/ROUTING.md` (rows at the `qa-test-lifecycle` lines: 45, 76, 98, 264), `.claude/skills/README.md` (two new rows, matching neighbours), `docs/qa-test-flow.md` (`--promote-only` ×3 → `promote VCST-XXXX`), every `.claude/**` / `plugins/**` line that cites `qa-test-lifecycle` **§Phase 4b** or **6P** (`.claude/skills/qa-test/authoring.md:16,486`, `.claude/skills/qa-test/reporting.md:18`, `.claude/commands/qa-test.md:431` and whatever `grep -rn 'qa-test-lifecycle.*\(6P\|§Phase\|--promote-only\)' .claude plugins` finds) → the skill file that now holds it.
- Leave: `ci/**`, `.github/**`, `package.json`, `.claude/rules/regression.md`, `docs/decisions/**`, `docs/Sprint plans/**`, `CHANGELOG.md` (history or CI — Decision 5).

- [ ] **Step 1:** Repoint the callers above.
- [ ] **Step 2:** Delete the temporary tests: `rm .claude/skills/qa-case-promotion/scripts/*.test.ts`.
- [ ] **Step 3:** `npm run context:check` → exit 0; then `npm run context:check:baseline` (the command drops under the cap, so its baseline entry must disappear); `git diff scripts/maintenance/.prompt-size-baseline.json` shows the `qa-test-lifecycle.md` entry removed.
- [ ] **Step 4:** `npm run qa-test:doclint` → exit 0; `claude plugin validate .claude` → passed.
- [ ] **Step 5:** `/prompt-review changed` → no BLOCKER/MAJOR on the three units.
- [ ] **Step 6: Commit** (only the paths of this plan):
  ```bash
  git add .claude/commands/qa-test-lifecycle.md .claude/skills/qa-suite-sync .claude/skills/qa-case-promotion \
    .claude/ROUTING.md .claude/skills/README.md docs/qa-test-flow.md docs/decisions/qa-test-evolution.md \
    scripts/maintenance/.prompt-size-baseline.json docs/superpowers/plans/2026-10-29-qa-test-lifecycle-split.md \
    <the repointed caller files>
  git commit -m "qa-test-lifecycle: thin router over qa-suite-sync + qa-case-promotion; full job by default, flags and CI mode removed"
  ```
