# The pre-flight axes — one mechanism, five instances

Single source of truth for the derived tokens `1b` resolves: **`layer` (2b) · `visual_surface` (2c) ·
`contract_surface` (2d) · `coverage_surface` (2e) · `data_surface` (2f)**. The command carries one table; this file carries the
contract they share and the ways they genuinely differ. **Cite it; never restate it.**

Each axis's own *behaviour* stays in its own file, which this one does not duplicate:
[`visual-axis.md`](visual-axis.md) (the three sub-axes, verdict vocabulary, browser budget) ·
[`contract-refresh.md`](contract-refresh.md) (two artifacts, two commands, `UNKNOWN`, drift as a `1e` input) ·
[`coverage-triage.md`](coverage-triage.md) (`runFate`, the four dispositions, the `REPAIR`/`RE-BASE` split) ·
[`authoring.md`](authoring.md) §Step 3a (what `test-data-engineer` owns once `data_surface` is `true`).

---

## 1. Why this file exists

The four axes were added one at a time, each by the same template: a derived token in `1b`, a gate, a
`summary.json` block, a skill file, a paragraph in `CLAUDE.md`, a row in
`.claude/rules/skills-commands.md`. **Six documentation sites per axis, four axes, and nothing ever
generalised** — so ~176 lines across the surface restated one derivation contract, with
*"derived, never asked, never defaulted"* appearing seven times, *"unresolved is treated as true"* six, and
*"null means the source was not consulted, which is a gap, not a zero"* three.

That was expensive, but the real cost was worse: **the boilerplate hid the one difference that matters.**
All four were introduced as *"same block, same discipline"* — and §3 shows that phrase is **false on the
most consequential rule in the block**. Three separate files each also claimed their own asymmetry was
*"the flattest"*.

Adding axis #5 should now be **one table row here and one row in the command**, not six documents.

---

## 2. The shared contract — stated once

Every axis obeys all five. Where an axis differs, it is §3, and it says so explicitly.

1. **Derived, never asked, never defaulted.** The operator is not a source. A token comes from the diff,
   the derived `layer`, the suite manifest, or the ticket's own fields — never from a question, and never
   from a convenient default.
2. **Recorded with its sources.** `<axis>.surface_source[]` is **always** populated, even when the answer is
   `false`. Following `release.layer_source[]`'s own rule: **`null` means the source was not consulted,
   which is a gap, not a zero.**
3. **`false` is recorded, not omitted.** An absent block reads as *the axis was clean*; a recorded `false`
   with its sources reads as *the axis did not apply, and here is why*. Those are different facts and the
   artifact must be able to tell them apart.
4. **A skip is stated with its reason.** Same rule one level down: an omitted result is indistinguishable
   from a passing one.
5. **The token is a LANE trigger, never an EFFORT trigger.** No axis promotes FAST → FULL. Effort comes
   only from ticket type × status at `1a` (`ticket-routing.md`).

---

## 3. Where they differ — and 2b is the one that matters

**`layer` fails CLOSED. The other three fail OPEN.** This is the single most consequential rule in the
block, and it was the one the shared *"same discipline"* phrasing concealed.

| | `layer` (2b) | `visual_surface` (2c) | `contract_surface` (2d) | `coverage_surface` (2e) | `data_surface` (2f) |
|---|---|---|---|---|---|
| **Unresolved ⇒** | **`null` + `UNRESOLVED`** | `true` | `true` | `true` | `true` |
| Shape | 6 values + `cross-layer` | boolean | boolean | boolean | boolean |
| Dispatches an agent? | no | **yes** (`ui-ux-expert`) | no | no | **yes** (`test-data-engineer`) |
| Costs I/O in `1b`? | no | no | **yes** (~8.6 s) | yes (~1 s, wave B) | yes (~1 s, wave B) |
| Has a conflict rule? | **yes** (`layers_conflict`) | no | no | no | no |
| **Adds** a step, or **gates** one? | gates 5f/5h | adds the visual lane | adds two refreshers | adds Step 2a | **gates Step 3a** |
| Consumed by | 5f / 5h routing | Step 4's visual lane | `1c`/`1d`/`1e`/3b pack | Step 2a's dispositions | Step 3a's dispatch |

