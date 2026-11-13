# Ticket Status Transitions — who moves a ticket, when, and on whose authority

**This file is the only place the status state machine lives.** `ticket-routing.md` decides *which flow
runs* for a ticket; this file decides *what happens to the ticket's status while that flow runs*. Every
consumer **cites this file and never restates the table** — changing a rule means editing here, once.

**Owner: `qa-lead-orchestrator`** (`.claude/agents/qa-lead-orchestrator.md` §Status custodian). A status
transition is an **outward-facing write to a shared tracker**: it moves work on someone else's board,
notifies watchers, and on Jira it also gates which transitions are reachable next. So it is an
orchestration act with a single actor, exactly like dispatching a peer agent and
like the single-writer apply in `/qa-review-oracles`.

Consumers: `/qa-test` (Stage 0 opening hop, Stage 5 closing hop) · `/qa-verify-fix` · `/qa-fix` ·
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
                      │  OPENING HOP — Stage 0, the moment the `test` job resolves
                      │  no confirmation · reversible · one line if skipped
                      ▼
                 in-testing
                      │
        ┌─────────────┼─────────────┬──────────────────────┐
        │             │             │                      │
  PASS / PASS   │  FAIL       │  BLOCKED             │  (run aborted
  WITH NOTES    │             │                      │   before 5-status)
        │             │             │                      │
        ▼             ▼             ▼                      ▼
     TESTED        REOPEN     NO TRANSITION          NO TRANSITION
   (terminal —    + failures  + MANDATORY comment    + the opening hop
    never Done)   + bug links   naming the blocker     is left in place
