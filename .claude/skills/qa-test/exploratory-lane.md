# The exploratory lane — the charter, the box, the payload

Single source of truth for `/qa-test`'s exploratory lane. The command
([`.claude/commands/qa-test.md`](../../commands/qa-test.md) Stage 4) schedules it when the approved strategy's
Exploratory row is `RUN`, and [`execution.md`](execution.md) §Exploratory briefs it; this file holds the
charter sources, the box, the payload and the gate. **Cite it; never restate it.**

---

## 1. Why the lane exists

A run that only executes a checklist asks the live product exactly the questions someone already wrote
down. Everything the strategy and the model could not resolve by reading — a `{HYPOTHESIS}` oracle, a chain
link nothing covers, an AC the diff does not obviously implement — reaches the verdict as a guess unless
someone drives the feature once. On Loyalty Missions the mechanism end-to-end got 11% coverage and the last
chain link one case, written on the final day; the missing input was never *more derivation*, it was
somebody driving the chain. And `/qa-exploratory` — fully built, with techniques, personas and the ECL/BL
supply axes — had held **one** session across the life of the repo before a ticket run called it. A
capability invoked by nothing is a capability the pipeline does not have.

## 2. When it runs

**The strategy decides, not the orchestrator.** Its Exploratory row is `RUN` when the mix is reactive, and
says **first** — a High/Critical risk rests on a `{HYPOTHESIS}` oracle, or the feature is new — or
**alongside** the checklist runners (D3; a floor can force the row on). *First* means the runners wait
for the lane and their items are checked against what it observed; *alongside* means it shares the ≤3-lane
budget with them ([`execution.md`](execution.md)). A dropped `RUN` row is an Amendment with its reason, never
a silent skip.

---

## 3. The charter is DERIVED — named sources (the model's, and a strategy's), zero invention

This is what separates the lane from a generic exploratory session, and it is the reason a bounded box is
enough at all: the mission is not "go look at checkout", it is a list of specific unknowns the run has
already written down and cannot resolve by reading. **The box is sized to how many surfaces that list
spans** (§5), not to how interesting the feature is.

| # | Source | What it contributes to the mission | Where it came from |
|---|---|---|---|
| 1 | Every `GAP` / `WAIVED` cell in the **mechanism coverage matrix** | the chain links nothing covers — drive them | the test model (when a risk is `MODEL`) |
| 2 | Every **reverse edge** not resolved to a scenario # | does the effect actually reverse? `ABSENT IN PRODUCT` is a finding, and only a live look can say so | the test model |
| 3 | Every scenario row whose oracle is **`{HYPOTHESIS}`** | the expected value nobody has seen — observe it | the test model |
| 4 | Every AC marked **DRIFT / NOT-FOUND / CONTRADICTS** | a static-diff finding is a suspicion — this is where it is verified live | the bundle's PR↔AC check (`/vc-test:ticket-context`) |
| 5 | Every **case at risk** the staleness check kept | is the existing assertion stale, or is the change wrong? A live look answers it before the regression lane runs it | Stage 3's staleness check |
| 6 | Every risk an approved **test strategy**'s Exploratory row names, with the `{HYPOTHESIS}` oracle or question it rests on | the risks the strategy chose to explore rather than assert — the only source when the strategy ran no model (test-model redesign M9) | `/vc-test:qa-test-strategy` |

Plus the mind-map nodes the checklist declared `UNVERIFIED → charter` ([`execution.md`](execution.md) §Map
signals).

**Then, and only then, the open half.** Getting the order backwards produces a pleasant session and no answers to
the questions asked. The remaining box time runs the ordinary discovery technique from
[`scenario-discovery.md`](../qa-sbtm/scenario-discovery.md) — surprise-seeking first — with the ECL's
domain `[THEORETICAL]` sections as candidate shapes and the domain's `BL-*` as the correctness oracle
(`/qa-exploratory` §5a, both read to **supply**). The suites and `vc-bug-catalog.md` are read to
**subtract**, exactly as there.

**Never invent a charter the sources do not contain.** Same anti-hallucination discipline as
`/qa-exploratory sprint` mode (*"read the charters, don't invent them"*) and as `regression:select`'s
refusal to name a suite id it did not read.

---

## 4. Outputs, each with a named consumer

