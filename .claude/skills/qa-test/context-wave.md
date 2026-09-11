# Steps 1r / 1c / 1c-map / 1d — the context wave, in detail

**This file is the only place the FULL-path context wave is specified.**
[`../../commands/qa-test.md`](../../commands/qa-test.md) keeps the ordered list, the trigger and the gate
for each of these four and cites this file for the rest — the same split
[`preflight.md`](preflight.md) holds for `1a`/`1b` and [`test-model.md`](test-model.md) for `1e`.

**All four are FULL-only and all four ride ONE message** — `1r ‖ 1c ‖ 1d ‖ [1c-map] ‖ 2-load` — because
every one of them consumes only `1a`'s fetch. They are separate agents on separate lanes, not separate
waves; the thing being saved is a round-trip ([`SKILL.md`](SKILL.md) §Concurrency).

Read this when you are dispatching the wave, writing one of its briefs, or changing what a brief carries.

---

## 1r — Is any of this reachable? (FULL only, ~5 min, in the 1c wave)

**Dispatched in the SAME message as `1c ‖ 1d ‖ 2-load`** — one more agent on one free lane, no new wave.
It exists to answer one question before the run spends an hour deriving: **is there anything here to
test?**

| It checks | It does NOT |
|---|---|
| the ticket's own surface renders at all (the route / blade / endpoint `1a` and the diff name) | assert an acceptance criterion |
| the change is present in the **deployed** build `1b` probed — the behaviour surface, not just the version string | grade anything PASS or FAIL |
| the primary AC path can be **walked** shallowly, end to end, without asserting | capture regression evidence |
| the accounts and `@td()` fixtures the ticket assumes actually resolve and sign in | file a bug |

**Returns `REACHABLE` or `BLOCKED(<reason>)`, and nothing else.** **Never evidence for `5c`** — a green
`1r` is not a passing condition. **On `BLOCKED`: stop deriving now** — `TaskStop` `3a` and any authoring,
record what was aborted, go straight to `5c` BLOCKED → 5e → 5f (no transition, blocker comment required).
Capped at ~5 min and one lane; a `1r` that starts exploring has become `3x`. It never blocks `1c`/`1d`.
**Record** `timing.reachability_minutes` + a one-line verdict; `null` on FULL is a gap, not a zero.

## 1c — Gather ticket context (FULL path only)

