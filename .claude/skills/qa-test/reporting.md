# Steps 5e · 5f · 5h — report, transition, publish

> **MANDATORY — screenshots go INLINE in the comment.** A UI claim posted without its image embedded is not delivered: Markdown `![](path)` and prose file paths both post `200 OK` and render nothing. Attach, then reference `!file.png|width=700!` via the **v2** comment API, then VERIFY from `?expand=renderedBody` (one `<img …/attachment/content/N>` per image, zero surviving `!….png!`, zero `<span class="error">`). Mechanism + the ADF dead ends: `knowledge/execution/tracker-ops.md` §5c. Policy + the verification gate: `.claude/rules/reports.md` §5.0. A non-visual claim says so explicitly rather than silently shipping no image.


Split out of [`close-out.md`](close-out.md), which keeps the close-out spine (5b · 5c · 5r · 5d) and cites
this file. Read it when the verdict exists and the run has to be **delivered**: the Feature Release Gate,
the tracker comment, `summary.json`, the checklist, the chat report, the status transition, and the
per-ticket documentation.

**The order is fixed and each step depends on the one before it:** 5e reports (and is what *publishes* the
verdict 5c recorded), 5f transitions **after** the report, 5h documents **after** the transition. Promotion
(5g) runs last of all and is in [`promotion.md`](promotion.md).

## 5e. Report

### 0. Resolve the release-note fields

Done **first**, because 5e.2's comment carries a mandatory `Release note:` line and 5e.3 persists the
block — both of which need these values. The **layer itself is not decided here**: it was derived at `1b`
item 2b and is read from `summary.json.layer`. What 5e.0 resolves is everything downstream of it:

- **`audience` is derived from the layer**, per `.claude/knowledge/ba/virto-doc-style.md` §9.1 — never a
  choice made here.
- **Versions come from `build.deployed`** (probed), never from `build.relevant_modules` (declared git
  state) and never from the release ledger, which records what shipped **upstream**. `UNKNOWN` is legal;
  a guess is not, and a version that cannot be resolved sets `refusal: "no-version"`.
- **`breaking` is true only** from `build.releasedThrough.breaking[]` or a cited contract change in the
  diff, with the citation in `breaking_source`. Never from ticket, PR or commit prose.
- **Refuse rather than pad.** `refusal` ∈ `verdict-not-pass` · `layer-unresolved` · `not-deployed` ·
  `not-user-visible` · `no-version`. A pure refactor with nothing a user can observe is a legitimate
  `not-user-visible`, not a thin note. A refusal is an outcome, not a failure.

The **pointer** that hands these to `/ba-analyze` is 5f §Release note — after the report, with the
transition, because it is a next-step hand-off rather than a value to compute.
### 1. Feed and independently ratify the Feature Release Gate

**`--iterate`: AT LOOP EXIT only.** There is one release, so there is one recommendation. Do **not**
ratify per round: a FAIL round is an automatic NO-GO the loop has *already acted on* by starting another
round, so ratifying it emits N−1 recommendations about builds that no longer exist.

The 5c verdict is the primary input to the **Feature Release Gate**
(`.claude/skills/qa-metrics/quality-gates.md` §1a), owned by `qa-lead-orchestrator`. **`/qa-test` does not
decide release.**

A PASS/PASS-WITH-NOTES run **feeds a GO** only if the team-level criteria also hold: 0 open P0, **0 open
undeferred P1/High**, change-scoped regression ≥80% — **C2's pass rate, produced at 5r** and recorded as `regression.pass_rate`; when C2 was skipped, ratify without it and say so rather than substituting C1's number, which answers a different question, NFRs clean,
smoke PASS. A FAIL/BLOCKED is an automatic NO-GO.

Two things about the bug ledger and the run, because both changed on 2026-09-02:

- **An open High blocks — it no longer downgrades on its own.** Either 5d's fix landed, or the High is
  **declared** deferred: `--p1-deferred N` asserts N of them carry a documented workaround + signed risk
  acceptance + a monitoring plan. A declared deferral caps the gate at **CONDITIONAL GO**, never a clean
  GO. Report the declared count in the 5e comment; an undeclared High is a NO-GO, not a note.
