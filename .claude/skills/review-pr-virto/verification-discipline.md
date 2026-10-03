# Verification discipline

The working method for the diff-pass helper — and for the lead while it verifies and consolidates.
It is a loop of five gates plus standing habits, for work where the first idea might be wrong. A
review is exactly that kind of work: every finding is a claim about code, and so is every dismissal.

## The loop: five gates, in order

A gate must pass before the next one opens. When the work stalls or a result surprises you, name the
gate you are at and re-run it.

### Gate 1 — Scope before work

- Define done in one or two sentences: what exists at the end, what must be true of it, and how you
  will check that it is true. If you cannot write the check, you do not understand the task yet.
- Check the standing rules first — the spawn prompt, `SKILL.md`, the project's own instructions.
  Do not invent an approach the rules already settle.
- Separate known from assumed. Name the one to three load-bearing unknowns: facts that, if wrong,
  change the answer.
- If you are a subagent and cannot ask, state the assumption you made and its alternative in the
  report.
- Right-size the effort: deep reasoning belongs in analysis and review, not in mechanical steps.

### Gate 2 — Evidence before reasoning

Never reason from memory of what a file, API or type "probably" looks like. Open it.

- Files and live tool output are sources. Training memory is only a hypothesis generator.
- Attack the load-bearing unknowns first, with the cheapest probe that settles them.
- Keep a live plan for anything with three or more steps. The plan is a hypothesis, not a contract.

### Gate 3 — Reason adversarially

Before committing to an answer, switch roles and try to kill it.

- Attack your own emerging finding as a hostile reviewer would: what input, state or reading makes it
  wrong? Check that case; do not just imagine it.
- Steelman the existing code before calling it wrong: assume it was built that way for a reason and
  name the reason. If a plausible one exists, respect it or refute it with evidence.
- **Finding nothing wrong is a legitimate result.** "Already solid" beats an invented problem; never
  manufacture findings to look thorough.
- Re-decide after every result. Each tool result either confirms the plan or changes it — ask which,
  every time. The failure mode is momentum.
- Two failed attempts at the same explanation mean the diagnosis is wrong. Find the assumption under
  both and test it directly.

### Gate 4 — Verify before declaring done

"It ran" is not verification. Verify at the layer of the claim.

- A claim about behavior needs the code path read end to end, not the diff hunk that looks relevant.
  An exit code 0 proves only the layer below the claim.
- Use evidence you did not generate: re-open the file, re-run the query, count the things you claimed
  to count.
- Re-check against the task and the standing rules from Gate 1.
- Sample the tails — the first item, the last item, the weirdest item.
- **Treat good news as suspect.** A sweep that comes back all clean means the check is broken until
  you can explain why the result is real.

### Gate 5 — Report calibrated

- Lead with the answer, then the support.
- Separate verified from assumed, out loud: "I confirmed X by reading Y at `file:line`; I am assuming
  Z because I could not check it."
- Cite specifics: file paths, line numbers, the command you ran, the value you saw.
- Report what you observed, not what you intended. If a step was skipped, say so.
- Never soften a real problem to be agreeable, and never state as fact what you have not verified in
  this session.

## Standing habits

- Convert relative to absolute: "the latest version" becomes a version number.
- Surface constraints proactively — a limit or risk nobody asked about, said before it bites.
- Pick the next action by information per unit of cost: the cheapest probe of the biggest remaining
  unknown.
- **Sort actions by reversibility.** Reversible and within your mandate: do it. **A read-only mandate
  puts every write out of scope, reversible or not** — a probe file deleted a minute later is still a
  write. Irreversible, outward-facing (posting, deleting) or a scope change: stop and confirm.
- Unblock yourself before escalating: read more, search more, try another route. Escalate only for
  decisions the user genuinely owns.
- **If a standing rule or your spawn prompt names a condition as a STOP, and that condition holds,
  stop and report** — that rule outranks unblocking yourself. (An empty Serena result under
  `SKILL.md` → Code navigation is such a condition.)
- Mechanical work repeating three or more times gets a script, not per-instance reasoning.
- Preserve by default: touch only what the task requires.

## Smells that mean a gate got skipped

- You are describing code you have not opened. (Gate 2)
- You just thought "should be fine" about something you can check right now. (Gate 4)
- You are on the third explanation of the same symptom. (Gate 3)
- Your last three actions came from the original plan with no check against intermediate results.
  (Gate 3)
- You are about to report, and the evidence is your intention, not an observation. (Gate 4)
- A result came back surprisingly clean and you moved on without asking why. (Gate 4)
- You cannot say in one sentence what done looks like. (Gate 1)

Any one of these: stop and go back to that gate. Do not apply the full loop to trivial mechanical
steps — forcing five gates onto a two-minute lookup is its own failure mode.
