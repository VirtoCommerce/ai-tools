# Contract refresh — refresh the GraphQL schema and fixtures BEFORE anyone reads them

**This file is the only place `/qa-test`'s contract refresh is specified** — what runs when the approved
strategy's row is `Contract refresh: RUN`. The command's Stage 3 and `qa-test-model/test-model.md` **cite it
and never restate it**.

It exists because the refresh used to have no owner. A run reads the xAPI contract at several points — the
test model, the checklist, the runners' packs — and once refreshed it at none of them. The instruction that
did exist was advisory and unowned: `ba-system-analyzer` and `ba-api-specialist` were told to *"refresh
via `npm run schema:refresh` if stale"* — a judgment call handed to an agent with no way to make it. Both
definitions have since been corrected to the opposite rule (**"never judge its staleness yourself"**,
`knowledge/agents/ba/ba-system-analyzer-knowledge-files.md` (the `graphql-schema.md` row) / `ba-api-specialist.md` line 93), and they now say what to do when no rev
arrives: treat the snapshot as UNKNOWN age and report every field name taken from it as **unverified**.
That is correct and it is also the cost — an unrefreshed run loses its GraphQL grounding rather than
guessing at it, which is precisely why the refresh belongs to the caller.

Two properties of the tooling make *"if it looks stale"* unworkable rather than merely loose:

- **`loadSchemaCache` has no age check** (`scripts/lib/graphql-validator.ts`). It parses whatever is on
  disk, however old. So `npm run graphql:fixtures:validate` — the fixture gate — **passes clean against a
  months-old cache**. A false green, with no warning line.
- **Outside a ticket run the cache is one shared file, not one per environment**
  (`scripts/.graphql-schema.cache.json`). A `TEST_ENV=vcptcore` run validates against whichever env refreshed it
  last. Inside one (`npm run run:use`) the refresh, the fixture gate and the runner all use the run's own
  `{RUN_DIR}/.graphql-schema.cache.json` ([`run-output.md`](../../knowledge/execution/run-output.md)). The fixture library records this itself — `test-data/graphql/index.json` carries `backUrl` and
  `lastValidated` — so the mismatch is *readable*. Nothing was reading it.

The failure mode is the expensive one. A stale contract does not error; it produces checks asserting a
field that was renamed or missing an arg that became required, and those come back FAIL or BLOCKED in
execution and get triaged as product defects. Same class as the hand-transcribed spacing grid that
manufactured ~7 phantom `BL-UI-002` failures (`.claude/rules/test-data.md` §GOLDEN RULE): a stale
constant failing silently by *inventing* findings.

---

## 1. When the row is `RUN`

The row is the strategy's (`/vc-test:qa-test-strategy` procedure step 9: the diff names a GraphQL operation
or changes a REST contract). Reading the bundle in this repository, any of these is that signal:

| Source | Signal |
|---|---|
| **The PR diff** | a `.graphql` document · an `*ExperienceApi*` path · a `*.Web/Controllers` path · a `*GraphType*` / `*Request*` / `*Command*` / DTO file on a module's API surface |
| **The suites at risk** | a suite tagged `graphql` / `xapi`, or one under `regression/suites/Backend/graphql/` · `Backend/api/` |
| **The ticket's own ACs / STR** | they name a query, mutation or response field. An AC written as *"`loyaltyMissionProgress` returns …"* is a contract assertion whatever the diff says |

A storefront-only diff counts when it touches a `.graphql` document or a composable's query body: the
storefront is an xAPI *client*, and a renamed field breaks it with no backend file in the diff at all.

**In doubt, `RUN`.** A skipped refresh leaves the run reading a snapshot of unknown age; a needless one costs
one introspection call. There is no expensive direction, which is why the doubt case is not a judgment call.
A `SKIP` carries its reason like any other row.

---

## 2. TWO artifacts, TWO commands — and they are not the same refresh

This is the part that gets conflated, including in one currently-wrong line of
`.claude/agents/ba-api-specialist.md`. There are two independent stale things, refreshed by two different
scripts, and running one does **not** freshen the other.

| Artifact | What reads it | Refreshed by | Notes |
|---|---|---|---|
| `.claude/knowledge/api/graphql-schema.md` — inside a ticket run `{RUN_DIR}/knowledge/api/graphql-schema.md` | **the agents** — the test model, the checklist, the runners' packs | `npm run schema:refresh` | Writes only this file. Its header carries the introspection date (`> **Source**: … (YYYY-MM-DD)`) — that date is the rev you quote. **Does NOT touch the schema cache.** |
| `scripts/.graphql-schema.cache.json` (inside a ticket run `{RUN_DIR}/.graphql-schema.cache.json`) + the 74 fixtures under `test-data/graphql/` | **the runner and the fixture gate** — `graphql-runner.ts`, `validate-graphql-fixtures.ts` | `npm run graphql:fixtures:validate:refresh` | Introspects live, `saveSchemaCache`, then validates all 74 fixtures and **exits non-zero on drift**. |

So when the row is `RUN`, Stage 3 runs **both — concurrently, in one message**:

```bash
npm run schema:refresh                      # the agent-facing oracle          — ~8.5s
npm run graphql:fixtures:validate:refresh   # the cache + the 74-fixture gate  — ~1.8s
```

**There is no order to preserve.** They write disjoint targets (`graphql-schema.md` · the cache +
the `graphql-fixtures-validation.md` report; inside a ticket run all three in `{RUN_DIR}`) and each introspects the endpoint independently, so neither
reads the other's output. Measured on vcst-qa: **10.4 s serial → 8.6 s parallel**. Read **both** exit codes:
run serially, a failed `schema:refresh` would mask whatever the fixture gate had to say, and §3 needs both.
The reason to batch is the round-trip, not the seconds ([`sequencing.md`](sequencing.md) §Concurrency).

**`npm run schema:check` is not a substitute for either.** It introspects, renders, and writes nothing —
a *liveness* check. It never compares against the committed snapshot, so it cannot detect drift and a
green `schema:check` is not evidence the committed file is current. Do not cite it as a drift gate
(unlike `tokens:check` / `selectors:check`, which are).

---

## 3. Verdict rules — three, each closing a way the refresh could lie

**1. A failed refresh records `UNKNOWN` and NEVER falls back to the committed snapshot.** Identical to
`/preflight`'s `build.deployed: UNKNOWN` rule, for the identical reason: silently reading the stale file
is indistinguishable from reading a fresh one, and every downstream `{DOC}` oracle then rests on it. An
unreachable endpoint records `contract.schema.refreshed: "UNKNOWN"` with the reason, is stated in
`verdict.md`, and **every GraphQL assertion that would have been grounded `{DOC}` off that snapshot is
downgraded to `{HYPOTHESIS}`**, so the run cannot quietly bank an ungrounded contract claim.

**2. Fixture drift is a model and strategy INPUT before it is anything else — and it is never auto-filed.** A
non-zero exit from the fixture gate has two very different causes, separated by *whose* change caused it:

| Drift on | Means | Action |
|---|---|---|
| an op the **ticket's own diff** touches | the contract moved as designed | **an input** — a contract change is a value-chain link and a candidate reverse edge: into the run context for the model, and an Amendment when it changes a risk. Fixture upkeep is `/qa-test-lifecycle`'s |
| an op the ticket does **not** touch | pre-existing drift, or an unannounced upstream break | **record, do not chase.** Cross-check `build.releasedThrough.breaking[]` (`/preflight`) — a ⚠ BREAKING row in the same component is the likeliest cause. Name it in `verdict.md`; fixing it is `/qa-test-lifecycle`'s |

Neither case files a bug from the gate alone. A schema-validation failure is a claim about a *query
document*, not about product behaviour — the same rule that makes a static-diff finding a suspicion rather
than a defect.

**3. A skip is stated, never silent.** A `SKIP` row carries its reason, like a skipped visual lane. An
omitted refresh reads as a clean one, and the whole point is that a stale contract has no symptom of its own.

---

## 4. What the refresh must actually reach

Refreshing a file nobody was handed changes nothing. Two hand-offs are load-bearing:

- **The model's and the runners' briefs carry the snapshot's REV, not only its path:** *"`graphql-schema.md`
  @ `<refresh date>` — refreshed this run"*. An agent told to *consult a file* has no basis on which to judge
  staleness, and its own definition now correctly forbids it from trying — so **with no rev the agent
  downgrades every GraphQL field name it uses to unverified**, and the run silently loses the grounding
  it was supposed to gain. Being handed a rev is what converts that refusal into evidence.
- **The runners' pack carries the refreshed fragments** ([`dispatch-pack.md`](dispatch-pack.md)). That pack
  must be cut from the refreshed file, or the fan-out efficiently distributes one stale contract to every
  lane at once.

One thing this refresh deliberately does **not** do: re-derive the fixture inventory.
`test-data/graphql/index.json` *is* the inventory (74 ops, each with `usedBy[]`), and its
`totalFixtures` counter is **not gate-enforced** — so treat the directory as the truth and the counter as
a hint.

---

## 5. Cost

One introspection call against `{{BACK_URL}}/graphql` plus one validation pass over 74 documents. No
agent, no browser lane, no gate for a human to clear. It is also the cheapest of the three freshness gates
the repo runs for this same reason (`tokens:sync` → `tokens:check`, `selectors:sync` → `selectors:check`) —
and the only one whose stale artifact is read by *agents writing assertions* rather than by a script.

---

## 6. Out of scope, deliberately

- **The REST/Swagger surface.** No generated snapshot exists to refresh; `ba-api-specialist` reads live
  Swagger. A REST drift gate is separate work, not a widening of this one.
- **The BL oracle / the ECL.** Oracle freshness is `/qa-review-oracles`' job, on its own
  triangulation + value bar. This refresh covers *contracts* (what the API exposes), never *invariants*
  (what it must do).
- **Committing the refreshed snapshot.** Inside a ticket run the refresh writes the run's copy and the
  git-tracked `.claude/knowledge/api/graphql-schema.md` is untouched: promoting it is the operator's copy.
  Outside one the refresh rewrites the tracked file, so it will appear in the working tree. `/qa-test` does **not** commit it. Report the change; let a
  human commit it.
