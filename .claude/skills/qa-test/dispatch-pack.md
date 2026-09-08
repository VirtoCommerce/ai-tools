# The dispatch pack — supply the text, not the path

Every fan-out in this pipeline hands N agents the same oracles. When the brief carries a *path*, each
agent opens it and pays for the whole file in its own context — N times, for the same bytes, to use the
same three or four rules. The 2026-09-07 audit measured this as the largest remaining runtime cost once
the always-loaded tier was re-tiered (`docs/agentic-system-audit-2026-09-07.md` §6 items 7–8).

[`authoring.md`](authoring.md) §3b already applies the fix at one fan-out and states the reason. This
file is that reason generalised, so the other fan-outs stop re-deriving it — and, more importantly, so
the **limit** on it is written down once, because the pattern is easy to over-apply into something
worse than the cost it removes.

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
| The batch's rows of the `1e` variants × links matrix | from the Test Model, already in working context |
| The `[JOURNEY]` / `Technique:FLOW` case | authored before fan-out ([`authoring.md`](authoring.md) §3b, item 2) |
| Selector and GraphQL-schema fragments | cut from the snapshot `1b` item 2d refreshed, **stamped with its rev** |
| Test data as `@td()` / `{{VAR}}` tokens, confirmed seeded | resolved at runtime by the agent, never as literals (`.claude/rules/test-data.md`) |

Both extractors emit the oracle's own markdown verbatim, so a pack is the same authority character for
character and `BL-*` / `ECL-N.M` ids keep their citation contract with the suites. Nothing in a pack is
ever a paraphrase: a summarised invariant is a second, drifting copy of a single source of truth.

### Stays a path — or stays out

- **`1c`'s prior art.** The brief passes `reports/ba/**` and `knowledge/domain/*` **as paths to READ**,
  deliberately ([`../../commands/qa-test.md`](../../commands/qa-test.md) §1c). A prior report is a
  *hypothesis* the agent must triangulate against the release ledger and a live check before it can
  carry `CONFIRMED` / `DRIFT` / `MISSING`. Hand it over as a digest and the triangulation has nothing
  left to run against — the pack would have pre-answered the question the step exists to ask.
- **The verifier's evidence.** §Verifier Mode re-derives from source *by definition*
  ([`SKILL.md`](SKILL.md) §The verifier, in one place). Packing the doer's artifacts, script output or
  live observations into its brief turns an independent check into a ratification of the doer's own
  reading. Rule text is not evidence and may be packed; **the evidence never is.**
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
   distributes one stale contract to every batch at once, and the cases fail at Step 4 looking like
   product defects ([`contract-refresh.md`](contract-refresh.md) §4). Stamp the pack with the 2d refresh
   date, or with `UNKNOWN` when 2d recorded that — a brief that hides the doubt manufactures confidence.

## Where a pack applies

| Fan-out | Pack contents | Note |
|---|---|---|
| Step 3b — one batch per execution surface | the full table above, per layer | The worked case; [`authoring.md`](authoring.md) §3b item 4 |
| Step 4 — execution agents (up to 3 lanes) | `BL-*` + `ECL-*` text, Artifact A rows, Artifact B, `@td()` tokens | The prompt template already asks for the rule *text* ([`SKILL.md`](SKILL.md) §Agent dispatch); extract it rather than hand-cutting |
| `1c ‖ 1d` | scope's `BL-*` / `ECL-*` text + the contract rev | Prior art stays paths — see above |
| C1 / C2 regression runners | selection + `BL-*` text for the triage vocabulary | Artifact C is not an agent prompt ([`authoring.md`](authoring.md) §Artifact C) |
| The verifier (Step 3, 5b, 5e, 5g) | rule text only | Evidence is re-derived, never supplied |

## Cost, and when it is not worth it

Measured 2026-09-08 with `--stats`: a single-domain BL extract and a single-chapter ECL extract are each
a small single-digit-to-low-teens percentage of their oracle. Run `--stats` on the scope you are about
to brief rather than quoting a number from here — the oracles grow, and a transcribed ratio rots exactly
as `CLAUDE.md` §Where the rules live describes.

Below **two** recipients a pack is not worth cutting: one agent reading one file costs one read either
way, and the cut adds a step that can go stale between preparing it and dispatching. The saving is
linear in the number of recipients, which is why the fan-outs above are the whole list.
