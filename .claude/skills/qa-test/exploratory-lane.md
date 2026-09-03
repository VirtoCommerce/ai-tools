# Step 3x — the discovery lane: explore the model BEFORE authoring against it

Single source of truth for `/qa-test`'s exploratory lane. The command
([`.claude/commands/qa-test.md`](../../commands/qa-test.md) Step 3) schedules it and states its gate; this
file holds the charter derivation, the four outputs, the verdict rules and the reasons. **Cite it; never
restate it.**

---

## 1. The hole it closes

The pipeline had exactly one place where a human-shaped question got asked of the live product before a
verdict: Step 4, which runs a checklist and a set of cases **already written**. Everything upstream of that
is derivation — `1c` reads code, `1d` reads ACs against a diff, `1e` builds a fault model out of both, and
Step 3 authors cases from the model. Not one of those steps *looks at the running feature*.

That ordering has a specific, measurable cost, and the repo already recorded it twice:

- **The model's hypotheses are never tested before they become cases.** `1e`'s gate accepts an oracle that
  *"says what would make it one"* — i.e. `{HYPOTHESIS}` — and the provenance gate then forbids a
  `{HYPOTHESIS}` surviving promotion (`GRD-001` escalates it to Blocker in a promoted case). So a
  hypothesis-grounded row is authored, executed, and *then* found ungroundable at 5g. The cheapest moment
  to ground it is before it is written, and that costs one live look.
- **A `GAP` cell is a cell nobody has looked at.** The mechanism coverage matrix forces `GAP` / `WAIVED` to
  be written down rather than left blank — but writing `GAP` is where it currently ends. On Loyalty
  Missions the mechanism end-to-end got 11% coverage, the last chain link got one case written on the
  final day, and no model existed at all; the missing input was never *more derivation*, it was somebody
  driving the chain once.
- **Discovery already existed and was never wired into a ticket run.** `/qa-exploratory` is fully built —
  10 techniques, a charter library, personas, the ECL/BL supply axes — and `reports/exploratory/` held
  **one** session across the life of the repo, from a sprint-planning path. A capability invoked by nothing
  is a capability the pipeline does not have.

So the lane is not "add exploratory testing to `/qa-test`". It is: **spend one browser lane, during time
the pipeline is already spending on seeding, to convert the model's guesses into observations before
anyone authors a case against them.**

---

## 2. Where it runs, and why exactly there

```
Step 3
  3a  test-data-engineer  ──────────────────────┐   (Node + Platform-API, ZERO browser lanes)
  3x  /qa-exploratory ticket ───────────────────┤   (1 chrome/edge lane — never firefox, hard-boxed)
  B   testing checklist   ──────────────────────┘   (pure authoring off 1d's ACs, no I/O)
                                                 │
                                                 ▼
  A   test cases ── authored from the model AS AMENDED by 3x
```

Three properties make this placement the only one that works:

- **3a takes no browser.** `test-data-engineer` is explicitly browserless (`.claude/rules/agents.md`:
  *"none — authors AND runs seeders live (Node + Platform-API, no browser)"*). So the lane is genuinely
  free concurrency against the max-3 cap, not a lane stolen from execution.
- **Before Artifact A is the whole point.** Its outputs are *inputs to authoring*. Run it after Step 3 and
  it can only produce a second opinion about cases already committed to the corpus; run it after Step 4
  and it is `/qa-exploratory`, which already exists.
- **It cannot overlap Step 4.** Step 4 may use all three lanes (checklist agents + visual lane +
  regression). 3x closes before Artifact A, which closes before Step 4, so the cap holds by construction
  and needs no arbitration rule.

**FULL only.** Three of its four outputs (model amendments, hypothesis grounding, scenario rows) have **no
consumer on FAST**, which writes no model and authors no cases. The fourth — net-new scenarios — is real on
any path, but it is `/qa-exploratory`'s own job and does not need to ride inside a ticket run to happen.
Adding a second browser agent to FAST would also break its one-execution-agent promise for a second time,
and the visual lane's justification (*the change class most likely to break the UI is exactly the class
FAST routes*) has no analogue here. State the skip; do not leave it implied.

---

## 3. The charter is DERIVED from the model — five named sources, zero invention

