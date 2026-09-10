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
the (since-deleted) `rules/skills-commands.md`. **Six documentation sites per axis, four axes, and nothing ever
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

**`layer` and `data_surface` fail CLOSED. The other three fail OPEN.** This is the single most consequential rule in the
block, and it was the one the shared *"same discipline"* phrasing concealed.

| | `layer` (2b) | `visual_surface` (2c) | `contract_surface` (2d) | `coverage_surface` (2e) | `data_surface` (2f) | `domain_map` (2g) |
|---|---|---|---|---|---|---|
| **Unresolved ⇒** | **`null` + `UNRESOLVED`** | `true` | `true` | `true` | **`false`** | **`unresolved` + recommend** |
| Shape | 6 values + `cross-layer` | boolean | boolean | boolean | boolean | **4 states** (`PRESENT`/`STALE`/`ABSENT`/`unresolved`) |
| Dispatches an agent? | no | **yes** (`ui-ux-expert`) | no | no | **yes** (`test-data-engineer`) | **FULL only**, and only on `ABSENT` + all-layer (`ba-system-analyzer`, `1c-map`) |
| Costs I/O in `1b`? | no | no | **yes** (~8.6 s) | yes (~1 s, wave B) | yes (~1 s, wave B) | **no** (one local frontmatter read) |
| Has a conflict rule? | **yes** (`layers_conflict`) | no | no | no | no | no |
| **Adds** a step, or **gates** one? | gates 5f/5h | adds the visual lane | adds two refreshers | adds Step 2a | **gates Step 3a** | **adds `1c-map` on FULL; RECOMMENDS on FAST. Gates nothing, ever** |
| Consumed by | 5f / 5h routing | Step 4's visual lane | `1c`/`1d`/`1e`/3b pack | Step 2a's dispositions | Step 3a's dispatch | `2-map`'s read order · `1c-map`'s trigger · `1e` clauses 11/11b · `1c`'s unmapped-surface report |

### 2g `domain_map` — the axis whose lane is a WRITE, not a read

**It resolves an artifact, not a surface.** Every other axis asks *does this ticket touch X, so should we
also test X?* This one asks *does the persistent answer to "what exists and where" EXIST yet?* —
`.claude/knowledge/domain/<name>.md`, `domain_slug` matching the ticket's domain. That makes its response
unlike any other: the other five *consume* something already in the repo, and 2g's `ABSENT` branch
**produces** it.

**So it triggers a lane on FULL and no lane on FAST, and the asymmetry is the whole design.**

| Path | On `ABSENT` + all-layer | Cost |
|---|---|---|
| **FULL** | dispatch `ba-system-analyzer` to BUILD the map — item `1c-map`, in the message that already carries `1c ‖ 1d ‖ 2-load` | one BA pass **once per domain, ever**; it lands in the run's existing dispatch wave rather than adding one |
| **FAST** | recommend `/qa-domain-map <slug>` in one line and proceed | **zero** — one local frontmatter read |

**FAST is untouched, and that is load-bearing.** The FAST promise is *one execution agent*
([`SKILL.md`](SKILL.md) §Effort routing); 2g adds nothing to it and still cannot regrow the *"both paths,
always"* problem §4 exists to prevent. **The axis derives on both paths; only its lane is FULL-only** —
the same shape as `data_surface`, which derives everywhere and dispatches only where it must.

**Why the build was promoted from a recommendation (2026-09-10).** The recommendation was honest and it
did not work: the map existed for **1 of 13** domains months after the mechanism shipped, because a
recommendation arrives at the moment its cost is least welcome — mid-run, to someone who came for a ticket
verdict, about an artifact that pays off on the *next* ticket. Each individual decline was correct and the
aggregate was that clauses 11 and 11b — the two that catch the failure the other ten cannot see — were
satisfied by writing down `ABSENT` on almost every run. A run that can build the thing in a wave it is
already paying for should build it. **What did NOT change: nothing about this axis blocks, and a build
failure degrades to exactly the old behaviour.**

**And a `STALE` map is still never auto-refreshed.** A refresh rewrites a tracked knowledge file, carries
`D*`/`G*` ids forward and must contradict its previous rev out loud. *Days since `generated`* is a
staleness suspicion, not a mandate to rewrite — that decision stays with an operator (`--refresh`).

**Four states, not a boolean, because absence and staleness are different facts with opposite consequences.**

| State | Means | Consequence |
|---|---|---|
| `PRESENT` | a map matches the slug and is inside `stale_after_days` | `2-map` reads it first; `1e` clauses 11/11b bind against its inventory; **`5h-map` writes back what the run verified** ([`reporting.md`](reporting.md) §5h-map) |
| `STALE` | matches, but past `stale_after_days` | **read it, and treat every claim as a hypothesis** — a stale map is the *more* dangerous artifact, because it is read as current and arrives with a written deliverable's authority. Recommend `--refresh`; **never auto-refresh**. `5h-map` still amends it — upgrading a stale cell with a live observation is strictly an improvement, and it moves `amended`, never `generated`, so the map stays STALE until someone re-enumerates |
| `ABSENT` | no map for this slug | **only if the chain is all-layer** — FULL builds it at `1c-map`, FAST recommends. Single-layer, or a build that failed: `1e` records `Domain map: ABSENT — chain position unverified` |
| `unresolved` | slug did not resolve, or the directory was unreadable | same as `ABSENT` — **fail open** (build on FULL, recommend on FAST); see the fail direction below. A slug that `bl:extract --list` does not know **stops the build, never the run**: a map filed under a slug no oracle uses is a map nothing can look up |

