# Review dimensions — the generic core

What `/prompt-review` checks in **any** prompt that an LLM executes: a skill, a command, an agent
definition, a system prompt. Nothing here depends on this repository. The repo-specific criteria
for the QA toolset (`qa-*` skills and commands, and the QA agents) are in [`repo-profile.md`](repo-profile.md), keyed
to the same `G` ids; for those units apply both, and a profile check sharpens a generic one without
replacing it. Every other unit gets this file only.

Step 1 of [`SKILL.md`](SKILL.md) runs §Candidates below together with the profile's §Tooling (and
its §QA greps in scope); Step 3 applies the severities, the dimensions and §Verdict.

Sources the generic checks draw on: Anthropic's skill authoring best practices
(platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices), the official
`skill-creator` and `plugin-dev` skill-reviewer, superpowers `writing-skills` and its
*testing-skills-with-subagents*, and the OpenAI prompt optimizer's contradiction and format checkers.

## Candidates

Generic greps. Every hit is a **candidate** to confirm, never a finding by itself. `T` is the
space-separated list of the unit's files. A grep with no hits exits 1; that is not an error.

```bash
grep -nEi '\b(every|each|all|any|no|never|always|only)\b +(helper|subagent|agent|step|write|finding|brief|run)s?\b' $T  # G2 scoped rules
grep -nEi '\b(spawn|dispatch|delegate|hand (it )?to)\b|subagent_type|Agent tool' $T  # G2/G4 instances: every brief
grep -nE '\b(MUST|NEVER|ALWAYS)\b' $T                                              # G9 bare imperatives: check each has a why
```

## Severities

- **BLOCKER** — following the prompt produces an unsafe or wrong **outward** effect (an ungated
  write to a shared system, a secret leak, a merge), or a step cannot execute at all.
- **MAJOR** — a run is likely to go wrong, silently: a contradiction whose either reading changes
  what gets done, a dangling citation on a critical path, a drifted restatement, over-budget,
  mis-triggering, a caller that cannot invoke it.
- **MINOR** — correct today, but will rot: a restatement identical to its owner, a transcribed
  count/default, an unsourced illustrative claim.
- **NIT** — wording, ordering, formatting. Never block on a NIT.

## G1 — Interface: triggering, invocation, callers, outputs

How the prompt is reached and what it hands back.

- **Name and arguments** match the usage section and what the steps actually parse.
- **The description decides triggering** wherever the model sees it. It says *when* to use the prompt
  and *not for X (use Y)* for its nearest neighbours, in the third person. Overlap with no
  disambiguation → MAJOR.
- **The description says *when*, never *how*.** A "what" is one capability clause. A step
  sequence, a list of passes or a list of checks is the workflow, and an agent that sees it may
  follow the summary instead of loading the body. superpowers measured this: a description naming
  "review between tasks" produced one review where the body required two. Workflow in the
  description → MINOR; MAJOR when it differs from the body.
- **Invocation control matches side effects.** A prompt that itself performs an outward write with
  no confirmation gate of its own must not be auto-invocable → BLOCKER. A method prompt whose
  wrapper holds the gate, but which can itself be invoked directly → MAJOR (it runs with no gate).
- **Callers still fit.** Everything that invokes it by name still matches its name, arguments and
  outputs, and *can* invoke it (an invocation-disabled prompt that a pipeline calls by name does
  not run) → MAJOR.
- **Outputs others consume keep their schema** (a file, a JSON, a verdict vocabulary) → MAJOR if
  changed silently.
- **An agent declares** the model and tools the body needs → MAJOR if a tool it uses is missing.

## G2 — Internal consistency: rules × instances

A general rule ("every helper…", "never write…", "only the lead posts") is stated once, and the
places it governs are scattered through the steps. Reading top to bottom does not catch a conflict
between the two, because by the time the reader reaches the step the rule is a hundred lines back.
So build the table:

1. **Rules.** Every statement whose subject is a class (the G2 scoped-rules grep, plus any section
   titled "Rules for…"): rule, scope, line.
2. **Instances.** Every place in the unit that falls in each rule's scope: each dispatch, each
   step, each write, each branch.
3. **Per pair, three questions:**
   - **Carried?** The instance cites the rule (by heading) or the rule plainly covers it. A
     dispatch site whose brief must carry the rule (G4) and does not → MAJOR.
   - **Faithful?** If the instance restates the rule, nothing is lost. A paraphrase that drops a
     clause → MAJOR: the agent follows the version in front of it.
   - **Compatible?** What the instance requires is allowed by the rule as written. If not, and
     the rule declares no exception → MAJOR (BLOCKER if one reading causes an outward effect). Either
     reading is wrong: the agent obeys the rule and the step fails, or it breaks the rule and decides
     for itself which other rules are soft.
