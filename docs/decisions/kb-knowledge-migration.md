# Moving `.claude/knowledge/**` into the knowledge base — a conceptual plan

**Date:** 2026-09-21 · **Status:** conceptual, nothing built, nothing decided beyond the shape.
Companion to [`kb-procedural-plane.md`](./kb-procedural-plane.md), which fixes the shape of the first
additional plane; this file fixes the shape of the whole migration around it.

Never loaded by an agent. If any of this is built, the normative text will be `scripts/kb/**` plus one
line each in `CLAUDE.md` §Essential Rules → *Product context* and `.claude/rules/agents.md`. This file
is the reasoning and the ledger of what was deliberately not done.

---

## The question

The base today holds one kind of record: what an agent OBSERVED about how the platform behaves. The
repo also holds 56 files of other kinds — oracles, domain maps, execution rules, API contracts,
selectors, team instructions. The goal is a single knowledge repository shared across teams and
customers, written by agents rather than by hand. **Which of those files belong in the base, in what
shape, and in what order?**

## What was already true before deciding anything

### Two systems, disjoint by construction

| | `.claude/knowledge/**` | `vc-knowledge` (the base) |
|---|---|---|
| Size | 56 files, **1.89 MB** (always-loaded tier: 67 KB) | **106 entries**, ~300 words each |
| Written by | humans in a PR, or an agent under review (`ba-system-analyzer` auto-applies oracle edits behind a 3-source bar; `/qa-domain-map` builds domain maps). Three files are genuinely generated | `kb_capture` mid-run; identity `anchors + scope`; `confirm` / `dispute` maintain it |
| Retrieved by | **path citation, never a query** — something in the loaded tier names the file | `kb_ask` → token overlap + `ANCHOR_BONUS = 10` → top 3 |
| Read as | **the whole file.** `business-logic.md` is 409 KB ≈ 100k tokens | one entry |
| Reaches | every clone of this repo | anyone, including a customer deployment |

The file tier holds what an agent must **obey**; the base holds what agents **observed**. The
mitigation the file tier already needed — `bl:extract` / `ecl:extract`, and the README's own
*"slice, never hand over the whole file"* — is a hand-built retrieval layer per oracle. That is the
clearest signal that the file tier has outgrown file-granular retrieval.

### Demand, from the base's own logs

65 log files, measured 2026-09-21: **112 `ask`, 79 answers, 33 misses (29%)**; 18 `capture`,
16 `confirm`, 1 `dispute`.

### The objection that started this, and why it is correct

*"You can look these facts up in the code or on the environment at the moment."* Do not defend the
base against it. **It is the admission rule.** From the `vc-kb-lab` utilisation study quoted in
`kb-procedural-plane.md` — ever served in any retrieval, or ever anchored on a coordinate touched in
4,223 logged tool calls:

| Entry shape | Ever in front of anybody |
|---|---|
| Generated GraphQL types | 11% |
| Generated REST endpoints | 29% |
| Facts written by agents | 69% |
| Flows | **100%** |

78.5% of that corpus was never seen by anyone. *"The plane that is free to generate is the dead one;
the plane that costs a run to write is the live one."* This repo already states the same rule for
values in `.claude/rules/test-data.md` GOLDEN RULE, and enforces it for the three generated files.

---

## Decision 1 — the admission rule: four shapes, and nothing else

An entry earns its place only when re-deriving it costs a run AND the answer is not in any one file.
Four shapes, each present in the current corpus:

1. **Layer divergence.** `price-sort-indexed-vs-resolved`: the sort uses the indexed price field, the
   UI renders the resolved one. Every file is correct; the surprise exists only in the composition.
2. **The disambiguation that cost a run.** *"Does Skyflow's `update()` re-validate a stale CVV?"*,
   *"is the gift line added automatically or must the shopper accept it?"* — third-party, ES, or cache
   behaviour, not in our source at all.
3. **Which assertion is safe to write.** `KB-02238DE5`: the org role gates CONTROLS, not ROUTES. The
   code gives you the guard; the entry tells you the test you were about to write is wrong.
4. **Provenance and contest.** Deployment, timestamp, author, trust count, `dispute`. A code read
   gives a belief with no history and no way for the next reader to learn it was wrong.

**Everything re-derivable stays out**, and a generator plus a drift gate owns it instead.

The cost argument is a number, not a preference: a flow entry records *78 tool calls* between reaching
`/cart` and seeing the order in Admin, most of them rediscovering steps. Acceptance is the metric
`kb-procedural-plane.md` already names — **tool calls from goal stated to goal reached, before and
after.** If it does not move, the objection wins and the plane is cut.

The one thing the objection cannot reach: an agent on a customer deployment cannot read our runs. A
shared repository is the only mechanism by which a behaviour found on one deployment reaches another
team. That is why `vc-knowledge` is a separate repo, and it is the reason the migration exists.

## Decision 2 — sort by WHAT THE CONTENT IS, not by which folder it sits in

Three classes, one test each:

| Class | Test | Destination |
|---|---|---|
| **Instruction** | must an agent obey it without having thought to ask? | stays in the loaded tiers (`CLAUDE.md`, `.claude/rules/`, skills, commands). **Never a base entry.** |
| **Derivable** | can a script produce it from a source of truth? | generator + drift gate. Never an entry. |
| **Observed** | did somebody have to go and look? | the base, split into planes by QUESTION (Decision 3). |