**Fail direction: fail-OPEN on the build, fail-NEVER on blocking.** A false positive now costs one BA pass
on a domain that turns out not to need a map — recoverable, and the map is still true. A false negative
repeats the failure the axis exists to catch. But **no state of this axis ever blocks a run**, and that is
the clause the promotion to a build must not erode: `1c-map` joins before `1e` and the run does not wait on
it past that point, a failed or gate-refused build leaves `state: ABSENT` and proceeds, and a missing map
is never a finding about the product. `npm run domain:check` encodes the same asymmetry: **stale fails,
missing passes.**

**Two-moment axis, like `coverage_surface`.** At `1b` 2g the all-layer question is answered
**provisionally** — from `1a`'s domains plus whether the domain has a back-office surface at all — because
the ticket's value chain does not exist until `1e`. It is **confirmed at `1e`** against Part 0. And it
reads the **CHAIN, not the diff**: VCST-5317's diff was storefront + xAPI with no admin-spa file, so a
diff-based read stays silent, while its chain's first link is *an admin locks the membership* — an
Admin-layer action, and exactly where the mechanism it tested blind actually lives.

**It is the only axis a run REPAYS, and since 2026-09-10 the repayment actually lands.** `1c` reports
surfaces it touched that the map does not list into `domain_map.unmapped_surfaces[]`, and **`5h-map`
writes them into the map** after the verdict — along with a `D*` confirmed or refuted live, a `G*` this
run closed, and a §4 count it proved wrong. Before that step those reports were proposals, which is the
same shape as the recommendation above and failed the same way. Two guards make the write safe: it runs
**after 5f**, so a run can never bind clause 11b against inventory it widened itself, and it moves
`amended` and never `generated`, so amending is never mistaken for re-enumerating.

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

**And because it SUBTRACTS, it is the one fail-open axis that was wrong — it now fails CLOSED**
(`unresolved ⇒ false`, dispatch nothing, state the skip). Fail-open here recreated the exact flaw the
paragraph above names: *default-on with a burden of proof to skip*. An axis that dispatches an opus agent
whenever it is unsure is not subtracting — the subtraction only happened when someone could affirmatively
prove `false`. Measured 2026-09-04 on VCST-5738: a 20-line storefront transport change derived
`data_surface: true`, and the dispatched agent built a seeder + spec module + validator + unit tests + two
`package.json` scripts + aliases + docs in a tracked rules file — all reverted, because the "missing data"
was a **shopping cart**, which three UI clicks create.

**The burden is now on NEEDING a fixture, and one distinction decides it:**

| The data is | Then | Because |
|---|---|---|
| **Session state a user creates** — a cart and its lines, a comparison list, a search, a draft quote | **`false`.** Create it in-test through the real UI, and name that as the covering answer | it is not a fixture at all. Seeding it builds permanent infrastructure for what a click produces, and the seeded copy then drifts from what a real user would have |
| **Already in the env and DISCOVERABLE** — any product, catalog root, address, coupon, cart | **`false`.** Resolve it at **layer 3** (`live-discover`) and NAME the primitive in the record | seeding what the env already holds maintains a second copy that drifts out of step with it. Products also have a **plural** probe — `discoverCatalogProducts(api, count)` in `scripts/lib/seed-common.mjs`, already used by four seeders — so *"are there ≥N buyable products"* is answerable. Pricelists, coupons, orgs and inventory have **no count primitive**, so there the honest answer is a singular non-null probe or a stated assumption — not a seeder |
| **Seeded reference data that discovery could NOT supply** — a new entity type, a new store/org/role, a new pricing or inventory shape | judge normally (below) | it must pre-exist, be `@td()`-resolvable, and be identical on every env |
| **A PRODUCT capability you have not confirmed exists** — a second addressable cart, a shared list | **`false`, and establish it first** | *"can this even exist?"* is a source/live question worth minutes. Dispatching a build agent to find out means it builds first and answers second |

For genuinely seeded data a `false` still needs **two** claims, not one — the fixtures must *resolve*
**and** be *discriminating* on the links under test, the second being what `.claude/rules/test-data.md`
§SECOND RULE measures (Loyalty Missions: flat $30 orders resolved perfectly and left the feature's central
question undecidable). Only the second needs judgment, which is why the token gates the dispatch rather
than replacing it.

**The residual risk of failing closed, stated rather than hidden:** authoring against data that does not
exist yields BLOCKED cases triaged as product defects. That is caught one step later — Step 3's gate
re-derives whether every planned case resolves — and a fixture need surfacing there still goes to
`test-data-engineer`, never to an inline seeder.

**The three REMAINING fail-open axes are not equally flat, and none needs to claim it is flattest.** Each
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

**One per-type exception — and it is a TYPE default, not a new always-on axis.** A `Review task`
([`ticket-routing.md`](../../knowledge/execution/ticket-routing.md) §5a) runs **`coverage` by default on
FAST**. That type is a *contribution* — a fix or improvement to behaviour that already exists and that
existing rows already assert — so *"which existing rows does this change make wrong?"* is what the
ticket is **about**, not a speculative extra; and because its priority is auto-set and it carries no
ACs, Step 2a is also the only step that reads the change against the corpus at all. `visual` and
`contract` stay opt-in there exactly as everywhere else. This is the shape the "revisit at 5+ runs"
rule below asks for — promote an axis where the evidence for it actually is, per type, rather than
flipping it on for every FAST run.

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
`test_data.surface` + `test_data.surface_source[]`, `domain_map.state` + `domain_map.sources[]`.
A flat `visual_surface_source[]` spelling is drift — `npm run qa-test:doclint` (DOC-005) catches it.

In every block, **`null` means the axis never ran**; an empty array means it ran and found nothing. The
schema is `.claude/templates/qa-test-summary.schema.json` and `npm run summary:validate` enforces it.
