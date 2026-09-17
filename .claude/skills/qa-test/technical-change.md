# The `technical-change` flow — testing work that has no user-facing subject

**This file is the only place the `technical-change` flow's execution is specified.**
[`ticket-routing.md`](../../knowledge/execution/ticket-routing.md) §5d owns the *routing* decision — when the
flow applies, the signals that establish it, why it fails closed — and **cites this file** for how to
actually run one. `commands/qa-test.md` cites both and restates neither, the same discipline
[`ui-kit-class.md`](ui-kit-class.md) holds for the shape class.

**It is a FLOW, not a path and not a class.** It sits beside `verify-fix`, `hotfix-verify` and
`feature-test`, and like the first two it has a fixed shape and ignores the EFFORT axis (`path: null`).
It is not "FAST with less" — it is the subsequence of the existing pipeline that survives when the ticket's
subject is machinery rather than capability.

**One flow, the whole technical family**: a module extracted, an SDK replaced, a dependency or framework
migrated, a runtime or build target bumped, a config or tooling change. They differ only in whether the
ticket leaves anything to verify, and §3 makes that a step rather than a second flow.

**The one sentence to carry out of here: this flow subtracts the FEATURE TEST, not the testing.** The
regression it runs is the ordinary `/qa-regression` — real runner agents, real browsers, real evidence —
and it closes out through the ordinary Step 5, bugs filed and all.

Provenance, and read the second paragraph before using the first. **VCST-4717** *"Migrate Application
Insights to Azure Monitor OpenTelemetry"* and **VCST-4328** *"Update VC Modules to NET10"* are the
qualifying cases: both are `Task`, neither adds a user-facing capability, both put every existing caller at
risk, and both carry machinery to verify (§3).

**VCST-4386** *"Move skyflow to a separate module on frontend"* is the ticket that MOTIVATED this flow and
is also its worked **refusal** — it reads as a pure extraction and its diff is not one (**§7a**). Keep both
facts together: the case that makes a flow look necessary is not automatically a case the flow should take.
Every command in §2, §4 and §5 was **executed against these tickets before being written down** — §8
records what that dry run corrected, §7a what the routing test did.

---

## 1. The shape

```
  1a  classify + route + OPENING status hop       commands/qa-test.md §1a       [unchanged]
  1b  pre-flight, sprint resolution, dup check    commands/qa-test.md §1b       [unchanged]
  2a  tc:scope -> dispose -> apply REPAIR         coverage-triage.md            [2a ALONE, no authoring]
  B   Artifact B checklist + 1 execution agent    authoring.md                  [CONDITIONAL — §3]
  RG  regression:select -> /qa-regression         §4 below                      *** the flow's own step
  5-triage → 5-verdict → 5-file → 5-report → 5-status → 5-docs                     commands/qa-test.md §Step 5   [unchanged, FAST cadence]
```

**Step 5 runs IN FULL, at the FAST cadence** — every phase, minus only the three FULL-only verifier
dispatches, exactly as a FAST run omits them. Do not trim it:

- **`5-file` files the bugs.** A regression failure *is* this flow's deliverable. A close-out that triages a
  failure, folds it into a verdict and reports it but never files it produces a run whose entire output is a
  sentence in a chat window.
- **`5-verdict.1` feeds `5-verdict.2`.** The verdict is *"derived from 5-triage + the reconciliation — no new judgment"*, so
  skipping the reconciliation leaves the verdict with half its input. Where the ticket carries machinery
  claims (VCST-4717 has five), `5-verdict.1` is what reconciles them; where it carries none, it resolves in a line
  and costs nothing.
- **`5-docs` refuses on its own.** Its `not-user-visible` refusal is the *expected* outcome for most runs here,
  and `virto-doc-style.md` §10 already says so — but a migration with integrator-facing consequences is
  exactly the case that refusal is not meant to swallow. Let the step decide; do not pre-empt it.

Every step is cited, never restated. **Do not invent a variant of any cited step** — the reason this flow is
cheap to trust is that it reuses steps whose contracts are gated elsewhere.

