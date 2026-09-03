# Ticket Status Transitions — who moves a ticket, when, and on whose authority

**This file is the only place the status state machine lives.** `ticket-routing.md` decides *which flow
runs* for a ticket; this file decides *what happens to the ticket's status while that flow runs*. Every
consumer **cites this file and never restates the table** — changing a rule means editing here, once.

**Owner: `qa-lead-orchestrator`** (`.claude/agents/qa-lead-orchestrator.md` §Status custodian). A status
transition is an **outward-facing write to a shared tracker**: it moves work on someone else's board,
notifies watchers, and on Jira it also gates which transitions are reachable next. So it is an
orchestration act with a single actor, exactly like dispatching a peer agent (`authoring.md` §3a) and
like the single-writer apply in `/qa-review-oracles`.

Consumers: `/qa-test` (§1a opening hop, §5f closing hop) · `/qa-verify-fix` · `/qa-fix` ·
`/qa-hotfix-check` · `/qa-triage-results` and `/qa-monitoring` (both of which transition **nothing**).

> Tracker-agnostic by construction: every transition is resolved **live** against the ticket's own
> workflow and matched on the target's `to.name`, never on a hardcoded transition or status name
> (`tracker-ops.md` §Live transition discovery). With no `project-profile.json` ⇒ Jira / VCST.

---

## 1. The rule, in one sentence

**A run makes at most two status moves — one when testing starts, one when the run closes — both by
`qa-lead`, both recorded, and never past `TESTED`.**

Everything below is that sentence's edge cases.

---

## 2. The state machine

```
        <whatever status the ticket was in>
                      │
                      │  OPENING HOP — 1a, the moment the feature-test route resolves
                      │  no confirmation · reversible · one line if skipped
                      ▼
                 in-testing  ◄──────────────┐
                      │                     │ --iterate: the ticket STAYS here
                      │                     │ across rounds (one hop, not N)
                      │                     │
        ┌─────────────┼─────────────┬───────┴──────────────┐
        │             │             │                      │
  PASS / PASS   │  FAIL       │  BLOCKED             │  (run aborted
  WITH NOTES    │             │                      │   before 5f)
        │             │             │                      │
        ▼             ▼             ▼                      ▼
     TESTED        REOPEN     NO TRANSITION          NO TRANSITION
   (terminal —    + failures  + MANDATORY comment    + the opening hop
    never Done)   + bug links   naming the blocker     is left in place
```

## 3. The two hops

| | Opening hop | Closing hop |
|---|---|---|
| **Where** | **`1a`, immediately after the flow routes to `feature-test`** — before `1b`, and long before the first agent is dispatched | 5f, strictly **after** the report is posted |
| **To** | the ticket's in-testing status, discovered live | `TESTED` / `REOPEN` / nothing — §4 |
| **Confirm?** | **No.** It is the direct, reversible consequence of the operator invoking the command, and asking adds a prompt to every run for a move the operator already implied | **Yes — ask.** It is terminal for the run, it notifies watchers, and `REOPEN` hands work to another team. The one place `/qa-test` writes a verdict onto someone else's board |
| **Skip when** | tracker MCP unconfigured · already in-testing · no such transition exists · the target is a bare feature name or a PR | tracker MCP unconfigured · the flow is `hotfix-verify` (§6) |
| **On skip** | one line, and a `status_transitions[]` entry with `skipped: <reason>` | same |

**The asymmetry is the point.** Auto-moving *into* testing costs a reversible hop nobody objects to;
auto-moving a ticket *out* of testing publishes a verdict. Confirmation belongs where the cost is.

