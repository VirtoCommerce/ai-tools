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

**A SHAPE CLASS is not a type, and is resolved separately.** This set is the tracker's own vocabulary, so a
property a tracker does not model cannot be added to it. The one such property this pipeline acts on —
*the change IS the design system* — is derived from the diff at `1a` and recorded beside the type, never
instead of it: **§5c**. A ticket carries a type **and** a class; the class changes what the resolved path
produces, never which path is resolved.

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
| **Story** | any | **feature-test** | **FULL** unless the story is *narrow on every axis* — the six-token test in §5b — in which case **FAST**. A story is the unit of NEW behaviour, so FULL is the default and the burden is on the downgrade, not on the escalation. Any token unestablished ⇒ FULL (§5 doubt rule); an `UNDECLARED` surface purpose ⇒ FULL whatever the six say (§5b). |
| **Epic** | any | **feature-test** (FULL) | Full cycle; a bare Epic key → suggest `--epic` (serial child-story run). |
| **Task** | any | **feature-test** | **FULL** if cross-layer or P0/P1, else **FAST**. |
| **Technical task** | any | **feature-test** (FAST) | Refactor/config — low behavioral risk; **FULL** only if it crosses layers or is P0/P1 (fail-safe). |
| **Review task** | any | **feature-test** | A **contribution** — a fix or improvement arriving as a PR, the ticket auto-created as a wrapper (description = PR link + title; no ACs, no STR, auto-set `Medium`). Its fields carry no signal, so **effort derives from the PR diff, never the ticket fields**: **FAST** for a one-file, single-surface diff; **FULL** if it crosses layers, spans ≥2 domains, is net-new, or its **REACH exceeds its diff** (shared infrastructure that already-shipped callers also use). **Domain membership alone does NOT escalate** — on this storefront nearly every change touches a critical-revenue domain, so that test would swallow the FAST default sitting beside it (§5a). **Step 2a runs by default; there is no cross-suite sweep on either path** — §5a. |
| **Sub-task** | any | **inherit parent** | Resolve the parent work item and re-enter this matrix as the **parent's** type × status. |
| *inferred tweak/config* (PR / feature, no ticket type) | — | **feature-test** (FAST) | One-file, single-surface change. |

---

## 5. The EFFORT axis (FAST vs FULL — `feature-test` only)

Once FLOW = `feature-test`, pick the path per `commands/qa-test.md` §Pipeline. The two paths differ
**sharply** in cost, so the "What runs" column is stated here rather than left implicit — a routing file
that hides the consequence of its own decision is half a routing file:

| Path | When | What runs |
|---|---|---|
| **FAST** | Bug fix / copy-tweak / config / Technical task, a **`Review task` contribution whose PR diff is one-file and single-surface** (§5a), or a **`Story` narrow on all six tokens** (§5b); **P2–P3**, single-layer, single-domain, obvious surface. | **A checklist.** `1a`+`1b` → Artifact B checklist (written to the ticket folder) → the inline `3-exec` gate → one execution agent → `5a`–`5f`, then `5h` documentation. **No `1r` reachability pass** — FAST reaches execution in minutes, so a separate probe would cost more than the wait it removes. **No** change-scoped Critical sweep — `5r`/C2 was removed from the pipeline entirely on 2026-09-10, on both paths; cutting a release means running `/qa-regression` deliberately (§5a argues why, for `Review task` first and then for every type). **No** `1c`/`1d` agents, **no** Test Model, **no** archetype/UIP/`VC-*` sweeps, **no** case authoring, **no** independent verifier. Three of the six derived axes (visual · contract · coverage) are **opt-in** here (`--visual` / `--contract` / `--coverage` / `--axes`) and run in full on FULL — with one per-type exception, a `Review task`, whose `coverage` defaults **ON** (§5a); `layer`, `data_surface` and `domain_map` derive and apply on both paths, none being able to add an agent. |
| **FULL** | New feature / **Story** (the default — downgraded only per §5b) / Epic; **P0–P1**; cross-layer; ≥2 domains; critical-revenue flow; unclear surface. | The whole pipeline: `1r` ‖ `1c` ‖ `1d` → **Test Model (required)** → `3x` discovery ‖ `3a` seeding → the checklist, written from what discovery returned → **`3-exec` releases execution while case authoring continues in the background** → two hard-STOP verifier gates (`3-cases`, `5b`). Cases are left at `Draft`; promotion is a later `/qa-test-lifecycle` pass. |

