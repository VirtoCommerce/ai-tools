# qa-lead-orchestrator — Status custodian, JIRA Workflow, QA Transitions

> Cited by `.claude/agents/qa-lead-orchestrator.md` §Status custodian. Read it before any ticket status transition (and when posting the transition comment). Moved verbatim.

### Status custodian — you are the ONLY actor that moves a ticket

**Single source of truth: [`knowledge/execution/ticket-status-transitions.md`](../../execution/ticket-status-transitions.md).**
Read it before any transition; the table below is the Jira-shaped illustration of it, not a second copy
of the rules, and where the two ever disagree that file wins.

Four obligations, and they are yours alone:

1. **Sole actor.** A status transition is an outward-facing write to a shared board — it moves work in
   someone else's queue, notifies watchers, and on Jira gates what is reachable next. No specialist, no
   runner, no verifier, no doer and **no sub-agent** transitions a ticket, not even while already in the
   tracker posting a comment. One that believes a transition is due **reports it up**; you make the move.
   Same containment as the external-write discipline in `knowledge/agents/*/shared-instructions.md`.
2. **At most two hops per run** — one in (at **`1a`**, the moment the `feature-test` route resolves —
   never confirmed, and long before the first dispatch) and one out (after
   the report, **always** confirmed). Never past `TESTED`: `Done`, `Cancelled` and `Closed` are release
   decisions and belong to a human, on every tracker.
3. **Every verdict has an answer, including BLOCKED** — which transitions **nothing** and requires a
   comment naming the blocker. TESTED would be a lie; REOPEN files an env blocker into the dev queue as
   though it were a product defect.
4. **Record the hop, and record the skip.** `summary.json.status_transitions[]`, with the reason. A
   transition nobody can reconstruct afterwards is the failure this record exists to close.

### JIRA Workflow

```
READY FOR TEST  ─── On QA ──→  TESTING  ─── Finish test ──→  TESTED
                                  │                              │
                                  │ Need fixes                   │ need to recheck
                                  ↓                              ↓
                               REOPEN  ←─────────────────────────┘
                                  │
                                  │ go to inprogress
                                  ↓
                             IN PROGRESS ──→ IN REVIEW ──→ READY FOR TEST
```

### QA Transitions

| From | Transition | To | When |
|---|---|---|---|
| READY FOR TEST | `On QA` | TESTING | Starting QA |
| TESTING | `Finish test` | TESTED | All tests pass |
| TESTING | `Need fixes` | REOPEN | Bugs found |
| TESTED | `need to recheck` | REOPEN | Issues after approval |

```javascript
transitionJiraIssue({ issueKey: "VCST-XXXX", transition: "On QA" })       // Start
transitionJiraIssue({ issueKey: "VCST-XXXX", transition: "Finish test" }) // Pass
transitionJiraIssue({ issueKey: "VCST-XXXX", transition: "Need fixes" })  // Fail
```

**Rules:** Only pick up READY FOR TEST. Always transition to TESTING first. Comment before REOPEN. Verify fix version before TESTED.

**These transition names are this project's Jira workflow, not a contract.** Resolve them **live** and
match on the target's `to.name` (`knowledge/execution/tracker-ops.md` §Live transition discovery) — a
hardcoded name fails on a renamed workflow; Azure Boards has no transition names.
