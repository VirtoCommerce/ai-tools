# The dispatch pack — supply the text, not the path

Every fan-out in this flow hands several agents the same oracles. When the brief carries a *path*, each
agent opens it and pays for the whole file in its own context — N times, for the same bytes, to use the
same three or four rules. The 2026-09-07 audit measured this as the largest remaining runtime cost once
the always-loaded tier was re-tiered (the 2026-09-07 agentic-system audit, §6 items 7–8; the file was removed 2026-10-01).

This file is that reason, written once — and, more importantly, so is the **limit** on it, because the
pattern is easy to over-apply into something worse than the cost it removes.

## The rule, and its exact boundary

> **Text if the dispatcher already holds it AND it is identical for every recipient.
> Path if the recipient must derive, date, or triangulate it itself.**

Both halves are load-bearing. The first is pure waste removal. The second is the guardrail: a pack that
swallows a source the agent was supposed to *interrogate* does not save tokens, it removes a check — and
it removes it invisibly, because the brief still looks complete.

### Goes in the pack, as text

| Item | How to cut it |
|---|---|
| `BL-*` invariants for the scope | `npm run bl:extract -- --domain <d>` (`npm run bl:extract:list` for the tokens) |
| `ECL-*` edge-case patterns | `npm run ecl:extract -- --domain <d>` or `--chapter <n>` (`npm run ecl:extract:list`) |
| Selector and GraphQL-schema fragments | cut from the snapshot the contract refresh wrote, **stamped with its rev** |
| Test data as `@td()` / `{{VAR}}` tokens | resolved at runtime by the agent, never as literals (`.claude/rules/test-data.md`) |

Both extractors emit the oracle's own markdown verbatim, so a pack is the same authority character for
character and `BL-*` / `ECL-N.M` ids keep their citation contract with the suites. Nothing in a pack is
ever a paraphrase: a summarised invariant is a second, drifting copy of a single source of truth.

### Stays a path — or stays out

- **The bundle, the strategy, the model and the checklist.** They are the run's hand-off files: a brief
  names them by path and the recipient reads the part it owns (a runner its section letter). The
  orchestrator holds paths, not content.
- **Prior art.** `reports/ba/**` and `knowledge/domain/*` travel **as paths to READ**. A prior report is a
  *hypothesis* the agent must triangulate against the release ledger and a live check before it can
  carry `CONFIRMED` / `DRIFT` / `MISSING`. Hand it over as a digest and the triangulation has nothing
  left to run against — the pack would have pre-answered the question the step exists to ask.
- **A verifier's evidence.** `vc-test:strategy-verifier` re-derives the gate from the bundle and the strategy
  file *by definition*. Rule text may be packed; the drafter's floors output, script output or summary
  never is — that turns an independent check into a ratification of the drafter's own reading.
- **The observed-behaviour base.** Never packed as an answer — **the brief tells the agent to ask it
  itself**: `mcp__kb__kb_ask`, with the coordinate of *its own* surface in *its own* question
  ([`CLAUDE.md`](../../../CLAUDE.md) §Essential Rules → *Product context*). The recipient is the one who
  knows what it is about to assert, and a packed answer to a question the dispatcher guessed pre-answers
  the step exactly as a digested prior report does. It also carries a **trust count and a deployment** that
  only mean anything beside the agent's own observation — and the write side (`kb_confirm` on a match,
  `kb_dispute` on a contradiction, `kb_capture` on a miss) cannot be delegated to a dispatcher at all.
- **Anything whose FRESHNESS the recipient must judge.** If the agent's job includes deciding whether a
  snapshot is current, it needs the source and its date, not your cut of it.

## Two properties every pack must carry

1. **It declares its scope.** Both extractors emit a header saying *this is a SUBSET* and listing the
   ids included. Without it, an agent's *"no rule covers X"* is ambiguous between *none exists* and
   *it was filtered out* — and that ambiguity is exactly how a partial read becomes a false clean. The
   receiving contract is in [`../../knowledge/agents/qa/shared-instructions.md`](../../knowledge/agents/qa/shared-instructions.md)
   §Business Logic Reference: use what you were handed, and ask for another domain rather than
   concluding nothing applies.
2. **Time-sensitive fragments carry their rev.** A contract fragment cut from an unrefreshed snapshot
   distributes one stale contract to every lane at once, and the checks fail looking like product
   defects ([`contract-refresh.md`](contract-refresh.md) §4). Stamp the pack with the refresh date, or with
   `UNKNOWN` when the refresh recorded that — a brief that hides the doubt manufactures confidence.

## Where a pack applies

| Fan-out | Pack contents | Note |
|---|---|---|
| Stage 4 — the checklist runners (up to two lanes) | `BL-*` + `ECL-*` text, the checklist path + section letter, `@td()` tokens | [`execution.md`](execution.md) §Runner brief |
| Stage 4 — exploratory | `BL-*` text as the correctness oracle; the charter payload | the charter is derived, never packed from a guess ([`exploratory-lane.md`](exploratory-lane.md) §6) |
| Stage 4 — visual | the invariant text the lane checks against | [`visual-axis.md`](../../../plugins/vc-test/skills/qa-design/visual-axis.md) §2 |
| The strategy verifier | rule text only | Evidence is re-derived, never supplied |

## Cost, and when it is not worth it

Measured 2026-09-08 with `--stats`: a single-domain BL extract and a single-chapter ECL extract are each
a small single-digit-to-low-teens percentage of their oracle. Run `--stats` on the scope you are about
to brief rather than quoting a number from here — the oracles grow, and a transcribed ratio rots exactly
as `CLAUDE.md` §Where the rules live describes.

Below **two** recipients a pack is not worth cutting: one agent reading one file costs one read either
way, and the cut adds a step that can go stale between preparing it and dispatching. The saving is
linear in the number of recipients, which is why the fan-outs above are the whole list.