- **Report the run's COMPLETENESS, not only its pass rate** (§0). BLOCKED sits outside the pass-rate
  denominator, so the rate rises as blockers accumulate; >10% of planned BLOCKED-and-untriaged returns
  **CANNOT EVALUATE** (exit 2). Triage via `/qa-triage-results` and pass `--blocked-triaged N`, or re-run
  the blocked cases. If the Artifact-C run was deferred or skipped, say so — the gate cannot be evaluated
  on a null pass rate, and NOT EVALUATED is neither a pass nor a failure.

**Independent verification (FULL):** a fresh `qa-lead` verifier re-evaluates §1a from the raw inputs — the
5c verdict, the `reports/bugs/` open-P0/P1 ledger (now current, since 5d already filed), the regression pass
rate via
`npx tsx scripts/regression/compute-metrics.ts --gate feature --run-id <regression.run_id> --p0-bugs N
--p1-bugs N [--p1-deferred N] [--blocked-triaged N]`
(`--run-id` **required**; `--suites <ids>` is the fallback), and the smoke result — and ratifies or
**downgrades**. Recommendation only; a human decides release.

### 2. Post the tracker comment (before the status transition — that is 5f)

Markdown, never wiki markup; outcome-first, evidence referenced not inlined
(`.claude/knowledge/execution/tracker-ops.md` §5a):

```
QA Complete — [X] cases, [Y] passed, [Z] failed.
AC review: [N] story ACs ([weak]/[ok]), [M] gap-ACs; AC↔impl: [satisfied]/[drift]/[contradicts]/[not-found]. AC coverage: [pct]%.
DoD: [met]/[total] ([pct]%), or "none stated".
Change-scoped regression: [suite IDs] — [pass rate] ([RUN_ID]).
Regression triage: [N] confirmed bugs, [M] test-case fixes applied, [K] dismissed.
App Insights (test window): [N] correlated — [confirmed/needs-review/none].
Business rules verified: [BL-* list]. Bugs: [list, with relationship — sub-task/linked/standalone — or None].
Not filed (below severity floor): [N] Low — [one line each + reports/bugs/open/low/<file>.md], or None.
Release gate: [GO/CONDITIONAL GO/NO-GO recommendation]. Decision: [verdict].
Release note: [<layer>/<audience> — /ba-analyze docs release <ticket-key>], or "none — <refusal>".
Evidence: reports/tickets/{SPRINT}/<ticket-key>/screenshots/
```

The `Release note` line is **mandatory too, and says `none — <refusal>` when there is no fragment** —
the person reading the tracker is the one who will later run the aggregate, so a silent omission there
costs a ticket nobody knows to include.

The `Not filed` line is **mandatory and says `None` when there are none** — an omitted line is
indistinguishable from a run that found no Low issues.

**`--iterate`:** this full template is posted **once, at loop exit**. Rounds 1…N−1 post the much
shorter **round delta** instead ([`modes.md`](modes.md) §5k §The round-delta comment) — the full
template every round buries the ticket under near-identical comments, while posting nothing leaves a
prerelease deployed to the shared test env with no trace. The delta carries the same mandatory
`Not filed` accounting.

### 3. Persist `summary.json`

