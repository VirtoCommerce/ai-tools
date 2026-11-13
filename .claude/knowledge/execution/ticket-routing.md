# Ticket Flow Routing — type × status → job (single source of truth)

**This file is the only place the ticket→job routing matrix lives.** Given a tracker item, it decides
**which job** runs: `/qa-test` itself, or a hand-off to the command that owns the ticket's state. Every
consumer **cites this file and never restates the matrix**; changing a routing rule means editing here, once.

Consumers: `/qa-test` (Step 0, *Route* — the only router), and, by reference, the commands a route hands off
to — `/vc-fix:qa-verify-fix`, `/vc-fix:qa-fix`, `/qa-hotfix-check`, and `/qa-test-plan` (its type-scoped JQL
buckets).

> Tracker-agnostic by construction: it reads a **canonical type** and a **status role**, both normalized
> off `knowledge/execution/tracker-ops.md`, so it works identically on Jira and Azure Boards. **With no
> `project-profile.json` ⇒ Jira / VCST — the original VC-internal behaviour.**

---

## 1. One axis — the FLOW (which job)

Routing is one decision, **type × status** (§4): `verify-fix` · `hotfix-verify` · `test`. A fix-ready **Bug**
is a *verification*, not a test of a feature — it must not run `/qa-test`'s strategy, checklist and
execution machinery. Everything else is the `test` job; **how much of it runs is the strategy's call** (its
derived depth label), never an input to routing: effort, the visual lane and the contract and coverage
checks are decided in `/vc-test:qa-test-strategy`, written per round and approved once.

Record **flow + type** on the run (the `summary.json` fields `flow` and `ticket_type`; the `test` job records
`flow: "feature-test"`).

---

## 2. Normalize the TYPE (canonical set)

Resolve the raw type tracker-agnostically per `tracker-ops.md` §5a — **Jira `fields.issuetype.name`**,
**Azure Boards `System.WorkItemType`** — then map it to a **canonical type** through the profile's
`workItemTypes` open map (`project-profile.json`; empty on the native VC profile ⇒ identity; a client
aliases e.g. `Defect → Bug`, `Enhancement → Task`).

**Canonical set:** `Story` · `Bug` · `Task` · `Technical task` · `Review task` · `Sub-task` · `Epic`.

These are the project's **real** JIRA issue types (see `knowledge/execution/test-plan/sprint-mode.md` §Step 2 JQL:
`issuetype in (Task, "Technical task", Sub-task)`). **`Review task`** is real too (VCST issue type
`10181`) but is *auto-created per PR* rather than planned: a **contribution** whose description is the PR
link plus the title, with no ACs, no STR and an auto-set `Medium`. Its fields carry no planning signal, so
what a run does is derived from the PR diff by `/vc-test:ticket-context`, never from the ticket's fields.

`/qa-test` takes a **ticket key** only. A PR number, a bare feature name or several keys are not routed — the
command stops with one line.

---

## 3. Normalize the STATUS to a lifecycle ROLE (never hardcode names)

Map the ticket's status to a **role**, not a literal name — a client's tracker uses different labels.
Resolve via the 16-status map in `skills/qa-defect/defect-lifecycle-workflow.md` §2 + live discovery in
`tracker-ops.md` §Live transition discovery (Jira: match on `to.name`; Azure: `tracker.azure.stateMap`).

| Role | VC-internal statuses (illustrative — resolve live) |
|---|---|
| `fix-ready` | READY FOR TEST, TESTING |
| `hotfix-ready` | HOTFIX READY, TESTING ON STABLE |
| `not-fixed` | DRAFT, REFINEMENT, TO DO, IN PROGRESS, IN REVIEW |
| `testable` | the feature is deployed for testing (the normal Story/Task state) |

---

## 4. The FLOW matrix (type × status)

| Canonical type | Status role | **FLOW** | What runs next |
|---|---|---|---|
| **Bug** | `fix-ready` | **verify-fix** | `/vc-fix:qa-verify-fix <key>` — RED→GREEN (3×), regression, VERIFIED/REOPEN. `/qa-test` stops and names it. |
| **Bug** | `hotfix-ready` | **hotfix-verify** | `/qa-hotfix-check <key>` (the hotfix delivery/verification flow). `/qa-test` stops and names it. |
| **Bug** | `not-fixed` | **test** | Mission "reproduce and characterize": attach fresh evidence to the ticket; next step named = `/vc-fix:qa-fix <key>` (nothing to *verify* yet). |
| **Story** · **Epic** · **Task** · **Technical task** · **Review task** | any | **test** | `/qa-test`'s pipeline — context → strategy → execution → close-out. |
| **Sub-task** | any | **inherit parent** | Resolve the parent work item and re-enter this matrix as the **parent's** type × status. |

**A refactor, a migration, a dependency or runtime bump is a `test` job.** It has no row of its own: the
strategy's floors (F5) make its strategy regression-averse — it runs the blast radius, not a checklist aimed
at acceptance criteria that do not exist. Stale cases it leaves behind are not repaired by `/qa-test`; they
go to `/qa-test-lifecycle`.

---

## 6. Fail-safe defaults

Routing is fail-safe: an ambiguous ticket is **over-tested**, never skipped.

- **Type or status unresolvable** → the `test` job (never skip testing).
- **Bug marked `fix-ready` but with no STR and no linked fix PR** → do **not** force `verify-fix` (it has
  nothing to prove RED→GREEN against) → run the `test` job, noting the missing repro basis.
- **`verify-fix` still honours its own deploy gate** (`/qa-verify-fix` Step 3): if the fix isn't live it
  offers `/qa-deploy-pr` — unchanged. A route to `verify-fix` is not a claim the fix is deployed.
- **Uncertain ownership / a status role that maps to nothing** → surface it and ask; never invent a flow.