Dispatch `ba-system-analyzer` (read-only, no JIRA/GitHub writes) with the ticket ID(s)/feature/PR + the
raw ticket fields + PR diff **+ the `1a` comment/attachment signals** (a repro in a comment or a log/HAR
attachment often points straight at the affected code site) **+ the `1a` Epic context** (so it maps the
seams between this story and its Done siblings, not just the story's own code) **+ the `2-map` prior art**
— the paths of this domain's existing BA analysis, its prior test model and its domain-knowledge docs,
passed as paths to READ rather than as a summary. `ba-system-analyzer` has always been told to *skim*
`reports/ba/`; being handed the specific files is what turns that into a step, and the agent's own
definition now requires it to report what the prior analysis already settled versus what is new. **On the full path, dispatch
`1c` and `1d` concurrently in a single message** — both consume only the `1a` fetch and are independent. It
returns:
- **Existing functionality (current state)** — **first, and mandatory.** What the scope ALREADY DOES before this ticket, one line per capability, grounded in source/live/docs; plus the prior art it read **by path** (or the literal `none`), the prior model to amend, and what is new in this pass. A gap analysis with no baseline is a wish list. **A prior report is a HYPOTHESIS, never the baseline** — it is dated and the product moved after it, so each claim is triangulated against the `2-release` ledger Δ **and a live check**, then carries `CONFIRMED` / `DRIFT` / `MISSING` / `UNVERIFIED`. A `DRIFT` is a finding about the *document*, not a product bug.
- **The test object** — purpose (the value chain) · **operations** (what can be done to it) · **properties** (what can be observed or varied) · **variants** (what changes its behaviour without changing its code) · **constraints** (`BL-*`/`ECL-*`, with what a violation costs) · **reverse edges**. Seeded from `2-map`'s `Test object` block and completed live. This is `1e`'s condition-space raw material: a model built without it enumerates screens, which is the Loyalty Missions shape. A map `UNDECLARED` is established here or reported as unestablished — **never** guessed.
- **Affected surface** — module(s)/repo(s), storefront vs Admin SPA vs API/GraphQL layer, concrete code sites (grounded, not guessed).
- **Surfaces the DOMAIN MAP does not list — mandatory when a map exists.** For every surface you touched, say whether `.claude/knowledge/domain/<name>.md` enumerates it; report the misses in `domain_map.unmapped_surfaces[]`. **Never edit the map from here** — `ba-system-analyzer` is its sole writer and `5h-map` does the write, once, after the verdict. Two corollaries, both amendments rather than proposals: a `D*` you confirmed or refuted **live** is a verdict upgrade, and a `G*` this run closed says what closed it. Anything not verified live stays a proposal. Without this the map decays the moment the product moves.
- **Related flows & integration boundaries** — adjacent features / cross-domain seams (cart ↔ checkout, org ↔ membership, …).
- **Known pain points / historical failures** — cross-referenced to `vc-bug-catalog.md` (`VC-*`) + prior bugs.
- **Docs grounding** — VirtoOZ/VC-doc references for how the feature is *supposed* to behave.

**Hand it the contract's REV, not its path.** When `1b` item 2d refreshed, the brief carries
`graphql-schema.md @ <refresh date> — refreshed this run` plus any fixture drift the gate reported. Without
the rev, the agent's own definition tells it the snapshot is of **UNKNOWN age** and to report every field
name it took from the file as unverified — correct, but it costs the run its GraphQL grounding, so it
guesses ([`contract-refresh.md`](contract-refresh.md) §4). When 2d recorded
`UNKNOWN`, say so in the brief: contract claims from that snapshot are hypotheses, not grounding.

**Text or path is a decision, not a habit — and `1c` sits on both sides of it.** The `BL-*`/`ECL-*` rules
for the scope travel as TEXT (`npm run bl:extract -- --domain <d>` · `npm run ecl:extract -- --domain <d>`
emit the oracles verbatim), as do `1d`'s. **Prior art travels as PATHS on purpose:** the agent has to
triangulate each claim against the ledger and a live check before it can carry `CONFIRMED`/`DRIFT`/
`MISSING`, and a digest would pre-answer the question this step exists to ask. The rule that decides
which is which, for every fan-out in the pipeline:
[`dispatch-pack.md`](dispatch-pack.md).

On internal error, gather context inline (from the `1a` fields + the diff + `.claude/knowledge/`) rather than
retrying the delegation. The `1e` model carries the same fields either way.

## 1c-map — build the missing domain map, in parallel (FULL only)

**Invoke [`/qa-domain-map <slug>`](../../commands/qa-domain-map.md) in the SAME message as `1c ‖ 1d ‖ 2-load`** — the
command, never a re-implementation: it owns the Step-2 brief, and a lighter hand-rolled one produces a map
that is not citable in the same shape as its siblings. Add only what the pipeline knows and the command
does not: the `2-release` ledger Δ and `1a`'s domains.

**Trigger — all four, or no dispatch:** path **FULL** · state `ABSENT`/`unresolved` · `all_layer_chain:
true` · **`STALE` is never auto-refreshed** (`--refresh` stays operator-invoked). Contract and fail
direction: [`axes.md`](axes.md) §2g.

**Lane.** `1c`'s analyzer holds `playwright-firefox`, so this one takes a **different free lane** — two
instances of one agent definition inherit one lane unless told otherwise. **Naming it is part of the
brief.**

**Single writer is preserved:** this dispatch *is* `ba-system-analyzer`, the sole author of
`knowledge/domain/*.md`; `1c`'s instance stays read-only there. The orchestrator writes the file at the
join, after the command's 8-clause gate + `context:check` + `domain:check`.

**Join before `1e`; the run never waits past that.** Success ⇒ `domain_map.state: PRESENT`,
`built_in_run: true`, `build_outcome: BUILT`, `rev: 1`, and clauses 11/11b bind against it. **Any failure
⇒ `build_outcome: FAILED` + reason, `state` stays `ABSENT`, proceed as a FAST run does.** A half-built map
is never written. **Nothing here blocks, delays a verdict, or becomes a finding about the product.**


## 1d — Review the story (FULL only)

**Advisory, never blocking.** Runs for a ticket/story **with ACs**; skip with a one-line note for a bare
feature name or a PR with no governing story.

Dispatch `ba-story-writer` in review mode (Mode B) — analyze only, no new story, no tracker writes. Pass
`existing_story` (summary + description + ACs from `1a`), any **AC-affecting clarifications from the `1a`
comments** (a comment that redefines expected behavior overrides the stale description), `jira_ref` +
`domains`, and `implementation: { pr_diff }` — this is the **static** AC↔code check; the **live** one is 5b.
It returns: an **AC Quality Scorecard** (per AC: testable? / clarity / smells / KEEP·REWRITE·SPLIT) ·
**weak sides** with rewrites · **AC ↔ Implementation coverage** (SATISFIED / DRIFT / NOT-FOUND / CONTRADICTS
vs the diff, plus unspecified implementation) · **gap analysis** (missing ACs for error paths, boundaries,
guest/B2B, NFRs, integration seams — each mapped to a `BL-*`/`ECL-*` and phrased as a gap-AC) · an **AC →
Test traceability seed** (atomic testable conditions, story ACs + gap-ACs, each with its `Impl verdict`) ·
the **DoD checklist** (each item marked from what is statically inferable now vs flagged **"confirm at
5b"**; skip with a note when there is no DoD section).

**Surface inline** the weak ACs, DRIFT/CONTRADICTS/scope-creep findings and gap-ACs, then **proceed** — fold
gap-ACs into scope and carry every DRIFT/NOT-FOUND/CONTRADICTS into execution as a thing to verify **live**
(a static-diff finding is a suspicion, not a defect). The AC traceability table and the DoD checklist stay in
working context (terminal-only, `.claude/rules/reports.md` §1); they are the spine for Step 3 and 5b.

