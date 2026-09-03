# The contract-refresh axis — refresh the GraphQL schema and fixtures BEFORE anyone reads them

**This file is the only place the `/qa-test` contract-refresh axis is specified.**
`commands/qa-test.md`, `skills/qa-test/SKILL.md`, `authoring.md` and `test-model.md` **cite it and never
restate it** — the same single-source-of-truth discipline `ticket-routing.md` holds for flow routing and
[`visual-axis.md`](visual-axis.md) holds for the design/a11y lane.

It exists because the axis had no owner in this pipeline. `/qa-test` reads the xAPI contract at four
points — `1c`'s surface analysis, `1d`'s AC↔implementation check, the `1e` fault model, and the
per-layer authoring pack Step 3b compiles — and **refreshed it at none of them**. The instruction that
did exist was advisory and unowned: `ba-system-analyzer` and `ba-api-specialist` were told to *"refresh
via `npm run schema:refresh` if stale"* — a judgment call handed to an agent with no way to make it. Both
definitions have since been corrected to the opposite rule (**"never judge its staleness yourself"**,
`ba-system-analyzer.md` line 42 / `ba-api-specialist.md` line 93), and they now say what to do when no rev
arrives: treat the snapshot as UNKNOWN age and report every field name taken from it as **unverified**.
That is correct and it is also the cost — an unrefreshed run loses its GraphQL grounding rather than
guessing at it, which is precisely why the refresh belongs to the caller. The
sibling pipeline already does this properly: `/qa-test-lifecycle` Pre-Flight step 4 runs the refresh for
a GraphQL scope and passes the file into the delegation payload. `/qa-test` was the outlier.

Two properties of the tooling make *"if it looks stale"* unworkable rather than merely loose:

- **`loadSchemaCache` has no age check** (`scripts/lib/graphql-validator.ts`). It parses whatever is on
  disk, however old. So `npm run graphql:fixtures:validate` — the fixture gate — **passes clean against a
  months-old cache**. A false green, with no warning line.
- **The cache is one shared file, not one per environment** (`scripts/.graphql-schema.cache.json`,
  hard-coded in three scripts). A `TEST_ENV=vcptcore` run validates against whichever env refreshed it
  last. The fixture library records this itself — `test-data/graphql/index.json` carries `backUrl` and
  `lastValidated` — so the mismatch is *readable*. Nothing was reading it.

The failure mode is the expensive one. A stale contract does not error; it produces cases asserting a
field that was renamed or missing an arg that became required, and those come back FAIL or BLOCKED at
Step 4 and get triaged as product defects. Same class as the hand-transcribed spacing grid that
manufactured ~7 phantom `BL-UI-002` failures (`.claude/rules/test-data.md` §GOLDEN RULE): a stale
constant failing silently by *inventing* findings.

---

## 1. `contract_surface` — the token