**Why the opening hop is at `1a` and not at Step 4, where it used to be.** *In testing* means **QA owns
this ticket now**, and that is true the moment the run is accepted — not when the first browser opens.
At Step 4 the ticket sat in READY FOR TEST through `1a`-`3` — context gathering, the Test Model,
authoring, seeding, the discovery lane — 30+ minutes of real QA work on a FULL run during which the
board showed the ticket as unclaimed, and nothing stopped a human picking it up for real (`/qa-test`
`1b`'s duplicate check guards only against *this pipeline* re-testing the same ticket inside 2 h). The
objection to moving it early is that a STOP before execution then leaves the ticket in TESTING having
tested nothing — which §4 already answers: that is the `BLOCKED` shape, in-testing **plus a comment
naming why nobody is testing it**, and it is more honest than a ticket reading unclaimed after consuming
half an hour of QA capacity.

**It must fire AFTER the route decision, never before.** `verify-fix` owns its own close-out and
`hotfix-verify` transitions nothing (§6); a hop taken before routing would move a ticket for a flow about
to hand off, and on the `verify-fix` branch it would be the second flow to move one ticket in one run.

## 4. Closing — one row per verdict, and BLOCKED is a row

| Verdict | Transition | Also required |
|---|---|---|
| `PASS` / `PASS WITH NOTES` | → **`TESTED`** | Hand to the Feature Release Gate. `PASS WITH NOTES` is a PASS: the notes live in the comment, never in a different transition |
| `FAIL` | → **`REOPEN`** | The comment lists every failure and every filed bug link, **before** the transition |
| `BLOCKED` | **none — deliberately** | A **mandatory comment** naming the blocker (env / data / dependency / not-deployed), what it blocks, and that the ticket is **awaiting a re-run**. The ticket stays in-testing |
| run aborted before 5f (STOP at a gate, operator interrupt) | **none** | The opening hop stays; say so in the chat close-out. Never "tidy up" by reversing it |

**Why `BLOCKED` transitions nothing, and why that needs saying.** It used to have no row at all — the
table had two rows for a four-value verdict vocabulary — so a blocked run left the ticket sitting in
in-testing with no comment obligation and no rule, reading to everyone else as *QA is testing this*
while nothing was. Both alternatives are worse: `TESTED` is a lie, and `REOPEN` puts an env/data blocker
into the developer queue as though it were a product defect, which is the same mislabelling the
severity floor exists to prevent. So the honest state is *still in testing, and here is why nobody is
testing it* — and the **comment is what makes that state readable**, which is why it is mandatory rather
than nice-to-have.

**Never route through `Cancelled`, `On hold`, or `Done`.** `TESTED` is the terminal state a QA flow may
reach; `Done` is a release decision and belongs to a human.

## 5. `--iterate` — one closing hop per run, whatever the round count

The ticket **stays in-testing across rounds** and the closing hop fires **once, at loop exit**. Two
reasons, both structural: `REOPEN` is the human-handoff signal and a loop about to start another round
is not handing off; and on Jira a per-round `REOPEN` would flap the ticket *out* of in-testing, which is
the precondition both closing transitions need. If round 1 skipped the opening hop, the exit round does
it first (§7).

### 5a. The two-hop rule counts hops on the TICKET UNDER TEST — a bug sub-task is its own ticket

"At most two moves" is per ticket, not per run. A `--iterate` round entry re-reads the ticket's
**sub-tasks and linked bugs** and verifies each fix-ready one by running `/qa-verify-fix` inline
(`.claude/skills/qa-test/modes.md` §Round entry) — and that inline run owns those bugs' hops, exactly as
§6 already says for the `verify-fix` flow. It changes nothing above: the ticket under test still gets one
opening hop and one closing hop, and `qa-lead` is still the only actor (§9.1).

Three constraints on a bug's hop, and the first is the one that makes it safe:

1. **`TESTED` only, and only once the fix has SHIPPED to the env** — the bug's fix PR is `MERGED` **and**
   the owning component's version in the round's *probed* build carries it. The loop otherwise re-tests an
   **unmerged prerelease**, where no QA state on the bug is honest; either half unproven ⇒ no hop, and say
   which half. §9.5 is untouched — `Done`/`Cancelled`/`Closed` remain forbidden on a bug as on anything
   else.
2. **Only the VERIFIED row hops mid-loop.** `FIX_INCOMPLETE` / `INTERMITTENT` / `NEW_REGRESSION` /
   `BLOCKED` defer to **loop exit** (`REOPEN` + the failure list). A per-round `REOPEN` on a sub-task
   flaps it out of in-testing and fires N−1 false handoff notifications — this section's own reasoning,
   one level down. A bug left in in-testing meanwhile is the §4 `BLOCKED` shape: in-testing **plus the
   mandatory comment** saying why nobody is closing it.
3. **Recorded against the bug key.** Each hop and skip appends to `status_transitions[]` (§8) with the
   bug's key, so "the sub-task was never moved" and "it was moved and the note was lost" stay
   distinguishable there too.

## 6. Per-flow ownership — three flows, three answers

| Flow | Who transitions |
|---|---|
| `feature-test` | **This file** — the two hops above |
| `verify-fix` | **`/qa-verify-fix` owns its own close-out** (VERIFIED / REOPEN). `/qa-test` §1a runs it inline and adds no hop of its own — two flows transitioning one ticket is how a ticket ends up moved twice for one run |
| `hotfix-verify` | **Nothing.** §1a STOPs and hands off to `/qa-hotfix-check`, which owns the per-env subtasks and the parent |

`/qa-triage-results` and `/qa-monitoring` transition nothing and file nothing, by design.

## 7. Jira reachability — the opening hop is a precondition, not a courtesy

On Jira both closing transitions are reachable **only from the in-testing status**, so a run that
skipped the opening hop must do it at 5f before closing. On **Azure Boards** `System.State` is set
directly and there is no reachability chain — but the opening hop still runs there, because its purpose
was never only reachability: it tells everyone else on the board that QA started. Discover the available
states live; if the project genuinely has no testing-like state, record
`skipped: "no in-testing state in this project"` and move on. **Never invent a state name.**

## 8. The record — the mechanism, not the paperwork

Every hop **and every skip** appends one entry to **`summary.json.status_transitions[]`**:

```json
{ "hop": "opening", "at": "1a", "from": "READY FOR TEST", "to": "TESTING",
  "transition": "On QA", "confirmed": false, "actor": "qa-lead" }
{ "hop": "closing", "at": "5f", "from": "TESTING", "to": null, "skipped": "verdict BLOCKED — comment posted, awaiting re-run",
  "confirmed": true, "actor": "qa-lead" }
```

`null` for the whole field means **no hop was even attempted** — which is a gap, not a clean run (the
`axes.md` §2 rule, one level down). An empty array means the run reached the tracker and made no move.

This is what makes the rest of the file checkable rather than aspirational: before this, a skipped
transition left **no trace at all** in any artifact, so "the ticket was never moved" and "the ticket
was moved and the note was lost" were indistinguishable after the fact. `npm run summary:validate`
enforces the shape.

## 9. Hard rules

1. **`qa-lead` is the only actor.** A specialist agent, a runner, a verifier, a doer and any sub-agent
   **never** transition a ticket — including "while they are already in there" posting a comment. A
   sub-agent that believes a transition is due **reports it up**; the orchestrator makes the move.
   (Same containment as `feedback_subagent_external_writes`.)
2. **Comment before transition, always.** `REOPEN` without the failure list, and `BLOCKED` without the
   blocker comment, are both a status change nobody can act on.
3. **Never re-grade a verdict to reach a nicer transition.** The verdict is 5c's, derived from 5a + 5b;
   5f applies it. Wanting `TESTED` is not evidence.
4. **A skip is stated in the chat close-out and recorded.** An omitted transition reads exactly like a
   successful one.
5. **Never past `TESTED`.** No `Done`, no `Cancelled`, no `Closed`, in any flow, on any tracker.
