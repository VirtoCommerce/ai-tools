# Unit-test ROI — why the corpus grew, what was measured, and what to cut

**Date:** 2026-09-15 · **Status:** policy changed; 95 redundant tests deleted on mutation evidence

Never loaded by an agent. This is the measured rationale behind the FOURTH RULE in
`.claude/rules/test-data.md` and §7a in `knowledge/execution/test-data-authoring.md`.

---

## The question

`scripts/unit/` holds 142 files, 37,374 lines, 2,986 tests — against 78,653 lines of non-test script,
in a repo whose product is prompts and CSVs. The complaint that prompted this: *"why do we write so
many useless unit tests?"* The premise deserved measuring rather than agreeing with.

## Why the volume exists — three mandates, one of them earned

| Source | What it said | Verdict |
|---|---|---|
| `.claude/agents/test-data-engineer.md` §Step 3 + Judge checklist | *"Write unit tests… no shortcuts"* + a binary box *"Ships unit tests in `scripts/unit/`; `npm test` green"*, closing with *"Any unchecked box → revise, don't ship."* | **The volume driver.** Unconditional: no risk, size or ROI gate, applied to spec modules that are largely declarative fixture data. A binary box is satisfied by volume |
| `.claude/knowledge/execution/quality-gates.md` G2 | reproduce-as-red-test per bug fix (`/dotnet-unit-test`, `/vue-unit-test`) | **Earned.** It has a trivial-skip hatch and its own hard-won rule that a green test of the wrong property is worse than no test (`docs/decisions/autofix-proof-medium.md`) |
| `.claude/agents/ba-story-writer.md` DoD template | *"Unit tests written and passing (≥ 80% coverage for new code)"* | **Cargo cult.** A ratio with no source, in a repo that measures coverage nowhere |

The counterweight existed and was opt-in: `.claude/commands/code-review-full.md` Agent 6 already asks
*"is the coverage proportionate to the risk?"* and flags *"coverage for coverage's sake on low-risk
code"* — but it is a slash command someone must invoke, while the mandate sits in an agent definition
re-paid on every dispatch. And nothing ran the suite in CI until `unit-tests.yml` (VCST-5774), so a
useless test cost nothing to keep and nothing to notice.

## What was measured

`npm run td:mutation-check` (new, `scripts/maintenance/td-mutation-check.mjs`) perturbs a spec module
one edit at a time and runs both that domain's unit tests and its `td:validate:<domain>` guard against
each mutation. 20 domains, 169 mutations, all specs restored byte-identical:

```
both (unit test duplicates the guard): 52
unit-only (the only line of defence):  56
guard-only (guard owns it):            19
NEITHER (nothing catches it):          42
```

**The split is real and it is not where the volume assumed it was.**

- **Data literals → duplication.** Flipping declared fixture values (`catalog-edge`
  `linkedIntoStoreCatalog`, `keepEmpty`; `variation-stock` quantity; `orders` seed-prefix; `rbac`
  `isAdministrator`) was caught by **both** artifacts. The unit test added nothing: the drift guard
  calls the same `validateFixtureShape()` and adds alias-registry, GUID-leak and URL-shape checks on
  top.
- **Derivation logic → irreplaceable.** Semantic mutations of `missions-specs.mjs` builders
  (`windowDates` offset sign flip, open-ended `null → date`, `buildGoalNode` leaking a raw currency
  intent into the body) were caught **only** by the unit test; `td:validate:missions` missed all three.
- **42 mutations were caught by nothing at all** — a larger finding than the duplication, and the one
  worth acting on first. Recorded as B-47.

## The cut: 95 tests deleted, on evidence, with two safeguards

The obvious move — delete the spec unit tests, keep the guards — is right in outline and dangerous in
detail. Two static classifiers were written to separate the categories mechanically and **both were
wrong in both directions**: one flagged `teardown-membership-status.test.mjs` as worthless when it
guards a real silent-leak regression in `deleteUserByEmail`; the other scored `ui-step-parser.test.ts`
at 99% mirror when it is a genuine parser suite. Neither drove the cut.

What drove it is `npm run td:test-attribution` (`scripts/maintenance/td-test-attribution.mjs`), which
attributes every mutation to the individual test(s) that caught it and grades each test:

- **KEEP** — caught something the guard missed. Irreplaceable.
- **DELETE** — caught things, all of which the guard also caught. Duplication.
- **UNPROVEN** — the mutation set never reached it. **Never cut.** Absence of evidence is not evidence
  of absence; the operators are a sample, not a proof.

The asymmetry is deliberate: a wrong KEEP costs bytes, a wrong DELETE removes the only detector of a
silent seeding bug.

**Two safeguards, both of which changed the answer — each caught a real over-deletion:**

1. **KEEP is dominant across domains.** Test files are shared between domains whose guards differ —
   `loyalty-missions-specs.test.mjs` is attributed under both `missions` and `org-loyalty`. The test
   *"MSN_EXPIRED is the ONLY fixture outside its window"* came back **DELETE under `missions` and KEEP
   under `org-loyalty`**. A single domain in which a test is the only detector is enough to keep it.
   **Spared 33 tests.**
2. **The synthetic-input blind spot.** A drift guard only ever calls a validator with committed *good*
   data. A test that feeds it a **deliberately bad** input — `validateSeoShape({...SEO_PRODUCT,
   pageTitle: same, metaDescription: same})` — exercises rejection logic the guard never reaches, so a
   DELETE verdict for it is an artefact of which lines the sample happened to mutate. Found by reading
   the diff, not by any tool. **Spared a further 33 tests**, among them
   *"THE ORIGINAL DEFECT: prose promises global recency but no column enforces it"* — a named
   regression pin that the first pass would have removed.

128 candidates → **95 deleted**, 875 lines, across 18 files.

## Proof that nothing was lost

The same sweep, same sampling, before and after. Deleting a redundant test must move its mutations
from `both` to `guard-only` and leave `unit-only` untouched:

| | before | after | |
|---|---|---|---|
| both (unit test duplicates the guard) | 52 | **31** | −21 |
| **unit-only (the only detector)** | **56** | **56** | **unchanged** |
| guard-only | 19 | **40** | +21 |
| neither (nothing catches it) | 42 | 42 | unchanged |

`both` fell by exactly what `guard-only` gained, and **`unit-only` did not move**: no unique detection
capability was removed. `npm test` 2,986 → 2,891, all green.

## Quality, measured separately (2026-09-15)

Redundancy and quality are different questions. The cut above removed tests that *duplicated a guard*;
it said nothing about whether the survivors are any good. Measured after the cut:

**Static smells are absent.** Across 2,737 test blocks: 10 with no assertion, 4 with only trivial
assertions, 33 never touching an imported repo symbol. Spot-checking those found them to be **false
positives** — `lint-unscoreable-assertions.test.ts` asserts through a local `notScoreable()` helper, and
`gen-mcp-evidence.test.mjs` uses an `execFileSync` whose *throw* is the assertion. Static shape is a
poor proxy for whether a test can fail when it should.

**Test-to-test duplication is negligible.** 3 identical-body clusters, all legitimate: two twin
extractor suites over *different* modules (`extract-bl` / `extract-ecl`), and section-local clean
baselines for files whose other tests perturb that baseline.

**The behavioural measure: IFDR 99%.** `npm run test:quality` gives every function a test file imports
a `return undefined;` body, one at a time, and re-runs that file. Detection rate = detected / gutted.
**117 files scored, mean 99%, 110 at 100%, none at 0%.** The six below 100% are almost entirely
`setFlags` — a harness flag-setter imported for setup, not a subject under test. Only two are
substantive (`assertContractCoherent` in `b2b-addresses-specs`, `classifyLane` in
`suite-split-integrity`), and both are single functions inside otherwise-complete files.

**Conclusion: this corpus never had a quality problem. It had a volume problem**, and the volume came
from redundancy against guards that were not running — which is what the rest of this document fixes.

### The metric took three attempts, and the first two lied

Recorded because the failures are more instructive than the number:

1. **Operator mutation, budget split across every import.** `ui-step-parser.test.ts` scored **13%** —
   half its mutants landed in a 688-line module it imports for one helper. Aiming the budget at its
   real subject moved it to 50%. *The metric was measuring the sampler.*
2. **Operator mutation, aimed.** `hooks/redact.mjs` is almost entirely regex literals, so the sampler
   produced **one** mutant and scored a security-critical test **0%**. Hand-written semantic mutations
   of the same rules — neutering `redact()`, passthrough on the AWS-key replacement — were both
   **caught**. *The metric was measuring the operator set.*