Derived at `1b` item 2d, **after 2b** (two of its four sources are 2b's own output). The **shared
derivation contract** is stated once in [`axes.md`](axes.md) §2 and is **not** repeated here. Values:
`true` · `false` · `unresolved`; records `contract.surface_source[]`. What is specific to this axis:

| # | Source | Yields `true` when |
|---|---|---|
| 1 | **The PR diff** | a `.graphql` document · an `*ExperienceApi*` path · a `*.Web/Controllers` path · a `*GraphType*` / `*Request*` / `*Command*` / DTO file on a module's API surface |
| 2 | **The derived `layer`** | `api`, or `cross-layer` with `api` among its members |
| 3 | **The target suites' manifest tags** | a suite tagged `graphql` / `xapi`, or one under `regression/suites/Backend/graphql/` · `Backend/api/` |
| 4 | **The ticket's own ACs / STR** | they name a query, mutation or response field. An AC written as *"`loyaltyMissionProgress` returns …"* is a contract assertion whatever the diff says |

`storefront` · `admin-spa` · `platform` alone yield `false` — with one carve-out: a **`storefront` layer
whose diff touches a `.graphql` document or a composable's query body is `true`**, because the storefront
is an xAPI *client* and a renamed field breaks it with no backend file in the diff at all.

Record `contract.surface_source[]` **always**. Following `release.layer_source[]`'s own rule: **null means the
source was not consulted, which is a gap, not a zero.**

**`unresolved` is treated as `true`.** The axis fails *open*, in the same direction as *"when in doubt,
take FULL"* — but note the asymmetry is even flatter here: a skipped refresh leaves the run reading a
snapshot of unknown age, while a needless one costs one introspection call. There is no expensive
direction, which is why the doubt case is not a judgment call.

**It is a pre-flight trigger, not an effort trigger.** `contract_surface: true` does **not** force
FAST → FULL, and it dispatches no agent.

---

## 2. TWO artifacts, TWO commands — and they are not the same refresh

This is the part that gets conflated, including in one currently-wrong line of
`.claude/agents/ba-api-specialist.md`. There are two independent stale things, refreshed by two different
scripts, and running one does **not** freshen the other.

| Artifact | What reads it | Refreshed by | Notes |
|---|---|---|---|
| `.claude/knowledge/api/graphql-schema.md` | **the agents** — `1c`, `1d`, `1e`, the Step-3b authoring pack | `npm run schema:refresh` | Writes only this file. Its header carries the introspection date (`> **Source**: … (YYYY-MM-DD)`) — that date is the rev you quote. **Does NOT touch the schema cache.** |
| `scripts/.graphql-schema.cache.json` + the 74 fixtures under `test-data/graphql/` | **the runner and the fixture gate** — `graphql-runner.ts`, `validate-graphql-fixtures.ts` | `npm run graphql:fixtures:validate:refresh` | Introspects live, `saveSchemaCache`, then validates all 74 fixtures and **exits non-zero on drift**. |

So when `contract_surface` is `true`, `1b` item 2d runs **both — concurrently, in one message**:

```bash
npm run schema:refresh                      # the agent-facing oracle          — ~8.5s
npm run graphql:fixtures:validate:refresh   # the cache + the 74-fixture gate  — ~1.8s
```

**There is no order to preserve.** They write disjoint targets (`graphql-schema.md` · the cache +
`reports/graphql-fixtures-validation.md`) and each introspects the endpoint independently, so neither
reads the other's output. Measured on vcst-qa: **10.4 s serial → 8.6 s parallel** — the saving is exactly
the smaller job, hidden under the introspection that dominates. Read **both** exit codes: run serially, a
failed `schema:refresh` would mask whatever the fixture gate had to say, and §3 needs both.

Do not read the 17% as the reason to do it. The reason is that a serial pair here is one extra
round-trip on the critical path *before* `1c` can dispatch, and round-trips — not script seconds — are
what this pipeline pays in ([`SKILL.md`](SKILL.md) §Concurrency).

**`npm run schema:check` is not a substitute for either.** It introspects, renders, and writes nothing —
a *liveness* check. It never compares against the committed snapshot, so it cannot detect drift and a
green `schema:check` is not evidence the committed file is current. Do not cite it as a drift gate
(unlike `tokens:check` / `selectors:check`, which are).

---

## 3. Verdict rules — three, each closing a way the refresh could lie

**1. A failed refresh records `UNKNOWN` and NEVER falls back to the committed snapshot.** Identical to
`1b` item 2's `build.deployed: UNKNOWN` rule, for the identical reason: silently reading the stale file
is indistinguishable from reading a fresh one, and every downstream `{DOC}` oracle then rests on it. An
unreachable endpoint records `contract.schema.refreshed: "UNKNOWN"` with the reason, is stated in the
Step-5 report, and **every GraphQL assertion that would have been grounded `{DOC}` off that snapshot is
downgraded to `{HYPOTHESIS}`** — which the provenance gate already forbids surviving promotion, so the
run cannot quietly bank an ungrounded contract claim.

**2. Fixture drift is a Test Model INPUT before it is anything else — and it is never auto-filed.** A
non-zero exit from the fixture gate has two very different causes, separated by *whose* change caused it:

| Drift on | Means | Action |
|---|---|---|
| an op the **ticket's own diff** touches | the contract moved as designed | **a finding for `1e`** — a contract change is a value-chain link and a candidate reverse edge, so it belongs in the fault model, and the *old* shape belongs in the regression scope. Update the fixture via `npm run graphql:fixtures:update` |
| an op the ticket does **not** touch | pre-existing drift, or an unannounced upstream break | **record, do not chase.** Cross-check `build.releasedThrough.breaking[]` (1b item 2a) — a ⚠ BREAKING row in the same component is the likeliest cause and already forces FULL. Name it in the Step-5 report; fixing it is `/qa-test-lifecycle`'s |

Neither case files a bug from the gate alone. A schema-validation failure is a claim about a *query
document*, not about product behaviour — the same rule that makes a static-diff DRIFT at `1d` a suspicion
rather than a defect.

**3. A skip is stated, never silent.** `contract_surface: false` is recorded with its sources, exactly
like a skipped visual lane. An omitted contract block reads as a clean refresh, and the whole point of
this axis is that a stale contract has no symptom of its own.

---

## 4. What the refresh must actually reach

Refreshing a file nobody was handed changes nothing. Two hand-offs are load-bearing:

- **The `1c` / `1d` / `1e` briefs carry the snapshot's REV, not its path.** `1c`'s dispatch already
  passes the raw ticket fields and the diff; it must also carry *"`graphql-schema.md` @ `<refresh
  date>` — refreshed this run"*. An agent told to *consult a file* has no basis on which to judge
  staleness, and its own definition now correctly forbids it from trying — so **with no rev the agent
  downgrades every GraphQL field name it uses to unverified**, and the run silently loses the grounding
  it was supposed to gain. Being handed a rev is what converts that refusal into evidence.
- **The Step-3b authoring pack carries the refreshed fragments.** `authoring.md` §3b compiles
  selectors/schema fragments into each per-layer brief precisely so four agents do not re-read the
  oracles. That pack must be cut from the refreshed file, or the fan-out efficiently distributes one
  stale contract to every batch at once.

One thing this axis deliberately does **not** do: re-derive the fixture inventory.
`test-data/graphql/index.json` *is* the inventory (74 ops, each with `usedBy[]`), and its
`totalFixtures` counter is **not gate-enforced** — so treat the directory as the truth and the counter as
a hint, and read the index **before** proposing a new fixture. Authoring a fixture that already exists is
the failure the index exists to prevent.

---

## 5. Cost, and the FAST question

One introspection call against `{{BACK_URL}}/graphql` plus one validation pass over 74 documents. No
agent, no browser lane, no gate for a human to clear. **Always on FULL. On FAST it is opt-in — `--contract`
(or `--axes`)** ([`axes.md`](axes.md) §4).

**The argument for running it on FAST is real, and it is why the flag is one keystroke away:** an xAPI
field rename or a newly-required arg is by construction *single-layer, single-domain, obvious surface,
P2* — so **the change class most likely to invalidate the contract is the class FAST routes** — and
unlike the visual lane this is not even an exception to FAST's one-execution-agent rule, because it
dispatches no agent at all.

**What that argument was missing is a measurement.** This axis was made mandatory on both paths on the
strength of the reasoning alone, and it is one of four axes that each did the same thing with its own
locally reasonable case; together they turned FAST into 4–6 agent dispatches and 3 external command
invocations — the precise *"both paths, always"* failure the FAST/FULL split was created to end. Across
the 28 recorded `/qa-test` runs, `contract` has been populated **once**. Revisit at 5+ runs and promote
it back to FAST-by-default on what they show, not on how good the argument sounds.

It is also the cheapest of the three freshness gates the repo runs for this same reason (`tokens:sync` →
`tokens:check`, `selectors:sync` → `selectors:check`) — and the only one whose stale artifact is read by
*agents authoring assertions* rather than by a script.

---

## 6. Out of scope, deliberately

- **The REST/Swagger surface.** No generated snapshot exists to refresh; `ba-api-specialist` reads live
  Swagger. A REST drift gate is separate work, not a widening of this one.
- **`business-logic.md` / the ECL.** Oracle freshness is `/qa-review-oracles`' job, on its own
  triangulation + value bar. This axis refreshes *contracts* (what the API exposes), never *invariants*
  (what it must do).
- **Committing the refreshed snapshot.** `graphql-schema.md` is git-tracked and the refresh rewrites it,
  so it will appear in the working tree. `/qa-test` does **not** commit it — the shared-tree rule
  (`.claude/rules/regression.md` §WORKING IN A SHARED TREE) applies, and a tree-wide commit from a test
  run is exactly what that section forbids. Report the change; let a human commit it.
