# Improvement loop — `/prompt-review --improve`

Supporting file for [`SKILL.md`](SKILL.md) Step 5. REVIEW and HEAL judge the prompt as text.
IMPROVE judges it by **what agents actually did when they ran it**, and changes only what that
evidence supports. Every edit here is `PROPOSE` (`healing-playbook.md`).

## 1. Gather behaviour evidence (read-only, batch these)

| Source | What it tells you | How |
|---|---|---|
| Git history of the prompt | Steps that keep getting patched: fixed 3× is a design problem, not 3 typos | `git log -p --follow -- <file>`; look for repeated hunks and "fix"/"stop"/"never" subjects |
| `docs/decisions/*.md` | Incidents already attributed to it | `grep -nw "<name>" docs/decisions/*.md` |
| `/vc-self-check` | Flagged spans, struggle sub-signals, silent-suspect runs (vc-fix skills with telemetry on) | Run it for the session; it returns a finding struct in chat, oracle `.claude/knowledge/diagnostics/skill-expectations.md` |
| `/qa-triage-results` test-defect buckets | Prompts whose authored cases keep producing bad steps/assertions/stale data | Its summary for recent runs |
| PR review threads | Corrections reviewers keep making to output this prompt produced | GitHub MCP `search_issues` (`is:pr`) then `get_pull_request_reviews` / `get_pull_request_comments` |
| The user | The run that prompted this | Ask for the session and what went wrong |

**No evidence ⇒ no behavioural edit.** Report "no behavioural signal found" and name what would
count (e.g. "one transcript where Step 3 was skipped").

## 2. Diagnose — symptom → cause → improvement

| Symptom | Usual cause | Improvement |
|---|---|---|
| Did not trigger / wrong skill triggered | *Model-invocable only:* `description` vague or overlaps a neighbour | Rewrite it: task verbs + phrases users type + *not for X (use Y)* |
| A caller "ran" it but nothing happened | `disable-model-invocation: true` on a skill a caller invokes by name | PROPOSE removing the flag, or change the caller to hand off to the user |
| Agent skipped a step | Step buried in prose, or conditional with no clear condition | A numbered step with an explicit trigger; move the prose down a tier |
| Agent asked something the repo answers | The prompt does not say where the answer lives | Add the pointer at that step |
| Agent re-derived a fact a script prints | No deterministic collect step | Add a batched collect step (shape: SKILL.md Step 1) |
| Output shape varied run to run | No template / stop condition | Add a minimal template and a length cap |
| Ran out of context / budget | Loaded-whole file too big, or it reads every supporting file | H11; make each supporting-file read conditional |
| Surprising write | Missing gate, or a callee's own write step | H13 / H14 |
| Same reviewer correction repeatedly | A rule the prompt does not state, or states after the step that needs it | A one-line imperative **at** the step, citing its owner (H4b shape) |

Prefer the smallest change that removes the observed failure — every line of a loaded-whole file is
paid on every run.

## 3. Measure before/after

- **Skills, triggering and output:** `anthropic-skills:skill-creator` — 3–5 realistic prompts,
  including one that must **not** trigger it; run old vs new; compare outputs and trigger rate.
  Trigger rate is only meaningful for model-invocable skills.
- **Plugin skills:** `claude plugin eval <plugin>` runs eval cases from the plugin's `evals/` dir.
  A plugin with no `evals/` dir (`ls plugins/*/evals`) has no cases to run — writing them is part of the proposal.
- **Commands / agents:** replay the failing scenario from step 1 above on the new version (dry-run or a
  non-prod env), plus one known-good scenario to catch regressions.

Record before/after in the close-out summary (chat), not in a file.

## 4. Apply

Show each diff next to the evidence line it answers; apply on confirmation; run the Step 4 gates. A
description rewrite also needs a collision check — grep the other skills' descriptions for the new
trigger phrases so it does not steal a neighbour's requests.
