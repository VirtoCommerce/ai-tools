# 5-status · 5-docs · 5-docs-map — transition, document, write back

> **Before any tracker write, read `knowledge/execution/tracker-ops.md` §0 — the GOLDEN RULE.** The run's one
> comment is `/vc-fix:qa-report`'s ([`close-out.md`](close-out.md) §HTML page and comment); a write here
> AMENDS it, never adds a second.

Read this when the verdict exists and the comment is posted. **The order is fixed and each step depends on the
one before it:** 5-status transitions **after** the comment, 5-docs documents **after** the transition, and
`5-docs-map` writes back to the domain map last (non-blocking). **Promotion is not here** — `/qa-test` never
promotes; cases are `/qa-test-lifecycle`'s ([`close-out.md`](close-out.md) §Hand-off to lifecycle).

## 5-status. Change status — `qa-lead` only, ask first, and BLOCKED is a row

Strictly **after** the comment is posted. **Single source of truth for the whole state machine:**
[`.claude/knowledge/execution/ticket-status-transitions.md`](../../knowledge/execution/ticket-status-transitions.md)
— cite it, never restate it. What this section owns is the 5-status-shaped summary of it.

| Verdict | Transition | Also required |
|---|---|---|
| PASS / PASS WITH NOTES | `Finish test` → TESTED | `PASS WITH NOTES` is a PASS; the notes live in the comment, never in a different transition |
| FAIL | `Need fixes` → REOPEN | The run's comment (amended, never a second one) lists every failure and every filed bug link, posted **before** the transition |
| **BLOCKED** | **none — deliberately** | A **mandatory comment** — the run's comment, amended — naming the blocker (env / data / dependency / not-deployed), what it blocks, and that the ticket awaits a re-run. It stays in-testing |

**Why BLOCKED transitions nothing, and why it needed a row.** This table had two rows for a four-value
verdict vocabulary, so a blocked run left the ticket in in-testing with no comment obligation and no rule
— reading to everyone else as *QA is testing this* while nothing was. Both alternatives are worse: TESTED
is a lie, and REOPEN files an env/data blocker into the developer queue as though it were a product
defect. So the honest state is *still in testing, and here is why nobody is testing it*, and the comment
is what makes that readable — which is why it is mandatory rather than nice-to-have. A run that STOPs at
a gate before 5-status is the same shape: the opening hop stays, and the close-out says so.

**Confirmation is asymmetric, and that is deliberate.** The Stage 0 opening hop is **never** confirmed
(reversible, and the operator implied it by invoking the command); this closing hop **always is** (it is
terminal for the run, it notifies watchers, and REOPEN hands work to another team). `--yes` does not
answer it.

**`qa-lead` is the only actor.** No specialist, runner, verifier, doer or sub-agent transitions a ticket,
including while it is already in the tracker posting a comment; it reports up instead.

On Jira both closing transitions require the in-testing status (the Stage 0 move); if that was skipped, do
the in-testing hop first (discover live). On Azure Boards set `System.State` directly. **TESTED is the
terminal state this command may reach — never Done or Cancelled.** Every hop **and every skip** appends to
`summary.json.status_transitions[]`.

### Close the loop

By default `/qa-test` verifies and reports; it never fixes — it states the next command and stops (pointers,
not auto-triggers). A `verify-fix` or `hotfix-verify` ticket never reaches this point: Stage 0 stopped and
named its command.

- **PASS / PASS WITH NOTES** → ticket TESTED; 5-docs calls `/qa-docs` and `5-docs-map` writes back to the
  domain map (non-blocking). Stale and candidate cases go to
  [`/qa-test-lifecycle`](../../commands/qa-test-lifecycle.md) (the close's last question).
- **FAIL → REOPEN** → `/vc-fix:qa-fix <ticket-key>` (autonomous G0–G7, never auto-merges) → human review + merge +
  deploy → `/vc-fix:qa-verify-fix <ticket-key>`. A too-complex/multi-repo bug (G0 BAIL) is handed to a human,
  resuming at `/vc-fix:qa-verify-fix`. Once the fix is deployed, a re-run of `/qa-test <ticket-key>` routes a
  Bug to `verify-fix`, since its status is now `fix-ready`; a Story or Task re-run is the strategy's next round.
- **BLOCKED** → resolve the blocker (env/data/dependency) and **re-run `/qa-test <ticket-key>`** from the
  top; no partial credit.

---

## 5-docs. Document the ticket — after 5-status, when it ends in Tested or Done

**Call [`/qa-docs <ticket-key>`](../qa-docs/SKILL.md)** (dispatch description `[vc-test:qa-test.docs]` when it is
dispatched). It writes the ticket's one document (What's new · How to set it
up · How it works), asks once before posting it as the documentation comment, builds the Motion film and records
`{RUN_DIR}/documentation.json`. Everything about it — the Tested-or-Done gate, the refusals, the evidence bar, the
media, the posting mechanics — is that skill's; nothing of it is restated here.

- **After 5-status**, because `/qa-docs` documents only a ticket in status Tested or Done, and 5-status is the
  step that moves it to Tested. A run that did not reach Tested does not call it, and says so in one line —
  an outcome, not a failure.

---