**When in doubt → FULL.** A real regression is worse missed than a fast run saved; FAST’s own conditions
(P2–P3 **and** single-layer **and** single-domain **and** obvious surface — **and** all six §5b tokens for
a Story) have to *hold* rather than merely go uncontradicted, so a doubt means one of them is unestablished
and FAST’s gate is unmet; and every other doubt-rule in this repo points at the safe side (G0 *BAIL*, a
reviewer’s *REQUEST_CHANGES*, the Technical-task row above marked *(fail-safe)*). It is the EFFORT instance
of §6’s fail-safe principle.

> **This is the only place the EFFORT tie-break is stated.** `commands/qa-test.md` §Routing,
> `skills/qa-test/SKILL.md` §Effort routing and `docs/qa-test-flow.md` **cite** this line and do not
> restate it — deliberately, and recently: for one day in 2026-09 this file said *"FAST"* while all three
> of them said *"FULL"*, and nothing detected it, because a rule with four copies has no diff that reads as
> a change. Cite it; never paste it. Incident record:
> [`docs/decisions/qa-test-evolution.md`](../../../docs/decisions/qa-test-evolution.md) §The EFFORT
> tie-break.

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
cross-suite half, C2, no longer exists at all, see below. The third is **Step 2a**, whose `REPAIR` / `RE-BASE` dispositions are precisely *"an existing row
is now wrong"* — and on FAST that step sits behind the opt-in `--coverage` axis. For a contribution that
gate is backwards: a fix or improvement changes behaviour existing rows already assert, so *which rows
does this make wrong* is the ticket's subject rather than a speculative extra. **So `coverage_surface`
derives and Step 2a RUNS by default for this type**, on FAST as on FULL
([`skills/qa-test/axes.md`](../../skills/qa-test/axes.md) §4).

`visual` and `contract` stay opt-in here exactly as on any other FAST run. And Step 2a **authors
nothing** — it repairs and re-bases rows that already exist; new-case authoring (Artifact A) and the
promotion stay FULL-only, so a Review task that stays FAST adds **no new** regression coverage. A
contribution that genuinely needs a durable new case is itself a reason to route FULL (§5).

**So the shape for this type is: checklist + Step 2a, and no cross-suite sweep at all.**

