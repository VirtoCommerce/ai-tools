# Regression — pre-authoring scaffold (tc:alloc / tc:scaffold)

> **Moved verbatim from `.claude/rules/regression.md` on 2026-09-08** (PR 2 of the agentic-system audit) so it loads only when a task reads it. `rules/` is the always-loaded tier; this file is on-demand. Section anchors are unchanged.

## Pre-Authoring Scaffold — the plan is the gate, and the boilerplate is derived

Promotion (below) made the *end* of a case's life checkable. This is the other end. Authoring was
entirely manual: an agent read the Test Model, decided which rows were worth writing, and hand-typed all
fifteen columns. Both halves of that were expensive in a way nothing measured.

| Command | Does |
|---|---|
| `npm run tc:alloc -- --prefix <P> --block <name>=<n> [--block …]` | ONE corpus scan → **disjoint ID blocks**, one per batch |
| `npm run tc:scaffold -- --plan <plan>.json --out <staged>.csv [--id-block <P-NNN..P-NNN>] [--check] [--json]` | authoring plan → staged CSV + `.design.md` sidecar |

Core `scripts/test-cases/scaffold-rows.ts` + `scripts/test-cases/alloc-case-ids.ts`; unit tests
`scripts/unit/scaffold-rows.test.ts`, `scripts/unit/alloc-case-ids.test.ts`.

Five decisions, each of which was a live fork:

- **The three KEEP questions became fields.** `/qa-test-cases-generator` §3 step 6d requires a case to
  name the observable it reads, the customer-visible defect it catches, and why that defect is plausible
  *here* — and asked all three of prose no script could read, at a point where the case was already
  written. They are now required plan fields with a machine check: a length floor, a **null-hypothesis
  denylist** (`could fail to render`, `might not work`, …) applied to `defect`, and a closed set of three
  admissible grounds for `plausible` — a `VC-*` catalog entry, a filed bug (`VCST-*` / `reports/bugs/…`),
  or `mechanism: <what in this code makes it likely>`. Exactly the three §6d names; encoding exactly
  those is what stops the field decaying into "software has bugs".
- **Ten of fifteen columns are derived, not typed.** ID, Section, Priority, Business_Rule,
  Edge_Case_Refs, Test_Data, Cross_Layer_Checks, Failure_Signals, Cleanup, References (with the
  `Archetype:`/`Technique:`/`Probe:` stamps the appender demands), Automation_Status=`Draft` all fall out
  of `(layer, priority, archetype, technique, ticket)`. Only **Preconditions / Steps / Assertions** are
  authored, and they are left EMPTY on purpose — `npm run suites:review -- <staged>.csv` then names each
  one as `S-006`/`C-001`/`C-003`, so the remaining work is a linter-issued checklist rather than a
  convention. Derived cross-layer/failure-signal lines are deliberately generic: one naming a specific
  operation would be an invented literal (`GRD-002`).
- **Sweeps are read at run time, never transcribed.** `state-stress` (qa-design §State-Stress Pass, 7
  states) · `uip` (modern-web-attack-surface §`UIP-*`, 10 probes) · `toggle` · `date-range` (generator
  §3.5) each expand into rows whose defect hypothesis the owning document already wrote — so they pass
  the KEEP gate by construction and cost no judgment. A hardcoded copy of any of those tables would be
  correct once and then fail silently (`.claude/rules/test-data.md` §GOLDEN RULE), so a missing heading
  or a reshaped table is **exit 2**, never a sweep that quietly expands to nothing. `UIP-*` is not one
  failure shape, so it carries a per-probe archetype map and a probe with **no** mapping is a hard error
  rather than a wrong default. Waiving a swept item requires a reason.
- **It never writes into `regression/suites/`.** The output is a staged CSV in the scratchpad; the append
  stays with `append-test-cases-to-suite.ts`, run serially by the orchestrator. That is what makes
  concurrent per-surface authoring batches compatible with the one-author-per-CSV rule above — and it
  keeps a half-written file out of a corpus whose `suites:lint`/`suites:sync` hard-fail on a parse error
  anywhere, blocking every other author in the tree.
- **ID allocation moved BEFORE the fan-out.** `--check-global-ids` reads the corpus at *append* time, so
  two concurrent batches both pass it and then both write; the collision surfaces later as one run's
  evidence overwriting another's. `tc:alloc` scans once and hands out disjoint blocks, and `tc:scaffold`
  refuses to spill past the block it was given. Scope, stated honestly: this is deterministic within one
  planning step, **not a lock** — two sessions allocating against the same tree get the same block, which
  is the shared-tree problem and is answered by agreeing who authors, not by a lockfile.

Consumed by `/qa-test` Step 1e-plan (the gate) and Step 3/3b (scaffold + per-surface fan-out).

