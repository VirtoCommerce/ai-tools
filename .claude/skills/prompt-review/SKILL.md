---
name: prompt-review
description: "Review, heal and improve THIS repo's own prompt files — skills (SKILL.md + supporting files), commands and agent definitions under .claude/ and plugins/*/. REVIEW is read-only (10 dimensions: triggering, budget/tiering, single source of truth, no-hardcode, portability, executability, write safety, delegation, product grounding, integration); HEAL (--fix) applies SAFE repairs and proposes the rest; IMPROVE (--improve) tunes from real-run evidence. Findings go to chat. Not for test cases (/qa-review-tests), oracles (/qa-review-oracles), product or script code (/code-review), a skill's runtime telemetry (/vc-self-check), or authoring a brand-new skill (anthropic-skills:skill-creator)."
argument-hint: "<skill|command|agent name | path | changed | all> [--fix] [--improve] [--dry-run]"
---

# /prompt-review — Review, heal and improve our skills, commands and agents

A skill, command or agent file is **code that an LLM executes**. It rots the way code does: a
cited path moves, a count goes stale, a rule is restated and drifts, a step stops being executable,
a caller invokes it in a way it no longer supports. This skill applies one method to every prompt
file in the repo and, on request, repairs what it finds.

| Pass | Flag | Writes? | Output |
|---|---|---|---|
| **REVIEW** | *(default)* | nothing, not even a temp file | findings table + verdict in chat |
| **HEAL** | `--fix` | see §Write scope | diff + gates |
| **IMPROVE** | `--improve` | see §Write scope, after evidence | proposal, then edit on confirmation |

`--dry-run` with `--fix`/`--improve`: show each SAFE edit as a unified-diff snippet and each
PROPOSE as a one-line description; **ask nothing, write nothing**; run the gates on the unchanged
tree and label them *baseline, not post-heal*.

It is model-invocable on purpose, so an orchestrator or subagent can run the read-only REVIEW;
nothing is ever written without an explicit `--fix` / `--improve`.

## Usage
```
/prompt-review qa-triage-results               # a command + its skill, reviewed as one unit
/prompt-review ui-ux-expert                    # an agent (.claude/agents/<name>.md)
/prompt-review plugins/vc-fix/skills/qa-defect # an explicit path (plugin copy)
/prompt-review changed                         # prompt files changed on this branch (committed + uncommitted)
/prompt-review all                             # triage table only, see Step 1
/prompt-review qa-hotfix --fix                 # review + heal
/prompt-review vc-docs --improve               # review + evidence-driven tuning
```

## Supporting files — read the one the step needs, when it needs it

| File | Read at |
|---|---|
| [`review-dimensions.md`](review-dimensions.md) | Step 1 (§Collect: the fact, grep and citation-sweep commands) and Step 3 (the 10 dimensions, severities, verdict) |
| [`healing-playbook.md`](healing-playbook.md) | Step 4 (`--fix` / `--dry-run`): recipes, SAFE vs PROPOSE |
| [`improvement-loop.md`](improvement-loop.md) | Step 5 (`--improve`): evidence, diagnosis, measurement |

The rules this skill enforces are **cited, not restated**: `CLAUDE.md` §Where the rules live
(tiers, BUDGET-004, counts), §What reaches a teammate (memory slugs), §Essential Rules → *Product
context*, §Project Overview (plugin duplication, self-diagnostics); `.claude/rules/test-data.md`
§GOLDEN RULE; `.claude/rules/agents.md` §Agent Delegation; `.claude/rules/reports.md` §1. Where one
of them and this skill disagree, they win — and that disagreement is a finding against this skill.

## Step 0 — Resolve the target

1. **Name → files.** Check `.claude/skills/<name>/`, `.claude/commands/<name>.md`,
   `.claude/agents/<name>.md`, then the same under `plugins/*/`. Every hit is reviewed **as one
   unit** — the command/skill split and any duplicate copy are part of what is under review. An
   **alias** stub (a skill that forwards to another) is the unit; read the skill it forwards to only
   as far as needed to check the alias against it — findings in that skill are a separate run.