This is what separates the lane from a generic exploratory session, and it is the reason it fits a 25-minute
box: the mission is not "go look at checkout", it is a list of specific unknowns the pipeline has already
written down and cannot resolve by reading.

| # | Source | What it contributes to the mission | Where it came from |
|---|---|---|---|
| 1 | Every `GAP` / `WAIVED` cell in the **mechanism coverage matrix** | the chain links nothing covers — drive them | `1e` |
| 2 | Every **reverse edge** not resolved to a scenario # | does the effect actually reverse? `ABSENT IN PRODUCT` is a finding, and only a live look can say so | `1e` |
| 3 | Every scenario row whose oracle is **`{HYPOTHESIS}`** | the expected value nobody has seen — observe it | `1e` |
| 4 | Every AC marked **DRIFT / NOT-FOUND / CONTRADICTS** | `1d` already says *"a static-diff finding is a suspicion, verify it live"* — this is where that verification happens | `1d` |
| 5 | Every Step-2a **`RE-BASE`** row | is the existing assertion stale, or is the change wrong? The disposition deliberately defers that; a live look answers it a step earlier than Step 4 would | `2a` |

**Sources 4 and 5 are not new work — they are work the pipeline already deferred and never scheduled.**
`1d` says to carry every DRIFT into execution *"as a thing to verify live"*, and Step 2a's `RE-BASE` is
resolved by the run. Both were promises redeemed at Step 4 or later, i.e. after authoring. Redeeming them
here costs nothing extra and makes the cases better.

**Then, and only then, the open half.** The remaining box time runs the ordinary discovery technique from
[`scenario-discovery.md`](../qa-sbtm/scenario-discovery.md) — surprise-seeking first — with the ECL's
domain `[THEORETICAL]` sections as candidate shapes and the domain's `BL-*` as the correctness oracle
(`/qa-exploratory` §5a, both read to **supply**). The suites and `vc-bug-catalog.md` are read to
**subtract**, exactly as there.

**Never invent a charter the model does not contain.** Same anti-hallucination discipline as
`/qa-exploratory sprint` mode (*"read the charters, don't invent them"*) and as `regression:select`'s
refusal to name a suite id it did not read.

---

## 4. Four outputs, each with a named consumer

A lane whose findings reach no consumer buys a one-off observation and nothing else — the exact failure
`/qa-exploratory`'s `Fate` column exists to prevent. So every output is routed:

| # | Output | Consumer | Rule |
|---|---|---|---|
| 1 | **Model amendments** — a chain link that does not exist, one nobody enumerated, a variant, a reverse edge that turns out to be real | `1e`'s file | **Amend, never fork.** Keep `<TICKET>-<date>.md` at its original date (a same-day second file collides and splits one fault model in two — the `--iterate` rule). A `GAP` cell becomes a scenario # or a `WAIVED + reason` that now has evidence behind it |
| 2 | **`{HYPOTHESIS}` → `{OBSERVED}` grounding** — the value actually read, per row | Artifact A's assertions | The single biggest quality win. A row grounded here is authored with an assertion that can be **graded**; one left ungrounded is authored knowing it is a hypothesis, and 5g will hold it. Either is fine; silently forgetting which is not |
| 3 | **Net-new scenarios**, each with a `Fate` | the model's matrix, then Artifact A | `PROMOTE` means **authored in THIS run** — a new scenario row and a case in the batch — not deferred to a later sprint. That is the difference from `/qa-exploratory`, where `PROMOTE` schedules future work. `DECLINE` carries one line of why |
| 4 | **Oracle Feedback** — `[THEORETICAL]`→`[OBSERVED]`, a candidate pattern, a contradicted invariant | `/qa-review-oracles` | **Proposals, never edits.** `ba-system-analyzer` is the sole writer of both oracles and IDs are a citation contract |

**Bugs found in the lane are ordinary findings and the lane files none of them.** They enter 5a's triage
with the run's other findings, take a provenance (usually PRE-EXISTING, since the lane explores adjacent
ground), and are filed or held by 5d's existing severity floor. The lane has no filing path of its own —
same rule as Step 2a (*a scan is a claim about a test case, never about the product*) and 2d.

**A Critical finding stops the lane immediately** and escalates, exactly as in `/qa-exploratory`.

---

## 5. The box, and what happens when it runs out