Write `reports/tickets/{SPRINT}/<ticket-key>/summary.json` per
[`.claude/templates/qa-test-summary.schema.json`](../../templates/qa-test-summary.schema.json): `path`, the
AC-analysis + `ac_dod_estimate` block, counts, the **`regression`** block (**both `c1` and `c2`** — two
runs, two `run_id`s; the release gate is defined on `c2`'s) and `regression_triage`, `bugs_filed`
with relationship + severity, `bugs_not_filed`, the `promotion` block for 5g, the **`timing`** block,
**`layer`** (derived at `1b` item 2b) plus the **`release`** block resolved at 5e.0, and the four derived-axis
blocks — **`visual`** (2c), **`contract`** (2d), **`coverage_triage`** (2e + Step 2a) and **`discovery`**
(Step 3x). In each of those, `null` means the axis **never ran**, which is not the same fact as an empty
array. The **`documentation`** block is the one field written later — at **5h**, after the transition —
because it records an action that has not happened yet at this point.

**Then validate it, because nothing used to.** The schema above was the declared contract and was cited by
five files while **no script checked it**, so the live artifacts drifted into incompatible shapes — the
same field under three spellings, one run carrying 40 top-level keys against another's 27.

```bash
npm run summary:validate          # ratcheted: a file may not get worse than its baseline
```

It reports unknown keys (`SUM-003`), alias spellings of a declared field (`SUM-002`), absent required keys
(`SUM-001`) and wrong JSON types (`SUM-004`). **Fix the finding rather than re-baselining it** —
`npm run summary:validate:baseline` exists for a field that was genuinely, deliberately added, and running
it to silence a mistake is how the drift got here.

**`--iterate`: written PER ROUND**, at the end of every round, with that round appended to
`iterations.per_round[]` — the loop can STOP at any round (G0 BAIL, BLOCKED, the cap, a dropped session),
and a history persisted only on a clean exit is missing exactly when it is needed.

**`timing` is not bookkeeping.** The 40-minute window and the FAST/FULL split are both claims about cost,
and until a run records its own they stay unfalsifiable — the schema carried 78 keys and not one duration.
Record `started_at`/`finished_at`, per-step minutes, `agent_dispatches`, and the regression run's
**predicted vs actual** minutes. That last pair is what will let `npm run regression:recalibrate` eventually
be trusted: an order-of-magnitude gap is the ×18–×88 `estimatedMinutes` defect surfacing, and it belongs in
the report rather than being inferred months later.

### 4. Update the checklist in place

**Update `testing-checklist.md` in place with each item's verdict**, so the committed file is the
checklist that ran and not the one that was planned.

**`--iterate`: PER ROUND, and append-only.** The checklist gains a `## Round N` section holding the
re-run items as transitions (`Round 1: FAIL → Round N: PASS`); **never edit a round-1 verdict cell in
place** — the RED→GREEN transition is the loop’s deliverable, and on FAST this file is the only durable
record of it. The evidence screenshots a row cites are round-stamped for the same reason
(`.claude/rules/reports.md` §7).

### 5. Output the full chat report

This IS the report: verdict, reconciled AC/DoD table + percentages, checklist results, change-scoped
regression result + triage summary + **Scope Exclusions**, business rules verified, bugs found (with
provenance + relationship), below-floor findings, release-gate recommendation, and the screenshot folder
path.

**Plus, when `visual_surface: true`, one Visual axis line** — the three axes with their verdicts, the
invariant failures, the advisory count, and **any axis that was `SKIPPED`/`INCONCLUSIVE`, with its reason**.
State a skip explicitly: an omitted axis reads as a clean one, which is the failure this axis exists to stop.
When `visual_surface` derived `false`, say so in the same one line rather than dropping the section — *not
applicable* and *not checked* must stay distinguishable.

---

## 5f. Change status — `qa-lead` only, ask first, and BLOCKED is a row

Strictly **after** the report is posted. **Single source of truth for the whole state machine:**
[`.claude/knowledge/execution/ticket-status-transitions.md`](../../knowledge/execution/ticket-status-transitions.md)
— cite it, never restate it. What this section owns is the 5f-shaped summary of it.

| Verdict | Transition | Also required |
|---|---|---|
| PASS / PASS WITH NOTES | `Finish test` → TESTED | `PASS WITH NOTES` is a PASS; the notes live in the comment, never in a different transition |
| FAIL | `Need fixes` → REOPEN | The comment lists every failure and every filed bug link, posted **before** the transition |
| **BLOCKED** | **none — deliberately** | A **mandatory comment** naming the blocker (env / data / dependency / not-deployed), what it blocks, and that the ticket awaits a re-run. It stays in-testing |

**Why BLOCKED transitions nothing, and why it needed a row.** This table had two rows for a four-value
verdict vocabulary, so a blocked run left the ticket in in-testing with no comment obligation and no rule
— reading to everyone else as *QA is testing this* while nothing was. Both alternatives are worse: TESTED
is a lie, and REOPEN files an env/data blocker into the developer queue as though it were a product
defect. So the honest state is *still in testing, and here is why nobody is testing it*, and the comment
is what makes that readable — which is why it is mandatory rather than nice-to-have. A run that STOPs at
a gate before 5f is the same shape: the opening hop stays, and the close-out says so.

**Confirmation is asymmetric, and that is deliberate.** The `1a` opening hop is **never** confirmed
(reversible, and the operator implied it by invoking the command); this closing hop **always is** (it is
terminal for the run, it notifies watchers, and REOPEN hands work to another team). Both used to be
stated in two places with two different answers.

**`qa-lead` is the only actor.** No specialist, runner, verifier, doer or sub-agent transitions a ticket,
including while it is already in the tracker posting a comment; it reports up instead.

On Jira both closing transitions require the in-testing status (the `1a` move); if that was skipped, do
the in-testing hop first (discover live). On Azure Boards set `System.State` directly. **TESTED is the
terminal state this command may reach — never Done or Cancelled.** Every hop **and every skip** appends to
`summary.json.status_transitions[]`.

**`--iterate`: the transition happens AT LOOP EXIT ONLY** — one transition on the ticket under test per run, whatever the round
count. REOPEN is the human-handoff signal, and a loop about to start another round is not handing off; a
per-round REOPEN would also flap the ticket out of in-testing, which is the precondition both closing
transitions need. The ticket therefore stays in-testing across rounds, so the Step-4 hop fires once — and
if round 1 skipped it, the exit round does it here, exactly as the paragraph above already requires.

**A BUG the loop verified is a different ticket, and it has its own hop** — taken by the inline
`/qa-verify-fix` at round entry, capped at `TESTED`, and only when that bug's fix is merged and present in
the round's probed build; everything else the loop left in in-testing closes out here at 5f alongside the
ticket ([`modes.md`](modes.md) §Round entry ·
[`ticket-status-transitions.md`](../../knowledge/execution/ticket-status-transitions.md) §5a). It does not
make this a two-transition run: the count above is per ticket.

### Close the loop

By default `/qa-test` verifies and reports; it never fixes — it states the next command and stops (pointers,
not auto-triggers). This close-out is the `feature-test` flow's; `verify-fix` already ended at its own
VERIFIED/REOPEN verdict, and `hotfix-verify` handed off before 1b.

- **PASS / PASS WITH NOTES** → ticket TESTED; hand to the Feature Release Gate. Done — **5h publishes the
  documentation to the ticket** (§5h) and 5g still runs (non-blocking) if new cases were authored.
  **Then point at the release note** — see §Release note below.
- **FAIL → REOPEN** → `/qa-fix <ticket-key>` (autonomous G0–G7, never auto-merges) → human review + merge +
  deploy → `/qa-verify-fix <ticket-key>`. A too-complex/multi-repo bug (G0 BAIL) is handed to a human,
  resuming at `/qa-verify-fix`. Once the fix is deployed, a re-run of `/qa-test <ticket-key>` auto-routes the
  Bug to the `verify-fix` flow, since its status is now `fix-ready`.
- **BLOCKED** → resolve the blocker (env/data/dependency) and **re-run `/qa-test <ticket-key>`** from the
  top; no partial credit.
- **With `--iterate`** the FAIL bullet is what 5k automates, bounded — it is the loop, not a pointer.
  Everything else here is unchanged: merge and release stay the human’s, and the loop only ever
  re-tests an unmerged prerelease.

### Release note — a pointer, not a trigger

The **machine half is already written and persisted** — `summary.json.layer` plus the `release` block,
resolved at 5e.0 and written at 5e.3. Nothing is computed here.

**Point, and stop.** `/ba-analyze` is `disable-model-invocation: true`, so nothing here can (or
should) auto-fire it. When `refusal` is null, state exactly this:

```
/ba-analyze docs release <ticket-key>
# layer=<layer> · audience=<audience> · summary.json: reports/tickets/{SPRINT}/<ticket-key>/summary.json
```

Those four facts are the whole hand-off — the follow-up run re-derives nothing. When `refusal` is
non-null, state `no release fragment: <refusal>` and **name no command**. The aggregate is a separate,
later run (`/ba-analyze docs release --sprint {SPRINT}`), never part of this close-out.

**The `verify-fix` flow produces no fragment**, by design: it writes `verification-summary.json` rather
than `summary.json`, and a fix’s release story is the bundle/hotfix narrative `/qa-hotfix` owns.

---

---

## 5h. Publish the documentation to the ticket — after TESTED, both paths

The release-note pointer above hands off a *what shipped* record. **This step delivers the ordinary
product documentation** — the §3/§4/§5 guides for the surface this ticket moved — and **posts it as one
comment on the ticket**, so the people who asked for the change read it where they are already looking.
Shape, audience derivation, size caps and refusals: [`knowledge/ba/virto-doc-style.md`](../../knowledge/ba/virto-doc-style.md) §10.

Runs **after 5f**, on **both paths**. FAST is included deliberately and costs nothing: a P2 config tweak
refuses `not-user-visible`, which is the correct outcome, not a skipped step.

### 1. Decide whether the ticket earned documentation

Read `summary.json` — `verdict`, `layer`, `build.deployed` — and `testing-checklist.md`. Refuse, with the
reason, when any of these holds (§10.4):

| Refusal | When |
|---|---|
| `layer-unresolved` | `summary.json.layer` is null — never guess, never default to `storefront` |
| `not-deployed` | the change is not live on the env under test |
| `not-user-visible` | no `PASS` row a shopper, operator or integrator can act on — including a run in which nothing passed |

**A refusal is a legitimate outcome, not a failure.** State it and stop — no file, no comment.

**The verdict is not one of them.** `FAIL`/`BLOCKED` **scopes** this step rather than refusing it:
document the conditions that PASSed, omit the ones that did not, and carry the mandatory `Not documented`
line plus the verbatim verdict (§10.2/§10.4). 5f's release note keeps its `verdict-not-pass` gate —
*what shipped* and *how do I use this* fail differently. **The precondition is 5f having run, not the ticket having reached TESTED** — a FAIL run transitions to REOPEN and never reaches TESTED, so a TESTED precondition would refuse precisely the runs this paragraph says to scope. What the ordering buys is that a human has already seen 5f's transition and the verdict behind it, whatever that verdict was; this step runs only once
transitioned the ticket to TESTED. There is likewise no `no-version` refusal here: a how-to does not
quote a build number, and requiring one would refuse guides that are perfectly writable (§10, head
table).

### 2. Run the writer, then post

```
/ba-analyze docs ticket <ticket-key> --publish
# layer=<layer> · audiences=<derived list> · summary.json: reports/tickets/{SPRINT}/<ticket-key>/summary.json
```

`ba-doc-writer` runs **alone** (same reason as `doc_scope: release` — there is no per-ticket
`system_analysis` to have), writes the guides to `reports/ba/`, and returns the composed comment body.
Audiences come from the **§9.1 layer→audience row**, read for a different purpose — do not re-derive the
layer and do not build a second map.

**Ask before posting.** The comment is an external write to the tracker; confirmation is required here
exactly as it is at 5d and 5f, and a subagent never posts it unprompted
(`.claude/rules/agents.md` §Agent Delegation, and the standing subagent external-write rule).

**The posting mechanics are `tracker-ops.md`'s, not this step's** — read §5a/§5c/§5d **before** the first
API call, not after the first failure. §2 **Comment** for the endpoint (Jira `addCommentToJiraIssue`,
Azure Boards the work-item comments REST endpoint); **§5d** for what a delivery is — *the guides in full,
in the body*, with a split across comments (one per audience) as the only legal response to a body that
does not fit, and never a `reports/ba/` path standing in for content a reader cannot reach; **§5a** for
the body dialect (Markdown for Jira, HTML for Azure — never Jira wiki markup) and **§5c** for its one
carve-out: a screenshot needs an attachment plus a **wiki-markup** reference, which makes the whole Jira
body wiki. §5c also records the three ADF dead ends, so do not re-probe them.

**Redact and contain first** (§10.4): secrets scrubbed regardless of destination, and on a client project
every client host, path, identifier and datum. A payload that cannot be shown clean is described in
prose, never embedded.

### 3. Record it

Write the `documentation` block of `summary.json` (schema:
[`qa-test-summary.schema.json`](../../templates/qa-test-summary.schema.json)) — `published`, `audiences`,
`files`, `amended`, `comment_posted`, `refusal`. Two distinctions the block exists to keep: a **null**
block means 5h never ran, while `published: false` with a non-null `refusal` means it ran and declined —
and `comment_posted: false` alongside `published: true` means the guides were written but the operator
declined the post. Recording a refusal is the same discipline as the 5e comment’s `Not filed` line
saying `None`: an omission is indistinguishable from a step nobody ran.

**`--iterate`: 5h runs AT LOOP EXIT, ONCE.** The loop re-tests an unmerged prerelease; documenting a
build that is about to be replaced publishes instructions for something nobody can use yet, and a
per-round comment buries the ticket. One documentation comment per run, whatever the round count.

---