2. **`changed`** → the union of `git diff --name-only origin/main...HEAD` and
   `git diff --name-only HEAD`, filtered to `SKILL.md`, its supporting files, `commands/*.md` and
   `agents/*.md` under `.claude/` or `plugins/*/` (**not** `.claude/skills/README.md` or `.claude/ROUTING.md`). If
   `origin/main` is missing, use the uncommitted set and say so. Empty → report "no prompt files
   changed" and stop. More than 5 files → treat like `all` (triage table) and name the top 5.
3. **Duplicate copies** (`.claude/skills/<name>` and `plugins/vc-fix/skills/<name>`): the
   *duplication* is deliberate (`CLAUDE.md` §Project Overview); whether a given *difference* is,
   is a question. Report every difference and, for a fix applied to one copy, ask whether the
   other needs it too. For `--fix`, ask which copy is in scope unless the user named a path.
4. **Self-diagnostics containment files** are the one pair with a hard rule — byte-identical,
   `plugins/vc-fix/` canonical and changed first, both in one commit, and nothing checks it any
   more. The file list and rule: `docs/decisions/self-diagnostics-design.md` (search
   "Canonical copy"). They are `.mjs`, so they are outside `--fix` scope: report drift, never heal it.
5. **Concurrent editors** (this skill's own rule, by analogy with the suite one-author rule in
   `.claude/rules/regression.md`): probe with `git log --all --since=3.days --oneline -- <paths>` and,
   when GitHub MCP is available, `list_pull_requests` (state open, this repo) then `pull_request_read`
   `get_files` on each — PR search matches text, not changed files. A hit → stop and say who. If neither probe could run, say "concurrent edits not
   verified" — never let the check pass silently.

## Step 1 — Collect facts deterministically (one batch, before reading prose)

Run, in one batch, the three command blocks of `review-dimensions.md` §Collect. They are **facts** (BUDGET-004
status read from `context:report`, never a transcribed cap), **grep pack**, **citation sweep** —
plus `git log --oneline -n 15 -- <paths>` and `claude plugin validate .claude` (or
`plugins/<name>`) for frontmatter. Everything is piped; nothing is written to disk.

**Know the linter's reach.** `context:check` scans only `CLAUDE.md` + `.claude/**`, and only
backticked paths with a known prefix. For a `plugins/*` target it reports nothing — that is *not a
clean result*. The citation sweep is what covers plugins, markdown links, bare filenames, bare `§`
and BL ids. Every grep/sweep hit is a **candidate**; confirm it before it becomes a finding.

**`all` mode is triage-only:** one row per prompt file with: breach (over cap, not in baseline) ·
overage vs baseline · DOC findings · sweep UNRESOLVED count · grep hits. Sort by those columns in
that order, print the table, recommend the top 5 for individual runs, and stop. Asked to keep it?
Save it as `docs/prompt-review-triage-<date>.md` — a dated audit snapshot beside the repo's other audits
(prompt reviews are not a `reports/` category), with the head SHA and the regenerate note.

## Step 2 — Read the target whole, find its callers

Read every loaded-whole file of the unit in full. Then read the supporting files that **any file
in the unit** cites from a step or phase (a skill with no steps of its own inherits its command's
citations); skip the rest. Note frontmatter (`name`, `description`, `argument-hint`,
`disable-model-invocation`, `allowed-tools`, `model`), each step's inputs/outputs, every citation
and every outward-facing write.