**25 minutes, hard: ~5 setup · ~15 explore · ~5 write-up.** The box is what makes the lane compatible with
"speed up the pipeline" rather than in tension with it: it runs entirely inside 3a's own wall-clock in the
common case, so its marginal cost to the critical path is `max(0, 3x − 3a)`.

- **Overrun ⇒ take what returned.** Artifact A proceeds on the amendments received. A lane that has not
  returned when 3a is green and B is written does not hold the gate.
- **Unreached charter items are NAMED, never dropped.** Each of the five sources is either covered by a
  session note or recorded `NOT REACHED + reason`. An omitted source reads as a source with nothing in it,
  which is the one thing it must never read as.
- **A skip is stated with its reason.** No free lane, tracker down, environment unhealthy at `1b` item 1 —
  each is a recorded `SKIPPED: <reason>`, never an absent block. `summary.json.discovery = null` means the
  lane **never ran**; an empty findings array means it ran and found nothing. Those are different facts.

---

## 6. It INVOKES `/qa-exploratory ticket <ticket-key>`

**Step 3x is not a private exploratory session — it is `/qa-exploratory` with a model-derived charter.**
`/qa-test` invokes [`/qa-exploratory`](../../commands/qa-exploratory.md) in its **`ticket` mode** (Step 0b
there), which is why that command **no longer carries `disable-model-invocation: true`**: it is now a
pipeline step with a caller, and a step nothing may call is a step that never runs — which is how the whole
discovery capability came to sit at one session in the life of the repo.

**This is deliberately NOT the visual lane's pattern.** That one dispatches `ui-ux-expert` and is told
*never* to invoke `/qa-design`, because `/qa-design` is only a shell that delegates to that same agent —
invoking it would buy a level of indirection and nothing else. `/qa-exploratory` is the opposite: it is
where the substance lives. The subtract/supply oracle split (§5a), the `[THEORETICAL]`-first ECL rule, the
surprise-seeking box, the persona and tour filters, the non-firefox lane rule with its 6× confirmation, the
`Fate` capture-back contract, and the report shape `/qa-review-oracles` reads — all of it is there and
nowhere else. Re-briefing an agent with a paraphrase of that is how the two copies drift, and the
paraphrase is always the copy that goes stale.

**So the division is one line: this lane supplies the CHARTER; `/qa-exploratory` runs the SESSION.** In
`sprint` mode the charter comes from the plan's §5.3 `exploratoryCharters[]`; in `ticket` mode it comes from
the Test Model's own unresolved cells (§3), and `/qa-test` is the only caller that has one. Everything
downstream of the charter — pre-flight, technique selection, the session, the report — is that command's,
unchanged and not restated here.

```
/qa-exploratory ticket <ticket-key>     # Step 3x. Charter from the Test Model; 25-min box; chrome/edge
```

**Auto-invocation is not a risk here and the guard is not the frontmatter flag.** `/qa-exploratory` is
read-only against the product, files nothing, transitions nothing, and edits no oracle — its only write is
its own category-8 report. What keeps it from firing unprompted is its description and the fact that
`ticket` mode **STOPs without a charter** (§7), not a flag.

The charter payload `/qa-test` hands it — which `ticket` mode consumes in place of the ad-hoc charter
authoring in `/qa-exploratory` §Exploration Charter:

```
Charter (ticket mode) — <ticket-key>. Box: 25 min HARD. Derived from the Test Model; do NOT widen it.

Mission — five sources, each covered or reported NOT REACHED + reason:
  1. Unresolved chain links (mechanism matrix GAP/WAIVED): [cells]
  2. Unresolved reverse edges: [edges]
  3. {HYPOTHESIS} oracles to ground, with the scenario row each belongs to: [rows]
  4. ACs flagged DRIFT / NOT-FOUND / CONTRADICTS by 1d: [ACs]
  5. Step-2a RE-BASE rows — is the OLD assertion stale, or is the change wrong: [case ids + assertions]

Value chain (Test Model Part 0, verbatim): [chain]
Domains: [1a domains]   Model: reports/ba/test-models/<TICKET>-<date>.md
Test data: [the @td()/{{VAR}} 3a has confirmed seeded so far — resolve at runtime, never hardcode]

Extra returns this caller needs, beyond /qa-exploratory's own §Output tables:
  - Model amendments (chain links / variants / reverse edges), with evidence
  - Per {HYPOTHESIS} row: the OBSERVED value, or "not reached + reason"
  - Per mission item 1–5: covered, or NOT REACHED + reason
Do NOT file bugs — hand them back; the caller's 5a/5d owns triage, severity and filing.
```