> **This section argued C2's opt-in for `Review task`. The opt-in became the FAST-wide rule on
> 2026-09-09, and on 2026-09-10 the sweep was REMOVED from `/qa-test` on both paths** (§4 above, and
> `docs/decisions/qa-test-evolution.md` §Removing 5r and 5g). Every clause below turned out to be
> type-independent — the verdict comes from 5c, C2 could only amend it, and the sweep answers a release
> question the ticket did not ask — and the one type-specific clause (a contribution's diff is small) was
> never the load-bearing one. What settled it is FAST's own stated promise, *"FAST is one execution
> agent"*: C2 dispatched a whole suite selection, measured by the 2026-09-07 audit at ~24 runner
> dispatches / ~3.08M tokens — 93% of a FAST run's total, for a track whose findings 5a's provenance rules
> classify as PRE-EXISTING or OUT-OF-SCOPE, neither of which fails the ticket. **Two narrowings did not fix
> that; the third was deletion.** The argument is kept here because it is the reasoning a future proposal
> to re-add a cross-suite sweep to this pipeline has to answer. This began as item 10 of
> `docs/agentic-system-audit-2026-09-07.md` §6 (`--release-sweep` there).

| Runs by default | Opt-in | Not on FAST at all |
|---|---|---|
| Artifact B checklist · **Step 2a** (`coverage`) · C1 when Step 2a leaves `RE-BASE` ids | `visual` · `contract` | Artifact A authoring · `1c`/`1d` · the Test Model · the independent verifier · **the change-scoped Critical sweep, which no longer exists on either path** |

**Why the cross-suite sweep is gone entirely.** It answered *did this change break anything else* — a
**release** question, consumed by the Feature Release Gate at 5e — and it never produced the verdict: 5c
derives that from the checklist plus the AC/DoD reconciliation, and an IN-SCOPE finding from a sweep could
only *amend* it (§Execution order of [`commands/qa-test.md`](../../commands/qa-test.md)). For a
contribution it routinely spent a ~40-minute Critical pass over a whole domain answering a question the
ticket did not ask.

**Two consequences, stated rather than discovered.** A `/qa-test` run carries **no release
recommendation** — 5e reports the ticket verdict and records the gate as `not-assessed`, **never as a
pass, and never by substituting C1's number**, which answers a different question. And that is written
into `summary.json.regression` **and** the checklist, because an omitted regression track reads exactly
like a passing one (the §1 rule of [`skills/qa-test/SKILL.md`](../../skills/qa-test/SKILL.md): silence is
never an answer).

**When the change's blast radius exceeds its diff, run the sweep deliberately** —
[`/qa-regression`](../../commands/qa-regression.md) with `regression:select … --target 40` then
`--cases critical`. That is the case for it: a change in **shared infrastructure** (an Apollo link, a
composable, a UI-kit primitive) that already-shipped callers also use, or a diff landing in a domain whose
oracle carries P0 invariants the change could disturb. Reach, not diff size, is the test.


### 5b. `Story` — the six tokens that downgrade one, and the surface that refuses the downgrade

A story is the unit of **new behaviour**, which is why FULL is its default and why this section is a
downgrade test rather than an escalation test. But *"Story"* is a planning label, not a size: a story that
retitles one control on one page pays for two `1` agents, a twelve-clause Test Model, case authoring and
four verifier dispatches, and nothing in the type tells you which kind you have. So effort derives from
the **scope**, exactly as §5a already derives a `Review task`'s from its diff rather than its fields.

**All six must hold.** Any one that is contradicted — or merely *unestablished* — sends the story to FULL
under §5's doubt rule, which is what makes a conjunction safe to write down:

| Token | FAST needs | Where it resolves |
|---|---|---|
| priority | **P2–P3** | `1a` ticket field |
| `layer` | single-layer | `1b` item 2b |
| domains | exactly one | `1a` scope classification |
| chain shape | **refines an existing mechanism** — adds no NEW chain link | `1a` ACs; a net-new link is a net-new feature and §5 already routes those FULL |
| surface | obvious — named, deployed, reachable | `1a`/`1b` |
| reach | does **not** exceed the diff | `1a` PR diff when the story has one; **no diff ⇒ unestablished ⇒ FULL** |

**Reach, not diff size** — the same test §5a ends on: 20 lines inside a shared Apollo link is a wider
blast radius than 300 inside one page component. **And domain membership alone does NOT escalate**, for
§5a's reason: on this storefront nearly every change touches a critical-revenue domain, so that test
would swallow the downgrade sitting beside it.

**`1a`'s FAST is PROVISIONAL for a Story; `1b` confirms it, and can only ever escalate.** Two of the six
tokens (`layer`, and the surface read) resolve at `1b`, after `1a` has already had to name a path. That
is safe rather than sloppy because **`1b` is identical on both paths** and the fork is immediately after
it — nothing FULL-only has been skipped yet when the confirmation lands. State the provisional route at
`1a`, confirm or escalate it in one line at the end of `1b`, and record both in
`summary.json.path_route` (`decided_at` · `provisional` · the six `narrow_story_tokens` · `escalated_reason`). The movement is one-way: FAST→FULL only.

**The refusal that outranks all six: an `UNDECLARED` surface purpose ⇒ FULL.** `1b` item 2-map reads the
prior art and reports whether this surface's **purpose and reverse edges** are declared. They live in
exactly one artifact — a Test Model **Part 0** — and a Story is the only thing that ever writes one
(measured: 1 of 13 domains has a declared purpose). So a narrow story on an **undeclared** surface is
precisely the run that must not take FAST: it is the only step that would have declared the surface, and
FAST defers that indefinitely while looking like a saving. On a surface whose Part 0 already exists the
story is refining a known mechanism and its new model carries that Part 0 forward
(`skills/qa-test/test-model.md` §Why it is a durable file) — there, FAST is honest.

**Say what the downgrade costs, in the run's own words.** A Story on FAST authors **no test cases** and
builds **no model**, so the story's behaviour gets no durable regression coverage from this run and the
route back is `/qa-test-lifecycle` (§5, first consequence). A story that genuinely needs a durable case
is itself a reason to take FULL.


### 5c. `ui-kit` — the SHAPE CLASS that changes the deliverable, not the effort

The two sections above derive an **effort** from a type. This one derives nothing about effort at all: it is
a **third classifier**, resolved at `1a` alongside the type and recorded beside it, and it answers a
different question — *is the thing under test a feature on a surface, or the surface itself?*

**It applies only within the `feature-test` flow**, exactly as EFFORT does (§1). A `verify-fix` or
`hotfix-verify` run authors nothing, so there is nothing here for the class to change.

**Detection — derived, never asked** (the `axes.md` §2 contract). Affirmative signals: a diff under the UI
kit (`client-app/ui-kit/**`), a design-token partial (`_ui-kit-tokens.scss`, `_colors.scss`, `_dark.scss`,
`preflight.scss`), a theme-preset JSON (`client-app/assets/presets/*.json`), Storybook config or styles
(`.storybook/**`, `storybook-styles/**`, `*.stories.*`); a ticket naming a kit primitive, a design token, or
a WCAG criterion with no single owning page; or **a removed or renamed public custom property**, which puts
the reach beyond the diff by construction.

**It fails CLOSED — `unresolved` ⇒ NOT `ui-kit`, author as normal.** This inverts §6's usual direction and
the inversion is the point. Every other classifier here asks *should we also do X?*, so doubt widens the
run; this one **subtracts** — it removes Artifact A, the `3-cases` gate and `4c`/C1 — so a wrong `true`
deletes durable coverage from a run that needed it. That is the defect
[`axes.md`](../../skills/qa-test/axes.md) §3 diagnoses for `data_surface`, read backwards: a classifier that
*skips authoring* whenever it is unsure is not saving anything, it is guessing. The class needs positive
signals. Its **lane** half is unaffected: `visual_surface` keeps its own fail-open rule, so a run that
cannot establish the class still gets the visual pass it would have had anyway.

| Runs by default | Opt-in | Not run at all |
|---|---|---|
| Artifact B checklist · **`visual`** · **`coverage`** (Step 2a) · everything else the resolved path already runs — `1c`/`1d`/`1e`, `3x`, Step 4, Step 5, and **`5b` stays a hard STOP** | `contract` | **Artifact A** · the **`3-cases`** gate · **`4c`/C1** — on FULL as on FAST |

**The deliverable is Artifact B and executing it.** Say in one line that the run adds **no durable
regression coverage** and that `/qa-test-lifecycle` is the route back in; record `C1: skipped — no authored
cases` and `feature_release_gate: not-assessed` explicitly, never as a blank regression block. With Artifact
A gone the checklist is the run's **only** durable record, which raises what that artifact must carry —
[`ui-kit-class.md`](../../skills/qa-test/ui-kit-class.md), the class's methodology, which this file does not
restate.

**Why `visual` defaults ON: this class is the measured case the axis was waiting for.**
[`visual-axis.md`](../../skills/qa-test/visual-axis.md) §5 argues that *"the change class most likely to
break the UI is exactly the class FAST routes"* and then declines to act on it, correctly, for want of
evidence. Here the evidence exists: the change is the rendered surface, and a functional checklist cannot
see a contrast failure or a token collision by construction.

**Why `coverage` defaults ON — and the evidence is thinner, so both halves are recorded.** The §5a argument
transfers: a kit change alters behaviour existing rows already assert, so *which rows does this make wrong?*
is the ticket's subject rather than a speculative extra. **The one measured run contradicts it on yield** —
62 rows examined, **62 KEEP, 0 REPAIR, 0 RE-BASE**. `axes.md` §4's *revisit at 5+ runs* rule therefore
applies to this default in particular: it is a decision, not a finding.

**What that run DID establish is a scoping correction, and it is binding.** For this class **Step 2a may not
be scoped by `--domain` alone** — a token-layer change has no domain, so that axis selects by the wrong
vocabulary and the miss reads as coverage. Pair `tc:scope` with a corpus-wide pass and record the literal
invocation. The rule, and the measurement behind it, are
[`coverage-triage.md`](../../skills/qa-test/coverage-triage.md)'s — it owns `tc:scope`.

**Scope the run to the change's BLAST RADIUS, not to kit files.** The kit's consumers — payment wrappers,
checkout controls, sales-rep blocks — are where a kit regression is actually seen; the kit's own files are
where it is written. **vc-shell / Vendor Portal is excluded**: a separate product with its own hosted
Storybook, which is precisely why the exclusion must be explicit (`ui-kit-class.md` §11).

---

## 6. Fail-safe defaults

Routing is fail-safe: an ambiguous ticket is **over-tested**, never skipped. The EFFORT axis's own
instance of this — *when in doubt → FULL* — is stated once, at §5.

- **Type or status unresolvable** → `feature-test` at **FULL** (never skip testing).
- **`Story` whose narrowness cannot be established** (a token unresolved, no diff to judge reach by, or an
  `UNDECLARED` surface purpose) → **FULL**. The downgrade in §5b is a conjunction of six positive
  findings, never the absence of a reason to escalate.
- **Bug marked `fix-ready` but with no STR and no linked fix PR** → do **not** force `verify-fix` (it has
  nothing to prove RED→GREEN against) → fall to `feature-test`, noting the missing repro basis.
- **`verify-fix` still honours its own deploy gate** (`/qa-verify-fix` Step 3): if the fix isn't live it
  offers `/qa-deploy-pr` — unchanged. A route to `verify-fix` is not a claim the fix is deployed.
- **Shape class unestablished** → **NOT `ui-kit`**; author cases as normal. The one classifier here that
  fails *closed*, because it is the one that SUBTRACTS — the reasoning is §5c's, and it is the exception
  that makes the rest of this list's direction meaningful rather than reflexive.
- **Uncertain ownership / a status role that maps to nothing** → surface it and ask; never invent a flow.