**Why instruction may not move, stated separately because it is the load-bearing half.** Retrieval is
opt-in: the agent must suspect it does not know AND phrase the question in the base's language. That
failure is measured in this repo — `.claude/hooks/kb-harvest.mjs`'s own header: *six sessions, 203 tool
calls, zero asks*, and an A/B with every `kb` schema preloaded called nothing. Put `reports-policy.md`
or `quality-gates.md` behind a query and they silently stop applying. `CLAUDE.md` §Where the rules live
already states the criterion for the loaded tier; this decision is that criterion applied to the base.

## Decision 3 — a plane earns its existence by its QUESTION, not its index

**Rejected: one index per note type, with a question searching all indexes and composing one context.**
The first half is right; the second is measured to be wrong.

Measured 2026-09-14 (`kb-procedural-plane.md` Decision 2): one flow written into the fact plane
**cleared the relevance floor on 18 of 34 replay rows** and took rank 1 on *"which endpoint lists the
payment methods a store has enabled"*. Comparable facts cluster at 6–7 rows. The cause is structural,
not dimensional: a procedure accumulates the generic nouns of a journey — cart, order, payment, search,
Admin — so it is a plausible answer to most questions asked in ordinary words.

**A separate index does not fix it.** `core/index-load.mjs:loadIndex` merges every declared index into
one row list and `ask` ranks over the merge; the lab had separate indexes for two planes and they still
competed. So: disjoint corpora, one verb per question (`ask` — what does it do · `how` — how do I do it
· `broke` — what has failed here), each verb refusing the other's questions, and on a miss a **pointer**
to the other verb, never a merged result.

## Decision 4 — the migration is staged, and each stage has a stop condition

Ordered by dependency. Nothing is a big-bang move.

| # | Stage | What | Stop / acceptance |
|---|---|---|---|
| 0 | **Admission rule + classification ledger** | Write Decision 1 as a one-page rule; classify all 56 files three ways per Decision 2. **Ledger only, zero moves.** `kb_capture` warns when a claim looks derivable | Also the artifact that answers the objection. Do this before anything else |
| 1 | **Question split + flows** | Exactly `kb-procedural-plane.md` stages 0–4 | Its own gate: under ~10% procedural misses ⇒ do not build. **This stage proves the multi-plane mechanism everything else needs**; `push.mjs` multi-index is the only real blocker |
| 2 | **Oracle plane** (`BL-*`, `ECL-*`, `VC-*`) | Question: *what must hold / what has broken here?* Storage moves into the base; **IDs are a citation contract and never move**; `bl:extract` becomes a renderer over the base instead of a slicer of a 409 KB monolith | `bl:lint` / `ecl:lint` / `oracles:rank` keep passing against the rendered output. Largest token win available: 409 + 121 + 33 KB read whole today |
| 3 | **Domain maps — harvest, do not migrate** | The maps are mostly enumeration, which `/qa-domain-map` + `domain:check` already own. Harvest only the **"where the layers DISAGREE"** sections into the fact plane | Maps stay files. Cheap, no contract risk |
| 4 | **Multi-tenant scoping** | The base is **PUBLIC**. Sharing across customers needs a deployment/tenant scope axis, a public-vs-customer split, and an overlay model (a customer-local base shadowing the shared one) | **Decide before pushing more content in.** Cheap at 106 entries, a migration at 1,000 |
| 5 | **Demand, not storage** | Dispatch briefs naming `mcp__kb__kb_ask` by id; capture triggers at run close | Measured in `.claude/rules/agents.md`: the same prompt with the grounding line produced 2 asks / 1 capture / 2 confirms; without it, zero |

## Decision 5 — the bottleneck is demand, and it outranks the migration

112 asks across the base's whole life, against 203 tool calls in six sessions that asked nothing.
**Migrating 1.89 MB into a base nobody queries makes the objection true rather than false.** Stage 5 is
last only because it needs the planes to exist; by importance it sits beside stage 0. If exactly one
thing is done before any content moves, it is stage 0 plus the grounding line from stage 5.

---

## What this knowingly does not decide

- **Which of the 56 files land in which class.** That is stage 0's output and it is deliberately not
  guessed here.
- **The shape of a `broke` plane.** Named in Decision 3 as the oracle plane's question; its identity
  rule, its verbs and its rot model are unexamined — `kb-procedural-plane.md` needed a whole document
  for the equivalent work on flows.
- **Whether BL/ECL can leave the file tier at all.** They are oracles, which makes them partly
  instruction ("classify as FAIL regardless of whether a JIRA spec covers it") and partly observed
  knowledge with 3-source provenance. Stage 2 assumes the split is clean. It may not be.
- **Anything about `plugins/vc-fix/knowledge/`**, the mirrored copy under byte-parity CI.

## Sources

- This repo — `.claude/knowledge/**` (56 files, sizes as of 2026-09-21), `.claude/knowledge/README.md`,
  `.claude/hooks/kb-harvest.mjs` header, `.claude/rules/agents.md` §Agent Delegation,
  `.claude/rules/test-data.md` GOLDEN RULE, `CLAUDE.md` §Where the rules live,
  `scripts/kb/core/{index-load,rank,push}.mjs`
- `vc-knowledge` — `index.json` (106 entries), `log/**` (65 files: 112 ask / 79 answer / 33 miss,
  18 capture, 16 confirm, 1 dispute), `entries/KB-02238DE5.md`
- [`kb-procedural-plane.md`](./kb-procedural-plane.md) — the utilisation table, the 18-of-34 retrieval
  measurement, the `aboutGoal` rule, and the acceptance metric, all quoted rather than re-derived