4. **Fix shape:** one statement of the rule; instances cite it; any exception lives **at the rule**
   with its scope ("…except build output in the worktree, for the test helper"), never implied at
   the instance.

**Worked example.** A skill's rules for every helper say: read-only, "no new files in any
repository or worktree", put this in the spawn prompt, and report a probe test as text instead of
writing one. Three helpers are spawned later:

| Instance | Carried? | Faithful? | Compatible? |
|---|---|---|---|
| Diff-pass brief | yes, "and the read-only mandate" | yes, cited | yes |
| Test-helper brief | restated, "told not to edit, create or commit anything" | **no**: drops scratch-only, the `git` verbs and probe-as-text, the clause a test helper most needs | **no**: "run the test projects in the worktree" builds, which writes `bin/`/`obj/` there, and no exception is declared |
| Sweep-helper brief | **no**: the spawn step never mentions the mandate | — | yes |

That is three MAJORs a top-to-bottom read misses. One edit fixes all three: declare the
build-output exception at the rule, and have every spawn site cite the rule instead of restating it.

Plain contradictions between two instructions are found the same way: pair them, then ask whether
either reading changes what gets done (MAJOR) or causes an outward effect (BLOCKER).

## G3 — Executability

Read the steps as the executing agent would, with no other context, on any machine it is meant to
run on.

- **Each step** names its inputs, action, output and stop condition → MAJOR if missing on a step
  that can fail.
- **Every reference resolves:** cited files and their sections, scripts, agent names, tool ids,
  arguments. For a reference on a step's critical path, open the target and check that it **says**
  what the prompt claims.
- **Branches are exhaustive:** missing tool, server down, empty input, user declines, a stalled
  intermediate state.
- **Ordering:** nothing consumes what a later step produces.
- **Tool contract.** For every command or API call whose output a later step reads, name the field
  that step needs and check that the call returns it: complete (not truncated or paginated away)
  and in the shape assumed. Check the tool's own docs or `--help`, never memory. A field the call
  never returns, or a capped list treated as complete → MAJOR.
- **Re-run and pre-state.** A step that creates something (a worktree, a branch, a file) says
  what to do when it already exists → MAJOR when re-runs are expected. A state the step assumes
  (a clone at the right commit, a server up) is checked, not presumed → MAJOR if a wrong state
  silently changes the result.
- **Portability.** Nothing depends on one person's machine or private context (a per-user path,
  a private note, a local-only setting) → MAJOR when a step acts on it.

## G4 — Delegation

The brief is the subagent's whole world: it cannot read the rest of the prompt, and it cannot ask.
For **each** dispatch site (the G2 instance grep):

- **The agent type exists** and has the tools the brief needs → MAJOR if not.
- **Every fact it needs is in the brief**, including the state the parent has already established
  (paths, refs, what was already checked) → MAJOR if a step depends on a missing one.
- **Every binding rule reaches it.** The rules the prompt sets for this kind of subagent are named
  at the dispatch site, to be pasted into the brief → MAJOR if one is left out. If it is paraphrased
  with a clause dropped, that is a G2 finding.
- **The task is allowed by the mandate.** The assigned work is possible inside the rules the brief
  carries; if not, the exception is declared where the rule is stated (G2).
- **Output shape and the can't-ask path.** The brief names the shape it returns (fields, order) and
  what the subagent does instead of asking: return the question plus the assumption it made →
  MAJOR when the parent parses the output; else MINOR.
- **Concurrency:** parallel subagents never share a mutable resource (a browser session, a file
  they both write, a fixture) → MAJOR.
- **Model choice** (if the prompt picks one) has a reason tied to the work → NIT if missing.

## G5 — Side effects and secrets

- **Every outward write** (to a tracker, a code host, an environment, a chat channel) is gated by a
  confirmation, a dry-run, or a documented authority. Ungated → BLOCKER.
- **An instruction to merge** → BLOCKER. A *prohibition* of merging is correct, not a finding.
- **A "writes nothing" claim** that in fact writes (a tracked file, a store) → MAJOR: list the real
  writes.
- **A delegated flow that can itself write outward** (a callee that asks "create a ticket?") is told
  to stop before that step → MAJOR if not.
- **A literal secret** (password, token, key) → BLOCKER. A secret passed in a form the tool does
  not resolve, so the literal placeholder is typed instead → BLOCKER.

## G6 — Single source of truth

A fact stated once and cited does not drift. A restated fact drifts at the next edit, and it
drifts silently.

- **A rule, list or table restated from its owner** instead of cited: drifted → MAJOR, identical
  today → MINOR.
