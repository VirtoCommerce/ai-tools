# Ticket Flow Routing — type × status → flow (single source of truth)

**This file is the only place the ticket→flow routing matrix lives.** Given a tracker item, it decides
**which QA flow** should run — not merely how much effort. Every consumer **cites this file and never
restates the matrix**; changing a routing rule means editing here, once.

Consumers: `/qa-test` (§1a — the primary router), and, by reference, the commands a route hands off to —
`/qa-verify-fix`, `/qa-fix`, `/qa-hotfix-check`, and `/qa-test-plan` (its type-scoped JQL buckets).

> Tracker-agnostic by construction: it reads a **canonical type** and a **status role**, both normalized
> off `knowledge/execution/tracker-ops.md`, so it works identically on Jira and Azure Boards. **With no
> `project-profile.json` ⇒ Jira / VCST — the original VC-internal behaviour.**

---

## 1. Two axes — FLOW first, then EFFORT

Routing is two decisions, in order:

1. **FLOW** (which pipeline): `verify-fix` · `hotfix-verify` · `feature-test`. Decided by **type × status**
   (§4). A fix-ready **Bug** is a *verification*, not a feature test — it must not run the feature-test
   authoring/promotion machinery.
2. **EFFORT** (how much of the pipeline): `FAST` · `FULL`. Applies **only** to the `feature-test` flow
   (§5). `verify-fix` and `hotfix-verify` have their own fixed shape and ignore this axis.

Record **flow + type + path** on the run (they are `summary.json` fields — `flow`, `ticket_type`, `path`).

---

## 2. Normalize the TYPE (canonical set)

Resolve the raw type tracker-agnostically per `tracker-ops.md` §5a — **Jira `fields.issuetype.name`**,
**Azure Boards `System.WorkItemType`** — then map it to a **canonical type** through the profile's
`workItemTypes` open map (`project-profile.json`; empty on the native VC profile ⇒ identity; a client
aliases e.g. `Defect → Bug`, `Enhancement → Task`).

**Canonical set:** `Story` · `Bug` · `Task` · `Technical task` · `Sub-task` · `Epic`.

These are the project's **real** JIRA issue types (see `commands/qa-test-plan.md` §Step 2 JQL:
`issuetype in (Task, "Technical task", Sub-task)`). For a **PR or bare feature name** there is no ticket
type — infer it from diff size + surface (a one-file single-surface change is a *tweak*, routed like a
FAST bug fix; anything net-new/cross-layer is a *feature*).

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
| **Bug** | `fix-ready` | **verify-fix** | Run `/qa-verify-fix` **inline** — RED→GREEN (3×), regression, VERIFIED/REOPEN. Feature-test Steps 2–5 (authoring/AC-reconcile/promotion) are skipped. |
| **Bug** | `hotfix-ready` | **hotfix-verify** | STOP with a pointer to `/qa-hotfix-check <key>` (the hotfix delivery/verification flow). |
| **Bug** | `not-fixed` | **feature-test** (FAST) | Reproduce/characterize live, attach fresh evidence to the ticket; state next = `/qa-fix <key>` (nothing to *verify* yet). |
| **Story** | any | **feature-test** (FULL) | The full five-step cycle. |
| **Epic** | any | **feature-test** (FULL) | Full cycle; a bare Epic key → suggest `--epic` (serial child-story run). |
| **Task** | any | **feature-test** | **FULL** if cross-layer or P0/P1, else **FAST**. |
| **Technical task** | any | **feature-test** (FAST) | Refactor/config — low behavioral risk; **FULL** only if it crosses layers or is P0/P1 (fail-safe). |
| **Sub-task** | any | **inherit parent** | Resolve the parent work item and re-enter this matrix as the **parent's** type × status. |
| *inferred tweak/config* (PR / feature, no ticket type) | — | **feature-test** (FAST) | One-file, single-surface change. |

---

## 5. The EFFORT axis (FAST vs FULL — `feature-test` only)

Once FLOW = `feature-test`, pick the path per `commands/qa-test.md` §Pipeline:

| Path | When |
|---|---|
| **FAST** | Bug fix / copy-tweak / config / Technical task; **P2–P3**, single-layer, single-domain, obvious surface. |
| **FULL** | New feature / Story / Epic; **P0–P1**; cross-layer; ≥2 domains; critical-revenue flow; unclear surface. |

**When in doubt → FULL.**

---

## 6. Fail-safe defaults

Routing is fail-safe: an ambiguous ticket is **over-tested**, never skipped.

- **Type or status unresolvable** → `feature-test` at **FULL** (never skip testing).
- **Bug marked `fix-ready` but with no STR and no linked fix PR** → do **not** force `verify-fix` (it has
  nothing to prove RED→GREEN against) → fall to `feature-test`, noting the missing repro basis.
- **`verify-fix` still honours its own deploy gate** (`/qa-verify-fix` Step 3): if the fix isn't live it
  offers `/qa-deploy-pr` — unchanged. A route to `verify-fix` is not a claim the fix is deployed.
- **Uncertain ownership / a status role that maps to nothing** → surface it and ask; never invent a flow.