## 5-docs-map. Amend the domain map with what this run ESTABLISHED — when a map exists

Stage 1 builds the map when it is missing (`/qa-domain-map`). This is the other half of the same loop: when a
map already exists, the run **writes back what it verified**, so the inventory tracks the product instead of
decaying from the day it was built. It costs **zero dispatches** — every fact it writes is already in the
run's artifacts, produced by the lanes.

**Runs after 5-status**, and that ordering is a guard, not a convenience: the strategy and the model were
written against the map's inventory, so a run that widened the map first would be checking its own output.
The verdict is recorded before anything is written back.

**Independent of `/qa-docs`'s refusals** (`no-run`, `not-tested`, `not-deployed`, `not-user-visible`, `build-changed`). They decide whether
the *ticket* earned its document. A surface this run rendered is a fact either way, and a `FAIL` or
`BLOCKED` verdict changes nothing here — the map records what EXISTS, never what is correct.

### What may be amended — a closed list. Everything else stays a proposal.

| Evidence the run produced | The amendment | Why it is safe to write |
|---|---|---|
| A surface a lane reached that §2 does not enumerate (`domain_map.unmapped_surfaces[]`) | **append** a §2 row — `CONFIRMED`, with the ticket id and date | a new fact contradicting nothing already written |
| A `D*` row this run confirmed or refuted **LIVE** | **verdict upgrade in place** — `source-only` → `CONFIRMED`, or `CONFIRMED` → `DRIFT` **with what is actually true** | the id and the row's text survive; only the verdict moves, and the id is a citation contract |
| A `G*` gap this run closed | mark **`CLOSED` in place, with what closed it** | the shape already mandates exactly this |
| A §4 count this run proved wrong | **correct it out loud**, naming the new basis | the shape already mandates exactly this |
| A **new** cross-layer disagreement, observed live on both sides | append a **new `D*`** — `CONFIRMED` only | §3 is the map's highest-value section, and a live observation is the evidence bar it asks for |

**Never from a run:** §1 purpose or the value chain (a re-derivation, not an observation) · any claim
whose provenance is `{HYPOTHESIS}` or inference · a **deletion** of any row · a **renumber** of any id ·
anything observed on a different domain's surface. Each of those stays a proposal in the run's record.

**One evidence bar, and it is the run's own:** an amendment carries `CONFIRMED` and the observation
behind it. A claim the run could not verify live does not get written more weakly — it does not get
written. An unmarked or optimistic claim in a map is the specific way a map does more damage than no map
(shape gate clause 7).

### Three timestamps, and an amendment moves exactly one

| Field | Means | An amendment |
|---|---|---|
| `generated` | the date of the last full **enumeration** — what `domain:check` measures staleness against | **NEVER touched** |
| `rev` | which enumeration this is; bumped only by `/qa-domain-map` | **NEVER touched** |
| `amended` | the date of the last incremental write-back | **set to today** |

**This is the clause that keeps the freshness gate honest.** If an amendment bumped `generated`, a domain
touched by a ticket every few weeks would never go stale — and `domain:check`, the one gate that catches a
map describing a build that has moved, would be permanently silenced by a trickle of small true facts.
Amending is not re-enumerating: it adds what one ticket walked past, and says nothing about the surfaces
nobody looked at.

### Write it safely

- **Append a `§7 — Amendments` row** for every write: date · ticket · what moved (`§2 +2 surfaces`,
  `D3 source-only → CONFIRMED`, `G1 CLOSED`). A reader who cited `D3` can then see it was upgraded by a
  ticket rather than by an enumeration pass.
- **Re-read the file immediately before writing**, and allocate any new `D*`/`G*` id from *that* read —
  never from the copy read at Stage 0. Two `/qa-test` runs on one domain will otherwise both allocate
  `D7`. This is the suite-CSV discipline applied to a smaller file: **one author for the duration of a
  change**, and a conflict is handed to a human, never resolved with git
  ([`.claude/rules/regression.md`](../../rules/regression.md) §Suite inventory).
- Then run the shape's own gate clauses on the rows you touched, plus `npm run domain:check` and
  `npm run context:check`.
- **Nothing here blocks.** A failed amendment records `domain_map.amend_outcome: FAILED` with the reason
  and leaves the map untouched; the run's verdict was final at 5-verdict.

### The mind map — hand back, never amend inline

When `domain_map.mind_map` is set, this step does **not** edit the graph. Behaviour is a re-derivation,
which the closed list above already refuses to a run. The findings are `domain_map.mind_map_findings[]`
([`close-out.md`](close-out.md) §Files), each with the checklist row or case id and the run id; the next
`/qa-test-mind-map update --from <ticket>` consumes them, and this step writes nothing else. A missing mind
map is built only when the strategy's Mind map row is `RUN` (Stage 3), never here.

### Record it

`domain_map.amended_in_run` · `amend_outcome` (`AMENDED` / `NOTHING_TO_AMEND` / `FAILED` / `not-attempted`)
· `amendments[]` (the same rows written to §7). **`NOTHING_TO_AMEND` is a real outcome and is recorded** —
a run that touched only mapped surfaces and confirmed nothing new says so, which is different from a run
where this step never ran.