3. **Gut-the-imported-function.** Semantic by construction; no regex blind spot; scoped to what a test
   actually took a dependency on. Scoping to a module's *exported* surface instead reproduced the
   artefact one level up (`pick-baseline-tag.test.mjs` owns one function of a twelve-function module
   and scored 2/12).

Every intermediate number would have supported a confident, wrong story about test quality. The
general lesson matches the one in the cut above: **a detector that has not been checked against a case
whose answer you already know is not evidence.**

## The one low-quality test the evidence actually found

A hunt for suspicious tests needs a signal sharp enough to survive checking. Two were combined:

- **IFDR-undetected** — the test imports a function whose gutting it does not notice.
- **Named-but-never-called** — the test's *name* cites an imported symbol its body never calls.

Each alone is noisy. `setFlags`, `classifyLane` and `isHtmlByContract` are IFDR-undetected but are
legitimate setup wiring; 55 tests are "named but never called" and nearly all name a *constant*
(`SCHEMA_VERSION`, `GUID_RE`, `CSV_SOURCE`), which cannot be called. **Their intersection is exactly
one test**, and it was a real defect:

`b2b-addresses-specs.test.mjs` had `test('assertContractCoherent would REJECT a total that yields too
few pages')` which **never called `assertContractCoherent`**. It re-derived the predicate inline and
asserted `ADDRESSES_PER_PAGE * (MIN_PAGES - 1)` yields fewer than `MIN_PAGES` pages — arithmetic that is
true by construction. Its own comment admits the workaround: *"TARGET_TOTAL itself is a const, so
exercise the rule rather than mutating the module."* The GOLDEN RULE failure applied to a test: it
transcribed the rule instead of exercising it.

**The worse half, found only by checking the assumed fallback.** The first instinct was "delete it, the
drift guard calls the function anyway" — `validate-b2b-data.mjs:228` does. But replacing the function's
body with `return []` left **`td:validate:b2b` green too**: on the coherent committed total the real
function also returns `[]`, so the guard can never distinguish them. **Nothing in the repo could detect
that guard function breaking** — the `NEITHER` class, in the one place least expected.

Fixed rather than merely deleted: `assertContractCoherent(total = TARGET_TOTAL)` takes the total as a
defaulted parameter, so the rejection path is reachable at all — callers are unchanged — and the
replacement test calls it with a one-page-short total and an exact-multiple total. Verified: gutting the
body to `return []`, disabling the min-pages check, and disabling the partial-page check are now **all
three caught**, where before **none** were.

**That is the whole yield of the quality hunt: one test, replaced rather than removed.** The honest
summary of all three sweeps is that this corpus's problem was volume, never quality.

## What changed

1. **`test-data-engineer.md` §Step 3** — *"Write unit tests"* → *"Unit-test the DERIVATION, never the
   DECLARATION"*, with the two categories named and the measurement cited. A pure-declaration spec
   module now gets **no test file**, and that is a pass rather than a gap.
2. **Its Judge checklist box** — the binary *"ships unit tests"* is replaced by *"every unit test
   shipped would fail for a reason nobody intended"*, proven with `td:mutation-check`, not asserted.
3. **`ba-story-writer.md`** — the ≥80% coverage DoD line is gone.
4. **`.claude/rules/test-data.md`** — FOURTH RULE, citing §7a rather than restating it.
5. **`gates.yml` runs `td:validate:all`** — the 22 per-domain drift guards ran in **no workflow**
   before this. That is what makes rule 1 safe: once authors stop unit-testing declared data, the
   guard is the only thing covering it, so it has to run. It also surfaced B-46 immediately — a guard
   red on a clean checkout from tracked state, unheard because nothing ran it.

## How to do the cut, per domain

```
npm run td:mutation-check -- <domain> --max 30
```

- `BOTH` → that coverage is duplicated; the corresponding assertions in the unit test can go.
- `UNIT ONLY` → keep, it is the only defence.
- `NEITHER` → **the real finding.** Add the check to `validate-<domain>-data.mjs`, not to the unit test.

Run it before and after: the `UNIT ONLY` count must not fall, and the `NEITHER` count should.