**Everything not in that payload is `/qa-exploratory`'s own and is not restated here** — the environment
and build pre-flight, the 24 h duplicate check, the subtract/supply oracle load, the technique choice, the
`Fate` and `Oracle ref` columns, the report path and shape, the escalate-on-Critical rule, and the lane
rule (chrome/edge, **never firefox** — a firefox placement costs the whole box, not a degraded session).

---

## 7. Gate (3x — inline, never a verifier dispatch)

- **`ticket` mode STOPs without a charter.** No Test Model, or a model with no unresolved cell in any of
  the five sources, means there is no mission — say so and skip the lane. Never improvise one, exactly as
  `sprint` mode STOPs rather than inventing a charter set the plan does not contain. This, not a
  frontmatter flag, is what stops the command running unprompted.
- Each of the five charter sources is **covered or `NOT REACHED + reason`**.
- Every `{HYPOTHESIS}` row is either grounded to `{OBSERVED}` (with the value) or **restated as still a
  hypothesis**, so Artifact A authors it knowingly and 5g's hold is not a surprise.
- Every net-new scenario carries an `Oracle ref` **and** a `Fate`; every `PROMOTE` appears in the model's
  matrix and in a Step-3b batch.
- The model amendments are **applied to the existing file** before Artifact A is authored.
- The category-8 session report exists, or `SKIPPED: <reason>` is recorded.
- `summary.json.discovery` is written (`null` only when the lane never ran).

**It never blocks the Step-3 hard-STOP gate.** The Step-3 verifier re-derives the model↔case coverage it
always did; it does not re-run the session. What the verifier *does* check is the one thing that is
checkable from artifacts: that no matrix cell reads `GAP` while the session report claims that link was
driven — a contradiction between two of the run's own records.

---

## 8. Record

`summary.json.discovery`:

```jsonc
{
  "ran": true,                       // false + reason, or the whole block null = never ran
  "lane": "playwright-chrome",
  "minutes": 24,
  "charter_sources": {               // per source: covered | NOT_REACHED + reason
    "matrix_gaps": ["L3×variantB: covered", "L5×variantA: NOT_REACHED — no fixture"],
    "reverse_edges": [], "hypothesis_rows": [], "ac_drift": [], "rebase_rows": []
  },
  "hypotheses_grounded": 4,          // {HYPOTHESIS} → {OBSERVED}
  "hypotheses_remaining": 1,
  "model_amendments": 3,             // applied to reports/ba/test-models/<TICKET>-<date>.md
  "scenarios_new": [{ "id": "EXP-01", "fate": "PROMOTE", "case_id": "SR-042", "oracle_ref": "NONE" }],
  "oracle_proposals": 2,             // routed to /qa-review-oracles
  "bugs_surfaced": ["handed to 5a — never filed here"],
  "report": "reports/exploratory/SBTM-<ticket-key>-2026-09-03.md"
}
```

Two arrays are kept apart for the same reason `visual` splits `invariant_failures[]` from `advisory[]`:
`hypotheses_grounded` is what improved the run's cases, `scenarios_new` is what improved the corpus. A
single count would let a lane that only ever produced scenario ideas look like one that also grounded the
model — and the second is the reason the lane runs *before* authoring rather than after.

---

## 9. Deliberately out of scope

- **FAST.** §2.
- **Filing.** §4.
- **Editing an oracle.** §4 — proposals only.
- **Widening the regression scope.** A discovered scenario becomes a `Draft` case (Artifact A) and rides
  the run's existing case-scoped tracks; it does not add suites to Artifact C.
- **Replacing `/qa-exploratory`.** That command owns sprint-scoped, domain-scoped and charter-library
  discovery on its own budget. This lane is ticket-scoped, model-derived and boxed — a different mission
  with a different charter source.
- **Running twice.** On `--iterate`, the lane runs in **round 1 only**: the model is amended, never
  re-derived, and rounds 2+ re-run failed cases against a fix. A second session would explore a surface
  whose fault model has not changed.