```

## 3. The two hops

| | Opening hop | Closing hop |
|---|---|---|
| **Where** | **Stage 0, once the run is accepted** — after routing to the `test` job, preflight and the same-build re-run question, and long before the first agent is dispatched | 5-status, strictly **after** the report is posted |
| **To** | the ticket's in-testing status, discovered live | `TESTED` / `REOPEN` / nothing — §4 |
| **Confirm?** | **No.** It is the direct, reversible consequence of the operator invoking the command, and asking adds a prompt to every run for a move the operator already implied | **Yes — ask.** It is terminal for the run, it notifies watchers, and `REOPEN` hands work to another team. The one place `/qa-test` writes a verdict onto someone else's board |
| **Skip when** | tracker MCP unconfigured · already in-testing · no such transition exists · `--dry-run` | tracker MCP unconfigured · the flow is `hotfix-verify` (§6) |
| **On skip** | one line, and a `status_transitions[]` entry with `skipped: <reason>` | same |

**The asymmetry is the point.** Auto-moving *into* testing costs a reversible hop nobody objects to;
auto-moving a ticket *out* of testing publishes a verdict. Confirmation belongs where the cost is.

**Why the opening hop is at Stage 0 and not at execution, where it used to be.** *In testing* means **QA owns
this ticket now**, and that is true the moment the run is accepted — not when the first browser opens.
At execution the ticket sat in READY FOR TEST through context gathering, the strategy and preparation —
30+ minutes of real QA work during which the board showed the ticket as unclaimed, and nothing stopped a
human picking it up for real (the preflight duplicate check guards only against *this pipeline* re-testing
the same ticket inside 2 h). The
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
| `PASS` / `PASS WITH NOTES` | → **`TESTED`** | The close-out goes on: `/qa-docs` (the ticket is now Tested), the domain-map write-back, then the `/qa-test-lifecycle` question for the run's candidate and stale cases. `PASS WITH NOTES` is a PASS: the notes live in the comment, never in a different transition |
| `FAIL` | → **`REOPEN`** | The comment lists every failure and every filed bug link, **before** the transition |
| `BLOCKED` | **none — deliberately** | A **mandatory comment** naming the blocker (env / data / dependency / not-deployed), what it blocks, and that the ticket is **awaiting a re-run**. The ticket stays in-testing |
| run aborted before 5-status (STOP at a gate, operator interrupt) | **none** | The opening hop stays; say so in the chat close-out. Never "tidy up" by reversing it |

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

## 5. A re-test is a new run — one closing hop per run

A re-test on a new build is `/qa-test <TICKET>` again, not a loop inside one run: each run makes its own
opening hop (skipped when the ticket is already in-testing) and its own closing hop, and a round that ends
`BLOCKED` or is aborted leaves the ticket where §4 says. A fix-ready bug linked to the ticket is verified by
`/qa-verify-fix` — a run of its own that owns that bug's hops (§6), so the ticket under test still gets one
opening hop and one closing hop, and `qa-lead` is still the only actor (§9.1). Every hop and skip is recorded
against the key it moved (§8).

## 6. Per-flow ownership — three flows, three answers

| Flow | Who transitions |
|---|---|
| `test` | **This file** — the two hops above |
| `verify-fix` | **`/qa-verify-fix` owns its own close-out** (VERIFIED / REOPEN). `/qa-test` Stage 0 STOPs and names it, so it adds no hop of its own — two flows transitioning one ticket is how a ticket ends up moved twice for one run |
| `hotfix-verify` | **Nothing.** Stage 0 STOPs and hands off to `/qa-hotfix-check`, which owns the per-env subtasks and the parent |

`/qa-triage-results` and `/qa-monitoring` transition nothing and file nothing, by design.

## 7. Jira reachability — the opening hop is a precondition, not a courtesy

On Jira both closing transitions are reachable **only from the in-testing status**, so a run that
skipped the opening hop must do it at 5-status before closing. On **Azure Boards** `System.State` is set
directly and there is no reachability chain — but the opening hop still runs there, because its purpose
was never only reachability: it tells everyone else on the board that QA started. Discover the available
states live; if the project genuinely has no testing-like state, record
`skipped: "no in-testing state in this project"` and move on. **Never invent a state name.**

### 7a. RE-RESOLVE at the closing hop. The list fetched at Stage 0 is stale by construction.

"Resolved live" is not a property of a run, it is a property of **each hop**: the available transitions
are a function of the **current** status, so the set fetched at Stage 0 describes the status the ticket was
in *before* the opening hop and cannot name the closing ones. Re-fetch at 5-status, from the in-testing status,
and match on `to.name` there.

**Measured 2026-09-11 on VCST-5024 (Jira, VCST), the same ticket, ~30 minutes apart:**

| Fetched from | Transitions offered |
|---|---|
| `Ready for test` (at Stage 0) | Cancelled · On hold · **On QA → Testing** · go to inprogress → In progress |
| `Testing` (at 5-status) | Cancelled · On hold · **Need fixes → Reopen** · **Finish test → Tested** |

Neither closing transition exists in the first list. A run that reuses Stage 0's set at 5-status finds no
`REOPEN`-role target, and the nearest-looking candidate — *go to inprogress → In progress* — **is the
wrong state**: it is the developer's working state, not the QA handoff state, and using it loses the
"QA rejected this" signal the board reads. The correct target was `Reopen`, reachable only from
`Testing`, and it was invisible until re-fetched.

### 7b. The closing hop is effectively IRREVERSIBLE — which is what makes 5-status's "ask first" load-bearing

A re-test's opening hop back into in-testing is a new run's, **not** an undo. On the VCST
workflow there is **no transition from `Reopen` back to the in-testing status** — measured the same day,
the only transitions out of `Reopen` are `Cancelled`, `On hold`, and *take to development → In progress*.
Recovering the previous state took **three further hops** (`Reopen → In progress → Ready for test →
Testing`), each one landing in the changelog of a board other people read, so an unwanted closing hop
costs four visible state changes rather than none.

Two consequences, and the second is the reason this section exists:

- **Treat the closing hop as one-way and say so when asking.** §2's confirmation is not a courtesy for a
  reversible action; it is the last point at which the decision can be made cheaply. The asymmetry with
  the opening hop is real and is why only one of them asks: the opening hop genuinely *is* reversible
  (`Testing → Reopen → …` aside, a run that stops can leave it with a comment), while the closing hop
  is not.
- **A countermand that arrives after the call has gone out cannot be honoured by reverting.** Report the
  state the board is actually in, name the multi-hop cost, and let the operator choose — do not walk a
  shared board through three intermediate states to reach a tidier-looking history without being asked.

## 8. The record — the mechanism, not the paperwork

Every hop **and every skip** appends one entry to **`summary.json.status_transitions[]`**:

```json
{ "hop": "opening", "at": "0", "from": "READY FOR TEST", "to": "TESTING",
  "transition": "On QA", "confirmed": false, "actor": "qa-lead" }
{ "hop": "closing", "at": "5-status", "from": "TESTING", "to": null, "skipped": "verdict BLOCKED — comment posted, awaiting re-run",
  "confirmed": true, "actor": "qa-lead" }
```

`null` for the whole field means **no hop was even attempted** — which is a gap, not a clean run. An empty array means the run reached the tracker and made no move.

This is what makes the rest of the file checkable rather than aspirational: before this, a skipped
transition left **no trace at all** in any artifact, so "the ticket was never moved" and "the ticket
was moved and the note was lost" were indistinguishable after the fact. `npm run summary:validate`
enforces the shape.

## 9. Hard rules

1. **`qa-lead` is the only actor.** A specialist agent, a runner, a verifier, a doer and any sub-agent
   **never** transition a ticket — including "while they are already in there" posting a comment. A
   sub-agent that believes a transition is due **reports it up**; the orchestrator makes the move.
2. **Comment before transition, always.** `REOPEN` without the failure list, and `BLOCKED` without the
   blocker comment, are both a status change nobody can act on.
3. **Never re-grade a verdict to reach a nicer transition.** The verdict is 5-verdict's, derived from 5-triage + its own AC/DoD reconciliation;
   5-status applies it. Wanting `TESTED` is not evidence.
4. **A skip is stated in the chat close-out and recorded.** An omitted transition reads exactly like a
   successful one.
5. **Never past `TESTED`.** No `Done`, no `Cancelled`, no `Closed`, in any flow, on any tracker.
