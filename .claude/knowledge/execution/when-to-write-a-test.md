# When to write a unit test in THIS repo (and when not to)

Repo-wide. The test-data-specific half lives in
[`test-data-authoring.md`](test-data-authoring.md) §7a; the bug-fix half is
[`quality-gates.md`](quality-gates.md) **G2** and is unaffected by anything here. Measured rationale:
[`docs/decisions/unit-test-roi.md`](../../../docs/decisions/unit-test-roi.md).

---

## RULE 1 — NO CODE ⇒ NO TEST

**A change that ships no executable behaviour requires no unit test.** Not "a small test", not "a
smoke test" — none. Saying so explicitly is part of the change; a reviewer reading "no test" should
see the reason, not a gap.

This repo is mostly **not code**. The default answer is therefore *no test*, and that is a pass:

| You changed | Unit test? | What actually gates it |
|---|---|---|
| A prompt — `.claude/commands/*.md`, `.claude/agents/*.md`, `**/SKILL.md`, `.claude/rules/*.md`, `CLAUDE.md` | **No** | `npm run context:check` (budgets, dangling paths, `§` anchors), `qa-test:doclint`, `mirror:check` |
| Knowledge / oracles — `.claude/knowledge/**`, `business-logic.md`, `e-commerce-edge-cases-library.md` | **No** | `bl:lint`, `ecl:lint` (citation integrity), `domain:check` |
| A regression suite CSV, `config/test-suites.json`, a selection group | **No** | `suites:lint`, `suites:executability:check`, `scope:validate` |
| Declarative fixture data — a CSV row, a JSON fixture, literals in a `*-specs.mjs` | **No** | `td:validate` + `td:validate:<domain>` (the per-domain drift guard) |
| Docs — `docs/**`, `README.md`, `CHANGELOG.md`, a report under `reports/**` | **No** | nothing, correctly |
| A workflow `.yml`, `.mcp.json`, an `.env.*` layer, an npm script wiring | **No** | the pipeline itself, on its next run |
| **A function whose output is computed** — parser, planner, classifier, reducer, builder, token resolution, arithmetic, routing, redaction, teardown/search semantics | **YES** | nothing else. See RULE 2 |

A test for anything in the **No** rows is not caution — it is a second, weaker copy of a gate that
already runs, and it fails only when someone edits the data on purpose. See RULE 3.

## RULE 2 — test the DERIVATION, never the DECLARATION

Where there *is* code, a unit test earns its place only when **the expected value is derived
independently of the thing asserted**. Restating a literal that lives one file away, in the same
commit, by the same author, is a transcribed constant with a test runner attached — the GOLDEN RULE
(`.claude/rules/test-data.md`) pointed at our own test code.

The test to apply, per assertion: **could this fail for a reason nobody intended?** If the only way to
turn it red is to deliberately change the value it mirrors, the answer is no.

Measured 2026-09-15 across 20 domains / 169 mutations (`npm run td:mutation-check`):

- **Data-literal mutations: 52 caught by BOTH** the unit test and the drift guard — the test added
  nothing.
- **Logic mutations: caught ONLY by the unit test.** `windowDates` offset sign flip, open-ended
  `null → date`, `buildGoalNode` leaking a raw currency intent into the API body — `td:validate:missions`
  missed all three.
- **42 mutations caught by NOTHING** — the gap that actually costs something (backlog B-47).

## RULE 3 — a guard that already runs owns that ground

Before adding a test, name the gate that would catch the same defect. If one exists — `context:check`,
`suites:lint`, `td:validate:<domain>`, `bl:lint`, `tsc`, a CI job — the test is duplication, and the
stronger artifact is almost always the guard: it sees committed **and** seeded state, checks the alias
registry, GUID leaks and URL shapes, and runs on every PR.

**Missing coverage belongs in the guard, not in a new unit test.** The guard is where a second reader
will look, and it is the artifact a client deployment actually runs.

**The ground a guard owns is DATA, not the functions beside it.** A `*-specs.mjs` module routinely
exports both, and the guard validates the declared values without ever calling the builders — so a
test covering a DERIVATION is not duplication no matter which module it imports from (the
test-the-derivation-never-the-declaration rule: [`.claude/rules/test-data.md`](../../rules/test-data.md)
§FOURTH RULE). `test:roi-check` enforces exactly that boundary: it fires only on a new test whose repo
imports are guarded spec modules AND which pulls no function binding out of them. When the gate and
this rule seem to disagree about a real file, `td:test-attribution` below is the arbiter, not either
one of them.

## RULE 4 — G2 bug reproductions are exempt

None of the above touches `/qa-fix`. A confirmed bug still gets a **new failing test that reproduces
it** before any fix, per `quality-gates.md` G2 — including the MEDIUM RULE about *where* the red is
observed. That test is derived from the ticket's Actual result, not from the code, so it satisfies
RULE 2 by construction. It is the one place where "write a test" is unconditional.

## How to settle an argument

```
npm run td:mutation-check    -- <domain> --max 30   # does this DOMAIN have duplication?
npm run td:test-attribution  -- <domain> --max 24   # which INDIVIDUAL tests are redundant?
```

`td:test-attribution` perturbs the spec and attributes each mutation to the test that caught it:

- **KEEP** — caught something the guard missed. Irreplaceable.
- **DELETE** — caught things, all of which the guard also caught. Duplication.
- **UNPROVEN** — the mutation set never reached it. **Never auto-cut**: absence of evidence is not
  evidence of absence, and the operators are a sample, not a proof. A human decides.

The asymmetry is deliberate: a wrong KEEP costs bytes, a wrong DELETE removes the only detector of a
silent seeding bug.

### Two safeguards before you act on a DELETE — both changed the answer on the 2026-09-15 cut

1. **KEEP wins across domains.** One test file is often attributed under several domains whose guards
   differ (`loyalty-missions-specs.test.mjs` runs under both `missions` and `org-loyalty`). *"MSN_EXPIRED
   is the ONLY fixture outside its window"* came back **DELETE under `missions`, KEEP under
   `org-loyalty`**. One domain where a test is the only detector is enough to keep it. **Spared 33.**
2. **Never cut a test that feeds a validator SYNTHETIC input.** A drift guard only ever calls a
   validator with committed *good* data, so a test that passes a deliberately *bad* one —
   `validateSeoShape({ ...SEO_PRODUCT, pageTitle: same, metaDescription: same })` — exercises rejection
   logic the guard cannot reach. A DELETE there is an artefact of which lines the sample mutated, not
   evidence. **Spared a further 33**, including a named regression pin. This one was caught by reading
   the diff, not by any tool — **read the diff.**

### Prove the cut lost nothing

Re-run `td:mutation-check -- --all` with the **same `--max`** before and after. Deleting a redundant
test moves its mutations from `both` to `guard-only`; it must not change `unit-only`:

| | before | after |
|---|---|---|
| both | 52 | 31 (−21) |
| **unit-only** | **56** | **56 — unchanged** |
| guard-only | 19 | 40 (+21) |
| neither | 42 | 42 |

**A drop in `unit-only` means you deleted a detector. Restore and re-check.**