**`B` and `RG` are independent** once `2a` has returned: dispatch them in one message rather than
sequentially. They touch nothing in common — the checklist agent reads the ticket's machinery claims, the
regression runs suites — so this is the ordinary round-trip saving of [`SKILL.md`](SKILL.md) §Concurrency.
Mind the 3-lane browser cap: the checklist agent occupies a lane, so it counts against `/qa-regression`'s
pool.

---

## 2. `1a` — resolve the change, by a ladder, then READ THE DIFF

**The ticket is not evidence. The diff is.** A title states what someone intended; only the file list states
what changed, and on the one ticket where the two were compared they disagreed enough to matter — §7a.
Every signal in `ticket-routing.md` §5d is evaluated against the **file list**, never against the summary.

### 2.1 Find the change

The classifier reads the change and nothing else, so `1a` must end holding real file paths. **A linked PR is
not the only source and is often not an available one**: on VCST-4717 the pull requests exist inside Jira's
`development` custom field as an escaped-JSON summary carrying a *count* and no URLs, reachable only through
an all-fields fetch returning ~76,000 characters. A run that checks `issuelinks`, finds no PR and stops has
established nothing.

**Work the ladder in order; stop at the first rung that yields file paths.**

| # | Rung | How |
|---|---|---|
| 1 | an explicit PR URL in `issuelinks`, the **description**, or the **comments** | read it, then `gh pr diff <n> --repo <r> --name-only` |
| 2 | **an org-wide PR search by ticket key** — the rung that works when you do not know the repo | `gh search prs --owner VirtoCommerce "<TICKET>" --limit 10 --json number,title,state,repository` |
| 3 | the product repo's own history, by ticket key | `git log --all --oneline --grep=<TICKET>` in the routed checkout, then `git show --name-only` |
| 4 | the paths the **ticket itself names** | a description naming a module directory is a path, and it is evidence — but the weakest rung, so say you are standing on it |

**Rung 2 is second because a technical change is routinely multi-repo and you cannot guess the repos.**
Measured 2026-09-16: `gh pr list --repo <guess> --search VCST-5662` returned `[]` against four plausible
repos in a row, while the org-wide search returned the three real PRs (`x-api#85`, `x-order#51`,
`x-cart#142`) immediately. The same search found VCST-4717's five across four repos. A repo-scoped search
that returns nothing is evidence about your guess, **not** about the ticket.

**If every rung fails, the classifier is unresolved** — §5d's *no change to read ⇒ NOT this flow* — so route
by type and run the feature test. The ladder makes that conclusion earned rather than incidental; it does
not soften it.

### 2.2 Read the diff — two things the file list is checked for

**A. Net-new runtime surface, which refuses the class.** A page, route, component, extension point or
GraphQL/REST operation that did not exist before is new capability however technical the ticket sounds. It
is the *mechanically checkable* signal — it either appears in the file list or it does not — so check it
first, before the judgment-shaped "is the contract unchanged?" question. §7a is the case that earns this
paragraph.

**B. Size, not just filename — a touched path is not a changed contract.** A filename says which
*subsystem* moved; only the line counts say whether its *contract* did. Measured on VCST-5662: its PRs touch
`Schemas/OrderLineItemType.cs`, `Schemas/PaymentType.cs` and `Schemas/ShipmentType.cs`, which read as
GraphQL schema definitions and would refuse the class on filename alone. At **+6/−9 across 5 files** they
are constructor injection — the field definitions are untouched and the contract is intact. Open the diff
body whenever a filename suggests a contract and the line count does not.

The inverse holds too, and is the more dangerous direction: VCST-4386's `+ pages/saved-credit-cards.vue` is
a single added file that refuses the class outright. **One new page outweighs sixty moved ones.**

### 2.3 The classifier needs the change; the REGRESSION does not

