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

**Canonical set:** `Story` · `Bug` · `Task` · `Technical task` · `Review task` · `Sub-task` · `Epic`.

These are the project's **real** JIRA issue types (see `commands/qa-test-plan.md` §Step 2 JQL:
`issuetype in (Task, "Technical task", Sub-task)`). **`Review task`** is real too (VCST issue type
`10181`) but is *auto-created per PR* rather than planned, so it never appears in a sprint-scoped JQL
bucket and its fields carry no planning signal — §5a. For a **PR or bare feature name** there is no ticket
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
| **Review task** | any | **feature-test** | A **contribution** — a fix or improvement arriving as a PR, the ticket auto-created as a wrapper (description = PR link + title; no ACs, no STR, auto-set `Medium`). Its fields carry no signal, so **effort derives from the PR diff, never the ticket fields**: **FAST** for a one-file, single-surface diff; **FULL** if it crosses layers, spans ≥2 domains, is net-new, or touches a critical-revenue flow (fail-safe). **Step 2a runs by default; C2 is opt-in** — §5a. |
| **Sub-task** | any | **inherit parent** | Resolve the parent work item and re-enter this matrix as the **parent's** type × status. |
| *inferred tweak/config* (PR / feature, no ticket type) | — | **feature-test** (FAST) | One-file, single-surface change. |

---

## 5. The EFFORT axis (FAST vs FULL — `feature-test` only)

Once FLOW = `feature-test`, pick the path per `commands/qa-test.md` §Pipeline. The two paths differ
**sharply** in cost, so the "What runs" column is stated here rather than left implicit — a routing file
that hides the consequence of its own decision is half a routing file:

| Path | When | What runs |
|---|---|---|
| **FAST** | Bug fix / copy-tweak / config / Technical task, or a **`Review task` contribution whose PR diff is one-file and single-surface** (§5a); **P2–P3**, single-layer, single-domain, obvious surface. | **A checklist.** `1a`+`1b` → Artifact B checklist (written to the ticket folder) → one execution agent → `5a`–`5f`, then `5h` documentation. The change-scoped Critical sweep (**C2**) runs at **`5r`, after the verdict** — it answers a release question, not a ticket one. **No** `1c`/`1d` agents, **no** Test Model, **no** archetype/UIP/`VC-*` sweeps, **no** case authoring, **no** `5g` promotion, **no** independent verifier. Three of the five derived axes (visual · contract · coverage) are **opt-in** here (`--visual` / `--contract` / `--coverage` / `--axes`) and run in full on FULL — with one per-type exception, a `Review task`, whose `coverage` defaults **ON** (§5a); `layer` and `data_surface` derive and apply on both paths, neither being able to add an agent. |
| **FULL** | New feature / Story / Epic; **P0–P1**; cross-layer; ≥2 domains; critical-revenue flow; unclear surface. | The whole pipeline: `1c` ‖ `1d` → **Test Model (required)** → case authoring → three hard-STOP verifier gates → `5g` promotion. |

**When in doubt → FULL.**

Two consequences of the FAST cut, stated so they are chosen rather than discovered:

- **A FAST run authors no test cases**, so a bug fix stops contributing regression coverage through
  `/qa-test`. `/qa-test-lifecycle` remains the way to add cases. A fix that genuinely needs durable
  regression protection is itself a reason to route FULL.
- **The Test Model is mandatory on FULL** — it is what makes a story's context understandable and its
  documentation adequate, which is a need a P2 config tweak does not have.

**The one thing FAST does NOT drop: the visual lane.** A UI-visible ticket runs the design + accessibility
pass on **both** paths. This is a third axis, orthogonal to flow and effort, and it is decided by the
`visual_surface` token `/qa-test` §1b item 2c derives — **not** by this matrix, because it is a *lane*
trigger, not an *effort* trigger: it never promotes FAST to FULL. The reason it survives the FAST cut when
everything else was dropped is that the cut and the risk point in opposite directions here — a `.scss`-only
PR, an icon migration or a P2 restyle is *single-layer, single-domain, obvious surface, P2* by construction,
so **the change most likely to break the UI is the one this row routes**, and a functional checklist cannot
see a contrast failure or a token collision. Spec:
[`skills/qa-test/visual-axis.md`](../../skills/qa-test/visual-axis.md).