**Callers** — bounded on hyphens too (`grep -w` is not: `qa-test` would match `qa-test-lifecycle`):
```bash
n=<name>; grep -rnIE "(^|[^A-Za-z0-9_-])/?$n([^A-Za-z0-9_-]|\$)" .claude plugins ci scripts config docs .github CLAUDE.md \
  --include=*.md --include=*.ts --include=*.mjs --include=*.json --include=*.yml
```
A caller that invokes the target by name (a pipeline phase, a CI workflow) fixes its name and
arguments — and **cannot run it at all if the target has `disable-model-invocation: true`**. Check
that pairing explicitly (D10).

## Step 3 — Review against the 10 dimensions

Apply every dimension in `review-dimensions.md`. Each finding: `ID · dimension · severity ·
file:line · what · failure scenario (BLOCKER/MAJOR only) · fix`.

- **Evidence or it is not a finding.** Quote the line, name the missing path, show the count.
- **Do not flag house style** the repo applies everywhere, unless it breaks a cited rule.
- **A known, documented limitation** (e.g. plugin bare paths, D5) is flagged only where the target
  adds a new instance or lacks the documented mitigation.
- **Product claims:** before writing any judgement of one — "correct", "wrong", "unsourced" — ground
  it in order: repo knowledge (`.claude/knowledge/domain/`, the BL/ECL oracles), then `/vc-docs`,
  then source (`CLAUDE.md` §Essential Rules → *Product context*). Check the claims a step **acts
  on** (gates, flags, verdict criteria, oracle ids an example teaches); list illustrative ones as
  *unverified* rather than spending a query on each. A mismatch is reported, never "fixed" by
  preferring the doc (`.claude/rules/agents.md` — a doc is authoritative for MECHANISM, not SURFACE).

Verdict per `review-dimensions.md` §Verdict. Print in chat — **no report file** (prompt reviews
are not one of the ten categories, `.claude/rules/reports.md` §1). For more than 12 findings, drop
the failure-scenario column for MINOR/NIT. Stop here unless `--fix` / `--improve`.

## Step 4 — HEAL (`--fix`)

Follow `healing-playbook.md`: apply SAFE recipes, show every PROPOSE as a diff and apply only on
confirmation, never reword while moving. **Gates** before reporting done:

| Target | Gate |
|---|---|
| anything under `.claude/` | `npm run context:check` |
| `/qa-test` or `.claude/skills/qa-test/` | + `npm run qa-test:doclint` |
| `plugins/<name>/` | `claude plugin validate plugins/<name>` + re-run the citation sweep (no BUDGET-004/DOC gate reaches plugins — check size with `wc -c` against the cap from §Collect) |
| a skill dir that also holds `*.mjs`/`*.ts` | that code is out of scope — if a prompt edit changed how it is called, run `npm test` |

Then re-read your own diff adversarially: is every hunk a SAFE recipe or a confirmed PROPOSE? A
plugin change owes a version bump + tag (`docs/release-process.md`) — say so; do not bump unasked.

## Step 5 — IMPROVE (`--improve`)

Follow `improvement-loop.md`. **No evidence ⇒ no behavioural edit.** Every IMPROVE edit is PROPOSE.

## Step 6 — Close out

The findings table stands on its own; after it, a summary of ≤ 15 lines: target, verdict, counts by
severity, what was healed (files, chars before → after), what is proposed and awaiting a decision,
gates run with results, anything *not verified* (concurrent edits, plugin gates, product claims).
If files changed, suggest a commit message; commit or push only if asked.

## Write scope

`--fix` / `--improve` may write only: the unit's prompt files and supporting files; a new
supporting file in the unit's directory (or, for an agent, under `.claude/knowledge/agents/`);
`docs/decisions/` for moved history; the unit's own rows in `.claude/skills/README.md` /
`.claude/ROUTING.md`; the prompt-size baseline via `npm run context:check:baseline` (shrink only).
Never: a regression suite CSV, an existing product claim in `.claude/knowledge/**`, code, another
repo, a budget number. Never delete a rule to save space; never rename a prompt or change its
arguments without updating every caller found in Step 2, and never without asking.

Review this skill with itself: `/prompt-review prompt-review`.