These are separate resolutions, and conflating them is what breaks a run. `regression:select` refuses a PR
reference outright ([`regression-selection.md`](../../knowledge/execution/regression-selection.md) — *"a PR
reference, a changelog version and a ticket key return `null`"*), and `tc:scope` scopes off the **manifest's
own vocabulary**, not off paths at all. §4 and §5 resolve their own scope; neither is ever handed a ticket
key.

---

## 3. `B` — the checklist, and when it runs

**Read the ticket for a machinery claim: something the change must still do, that a regression suite does
not assert on.** Where one exists, the checklist verifies it and one execution agent walks it, exactly as on
a FAST `feature-test` — [`authoring.md`](authoring.md) owns the artifact and is unchanged here.

| Ticket | Machinery claim | `B` |
|---|---|---|
| a **pure** module move — no new page, route or export | none. Nothing new is exercisable; the move either broke callers or it did not, and `RG` answers that | **skipped, stated** |
| VCST-4717 — telemetry SDK swapped | *does telemetry still arrive, and with which properties?* No storefront suite asserts on Application Insights, so `RG` is structurally blind to it | **runs** |
| VCST-4328 — runtime bumped | *does it still build, start and serve?* | **runs** |

**The test is whether `RG` is blind to the claim, not whether the ticket has an AC field.** VCST-4717's five
ACs include *"Doc: Migration Plan"*, which is not a QA claim at all; a ticket with no AC field can still
carry a machinery claim in its description. Read for the claim.

**A skipped checklist is stated, never silent** — in the report and in `summary.json`, with the reason. An
omitted track reads exactly like a passing one ([`SKILL.md`](SKILL.md) §1: *silence is never an answer*).

**The checklist never grows into a feature test.** It verifies that machinery still functions; it does not
explore user journeys, and a checklist item that needs a Test Model to write is a signal the classifier was
wrong (§5.2).

---

## 4. `RG` — the standard regression, over the blast radius

**Do not pass `--target`.** The deliverable of this flow *is* the blast radius, and the cap trims it hard
for almost nothing. Measured on VCST-4386's own paths:

| Invocation | Selected | Predicted | Dropped |
|---|---|---|---|
| no cap | **37 suites** | 290 min | — |
| `--target 40` | 16 suites | 245 min | **21 suites / 654 min, reported as coverage debt** |

**57% of the radius for 45 predicted minutes.** The cap barely bites, because most predicted time sits in a
few runner-native suites the trimmer does not touch — so it pays for itself almost entirely out of the
suites this flow exists to run. `ticket-routing.md` §5a's `--target 40` belongs to a *deliberate,
operator-chosen* sweep on a `feature-test`; it is the wrong default here. Cap only when an operator asks,
and say what was excluded.

```bash
npm run regression:select -- --repo <repo> --path <the paths from 1a> --json
# --changed-files <f> and --diff <range> are equivalent inputs; use whichever rung 2 produced
```

The selector **fails OPEN**: doubt widens to the whole layer, and P0 + `critical-ui-scope` survive any
`--target`. That is the opposite direction to the classifier that routed here, and both are correct — the
classifier decides *whether to subtract the feature test* and must fail closed; the selector decides *how
wide to look* and must fail open. Report `unmappedPaths`; an empty suite list is a **blocker**, never a pass.

**Read the `why` column before trusting the result.** On the VCST-4386 dry run only one of 16 suites came in
on `change`; the rest arrived on `risk-floor`, `history` and `rotation`. That is the selector working as
designed, but it means *"16 suites selected"* is not by itself evidence the change was placed — if nothing
is attributed to `change`, the paths did not match the index and you are probably standing on rung 4 of §2's
ladder. Say so, rather than reporting a placed change.

**Then run them, normally:**

```
/qa-regression <selected suite ids> --ids <every REPAIR + RE-BASE id from 2a>
```

`regression-orchestrator` executes this exactly as it executes any other regression — its own batching, the
three browser lanes, the fallback chain, retries, HAR capture, `test-run-status.json`, the consolidated
report. **Nothing here is headless, lighter or special-cased.** This flow has no opinion about how a suite
runs; `/qa-regression` and [`regression-pipelines.md`](../../knowledge/execution/regression-pipelines.md)
own that and are unmodified. Launch the run's watcher as usual — a regression is the deliverable here, not a
side track. Carry its `RUN_ID` into `5-triage`, which triages through `/qa-triage-results <RUN_ID>`, never from
scratch.

**A backend-only technical change still runs storefront suites.** A telemetry SDK or a runtime bump is
instrumented into the request path, so the layer that observes a break is the one a user would have hit.
Let the selector widen; do not hand-narrow it to the changed repo's own layer.

---

## 5. `2a` — scope by the MANIFEST's vocabulary, then audit the routing

Dispatch `test-management-specialist` **once**, for Artifact A's `2a` phase and nothing else — the identical
shape a FAST run under `--coverage` already uses ([`coverage-triage.md`](coverage-triage.md) §2a-own:
*"One dispatch, one owner, one writer"*). There is no authoring phase here, so `A` is `2a` and ends there.
**Do not open a second route into the corpus**: the one-writer-per-suite-CSV rule
([`.claude/rules/regression.md`](../../rules/regression.md) §Suite inventory) is load-bearing.

### 5.1 Resolve the scope flag against the manifest BEFORE invoking

**`tc:scope` scopes off the manifest's vocabulary, never off the diff**, and its three scope flags read
three *different* fields. Guessing costs a silent empty result, not an error:

| Flag | Matches | Fails silently when |
|---|---|---|
| `--module <m>` | a suite's **`requiresModules`** entry, as written (e.g. `VirtoCommerce.ApplicationInsights`) | you pass a product name that is only a **tag** |
| `--domain <d>` | a suite's **`domain`** | you pass a module or a feature name |
| `--suite <ids>` | suite ids | — |

**`--changed-files` is ADDITIVE and does not scope a scan** — the tool's own usage says so: *"it adds a
suite the vocabulary missed, never removes one it found, and it does not by itself scope a scan."* Use it to
refine, never to scope.

So **look the change up in the manifest first**:

```bash
node -e "const m=require('./config/test-suites.json'); for (const s of m.suites) if (/TERM/i.test(JSON.stringify(s))) console.log(s.id, s.name, '|', s.domain, '|', (s.tags||[]).join(','), '|', (s.requiresModules||[]).join(','))"
```

…then pick the flag matching the field the term actually landed in. Both worked examples, **verified**:

| Ticket | The term | Where it lives | Invocation | Result |
|---|---|---|---|---|
| VCST-4386 | `skyflow` | a **tag** on suite 040a, domain `purchase-flow` — **not** a module | `--domain purchase-flow --observable "Skyflow" --observable "payment"` | 34 suites, 854 rows, 176 at risk |
| VCST-4717 | Application Insights | a **module**, in 094's `requiresModules` | `--module VirtoCommerce.ApplicationInsights --observable "telemetry" --observable "Application Insights"` | 1 suite, 23 rows, 22 at risk |

**`--module skyflow` returns zero suites and zero rows**, and reads exactly like a clean corpus. That is the
failure mode `ticket-routing.md` §5c warned about for `ui-kit`, reproduced verbatim here — a technical
change has no single domain of its own, so the vocabulary has to be looked up rather than assumed.
**Record the literal invocation in the report.**

**Pair a narrow scope with a corpus-wide pass** where the change's consumers are not confined to one domain,
and keep the observables to terms the CSVs plausibly use — a broad one (`payment`) over-selects, an internal
one (`skyflow`) matches nothing.

### 5.2 The dispositions audit the routing decision

For a change with no new user-facing capability the dispositions should be overwhelmingly `REPAIR` —
mechanically stale rows naming a moved path or a renamed symbol.

- **`REPAIR`** — expected. Apply it, carry the id into `RG`.
- **`RE-BASE`** — a row whose expected **value** the change contradicts. **That is a user-facing behaviour
  change, by definition.** One or two are noise (a stale row the change merely exposed); **a pattern is
  evidence the classifier was wrong.**

**On a pattern of `RE-BASE`: stop, abandon the flow, re-route to `feature-test`, and say so in the report** —
which flow was abandoned, at which step, and on what evidence. A flow that can detect its own misrouting and
does not act on it is worse than one that cannot, because the run still reports a verdict.

This is the same instinct as `coverage-triage.md`'s refusal to let a pre-run edit rewrite an oracle: the
change under test does not get to certify itself.

---

## 6. What the run does not produce — say it, don't omit it

| Not produced | Record |
|---|---|
| durable new coverage | the flow authors **no** cases; `/qa-test-lifecycle` is the route back in |
| a release recommendation | `feature_release_gate: not-assessed` — **never** substituting the regression's own number, which answers a different question (`ticket-routing.md` §5a) |
| a visual/design pass | the `visual` and `contract` axes do not run — §7 |
| a checklist, when there was no machinery claim | the stated skip of §3, with its reason |

Everything else in Step 5 **is** produced: bugs filed at 5-file under the ordinary severity floor, the tracker
comment at 5-report, the transition at 5-status, and 5-docs's documentation or its own stated refusal.

**`5-triage` triages the regression's failures as the ticket's own.** *"A suite that passed before this change now
fails"* **is** the subject here — a technical change that breaks a caller is precisely the defect this flow
exists to catch — so such a finding is IN-SCOPE and fails the ticket. That is what distinguishes this
regression from the `5r`/C2 sweep deleted on 2026-09-10, whose findings triaged as PRE-EXISTING or
OUT-OF-SCOPE because it answered a release question the ticket had not asked (`ticket-routing.md` §5a).

---

## 7. Why the visual lane does not run here

`ticket-routing.md` §5 calls the visual lane *"the one thing FAST does NOT drop"*, so dropping it is a
decision that has to be argued rather than assumed.

The argument that keeps it on FAST is that a `.scss`-only PR or a restyle is *"the change most likely to
break the UI"* and a functional checklist cannot see a contrast failure. **Neither half transfers.** A
`technical-change` diff has, by its own signals, an unchanged user-facing contract and no new rendered
surface. And this flow is not relying on a functional checklist to notice: it runs **suites**, which
exercise real pages in real browsers and fail on what actually broke.

If a diff genuinely does change rendering, then its user-facing contract changed, the classifier should not
have resolved, and the fix is at §5d's detection rather than a lane bolted on here. `--visual` remains
available on `feature-test`, which is where such a ticket belongs.

---

## 7a. The routing test — VCST-4386 correctly REFUSED (2026-09-16)

The flow was tested against the ticket it was designed from, and the right answer turned out to be *no*.

`1a` ladder rung 1 found the PR — **not** in `issuelinks`, which carries only a *Blocks* link, but in a QA
comment. That is the rung working as written, and it is why the ladder does not stop at `issuelinks`.

| Signal | Verdict on PR #2440 (61 files, +442−295) |
|---|---|
| user-facing contract unchanged | **contradicted** — `pages/checkout/payment.vue`, `pages/account/order-payment.vue`, `core/api/graphql/types.ts`, `client-app/config/menu.json` |
| exported surface | **contradicted** — adds `modules/skyflow/pages/saved-credit-cards.vue`, a net-new page, plus a net-new `cartPayment` extension point |
| one mechanical pattern | **unresolved** — a module extraction, but also a new extension-point category and a codegen change |
| ticket declares no new capability | **holds** — and this is the trap: the ticket alone passes |

**Class does not resolve ⇒ `feature-test` FULL** — which is what the ticket actually took on 2026-09-15,
finding **VCST-5986** (High: a guest is offered Skyflow, the card form never mounts, the order cannot be
completed, console clean). **Had the classifier keyed on the ticket rather than the diff, that bug would
have shipped.** The fail-closed direction of §5d is not theoretical; this is the run that exercised it.

Two defects it exposed, both now fixed in `ticket-routing.md` §5d:

1. **The exported-surface signal had been lost** when the two draft classifiers were merged into one. It is
   the *mechanically checkable* one — a new page or export either appears in the file list or it does not —
   whereas *"user-facing contract unchanged"* needs judgment. Restored as its own row, and checked first.
2. **The §4 row pinned status role `testable`**, which VCST-4386 (at `Tested`) does not satisfy and which §3
   does not even map. The class reads the CHANGE, not the lifecycle stage, so the row now reads `any`, as
   the `Task` and `Technical task` rows beside it do.

---

## 7b. The second routing test — VCST-5662 correctly DEFERRED (2026-09-16)

*"Replacing AutoMapper - Wave 4"* (`Task`, **High**) is the cleanest qualifying SHAPE this class has seen —
and it still must not run yet. Both outcomes matter, so record both.

**The signals all hold.** One mechanical pattern (one mapper facade per module, with naming, null semantics
and factory construction all prescribed in the ticket itself), no new user capability, an unchanged GraphQL
contract, and a blast radius that is every response body the Experience API produces — the textbook case
for *a checklist tests the diff, a regression tests the radius*.

**Two deferrals fire anyway**, and neither is a signal failure ([`ticket-routing.md`](../../knowledge/execution/ticket-routing.md) §5d):

| Deferral | VCST-5662 |
|---|---|
| the change must be IN the environment | status **In review** ⇒ role `not-fixed`. Three PRs OPEN (x-api#85, x-order#51, x-cart#142), none merged. A blast-radius regression here passes every suite **because the change is absent** |
| one repo per run | the change spans **three** product repos; §4 resolves a single `--repo` |

**The non-finding is worth as much as the findings.** The ticket declares a *"breaking change (public
constructors changed)"*, which reads like an exported-surface contradiction and is not one: a public C#
constructor is **compile-time** API. Nobody exercises it at runtime, a compiler catches its breakage, and no
storefront suite can see it either way. It is a **machinery claim for §3** — *do the dependent modules still
build and start?* — which is exactly what the conditional checklist is for. Refusing the class on it would
have rejected the canonical member of the family.

**What this test corrected:** the §4 row had been loosened to status role `any` one commit earlier, while
fixing the opposite defect on VCST-4386. `any` admits `not-fixed`, so the flow would have regressed a change
that is not in the build. The row now excludes that one role and takes every other — **including a re-test
of something already at `TESTED`**, which was the VCST-4386 problem, since §3's `testable` means *deployed
for testing* and a tested ticket is deployed. The signal-vs-deferral split is what keeps both fixes from
fighting: **signals ask whether this is the right FLOW; deferrals ask whether it can run YET.**

---

## 8. What the dry run corrected (2026-09-16)

The flow was walked end to end against VCST-4386 and VCST-4717 before it was trusted. Six defects, all in
the first draft, all fixed above — recorded because each is a shape a future edit could reintroduce.

| # | Defect | Fix |
|---|---|---|
| 1 | Close-out written as `5-triage → 5-verdict → 5-report → 5-status`, dropping **`5-file`** — so the regression failures that are the flow's entire deliverable were triaged, judged and reported but **never filed** | Step 5 runs in full — §1 |
| 2 | The AC/DoD reconciliation dropped, but the verdict is defined as *derived from 5-triage + that reconciliation*, and VCST-4717 has five ACs to reconcile | `5-verdict.1` runs, inline as on FAST |
| 3 | `5-docs` dropped silently, pre-empting a refusal the step already owns | `5-docs` runs and refuses on its own terms |
| 4 | `--target 40` prescribed, copied from §5a's operator-chosen sweep — it **drops 21 of 37 suites to save 45 predicted minutes** | no cap by default — §4, with the measurement |
| 5 | `tc:scope --module skyflow` prescribed — **returns 0 suites, 0 rows**, reading exactly like a clean corpus, because `skyflow` is a *tag* and `--module` matches `requiresModules` | look the term up in the manifest first — §5.1, with both verified invocations |
| 6 | Scope told to come from the diff, contradicting the tool (*"`--changed-files` … does not by itself scope a scan"*), and `1a` hard-required a linked PR that neither ticket exposes | vocabulary scopes / paths refine — §5.1; the §2 resolution ladder |

The common shape in 4, 5 and 6: **a recipe borrowed from a neighbouring context without re-checking it in
this one.** Each was individually defensible, and each failed *silently* — no error, no empty-result warning
loud enough to stop a run, just a thinner answer than the one that was asked for.