---

### 5a. `Review task` — the one type that defaults an axis ON

A `Review task` is a **contribution**: a fix or an improvement, authored as a PR, with the tracker item
auto-created as a wrapper around it. Two properties follow, and together they decide what a run needs.

**Its ticket fields carry no signal.** The description is the PR link plus the title, the priority is
auto-set `Medium`, and there are no ACs, no STR, no attachments and usually no comments. So the
`P0–P1 → FULL` escalation every other FAST row leans on **can never fire for this type** — the only
honest effort signal is the PR diff, which is why the §4 row reads that instead.

**What these runs need is a checklist, a scoped regression, and — often — an UPDATE to existing test
cases.** The first is what FAST already is (Artifact B); the second is C1 for any `RE-BASE` ids — the
cross-suite half, C2, is **opt-in** for this type, see below. The third is **Step 2a**, whose `REPAIR` / `RE-BASE` dispositions are precisely *"an existing row
is now wrong"* — and on FAST that step sits behind the opt-in `--coverage` axis. For a contribution that
gate is backwards: a fix or improvement changes behaviour existing rows already assert, so *which rows
does this make wrong* is the ticket's subject rather than a speculative extra. **So `coverage_surface`
derives and Step 2a RUNS by default for this type**, on FAST as on FULL
([`skills/qa-test/axes.md`](../../skills/qa-test/axes.md) §4).

`visual` and `contract` stay opt-in here exactly as on any other FAST run. And Step 2a **authors
nothing** — it repairs and re-bases rows that already exist; new-case authoring (Artifact A) and `5g`
promotion stay FULL-only, so a Review task that stays FAST adds **no new** regression coverage. A
contribution that genuinely needs a durable new case is itself a reason to route FULL (§5).

**So the shape for this type is: checklist + Step 2a, with C2 OPT-IN.**

| Runs by default | Opt-in | Not on FAST at all |
|---|---|---|
| Artifact B checklist · **Step 2a** (`coverage`) · C1 when Step 2a leaves `RE-BASE` ids | **C2**, the change-scoped Critical sweep (`--release-regression`) · `visual` · `contract` | Artifact A authoring · `1c`/`1d` · the Test Model · `5g` promotion · the independent verifier |

**Why C2 comes off the default.** C2 answers *did this change break anything else* — a **release**
question, consumed by the Feature Release Gate at 5e — and it never produced the verdict: 5c derives
that from the checklist plus the AC/DoD reconciliation, and an IN-SCOPE C2 finding can only *amend* it
(§5r of [`commands/qa-test.md`](../../commands/qa-test.md)). For a contribution the sweep routinely
spends a ~40-minute Critical pass over a whole domain answering a question the ticket did not ask.

**Two consequences, stated rather than discovered.** The run then carries **no release
recommendation** — 5e reports the ticket verdict and records the gate as `not-assessed (C2 skipped)`,
**never as a pass**. And the skip is written into `summary.json.regression` **and** the checklist,
because an omitted regression track reads exactly like a passing one (the §1 rule of
[`skills/qa-test/SKILL.md`](../../skills/qa-test/SKILL.md): silence is never an answer).

**Turn C2 back on when the contribution's blast radius exceeds its diff** — a change in **shared
infrastructure** (an Apollo link, a composable, a UI-kit primitive) that already-shipped callers also
use, or a diff landing in a domain whose oracle carries P0 invariants the change could disturb. Both
tests are about the *reach* of the change, never the size of the diff: 20 lines inside a shared link
is a wider blast radius than 300 lines inside one page component.

---

## 6. Fail-safe defaults

Routing is fail-safe: an ambiguous ticket is **over-tested**, never skipped.

- **Type or status unresolvable** → `feature-test` at **FULL** (never skip testing).
- **Bug marked `fix-ready` but with no STR and no linked fix PR** → do **not** force `verify-fix` (it has
  nothing to prove RED→GREEN against) → fall to `feature-test`, noting the missing repro basis.
- **`verify-fix` still honours its own deploy gate** (`/qa-verify-fix` Step 3): if the fix isn't live it
  offers `/qa-deploy-pr` — unchanged. A route to `verify-fix` is not a claim the fix is deployed.
- **Uncertain ownership / a status role that maps to nothing** → surface it and ask; never invent a flow.