- **Inside one unit too.** A rule paraphrased in a second section of the same prompt drifts the
  same way, and no linter sees it. Use G2 to find it.
- **A wrapper and its body** (a command and its skill, two copies of one prompt) carrying the same
  step list → MAJOR once they differ.
- **A transcribed value** that has a source of truth: a count, a default, a budget, a version, a
  model id, a URL, an id → MINOR, or MAJOR when a step acts on it. The fix is a pointer to the
  command or constant that holds it.

## G7 — Context economy

Every token of a prompt that is loaded whole is paid on every run, and a subagent definition is
paid on every dispatch.

- **The entry file holds only what every run needs.** A conditional block (a mode, a recovery
  path, a long example, a schema, history) of roughly 2K chars or more is a move-down candidate,
  even under budget → MINOR.
- **Detail moves to supporting files read on demand**, each reached directly from the entry file:
  a chain of references loses content when the model previews with a partial read → MINOR.
- **Over the size budget** → MAJOR. The budget is the repository's; here it is BUDGET-004, read
  from `repo-profile.md` §Tooling.
- **Explanations of what the model already knows** (what a PDF is, how git works) → MINOR.

## G8 — Grounding

Claims about an external system that a step **acts on** (a gate, a flag, a verdict criterion, an
expected behaviour) are sourced: a doc, an observation, a spec, a file that owns the fact. Never
the author's memory. Unsourced → MAJOR in a rule, MINOR in an illustration. A citation whose target
does not back the claim counts as unsourced.

## G9 — Instruction craft

Checks a reader can make from the text:

- **Every hard rule carries its why**, in one clause or a pointer to where it lives. A bare
  MUST/NEVER on a judgement call → MINOR: the model cannot generalise a rule whose reason it was not
  given (skill-creator calls an all-caps rule with no reason a "yellow flag"). Firm wording itself
  is not the defect (it is right for a gate, G10); the missing reason is.
- **Freedom matches fragility.** A fragile or order-sensitive operation left as prose ("set up the
  worktree") → MAJOR if it can fail silently; give the exact command. A judgement task
  over-scripted into a fixed sequence → MINOR.
- **A default, not a menu.** Several equal options with no default and no rule for choosing → MINOR.
- **One term per concept.** The same thing under two names reads as two things → MINOR; MAJOR when
  the term is the subject of a rule (G2 cannot match a rule to an instance under another name).
- **Examples agree with the rules they illustrate.** An example that breaks a rule stated beside it
  → MAJOR: the model copies examples over prose.
- **Output contract.** Anything a parent, a script or a later step parses has its exact shape stated
  (fields, order, verdict vocabulary) → MAJOR if missing.
- **Tools named by exact id**, not by description → MINOR.
- **No time-bound statements** in instructions ("until next month use…") → MINOR; history goes
  where history lives.

## G10 — Decision points and behavioural evidence

REVIEW reads text, but only runs show whether a prompt works. That gap matters most at its
**decision points**: the places where the prompt asks the model to do something other than its
default, such as stopping to ask instead of falling back, *not* filing a finding, or refusing a
shortcut under deadline.

- **Find them.** Every stop/ask condition, every "not a finding", every override of an obvious
  default.
- **Each has its counter.** The predictable rationalisation for skipping it is answered in the text
  (a Thought | Reality table, an explicit negation, an "even when…"). Missing on a stop, a gate or
  an outward write → MAJOR; elsewhere → MINOR. To find the rationalisations, run the scenario
  without the rule and record what the model says (superpowers *testing-skills-with-subagents*).
- **Evidence on record.** A decision point added or changed with no run evidence (an isolated
  session, with vs without the rule, 3 or more runs) → MINOR in REVIEW, and the first candidate for
  `--improve` (`improvement-loop.md` §3). The useful record is one row per decision point:
  `without k/n` vs `with k/n`.

---

## Verdict

- **HEALTHY** — no BLOCKER, no MAJOR.
- **NEEDS HEALING** — no BLOCKER; every MAJOR has a concrete fix in `healing-playbook.md` (SAFE or
  PROPOSE) that does not need restructuring the prompt.
- **NEEDS REDESIGN** — a BLOCKER, or a MAJOR whose fix means restructuring the steps or changing
  the prompt's arguments/outputs that callers rely on. A MAJOR settled by one PROPOSE recipe (e.g.
  H10, flip a flag) is still NEEDS HEALING — the decision is the user's, the fix is local.

Under the verdict, two short lists, so a clean result can be checked as well as a dirty one:
**Checked clean:** the dimensions with no findings. **Checked and dropped, because…:** one line
per candidate (a grep hit, a G2 pair, a suspicion) that you did not make a finding, with the
reason. Dropping a candidate is itself a claim and needs the same evidence a finding would.