A lane whose findings reach no consumer buys a one-off observation and nothing else — the exact failure
`/qa-exploratory`'s `Fate` column exists to prevent. So every output is routed:

| # | Output | Consumer | Rule |
|---|---|---|---|
| 1 | **Model amendments** — a chain link that does not exist, one nobody enumerated, a variant, a reverse edge that turns out to be real | `{RUN_DIR}/test-model.md`, and the strategy's `### Amendments` when it changes a risk | **Amend, never fork.** |
| 2 | **`{HYPOTHESIS}` → `{OBSERVED}` grounding** — the value actually read, per row | the checklist items that assert it, and `verdict.md` | A check grounded here can be **graded**; one left a hypothesis is reported as one. Silently forgetting which is not allowed |
| 3 | **Net-new scenarios**, each with a `Fate` | a row of the checklist's `X` table; a `PROMOTE` one that PASSED is a `candidate_cases` entry | No case is authored in the run — `/qa-test-lifecycle` authors it. `DECLINE` carries one line of why |
| 4 | **Oracle Feedback** — `[THEORETICAL]`→`[OBSERVED]`, a candidate pattern, a contradicted invariant | `/qa-review-oracles` | **Proposals, never edits.** `ba-system-analyzer` is the sole writer of both oracles and IDs are a citation contract |
| 5 | **Conditions the ACs never named** — a state the feature can reach that no AC describes, a control that exists and is unmentioned, a precondition the ticket assumes and the product does not hold | an `X` row with what was OBSERVED; when the lane ran **first**, a checklist item before the runners start | A lane that returns none says so: *"the ACs covered the reachable surface"* is a finding, not a blank |

**Bugs found in the lane are ordinary findings and the lane files none of them.** They enter triage with the
run's other findings, take a provenance (usually PRE-EXISTING, since the lane explores adjacent ground), and
are filed or held by the severity floor ([`close-out.md`](close-out.md) §5-file). **A Critical finding stops
the lane immediately** and escalates, exactly as in `/qa-exploratory`.

---

## 5. The box, and what happens when it runs out

**The box is SIZED TO SCOPE, floor 30 min, ceiling 60 — and it is stated in the charter, never left to
the lane's judgment mid-session.** It was a flat 25 until 2026-09-10, which proved too short once the
checklist was checked against what this lane brings back. Split it ~20% setup · ~65% explore · ~15% write-up.

| Scope | Box | Because |
|---|---|---|
| single-layer, single-domain, an obvious surface | **30 min** | the floor. Below it the lane is setup plus a glance, and its charter items go unreached |
| cross-layer, or ≥2 domains, or an all-layer chain | **45 min** | each extra layer is its own surface to reach, sign into and read |
| a new feature / Epic, or a domain whose §1 purpose is `UNDECLARED` | **60 min** | the ceiling. Nothing earns more: past an hour the lane has stopped resolving named unknowns and started browsing |

**The floor and the ceiling are doing different jobs.** The floor stops the lane being cheap and useless —
an under-boxed session reaches two of five charter sources and reports three as unknown, which costs a
browser lane to learn nothing. The ceiling stops it becoming `/qa-exploratory`, which already exists and
is the right tool when a feature genuinely needs an open-ended session.

**Its cost to the critical path depends on where the strategy put it.** Alongside the checklist runners it
costs a lane and no wall time; **first**, the runners wait for it, so a 60-minute box is an hour before the
checklist executes. What *first* buys: checks whose items were **seen**, not inferred from ACs.

- **Overrun ⇒ take what returned.** The join proceeds on what the lane returned. A lane whose box is spent
  does not hold the join.
- **Unreached charter items are NAMED, never dropped.** Each source present is either covered by a
  session note or recorded `NOT REACHED + reason`. An omitted source reads as a source with nothing in it,
  which is the one thing it must never read as.
- **A skip is stated with its reason.** No free lane, tracker down, environment unhealthy at preflight —
  each is a recorded `SKIP: <reason>` in `verdict.md`, never an absent line. A lane that ran and found
  nothing is a different fact from a lane that never ran.

---

## 6. It INVOKES `/qa-exploratory ticket <ticket-key>`

**The lane is not a private exploratory session — it is `/qa-exploratory` with a derived charter.**
`/qa-test` invokes [`/qa-exploratory`](../../commands/qa-exploratory.md) in its **`ticket` mode**, which is
why that command carries no `disable-model-invocation: true`: it is a pipeline step with a caller, and a step
nothing may call is a step that never runs.