**Why `layer` alone fails closed.** Every other axis answers *should we also do X?*, where a wrong `true`
costs one agent or one script and a wrong `false` leaves a gap nobody sees — so doubt widens. `layer`
answers *who is this written for?*, and a wrong value does not add work, it **routes the release note and
the documentation to the wrong audience**. There is no safe default: `storefront` is not a conservative
guess, it is a specific wrong answer. So an unresolvable layer is `null`, 5f refuses the fragment
(`release.refusal: "layer-unresolved"`) and names no command.

**`data_surface` is the one axis that SUBTRACTS.** The other four ask *should we also do X?*, so a
`true` adds work. This one asks *does this ticket need data that does not exist yet?* — and it was
effectively pinned `true`: the command listed `3a` as an unconditional member of the Step-3 wave under
a *"seeded env, green `td:validate`"* gate, while the only escape hatch was one sentence in
[`authoring.md`](authoring.md) phrased as *"skip **only when** every planned case resolves"* —
default-on with a burden of proof to skip. So an opus `test-data-engineer` was dispatched on runs whose
cases resolved entirely against fixtures the environment already held.

It still fails **open** (`true`), for a sharper reason than the others: authoring against data that does
not exist produces cases that come back BLOCKED and get triaged as product defects, while a needless
dispatch costs one browserless agent inside time Step 3 already spends on `3x` and `B`. And "existing
data is enough" is **two** claims rather than one — the fixtures must *resolve* **and** be
*discriminating* on the links under test, the second being what `.claude/rules/test-data.md` §SECOND
RULE measures (Loyalty Missions: flat $30 orders resolved perfectly and left the feature's central
question undecidable). Only the second needs judgment, which is why the token gates the dispatch rather
than replacing it.

**The three fail-open axes are not equally flat, and none of them needs to claim it is flattest.** Each
simply states its own trade: a wrongly-run visual lane costs **one agent**; a wrongly-run contract refresh
costs **one introspection call**; a wrongly-run coverage scan costs **one script run**. Against that, a
skipped visual pass leaves no trace, a skipped refresh leaves the run reading a snapshot of unknown age,
and a skipped triage leaves stale assertions nobody looks at again. That is the whole argument; it does not
need a superlative.

---

## 4. Effort — FULL derives, FAST opts in

**On FULL every axis derives and runs, as it always has.**

**On FAST they are opt-in, default off** — `--visual` · `--contract` · `--coverage` · `--axes` (all three).
`layer` is not on that list: it derives on both paths, always, because 5f and 5h need it and it dispatches
nothing. **`data_surface` is not on it either, and for the opposite reason:** it can only ever *remove* a
dispatch, so making it opt-in would restore the always-on cost it exists to end. It derives and applies on
both paths — on FAST it gates the same `3a`, which that path had always described as *"test data if
needed"* without ever saying who decides.

This restores a promise the pipeline had quietly inverted. `SKILL.md` §Effort routing records that the
FAST/FULL split was made precisely because the old design marked everything expensive
*"both paths, always"* — and by 2026-09-03 that phrase (or its equivalent) had reappeared **15+ times**
across this surface, one axis at a time, each with a locally reasonable argument. `contract-refresh.md`
said the contradiction out loud: it ran on FAST *"despite FAST being 'a checklist and nothing else'"*.

**The evidence says these are predictions, not measurements.** Across the 28 `/qa-test` runs in git
history: `visual` has run **once**, `contract` **once**, `coverage_triage` **zero times populated**. All
three appear in exactly one artifact in the repo's entire history. That is not evidence they are bad — they
are days old — but it is not evidence they earn a place on the cheap path either. **Revisit each axis once
it has 5+ runs**, and promote it to FAST-by-default on what those runs show.

The per-axis arguments for running on FAST are real and are kept in each axis's own file (the change class
most likely to break the UI / the contract / existing assertions is precisely the class FAST routes). They
are why the flags exist and are one keystroke away — not why they should be on by default before anyone has
measured them.

---

## 5. Record

One block per axis in `summary.json`, and the field names are **nested, matching the schema**:
`visual.surface_source[]`, `contract.surface_source[]`, `coverage_triage.surface`, `release.layer_source[]`,
`test_data.surface` + `test_data.surface_source[]`.
A flat `visual_surface_source[]` spelling is drift — `npm run qa-test:doclint` (DOC-005) catches it.

In every block, **`null` means the axis never ran**; an empty array means it ran and found nothing. The
schema is `.claude/templates/qa-test-summary.schema.json` and `npm run summary:validate` enforces it.