**This is deliberately NOT the visual lane's pattern.** That one dispatches `vc-test:ui-ux-expert` and never runs
the `/qa-design` **command**, because the command is only a shell over that same agent; the agent invokes the
`vc-test:qa-design` **skill** itself ([`visual-axis.md`](../../../plugins/vc-test/skills/qa-design/visual-axis.md) §2).
`/qa-exploratory` is the opposite: it is where the substance lives — the subtract/supply oracle split, the
`[THEORETICAL]`-first ECL rule, the surprise-seeking box, the persona and tour filters, the `Fate`
capture-back contract, and the report shape `/qa-review-oracles` reads. Re-briefing an agent with a
paraphrase of that is how the two copies drift. **So the division is one line: this lane supplies the
CHARTER; `/qa-exploratory` runs the SESSION.**

```
/qa-exploratory ticket <ticket-key> <env>     # Charter from the strategy (+ the model); 30-60 min box
```

Pass the run's env: the lane is a subagent, shares the session's env binding and never re-binds it
([`run-env.md`](../../knowledge/execution/run-env.md)). It checks the argument against that binding and STOPs
when they differ. `ticket` mode **STOPs without a charter** (§7) — that, not a frontmatter flag, is what keeps
it from firing unprompted; it is read-only against the product, files nothing, transitions nothing and edits
no oracle.

The charter payload `/qa-test` hands it — which `ticket` mode consumes in place of the ad-hoc charter
authoring in `/qa-exploratory` §Exploration Charter:

```
Charter (ticket mode) — <ticket-key>. Box: <30|45|60> min HARD — sized to scope by §5 and stated here.
Derived from the approved strategy and, when it ran, the test model; do NOT widen it.

Mission — the sources present (1–3 from a model, 4–5 from the run, 6 from the strategy), each covered or reported NOT REACHED + reason:
  1. Unresolved chain links (mechanism matrix GAP/WAIVED): [cells]
  2. Unresolved reverse edges: [edges]
  3. {HYPOTHESIS} oracles to ground, with the scenario row each belongs to: [rows]
  4. ACs flagged DRIFT / NOT-FOUND / CONTRADICTS by the bundle: [ACs]
  5. Cases at risk the staleness check kept — is the OLD assertion stale, or is the change wrong: [case ids + assertions]
  6. Strategy risks the Exploratory row names: [R-n — what a customer would see — oracle or open question]
  + UNVERIFIED mind-map nodes: [node ids]

Value chain (Test Model Part 0, verbatim, when a model ran): [chain]
Domains: [domains]   Model: {RUN_DIR}/test-model.md | none — no MODEL risk   Strategy: [path · Round N]
Test data: [the Data cells the charter items need — resolve at runtime, never hardcode]

Extra returns this caller needs, beyond /qa-exploratory's own §Output tables:
  - Model amendments (chain links / variants / reverse edges), with evidence
  - Per {HYPOTHESIS} row: the OBSERVED value, or "not reached + reason"
  - Per mission item (every source present): covered, or NOT REACHED + reason
  - Net-new scenarios with a proposed Fate — no case is authored in this run
Do NOT file bugs — hand them back; the caller's triage and 5-file own severity and filing.
```

**Everything not in that payload is `/qa-exploratory`'s own and is not restated here** — the environment
and build pre-flight, the 24 h duplicate check, the subtract/supply oracle load, the technique choice, the
`Fate` and `Oracle ref` columns, the report path and shape, the escalate-on-Critical rule, and the lane
rule (`.claude/rules/agents.md` §Parallel Execution).

---

## 7. Gate — inline, at the Stage 4 join

- **`ticket` mode STOPs without a charter.** No strategy Exploratory row and no model, or no unresolved
  item in any source, means there is no mission — the lane is recorded as not run with that reason. Never
  improvise one.
- Each charter source present is **covered or `NOT REACHED + reason`**.
- Every `{HYPOTHESIS}` row is either grounded to `{OBSERVED}` (with the value) or **restated as still a
  hypothesis**.
- Every net-new scenario carries an `Oracle ref` **and** a `Fate`, and is a row of the checklist's `X` table.
- The model amendments are **applied to the existing file**.
- The category-8 session report exists, or `SKIP: <reason>` is recorded.
